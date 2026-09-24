import type { VerifiedOfferResult } from "@/lib/tools/offers";

const MONEY = /\$\s*(\d+(?:[.,]\d{1,2})?)/g;
const PERCENT = /(\d+(?:[.,]\d+)?)\s*%/g;
const COMPETITOR_REFERENCE = /\b(proveedor|competidor|referencia|pagas|pagan|te\s+(?:lo\s+)?deja|mencionaste|compartiste|actualmente)\b/i;
const PENDING_LANGUAGE = /\b(pendiente|por confirmar|por validar|requiere (?:una )?aprobaci[oó]n|sujeto a aprobaci[oó]n|solicit[eé] (?:la )?aprobaci[oó]n)\b/i;
// Both "tú" and "usted" forms: the agent writes in "usted" ("¿Confirma el pedido?").
const CONFIRMATION_ASK = /\b(confirmas?|me\s+confirmas?|procedemos|procedo|cerramos|hago\s+el\s+pedido|registro\s+el\s+pedido|ingreso\s+el\s+pedido|lo\s+ingreso)\b/i;

/** The agent's message asks the customer to confirm the offer it presents. */
export function asksForConfirmation(text: string): boolean {
  return CONFIRMATION_ASK.test(text);
}
const FIRM_OFFER = /\b(puedo ofrecer(?:le)?|(?:te|le) ofrezco|(?:te|le) propongo|nuestra oferta|la oferta|queda en|(?:te|le) queda en|precio final|total(?: es|:)|podemos entregar)\b/i;
const DELIVERY_PROMISE = /\b(entrega(?:mos)?|express|recib(?:es|en)|llega(?:rá)?)\b[^.!?\n]{0,55}\b(24\s*horas|al d[ií]a siguiente)\b|\b(24\s*horas|al d[ií]a siguiente)\b[^.!?\n]{0,55}\b(confirmad[ao]|validad[ao]|disponible|entrega)/i;
// A delivery phrase is our promise only when we commit to it ("podemos
// entregarle…", "le llega…") or it is a line of the offer ("Entrega: 24 horas").
// Echoing the customer ("…y entrega al día siguiente pesan mucho") is not.
const DELIVERY_COMMITMENT = /\b(podemos|puedo|entregamos|entregarle|enviamos|despachamos|le\s+llega|lo\s+recibe|recibir[aá]|confirm(?:é|e|o|amos|ad[ao])|validad[ao]|disponible)(?![a-zñáéíóú])/i;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export function promisesDelivery(text: string): boolean {
  return sentencesOf(text).some((sentence) =>
    DELIVERY_PROMISE.test(sentence) &&
    (DELIVERY_COMMITMENT.test(sentence) || FIRM_OFFER.test(sentence) || /^[-*•]/.test(sentence) || /^\*?entrega\*?\s*:/i.test(sentence)));
}

/**
 * "Descuento: 0%" is not something a salesperson writes: without a discount
 * there is just the price. Offer lines stating a zero discount are removed.
 */
