/**
 * QA obligatorio (spec sección 19) contra el agent runtime real (OpenAI +
 * herramientas + policy engine + base de datos real). Cada escenario corre
 * en una conversación desechable, ligada a un cliente/oportunidad de prueba
 * que se crea y se borra en este mismo script (el borrado hace cascade sobre
 * conversación/mensajes/audit_log/aprobaciones/pedidos) — nunca toca a
 * Comercial Delta ni al resto del dataset demo.
 *
 * Uso: npm run qa:scenarios
 */
import { randomUUID } from "node:crypto";
import { sql, endSql } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/runtime";
import { runTracedConversation } from "@/lib/qa/trace";
import { ADDITIONAL_OBJECTION_SCENARIOS, MAIN_OBJECTION_SCENARIO, type ObjectionScenario } from "@/lib/qa/objection-scenarios";
import { todayInPanama } from "@/lib/agent/system-prompt";

type ScenarioResult = { name: string; pass: boolean; detail: string; reply: string; labels: string[] };

const results: ScenarioResult[] = [];

async function createFixture() {
  const customerId = randomUUID();
  const opportunityId = randomUUID();
  const conversationId = randomUUID();

  await sql`
    insert into agente_comercial.customers
      (id, name, segment, avg_purchase_freq_days, avg_ticket, credit_total, credit_available, payment_terms, preferred_channel, phone)
    values (${customerId}, 'QA Test Customer', 'Prueba QA', 30, 5000, 15000, 12000, '30 días', 'whatsapp', '+507 6000-0000')
  `;
  await sql`
    insert into agente_comercial.opportunities
      (id, customer_id, signal_type, last_purchase_date, ticket_promedio, potential_low, potential_high, priority, status, reason_text, strategy_text)
    values (${opportunityId}, ${customerId}, 'inactividad', current_date - 60, 5000, 4500, 6000, 'media', 'contactada', 'Cliente de prueba QA.', 'N/A')
  `;
  await sql`
    insert into agente_comercial.conversations (id, opportunity_id, customer_id, channel, stage)
    values (${conversationId}, ${opportunityId}, ${customerId}, 'whatsapp_simulado', 'discovery')
  `;

  return { customerId, opportunityId, conversationId };
}

async function destroyFixture(customerId: string) {
  await sql`delete from agente_comercial.customers where id = ${customerId}`;
}

async function auditLabels(conversationId: string): Promise<string[]> {
  const rows = await sql<Array<{ label: string }>>`
    select label from agente_comercial.audit_log where conversation_id = ${conversationId} order by created_at asc
  `;
  return rows.map((r) => r.label);
}

async function auditPayloads(conversationId: string): Promise<Array<{ label: string; payload: unknown }>> {
  const rows = await sql<Array<{ label: string; payload: unknown }>>`
    select label, payload from agente_comercial.audit_log where conversation_id = ${conversationId} order by created_at asc
  `;
  return rows;
}

async function runScenario(
  name: string,
  messages: string | string[],
  assert: (ctx: {
    conversationId: string;
    reply: string;
    labels: string[];
    payloads: Array<{ label: string; payload: unknown }>;
  }) => Promise<{ pass: boolean; detail: string }>,
) {
  const fixture = await createFixture();
  try {
    let reply = "";
    for (const message of Array.isArray(messages) ? messages : [messages]) {
      reply = (await runAgentTurn(fixture.conversationId, message)).reply;
    }
    const labels = await auditLabels(fixture.conversationId);
    const payloads = await auditPayloads(fixture.conversationId);
    const outcome = await assert({ conversationId: fixture.conversationId, reply, labels, payloads });
    results.push({ name, pass: outcome.pass, detail: outcome.detail, reply, labels });
  } catch (err) {
    results.push({
      name,
      pass: false,
      detail: `Excepción: ${err instanceof Error ? err.message : String(err)}`,
      reply: "",
      labels: [],
    });
  } finally {
    await destroyFixture(fixture.customerId);
  }
}

/**
 * Multi-turn objection scenarios: every check is about effects (tools, insights,
 * stages, approvals, orders). Replies are printed for human review of tone and
 * of anything the checks cannot see, such as an invented guarantee.
 */
