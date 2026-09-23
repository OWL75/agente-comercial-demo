-- Test fixture only, inferred from repository queries. NOT a production
-- migration, schema dump, or complete representation of Supabase constraints.
-- The stage and insight CHECKs mirror constraints read from production on 2026-09-23.
create schema agente_comercial;
create table agente_comercial.customers (
  id uuid primary key default gen_random_uuid(), name text not null default 'QA',
  segment text, avg_purchase_freq_days integer, avg_ticket numeric,
  credit_total numeric not null default 20000, credit_available numeric not null default 14500,
  payment_terms text not null default '30 días', preferred_channel text default 'whatsapp',
  phone text, created_at timestamptz default now()
);
create table agente_comercial.opportunities (
  id uuid primary key default gen_random_uuid(), customer_id uuid references agente_comercial.customers on delete cascade,
  signal_type text default 'recompra_atrasada', detected_at timestamptz default now(),
  last_purchase_date date, days_out_of_pattern integer, ticket_promedio numeric,
  potential_low numeric, potential_high numeric, priority text default 'alta',
  status text default 'detectada', reason_text text, strategy_text text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table agente_comercial.conversations (
  id uuid primary key default gen_random_uuid(), customer_id uuid references agente_comercial.customers on delete cascade,
  opportunity_id uuid references agente_comercial.opportunities on delete cascade, ended_at timestamptz,
  stage text default 'discovery' check (stage in ('discovery','objection_handling','negotiating','awaiting_approval','closing','closed')), objective_current text, channel text, started_at timestamptz default now()
);
create table agente_comercial.products (
  id uuid primary key default gen_random_uuid(), sku text unique not null,
  name text not null, unit_price numeric not null, stock integer not null, express_eligible boolean default false
);
create table agente_comercial.commercial_policies (
  version integer primary key, config jsonb not null, is_active boolean default true
);
create table agente_comercial.purchases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references agente_comercial.customers on delete cascade,
  purchase_date date not null, amount numeric not null, created_at timestamptz default now()
);
create table agente_comercial.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references agente_comercial.purchases on delete cascade,
  product_id uuid references agente_comercial.products,
  quantity integer not null, unit_price numeric not null
);
create table agente_comercial.customer_insights (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations on delete cascade,
  customer_id uuid references agente_comercial.customers on delete cascade, opt_out boolean default false,
  motivo_inactividad text, competidor_mencionado text, objecion text, producto_interes text,
  cantidad integer, precio_objetivo numeric, condicion_solicitada text, intencion_compra text,
  resultado text, proxima_accion text, proxima_fecha date, resumen text,
  check (cantidad is null or cantidad > 0), check (precio_objetivo is null or precio_objetivo >= 0)
);
create table agente_comercial.approvals (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations on delete cascade,
  customer_id uuid references agente_comercial.customers on delete cascade, type text, status text default 'pending',
  requested_value jsonb, decided_value jsonb, context jsonb, policy_min numeric, policy_max numeric,
  agent_recommendation text, decided_by text, decided_at timestamptz, created_at timestamptz default clock_timestamp()
);
create table agente_comercial.orders (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations on delete cascade,
  customer_id uuid references agente_comercial.customers on delete cascade, subtotal numeric, discount_pct numeric, total numeric,
  credit_terms text, delivery_option text, status text, created_at timestamptz default now()
);
create table agente_comercial.order_items (
  order_id uuid references agente_comercial.orders on delete cascade, product_id uuid references agente_comercial.products,
  quantity integer check (quantity > 0), unit_price numeric
);
create table agente_comercial.audit_log (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations on delete cascade,
  category text, label text, payload jsonb, created_at timestamptz default clock_timestamp()
);
create table agente_comercial.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references agente_comercial.conversations on delete cascade,
  direction text, sender text, body text, created_at timestamptz default clock_timestamp(), external_message_id text
);