export function stripZeroDiscount(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*[-*•]?\s*\*?descuento\*?\s*:?\s*\*?0\s*%\*?\s*\.?\s*$/i.test(line))
    .join("\n")
    .replace(/\s*[,(]?\s*(con|y)?\s*(un\s+)?0\s*%\s*de\s*descuento\s*\)?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ZERO_DISCOUNT = /(^|[^\d.,])0\s*%/;

const INVENTED_GUARANTEE = /\b(nunca volver[aá] a ocurrir|no volver[aá] a pasar|garantizo|garantizamos|sin (?:ningún )?retraso|cero retrasos)\b/i;

function moneyValues(text: string): number[] {
  return [...text.matchAll(MONEY)].map((match) => Number(match[1].replace(",", ".")));
}

function percentValues(text: string): number[] {
  return [...text.matchAll(PERCENT)].map((match) => Number(match[1].replace(",", ".")));
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function capturedMoney(reply: string, pattern: RegExp): number[] {
  return [...reply.matchAll(pattern)].map((match) => Number(match[1].replace(",", ".")));
}

export function commercialReplyViolations(args: {
  reply: string;
  verifiedOffer: VerifiedOfferResult | null;
  hasPendingApproval: boolean;
  orderCreated: boolean;
}): string[] {
  const { reply, verifiedOffer, hasPendingApproval, orderCreated } = args;
  const violations: string[] = [];
  if (INVENTED_GUARANTEE.test(reply)) violations.push("invented_delivery_guarantee");

  if (hasPendingApproval && CONFIRMATION_ASK.test(reply)) {
    violations.push("confirmation_requested_with_pending_approval");
  }
  if (ZERO_DISCOUNT.test(reply)) violations.push("zero_discount_mentioned");
  if (hasPendingApproval && promisesDelivery(reply) && !PENDING_LANGUAGE.test(reply)) {
    violations.push("delivery_promised_with_pending_approval");
  }

  const commercialSentences = reply
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !(COMPETITOR_REFERENCE.test(sentence) && !FIRM_OFFER.test(sentence)));
  const ownMoney = commercialSentences.flatMap(moneyValues);
  const ownPct = commercialSentences.flatMap(percentValues);
  const makesOffer = FIRM_OFFER.test(reply) || promisesDelivery(reply) || ownMoney.length > 0 || ownPct.length > 0;

  if (makesOffer && !orderCreated && !verifiedOffer) {
    violations.push("commercial_terms_without_verified_offer");
    return [...new Set(violations)];
  }
  if (!verifiedOffer || orderCreated) return [...new Set(violations)];

  if (verifiedOffer.status !== "ready" && (FIRM_OFFER.test(reply) || CONFIRMATION_ASK.test(reply))) {
    violations.push("firm_offer_not_ready");
  }
  const allowedMoney = [
    verifiedOffer.listUnitPrice,
    verifiedOffer.netUnitPrice,
    verifiedOffer.subtotal,
    verifiedOffer.total,
  ];
  if (ownMoney.some((value) => !allowedMoney.some((allowed) => sameMoney(value, allowed)))) {
    violations.push("offer_money_mismatch");
  }
  if (ownPct.some((value) => Math.abs(value - verifiedOffer.discountPct) > 1e-6)) {
    violations.push("offer_discount_mismatch");
  }
  const unitAmounts = [
    ...capturedMoney(reply, /\$\s*(\d+(?:[.,]\d{1,2})?)\s*(?:por\s+unidad|c\/u)/gi),
    ...capturedMoney(reply, /(?:precio\s+unitario|por\s+unidad)\s*[:=-]?\s*\$\s*(\d+(?:[.,]\d{1,2})?)/gi),
  ];
  if (unitAmounts.some((value) => !sameMoney(value, verifiedOffer.netUnitPrice))) {
    violations.push("offer_unit_price_mismatch");
  }
  const totals = capturedMoney(reply, /\btotal(?:\s+es|\s*:)?[^$\n]{0,20}\$\s*(\d+(?:[.,]\d{1,2})?)/gi);
  if (totals.some((value) => !sameMoney(value, verifiedOffer.total))) {
    violations.push("offer_total_mismatch");
  }
  const inventory = [...reply.matchAll(/\b(\d+)\s+unidades\s+disponibles\b/gi)].map((match) => Number(match[1]));
  if (inventory.some((value) => value !== verifiedOffer.stockAvailable)) {
    violations.push("offer_inventory_mismatch");
  }
  const deliveryHours = [...reply.matchAll(/\b(\d+)\s*horas\b/gi)].map((match) => Number(match[1]));
  if (deliveryHours.some((value) => value !== verifiedOffer.deliveryHours)) {
    violations.push("offer_delivery_mismatch");
  }
  return [...new Set(violations)];
}

export function presentsFinalVerifiedOffer(reply: string, offer: VerifiedOfferResult | null): boolean {
  if (!offer || offer.status !== "ready") return false;
  return CONFIRMATION_ASK.test(reply) &&
    (FIRM_OFFER.test(reply) || moneyValues(reply).some((value) => sameMoney(value, offer.total)));
}

/** Only sent when a promise to come back is real: an approval or an owner question is open. */
export function guardedFallback(hasPendingApproval: boolean, ownerConsulted = false): string {
  if (hasPendingApproval) {
    return "La condición solicitada todavía requiere aprobación. Ya está en revisión y te confirmo apenas tenga respuesta.";
  }
  if (ownerConsulted) {
    return "Déjame confirmarlo con mi gerente y te escribo en unos minutos con la propuesta.";
  }
  return "Déjame validar precio, descuento, disponibilidad y entrega antes de darte una oferta firme.";
}
