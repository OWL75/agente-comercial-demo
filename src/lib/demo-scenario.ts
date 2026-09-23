import "server-only";

import { sql } from "@/lib/db";
import { normalizePhone } from "@/lib/channel/phone";

// These IDs are owned by the reusable demo fixture. The reset routine never
// accepts a customer/opportunity ID from the browser, so it cannot be pointed
// at a real customer by changing a form field or request payload.
export const DEMO_CUSTOMER_ID = "de000000-0000-4000-8000-000000000001";
export const DEMO_OPPORTUNITY_ID = "de000000-0000-4000-8000-000000000002";
const DEMO_CUSTOMER_NAME = "Empresa Demo";

export type DemoScenarioStatus = {
  recipientConfigured: boolean;
  recipientError: string | null;
  recipientPreview: string | null;
  whatsappSendConfigured: boolean;
  webhookConfigured: boolean;
  scenarioReady: boolean;
};

function getDemoRecipient(): { recipient: { digits: string; display: string } | null; error: string | null } {
  const digits = normalizePhone(process.env.DEMO_WHATSAPP_RECIPIENT ?? "");
  if (!digits) return { recipient: null, error: "Falta DEMO_WHATSAPP_RECIPIENT en EasyPanel." };
  if (digits.length < 8 || digits.length > 15) {
    return {
      recipient: null,
      error: "DEMO_WHATSAPP_RECIPIENT debe tener entre 8 y 15 dígitos en formato internacional.",
    };
  }
  return { recipient: { digits, display: `+${digits}` }, error: null };
}

export async function getDemoScenarioStatus(): Promise<DemoScenarioStatus> {
  const { recipient, error: recipientError } = getDemoRecipient();
  const [fixture] = await sql<
    Array<{ customer_name: string; customer_phone: string | null; customer_id: string }>
  >`
    select c.name as customer_name, c.phone as customer_phone, o.customer_id
    from agente_comercial.opportunities o
    join agente_comercial.customers c on c.id = o.customer_id
    where o.id = ${DEMO_OPPORTUNITY_ID} and c.id = ${DEMO_CUSTOMER_ID}
  `;

  return {
    recipientConfigured: Boolean(recipient),
    recipientError,
    recipientPreview: recipient ? `••••${recipient.digits.slice(-4)}` : null,
    whatsappSendConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
    ),
    webhookConfigured: Boolean(
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_VERIFY_TOKEN &&
        process.env.WHATSAPP_APP_SECRET,
    ),
    scenarioReady: Boolean(
      fixture &&
        fixture.customer_name === DEMO_CUSTOMER_NAME &&
        fixture.customer_id === DEMO_CUSTOMER_ID &&
        recipient &&
        normalizePhone(fixture.customer_phone ?? "") === recipient.digits,
    ),
  };
}

/**
 * Creates or resets one isolated, reusable demo company. The transaction:
 * - refuses to operate if either reserved ID belongs to an unexpected row;
 * - refuses to operate if the demo customer acquired another opportunity;
 * - deletes only this opportunity's conversations and this customer's demo
 *   history, relying on the production CASCADE constraints for child rows;
 * - rebuilds deterministic commercial context with dates relative to today.
 */
