# Plantillas de WhatsApp (versión 2)

El catálogo que usa la aplicación está en `src/lib/channel/whatsapp-templates.ts`. Los nombres, cuerpos, variables, botones y pie de esta guía deben coincidir exactamente con los que se registren en WhatsApp Manager. Todavía no se ha enviado ninguna plantilla a aprobación. Si el texto cambia después de aprobarse, hay que editarla o registrarla de nuevo y esperar otra aprobación de Meta.

## Qué cambió respecto de la versión 1 y por qué

La versión 1 era correcta en tono y longitud. Estos son los problemas que se detectaron y lo que se hizo con cada uno:

- **Saludaba a la empresa y no firmaba ninguna persona.** Ahora cada apertura dice "le escribe Abdiel de Nova Distribution" y menciona la empresa dentro de la frase. La personalización con datos reales es la palanca que más sube la tasa de respuesta.
- **Mezclaba tú y ustedes.** Ahora todo va de *usted*, un trato apropiado para B2B en Panamá. Una prueba bloquea formas de tú.
- **No ofrecía manera de darse de baja.** Meta pide instrucciones claras para darse de baja y los bloqueos y reportes pausan la plantilla (3 h, luego 6 h, y a la tercera la desactivan). Ahora todas llevan el pie "Si no desea más mensajes, responda BAJA." y el webhook registra esa palabra como baja.
- **Las preguntas eran abiertas y costaba responderlas.** Ahora cada mensaje hace una sola pregunta con respuesta de sí/no u opciones, y trae botones de respuesta rápida (máximo 3) para contestar con un toque.
- **La secuencia era agresiva.** Tenía apertura y cuatro seguimientos, el primero a las +4 h y sin nada nuevo. Meta limita cuántas plantillas de marketing recibe cada persona (sumando todas las empresas) y, al pasarse, no las entrega (error 131049). Ahora son tres seguimientos a +2 días hábiles, +7 y +14, y cada uno aporta algo distinto. Se eliminó `seguimiento_recordatorio` ("retomo mi mensaje").
- **Datos concretos.** La apertura de recompra dice el último pedido real ("fue de 50 unidades de Shampoo Professional 1L, hace 6 semanas"). El aporte de valor solo se envía si el stock cubre el pedido habitual. Una plantilla nunca sale con un dato que no se pueda respaldar: si falta, se usa la siguiente que encaje.
- **Competencia.** `apertura_producto` ya no empieza con nuestro precio, que es justo lo que llevó al cliente a irse. Ahora ofrece una cotización para comparar, sin compromiso.

La evidencia sobre botones, remitente con nombre y personalización viene de proveedores y practicantes, no de estudios controlados de Meta. Son hipótesis fuertes que conviene medir (ver al final).

## Variantes provisionales

Todavía no se guarda el nombre de la persona de contacto: `customers.name` es la razón social. Mientras tanto, las plantillas saludan con "Hola," y nombran la empresa dentro del mensaje. Cuando exista el nombre del contacto, conviene registrar versiones con "Hola {{nombre}}," y comparar los resultados.

## Modo demo y producción

- `WHATSAPP_TEMPLATE_MODE=simulate`:
  - Aperturas: se usa el texto exacto del catálogo, enviado como mensaje interactivo con sus botones de respuesta rápida y su pie. Esto solo funciona dentro de la ventana de 24 h, así que el teléfono demo debe escribir antes al número del agente.
  - Seguimientos: si el cliente escribió en las últimas 24 horas, los redacta el agente a partir de la conversación. Si no, se usa la plantilla que encaje con lo conversado.
- `WHATSAPP_TEMPLATE_MODE=meta`: fuera de la ventana de 24 h se envía la plantilla aprobada, y los botones de respuesta rápida son estáticos. Solo se debe activar cuando estas plantillas estén aprobadas con estos nombres, idioma, cuerpos y botones.
- **Respuestas del cliente:** un toque de botón llega como texto (el título del botón) y el agente lo interpreta como cualquier respuesta. "BAJA", "STOP", "No me escriban más" y los botones de baja registran el opt-out sin enviar otro mensaje.

## Catálogo para registrar en WhatsApp Manager

Todas las plantillas llevan:
- categoría **Marketing** (Meta reclasifica a Marketing lo que se presente como Utilidad);
- idioma **Español (`es`)**;
- sin encabezado;
- pie: `Si no desea más mensajes, responda BAJA.`;
- botones de tipo **respuesta rápida**.

Opcionalmente se puede añadir el botón nativo de Meta de **baja de marketing** ("Detener promociones"); el webhook ya lo reconoce. En la creación hay que dar los ejemplos de cada variable.

