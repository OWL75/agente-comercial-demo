# Agente Comercial Autónomo — Demo (Nova Distribution)

Demo funcional de SISTECOMP para mostrar en reuniones comerciales: un agente que detecta oportunidades en una cartera de clientes, conversa por WhatsApp (real, vía Meta Cloud API — con respaldo simulado en la app si no hay credenciales configuradas), negocia dentro de reglas de negocio, y escala a un humano solo cuando la decisión excede su autonomía.

## Fase 2.1 — demo comercial repetible

Controles y límites de esta entrega: [docs/FASE_2.md](docs/FASE_2.md).
Corrección de oferta, aprobaciones y cierre: [docs/FASE_2_OBJECTION_FIXES.md](docs/FASE_2_OBJECTION_FIXES.md).
El pedido sigue siendo sandbox y no escribe en el ERP. La app incluye un modo de preparación para reuniones en `/demo`.

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
   - `WHATSAPP_*` — opcionales; sin ellos la app funciona igual (conversación 100% dentro de la app). Ver "WhatsApp real" abajo.
3. `npm run dev`

## WhatsApp real (Etapa 5)

Canal desacoplado de la lógica del agente (`src/lib/channel/`): si las credenciales de WhatsApp están configuradas, cada respuesta del agente también se envía al teléfono real del cliente, y las respuestas que el cliente escriba en WhatsApp llegan a la app por un webhook — todo además de (no en vez de) la vista de conversación dentro de la app, que sigue siendo el "God view" que se proyecta en la reunión.

**Credenciales necesarias** (`.env.local`):

| Variable | De dónde sale |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Token de un System User de Meta Business con permiso `whatsapp_business_messaging` sobre esta app (o el token temporal de 24h que da el panel de pruebas, para empezar). |
| `WHATSAPP_PHONE_NUMBER_ID` | Panel de la app de Meta → WhatsApp → API Setup. |
| `WHATSAPP_VERIFY_TOKEN` | Lo inventas tú — cadena arbitraria que se pega igual en Meta al registrar el webhook. |
| `WHATSAPP_APP_SECRET` | Panel de la app de Meta → App Settings → Basic. Obligatorio: sin secreto o sin `WHATSAPP_PHONE_NUMBER_ID`, el webhook devuelve 503; una firma ausente/inválida devuelve 401. |
| `WHATSAPP_API_VERSION` | Versión de Graph API. El valor predeterminado actual es `v26.0`. |
| `DEMO_WHATSAPP_RECIPIENT` | Teléfono que representará al cliente durante la reunión, en formato internacional E.164 (por ejemplo `+50766123456`). |

**Importante:** usar una **App de Meta separada** de la que usa el agente de soporte (`vps-assistant/n8n-agente-soporte`) — Meta enruta todos los números de una misma app al mismo webhook, y mezclar los dos agentes en una sola app arriesga romper el flujo de soporte en producción.

**Webhook:** `GET|POST /api/webhooks/whatsapp`. Registrar en el panel de Meta (WhatsApp → Configuration → Webhook) la URL pública de esta app + `/api/webhooks/whatsapp`, con el mismo valor de `WHATSAPP_VERIFY_TOKEN`, suscrito al campo `messages`.

### Flujo para reuniones y video

1. Desde `DEMO_WHATSAPP_RECIPIENT`, enviar cualquier mensaje al número del agente para abrir la ventana de atención de 24 horas.
2. Entrar a `/demo` y comprobar que teléfono, envío y webhook aparezcan listos.
3. Pulsar **Crear/Reiniciar demostración**. Esto reconstruye únicamente `Empresa Demo`; no toca los demás clientes.
4. En la ficha que se abre, pulsar **Iniciar conversación**. El agente enviará el primer mensaje libre dentro de la ventana ya abierta.
5. Responder desde WhatsApp mientras se proyecta la vista web para mostrar contexto, herramientas, políticas y cierre.

