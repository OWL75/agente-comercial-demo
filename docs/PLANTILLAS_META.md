# Plantillas de WhatsApp para Meta

Plantillas que usa el agente comercial para escribir a un cliente fuera de la ventana de 24 horas de WhatsApp. El texto de cada plantilla sale de `src/lib/channel/whatsapp-templates.ts`. Si cambias un texto allí, hay que volver a aprobarlo en Meta.

## Cómo funciona

- **La plantilla abre la puerta; el agente personaliza.** Meta solo acepta plantillas aprobadas cuando el cliente no escribió en las últimas 24 horas. Cada plantilla lleva 2 o 3 variables que el sistema rellena con datos reales: cliente, días sin comprar, producto habitual y precio vigente.
- **Los botones reabren la conversación.** Si el cliente toca "Sí, prepárala", "Tengo dudas" u otro botón, Meta abre una nueva ventana de 24 horas. El agente continúa entonces con texto libre, personalizado según toda la conversación.
- **"No me interesa" es un opt-out.** El sistema lo registra y no vuelve a escribir a ese cliente.
- **En producción, si la ventana está abierta, no se usa plantilla.** Cuando el cliente escribió en las últimas 24 horas, el agente redacta en texto libre. El modo demo descrito abajo fuerza la estrategia de plantillas para poder mostrarla.

### Modo demo

Con `WHATSAPP_TEMPLATE_MODE=simulate`, las aperturas y los cuatro seguimientos usan siempre el texto exacto del catálogo. Si el teléfono demo escribió durante las últimas 24 horas, se entregan como mensajes interactivos con botones de respuesta; así se puede grabar una demostración fiel antes de registrar y pagar las plantillas reales. Si la ventana está cerrada, el mensaje queda visible en el panel, pero no se intenta infringir las reglas del canal.

## Cuándo usa el sistema cada plantilla

| Momento | Situación | Plantilla |
|---|---|---|
| Inicio | Recompra atrasada o reducción de frecuencia | `apertura_recompra` |
| Inicio | Cliente que se fue a la competencia | `apertura_producto`, o `apertura_reactivacion` si no hay stock o precio |
| Inicio | Inactividad, caída del ticket u otro caso | `apertura_reactivacion` |
| Seguimiento 1 | Sin respuesta | `seguimiento_recordatorio` |
| Seguimiento 2 | Sin respuesta | `seguimiento_valor`, o `seguimiento_recordatorio` si no hay stock o precio |
| Seguimiento 3 | Sin respuesta | `seguimiento_angulo` |
| Seguimiento 4 | Sin respuesta | `seguimiento_cierre` |

Si el cliente no tiene historial de compras, la variable del producto dice "tus productos habituales".

## Crear las plantillas en Meta

