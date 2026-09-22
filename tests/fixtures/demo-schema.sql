-- Test fixture only, inferred from repository queries. NOT a production
-- migration, schema dump, or complete representation of Supabase constraints.
create schema agente_comercial;
create table agente_comercial.customers (
  id uuid primary key default gen_random_uuid(), name text not null default 'QA',
  credit_total numeric not null default 20000, credit_available numeric not null default 14500,
  payment_terms text not null default '30 días'
);
create table agente_comercial.opportunities (
  id uuid primary key default gen_random_uuid(), customer_id uuid references agente_comercial.customers,
  status text default 'detectada', updated_at timestamptz default now()
);
create table agente_comercial.conversations (
  id uuid primary key default gen_random_uuid(), customer_id uuid references agente_comercial.customers,
  opportunity_id uuid references agente_comercial.opportunities, ended_at timestamptz,
  stage text default 'discovery', objective_current text, channel text, started_at timestamptz default now()
);
create table agente_comercial.products (
  id uuid primary key default gen_random_uuid(), sku text unique not null,
  name text not null, unit_price numeric not null, stock integer not null, express_eligible boolean default false
);
create table agente_comercial.commercial_policies (
  version integer primary key, config jsonb not null, is_active boolean default true
);
create table agente_comercial.customer_insights (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations,
  customer_id uuid references agente_comercial.customers, opt_out boolean default false,
  motivo_inactividad text, competidor_mencionado text, objecion text, producto_interes text,
  cantidad integer, precio_objetivo numeric, condicion_solicitada text, intencion_compra text,
  resultado text, proxima_accion text, proxima_fecha date, resumen text
);
create table agente_comercial.approvals (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations,
  customer_id uuid references agente_comercial.customers, type text, status text default 'pending',
  requested_value jsonb, decided_value jsonb, context jsonb, policy_min numeric, policy_max numeric,
  agent_recommendation text, decided_by text, decided_at timestamptz, created_at timestamptz default clock_timestamp()
);
create table agente_comercial.orders (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations,
  customer_id uuid references agente_comercial.customers, subtotal numeric, discount_pct numeric, total numeric,
  credit_terms text, delivery_option text, status text, created_at timestamptz default now()
);
create table agente_comercial.order_items (
  order_id uuid references agente_comercial.orders, product_id uuid references agente_comercial.products,
  quantity integer check (quantity > 0), unit_price numeric
);
create table agente_comercial.audit_log (
  id uuid primary key default gen_random_uuid(), conversation_id uuid references agente_comercial.conversations,
  category text, label text, payload jsonb
);