Fuera de esa ventana, una implementación real debe iniciar el contacto con una plantilla aprobada por Meta. El atajo anterior se usa solo para acelerar reuniones y grabaciones; no cambia la regla del canal que se explica a prospectos.

**Probar en local:** Meta necesita una URL pública HTTPS para entregar el webhook — `localhost:3000` no sirve. Usa un túnel (`ngrok http 3000`, `cloudflared tunnel --url http://localhost:3000`, etc.) y registra esa URL temporal en Meta mientras pruebas.

**Deduplicación de entrada:** el insert utiliza `ON CONFLICT DO NOTHING`, apoyado en la restricción única existente sobre `messages.external_message_id` (pendiente verificar en el esquema de staging). Esto no recupera un turno interrumpido después de guardar el mensaje. Una inbox/outbox persistente y procesamiento por conversación siguen pendientes.

**Resiliencia:** un envío real fallido (WhatsApp caído, token vencido) se registra en `audit_log` pero nunca rompe la conversación dentro de la app — verificado en vivo forzando un 401 real contra la Graph API de Meta con credenciales inválidas.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js estándar. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | Tests deterministas (policy engine, formateo, SQL en PostgreSQL/WASM y escenarios de objeciones con un modelo guionizado sobre el runtime real) — rápidos, sin red. |
| `npm run qa:scenarios` | **QA obligatorio (sección 19 del spec)** — ver abajo. |

## QA de escenarios comerciales (Etapa 9)

`npm run qa:scenarios` requiere `QA_DATABASE_URL` de una base de pruebas separada, con catálogo y políticas cargados, y `QA_ALLOW_LIVE_MODEL=true`. No acepta el mismo URL configurado en `DATABASE_URL` y deshabilita los envíos WhatsApp. Un URL diferente no prueba que sea otra base: verificar también el destino antes de ejecutar. Corre los 10 escenarios contra el **agent runtime real** (OpenAI + herramientas + policy engine + base de datos), no contra mocks. Cada escenario:

1. Crea un cliente/oportunidad/conversación de prueba desechable (nunca toca a Comercial Delta ni al resto del dataset demo).
2. Envía el mensaje del cliente (uno o dos turnos, según el escenario).
3. Verifica el resultado real en la base de datos (¿se creó una aprobación?, ¿se creó un pedido?, ¿se guardó el opt-out?), no solo el texto de la respuesta.
4. Borra el fixture (el borrado hace cascade sobre conversación → mensajes → audit_log → aprobaciones → pedidos).

| # | Escenario | Qué verifica |
|---|---|---|
| 1 | Cliente dice que compra con otro proveedor | Guarda el competidor y no negocia descuento, excepción ni pedido en ese turno. |
| 2 | Cliente pregunta precio | Se usó `get_product_price` (nunca un precio inventado). |
| 3 | Cliente pregunta disponibilidad | Se usó `get_inventory`. |
| 4 | Cliente pide 4% de descuento | Se resuelve de forma autónoma — no se crea ninguna aprobación. |
| 5 | Cliente pide 8% (dos turnos: oferta + confirmación) | Se crea una aprobación `discount` en estado `pending`. |
| 6 | Cliente pide 15% | Ninguna aprobación queda con un valor fuera de política (>10%); el agente puede contraofertar el máximo real (10%) y escalar *eso*, que sí es válido. |
| 7 | Cliente pide más crédito (dos turnos: pedido + monto) | Se crea una aprobación `credit`. |
| 8 | No hay stock suficiente (pedido de 300 uds. de un producto con 95 en stock) | No se crea ningún pedido. |
| 9 | Cliente pide no recibir más mensajes | Se guarda `customer_insights.opt_out = true`. |
| 10 | Cliente confirma la compra con todos los datos claros | Se crea el pedido sandbox con el total correcto. |

Además corre los 10 escenarios de manejo de objeciones de `src/lib/qa/objection-scenarios.ts` (uno principal de seis turnos y nueve adicionales). Se evalúan por efectos —herramientas, insights, etapas, aprobaciones y pedidos— con `src/lib/qa/objection-checks.ts`, y el script imprime cada respuesta para revisar el tono. Ver `docs/FASE_2_OBJECIONES.md`.

