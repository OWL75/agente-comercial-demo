/**
 * Models write Markdown (`**bold**`), but WhatsApp marks bold with a single
 * asterisk, so the extra pair shows up literally. Normalizes a model reply
 * into WhatsApp's own formatting before it is stored or sent.
 */
export function toWhatsAppText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/~~(.+?)~~/g, "~$1~")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .trim();
}

export type WhatsAppSegment = { text: string; bold: boolean };

/** Splits WhatsApp text on `*bold*` spans so the web chat can render them like the phone does. */
export function splitWhatsAppBold(text: string): WhatsAppSegment[] {
  const segments: WhatsAppSegment[] = [];
  const pattern = /\*([^*\n]+)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), bold: false });
    segments.push({ text: match[1], bold: true });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments;
}
