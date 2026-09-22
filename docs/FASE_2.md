# Fase 2 — bloque 1: controles comerciales y de acceso

Base revisada: `c6aa31b`. Rama local: `fase-2-controles`.
Estado: código de aplicación local con pruebas, **no desplegado**. La migración de guardas de base de datos sí fue aplicada y verificada en Supabase productivo el 22 de septiembre de 2026.

## Implementado

- Memoria incremental: los campos omitidos o nulos no borran los anteriores. `optOut=false` no revoca una exclusión; no se expone al agente una operación de reactivación.
- Supresión por cliente: una exclusión de cualquier conversación bloquea nuevos contactos, llamadas posteriores del agente, nuevos pedidos y nuevas solicitudes de excepción. Se vuelve a comprobar antes del envío. No se envía despedida después del opt-out.
- Pedido sandbox transaccional: bloquea la conversación, valida identidad, cierre previo y pedido existente; agrupa SKU repetidos antes de comprobar stock; lee precios actuales, política, crédito y aprobaciones; valida plazo y entrega; redondea importes en centavos; registra pedido, líneas, cierre y auditoría en la misma transacción.
- Las aprobaciones de descuento/crédito/entrega solo se consumen cuando coinciden SKU, cantidad, precio y versión de política. Un descuento requiere porcentaje exacto. Se considera la solicitud más reciente de cada tipo, sin rescatar una autorización anterior a un rechazo.
- Solicitudes de aprobación: valores obligatorios por tipo, rechazo de descuentos fuera de política y serialización de solicitudes pendientes por conversación.
- Decisiones humanas: validación de límites en servidor y actualización condicional de una solicitud aún pendiente con los mismos datos. Evita que dos decisiones concurrentes sobrescriban la primera. El aprobador sigue siendo el rol compartido de demo, no una identidad personal.
- Consultas de aprobaciones restringidas a la conversación del agente.
- Inicio de conversación serializado por oportunidad. No abre oportunidades ya cerradas/perdidas.
- El modelo no puede marcar una venta cerrada sin pedido ni reabrir una conversación terminada.
- Mutaciones del panel verifican sesión en servidor y UUID; el proxy/login fallan cerrado sin contraseña en producción. Redirecciones poslogin limitadas a rutas internas conocidas.
- Webhook: secreto y número destino obligatorios, firma requerida, validación estructural del payload y del número receptor. Entrada deduplicada con `ON CONFLICT DO NOTHING` sobre las restricciones existentes.
- QA con modelo real exige base de pruebas separada y autorización explícita por variable, y deshabilita envíos WhatsApp.
- Flujo de CI preparado en `.github/workflows/quality.yml`: instalación reproducible, lint, tipos, pruebas y build, sin secretos ni despliegue. Aún no se ha ejecutado en GitHub.

## Cambios de contrato y compatibilidad

- `create_sandbox_order`: usa `deliveryHours` entero, no `deliveryOption` libre. `creditTerms` debe coincidir exactamente con `payment_terms` del cliente.
- Una aprobación antigua sin `context.policyVersion` no es consumible: solicitar una nueva aprobación. **No editar aprobaciones históricas para hacerlas válidas.**
- Excepciones de varios productos y cambios de plazo de pago quedan bloqueados hasta disponer de cotizaciones versionadas; no se interpretan textos libres como autorización.
- Sin secreto/número WhatsApp configurado el webhook devuelve 503 incluso en local. Sin contraseña el panel devuelve 503 en producción.
- El fixture `tests/fixtures/demo-schema.sql` es deliberadamente mínimo y se dedujo de las consultas del repositorio. **No es un dump ni una migración y nunca debe aplicarse a producción.**

## Verificación

Ejecutar `npm ci`, `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`.

Resultado local del bloque 1: **96 pruebas pasando**, TypeScript, ESLint y build correctos; `npm audit` sin vulnerabilidades conocidas. Esto no certifica producción ni sustituye la validación de staging.

Las pruebas SQL ejecutan las funciones de negocio con PostgreSQL/WASM en memoria, mediante un adaptador de pruebas para la superficie de consultas de postgres.js. Cubren pedido completo, intento repetido, rollback si falla una línea, stock agregado, crédito/entrega, alcance de aprobaciones, preservación de memoria y opt-out. No contactan OpenAI, Meta ni Supabase.

