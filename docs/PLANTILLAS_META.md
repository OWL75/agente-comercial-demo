# Plantillas de WhatsApp: conversaciones sin botones

El catálogo que usa la aplicación vive en `src/lib/channel/whatsapp-templates.ts`. Las siete plantillas son de categoría **Marketing** y solo tienen cuerpo de texto. Los nombres, cuerpos y variables de esta guía deben coincidir exactamente con las versiones que se registren en WhatsApp Manager. Si el texto cambia después de aprobarse, hay que editar o registrar una nueva plantilla y esperar la aprobación de Meta.

## Qué se investigó y qué se decidió

- Meta admite plantillas con únicamente un componente `BODY`, sin `BUTTONS`. El ejemplo de una plantilla aprobada con solo cuerpo aparece en su [colección oficial de API](https://www.postman.com/meta/whatsapp-business-platform/request/f7o759z/fetch-message-templates).
- Fuera de la ventana de 24 horas se necesita una plantilla aprobada; dentro de ella se puede usar un mensaje de texto. La [política de WhatsApp Business](https://business.whatsapp.com/policy/preview?lang=es_LA) también exige consentimiento para contactar al usuario y atender las solicitudes de dejar de recibir mensajes.
- WhatsApp limita la exposición a mensajes de marketing considerando, entre otras cosas, frecuencia e interacciones. Lo explica su [centro de ayuda](https://faq.whatsapp.com/263784176043634/). Por eso la secuencia termina si hay respuesta, solicitud de baja o cierre del ciclo.
- Eliminar botones puede hacer que el mensaje parezca más personal, pero **no hay evidencia de que por sí solo aumente la tasa de respuesta**. La hipótesis debe medirse con respuestas reales, respuestas útiles, bloqueos y bajas. Las preguntas y textos de abajo son propuestas editoriales para probar, no una promesa de conversión.

El primer contacto identifica a Nova Distribution, usa un dato pertinente y termina en una pregunta concreta. Los seguimientos cambian de enfoque: estado de inventario, información útil, posible objeción y cierre. No se inventan promociones, descuentos, reservas ni urgencias. Precio y disponibilidad se leen del catálogo actual; si faltan, se usa otra plantilla.

Para prospectos que todavía no tienen relación ni consentimiento, es preferible crear una entrada iniciada por ellos: enlace o código QR de WhatsApp en la web y materiales comerciales, o [anuncios de Facebook e Instagram que abren el chat](https://whatsappbusiness.com/products/ads-that-click-to-whatsapp/). El prospecto decide escribir y el agente puede responder dentro de la ventana de servicio. Esta vía complementa, pero no reemplaza, las plantillas para reactivar contactos con consentimiento fuera de esa ventana.

## Modo demo y producción

- `WHATSAPP_TEMPLATE_MODE=simulate`: el sistema usa el texto exacto del catálogo, sin botones, en todas las aperturas y seguimientos. Se envía como mensaje de texto por WhatsApp Cloud API. El teléfono demo debe haber escrito al número del agente en las últimas 24 horas, ya que esta simulación no abre una excepción en Meta. Para repetir la demo: reiniciar el escenario, enviar `Hola` desde el teléfono demo y después iniciar la conversación.
- `WHATSAPP_TEMPLATE_MODE=meta`: dentro de la ventana de 24 horas el agente puede responder libremente; fuera de ella se envía la plantilla aprobada que corresponda. Activarlo solo cuando las plantillas de esta versión estén aprobadas con estos nombres, idioma y cuerpos.
- Las respuestas llegan como texto libre para que el agente interprete la necesidad. Solicitudes explícitas como “No me escriban más” o “STOP” registran la baja sin una respuesta adicional. El webhook también acepta respuestas a botones de versiones anteriores que todavía pudieran llegar.

## Catálogo para registrar en WhatsApp Manager

Todas las plantillas: categoría **Marketing**, idioma **Español (`es`)**, sin encabezado, pie de página ni botones. En la creación hay que proporcionar los ejemplos de variables indicados. El nombre del cliente hoy corresponde a la empresa; si existe el nombre de la persona de contacto, conviene usarlo tras verificar su calidad.

### `apertura_recompra`

Para recompra atrasada o reducción de frecuencia. Variables: `{{1}}` cliente (`Distribuidora Belleza del Istmo`); `{{2}}` producto habitual (`Shampoo Professional 1L`).

```text
Hola {{1}}, te escribo de Nova Distribution por {{2}}. Como solemos coordinar su reposición, quería saber cómo van de inventario esta semana. ¿Cambió algo en la demanda o necesitan reponer pronto?
```

### `apertura_reactivacion`

Para inactividad, caída del ticket y casos sin un producto y fecha confiables. Variables: `{{1}}` cliente (`Distribuidora Belleza del Istmo`); `{{2}}` producto habitual (`Shampoo Professional 1L`).

```text
Hola {{1}}, te escribo de Nova Distribution. Hace un tiempo no coordinamos un pedido de {{2}}. ¿Siguen trabajando con ese producto o cambió la necesidad?
```

### `apertura_producto`

Para un cliente que parece comparar con la competencia, solo si hay stock y precio vigentes. Variables: `{{1}}` cliente (`Distribuidora Belleza del Istmo`); `{{2}}` producto (`Shampoo Professional 1L`); `{{3}}` precio por unidad (`$18.50`).

```text
Hola {{1}}, te escribo de Nova Distribution. Tenemos {{2}} a {{3}} por unidad. Si estás comparando opciones para tu próximo pedido, ¿qué cantidad tienes en mente?
```

### `seguimiento_recordatorio`

Primer seguimiento. Variables: `{{1}}` cliente (`Distribuidora Belleza del Istmo`); `{{2}}` producto (`Shampoo Professional 1L`).

```text
Hola {{1}}, retomo mi mensaje sobre {{2}}. ¿Están cubiertos por ahora o prevén reponer pronto?
```

### `seguimiento_valor`

Segundo seguimiento, solo con stock y precio vigentes. Variables: `{{1}}` cliente (`Distribuidora Belleza del Istmo`); `{{2}}` producto (`Shampoo Professional 1L`); `{{3}}` precio por unidad (`$18.50`).

```text
Hola {{1}}, revisé {{2}} y hoy tenemos disponibilidad a {{3}} por unidad. Si estás comparando opciones, dime qué cantidad manejas y te paso una propuesta concreta.
```

### `seguimiento_angulo`

Tercer seguimiento. Variables: `{{1}}` cliente (`Distribuidora Belleza del Istmo`); `{{2}}` producto (`Shampoo Professional 1L`).

```text
Hola {{1}}, si algo de {{2}} no encaja todavía, puedo revisar precio, volumen o entrega contigo. ¿Qué tendría que mejorar para que te sirva?
```

### `seguimiento_cierre`

Cuarto y último seguimiento. Variables: `{{1}}` cliente (`Distribuidora Belleza del Istmo`); `{{2}}` producto (`Shampoo Professional 1L`).

```text
Hola {{1}}, cierro por ahora el tema de {{2}} para no insistir. Si más adelante necesitas reposición o una cotización, responde a este chat y lo retomamos. Gracias.
```

## Medición antes de escalar

Comparar por segmento (recompra atrasada, reactivación, competencia) la proporción de mensajes entregados que obtienen una respuesta en siete días, y separar respuestas útiles de “ahora no” o solicitudes de baja. Vigilar calidad de plantilla, bloqueos y reportes. Probar una sola diferencia de redacción a la vez, con grupos comparables, antes de afirmar que la variante sin botones funciona mejor. Si una pregunta produce respuestas pobres, ajustar esa plantilla en el catálogo y volver a aprobarla en Meta.
