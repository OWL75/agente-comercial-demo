# Negociación al centavo, confirmación y cobro automático

Rama: `fase-2-cobro-negociacion`. Rollback: `fase-2-plantillas-v2` @ `e9f80f4`.

## Qué pasó en la conversación real (2026-09-24, 14:22–14:34 UTC)

- **Precio.** El cliente mencionó que su proveedor le cobraba $17.75. El agente ofreció $17.76 (4 %), algo razonable. Luego el cliente pidió "¿me lo puede dejar a 17.70?" y el agente bajó a **$17.58** (5 %), por debajo de lo que el cliente había pedido. La política solo permitía porcentajes enteros: 4 % da $17.76 y 5 % da $17.58, así que no había forma de ofrecer $17.70 ni un punto intermedio.
- **Bucle de confirmación.** El cliente respondió "Si", "Si está bien" y "Si confirmo el pedido", pero el pedido nunca se creó y el agente repitió la oferta cinco veces, llegando a pedir "responda exactamente: *Sí, confirmo el pedido*". Hubo dos causas:
  - Al pasar el trato a *usted*, el agente preguntaba "¿Confirma…?", pero el detector de oferta presentada solo reconocía "¿Confirmas…?". La oferta nunca quedó registrada como presentada, así que el pedido era imposible de crear.
  - La guarda de confirmación rechazaba un "Sí" a secas aunque respondiera a "¿Confirma el pedido?".
- **SKU por nombre.** El modelo pasó varias veces el nombre del producto como SKU y las herramientas fallaron.
- **Cobro.** No existía ningún paso de cobro.

## Cambios

### Negociación
- `prepare_verified_offer` acepta `netUnitPrice`, un precio neto al centavo; el descuento se deriva con 4 decimales. También acepta `customerAskUnitPrice`, el último precio que pidió el cliente.
- La oferta nunca queda por debajo de lo que pidió el cliente: `below_customer_ask` sugiere el precio exacto que pidió.
- Las concesiones por precio se quedan dentro de la autonomía del agente. Más allá de ese límite se usa `price_beyond_autonomy` y se pide aprobación al dueño.
- La herramienta devuelve `negotiation`: el precio pedido, la última oferta, el piso autónomo y una contraoferta sugerida a mitad de camino. Para el caso real: oferta $17.76, pedido $17.70, contraoferta **$17.73**.
- El pedido toma el precio neto de la oferta presentada y valida el mismo total que vio el cliente: 50 × $17.73 = $886.50.
- Reglas del prompt: no rebajar si no lo pide; ante una referencia de la competencia, responder primero con valor; concesiones cada vez más pequeñas y solo si insiste; pedir algo a cambio; nunca el máximo de una vez; cuando se negocia por precio, presentar el precio por unidad y no un porcentaje.

### Confirmación y repeticiones
- `CONFIRMATION_ASK` y `FIRM_OFFER` reconocen las formas de usted ("¿Confirma…?", "le propongo").
- Un "sí" corto ("Si", "Sí", "Si está bien", "Dale", "De acuerdo") confirma el pedido solo si el mensaje anterior del agente pedía confirmar. La duda y la negación nunca confirman.
- Si la respuesta repite el mensaje anterior con las mismas cifras, se reescribe una vez para avanzar. Una contraoferta con cifras nuevas no cuenta como repetición.
- El prompt prohíbe pedir una frase exacta y volver a presentar la misma oferta.
- Las herramientas resuelven el producto aunque llegue por nombre o como "nombre (SKU)".

### Cobro sin intervención humana
- Al crear el pedido:
  - se genera un enlace de pago con un token aleatorio de 32 caracteres;
  - el pedido pasa a `pendiente_pago`;
  - el cliente recibe un mensaje en usted con el botón **Pagar pedido** (mensaje interactivo `cta_url` de WhatsApp). Si tiene crédito, el mensaje indica el vencimiento; si paga al contado, el despacho queda sujeto al pago;
  - el dueño recibe por Telegram el aviso "🧾 Pedido confirmado".
- `/pagar/<token>` es pública (el token es la credencial) y está marcada como **entorno de prueba**. Permite pagar con tarjeta, Yappy o transferencia ACH en modo simulado. Al pagar:
  - el pedido pasa a `pagado`, una sola vez;
  - el cliente recibe la confirmación por WhatsApp;
  - el dueño recibe "💰 Pago recibido".
