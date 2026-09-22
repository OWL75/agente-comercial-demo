/** Only known application routes are valid post-login destinations. */
export function safeLoginDestination(value: string | null): string {
  return value && /^\/(?:oportunidades|conversaciones|aprobaciones|politicas)(?:\/[0-9a-fA-F-]{36})?$/.test(value)
    ? value
    : "/oportunidades";
}
