import { z } from "zod";

// Zod v4's `.uuid()` enforces RFC 4122 strictly (version nibble 1-8, variant
// nibble 8/9/a/b) — a behavior change from v3's much looser check. Postgres's
// `uuid` column type has no such requirement; it accepts any 8-4-4-4-12 hex
// grouping. The seed dataset's hand-crafted IDs (e.g.
// "c0000000-0000-0000-0000-000000000001") are valid Postgres UUIDs but fail
// Zod's strict check — found live when `save_customer_insight` rejected
// Comercial Delta's real customerId. This validates what Postgres actually
// accepts, not a cryptographic-randomness property nothing here depends on.
export const uuidLike = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: "Invalid UUID",
  });