- **"Hablar con alguien" en la página**, por ejemplo para pagar con cheque, en partes o con más plazo: la consulta le llega al dueño por Telegram para que responda, y el cliente recibe un acuse. Cuando el dueño contesta, el agente le escribe al cliente con esa indicación.
- **Mensajes después de la venta.** Si el cliente escribe mientras el pago está pendiente, el mensaje llega a esa conversación (antes se ignoraba). El agente conoce el estado del pedido, puede reenviar el enlace (`resend_payment_link`) y deriva las excepciones con `consult_owner`.
- Todo el estado vive en `orders.status` y `audit_log`, sin cambios de esquema.

## Cobro real en Panamá (siguiente paso)

WhatsApp Payments nativo solo existe en India, Brasil y Singapur, así que en Panamá el cobro por WhatsApp se hace con un enlace de pago dentro del chat. Opciones:

- **Tilopay**: tarjetas y Yappy en un mismo enlace, integraciones y webhooks.
- **Yappy (Banco General)**: botón de pago y QR dinámico.
- **Transferencia ACH Inmediato** con referencia: la más usada en B2B para montos grandes.

Para producción:
- cambiar `PAYMENT_PROVIDER`;
- crear el enlace con la API del proveedor;
- marcar el pedido como pagado solo desde su webhook firmado, que llama a `markPaymentReceived`. Con un proveedor real la página no puede marcar pagos.

## Pruebas

- `tests/payment-negotiation.test.ts` reproduce el final real sobre el runtime real, con modelo simulado, Telegram simulado y PostgreSQL/WASM. Cubre:
  - la oferta de 5 % queda rechazada por estar debajo de $17.70, se sugieren $17.73 y la oferta de $17.73 queda lista;
  - el "Si" crea el pedido por $886.50, envía el enlace y avisa al dueño;
  - un "Si" que no responde a una pregunta de confirmación no crea el pedido;
  - una repetición con las mismas cifras se reescribe;
  - el pago es idempotente y se confirma al cliente y al dueño;
  - un problema de pago llega al dueño, y su respuesta le llega al cliente;
  - el cliente puede escribir después de la venta y pedir que se le reenvíe el enlace;
  - no se usa la URL con `$(PRIMARY_DOMAIN)`.
- Pruebas de mutación: sin el piso del precio pedido falla 1 prueba; sin la confirmación en contexto fallan 4; sin el envío del cobro fallan 4.

## Limitaciones

- El pago es simulado: no se ha integrado ningún proveedor real.
- No hay recordatorios automáticos de vencimiento para los pedidos a crédito, porque no existe un planificador de tareas.
- El mensaje de cobro va dentro de la ventana de 24 h de WhatsApp. Si el cliente paga o escribe después de esa ventana, la confirmación requeriría una plantilla aprobada.
- La calidad de la negociación depende del modelo; las guardas impiden ofrecer por debajo del precio pedido y regalar margen, pero no garantizan la mejor jugada.

## Ajuste v2 de la negociación (regla del dueño)

- **Si el precio que pide el cliente está dentro del margen del agente** (hasta 5 %, es decir, $17.58 o más para CAP-001), el agente lo acepta tal cual: "Perfecto, se lo dejo en $17.70" y pide la confirmación. No hace contraoferta y no baja más. Esto reemplaza la contraoferta a mitad de camino ($17.73) de la versión anterior.
- **Si el precio que pide está por debajo del margen** (por ejemplo, $17.50), el agente no lo acepta de inmediato. Primero ofrece su mejor precio de forma profesional: "Le puedo rebajar un 5 %, quedaría en $17.58". Si el cliente insiste, `prepare_verified_offer` devuelve `approval_required` con `below_autonomy_floor`. El agente pide aprobación del precio exacto ($17.50 = 5.4054 %) y al dueño le llega por Telegram "$18.50 → $17.50 c/u · total $875.00". Si el dueño aprueba, el agente se lo ofrece al cliente y cierra.
- `negotiation` devuelve `askWithinAutonomy` y `recommendedUnitPrice`: el precio pedido si está dentro del margen, o el piso si no lo está.

## Recordatorios de vencimiento