Limitaciones de las pruebas: no verifican el driver de red, RLS/permisos reales, pooler, restricciones de producción, comportamiento del modelo ni concurrencia entre varias conexiones. Se deben verificar esos aspectos en staging antes de desplegar. Las 10 pruebas de V1 con LLM son un resultado histórico, no evidencia de esta rama.

## Pendientes que bloquean el piloto real

1. Exportación **solo de esquema**, sin filas ni secretos, de `agente_comercial`, incluidos índices, constraints, triggers, grants y RLS; contrastar con el código y versionar migraciones. No hay una copia autoritativa en este repositorio.
2. Cotización versionada con moneda/impuestos explícitos, expiración, aprobación vinculada a la versión completa y confirmación del cliente de esa misma versión. Hoy la confirmación depende aún de la interpretación del modelo.
3. Inbox/outbox durable, cola por conversación, recuperación tras fallos, seguimiento de envío/entrega y deduplicación de efectos. Hoy un mensaje guardado cuyo procesamiento falla puede quedar sin respuesta; los fallos de envío son solo auditados.
4. Autenticación individual con roles, expiración/revocación de sesiones, limitación de intentos y trazabilidad personal de aprobaciones. La cookie estática de contraseña compartida sigue siendo una limitación de demo. Vincular además la decisión a la versión de la tarjeta que el aprobador vio en pantalla.
5. Supresión dedicada por cliente, reconsentimiento humano verificable y sincronización fuerte con trabajos de envío. Los checks actuales reducen riesgos, pero no cancelan una llamada a Meta ya en curso. La detección de opt-out en lenguaje natural sigue dependiendo del modelo.
6. Reservas/consumo de stock y crédito, bloqueos/índices únicos comprobados en Postgres multiconexión. El sandbox **no reserva ni descuenta** ninguno y no constituye una promesa real de disponibilidad.
7. Plantillas y reglas del canal para iniciar contactos, estados de entrega, actualización del panel en vivo, límites de costo/tiempo y recuperación después de una aprobación cuyo envío falla.
8. Pruebas adversariales y de concurrencia en staging, luego piloto interno acotado. No habilitar ERP real desde esta rama.

## Influencia de las guías de Supabase/Postgres

Se mantienen las consultas en servidor y se usan transacciones cortas, sin llamadas a OpenAI/Meta dentro de ellas. Se documenta el orden de bloqueo y no se amplían permisos, ni se expone el esquema por la Data API, ni se agregan funciones privilegiadas. El aislamiento productivo no se puede certificar sin revisar el esquema/grants reales.

## Auditoría Supabase en vivo (solo lectura)

Proyecto revisado: `zrbcvtovizwaawvyvgiw` (`Sistecomp Base de Datos`), PostgreSQL 17.6. Estado observado: `ACTIVE_HEALTHY`.

- Las 13 tablas de `agente_comercial` tienen RLS habilitado y no tienen políticas. El esquema tampoco concede privilegios a `anon` ni `authenticated`; para este backend con conexión directa es un aislamiento intencional, no una exposición incompleta.
- La integridad actual pasó las comprobaciones: no hay pedidos sin líneas ni diferencias de totales, valores monetarios/stock/cantidades inválidos, políticas activas duplicadas, conversaciones abiertas duplicadas, opt-outs duplicados ni aprobaciones pendientes incoherentes.
- La función administrativa `public.rls_auto_enable()` es `SECURITY DEFINER` y era ejecutable por `anon` y `authenticated`. El evento `ensure_rls` puede conservarla, pero su permiso RPC debe revocarse.
- Supabase detectó 16 claves foráneas sin índice dentro de `agente_comercial`. Se aplicaron índices de cobertura y restricciones únicas para cerrar carreras entre procesos.
- En `public.messages` existe un índice exactamente duplicado; no se incluyó su eliminación porque pertenece al agente de soporte, no a este proyecto comercial. También queda pendiente habilitar Leaked Password Protection desde Auth.

La migración aplicada es `supabase/migrations/20260922171624_phase2_database_guards.sql`; coincide con la versión registrada por Supabase. Instaló 20 índices y 9 restricciones, e impide que `rls_auto_enable()` se invoque como RPC por `anon` o `authenticated`. No crea políticas permisivas ni concede acceso por Data API. La verificación posterior confirmó que no existen pedidos sin líneas y que los dos roles públicos carecen de permiso de ejecución sobre la función administrativa.
