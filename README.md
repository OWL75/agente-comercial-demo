# Agente Comercial Autónomo — Demo (Nova Distribution)

Demo funcional de SISTECOMP para mostrar en reuniones comerciales: un agente que detecta oportunidades en una cartera de clientes, conversa por WhatsApp (simulado en esta V1), negocia dentro de reglas de negocio, y escala a un humano solo cuando la decisión excede su autonomía.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind 4 — mismo stack que `constancia` y `recuperacion-inteligente-ventas`.
- Postgres directo (paquete `postgres`), sobre el proyecto Supabase compartido de Sistecomp, en un schema propio (`agente_comercial`) aislado de las demás apps.
- OpenAI Responses API (`gpt-5.6-luna` por defecto) para el agent runtime.

## Arquitectura (resumen)

- `src/lib/db/` — capa de lectura para las pantallas (Server Components).
- `src/lib/tools/` — las 14 herramientas estructuradas del agente (sección 12 del spec). Ninguna confía en un dato que venga del modelo: todas re-consultan la base o re-derivan la política antes de escribir.
- `src/lib/policy/evaluate.ts` — policy engine puro (descuento, crédito, entrega, stock), sin dependencias externas.
- `src/lib/agent/` — registro de herramientas (Zod → JSON Schema para OpenAI, con auditoría automática), runtime (loop de tool-calling), y el ciclo de vida de una conversación (iniciar / reanudar tras una decisión humana).
- El modelo nunca ve ni puede escribir `customerId`/`conversationId`: el runtime los inyecta siempre desde el contexto real de la conversación.

## Configuración local

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar:
   - `DATABASE_URL` — Supabase Dashboard → Project Settings → Database → Connection string (modo "Transaction pooler").
   - `OPENAI_API_KEY` — platform.openai.com/api-keys.
   - `DEMO_ACCESS_PASSWORD` — opcional en local; obligatorio antes de compartir la URL fuera de tu máquina (gate simple sin sistema de usuarios).
3. `npm run dev`

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js estándar. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | Tests unitarios (policy engine, formateo) — rápidos, sin red. |
| `npm run qa:scenarios` | **QA obligatorio (sección 19 del spec)** — ver abajo. |

## QA de escenarios comerciales (Etapa 9)

`npm run qa:scenarios` corre los 10 escenarios obligatorios contra el **agent runtime real** (OpenAI + herramientas + policy engine + base de datos), no contra mocks. Cada escenario:

1. Crea un cliente/oportunidad/conversación de prueba desechable (nunca toca a Comercial Delta ni al resto del dataset demo).
2. Envía el mensaje del cliente (uno o dos turnos, según el escenario).
3. Verifica el resultado real en la base de datos (¿se creó una aprobación?, ¿se creó un pedido?, ¿se guardó el opt-out?), no solo el texto de la respuesta.
4. Borra el fixture (el borrado hace cascade sobre conversación → mensajes → audit_log → aprobaciones → pedidos).

| # | Escenario | Qué verifica |
|---|---|---|
| 1 | Cliente dice que compra con otro proveedor | El agente hace una pregunta de descubrimiento (no vende de inmediato). |
| 2 | Cliente pregunta precio | Se usó `get_product_price` (nunca un precio inventado). |
| 3 | Cliente pregunta disponibilidad | Se usó `get_inventory`. |
| 4 | Cliente pide 4% de descuento | Se resuelve de forma autónoma — no se crea ninguna aprobación. |
| 5 | Cliente pide 8% (dos turnos: oferta + confirmación) | Se crea una aprobación `discount` en estado `pending`. |
| 6 | Cliente pide 15% | Ninguna aprobación queda con un valor fuera de política (>10%); el agente puede contraofertar el máximo real (10%) y escalar *eso*, que sí es válido. |
| 7 | Cliente pide más crédito (dos turnos: pedido + monto) | Se crea una aprobación `credit`. |
| 8 | No hay stock suficiente (pedido de 300 uds. de un producto con 95 en stock) | No se crea ningún pedido. |
| 9 | Cliente pide no recibir más mensajes | Se guarda `customer_insights.opt_out = true`. |
| 10 | Cliente confirma la compra con todos los datos claros | Se crea el pedido sandbox con el total correcto. |

Última corrida: **10/10 escenarios pasando** contra `gpt-5.6-luna`.

**Nota sobre no-determinismo:** estos son tests de comportamiento contra un LLM real, no unit tests deterministas. Un fallo puntual en 1-2 escenarios no necesariamente indica un bug de código — puede ser el modelo tomando un camino igual de válido pero distinto al que el escenario asume (p. ej. pedir confirmación antes de escalar una excepción, en vez de escalar de inmediato). Antes de "arreglar" un fallo, lee la respuesta real del agente (el script la imprime) para distinguir un bug real de una variación de comportamiento razonable — así se encontraron y corrigieron los bugs reales documentados abajo.

## Bugs reales encontrados durante la construcción (y su fix)

- **Zona horaria en fechas**: Postgres devuelve `date` como medianoche UTC; formatear con la zona horaria local del servidor corría los días un día atrás. Fix: `timeZone: "UTC"` en el formateador (`src/lib/format.ts`).
- **IDs que el modelo no puede conocer**: el modelo no tiene forma de saber su propio `conversationId`; en una prueba intentó pedírselo al cliente. Fix: `customerId`/`conversationId` se eliminan del JSON Schema que ve el modelo y el runtime los inyecta siempre desde el contexto (`src/lib/agent/tools.ts`, `src/lib/agent/runtime.ts`).
- **Doble codificación de JSON**: las columnas `jsonb` se guardaban como texto doblemente escapado porque el código hacía `JSON.stringify()` manualmente y el driver de Postgres también lo hace al detectar `::jsonb`. Esto rompía silenciosamente todo el flujo de aprobaciones. Fix: helper centralizado `toJsonb()` (`src/lib/db.ts`) que usa `sql.json()` correctamente, más un `Proxy` alrededor del cliente perezoso de Postgres (antes, el wrapper perdía métodos como `.json()`/`.end()`).
- **Aprobaciones duplicadas**: el modelo a veces llama `request_approval` dos veces para la misma negociación. Fix: `request_approval` es idempotente por (conversación, tipo) — actualiza la pendiente existente en vez de crear una segunda.

## Qué falta para un piloto real (fuera de alcance de este V1)

- **WhatsApp real (Etapa 5)**: requiere un número/WABA dedicado a este agente — no se puede reutilizar el del agente de soporte (`vps-assistant/n8n-agente-soporte`) sin arriesgar ese flujo en producción.
- Autenticación real (hoy es un gate de contraseña compartida, sin usuarios).
- Transacciones atómicas en Postgres para escrituras concurrentes (hoy son escrituras secuenciales, aceptable a escala de demo).
- Aislamiento de RLS más allá de "todo bloqueado salvo el servidor" (suficiente porque el navegador nunca habla con la base directamente).