- **Pedidos a crédito.** Se envían `recordatorio_pago` 3 días antes del vencimiento, `pago_vence_hoy` el mismo día y `pago_vencido` 3 días después. El último también avisa al dueño por Telegram con "⚠️ Pago vencido".
- **Pedidos al contado.** Se envía un solo `pago_vencido`, 2 días después del pedido.
- **Cuándo se detienen.** Al pagar o al registrarse un opt-out. Cada recordatorio se envía una sola vez.
- **Demo.** En la conversación, el panel "Cobro y recordatorios de pago" muestra el vencimiento y los pasos. El botón "Simular que pasa el tiempo sin pago" envía el siguiente recordatorio al momento. El enlace "Abrir la página de pago" sirve para mostrar el pago en la presentación.
- **Producción.** `/api/cron/payment-reminders` (POST, `Authorization: Bearer <CRON_SECRET>`) envía los recordatorios cuya fecha llegó, como máximo uno por pedido en cada ejecución. Está deshabilitado mientras no se defina `CRON_SECRET`; una tarea diaria de n8n puede llamarlo.
- **Respuestas del cliente.** Si responde a un recordatorio ("necesito 15 días más"), el mensaje llega a la conversación. El agente lo consulta con el dueño con `consult_owner` o `request_approval`.

## Ajuste v3: escalera de concesiones (conversación del 2026-09-24, 16:38 UTC)

El cliente dijo que su proveedor le cobraba $17.75 y el agente igualó ese precio. Luego el cliente preguntó "¿No tienes un mejor precio?" y el agente respondió "Por debajo de $17.75 no puedo mejorarlo", aunque su margen llegaba hasta $17.58. La causa: el precio del competidor, guardado como `precio_objetivo`, se usaba como piso y bloqueaba cualquier oferta más baja.

- **Solo un precio que el cliente pide explícitamente** ("déjemelo a 17.70", enviado como `customerAskUnitPrice`) actúa como piso. El precio del competidor queda como `referenceUnitPrice`, solo informativo.
- **Si el cliente pide un mejor precio sin decir cuánto**, `negotiation.recommendedUnitPrice` indica el siguiente paso:
  1. La mitad del margen que queda, redondeada hacia abajo a múltiplos de 5 centavos: de $17.75 a **$17.65**.
  2. Si vuelve a pedir: el piso de **$17.58** (5 %).
  3. Por debajo del piso (`at_floor`), la decisión es del dueño, con aprobación por Telegram.
- **La regla del "descuento natural"**, que evita dar un porcentaje mayor al necesario para alcanzar la referencia, solo aplica antes de la primera oferta. Una vez hay una oferta presentada y el cliente pide más, ceder es parte de la negociación.
- **Lenguaje interno.** Palabras como "recuperar su pedido" o "condiciones verificadas" hacen que la respuesta se reescriba una vez antes de enviarse.

## Mejorar al competidor y decir la diferencia (conversación 2026-09-25 01:44 UTC)

El agente ofreció "Puedo igualar el precio y la entrega: $17.75 por unidad". El cliente respondió "Creo que me estás ofreciendo lo mismo, además ya tengo contrato con ellos" y el agente se retiró. Igualar no le da al cliente ninguna razón para cambiar, y el agente no dijo qué gana con Nova.

- **Primera oferta frente al competidor (`beat_reference`).** Con el precio de su proveedor conocido, la recomendación es 10 centavos menos, redondeado a 5 centavos: de $17.75 a **$17.65**, si queda por encima del piso; si no, el piso de $17.58. Si el cliente vuelve a pedir: $17.58; luego, el dueño por Telegram.
- **Ahorro concreto.** `negotiation.savingsVsReference` trae el ahorro por unidad y total (50 × $0.10 = $5.00) para decirlo en cifras. El guard acepta en la oferta el precio del competidor y ese ahorro, y ninguna otra cifra nueva.
- **Control determinístico.** Si el agente presenta una oferta al mismo precio del competidor teniendo margen para mejorarlo, la respuesta se reescribe una vez antes de enviarse. No aplica cuando el cliente pidió ese precio explícitamente: su propio precio se acepta tal cual.
- **Propuesta de valor (`get_value_proposition`).** Devuelve solo datos verificables del cliente (crédito disponible y plazo, stock para su pedido habitual, entrega al día siguiente si el producto califica, historial con Nova) y las ventajas aprobadas de la empresa en `src/lib/agent/company-profile.ts`. El agente usa una o dos que respondan a lo que el cliente valora y nunca afirma ventajas que no estén ahí. **Las ventajas de la empresa son valores de demo: el dueño debe confirmarlas o editarlas antes de un piloto real.**
- **"Ya tengo contrato".** Nueva guía de objeción: preguntar si es exclusivo o tiene volumen mínimo; si no es exclusivo, proponer ser proveedor de respaldo o un pedido de prueba pequeño; si es exclusivo, respetarlo, preguntar cuándo vence y dejar el seguimiento para esa fecha. Nunca sugerir incumplirlo.
- **"Me ofreces lo mismo".** No repetir la oferta: mejorar un paso y explicar en una frase la diferencia concreta.
