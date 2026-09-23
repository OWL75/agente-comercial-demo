# Fase 2 — manejo de objeciones y cierre

Base: `fase-2-demo-repetible` @ `3fb130f` (punto de rollback). Rama: `fase-2-objection-handling`.

## Diagnóstico antes del cambio

El prompt solo decía que el agente podía decidir "cómo manejar objeciones". El código ya protegía bien los límites duros (descuentos, crédito, stock, opt-out), pero no existía un proceso comercial ni controles sobre cuándo se puede crear un pedido o insistir.

| # | Situación | Antes | Brecha |
|---|---|---|---|
| 1 | "No estamos interesados" | Sin regla | Nada limitaba la insistencia. No se distinguía un rechazo firme de uno blando, y la secuencia de seguimientos enviaba 4 mensajes igual. |
| 2 | "Ya compramos con otro proveedor" | Guarda el competidor | Nada pedía descubrir el motivo del cambio ni prohibía desacreditar al competidor. |
| 3 | "El otro tiene mejor precio" | Reglas de herramienta | Nada impedía ofrecer descuento en la primera objeción. La regla "si es denied, ofrece como máximo el límite autorizable" empujaba hacia el máximo. |
| 4 | "La última entrega llegó tarde" | Sin regla | Podía aceptar la falla como un hecho o prometer que no volvería a pasar sin verificar la entrega. |
| 5 | "No confío en que puedan cumplir" | Sin regla | Nada prohibía inventar garantías, testimonios o compensaciones. |
| 6 | "Tengo suficiente inventario" | Sin regla | No se pedía una fecha. El modelo no sabía la fecha de hoy y `proximaFecha` era texto libre sobre una columna `date`: "el próximo mes" hacía fallar todo el guardado, incluidos los demás campos. |
| 7 | "No tengo presupuesto" | Aumento de crédito → aprobación | Nada pedía revisar el crédito vigente ni prohibía prometer una ampliación. |
| 8 | "Tengo que consultarlo con mi jefe" | Sin regla | No se identificaba quién decide, qué necesita ni cuándo retomar. |
| 9 | "Déjame pensarlo" | Sin regla | Nada indicaba que no es una confirmación. |
| 10 | "Escríbeme el próximo mes" | Sin regla | La fecha no se podía guardar de forma fiable y la secuencia de seguimientos la ignoraba (+4 h después). |
| 11 | Descuento dentro de política | Cubierto por la herramienta y el prompt | Podía conceder el 5% aunque bastara con menos. |
| 12 | Descuento que requiere aprobación | Cubierto por código | — |
| 13 | Opt-out | Cubierto por código (persistente y con supresión) | — |

Brechas transversales:

- `create_sandbox_order` podía ejecutarse en turnos que el cliente no inició: la apertura, un seguimiento automático o la reanudación tras una aprobación humana.
- La confirmación dependía únicamente de la interpretación del modelo.
- No había reglas sobre señales de compra ni sobre cómo resumir la oferta antes del cierre.
- El escenario 1 del QA en vivo solo comprobaba que la respuesta tuviera un "?".

## Cambios