1. Entra en [WhatsApp Manager](https://business.facebook.com/wa/manage/message-templates/) con la cuenta de WhatsApp **Nova Distribution**, que es la del número del agente.
2. Pulsa **Crear plantilla**, elige la categoría **Marketing** y el tipo **Predeterminado**.
3. Escribe el **nombre** exacto y elige el idioma **Español**.
4. Pega el **cuerpo** tal cual, sin cambiar espacios ni signos.
5. Rellena los **ejemplos de variables**.
6. En **Botones**, añade cada botón como **Respuesta rápida**, con el texto exacto.
7. Envíala a revisión. La aprobación suele tardar entre minutos y 24 horas.

Repite los pasos para las 7 plantillas. Los nombres y textos deben coincidir exactamente: la app envía el nombre y Meta lo busca.

## Activar las plantillas en la app

1. Para la demo, usa `WHATSAPP_TEMPLATE_MODE=simulate`.
2. Cuando **las 7 plantillas** estén aprobadas, cambia a `WHATSAPP_TEMPLATE_MODE=meta` y vuelve a desplegar.
3. El modo `meta` usa texto libre dentro de la ventana y la plantilla aprobada cuando la ventana está cerrada.

## Reglas de Meta que ya cumple el catálogo

- Ninguna plantilla empieza ni termina con una variable, y ninguna tiene dos variables seguidas.
- Cada plantilla tiene al menos 3 palabras por variable, más una.
- Como máximo lleva 3 botones de respuesta rápida, y ninguno pasa de 20 caracteres.
- La app limpia las variables antes de enviarlas: quita saltos de línea, tabuladores y espacios repetidos.

Las pruebas de `whatsapp-templates.test.ts` comprueban estas reglas cada vez que se cambia el catálogo.

## Consideraciones

- **Consentimiento:** solo se puede escribir a clientes que aceptaron recibir mensajes de la empresa. A los prospectos nuevos hay que pedirles primero un opt-in.
- **Frecuencia:** Meta limita cuántas plantillas de marketing recibe una persona. Espacia los seguimientos 2 a 5 días.
- **Costo:** cada plantilla de marketing entregada tiene costo según el país. Los mensajes dentro de una ventana abierta no pagan como plantilla.
- **Nombre del contacto:** hoy `{{1}}` usa el nombre del cliente, que es la empresa. Si más adelante se guarda el nombre de la persona de contacto, conviene usar ese.

## Plantillas

### `apertura_recompra`

**Para qué:** Primer contacto cuando el cliente se atrasó en su recompra habitual.

| Campo en Meta | Valor |
|---|---|
| Nombre | `apertura_recompra` |
| Categoría | Marketing |
| Idioma | Español (`es`) |
| Encabezado | Ninguno |
| Pie de página | Ninguno |

**Cuerpo** (copiar tal cual):

```
Hola {{1}}, te escribe el equipo comercial de Nova Distribution. Vimos que hace {{2}} días no reponen {{3}} y queremos ayudarte a no quedarte sin inventario. ¿Te preparo una propuesta para tu próximo pedido?
```

**Ejemplos de variables** (Meta los pide para revisar):

- `{{1}}` Cliente: `Empresa Demo`
- `{{2}}` Días desde la última compra: `42`
- `{{3}}` Producto habitual: `Shampoo Professional 1L`

**Botones** (tipo *Respuesta rápida*):

- Sí, prepárala
- Ahora no
- No me interesa — registra opt-out automáticamente

### `apertura_reactivacion`

**Para qué:** Primer contacto con un cliente inactivo o cuyo ticket bajó.

| Campo en Meta | Valor |
|---|---|
| Nombre | `apertura_reactivacion` |
| Categoría | Marketing |
| Idioma | Español (`es`) |
| Encabezado | Ninguno |
| Pie de página | Ninguno |

**Cuerpo** (copiar tal cual):

```
Hola {{1}}, te escribe el equipo comercial de Nova Distribution. Hace un tiempo no coincidimos en pedidos de {{2}} y nos gustaría saber cómo podemos ayudarte hoy. ¿Conversamos un momento?
```

**Ejemplos de variables** (Meta los pide para revisar):

- `{{1}}` Cliente: `Empresa Demo`
- `{{2}}` Producto habitual: `Shampoo Professional 1L`

**Botones** (tipo *Respuesta rápida*):

- Sí, conversemos
- Ahora no
- No me interesa — registra opt-out automáticamente

### `apertura_producto`

**Para qué:** Primer contacto con un cliente que se fue a la competencia: abre con el precio real del producto.

| Campo en Meta | Valor |
|---|---|
| Nombre | `apertura_producto` |
| Categoría | Marketing |
| Idioma | Español (`es`) |
| Encabezado | Ninguno |
| Pie de página | Ninguno |

**Cuerpo** (copiar tal cual):

```
Hola {{1}}, te escribe el equipo comercial de Nova Distribution. Hoy tenemos {{2}} disponible a {{3}} por unidad. ¿Te interesa que te arme una cotización para tu próximo pedido?
```

**Ejemplos de variables** (Meta los pide para revisar):

- `{{1}}` Cliente: `Empresa Demo`
- `{{2}}` Producto habitual: `Shampoo Professional 1L`
- `{{3}}` Precio unitario vigente: `$18.50`

**Botones** (tipo *Respuesta rápida*):

- Me interesa
- Ahora no
- No me interesa — registra opt-out automáticamente

### `seguimiento_recordatorio`

**Para qué:** Seguimiento 1: recordatorio ligero con una pregunta fácil de responder.

| Campo en Meta | Valor |
|---|---|
| Nombre | `seguimiento_recordatorio` |
| Categoría | Marketing |
| Idioma | Español (`es`) |
| Encabezado | Ninguno |
| Pie de página | Ninguno |

**Cuerpo** (copiar tal cual):

```
Hola {{1}}, solo quería retomar lo que te comenté sobre {{2}}. ¿Te preparo la cantidad habitual para tu próximo pedido?
```

**Ejemplos de variables** (Meta los pide para revisar):

- `{{1}}` Cliente: `Empresa Demo`
- `{{2}}` Producto habitual: `Shampoo Professional 1L`

**Botones** (tipo *Respuesta rápida*):

- Sí, prepárala
- Ahora no
- No me interesa — registra opt-out automáticamente

### `seguimiento_valor`

**Para qué:** Seguimiento 2: aporta valor con precio y disponibilidad reales.

| Campo en Meta | Valor |
|---|---|
| Nombre | `seguimiento_valor` |
| Categoría | Marketing |
| Idioma | Español (`es`) |
| Encabezado | Ninguno |
| Pie de página | Ninguno |

**Cuerpo** (copiar tal cual):

```
Hola {{1}}, te confirmo que hoy tenemos {{2}} disponible a {{3}} por unidad. Si te sirve, te lo dejo apartado. ¿Lo reservamos?
```

**Ejemplos de variables** (Meta los pide para revisar):

- `{{1}}` Cliente: `Empresa Demo`
- `{{2}}` Producto habitual: `Shampoo Professional 1L`
- `{{3}}` Precio unitario vigente: `$18.50`

**Botones** (tipo *Respuesta rápida*):

- Sí, resérvalo
- Tengo dudas
- Ahora no

### `seguimiento_angulo`

**Para qué:** Seguimiento 3: cambia de ángulo hacia la objeción probable.

| Campo en Meta | Valor |
|---|---|
| Nombre | `seguimiento_angulo` |
| Categoría | Marketing |
| Idioma | Español (`es`) |
| Encabezado | Ninguno |
| Pie de página | Ninguno |

**Cuerpo** (copiar tal cual):

```
Hola {{1}}, entiendo que quizá no era el mejor momento. Si el tema es precio, volumen o forma de pago de {{2}}, podemos revisar opciones contigo. ¿Lo vemos juntos?
```

**Ejemplos de variables** (Meta los pide para revisar):

- `{{1}}` Cliente: `Empresa Demo`
- `{{2}}` Producto habitual: `Shampoo Professional 1L`

**Botones** (tipo *Respuesta rápida*):

- Revisemos opciones
- Ahora no
- No me interesa — registra opt-out automáticamente

### `seguimiento_cierre`

**Para qué:** Seguimiento 4: despedida respetuosa que cierra el ciclo.

| Campo en Meta | Valor |
|---|---|
| Nombre | `seguimiento_cierre` |
| Categoría | Marketing |
| Idioma | Español (`es`) |
| Encabezado | Ninguno |
| Pie de página | Ninguno |

**Cuerpo** (copiar tal cual):

```
Hola {{1}}, no quiero llenarte el chat, así que este es mi último mensaje sobre {{2}}. Cuando necesites reponer, respóndeme aquí y te atiendo de inmediato. ¡Gracias por tu tiempo!
```

**Ejemplos de variables** (Meta los pide para revisar):

- `{{1}}` Cliente: `Empresa Demo`
- `{{2}}` Producto habitual: `Shampoo Professional 1L`

**Botones** (tipo *Respuesta rápida*):

- Retomemos ahora
