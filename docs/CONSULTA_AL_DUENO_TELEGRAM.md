# Consulta al dueño por Telegram y respuesta automática al cliente

Base: `fase-2-followup-context` @ `ef39a1c` (desplegado; punto de rollback). Rama: `fase-2-owner-telegram`.

## Qué pasó

Distribuidora Belleza del Istmo, 2026-09-24 12:13–12:16 UTC. El cliente escribió: "El proveedor actual nos deja el shampoo cerca de $17.75 y entrega al día siguiente." El agente redactó una respuesta con cifras sin verificarlas con `prepare_verified_offer`. La guarda comercial la bloqueó y envió "Déjame validar precio, descuento, disponibilidad y entrega antes de darte una oferta firme." Después no pasó nada más: nadie ejecuta esa validación y el cliente casi nunca vuelve a escribir para preguntar.

No hacía falta ninguna aprobación. Para 50 unidades, el 4% está dentro de la autonomía del agente y la entrega en 24 h es automática para CAP-001.

## Qué hace ahora

1. **Verifica y responde en el mismo turno.** Si la guarda bloquea una respuesta a un mensaje del cliente, el agente recibe el motivo y la reescribe una vez. Verifica la oferta con `prepare_verified_offer`, propone la cantidad habitual del historial si falta la cantidad, o pregunta el dato que falte. El prompt le prohíbe prometer que "lo valida luego".
2. **Consulta al dueño cuando algo excede sus límites:**
   - `request_approval`, para descuentos, crédito o entrega. Al dueño le llega el caso por Telegram con precio neto y total verificados, sus límites, stock, crédito, el motivo, la recomendación del agente y el último mensaje del cliente. Tiene tres botones: **Aprobar X**, **Rechazar** y **Otro valor**; con "Otro valor" responde con el número.
   - `consult_owner`, para cualquier otro caso. El dueño responde el mensaje con texto libre.
   - Si la reescritura tampoco sirve, el agente consulta al dueño automáticamente y le dice al cliente: "Déjame confirmarlo con mi gerente y te escribo en unos minutos con la propuesta."
3. **Escribe al cliente sin esperar a que vuelva.** En cuanto el dueño decide o responde, el agente envía un mensaje nuevo que empieza con "ya lo consulté". Incluye la oferta verificada y pide confirmación explícita. Al dueño le llega por Telegram el texto exacto que se envió.

La indicación del dueño orienta al agente, pero no pasa por encima de la política. Precio, descuento, crédito, entrega y pedido siguen validándose con las mismas herramientas: un 15% se rechaza y se le explica el motivo al dueño. El panel `/aprobaciones` sigue funcionando igual. Sin Telegram configurado, todo queda en el panel.

## Seguridad

- **Webhook** (`/api/webhooks/telegram`): exige el encabezado `X-Telegram-Bot-Api-Secret-Token` con el secreto registrado, comparado en tiempo constante. Sin configuración responde 503. Responde 200 de inmediato y procesa después con `after()`.
- **Vinculación:** solo con `/start` y **Compartir mi número**. Se acepta únicamente el contacto propio (`contact.user_id === from.id`) cuyo número coincida con `TELEGRAM_OWNER_PHONE`. Una tarjeta de contacto reenviada o escrita a mano no vincula.
- **Quién puede decidir:** botones y respuestas solo se aceptan desde el chat vinculado. Los demás chats no reciben respuesta.
- **Botones viejos:** cada botón lleva el valor que mostraba. Si la solicitud cambió, no se aprueba.
- **Actualizaciones repetidas:** cada `update_id` se aplica una sola vez.
- **Registro sin migración:** los vínculos entre mensajes de Telegram y casos se guardan en `audit_log`, sin tocar el esquema de la base. `decided_by` queda como "Dueño (Telegram)".

## Puesta en marcha

1. En Telegram, **@BotFather → /newbot** con un bot nuevo y dedicado. No reutilizar el bot de n8n: un bot solo admite un webhook.
2. En EasyPanel (`agente-comercial-demo-fase2`), definir `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (valor aleatorio) y `TELEGRAM_OWNER_PHONE=+50764597107`, y desplegar.
3. Registrar el webhook con `setWebhook`: `url=<dominio>/api/webhooks/telegram`, `secret_token=<TELEGRAM_WEBHOOK_SECRET>`, `allowed_updates=["message","callback_query"]`.
4. El dueño abre el bot, envía `/start` y pulsa **Compartir mi número**.

## Evidencia

- `tests/owner-telegram.test.ts` usa el runtime real, un modelo simulado, Telegram simulado y PostgreSQL/WASM. Cubre:
  - el caso real: con la reescritura se envía la oferta verificada y nunca "Déjame validar";
  - la escalada: pregunta al dueño, su respuesta y el mensaje automático "Ya lo consulté…";
  - aprobar el 8% con un botón, que genera el mensaje automático con $17.02 y $3,404.00 sin crear pedido;
  - que una solicitud repetida no se notifique dos veces;
  - "Otro valor" con 7 se aprueba y con 15 se rechaza con explicación;
  - botones viejos, chats ajenos y actualizaciones duplicadas;
  - la vinculación, que un contacto ajeno o un número incorrecto no logran;
  - el uso sin Telegram, solo con el panel.
- `src/lib/agent/owner-messages.test.ts` cubre el formato, los datos de los botones y la lectura de números y teléfonos. `route.test.ts` cubre el secreto y la configuración.
- Pruebas de mutación: sin el aviso al dueño fallan 3 pruebas; sin la reescritura en el mismo turno falla 1.

## Limitaciones

- **Ventana de 24 h de WhatsApp:** si el dueño tarda más de 24 horas desde el último mensaje del cliente, WhatsApp en modo Meta solo admite plantillas aprobadas. El mensaje de "ya lo consulté" fallaría y quedaría auditado. Hace falta registrar una plantilla, por ejemplo `resultado_consulta`.
- **Recordatorios al dueño:** si el dueño no responde, no se le recuerda automáticamente. Requiere un planificador.
- **Modelo real:** la calidad de la reescritura y de los mensajes al cliente depende del modelo y todavía no se probó con el modelo real.