| Archivo | Cambio |
|---|---|
| `src/lib/agent/sales-playbook.ts` | Playbook: proceso interno de 8 pasos, estilo WhatsApp, negociación, tratamiento por tipo de objeción, seguimiento, señales de compra y cierre, significado de cada etapa. Tipos de objeción y códigos de resultado estructurados. |
| `src/lib/agent/system-prompt.ts` | El prompt sale de `runtime.ts` a un módulo puro y comprobable. Incorpora el playbook y la fecha de hoy (America/Panama). Se eliminaron las reglas duplicadas y se retiró la regla que empujaba al máximo autorizable. |
| `src/lib/agent/order-guard.ts` | Bloqueo determinista: el pedido solo se crea en un turno iniciado por un mensaje del cliente, y nunca si ese mensaje expresa duda ("lo voy a pensar", "suena bien, déjame revisar", "te confirmo mañana") o niega ("todavía no"). |
| `src/lib/agent/tools.ts`, `runtime.ts` | El contexto de cada herramienta incluye el disparador del turno y el mensaje del cliente. `create_sandbox_order` aplica el bloqueo. Después de una aprobación humana, el agente pide la confirmación final. |
| `src/lib/policy/insight-patch.ts`, `src/lib/tools/customer.ts` | `proximaFecha` debe ser AAAA-MM-DD real. `resultado` usa códigos (`seguimiento_acordado`, `rechazo_firme`, …). `cantidad` debe ser mayor que 0 y `precioObjetivo` no puede ser negativo. Un valor inválido se descarta y se informa al modelo, sin perder los demás campos. |
| `src/lib/agent/follow-up.ts` | La secuencia de seguimientos se detiene ante `rechazo_firme` y espera hasta la `proxima_fecha` acordada. |
| `src/lib/qa/*` | Evaluadores por efectos, recolector de trazas por turno y definición de los 10 escenarios, compartidos por el QA en vivo y las pruebas. |
| `scripts/qa-scenarios.ts` | El escenario 1 ya no depende de un "?". Se añadieron los 10 escenarios de objeciones y se imprimen todas las respuestas para revisión humana. |
| `tests/fixtures/demo-schema.sql` | `created_at` en `audit_log`/`messages` para ordenar por turno. Incluye los CHECK de producción de `stage` y `customer_insights`. |

No se modificó: webhook de WhatsApp, cliente/formato del canal, motor de políticas, validación de pedidos, aprobaciones, descuentos, crédito, variables de entorno, Dockerfile, migraciones ni ERP. Los pedidos siguen siendo sandbox.

## Evidencia

`tests/objection-scenarios.test.ts` sustituye al modelo por un guion y hace pasar cada turno por el **runtime real**, el registro de herramientas, el motor de políticas y SQL en PostgreSQL/WASM. Los mismos evaluadores del QA en vivo juzgan los efectos:

- Escenario principal: pedido de 50 × CAP-001 a $18.50 con 4% (neto $17.76 ≥ objetivo $17.75), total $888.00, 24 horas, 30 días, sin aprobaciones. Etapas: discovery → objection_handling → negotiating → closing → closed. El pedido solo aparece tras el sexto mensaje.
- Trazas malas que deben fallar: descuento en el primer turno, pedido tras el mensaje condicional del turno 5, conceder el 5% máximo y pedir una aprobación innecesaria.
- Los 9 escenarios adicionales, con variantes negativas: descuento para adelantar compra, aumento de crédito no pedido, fecha de seguimiento no autorizada.
- Bloqueos probados en el runtime: pedido rechazado ante "Déjame pensarlo", ante "Suena bien, déjame revisarlo…", en un seguimiento automático y en la reanudación tras aprobar el 8%. Después, el cliente confirma y se crea el pedido (total 3404).
- Pruebas de mutación manuales: al desactivar el bloqueo de pedidos fallan 4 pruebas; al desactivar la pausa de seguimientos fallan 2.

## Limitaciones

- **El QA con modelo real no se ha ejecutado**: no existe una base QA aislada (`QA_DATABASE_URL`). Las pruebas deterministas demuestran la infraestructura, los bloqueos y los evaluadores, no el criterio del modelo. Hasta ejecutar `npm run qa:scenarios` contra una base aislada no hay evidencia de que el modelo siga el playbook.
- Las reglas de estilo (una pregunta por mensaje, no discutir, no desacreditar, no inventar garantías) solo están en el prompt. Ningún evaluador lee la redacción: el QA imprime las respuestas para revisarlas manualmente.
- El bloqueo de confirmación usa patrones en español y solo bloquea. Una aceptación condicionada sin palabras de duda ("si pueden entregar en 24 h, probamos") no se bloquea: depende del modelo, y el evaluador del escenario principal la detecta.
- No hay etapa "seguimiento" ni "perdida" para la conversación: producción restringe `conversations.stage` con un CHECK de 6 valores y añadirla requiere una migración. El resultado queda en `customer_insights.resultado`.
- Cotizaciones versionadas, inbox/outbox y los demás pendientes de `docs/FASE_2.md` siguen abiertos.
