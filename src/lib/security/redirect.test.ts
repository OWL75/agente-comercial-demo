import { it, expect } from "vitest";
import { safeLoginDestination } from "./redirect";

it.each([null, "javascript:alert(1)", "https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/login", "/oportunidades\n", "/oportunidades?next=bad"])("rejects unsafe destinations %s", (value) => {
  expect(safeLoginDestination(value)).toBe("/oportunidades");
});
it.each(["/aprobaciones", "/politicas", "/conversaciones/11111111-1111-1111-1111-111111111111"])("allows application paths %s", (value) => {
  expect(safeLoginDestination(value)).toBe(value);
});
