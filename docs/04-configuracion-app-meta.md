# Kavea — Configuración de la app de Meta

**1 de agosto de 2026 · Gabriel Montiel Toro — Boosty Digital**

> Estado verificado contra el App Dashboard y contra la Graph API real, con un token de system user
> de producción. Lo que sigue son hechos medidos el 1 de agosto de 2026, no documentación.
> Complementa a `02-conexion-instagram-facebook.md`, donde están las decisiones de arquitectura.

---

## 0. Acción de seguridad, primero

El token de system user `Admin_Boosty` se compartió en texto plano en una conversación. Es un token
que **no expira** (`expires_at: 0`) y que da acceso de `ads_management` sobre las campañas de 28
clientes.

- [ ] **Rotarlo hoy.** Business Settings → Users → System Users → Admin_Boosty → Generate New Token.
- [ ] Revisar en Business Settings → Security Center si hay accesos que no reconozcas.

Nada del resto de este documento depende de conservar ese token concreto.

---

## 1. Lo que ya está resuelto

| Activo | Estado | Consecuencia |
|---|---|---|
| **Business portfolio** | Boosty Digital LLC, ID `2167414613399354` | Titular correcto |
| **Business Verification** | **Verified** ✓ | El trámite más lento ya está hecho |
| Domicilio de la entidad | Estados Unidos (LLC) | Cierra la decisión bloqueante nº1 de `02` §14.1 |
| **28 Páginas de clientes** | Asignadas al Business Manager de Boosty | Ver §2. Es el activo más valioso del proyecto |
| **27 cuentas de Instagram** | Vinculadas a esas Páginas | Ver §2 |

**Todo esto vive en el business portfolio, no en la app.** Es el hecho que gobierna la decisión de
§4: una app nueva bajo Boosty Digital LLC hereda la verificación *y* el acceso a los 28 activos sin
hacer nada.

---

## 2. El activo real: 28 Páginas ya conectadas

Medido con `GET /me/accounts` sobre el system user `Admin_Boosty` (`user_id 122292490028210499`).

**28 Páginas accesibles. 27 con cuenta de Instagram Business vinculada.**

Zzone · Platinium Insurance · Eficienzia.ai · Caracas Music Hall · Odreman y Asociados · Guds App ·
Centromarca Mercedes · Seguros LAM · Veterinaria La Trinidad · Cusica Fest · Emergencia Veterinaria
San Roman · Emergencia Veterinaria Chuo · Supercines · Cauchos y Accesorios Toño Wheels · Ferreteras
La Casa · Ecovet Veterinaria · Oftalmologia Veterinaria · Adaptoheal USA · Perfect by Dr. Orsini ·
Redes y Computación · Boosty.digital · Distribuidora Alondra Santiago · Spatium Coworking · Gabriel
Montiel Toro · Pocholin Baby · CusicaVzla · Clidair

### 2.1 Lo que se probó y funciona

| Prueba | Resultado |
|---|---|
| El system user emite **Page Access Token** para páginas de clientes | ✅ Funciona. Token de 207 caracteres |
| El token **no expira** | ✅ `expires_at: 0` y `data_access_expires_at: 0` |
| Descubrimiento de la cuenta de IG por Página | ✅ `instagram_business_account` devuelve el ID en 27 de 28 |
| Tarea `MESSAGING` sobre las Páginas | ✅ Presente en 27 de 28 |

**La capa de acceso a activos ya está construida.** Para estos 28 clientes no hace falta un flujo de
OAuth por cliente: sus Páginas ya están asignadas al Business Manager de Boosty con la tarea de
mensajería concedida.

### 2.2 Lo que falta y por qué falla ahora

El system user tiene estos scopes: `pages_show_list`, `pages_read_engagement`, `instagram_basic`,
`business_management`, `catalog_management`, `ads_management`, `ads_read`, `instagram_manage_insights`,
`instagram_content_publish`, `public_profile`.

Kavea necesita cuatro que **no están**:

```
pages_messaging            ← enviar y recibir en Messenger
instagram_manage_messages  ← la bandeja de Instagram
pages_manage_metadata      ← suscribir los webhooks
pages_read_user_content    ← dependencia de instagram_basic
```

La llamada de suscripción de webhooks falla hoy con el error exacto que lo confirma:

```
POST /1790677317841377/subscribed_apps
(#200) Requires pages_manage_metadata permission to manage the object
```

No es un problema de acceso al activo. Es un permiso que falta en la app.

### 2.3 Dos excepciones a corregir en el Business Manager

- **Caracas Music Hall** (`971299372734869`) — tasks solo `ANALYZE` y `ADVERTISE`. Sin `MESSAGING`
  ni `MODERATE`. No puede ser tenant de Kavea hasta ampliarle los permisos de activo.
