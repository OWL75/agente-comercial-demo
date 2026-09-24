# Seguimientos contextuales

Base: `fase-2-objection-fixes` @ `0bf22f9` (desplegado y punto de rollback). Rama: `fase-2-followup-context`.

## Qué pasó en la conversación real

Distribuidora Belleza del Istmo, 2026-09-24, 02:48–02:57 UTC, modo `WHATSAPP_TEMPLATE_MODE=simulate`:

1. Apertura por plantilla: "¿cómo van de inventario esta semana? ¿Cambió algo en la demanda o necesitan reponer pronto?"
2. Cliente: "Por ahora no estamos interesados. Ya estamos comprando con otro proveedor."
3. Agente: preguntó qué influyó más en el cambio. Correcto.
4. Cliente: "nos mejoraron el precio y además la última entrega de ustedes llegó tarde."
5. Agente: "¿qué tendría que demostrar Nova para que consideraran compararnos nuevamente?" Correcto.
6. Seguimiento 1, un minuto después: "Hola Distribuidora Belleza del Istmo, retomo mi mensaje sobre Shampoo Professional 1L. ¿Están cubiertos por ahora o prevén reponer pronto?"

El seguimiento ignoró todo lo conversado. Habló como si el cliente no hubiera respondido y volvió a preguntar por la necesidad, que ya había explicado.

## Causas

- En modo `simulate`, `conversationNeedsTemplate` devolvía siempre `true`: todos los seguimientos eran plantillas fijas, aun con la ventana de 24 h abierta, donde producción permite texto libre.
- La plantilla se elegía solo por número de paso (1 → `seguimiento_recordatorio`), sin mirar lo conversado.
- Cuando el agente sí redactaba el seguimiento, recibía una instrucción genérica por paso, sin un resumen del caso. Si incluía un precio sin oferta verificada, la guarda comercial lo reemplazaba por "Déjame validar precio…", que se habría enviado como seguimiento.

## Cambios

- `src/lib/agent/follow-up-context.ts`, que se puede probar sin base de datos:
  - reúne lo último que dijo el cliente, la pregunta pendiente, los seguimientos ya enviados y lo que ya se sabe (proveedor, motivo, objeción, producto, cantidad…);
  - fija un enfoque por paso y por tipo de objeción (cumplimiento, precio, autoridad, necesidad, presupuesto);
  - revisa el borrador de forma determinista;
  - elige la plantilla adecuada cuando la ventana está cerrada.
- La revisión del borrador rechaza siete fallos:
  - un borrador vacío;
  - repetir un mensaje o una pregunta anterior;
  - volver a presentarse;
  - hablar como si el cliente no hubiera respondido;
  - volver a preguntar por la necesidad ya explicada;
  - preguntar un dato ya conocido;
  - reprochar la falta de respuesta.
- `runtime.ts`: el seguimiento recibe ese resumen. Si el borrador falla la revisión o trae cifras sin oferta verificada, se reescribe una vez con los motivos. Si vuelve a fallar, no se envía nada y queda auditado. En seguimientos nunca se usa el texto de respaldo comercial.
- `template-outreach.ts`: en `simulate`, las aperturas siguen usando plantilla. Un seguimiento usa plantilla solo si el cliente no escribió en las últimas 24 h.
- La plantilla se elige según el contexto:
  - nunca `seguimiento_recordatorio` a un cliente que ya respondió;
  - `seguimiento_valor` primero si la objeción es de precio y no se conoce el volumen, y después `seguimiento_angulo`;
  - nunca una plantilla repetida;
  - si ninguna encaja, el toque se omite y queda auditado.
- Las instrucciones de los cuatro pasos pasan a ser intenciones (retomar el hilo, aportar valor, cambiar de ángulo, cerrar el ciclo). El detalle lo pone el resumen de cada conversación.

No se modificaron los cuerpos de las plantillas de Meta, porque cambiarlos exige una nueva aprobación.

## Evidencia

- `src/lib/agent/follow-up-context.test.ts` usa la transcripción real. El seguimiento enviado se marca como `ignores_customer_reply` y `reopens_answered_need`, y un seguimiento que retoma la entrega tardía pasa sin problemas.
- `tests/objection-scenarios.test.ts` reproduce la conversación sobre el runtime real con un modelo simulado y PostgreSQL/WASM:
  - con la ventana abierta, el agente redacta con el resumen y el borrador genérico se reescribe;
  - si la reescritura sigue siendo genérica, no se envía;
  - un precio no verificado se reescribe, sin enviar "Déjame validar";
  - con la ventana cerrada se envía `seguimiento_valor`, y si falta el precio, `seguimiento_angulo`;
  - si ninguna plantilla encaja, se omite el toque.
- Pruebas de mutación: con la ventana de demo siempre en plantilla fallan 5 pruebas; sin la revisión del borrador fallan 3.

## Limitaciones

- La calidad del texto sigue dependiendo del modelo. La revisión determinista bloquea errores conocidos, no garantiza un mensaje excelente. Hay que revisar seguimientos reales con el modelo en vivo.
- Las plantillas aprobadas son genéricas por diseño. Una plantilla con una variable de contexto (por ejemplo, "sobre lo que me comentaste de {{2}}") mejoraría el seguimiento con la ventana cerrada, pero requiere registrarla y que Meta la apruebe.
- El botón de la demo envía el siguiente toque de inmediato. En producción, los tiempos serían los de cada paso (+4 h, +2 días, …).

> Actualización (plantillas v2): la secuencia pasó a 3 toques (+2 días hábiles, +7, +14) y se eliminó `seguimiento_recordatorio`. Ver `docs/PLANTILLAS_META.md`.