### `apertura_recompra`
Para recompra atrasada o reducción de frecuencia. Variables: `{{1}}` empresa (`Distribuidora Belleza del Istmo`), `{{2}}` cantidad del último pedido (`50`), `{{3}}` producto (`Shampoo Professional 1L`), `{{4}}` semanas desde ese pedido (`6`). Botones: `Sí, prepárelo` · `Ahora no`.

```text
Hola, le escribe Abdiel de Nova Distribution. El último pedido de {{1}} fue de {{2}} unidades de {{3}}, hace {{4}} semanas. ¿Le preparo la misma cantidad para esta semana?
```

### `apertura_reactivacion`
Para inactividad, caída del ticket y cuando no hay un último pedido confiable. Variables: `{{1}}` empresa, `{{2}}` producto habitual. Botones: `Precio` · `Entrega` · `Ya no lo necesito`.

```text
Hola, le escribe Abdiel de Nova Distribution. Hace un tiempo {{1}} no nos pide {{2}} y quisiera saber si algo falló de nuestro lado. ¿Fue por precio, por entrega o ya no lo necesitan?
```

### `apertura_producto`
Para un cliente que parece comprar a la competencia. Variables: `{{1}}` empresa, `{{2}}` producto habitual. Botones: `Sí, cotíceme` · `Ahora no`.

```text
Hola, le escribe Abdiel de Nova Distribution. Si hoy {{1}} compra {{2}} con otro proveedor, con gusto le preparo una cotización para que la compare, sin compromiso. ¿Cuántas unidades mueven al mes?
```

### `seguimiento_valor` (seguimiento 1, +2 días hábiles)
Solo se envía si el stock actual cubre el pedido habitual. Variables: `{{1}}` producto habitual, `{{2}}` cantidad habitual (`50`). Botones: `Sí, cotíceme` · `Ahora no`.

```text
Hola, revisé {{1}} y hoy tenemos disponibilidad para su pedido habitual de {{2}} unidades. ¿Le preparo la cotización para que la tenga a mano?
```

### `seguimiento_angulo` (seguimiento 2, +7 días)
Variable: `{{1}}` producto habitual. Botones: `Precio` · `Entrega` · `Ya estamos cubiertos`.

```text
Hola, no quiero insistir de más. Si algo de {{1}} no les convence, me ayuda saber qué es para ver si lo podemos resolver. ¿Es el precio, la entrega o ya están cubiertos?
```

### `seguimiento_cierre` (seguimiento 3, +14 días)
Variable: `{{1}}` producto habitual. Botones: `Sí, el próximo mes` · `No, gracias`.

```text
Hola, dejo aquí el tema de {{1}} para no llenarle el chat. Si más adelante necesita reponer, respóndame este mensaje y lo retomamos. ¿Prefiere que le escriba el próximo mes?
```

## Qué plantilla se elige

- **Apertura:** depende de la señal detectada. Recompra atrasada o menor frecuencia usan `apertura_recompra`, y si no hay último pedido, `apertura_reactivacion`. Cambio a la competencia usa `apertura_producto`. El resto usa `apertura_reactivacion`.
- **Seguimiento con la ventana de 24 h cerrada:**
  - Si el cliente nunca respondió: `valor`, después `angulo` y al final `cierre`.
  - Si respondió con una objeción de precio: `valor` y luego `angulo`.
  - Con otras objeciones: `angulo` y luego `valor`.
  - Nunca se repite una plantilla. Si ninguna encaja, el toque se omite y queda registrado.

## Pruebas automáticas

`src/lib/channel/whatsapp-templates.test.ts` comprueba:
- reglas de Meta: no empezar ni terminar con variable, no poner variables contiguas, al menos (3 × variables + 1) palabras y un máximo de 1024 caracteres;
- botones y pie: como máximo 3 botones de 20 caracteres y un pie de hasta 60;
- estilo: trato de usted, una sola pregunta, menos de 220 caracteres, firma de Abdiel en las aperturas y el pie de baja reconocido por el webhook.

## Medición antes de escalar

Comparar por segmento (recompra atrasada, reactivación, competencia):
- la proporción de mensajes entregados que reciben respuesta en siete días, separando las respuestas útiles de "ahora no";
- los toques de cada botón;
- las bajas y bloqueos;
- la calificación de calidad de cada plantilla.

Cambiar una sola variable a la vez (por ejemplo, con y sin botones, o con y sin el nombre del asesor) y usar grupos comparables. Hay que vigilar el error 131049 (límite por usuario): si aparece a menudo, conviene espaciar más los toques.

Para prospectos sin relación previa ni consentimiento, es mejor que la conversación la inicien ellos (enlace o código QR de WhatsApp, anuncios que abren el chat). Así el agente responde dentro de la ventana de servicio sin plantillas de marketing.