- **Platinium Insurance** (`582923088240803`, con espacio final) — sin Instagram vinculado, y hay
  una segunda Página con el mismo nombre (`1137243006129632`) que sí lo tiene. Parece duplicada.
  Decidir cuál es la buena antes del onboarding.

### 2.4 Hallazgos que corrigen la documentación oficial

1. **El enum real de `tasks`** es `ADVERTISE`, `ANALYZE`, `CREATE_CONTENT`, `MESSAGING`, `MODERATE`,
   `MANAGE`, `MANAGE_LEADS`, `VIEW_MONETIZATION_INSIGHTS`. La tarea `MESSAGE` que documenta la página
   de send-message **no existe**. Corregido en `02` §4.
2. **`/subscribed_apps` no acepta el token de system user.** Devuelve error 190 subcode 2069032:
   *"En la nueva experiencia para páginas, se necesita un token de acceso a la página"*. Hay que
   derivar el Page Access Token primero. Es un paso obligatorio del onboarding, no un detalle.
3. **Los tokens de system user efectivamente no expiran.** Confirmado con `debug_token` sobre un
   token real, no con documentación.

---

## 3. Diagnóstico de Manus 2.0 (App ID `1264199078398889`)

### 3.1 Está en producción. No se toca

Maneja las campañas de todos los clientes en Ads Manager. El token de system user en uso tiene
`ads_management` y `ads_read` sobre 28 activos. Repurposarla significa cambiarle nombre, categoría,
icono, permisos y versión de API a una app que sostiene la operación de pauta de la agencia.

Eso zanja la discusión. **No se adapta.**

### 3.2 Lo que además la descartaba

- **App Review: "Not submitted".** Nunca se envió nada. No hay Advanced Access que heredar.
- Los tres permisos de mensajería que Kavea necesita **ni siquiera están en la cola** de solicitudes.
- La cola mezcla scopes de las **dos vías de Instagram**: `instagram_basic` (vía elegida) junto a
  `instagram_business_basic` e `instagram_business_content_publish` (vía descartada). Una app usa una
  o la otra, nunca las dos.
- **Basic settings: "Currently ineligible for submission"**, faltan icono 1024×1024 y categoría.
- **Terms of Service URL** y **User data deletion URL** apuntan a `https://www.facebook.com/`.
  Marcadores de posición. Rechazo automático en revisión.
- **Upgrade API version en `v25.0`**. Y quedarse ahí no protege: las retiradas de protocolo de v26.0
  aplican a todas las versiones soportadas el 27-oct-2026.
- **Require app secret desactivado.**
- Los cinco avisos del Alert Inbox son todos de Marketing API. Ninguno es advertencia de política.

Nota de nomenclatura, del aviso del 4 de mayo: para el **tier de Marketing API**, Meta renombró
"Standard Access" a **"Limited Access"** y "Advanced Access" a **"Full Access"**. Aplica a ese tier,
no a los niveles de acceso de permisos en general.

---

## 4. La decisión: app nueva, y no se pierde nada

**Crear una app nueva de tipo Business bajo el portfolio de Boosty Digital LLC.**

El argumento que cierra el caso: **el activo valioso no es la app, es el Business Manager.** Las 28
Páginas están asignadas al negocio Boosty Digital LLC, no a Manus 2.0. La Business Verification
también cuelga del negocio. Una app nueva bajo ese mismo negocio, con su propio system user, ve
exactamente las mismas 28 Páginas desde el primer minuto.

Se gana además aislamiento de riesgo: una restricción de Meta sobre la herramienta de ads no tumba
la bandeja de todos los clientes, y al revés.

**System user dedicado.** Crear uno nuevo para Kavea en vez de reutilizar `Admin_Boosty`, para poder
rotar el token de ads sin dejar muda la bandeja. Verificar el cupo: el límite de system users por
negocio depende del nivel de acceso, y con Business Verification completada debería haber margen.

---

## 5. La hipótesis que hay que probar antes que nada

**Los 28 clientes actuales podrían no necesitar App Review.**

El razonamiento: Standard Access permite conceder permisos a usuarios con rol en la app. Un system
user pertenece al negocio dueño de la app. Las 28 Páginas están asignadas a ese mismo negocio con la
tarea `MESSAGING`. Meta exige Advanced Access para servir cuentas *"que no posees ni gestionas"* —
y Boosty gestiona estas.

**No está confirmado y no debe presentarse como hecho.** Pero es barato de probar y, si sale bien,
Kavea puede operar en producción con la cartera actual mientras el App Review corre en paralelo.

### El test, 15 minutos

1. Crear la app nueva y su system user.
2. Añadir `pages_messaging`, `instagram_manage_messages`, `pages_manage_metadata` y
   `pages_read_user_content` al use case, sin pedir review.
3. Generar token del system user con esos scopes.
4. Derivar el Page Access Token de `Boosty.digital` (`1790677317841377`).
5. `POST /1790677317841377/subscribed_apps` con `subscribed_fields`.
   - Si devuelve `{"success":true}` → **la hipótesis se sostiene.**
   - Si devuelve error de permisos → hace falta Advanced Access y el App Review es la ruta crítica.
