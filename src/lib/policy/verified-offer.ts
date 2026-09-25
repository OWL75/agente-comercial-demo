export type MoneyBreakdown = {
  listUnitPrice: number;
  netUnitPrice: number;
  subtotal: number;
  total: number;
};

function unitCents(unitPrice: number): number {
  const cents = Math.round(unitPrice * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || Math.abs(unitPrice * 100 - cents) > 1e-6) {
    throw new Error("Precio inválido; se requieren importes con máximo dos decimales.");
  }
  return cents;
}

export function quoteMoney(unitPrice: number, quantity: number, discountPct: number): MoneyBreakdown {
  const listCents = unitCents(unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Cantidad inválida.");
  if (!Number.isInteger(discountPct) || discountPct < 0 || discountPct > 100) {
    throw new Error("El descuento debe ser un porcentaje entero entre 0 y 100.");
  }

  // Regla única de la demo: redondear primero el precio unitario neto al
  // centavo y multiplicar ese importe visible por la cantidad.
  const netUnitCents = Math.round((listCents * (100 - discountPct)) / 100);
  const subtotalCents = listCents * quantity;
  const totalCents = netUnitCents * quantity;
  if (!Number.isSafeInteger(subtotalCents) || !Number.isSafeInteger(totalCents)) {
    throw new Error("Importe demasiado grande.");
  }
  return {
    listUnitPrice: listCents / 100,
    netUnitPrice: netUnitCents / 100,
    subtotal: subtotalCents / 100,
    total: totalCents / 100,
  };
}

/**
 * Returns the smallest natural (whole-number) discount that lands no more
 * than one cent above the customer's reference without undercutting it.
 */
export function smallestNaturalDiscount(
  unitPrice: number,
  targetUnitPrice: number,
  autoMaxPct: number,
): number | null {
  if (!Number.isFinite(targetUnitPrice) || targetUnitPrice < 0) return null;
  const max = Math.max(0, Math.floor(autoMaxPct));
  for (let pct = 0; pct <= max; pct++) {
    const net = quoteMoney(unitPrice, 1, pct).netUnitPrice;
    if (net >= targetUnitPrice - 0.01 && net <= targetUnitPrice + 0.01) return pct;
  }
  return null;
}


/**
 * Negotiation by price instead of by whole percentage: a customer who asks
 * for $17.70 gets $17.70 (or a counter above it), not the $17.58 that the next
 * whole percent happens to land on. The discount is derived from the net
 * price and kept with 4 decimals; the total is net unit × quantity, the same
 * rounding rule as quoteMoney.
 */
export function quoteByNetPrice(unitPrice: number, quantity: number, netUnitPrice: number): MoneyBreakdown & { discountPct: number } {
  const listCents = unitCents(unitPrice);
  const netCents = unitCents(netUnitPrice);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Cantidad inválida.");
  if (netCents <= 0 || netCents > listCents) throw new Error("El precio neto debe ser positivo y no mayor al precio de lista.");
  const totalCents = netCents * quantity;
  const subtotalCents = listCents * quantity;
  if (!Number.isSafeInteger(subtotalCents) || !Number.isSafeInteger(totalCents)) throw new Error("Importe demasiado grande.");
  return {
    listUnitPrice: listCents / 100,
    netUnitPrice: netCents / 100,
    subtotal: subtotalCents / 100,
    total: totalCents / 100,
    discountPct: Math.round(((listCents - netCents) / listCents) * 1_000_000) / 10_000,
  };
}

/** Lowest unit price the agent may offer on its own. */
export function autonomyFloorUnitPrice(unitPrice: number, autoMaxPct: number): number {
  return Math.ceil((unitCents(unitPrice) * (100 - autoMaxPct)) / 100) / 100;
}

export type Concession = {
  unitPrice: number;
  /** ask: accept the customer's price · beat_reference: first offer, a little under the competitor · step: a small improvement · floor: the agent's best price · at_floor: only the owner can go lower. */
  basis: "ask" | "beat_reference" | "step" | "floor" | "at_floor";
  withinAutonomy: boolean;
};

/**
 * The next price to offer, as in a real negotiation.
 * - The customer named a price: within the margin it is simply accepted (it
 *   is already a good price); below the margin the answer is the agent's best
 *   price, and only if the customer insists does the owner decide.
 * - The customer just asks for a better price: improve the last offer by
 *   half the room left, rounded down to 5 cents ($17.75 → $17.65); when
 *   little room is left, go to the floor ($17.58); at the floor, only the
 *   owner can go lower. A competitor's price is a reference, never a floor.
 */
export function nextConcession(args: { listUnitPrice: number; lastOffered: number | null; ask: number | null; floor: number; reference?: number | null }): Concession {
  const floorCents = Math.round(args.floor * 100);
  // First offer once the competitor's price is known: beat it a little (10
  // cents, rounded down to 5) within the margin. Only matching it gives the
  // customer no reason to switch ("me estás ofreciendo lo mismo").
  if (args.ask == null && args.lastOffered == null && args.reference != null) {
    const referenceCents = Math.round(args.reference * 100);
    const listCents = Math.round(args.listUnitPrice * 100);
    if (referenceCents < listCents) {
      const beat = Math.floor((referenceCents - 10) / 5) * 5;
      return beat > floorCents
        ? { unitPrice: beat / 100, basis: "beat_reference", withinAutonomy: true }
        : { unitPrice: floorCents / 100, basis: "floor", withinAutonomy: true };
    }
  }
  if (args.ask != null) {
    const askCents = Math.round(args.ask * 100);
    return askCents >= floorCents
      ? { unitPrice: askCents / 100, basis: "ask", withinAutonomy: true }
      : { unitPrice: floorCents / 100, basis: "floor", withinAutonomy: false };
  }
  const fromCents = Math.round((args.lastOffered ?? args.listUnitPrice) * 100);
  if (fromCents <= floorCents) return { unitPrice: floorCents / 100, basis: "at_floor", withinAutonomy: false };
  if (fromCents - floorCents <= 10) return { unitPrice: floorCents / 100, basis: "floor", withinAutonomy: true };
  const halfway = Math.floor((floorCents + (fromCents - floorCents) / 2) / 5) * 5;
  const step = Math.min(fromCents - 1, Math.max(floorCents, halfway));
  return { unitPrice: step / 100, basis: step === floorCents ? "floor" : "step", withinAutonomy: true };
}