export async function prepareDemoScenario(): Promise<string> {
  const { recipient, error } = getDemoRecipient();
  if (!recipient) {
    throw new Error(error ?? "Configura DEMO_WHATSAPP_RECIPIENT antes de preparar la demostración.");
  }

  return sql.begin(async (tx) => {
    await tx`
      insert into agente_comercial.customers (id, name)
      values (${DEMO_CUSTOMER_ID}, ${DEMO_CUSTOMER_NAME})
      on conflict (id) do nothing
    `;
    const [customer] = await tx`
      select id, name from agente_comercial.customers
      where id = ${DEMO_CUSTOMER_ID}
      for update
    `;
    if (!customer || customer.name !== DEMO_CUSTOMER_NAME) {
      throw new Error("El ID reservado del cliente demo pertenece a otro registro; reinicio cancelado.");
    }

    const [unexpectedOpportunity] = await tx`
      select id from agente_comercial.opportunities
      where customer_id = ${DEMO_CUSTOMER_ID} and id <> ${DEMO_OPPORTUNITY_ID}
      limit 1
    `;
    if (unexpectedOpportunity) {
      throw new Error("El cliente demo tiene datos ajenos al escenario; reinicio cancelado.");
    }

    await tx`
      insert into agente_comercial.opportunities
        (id, customer_id, signal_type, priority, status)
      values
        (${DEMO_OPPORTUNITY_ID}, ${DEMO_CUSTOMER_ID}, 'recompra_atrasada', 'alta', 'preparada')
      on conflict (id) do nothing
    `;
    const [opportunity] = await tx`
      select id, customer_id from agente_comercial.opportunities
      where id = ${DEMO_OPPORTUNITY_ID}
      for update
    `;
    if (!opportunity || opportunity.customer_id !== DEMO_CUSTOMER_ID) {
      throw new Error("El ID reservado de la oportunidad demo pertenece a otro cliente; reinicio cancelado.");
    }

    const products = await tx<Array<{ id: string; sku: string }>>`
      select id, sku from agente_comercial.products
      where sku in ('CAP-001', 'CAP-005')
      order by sku
    `;
    const shampoo = products.find((product) => product.sku === "CAP-001");
    const mask = products.find((product) => product.sku === "CAP-005");
    if (!shampoo || !mask) {
      throw new Error("El catálogo demo requiere los productos CAP-001 y CAP-005.");
    }

    // This is the only destructive section. Every predicate is a server-owned
    // constant and the ownership checks above have already succeeded.
    await tx`
      delete from agente_comercial.conversations
      where opportunity_id = ${DEMO_OPPORTUNITY_ID} and customer_id = ${DEMO_CUSTOMER_ID}
    `;
    await tx`
      delete from agente_comercial.customer_insights
      where customer_id = ${DEMO_CUSTOMER_ID}
    `;
    await tx`
      delete from agente_comercial.purchases
      where customer_id = ${DEMO_CUSTOMER_ID}
    `;

    await tx`
      update agente_comercial.customers set
        name = ${DEMO_CUSTOMER_NAME},
        segment = 'Distribuidor regional',
        avg_purchase_freq_days = 28,
        avg_ticket = 1005.40,
        credit_total = 15000,
        credit_available = 12000,
        payment_terms = '30 días',
        preferred_channel = 'whatsapp',
        phone = ${recipient.display}
      where id = ${DEMO_CUSTOMER_ID}
    `;
    await tx`
      update agente_comercial.opportunities set
        signal_type = 'recompra_atrasada',
        detected_at = now(),
        last_purchase_date = current_date - 42,
        days_out_of_pattern = 14,
        ticket_promedio = 1005.40,
        potential_low = 900,
        potential_high = 1200,
        priority = 'alta',
        status = 'preparada',
        reason_text = 'Empresa Demo normalmente recompra cada 28 días y ya superó ese ciclo por 14 días.',
        strategy_text = 'Entender qué detuvo la recompra, resolver la objeción y recuperar un pedido de Shampoo Professional 1L.',
        updated_at = now()
      where id = ${DEMO_OPPORTUNITY_ID}
    `;

    const [purchaseOne] = await tx`
      insert into agente_comercial.purchases (customer_id, purchase_date, amount)
      values (${DEMO_CUSTOMER_ID}, current_date - 42, 1059)
      returning id
    `;
    await tx`
      insert into agente_comercial.purchase_items (purchase_id, product_id, quantity, unit_price)
      values
        (${purchaseOne.id}, ${shampoo.id}, 50, 18.50),
        (${purchaseOne.id}, ${mask.id}, 10, 13.40)
    `;

    const [purchaseTwo] = await tx`
      insert into agente_comercial.purchases (customer_id, purchase_date, amount)
      values (${DEMO_CUSTOMER_ID}, current_date - 70, 939.70)
      returning id
    `;
    await tx`
      insert into agente_comercial.purchase_items (purchase_id, product_id, quantity, unit_price)
      values
        (${purchaseTwo.id}, ${shampoo.id}, 45, 18.50),
        (${purchaseTwo.id}, ${mask.id}, 8, 13.40)
    `;

    const [purchaseThree] = await tx`
      insert into agente_comercial.purchases (customer_id, purchase_date, amount)
      values (${DEMO_CUSTOMER_ID}, current_date - 98, 1017.50)
      returning id
    `;
    await tx`
      insert into agente_comercial.purchase_items (purchase_id, product_id, quantity, unit_price)
      values (${purchaseThree.id}, ${shampoo.id}, 55, 18.50)
    `;

    return DEMO_OPPORTUNITY_ID;
  });
}