6. Repetir con la Página de un cliente real, no solo con la propia. La diferencia entre "activo
   propio" y "activo de cliente asignado" es exactamente lo que se está midiendo.

El resultado de este test decide el cronograma del proyecto. Va antes que cualquier línea de código.

---

## 6. Plan de ejecución

### Bloque A — Hoy

- [ ] **A1.** Rotar el token de `Admin_Boosty`.
- [ ] **A2.** Crear la app nueva, tipo **Business**, desde el portfolio de Boosty Digital LLC.
      El tipo no se puede cambiar después.
- [ ] **A3.** Confirmar en Review → Verification que muestra Boosty Digital LLC como **Verified**.
- [ ] **A4.** Crear un system user dedicado a Kavea y asignarle las Páginas.
- [ ] **A5.** **Correr el test de §5.** Decide el cronograma.

### Bloque B — Contenido que bloquea el App Review

- [ ] **B1.** Publicar en `kavea.ai`, accesibles sin geobloqueo y con respuesta 200:
      `/privacidad`, `/terminos`, `/eliminacion-de-datos`. Meta las abre con su rastreador.
- [ ] **B2.** Icono de app a 1024 × 1024. Isotipo sobre fondo sólido; el lockup horizontal no
      funciona en cuadrado.
- [ ] **B3.** Email de contacto coherente con Boosty Digital LLC.

### Bloque C — Ajustes de la app

- [ ] **C1.** Basic: nombre, icono, categoría, las tres URLs de B1, email, `kavea.ai` en App domains.
- [ ] **C2.** Advanced: API version a `v26.0`, activar **Require app secret**, activar 2FA para
      cambios de ajustes, desactivar Social discovery.
- [ ] **C3.** Guardar el App Secret en el gestor de secretos. Nunca en el repositorio.

### Bloque D — Use cases y permisos

- [ ] **D1.** Añadir el use case de Instagram y elegir **"API setup with Facebook login"**.
      **Este paso decide el proyecto entero.** Con Instagram business login, Messenger queda fuera
      para siempre en esta app.
- [ ] **D2.** Añadir el use case de Páginas / Messenger.
- [ ] **D3.** Borrar todo lo que los use cases preseleccionen y Kavea no use. Ni ads, ni catálogo,
      ni publicación de contenido, ni insights.
- [ ] **D4.** Verificar que la solicitud contiene exactamente estos ocho y nada más:
      `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`,
      `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `business_management`.
- [ ] **D5.** Confirmar que **no** aparece ningún `instagram_business_*`.
- [ ] **D6.** Añadir la feature **Human Agent** como ítem aparte, con su propio screencast.

### Bloque E — Facebook Login for Business · solo para clientes futuros

Los 28 actuales no lo necesitan: sus Páginas ya están en el Business Manager. Esto es para
clientes que no estén asignados a Boosty.

- [ ] **E1.** Crear la configuración con el conjunto mínimo de permisos.
- [ ] **E2.** Copiar el `config_id` a variable de entorno.
- [ ] **E3.** Copiar la URL literal del diálogo de autorización desde el dashboard.
      `02` §14.2 la marca *sin confirmar* precisamente porque hay que leerla aquí.
- [ ] **E4.** Registrar el Authorize callback URL.

### Bloque F — Webhooks · requiere código desplegado

- [ ] **F1.** Desplegar el receptor con HTTPS público. **Bloquea todo el bloque.**
- [ ] **F2.** Registrar callback URL y verify token. Meta valida el handshake al guardar.
- [ ] **F3.** Suscribir el objeto `page` y el objeto `instagram`.
- [ ] **F4.** Anotar qué valores acepta de verdad el enum de `subscribed_fields`.
      Cierra varias incógnitas de `02` §14.2 de una sentada.
- [ ] **F5.** Configurar Deauthorize callback y Data deletion callback.

### Bloque G — Trámite

- [ ] **G1.** Lanzar **Access Verification** (Tech Provider). Independiente del App Review, ~5 días.
      Corre en paralelo.
- [ ] **G2.** Ampliar los permisos de activo de **Caracas Music Hall** y resolver el duplicado de
      **Platinium Insurance**.
- [ ] **G3.** Hacer al menos **una llamada real con cada permiso** solicitado, dentro de los 30 días
      previos al envío. Requisito explícito de Meta.
- [ ] **G4.** Grabar los screencasts. Sin audio, 1080p o mejor, monitor a 1440 de ancho o menos,
      cursor agrandado. Una descripción distinta por permiso: copiar y pegar es causa de rechazo.
- [ ] **G5.** Enviar el App Review. Meta declara "menos de una semana, a menudo 2-3 días".
- [ ] **G6.** Congelar icono, categoría, URLs y configuraciones desde el envío hasta la resolución.