Resultado histórico de V1: **10/10 escenarios pasando** según la construcción original. No se han vuelto a ejecutar los escenarios con modelo real para esta rama de fase 2. `npm test` sí cubre controles deterministas y consultas SQL contra un fixture PostgreSQL/WASM aislado.

**Nota sobre no-determinismo:** estos son tests de comportamiento contra un LLM real, no unit tests deterministas. Un fallo puntual en 1-2 escenarios no necesariamente indica un bug de código — puede ser el modelo tomando un camino igual de válido pero distinto al que el escenario asume (p. ej. pedir confirmación antes de escalar una excepción, en vez de escalar de inmediato). Antes de "arreglar" un fallo, lee la respuesta real del agente (el script la imprime) para distinguir un bug real de una variación de comportamiento razonable — así se encontraron y corrigieron los bugs reales documentados abajo.

## Bugs reales encontrados durante la construcción (y su fix)

- **Zona horaria en fechas**: Postgres devuelve `date` como medianoche UTC; formatear con la zona horaria local del servidor corría los días un día atrás. Fix: `timeZone: "UTC"` en el formateador (`src/lib/format.ts`).
- **IDs que el modelo no puede conocer**: el modelo no tiene forma de saber su propio `conversationId`; en una prueba intentó pedírselo al cliente. Fix: `customerId`/`conversationId` se eliminan del JSON Schema que ve el modelo y el runtime los inyecta siempre desde el contexto (`src/lib/agent/tools.ts`, `src/lib/agent/runtime.ts`).
- **Doble codificación de JSON**: las columnas `jsonb` se guardaban como texto doblemente escapado porque el código hacía `JSON.stringify()` manualmente y el driver de Postgres también lo hace al detectar `::jsonb`. Esto rompía silenciosamente todo el flujo de aprobaciones. Fix: helper centralizado `toJsonb()` (`src/lib/db.ts`) que usa `sql.json()` correctamente, más un `Proxy` alrededor del cliente perezoso de Postgres (antes, el wrapper perdía métodos como `.json()`/`.end()`).
- **Aprobaciones duplicadas**: el modelo a veces llama `request_approval` dos veces para la misma negociación. Fix: `request_approval` es idempotente por (conversación, tipo) — actualiza la pendiente existente en vez de crear una segunda.
- **`\D` dentro de un template literal de JS**: `` `regexp_replace(c.phone, '\D', '', 'g')` `` se veía correcto, pero JavaScript silenciosamente convierte un escape no reconocido como `\D` en solo `D` dentro de un string entre backticks — el SQL que de verdad llegaba a Postgres buscaba la letra "D" literal, así que el match de teléfono entrante de WhatsApp nunca encontraba la conversación. Fix: usar una clase de caracteres (`'[^0-9]'`) que no necesita backslash. Encontrado probando el webhook con un payload real firmado, no por inspección de código — el bug era invisible leyendo el archivo.

## Qué falta para un piloto real (fuera de alcance de este V1)

- Un número de WhatsApp de **producción** (verificado ante Meta) — hoy funciona con el número de prueba gratuito de Meta, que solo puede escribirle a números verificados manualmente (máx. 5).
- Autenticación real (hoy es un gate de contraseña compartida, sin usuarios).
- Completar cotizaciones versionadas, inbox/outbox e índices únicos. Esta rama ya usa transacciones para pedidos, memoria, solicitudes de aprobación, etapas e inicio de conversación; falta validar concurrencia con varias conexiones y el esquema real.
- Aislamiento de RLS más allá de "todo bloqueado salvo el servidor" (suficiente porque el navegador nunca habla con la base directamente).
- El webhook de WhatsApp procesa cada mensaje de forma síncrona antes de responder 200 a Meta (simple y suficiente para una conversación a la vez); con concurrencia real convendría pasar a una cola para no arriesgar el timeout/reintento de Meta en un turno con muchas llamadas a herramientas.
