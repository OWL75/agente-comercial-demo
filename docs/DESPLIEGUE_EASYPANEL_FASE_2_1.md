# Despliegue de Fase 2.1 en EasyPanel

Servicio objetivo:

- Proyecto: `flujos_sistecomp`
- Servicio: `agente-comercial-demo-fase2`
- Repositorio: `OWL75/agente-comercial-demo`
- Rama: `fase-2-demo-repetible`
- Puerto: `3000`

## Variables que deben existir

Conservar las variables actuales y añadir estas seis:

```text
WHATSAPP_ACCESS_TOKEN=<token permanente o temporal de Meta>
WHATSAPP_PHONE_NUMBER_ID=<phone number id de Meta>
WHATSAPP_VERIFY_TOKEN=<valor privado elegido para validar el webhook>
WHATSAPP_APP_SECRET=<App Secret de la app de Meta>
WHATSAPP_API_VERSION=v26.0
DEMO_WHATSAPP_RECIPIENT=<teléfono demo en formato E.164, por ejemplo +50766123456>
```

No imprimir, copiar a logs ni incluir en informes los valores de token, secreto o conexión a base de datos.

## Webhook en Meta

- Callback URL: `https://flujos-sistecomp-agente-comercial-demo-fase2.0cv53d.easypanel.host/api/webhooks/whatsapp`
- Verify token: el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
- Suscripción: campo `messages`.

## Publicar el código y desplegarlo

La rama debe existir en GitHub antes de seleccionarla en EasyPanel. Si se entrega el archivo
`agente-comercial-demo-fase2.1.patch`, aplicarlo sobre `master`, validar y publicar la nueva rama:

```bash
git switch master
git pull --ff-only
git switch -c fase-2-demo-repetible
git apply --3way agente-comercial-demo-fase2.1.patch
npm ci
npm test
npm run typecheck
npm run lint
npm run build
git add .
git commit -m "Add phase 2 controls and reusable live demo workflow"
git push -u origin fase-2-demo-repetible
```

## Prompt para el Codex conectado a GitHub y EasyPanel

```text
Te adjunto `agente-comercial-demo-fase2.1.patch`. Trabaja sobre el repositorio
`OWL75/agente-comercial-demo`, el proyecto EasyPanel `flujos_sistecomp` y el servicio
`agente-comercial-demo-fase2`.

1. Crea desde `master` la rama `fase-2-demo-repetible`, aplica el patch con `git apply
   --3way`, ejecuta npm ci, npm test, npm run typecheck, npm run lint y npm run build.
   Si todo pasa, haz commit y push de esa rama. No hagas push a master.
2. Haz una revisión de solo lectura del servicio y confirma la fuente Git,
   el dominio principal, el puerto 3000 y las variables existentes, sin mostrar valores
   secretos.
3. Cambia la rama de despliegue del repositorio `OWL75/agente-comercial-demo` a
   `fase-2-demo-repetible`.
4. Conserva todas las variables actuales. Verifica por nombre, sin revelar valores, que
   estén presentes: DATABASE_URL, OPENAI_API_KEY, OPENAI_MODEL,
   DEMO_ACCESS_PASSWORD y NEXT_PUBLIC_SITE_URL.
5. Añade o verifica por nombre estas variables: WHATSAPP_ACCESS_TOKEN,
   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET,
   WHATSAPP_API_VERSION=v26.0 y DEMO_WHATSAPP_RECIPIENT. Si falta el valor de una
   variable secreta, detente y pídemelo; no inventes valores.
6. Despliega el servicio con su Dockerfile y espera a que quede Running con una réplica.
7. Revisa logs sin exponer secretos. Confirma que Next.js inició en 0.0.0.0:3000 y que
   no hay errores de base de datos, OpenAI, Meta ni variables faltantes.
8. Abre `/demo` y confirma que carga el panel “Preparar demostración”. No pulses
   todavía “Crear/Reiniciar demostración”, porque esa acción reconstruye datos del
   escenario demo.
9. Entrega un informe final de solo estado: rama/commit desplegado, réplica, URL,
   variables presentes solo por nombre, resultado de `/demo` y cualquier error.

No modifiques Supabase, no cambies el servicio anterior, no borres volúmenes y no
muestres valores secretos.
```

## Prueba funcional después del despliegue

1. El teléfono configurado en `DEMO_WHATSAPP_RECIPIENT` escribe primero al número del agente.
2. Abrir `/demo` y comprobar que los cuatro indicadores estén listos.
3. Pulsar **Crear/Reiniciar demostración**.
4. En la ficha de Distribuidora Belleza del Istmo, pulsar **Iniciar conversación**.
5. Confirmar que el mensaje aparece en la vista web y llega al WhatsApp real.
6. Responder desde WhatsApp y confirmar que la respuesta aparece en la conversación web.

La primera comunicación real fuera de la ventana de 24 horas requiere una plantilla aprobada por Meta. Este flujo abre primero la ventana para acelerar demos y reuniones.
