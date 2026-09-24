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

/**
 * How to answer a price the customer asks for. Within the agent's margin the
 * ask is simply accepted: it is already a good price, so there is no reason
 * to counter or to give more. Below the margin the answer is the agent's
 * best price (the floor), never the ask at once; only if the customer
 * insists does the owner decide on the exact ask.
 */
export function recommendedResponseUnitPrice(ask: number, floor: number): { withinAutonomy: boolean; unitPrice: number } {
  const askCents = Math.round(ask * 100);
  const floorCents = Math.round(floor * 100);
  return askCents >= floorCents
    ? { withinAutonomy: true, unitPrice: askCents / 100 }
    : { withinAutonomy: false, unitPrice: floorCents / 100 };
}