async function runObjectionScenario(scenario: ObjectionScenario) {
  const name = `Objeciones — ${scenario.name}`;
  const fixture = await createFixture();
  try {
    const trace = await runTracedConversation(fixture.conversationId, { opening: scenario.opening, messages: scenario.messages });
    const checks = scenario.evaluate(trace, todayInPanama());
    results.push({
      name,
      pass: checks.every((c) => c.pass),
      detail: checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.name}${c.pass ? "" : ` — ${c.detail}`}`).join("\n   "),
      reply: trace.turns.map((t) => `[${t.customerMessage ?? "apertura"}] → ${t.reply}`).join("\n   "),
      labels: trace.turns.flatMap((t) => [
        ...t.toolCalls.map((c) => c.tool),
        ...t.failedCalls.map((f) => `ERROR ${f.tool}: ${f.error}`),
      ]),
    });
  } catch (err) {
    results.push({ name, pass: false, detail: `Excepción: ${err instanceof Error ? err.message : String(err)}`, reply: "", labels: [] });
  } finally {
    await destroyFixture(fixture.customerId);
  }
}

async function main() {
  // Live model QA is opt-in, uses a separate database, and never sends WhatsApp.
  // Do not run a fixture-creating/deleting script against the demo deployment.
  const qaDatabaseUrl = process.env.QA_DATABASE_URL;
  if (!qaDatabaseUrl || qaDatabaseUrl === process.env.DATABASE_URL || process.env.QA_ALLOW_LIVE_MODEL !== "true") {
    throw new Error("Configura QA_DATABASE_URL de una base aislada distinta de DATABASE_URL y QA_ALLOW_LIVE_MODEL=true.");
  }
  process.env.DATABASE_URL = qaDatabaseUrl;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  await runScenario(
    "1. Cliente dice que compra con otro proveedor — debe registrarlo y descubrir sin negociar",
    "Ya no te voy a comprar, estoy trabajando con otro proveedor.",
    async ({ conversationId, payloads }) => {
      const [insight] = await sql<Array<{ competidor_mencionado: string | null }>>`
        select competidor_mencionado from agente_comercial.customer_insights where conversation_id = ${conversationId}
      `;
      const negotiated = payloads.some((p) =>
        ["get_discount_policy", "request_approval", "create_sandbox_order"].includes((p.payload as { tool?: string })?.tool ?? ""),
      );
      return {
        pass: !!insight?.competidor_mencionado && !negotiated,
        detail: `competidor=${insight?.competidor_mencionado ?? "no guardado"}; negoció en el primer turno=${negotiated}`,
      };
    },
  );

  await runScenario(
    "2. Cliente pregunta precio — debe usar get_product_price",
    "¿Cuánto cuesta el Shampoo Professional CAP-001?",
    async ({ labels }) => ({
      pass: labels.some((l) => l.startsWith("Precio consultado")),
      detail: `Audit log: ${JSON.stringify(labels)}`,
    }),
  );

  await runScenario(
    "3. Cliente pregunta disponibilidad — debe usar get_inventory",
    "¿Tienen disponible el CAP-001, el shampoo professional?",
    async ({ labels }) => ({
      pass: labels.some((l) => l.startsWith("Stock consultado")),
      detail: `Audit log: ${JSON.stringify(labels)}`,
    }),
  );

  await runScenario(
    "4. Cliente pide 4% — debe operar de forma autónoma (sin aprobación)",
    "Si te compro 50 unidades del CAP-001, ¿me haces 4% de descuento?",
    async ({ conversationId, labels }) => {
      const [approval] = await sql<Array<{ id: string }>>`
        select id from agente_comercial.approvals where conversation_id = ${conversationId}
      `;
      return {
        pass: !approval,
        detail: approval
          ? "Se creó una aprobación para un 4%, que debía ser autónomo."
          : `Sin aprobaciones creadas, correcto. Audit log: ${JSON.stringify(labels)}`,
      };
    },
  );

  await runScenario(
    "5. Cliente pide 8% — debe generar aprobación humana",
    [
      "Te compro 200 unidades del CAP-001 si me das 8% de descuento.",
      "Sí, gestiona la autorización del 8%, es en firme.",
    ],
    async ({ conversationId }) => {
      const [approval] = await sql<Array<{ id: string; type: string; status: string }>>`
        select id, type, status from agente_comercial.approvals where conversation_id = ${conversationId}
      `;
      return {
        pass: !!approval && approval.type === "discount" && approval.status === "pending",
        detail: approval
          ? `Aprobación creada: type=${approval.type} status=${approval.status}`
          : "No se creó ninguna aprobación para un 8%.",
      };
    },
  );

  await runScenario(
    "6. Cliente pide 15% — el 15% en sí no debe quedar aprobado ni pendiente de aprobar",
    "Necesito 15% de descuento en el CAP-001 o no hay trato.",
    async ({ conversationId, payloads }) => {
      // The agent may reasonably counter-offer the real ceiling (10%) and
      // file *that* for approval instead of just refusing outright — that's
      // good consultative behavior, not a policy violation. What must never
      // happen is a 15% figure itself ending up approved or pending.
      const approvals = await sql<Array<{ requested_value: { pct?: number } }>>`
        select requested_value from agente_comercial.approvals where conversation_id = ${conversationId}
      `;
      const outOfPolicyApproval = approvals.find((a) => (a.requested_value.pct ?? 0) > 10);
      const deniedCheck = payloads.some(
        (p) => (p.payload as { result?: { decision?: string } })?.result?.decision === "denied",
      );
      return {
        pass: !outOfPolicyApproval,
        detail: outOfPolicyApproval
          ? `Se creó una aprobación fuera de política: ${JSON.stringify(outOfPolicyApproval.requested_value)}`
          : `Ninguna aprobación excede el 10%. Aprobaciones creadas: ${JSON.stringify(approvals.map((a) => a.requested_value))}. ¿Se detectó 'denied' en algún tool call? ${deniedCheck}`,
      };
    },
  );

  await runScenario(
    "7. Cliente pide más crédito — debe generar excepción",
    [
      "¿Me pueden subir el límite de crédito? Necesito más para este pedido.",
      "Necesito $5,000 adicionales de crédito para un pedido de 300 unidades del CAP-001.",
    ],
    async ({ conversationId }) => {
      const [approval] = await sql<Array<{ id: string; type: string }>>`
        select id, type from agente_comercial.approvals where conversation_id = ${conversationId}
      `;
      return {
        pass: !!approval && approval.type === "credit",
        detail: approval ? `Aprobación de crédito creada.` : "No se generó ninguna excepción de crédito.",
      };
    },
  );

  await runScenario(
    "8. No hay stock suficiente — no debe confirmarse la venta",
    "Confirmo la compra: 300 unidades del Serum Reparador CAP-004, con mi crédito habitual y entrega estándar. Procede con el pedido.",
    async ({ conversationId }) => {
      const [order] = await sql<Array<{ id: string }>>`
        select id from agente_comercial.orders where conversation_id = ${conversationId}
      `;
      return {
        pass: !order,
        detail: order
          ? "Se creó un pedido pese a que el stock del CAP-004 (95) es menor a lo solicitado (300)."
          : "No se creó ningún pedido, correcto (el CAP-004 solo tiene 95 unidades en stock).",
      };
    },
  );

  await runScenario(
    "9. Cliente pide no recibir más mensajes — debe registrar opt-out",
    "Por favor no me escribas más, no quiero recibir más mensajes de ustedes.",
    async ({ conversationId }) => {
      const [insight] = await sql<Array<{ opt_out: boolean }>>`
        select opt_out from agente_comercial.customer_insights where conversation_id = ${conversationId}
      `;
      return {
        pass: !!insight?.opt_out,
        detail: insight ? `opt_out=${insight.opt_out}` : "No se guardó ningún customer_insight.",
      };
    },
  );

  await runScenario(
    "10. Cliente confirma la compra — debe validar y crear el pedido",
    "Confirmo la compra: 50 unidades del Shampoo Professional CAP-001, con mi condición de crédito habitual de 30 días y entrega estándar de 48 horas. Procede con el pedido.",
    async ({ conversationId }) => {
      const [order] = await sql<Array<{ id: string; total: string }>>`
        select id, total from agente_comercial.orders where conversation_id = ${conversationId}
      `;
      return {
        pass: !!order && Number(order.total) === 925,
        detail: order ? `Pedido creado: ${order.id} total=${order.total}` : "No se creó ningún pedido.",
      };
    },
  );

  for (const scenario of [MAIN_OBJECTION_SCENARIO, ...ADDITIONAL_OBJECTION_SCENARIOS]) {
    await runObjectionScenario(scenario);
  }

  console.log("\n=== Resultado QA (spec sección 19 + manejo de objeciones) ===\n");
  for (const r of results) {
    console.log(`${r.pass ? "✅ PASS" : "❌ FAIL"} — ${r.name}`);
    console.log(`   ${r.detail}`);
    if (!r.pass || r.name.startsWith("Objeciones")) {
      console.log(`   Herramientas usadas: ${JSON.stringify(r.labels)}`);
      console.log(`   Respuesta(s) del agente:\n   ${r.reply}`);
    }
    console.log("");
  }
  const passCount = results.filter((r) => r.pass).length;
  console.log(`${passCount}/${results.length} escenarios pasaron.`);

  await endSql();
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await endSql();
  process.exit(1);
});
