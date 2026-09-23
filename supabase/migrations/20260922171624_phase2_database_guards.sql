-- Phase 2 database guards for the commercial-agent sandbox.
-- Prepared from a read-only review of project zrbcvtovizwaawvyvgiw.
-- Apply in staging first. This file intentionally does not expose the
-- agente_comercial schema to anon/authenticated or add permissive RLS policies.

-- This event-trigger function must remain callable only by PostgreSQL's event
-- trigger. It is administrative and must not be exposed as a PostgREST RPC.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Database-level idempotency and lifecycle invariants. The application also
-- enforces these rules, but unique indexes close cross-process race windows.
create unique index if not exists conversations_one_open_per_opportunity_uq
  on agente_comercial.conversations (opportunity_id)
  where ended_at is null;

create unique index if not exists approvals_one_pending_per_type_uq
  on agente_comercial.approvals (conversation_id, type)
  where status = 'pending';

create unique index if not exists orders_one_per_conversation_uq
  on agente_comercial.orders (conversation_id);

create unique index if not exists customer_insights_one_per_conversation_uq
  on agente_comercial.customer_insights (conversation_id)
  where conversation_id is not null;

create unique index if not exists commercial_policies_one_active_uq
  on agente_comercial.commercial_policies (is_active)
  where is_active;

-- Cover every commercial-agent foreign key used for joins, deletes and locks.
create index if not exists approvals_conversation_id_idx
  on agente_comercial.approvals (conversation_id);
create index if not exists approvals_customer_id_idx
  on agente_comercial.approvals (customer_id);
create index if not exists audit_log_conversation_id_idx
  on agente_comercial.audit_log (conversation_id);
create index if not exists conversations_customer_id_idx
  on agente_comercial.conversations (customer_id);
create index if not exists conversations_opportunity_id_idx
  on agente_comercial.conversations (opportunity_id);
create index if not exists customer_insights_conversation_id_idx
  on agente_comercial.customer_insights (conversation_id);
create index if not exists customer_insights_customer_id_idx
  on agente_comercial.customer_insights (customer_id);
create index if not exists messages_conversation_id_idx
  on agente_comercial.messages (conversation_id);
create index if not exists opportunities_customer_id_idx
  on agente_comercial.opportunities (customer_id);
create index if not exists order_items_order_id_idx
  on agente_comercial.order_items (order_id);
create index if not exists order_items_product_id_idx
  on agente_comercial.order_items (product_id);
create index if not exists orders_customer_id_idx
  on agente_comercial.orders (customer_id);
create index if not exists purchase_items_purchase_id_idx
  on agente_comercial.purchase_items (purchase_id);
create index if not exists purchase_items_product_id_idx
  on agente_comercial.purchase_items (product_id);
create index if not exists purchases_customer_id_idx
  on agente_comercial.purchases (customer_id);

-- Reject impossible monetary, quantity and inventory states at the final
-- persistence boundary. Nullable historical fields remain nullable.
alter table agente_comercial.customers
  add constraint customers_commercial_values_check check (
    (avg_purchase_freq_days is null or avg_purchase_freq_days >= 0)
    and (avg_ticket is null or avg_ticket >= 0)
    and (credit_total is null or credit_total >= 0)
    and (credit_available is null or credit_available >= 0)
    and (credit_total is null or credit_available is null or credit_available <= credit_total)
  );

alter table agente_comercial.products
  add constraint products_values_check check (unit_price >= 0 and stock >= 0);

alter table agente_comercial.purchases
  add constraint purchases_amount_check check (amount >= 0);

alter table agente_comercial.purchase_items
  add constraint purchase_items_values_check check (quantity > 0 and unit_price >= 0);

alter table agente_comercial.opportunities
  add constraint opportunities_values_check check (
    (days_out_of_pattern is null or days_out_of_pattern >= 0)
    and (ticket_promedio is null or ticket_promedio >= 0)
    and (potential_low is null or potential_low >= 0)
    and (potential_high is null or potential_high >= 0)
    and (potential_low is null or potential_high is null or potential_low <= potential_high)
  );

alter table agente_comercial.customer_insights
  add constraint customer_insights_values_check check (
    (cantidad is null or cantidad > 0)
    and (precio_objetivo is null or precio_objetivo >= 0)
  );

alter table agente_comercial.orders
  add constraint orders_values_check check (
    subtotal >= 0 and discount_pct between 0 and 100 and total >= 0
  );

alter table agente_comercial.order_items
  add constraint order_items_values_check check (quantity > 0 and unit_price >= 0);

alter table agente_comercial.approvals
  add constraint approvals_decision_state_check check (
    (policy_min is null or policy_max is null or policy_min <= policy_max)
    and (
      (status = 'pending' and decided_value is null and decided_by is null and decided_at is null)
      or
      (status <> 'pending' and decided_at is not null)
    )
  );
