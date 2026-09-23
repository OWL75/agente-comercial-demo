# Fase 2 — corrección de oferta, aprobaciones y cierre

Base desplegada y rollback: `fase-2-objection-handling` @ `9141b899a0598fd3cc1bd16a07d022ef593f4a19`.
Rama de la corrección: `fase-2-objection-fixes`.

## Diagnóstico de la conversación real

Conversación de `Empresa Demo`: 2026-09-23 13:35:40–13:40:50 (America/Panama).
Estado final observado antes de los cambios: `awaiting_approval`; aprobación `delivery` pendiente para
CAP-001, 50 unidades y 24 horas; no se creó pedido.

Cronología resumida de mensajes y herramientas:

1. 13:36:21, el cliente indicó que compraba con otro proveedor. El agente guardó el insight, pasó a
   `objection_handling` y preguntó por el motivo.
2. 13:36:42, el cliente mencionó mejor precio y una entrega anterior tardía. El agente actualizó el
   insight y mantuvo `objection_handling`.
3. 13:37:27, el cliente informó 50 unidades mensuales, referencia de $17.75 y entrega al día siguiente.
   Se consultaron historial, entrega sin SKU (`requires_approval`), crédito, precio oficial ($18.50),
   inventario (820), producto, descuento 4.054054% y se creó una aprobación de entrega. Aun así, el
   agente presentó $17.75 como oferta propia y mostró un total de $887.50.
4. 13:38:21, ante la preocupación por otro atraso, se consultaron inventario, precio y entrega con SKU.
   Esta segunda consulta clasificó 24 horas como `auto_approve`, contradiciendo la aprobación pendiente.
   El agente corrigió el precio oficial a $18.50, pero presentó 24 horas como disponible.
5. 13:39:15, al considerar caro el precio, hubo un intento fallido de consultar por nombre en lugar de
   SKU. Luego se consultaron precio, inventario, entrega, crédito y descuento 4.06%. El agente ofreció
   $17.75, 4.06% y total $887.45; las tres cifras no siguen una única regla de redondeo.
6. 13:39:55, el cliente respondió condicionalmente que “podríamos probar” si la entrega era realmente de
   24 horas. Tras varios intentos de herramienta con el nombre en vez del SKU, el agente consultó los
   datos correctos, pasó a `closing`, afirmó que la entrega estaba confirmada y pidió confirmación final.
7. 13:40:36, el cliente confirmó las 50 unidades. Solo entonces el agente volvió a consultar entrega sin
   SKU, reutilizó la aprobación pendiente y dejó la conversación en `awaiting_approval`. No creó pedido.

## Causas raíz

- Las herramientas parciales devolvían hechos independientes, pero no existía una cotización atómica ni
  una guarda sobre el texto final. El modelo podía convertir la referencia del competidor en oferta propia.
- `get_delivery_options` admite SKU opcional. Sin SKU asumía `express_eligible=false`; con CAP-001 devolvía
  elegibilidad automática. El runtime no impedía hablar como si una aprobación pendiente ya estuviera resuelta.
- La política permite porcentajes decimales y el modelo calculó 4.054054% para alcanzar $17.75. No había
  una regla única entre porcentaje, precio unitario visible y total.
- La guarda de pedidos solo detectaba algunas negaciones o dudas: no exigía una expresión positiva de
  confirmación. Por eso frases neutrales podían atravesarla.
- Las transiciones de etapa permitían volver de `awaiting_approval` a `closing` con una aprobación abierta.

## Decisiones y controles determinísticos

- `prepare_verified_offer` reúne precio, descuento, precio neto, cantidad, subtotal, total, inventario,
  crédito, entrega, versión de política y aprobaciones. Solo `status=ready` admite una oferta firme.
- `get_delivery_options` ahora exige un SKU y `request_approval` reevalúa la condición contra producto y
  política; una entrega o descuento autónomo ya no puede producir una aprobación innecesaria.
- Una aprobación pendiente bloquea la oferta final, `closing` y la creación del pedido.
- El pedido exige una oferta `ready` previamente presentada y auditada, coincidente en SKU, cantidad,
  descuento y entrega, además de una confirmación posterior explícita del cliente.
- La respuesta generada se valida antes de persistirse o enviarse. Se bloquean importes no verificados,
  cifras que no coinciden con la oferta, promesas de entrega pendientes, cierres prematuros y garantías
  inventadas. El fallback no contiene una oferta.
- Decisión comercial para la demo: descuentos expresados en porcentajes enteros naturales. Si un porcentaje
  menor alcanza la referencia con tolerancia de un centavo, el máximo autónomo se rechaza.
- Regla monetaria única: redondear el precio unitario neto al centavo y multiplicar por la cantidad. Para
  $18.50, 4% y 50 unidades: $17.76 por unidad y $888.00 total.
- No se modificó la fila global de política comercial ni datos de otros clientes.

## Repetición manual

1. Abrir `/demo` en el servicio `agente-comercial-demo-fase2`.
2. Pulsar **Crear/Reiniciar demostración** una sola vez. La rutina valida los IDs reservados y reconstruye
   exclusivamente `Empresa Demo`, incluyendo su historial, conversaciones, aprobaciones y pedidos demo.
3. Abrir la oportunidad de `Empresa Demo` e iniciar la conversación.
4. Repetir los mensajes del escenario principal. No usar `npm run qa:scenarios` contra producción.
5. Si aparece una aprobación, decidirla en la interfaz. Verificar que el agente presenta entonces la oferta
   completa y solicita una confirmación nueva; responder explícitamente para permitir el pedido.
