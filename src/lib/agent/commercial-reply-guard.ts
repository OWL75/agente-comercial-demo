import type { VerifiedOfferResult } from "@/lib/tools/offers";
import { OWNER_NAME } from "@/lib/channel/whatsapp-templates";

const MONEY = /\$\s*(\d+(?:[.,]\d{1,2})?)/g;
const PERCENT = /(\d+(?:[.,]\d+)?)\s*%/g;
const COMPETITOR_REFERENCE = /\b(proveedor|competidor|referencia|pagas|pagan|te\s+(?:lo\s+)?deja|mencionaste|compartiste|actualmente)\b/i;
const PENDING_LANGUAGE = /\b(pendiente|lo\s+reviso|lo\s+estoy\s+revisando|revisarlo\s+con|por confirmar|por validar|requiere (?:una )?aprobaci[oó]n|sujeto a aprobaci[oó]n|solicit[eé] (?:la )?aprobaci[oó]n)\b/i;
// Both "tú" and "usted" forms: the agent writes in "usted" ("¿Confirma el pedido?").
// Soft closes ("¿Le sirve así?", "¿Se lo dejo listo?") ask the same thing
// without pressure, so a plain "sí" to them confirms the offer too.
const CONFIRMATION_ASK = /\b(confirmas?|me\s+confirmas?|procedemos|procedo|cerramos|hago\s+el\s+pedido|registro\s+el\s+pedido|ingreso\s+el\s+pedido|lo\s+ingreso|(?:le|te)\s+(?:sirve|serviría|serviria|funciona|funcionaría|funcionaria)|se\s+lo\s+(?:dejo|preparo|aparto)|lo\s+dejo\s+listo)\b/i;

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

function savingsOf(offer: VerifiedOfferResult): number[] {
  const reference = offer.negotiation?.referenceUnitPrice;
  if (reference == null || offer.netUnitPrice >= reference) return [];
  const perUnitCents = Math.round((reference - offer.netUnitPrice) * 100);
  return [perUnitCents / 100, (perUnitCents * offer.quantity) / 100];
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
    // The competitor's price the offer beats ("en vez de $17.75") is the customer's own figure.
    ...(verifiedOffer.negotiation?.referenceUnitPrice != null ? [verifiedOffer.negotiation.referenceUnitPrice] : []),
    // Our own previous offer in this negotiation ("de $17.65 se lo dejo en $17.58").
    ...(verifiedOffer.negotiation?.lastOfferedUnitPrice != null ? [verifiedOffer.negotiation.lastOfferedUnitPrice] : []),
    // A spelled-out saving is true, just not worth saying: mentionsSavingsAmount
    // rewrites it without blocking the offer as an unverified figure.
    ...savingsOf(verifiedOffer),
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
    return `Esa condición la estoy revisando con ${OWNER_NAME}, el gerente. Le escribo apenas tenga respuesta.`;
  }
  if (ownerConsulted) {
    return "Déjeme revisarlo bien y le escribo en unos minutos.";
  }
  return "Déjeme revisar bien las condiciones y le escribo con una propuesta concreta.";
}

// Pressure a good B2B salesperson never uses: urgency, scarcity, a curt
// "¿Me confirma el pedido?" or pushing the customer to decide now.
const PRESSURE = /\b(aprovech[ae]|solo\s+por\s+hoy|[uú]ltima\s+oportunidad|no\s+(?:lo\s+)?deje\s+pasar|por\s+tiempo\s+limitado|antes\s+de\s+que\s+se\s+acabe|decida\s+(?:hoy|ya|ahora)|me\s+confirma\s+(?:el|su)\s+pedido)\b/i;

export function soundsPushy(text: string): boolean {
  return PRESSURE.test(text);
}

// Words from the agent's own process that a salesperson would never write
// to a customer ("para recuperar su pedido", "condiciones verificadas").
const INTERNAL_LANGUAGE = /\b(verificad[ao]s?|recuperar(?:lo|la)?\s+(?:su|el|la|como)\s+(?:pedido|cliente|cuenta|compra)|recuperar\s+su\s+pedido|reactivar(?:lo|la)?)\b/i;

export function usesInternalLanguage(text: string): boolean {
  return INTERNAL_LANGUAGE.test(text);
}

// "¿Le cotizo…?" asks permission for a step the agent should just take.
const PERMISSION_TO_QUOTE = /¿[^?]*\b(?:le|te)\s+(?:cotizo|coticemos|preparo\s+(?:una|la)\s+cotizaci[oó]n|armo\s+(?:una|la)\s+propuesta)\b|\bquiere\s+que\s+le\s+(?:cotice|prepare\s+una\s+cotizaci[oó]n)\b/i;

export function asksPermissionToQuote(text: string): boolean {
  return PERMISSION_TO_QUOTE.test(text);
}

/**
 * The offer presented is just the competitor's price while there is margin
 * to improve it: the customer sees no reason to switch ("me ofreces lo mismo").
 * Only for a first offer against a known reference, not for an accepted ask.
 */
export function onlyMatchesReference(reply: string, offer: VerifiedOfferResult | null): boolean {
  const n = offer?.negotiation;
  if (!offer || offer.status !== "ready" || !n || n.referenceUnitPrice == null || n.customerAskUnitPrice != null) return false;
  if (n.recommendedUnitPrice == null || n.recommendedUnitPrice >= offer.netUnitPrice) return false;
  return sameMoney(offer.netUnitPrice, n.referenceUnitPrice) && presentsFinalVerifiedOffer(reply, offer);
}

// "$5.00 menos en su pedido": a small saving said out loud makes the
// improvement look minor. The better price and the advantages speak for it.
const SAVINGS_AMOUNT = /\$\s*\d+(?:[.,]\d{1,2})?\s+(?:menos|de\s+ahorro)\b|\bahorr(?:a|o|ar[ií]a|aría)\s+(?:usted\s+)?\$/i;

export function mentionsSavingsAmount(text: string): boolean {
  return SAVINGS_AMOUNT.test(text);
}

// "Stock disponible: 820 unidades" tells the customer (and a competitor)
// our inventory and adds nothing: having stock for their order is the point.
export function hideStockCount(text: string): string {
  return text
    .replace(/(stock\s+disponible)\s*:?\s*\*?\d[\d.,]*\s+unidades\*?/gi, "$1")
    .replace(/\s*\(\s*\d[\d.,]*\s+unidades\s+disponibles\s*\)/gi, "")
    .replace(/\b\d[\d.,]*\s+unidades\s+disponibles\b/gi, "stock disponible");
}

const BULLET = /^\s*[-*•]\s+/;

function bulletCount(text: string): number {
  return text.split("\n").filter((line) => BULLET.test(line)).length;
}

/**
 * The reply lists again an offer already sent as a list (same unit price):
 * the customer already has it, and a third copy reads like a quote machine.
 */
export function repeatsOfferList(reply: string, previousAgentMessages: string[], offer: VerifiedOfferResult | null): boolean {
  if (!offer || bulletCount(reply) < 3) return false;
  const price = offer.netUnitPrice;
  const hasPrice = (text: string) => moneyValues(text).some((value) => sameMoney(value, price));
  return hasPrice(reply) && previousAgentMessages.some((m) => bulletCount(m) >= 3 && hasPrice(m));
}

// "Abdiel aprobó el precio" tells the customer there was room to push.
// A lookahead, not \b: in JS "aprobó" has no word boundary after the "ó".
const REVEALS_APPROVAL = /\b(aprob[óo]|aprobad[oa]s?|autoriz[óo]|autorizad[oa]s?)(?![a-záéíóúñ])|\bpendiente\s+de\s+aprobaci[oó]n/i;

export function revealsApproval(text: string): boolean {
  return REVEALS_APPROVAL.test(text);
}

// "¿Quiere que lo consulte?" makes the customer ask twice for the same thing.
const PERMISSION_TO_CONSULT = /¿[^?]*\b(?:quiere|desea|le\s+parece)\s+que\s+(?:lo|se\s+lo|le)\s+(?:consulte|revise|pregunte)\b/i;

export function asksPermissionToConsult(text: string): boolean {
  return PERMISSION_TO_CONSULT.test(text);
}
