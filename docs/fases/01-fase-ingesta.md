# Kavea — Fase 1: Ingesta y receptor de eventos

**Fecha:** 2 de agosto de 2026
**Estado:** plan de ejecución, sin código escrito
**Depende de:** `03-invariantes-meta.md` (normativo), `02-conexion-instagram-facebook.md` §5.1, §6 y §7
(autoritativo en todo lo de Meta; su §5.2 y §5.3 quedan anulados en lo que toca a plataforma),
`06-arquitectura-plataforma.md` (su §1, §1.1 y §2 quedan desactualizados por esta decisión, ver abajo),
`04-configuracion-app-meta.md`
**Corresponde a:** fase 2 del flujo de `02` §5.1, bloque 1 del orden de construcción de `06` §8

> **Nota de revisión. Quinta versión de este plan, y conviene tener el historial delante.**
>
> | Versión | Receptor | Cola | Amortiguador | Crones |
> |---|---|---|---|---|
> | 1ª | Supabase Edge Function | Postgres | ninguno | `pg_cron` + `pg_net` |
> | 2ª | Cloudflare Worker | Cloudflare Queues | R2 por desborde de tamaño | Cron Triggers |
> | 3ª | Netlify Function | Postgres | Netlify Blobs | Scheduled Functions |
> | 4ª | Supabase Edge Function | Postgres | Cloudflare R2 | `pg_cron` + `pg_net` |
> | **5ª, esta** | **Supabase Edge Function** | **Postgres** | **Netlify Blobs** | **`pg_cron` + `pg_net`** |
>
> **Dos proveedores y ninguno más: Supabase y Netlify. Cloudflare sale por completo.**
>
> La segunda versión existía porque `02` §5.3 descartaba explícitamente la primera, con *"Supabase Edge
> Functions → no se despliega ninguna en v1"*. **Esta versión anula `02` §5.2 y §5.3 en todo lo que
> toca a plataforma**, y también deja desactualizados el §1, el §1.1 y la fila de ingesta del §2 de
> `06`, que describen la variante de Netlify Functions. Se dice aquí en vez de contradecirlo en
> silencio, que es el error que ya costó una ronda de correcciones. **`06` hay que actualizarlo; queda
> anotado como deuda de documentación de esta fase, con dueño.**
>
> Conviene ser exacto sobre qué se anula: se anula la conclusión, no el argumento. El argumento de
> `02` §5.3 —si el receptor necesita Postgres para responder 200, una caída larga de la base desuscribe
> cada Página en silencio tras una hora— sigue siendo válido y no está refutado. La decisión asume ese
> riesgo a cambio de menos superficie operativa.
>
> Lo que hace viable la decisión es el **amortiguador de emergencia en Netlify Blobs**, que es lo que
> sustituye a Cloudflare Queues. Va desde el primer despliegue y se prueba dejando Postgres sin
> responder. Léase la tarea 6 antes de formarse una opinión sobre cuánto protege: **solo gana su sitio
> en caídas de más de una hora**, y eso está escrito ahí con precisión.
>
> **Por qué el amortiguador no puede ser Supabase Storage**, que es la respuesta obvia y es la
> equivocada: los metadatos de Storage viven en `storage.buckets` y `storage.objects`, dentro del
> propio Postgres. Si la base no responde, escribir en Storage falla igual. Un amortiguador que
> comparte dominio de fallo con lo que amortigua no amortigua nada. Netlify Blobs vive en el otro
> proveedor y es de verdad independiente.

---

## 1. Objetivo

Que un evento emitido por Meta en cualquiera de los tres canales quede **persistido de forma durable**
con la firma verificada y con un 200 devuelto en menos de cinco segundos, que llegue al normalizador en
segundos y no en minutos, y que Kavea se entere cuando Meta deje de entregar.

La fase termina con un endpoint público, una cola en Postgres consumida con `for update skip locked`,
un amortiguador en Netlify Blobs con su drenaje, un procesador mínimo que deja bitácora legible, la
reconciliación de suscripciones cada 15 minutos y las métricas que permiten afirmar que la ingesta está
viva. No incluye normalización, ni resolución de tenant, ni escritura en `messages`: eso es la fase 2.

### La propiedad que gobierna el diseño

Tras una hora de entregas fallidas Meta manda "Webhooks Disabled" y **desuscribe la app de esa
Página**, con resuscripción manual. No es degradación: es apagado por cliente y en silencio. De ahí
sale la propiedad más cara del sistema, que es que el endpoint devuelva 200 pase lo que pase.

**Aquí está la diferencia con el diseño de Cloudflare, y hay que mirarla de frente.** Con Workers más
Queues, el 200 no dependía de Postgres en absoluto. Ahora depende de que **al menos uno de los dos
almacenes responda**, y el receptor comparte proyecto con la base. La escala de degradación es esta y
es el contrato del receptor:

| Estado | Qué hace el receptor | Respuesta a Meta |
|---|---|---|
| Postgres responde | `insert` en `webhook_events` | **200** |
| Postgres no responde, Blobs sí | vuelca los bytes crudos a Netlify Blobs | **200** |
| No responde ninguno de los dos | nada que persistir | **500**, y el reloj de la hora corriendo |
| **El proyecto de Supabase entero está caído** | **nada: la función tampoco corre** | **nada.** Ver sección 5, pérdida 1 |

Las dos últimas filas son el riesgo aceptado en su forma más concreta, y la cuarta es la que `02` §5.3
temía literalmente. No se disimula con un 200: un 200 sobre un evento que no se guardó lo pierde para
siempre, porque Meta no reintenta un 200. Se devuelve 500 a propósito para que Meta reintente, y se
alerta en el primer caso. Cuando ni siquiera hay función que responda, la única defensa es un vigilante
que viva fuera de Supabase, y eso es la tarea 11.

### Lo que el receptor no hace

- No parsea el JSON. No lee `object`, ni `entry[]`, ni `messaging[]`.
- No resuelve `entry[].id` contra `meta_asset_routes`. El enrutado multi-tenant es fase 2.
- No lee configuración de la base. La única lectura que necesita es el App Secret, que está en un
  secreto de la función, y es uno para toda la app porque solo hay una app de Meta.
- No deduplica eventos de Meta. La idempotencia vive en `unique (organization_id, canal, mid)` de
  `messages`. Un reintento de Meta produce dos filas en `webhook_events` y una sola en `messages`. Eso
  es correcto.
- No descarga media, no llama a Graph API, no llama a Claude.
- **No responde 200 antes de que uno de los dos almacenes haya confirmado la escritura.**
  `EdgeRuntime.waitUntil()` está **prohibido para la persistencia**: confirmar a Meta un evento que
  todavía no está guardado lo pierde. Sí es la forma correcta de mandar una alerta después de haber
  respondido; son dos usos distintos y la diferencia importa.
- **No espera a Postgres sin límite.** El presupuesto de espera es explícito y corto; agotarlo es la
  señal que dispara el camino de Blobs, no un error.

El coste del handler es constante respecto al número de eventos del lote y lineal respecto a los bytes.
Un lote de 1000 `entry[]` cuesta lo mismo que uno de 1.

### Una aclaración sobre media, que no toca a esta fase pero se confunde

Son dos cosas distintas y ninguna de las dos es el amortiguador:

- **Media entrante de Meta: nunca se almacena el binario, solo la URL del CDN.** Es invariante de `03`
  y es causa documentada de rechazo en App Review. Esta fase no descarga media en absoluto.
- **Media saliente: va a Supabase Storage y es de la fase 4.** Fuera del alcance de este documento.

Los objetos del amortiguador son **texto de mensajes**, no media. La invariante de `03` queda intacta.

### Los límites de la plataforma, que aquí sí condicionan el diseño

Verificado el 2 de agosto de 2026:

| Límite de una Supabase Edge Function | Valor |
|---|---|
| Duración total, plan de pago | **400 s** de reloj |
| Duración total, plan gratuito | 150 s de reloj |
| **CPU por petición** | **2 s**, sin contar las operaciones asíncronas |
| Memoria | 256 MB |
| Funciones por proyecto, plan Pro | hasta 500 |

Los 400 s son de reloj, no de cómputo, así que el receptor va sobrado: leer el cuerpo, calcular el
HMAC e insertar caben con enorme margen. **El límite que de verdad manda es el de 2 s de CPU**, porque
es el único que escala con el tamaño del payload: el HMAC y el decodificado son trabajo de CPU real, no
espera de red. Agotarlo termina la invocación y produce un 5xx, que Meta cuenta contra el reloj de la
hora. Junto con los 256 MB de memoria, es lo que fija el guardarraíl `MAX_BYTES`, y por eso el punto 7
del acta lo mide antes de dar el guardarraíl por bueno.

Los 400 s tienen una segunda consecuencia, esta liberadora: **las funciones de trabajo asíncrono no
necesitan trocearse**. La reconciliación de las 28 Páginas tarda unos 25 s en serie y cabe trece veces
en el presupuesto. No hace falta partir el barrido ni delegar en una segunda función.

### Presupuesto de tiempo, escrito como números

| Concepto | Valor | Origen |
|---|---|---|
| Presupuesto de respuesta a Meta | **5 000 ms** | `03`, invariante |
| Techo de reloj de la función | 400 000 ms | plataforma. No es la restricción |
| Techo de CPU de la función | **2 000 ms** | plataforma. Sí es la restricción |
| Timeout de la escritura a Postgres | 1 500 ms | esta fase, a calibrar con la medición 9 |
| Timeout de la escritura a Blobs | 1 500 ms | esta fase |
| Peor caso encadenado, en caliente | ≈ 3 s + HMAC | suma de los dos |

---

## 2. Precondiciones

| # | Precondición | Origen | Cómo se verifica |
|---|---|---|---|
| P1 | App de Meta nueva, tipo Business, bajo el portfolio de Boosty Digital LLC | `04` A2 | El App Dashboard muestra el App ID y `Verified` en Review → Verification |
| P2 | Proyecto de Supabase `sdazqohyjzzylwbkvovx` en **plan de pago** | `00` §5 | Los 400 s de reloj y las extensiones requieren plan de pago |
| P3 | App Secret y verify token como secretos de las funciones, no en el repositorio | `02` §5.4 | `supabase secrets list` los muestra |
| P4 | Sitio de Netlify dedicado al amortiguador, con su `siteID` y un token de acceso personal guardados como secretos de Supabase | esta fase | Una escritura, lectura y borrado de prueba desde la Edge Function funciona |
| P5 | Extensiones `pg_cron` y `pg_net` habilitadas en el proyecto | esta fase | `select * from pg_extension` las lista; `cron.schedule` acepta un job de prueba |
| P6 | `GRAPH_API_VERSION=v26.0` como variable única leída por todos los clientes HTTP | `03` invariantes | Ninguna cadena `graph.facebook.com/v` con versión literal en el repositorio |
| P7 | Tablas `organizations`, `meta_connections`, `meta_asset_routes` y `webhook_events` desplegadas según `02` §7 | `02` §7 | La migración corre limpia en un proyecto vacío |
| P8 | Vigilante externo a Supabase, alojado en Netlify, con su propia salida de correo | esta fase, tarea 11 | Ver nota abajo |
| P9 | Al menos una Página de staging con tarea de mensajería concedida al system user de Kavea | `04` §2 | `GET /me/accounts` la lista con la tarea correcta en `tasks` |
| P10 | Page Access Token derivable para esa Página | `04` §2.4 nº2 | `GET /{page-id}?fields=access_token` devuelve token |
| P11 | Resultado del test de `04` §5 anotado | `04` §5 | Se sabe si `POST /subscribed_apps` funciona con Standard Access o si el App Review es ruta crítica |

**Sobre P4, que tiene más miga de la que parece.** Netlify Blobs se usa normalmente desde dentro del
runtime de Netlify, donde el contexto viene dado. Aquí se usa **desde fuera**, y para eso
`@netlify/blobs` admite dos formas: pasar `siteID` y un token de acceso personal en la llamada a
`getStore`, o inyectar la variable `NETLIFY_BLOBS_CONTEXT`. Se usa la primera, explícita, con el
`siteID` y el token guardados como secretos del proyecto de Supabase.

Tres decisiones que van con eso:

1. **El store cuelga de un sitio de Netlify propio**, no del sitio de la web ni del de la aplicación. Un
   sitio mínimo que no despliega nada y existe solo para poseer el store. El motivo es de dominio de
   fallo y de radio de explosión: nadie que trabaje en la aplicación puede borrar por accidente el
   amortiguador, y transferir o eliminar el sitio de la aplicación no se lleva por delante los eventos
   pendientes de un incidente.
2. **Se usa `getStore`, nunca `getDeployStore`.** Un store por despliegue perdería de vista los objetos
   pendientes en cuanto se publica una versión nueva, que es justo lo que pasa durante un incidente
   cuando alguien despliega el arreglo.
3. **El token es una credencial de larga vida que puede revocarse**, y el camino que la usa casi nunca
   se ejercita. Un token caducado o revocado deja el amortiguador inservible sin ningún síntoma hasta el
   día que hace falta. Por eso el drenaje hace un **canario diario**, tarea 6.

**Sobre la URL del receptor.** El endpoint es
`https://sdazqohyjzzylwbkvovx.supabase.co/functions/v1/meta`, y existe desde el primer minuto, con
certificado emitido y renovado por Supabase. Meta solo pide una URL HTTPS estable, alcanzable y con
certificado válido: no hay ninguna capacidad de Meta que dependa del dominio, ni la firma, ni el
handshake, ni la suscripción por topic, ni los reintentos. **No hay precondición bloqueante de DNS**:
`hooks.kavea.ai` deja de ser necesario para arrancar.

Si más adelante se quiere dominio propio, la vía es el add-on de Custom Domains de Supabase, con un
CNAME desde la zona en Netlify DNS. Su disponibilidad, coste y forma exacta del path están **sin
confirmar** y son el punto 14 del acta. Lo que sí hay que saber antes de tomarlo: cambiar la URL de
callback es un ajuste a nivel de app que afecta a los tres topics a la vez, obliga a rehacer el
handshake y se trata como una ventana de cambio, no como un refactor.

**Sobre P8.** Es nueva y sale directamente del riesgo que esta arquitectura acepta. Si el proyecto de
Supabase se cae entero, no hay receptor, no hay base y no hay nada que pueda avisar desde dentro. El
único aviso posible viene de fuera. Está en la tarea 11 y no es opcional.

**Sobre P11.** Si el test de `04` §5 falla, esta fase se construye y se prueba igual contra la Página
de Boosty en modo desarrollo, pero suscribir Páginas de clientes queda bloqueado hasta el App Review.
Cambia el calendario, no el diseño.

**Consecuencia de `04` C2 (Require app secret).** Con ese ajuste activo, toda llamada a Graph API
necesita `appsecret_proof`. La reconciliación es la primera llamada saliente del proyecto y falla con
400 si se olvida. Está contemplado en la tarea 10.

---

## 3. Entregables

| # | Entregable | Dónde |
|---|---|---|
| E1 | Edge Function receptora, con `verify_jwt = false` fijado en `config.toml` | `supabase/functions/meta/` |
| E2 | Edge Function del procesador de bitácora | `supabase/functions/procesador/` |
| E3 | Edge Function del drenaje del amortiguador, con su canario diario | `supabase/functions/drenaje/` |
| E4 | Edge Function de reconciliación de suscripciones y salud de credenciales | `supabase/functions/reconciliacion/` |
| E5 | Jobs de `pg_cron` con sus llamadas por `pg_net`, y el disparador inmediato | `supabase/migrations/` |
| E6 | Sitio de Netlify dedicado y store de Blobs `ingesta-emergencia` | Netlify |
| E7 | Módulo de alertas: salida por Resend y cortacircuitos sobre Blobs | `supabase/functions/_compartido/alertas.ts` |
| E8 | Migración: cola y bitácora sobre `webhook_events` (`cuerpo_crudo`, `ingesta_id`, `estado`, `ruta`, `duracion_ms`, `drenado_en`) y el RPC de reclamación | `supabase/migrations/` |
| E9 | Migración: tabla `alertas` como espejo para el panel interno | `supabase/migrations/` |
| E10 | Migración: tabla `ingesta_pulso` y vistas de observabilidad | `supabase/migrations/` |
| E11 | Vigilante externo alojado en Netlify, con su propia salida de correo | sitio de Netlify existente |
| E12 | Fixtures de payload firmables, incluida la de unicode escapado | `pruebas/fixtures/` |
| E13 | Script de firma y envío para pruebas manuales | `pruebas/firmar.ts` |
| E14 | Constante de `subscribed_fields` confirmada contra el enum real | secretos + acta |
| E15 | Acta de mediciones empíricas de la fase | `docs/fases/01-mediciones.md` |

E15 no es documentación decorativa. Cierra varios de los `inciertos` de `03`, cierra las dudas que abre
la plataforma y es la entrada de la fase 2.

---

## 4. Tareas

### Tarea 1 — La función receptora: despliegue y qué hay delante del código

La ingesta son cuatro Edge Functions separadas, no una con cuatro responsabilidades. El motivo es el
mismo que en las versiones anteriores de este plan: un despliegue del cron no puede tumbar la ingesta.
Con Edge Functions esa separación es más barata que nunca —el plan Pro admite hasta 500 funciones y
cada una se despliega por separado— pero conviene decir qué protege y qué no: **protege del despliegue
roto y del error humano en la función equivocada; no protege de una incidencia del proyecto**, porque
las cuatro viven dentro del mismo. Eso está en el balance de la sección 5 como pérdida 1.

#### `verify_jwt = false`, y en `config.toml`

Es la trampa número uno de esta plataforma y ya estaba identificada en la primera versión de este plan.
Supabase valida por defecto un JWT en la cabecera `Authorization` **antes de llegar al código**. Meta
no manda ningún bearer token. Con la verificación activa, cada entrega recibe un 401 generado por la
plataforma, el receptor ni se entera, y a la hora hay desuscripción por cliente.

```toml
# supabase/config.toml
[functions.meta]
verify_jwt = false

# Las tres internas mantienen la verificación: las llama pg_net con la clave de servicio.
[functions.procesador]
verify_jwt = true
[functions.drenaje]
verify_jwt = true
[functions.reconciliacion]
verify_jwt = true
```

**Va en `config.toml`, no en la bandera `--no-verify-jwt` del despliegue.** La bandera se olvida: basta
que otra persona, o el pipeline de CI, despliegue sin ella para que la ingesta muera en silencio. En el
fichero es estado declarado y versionado, y una revisión de código lo ve.

Y hay que decir lo que esto implica: **solo `meta` queda sin verificación de JWT, y su única defensa es
el HMAC**. Por eso la tarea 4 no admite atajos y por eso la tarea 13 rechaza sin firma antes de leer el
cuerpo.

#### Qué otras capas hay delante del código

Esta lista sustituye a la de trampas de zona de Cloudflare. Ninguna es teórica: todas rompen la ingesta
de una forma silenciosa.

- **El path exacto.** La función se sirve en `/functions/v1/meta`. La URL registrada en el App
  Dashboard tiene que coincidir carácter a carácter. Un `/meta` suelto no existe.
- **El nombre de la función es parte de la URL.** Renombrar `meta` cambia el endpoint, obliga a rehacer
  el handshake y afecta a los tres topics a la vez. Nombre congelado desde el registro.
- **`Deno.serve` con `Request` estándar.** El handler recibe un `Request` de la Fetch API y
  `await req.arrayBuffer()` da los bytes que llegaron por el socket. No hay parseador de cuerpo
  interpuesto, y no debe haberlo nunca.
- **Los 2 s de CPU.** Superarlos termina la invocación y devuelve un 5xx que Meta cuenta. Es el techo
  que fija `MAX_BYTES`, no un límite de tamaño de petición publicado.
- **El límite de tamaño de petición no está publicado.** Es el punto 7 del acta. Hasta cerrarlo, el
  guardarraíl se fija por debajo de lo que se mida, no por encima.
- **La región de despliegue.** La latencia hasta Meta depende de dónde corra la función. Entra en la
  medición 9 y, si el p95 aprieta, es la primera palanca.

**Criterio de aceptación.** `curl -i https://<ref>.supabase.co/functions/v1/meta` sin cabeceras devuelve
**403 con cuerpo `forbidden`**, generado por la función. **La distinción que importa es entre un 403 de
la función y un 401 de la plataforma con cuerpo JSON del tipo `{"code":401,...}`**: el segundo significa
que `verify_jwt` sigue activo, que la petición no llegó al código y que Meta tampoco llegaría. Cualquier
otra cosa —un 404, un 546 de la plataforma— significa lo mismo. `curl -sv` muestra certificado válido y
ninguna redirección previa. Y una comprobación de repositorio: `config.toml` contiene
`verify_jwt = false` para `meta` y solo para `meta`.

---

### Tarea 2 — Migración: la cola, la bitácora y el RPC de reclamación

`02` §7.6 define `webhook_events` como bitácora. En este diseño esa tabla es **bitácora y cola a la vez**.

#### El cuerpo va en `text`, no en `jsonb`

**`jsonb` normaliza al almacenar: reordena claves, elimina espaciado y desescapa las secuencias
`\uXXXX`.** Meta manda `café` como `café` y firma sobre esa forma. Un cuerpo guardado como `jsonb`
ya no permite recalcular el HMAC ni reproducir el incidente. La columna es `text` y no se convierte, ni
ahora ni después.

```sql
-- El cuerpo crudo va en text. Es la única representación con la que la firma cuadra.
alter table public.webhook_events add column cuerpo_crudo text;
alter table public.webhook_events alter column cuerpo drop not null;

-- Identidad de ingesta: la genera el RECEPTOR antes de intentar escribir, y viaja igual
-- por el camino directo y por el del amortiguador. Es lo que cierra el duplicado del drenaje.
alter table public.webhook_events add column ingesta_id uuid not null;
alter table public.webhook_events add constraint webhook_events_ingesta_id_key unique (ingesta_id);

-- Estado de cola. text con check, nunca enum (06 §4, regla 1).
alter table public.webhook_events add column estado text not null default 'pendiente'
  check (estado in ('pendiente','en_proceso','procesado','cuarentena'));
alter table public.webhook_events add column reclamado_en timestamptz;

-- Traza del camino que siguió el evento y cuánto costó.
alter table public.webhook_events add column ruta        text check (ruta in ('directa','blobs'));
alter table public.webhook_events add column duracion_ms integer;
alter table public.webhook_events add column drenado_en  timestamptz;

create index webhook_events_cola_idx
  on public.webhook_events (recibido_en) where estado = 'pendiente';

comment on column public.webhook_events.cuerpo_crudo is
  'Bytes del cuerpo decodificados como UTF-8, sin parsear. No convertir a jsonb: destruye el escapado unicode y con el la firma.';
comment on column public.webhook_events.ruta is
  'directa = el receptor escribio esta fila. blobs = la escribio el drenaje tras una caida de Postgres; recibido_en es el original y drenado_en el del rescate.';
```

`cuerpo jsonb` se deja nullable y sin uso en fase 1. Si al final de la fase 2 sigue vacía se elimina; es
una decisión que necesita visto bueno explícito porque toca el esquema de `02` §7.6.

#### La reclamación: `for update skip locked` por RPC

```sql
create or replace function private.webhook_events_reclamar(p_limite int)
returns setof public.webhook_events
language sql volatile security definer set search_path = ''
as $$
  update public.webhook_events e
     set estado = 'en_proceso', intentos = e.intentos + 1, reclamado_en = now()
   where e.id in (
     select id from public.webhook_events
      where estado = 'pendiente'
      order by recibido_en
      limit p_limite
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function private.webhook_events_reclamar(int) from public, anon, authenticated;
```

`skip locked` es lo que permite que varias invocaciones concurrentes del procesador convivan sin
procesar dos veces la misma fila. Y hace falta un segador, porque una invocación puede morir con filas
reclamadas: **toda fila en `en_proceso` con `reclamado_en` de hace más de 10 minutos vuelve a
`pendiente`**. Una fila que ha vuelto más de cinco veces pasa a `cuarentena` y genera alerta P1: es el
equivalente de la cola de mensajes muertos que Queues daba hecha, y aquí hay que escribirlo.

#### La columna `firma_ok` deja de discriminar, y se dice en voz alta

`02` §7.6 declara `firma_ok boolean not null`. En este diseño **los cuerpos con firma inválida nunca se
guardan**, ni en Postgres ni en el amortiguador, así que esa columna vale `true` en el cien por cien de
las filas, siempre, por construcción.

**Decisión: la columna se queda y el constraint también.**

```sql
alter table public.webhook_events
  add constraint webhook_events_firma_ok_chk check (firma_ok);
```

Su valor no es informativo, es de contención: es una red que hace fallar en voz alta cualquier cambio
futuro que empiece a persistir cuerpos sin verificar, con independencia de lo que haga el código. Un
`insert` con `firma_ok = false` no llega a la tabla. Y hay un motivo extra para conservarla aquí que no
existía en el diseño de Cloudflare: el receptor escribe directamente en esta tabla, así que el
constraint vuelve a estar **en el camino de ingesta** y no un salto después.

La parte que hay que dejar escrita para que nadie la monte mal: **`firma_ok` no es una señal y no puede
haber ninguna alerta ni ninguna vista construida sobre ella.** `select count(*) from webhook_events
where not firma_ok` devuelve cero siempre, y un cero permanente en un panel se lee como "todo va bien"
cuando en realidad no se está midiendo nada. La señal real de firmas inválidas es el **contador de
respuestas 401** y la alerta P1 sin umbral de la tarea 4. Si alguien quiere un número de firmas
inválidas, sale de `alertas`, no de `webhook_events`.

#### Tabla de alertas

`02` no define una y la invariante de desuscripción exige "alerta interna". Entra aquí como **espejo
para el panel interno**, no como camino primario: el camino primario sale por Resend y no puede depender
de Postgres, porque la alerta que más importa es la que se produce cuando Postgres no está.

```sql
create table public.alertas (
  id              bigserial primary key,
  tipo            text not null,   -- firma_invalida | postgres_caido | ingesta_caida_total
                                   -- | blobs_atascado | canario_fallido | drenaje_fallido
                                   -- | cuarentena | desuscripcion | reconciliacion_fallida
                                   -- | token_invalido | backlog | silencio | vigilante
  severidad       text not null check (severidad in ('p1','p2')),
  organization_id uuid references public.organizations(id) on delete set null,
  detalle         jsonb not null default '{}'::jsonb,
  notificada_en   timestamptz,
  created_at      timestamptz not null default now()
);

create index alertas_pendientes_idx on public.alertas (created_at) where notificada_en is null;
```

`detalle` **nunca** contiene el cuerpo del webhook ni texto de mensajes. Solo metadatos: tamaño,
cabeceras, identificadores, claves de Blobs. Es coherente con el modelo de acceso de `06` §6, donde el
admin ve metadatos y no contenido.

`webhook_events` y `alertas` quedan fuera del alcance de la API y solo las toca el rol de servicio, por
el motivo que da `02` §7.6: un lote puede traer assets de tenants distintos y la fila cruda es anterior
al enrutado.

**Criterio de aceptación.** La migración corre limpia sobre una base con `02` §7 aplicado.
`insert into webhook_events (firma_ok, cuerpo_crudo, ingesta_id) values (false, '{}', gen_random_uuid())`
es rechazado por el constraint. Dos llamadas concurrentes a `webhook_events_reclamar(10)` sobre 20 filas
pendientes devuelven diez filas cada una, sin solape. El segador devuelve a `pendiente` una fila dejada
en `en_proceso` con fecha antigua.

---

### Tarea 3 — Handshake de verificación

Meta valida el endpoint al guardarlo en el App Dashboard y en cada re-guardado. Es un GET con tres
parámetros de consulta. El challenge se devuelve **crudo**: sin comillas, sin envolver en JSON, sin
salto de línea final.

```ts
function handshake(req: Request): Response {
  const p         = new URL(req.url).searchParams;
  const mode      = p.get('hub.mode');
  const token     = p.get('hub.verify_token');
  const challenge = p.get('hub.challenge');

  if (mode === 'subscribe' && token && challenge &&
      iguales(token, Deno.env.get('META_VERIFY_TOKEN')!)) {
    return new Response(challenge, {
      status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response('forbidden', { status: 403 });
}
```

Tres detalles que no son opcionales:

- La comparación de `hub.verify_token` contra el valor configurado es obligatoria. Sin ella cualquiera
  registra su propio endpoint apuntando al de Kavea.
- La comparación va en tiempo constante, con la misma función que la firma. El verify token es un
  secreto de longitud fija y una comparación con salida temprana lo filtra carácter a carácter.
- La URL de callback se registra **sin parámetros de consulta**. Meta añade los suyos.

El handshake no toca Postgres ni Blobs. Sigue funcionando con la base caída, y eso importa: si Meta
revalida el endpoint durante un incidente, no puede fallar por algo que no necesita. Es además lo que
usa el vigilante de la tarea 11.

**Criterio de aceptación.**

```bash
URL=https://<ref>.supabase.co/functions/v1/meta
curl -s "$URL?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=$META_VERIFY_TOKEN" | xxd | tail -2
```

La salida es exactamente `1158201444` y diez bytes, sin `0a` final. Con un token equivocado devuelve
403. Con `hub.mode=unsubscribe` devuelve 403. Con la base caída sigue devolviendo el challenge.

---

### Tarea 4 — Validación de firma sobre el cuerpo crudo

Esta es la tarea que decide si Kavea funciona en Venezuela, República Dominicana y México. **No cambia
con la plataforma**: la Fetch API es la misma en Deno que en un Worker o en Node, y el error posible es
idéntico.

Meta firma el cuerpo con HMAC-SHA256 usando el App Secret y lo entrega en `X-Hub-Signature-256` con el
prefijo literal `sha256=` y hex en minúscula. `X-Hub-Signature` (SHA1) es legacy y no se valida.

**Meta firma sobre una versión del payload con unicode escapado.** Cita oficial: *"we generate the
signature using an escaped unicode version of the payload, with lowercase hex digits. If you just
calculate against the decoded bytes, you will end up with a different signature."* Meta manda `café`
como `café`: seis caracteres ASCII para la `é`. `JSON.parse` los convierte en un carácter real y
`JSON.stringify` de JavaScript no vuelve a escaparlos; además reordena claves y normaliza espaciado. El
cuerpo resultante es otro y el HMAC es otro.

El fallo que produce esto es peor que un fallo limpio: solo aparece cuando el usuario escribe con
tildes, eñes o emoji. Nunca en las pruebas en inglés, siempre en los tres mercados de Kavea.

#### Cómo se obtiene el cuerpo crudo

El handler recibe un `Request` estándar. El cuerpo es un `ReadableStream` que **solo se puede consumir
una vez**:

```ts
Deno.serve(async (req: Request): Promise<Response> => {
  // Primera y única lectura del stream. Los bytes exactos que llegaron por el socket.
  const bytes = new Uint8Array(await req.arrayBuffer());
  // A partir de aquí req.json(), req.text() y req.formData() lanzan.
});
```

- `req.arrayBuffer()` entrega los bytes sin transformar. Es la única fuente admisible para el HMAC.
- `req.text()` también sirve, porque decodifica UTF-8 sin reinterpretar el contenido: las secuencias
  `é` son literales ASCII dentro del JSON y sobreviven al decodificado. Se prefiere
  `arrayBuffer()` porque el HMAC opera sobre bytes y evita una reconversión.
- `req.json()` está prohibido en este handler. No es una recomendación de estilo: es el bug.
- `req.clone()` no hace falta y duplica el cuerpo en memoria, que con 256 MB de techo importa.
- Entre Meta y la función no hay parseador de cuerpo, así que el problema clásico de Express
  (`express.json()` consumiendo el stream antes del handler) no aplica. **El riesgo vuelve el día que el
  receptor se ponga detrás de un dominio propio o de cualquier proxy**: ese día hay que verificar que
  los bytes llegan intactos antes de dar el cambio por hecho.
- Lo que se guarda en Postgres es el **string decodificado**, en una columna `text`, y lo que se guarda
  en Blobs son los **bytes originales**. Las dos representaciones permiten recalcular el HMAC. Lo que
  rompe es `JSON.stringify(JSON.parse(texto))`, que es otra operación y no ocurre en ningún punto de
  este camino.

```ts
// supabase/functions/_compartido/firma.ts
// La CryptoKey se importa una vez por instancia, no una vez por petición.
let claveHmac: Promise<CryptoKey> | null = null;
function clave(appSecret: string): Promise<CryptoKey> {
  claveHmac ??= crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return claveHmac;
}

export async function firmaValida(
  bytes: Uint8Array, cabecera: string, appSecret: string,
): Promise<boolean> {
  const esperado = cabecera.slice('sha256='.length).trim().toLowerCase();
  if (esperado.length !== 64) return false;

  const mac = await crypto.subtle.sign('HMAC', await clave(appSecret), bytes);
  const calculado = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  return iguales(calculado, esperado);
}

// Comparación en tiempo constante. Un === temprano filtra la firma byte a byte.
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

#### Qué se responde ante firma inválida

**401, no 200.** Una petición forjada no es una entrega de Meta y no debe contar como entregada. Pero
hay una consecuencia que obliga a alertar en el primer fallo: si el App Secret se rota o se copia mal,
**todas** las entregas reales fallan aquí y Meta desuscribe en una hora. No hay umbral: la primera
firma inválida genera alerta P1.

El cuerpo de una petición con firma inválida **no se guarda en ningún sitio**: ni fila en
`webhook_events`, ni objeto en Blobs. Es contenido controlado por un tercero no autenticado y meterlo en
la cola lo convierte en entrada del normalizador de fase 2. Se registra una alerta con metadatos y nada
más.

El App Secret sigue viviendo en dos sitios —los secretos de Supabase, para el HMAC, y el runtime de
Next.js en Netlify, para el `appsecret_proof` del onboarding—, así que la rotación coordinada de
`02` §5.4 sigue siendo necesaria y el test de paridad también.

**Criterio de aceptación.** Los casos de la tarea 14 pasan, incluida la fixture con unicode escapado. Y
una prueba de regresión que falla a propósito: un commit que introduzca
`JSON.stringify(JSON.parse(cuerpo))` antes del HMAC debe hacer fallar la suite en la fixture de unicode
y pasar en la fixture ASCII. Si ambas fallan o ambas pasan, la suite no está probando lo que cree.

---

### Tarea 5 — El receptor: Postgres primero, Blobs después, 200 casi siempre

```ts
// supabase/functions/meta/index.ts
import { getStore } from 'npm:@netlify/blobs';
import { firmaValida } from '../_compartido/firma.ts';

// Guarda contra floods. Se fija POR DEBAJO de lo que midan los puntos 7 y 9 del acta:
// un 413 a una entrega legítima cuenta como fallo de entrega.
const MAX_BYTES   = 5 * 1024 * 1024;
const MS_POSTGRES = 1_500;
const MS_BLOBS    = 1_500;

// Store de sitio, con credenciales explícitas porque estamos FUERA del runtime de Netlify,
// y con consistencia fuerte pedida a propósito: la eventual propaga hasta en 60 s.
const amortiguador = () => getStore({
  name:        'ingesta-emergencia',
  siteID:      Deno.env.get('NETLIFY_SITE_ID')!,
  token:       Deno.env.get('NETLIFY_BLOBS_TOKEN')!,
  consistency: 'strong',
});

Deno.serve(async (req: Request): Promise<Response> => {
  const t0 = Date.now();

  if (req.method === 'GET')  return handshake(req);
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const declarado = Number(req.headers.get('content-length') ?? '0');
  if (declarado > MAX_BYTES) return new Response('payload too large', { status: 413 });

  // Se comprueba la forma de la cabecera antes de gastar CPU en el HMAC.
  const cabecera = req.headers.get('x-hub-signature-256');
  if (!cabecera?.startsWith('sha256=')) {
    EdgeRuntime.waitUntil(alertar('firma_invalida', 'p1', { motivo: 'cabecera ausente' }));
    return new Response('missing signature', { status: 401 });
  }

  // Los BYTES, una sola vez, antes de nada. Nunca req.json().
  const bytes = new Uint8Array(await req.arrayBuffer());

  if (!(await firmaValida(bytes, cabecera, Deno.env.get('META_APP_SECRET')!))) {
    EdgeRuntime.waitUntil(alertar('firma_invalida', 'p1', { bytes: bytes.byteLength }));
    return new Response('signature mismatch', { status: 401 });
  }

  // Identidad de ingesta: se genera ANTES de intentar escribir y viaja por los dos caminos.
  const ingestaId   = crypto.randomUUID();
  const recibidoEn  = new Date().toISOString();
  const cuerpoCrudo = new TextDecoder('utf-8').decode(bytes);   // solo para transportar

  // 1. Camino normal: Postgres. El insert dispara el normalizador por trigger (tarea 7).
  try {
    await insertarEvento({
      ingesta_id: ingestaId, recibido_en: recibidoEn, firma_ok: true,
      cuerpo_crudo: cuerpoCrudo, cuerpo_bytes: bytes.byteLength,
      ruta: 'directa', duracion_ms: Date.now() - t0,
    }, MS_POSTGRES);

    return new Response('EVENT_RECEIVED', { status: 200 });
  } catch (ePg) {
    // 2. Amortiguador: Netlify Blobs. Ver tarea 6 para cuándo esto sirve de verdad.
    try {
      await conTimeout(amortiguador().set(claveBlob(recibidoEn, ingestaId), bytes, {
        metadata: {
          ingesta_id: ingestaId, recibido_en: recibidoEn,
          bytes: bytes.byteLength, sha256: await sha256Hex(bytes),
          motivo: String(ePg).slice(0, 200), intentos: 0,
        },
      }), MS_BLOBS);

      EdgeRuntime.waitUntil(alertar('postgres_caido', 'p1', { ingesta_id: ingestaId }));
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (eBlobs) {
      // 3. Los dos almacenes caídos. 500 a propósito: Meta reintenta un 500;
      //    un 200 pierde el evento para siempre.
      EdgeRuntime.waitUntil(alertar('ingesta_caida_total', 'p1', {
        pg: String(ePg).slice(0, 200), blobs: String(eBlobs).slice(0, 200),
      }));
      return new Response('storage unavailable', { status: 500 });
    }
  }
});
```

Notas de diseño:

- **El timeout de Postgres es el disparador del camino de emergencia, no un error.** Sin él, una base
  lenta cuelga la función y se come el presupuesto de Meta antes de haber intentado el amortiguador. Los
  1 500 ms son una hipótesis: se calibran contra el p99 real, con la regla de que el timeout debe estar
  cómodamente por encima del p99 de una base sana y cómodamente por debajo de lo que deja intentar
  Blobs y responder.
- **`EdgeRuntime.waitUntil()` para la alerta, nunca para la persistencia.** La alerta no puede retrasar
  la respuesta; la escritura no puede ocurrir después de ella.
- **Consistencia fuerte, explícita, en la escritura del receptor.** Netlify Blobs es de consistencia
  eventual por defecto, con propagación de hasta 60 s. El drenaje corre cada minuto: con la consistencia
  por defecto podría listar un store que parece vacío justo después de la caída. Se paga con escrituras
  y lecturas más lentas, y ese pago cabe porque este camino solo se recorre durante un incidente.
- **La escritura a Postgres va por PostgREST sobre HTTPS**, con la clave de rol de servicio. La función
  y la base están en el mismo proyecto, así que el salto es corto; también significa que comparten
  dominio de fallo, que es la pérdida 1 de la sección 5.
- **El receptor no invoca al procesador.** De eso se encarga un disparador en la base, tarea 7. El
  receptor sigue haciendo tres cosas: leer, verificar, escribir.
- No hay cabeceras CORS ni manejador de `OPTIONS`. Meta no hace preflight.

**Criterio de aceptación.** Una entrega firmada devuelve 200 con
`curl -o /dev/null -s -w '%{http_code} %{time_total}'` por debajo de 0,5 s en caliente y por debajo de
5,0 s en frío. Aparece exactamente una fila en `webhook_events` con `ruta = 'directa'`. **Con Postgres
sin responder, la respuesta sigue siendo 200 y el evento aparece en Blobs.** Con Postgres y Blobs
caídos, la respuesta es 500 y llega la alerta.

---

### Tarea 6 — El amortiguador en Netlify Blobs

#### Primero, cuánto protege esto de verdad

Antes de describir el diseño hay que fijar la expectativa, porque es fácil leer esta sección como si el
amortiguador fuera una red para el día a día, y no lo es.

**Por debajo de una hora de caída de Postgres, el amortiguador no aporta nada que Meta no aporte ya.**
Si el receptor devolviera 500, Meta reintenta —*"retry immediately, then try a few more times with
decreasing frequency over the next 36 hours"*— y el evento acaba entrando cuando la base vuelve. Los
reintentos de Meta son, de hecho, el primer colchón, y es gratis.

**Pasada la hora es cuando la cosa cambia**, porque Meta manda "Webhooks Disabled" y desuscribe esa
Página. A partir de ahí no hay reintentos que valgan: no llegan eventos nuevos hasta que alguien
resuscribe, y lo que ocurrió durante la ventana se pierde. **Ese es el escenario para el que existe el
amortiguador**, y es el único en el que gana su sitio.

Dos matices para no pasarse de precisión en ninguna dirección:

- La afirmación "por debajo de la hora Meta te cubre" descansa en dos políticas oficiales que Meta no
  reconcilia (`02` §6.6): la de 36 horas de reintentos y la de desuscripción a la hora. **La medición 4
  del acta existe justamente para saber cuál manda.** Hasta cerrarla, la frase anterior es la hipótesis
  de trabajo, no un hecho.
- Aun por debajo de la hora, apoyarse en los reintentos de Meta significa que los mensajes llegan tarde
  y desordenados, y la bandeja va con retraso visible para el cliente. El amortiguador los mete en
  cuanto la base vuelve. Es una mejora de experiencia, no de durabilidad.

**Se mantiene porque la promesa del producto es que no se pierde nada, no porque sea el caso
frecuente.** Escrito así para que nadie lo presente como protección del día a día ni lo recorte pensando
que cubre lo que ya cubren los reintentos.

#### Lo que Blobs es y lo que no

**Blobs no es una cola.** No hay entrega garantizada, ni reintentos, ni cola de mensajes muertos, ni
métrica de profundidad, ni métrica de edad, ni reglas de ciclo de vida. Todo eso se escribe a mano aquí.
Un amortiguador de emergencia mal diseñado es peor que no tenerlo, porque da la sensación de red sin
serlo.

Límites verificados el 2 de agosto de 2026:

| Pieza | Límite |
|---|---|
| Tamaño de objeto | 5 GB |
| Metadata por objeto | 2 KB |
| Longitud de clave | 600 bytes |
| Página de `list()` | 1 000 entradas |
| Consistencia | **eventual por defecto**, hasta 60 s de propagación; **fuerte a petición explícita** |

Los 5 GB por objeto hacen que el problema que dominaba el diseño de Cloudflare —el tope de 128 KB por
mensaje de Queues y el desborde a otro almacén— desaparezca por completo. Un lote de 1000 `entry[]` cabe
sin partirlo.

#### Acceso desde fuera del runtime de Netlify

El receptor es una Edge Function de Supabase, así que no hay contexto de Netlify que heredar. Se pasan
`siteID` y token explícitos, como en el código de la tarea 5. El token es un token de acceso personal
guardado como secreto del proyecto de Supabase, junto al `siteID`. La alternativa admitida es inyectar
`NETLIFY_BLOBS_CONTEXT`; se prefiere la explícita porque es legible en el punto de uso.

Dos consecuencias operativas:

- **El token puede revocarse o rotarse y el camino casi nunca se ejercita.** Un token muerto deja el
  amortiguador inservible sin ningún síntoma hasta el día en que hace falta, que es el peor día
  posible. De ahí el canario.
- **Se usa `getStore`, nunca `getDeployStore`.** Un store por despliegue pierde de vista los objetos
  pendientes en cuanto se publica una versión nueva del sitio, que es justo lo que pasa durante un
  incidente. Está en el criterio de aceptación y en la revisión de código.

#### El canario diario

Una vez al día, el drenaje escribe un objeto de prueba bajo `canario/`, lo lee con consistencia fuerte,
comprueba que el contenido cuadra y lo borra. Si cualquiera de los tres pasos falla, **alerta P1
`canario_fallido`**. Es lo único que convierte "tenemos un amortiguador" en "el amortiguador funciona
hoy". Un camino de emergencia que no se ejercita es un camino que no funciona.

#### Disciplina de claves

```
crudo/<YYYYMMDDTHHMMSSsssZ>-<ingesta_id>
cuarentena/<YYYYMMDDTHHMMSSsssZ>-<ingesta_id>
canario/<YYYYMMDD>
```

Cuatro decisiones dentro de ese formato:

1. **La marca temporal va primero, compacta y ordenable.** Las claves ordenan lexicográficamente igual
   que cronológicamente. Como el orden de `list()` no está documentado como garantizado, **el drenaje
   ordena las claves que recibe antes de procesarlas** en vez de fiarse de la API; con páginas de 1 000
   es barato.
2. **`ingesta_id` va en la clave**, no solo en la metadata. La clave es autocontenida: identifica el
   evento sin abrir el objeto, y ese identificador es el mismo que la columna `unique` de
   `webhook_events`. Son unos 62 bytes de los 600 disponibles.
3. **El prefijo separa los espacios.** `crudo/` es lo pendiente, `cuarentena/` lo que el drenaje no
   consiguió meter en Postgres, `canario/` la prueba de vida. Se listan por separado y disparan cosas
   distintas.
4. **El orden de drenaje es cronológico pero no es una garantía de la que dependa nada.** Meta ya no
   garantiza orden (`02` §6.6) y `03` fija que el orden real se deriva del `timestamp` del evento, en
   milisegundos. El orden del drenaje es una conveniencia, no una propiedad del sistema.

#### Metadata, que es donde vive el estado

Cabe en los 2 KB con holgura y **no contiene contenido de mensajes**:

| Campo | Para qué |
|---|---|
| `ingesta_id` | Clave de deduplicación contra `webhook_events` |
| `recibido_en` | Instante real de la entrega, que es el que va a la fila, no el del rescate |
| `bytes` | Tamaño, para la métrica |
| `sha256` | Integridad: el drenaje comprueba que lo que lee es lo que se escribió |
| `motivo` | Por qué falló Postgres. Truncado |
| `intentos` | Contador de drenajes fallidos. Vive aquí y no en Postgres, porque Postgres puede ser justo lo que no está |

#### El drenaje

Es una Edge Function invocada cada minuto por `pg_cron`. Los 400 s de reloj importan: el drenaje ocurre
justo después de una caída, que es cuando hay más volumen acumulado.

```
1. canario diario, si toca
2. list({ prefix: 'crudo/', paginate: true }) con consistencia fuerte; ordenar las claves
3. para cada objeto:
     a. getWithMetadata → bytes + metadata
     b. comprobar sha256; si no cuadra → mover a cuarentena/ + P1
     c. insert into webhook_events (...) on conflict (ingesta_id) do nothing
          ruta = 'blobs', recibido_en = metadata.recibido_en, drenado_en = now()
     d. si (c) termina sin error (haya insertado o no) → delete(clave)
     e. si (c) falla → intentos++ ; si intentos >= 5 → mover a cuarentena/ + P1
4. caducar lo que lleve más de 7 días bajo cuarentena/
5. escribir la fila de ingesta_pulso
```

Cuatro propiedades de ese bucle:

- **El borrado va después de la confirmación, nunca antes.** Es entrega al-menos-una-vez sobre un
  destino idempotente, que da el efecto de exactamente-una-vez. Al revés se pierden eventos.
- **`on conflict (ingesta_id) do nothing` es lo que cierra el duplicado**, y hay un caso concreto en el
  que ocurre de verdad: el `insert` del receptor commitea en Postgres pero la respuesta se pierde o
  llega después del timeout de 1 500 ms. El receptor concluye que falló y vuelca a Blobs. Sin la clave
  única compartida, ese evento acabaría dos veces en la bitácora y dos veces en la cola del
  normalizador. Con ella, el drenaje ve el conflicto, no inserta, borra el objeto y sigue. **Ese caso
  hay que provocarlo en la prueba, no razonarlo.**
- **La cuarentena es la cola de mensajes muertos escrita a mano.** No se borra sin mirarla. Como
  contiene texto de usuarios finales, caduca a los **7 días** y la incidencia sobrevive como fila en
  `alertas`, con metadatos y sin contenido. **Blobs no tiene reglas de ciclo de vida: esa caducidad es
  el paso 4 del bucle, y si no se escribe no existe.** Es una de las cosas que un almacén de objetos
  gestionado daba hecha y aquí no.
- **La lectura del drenaje también pide consistencia fuerte.** Y hay una duda que se mide, no se supone:
  la documentación describe la opción de consistencia sobre el store y sobre las lecturas individuales,
  pero no afirma explícitamente que `list()` la honre. Es el punto 12 del acta. Mientras no esté
  cerrado, el drenaje **no borra nada basándose solo en un listado**: borra un objeto concreto después
  de haber confirmado su fila en Postgres, que es lo que el bucle hace de todos modos.

#### Vigilancia

- **`crudo/` debería estar vacío casi siempre.** Un objeto ahí de hace más de 15 minutos con Postgres
  sano significa que el drenaje no corre: alerta P1 `blobs_atascado`.
- **La profundidad y la edad de los prefijos se escriben en `ingesta_pulso`** (tarea 12), para que
  existan como serie temporal consultable con SQL. Con la salvedad honesta de que, mientras Postgres
  está caído, esa serie tampoco se escribe: durante el incidente la única señal es el correo.

**Criterio de aceptación.** Con Postgres bloqueado, tres entregas firmadas producen tres objetos bajo
`crudo/`, con las claves ordenadas por hora de llegada y la metadata completa. Al recuperarse la base, la
siguiente pasada las drena, `crudo/` queda vacío y las tres filas tienen `ruta = 'blobs'`, `recibido_en`
el original y `drenado_en` el del rescate. Invocar el drenaje otra vez no crea filas nuevas. Un objeto
con `sha256` manipulado acaba en `cuarentena/` con alerta P1 y no en la bitácora. Un objeto puesto a
mano bajo `cuarentena/` con fecha de hace 8 días desaparece en la siguiente pasada. El canario corre y
un token revocado a propósito produce `canario_fallido` en menos de 24 h. No hay ninguna llamada a
`getDeployStore` en el repositorio.

---

### Tarea 7 — Disparo del procesador y latencia de la bandeja

Con la cola en Postgres, la pregunta que no existía en el diseño de Cloudflare es **cómo se dispara el
consumo**. Un cron de un minuto significa hasta 60 s de retraso para que un mensaje aparezca en la
bandeja, y eso es inaceptable para una bandeja en vivo. La respuesta tiene dos mitades.

#### Disparo inmediato: un disparador en la base, no en el receptor

El `insert` del receptor dispara un trigger **a nivel de sentencia** que encola una petición HTTP con
`pg_net` hacia la Edge Function del procesador.

```sql
create or replace function private.avisar_procesador()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform net.http_post(
    url     := private.config('url_procesador'),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || private.config('clave_servicio')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 1000
  );
  return null;
end;
$$;

-- FOR EACH STATEMENT, no FOR EACH ROW: un aviso por insert, no uno por fila.
create trigger webhook_events_avisar
  after insert on public.webhook_events
  for each statement execute function private.avisar_procesador();
```

Por qué así y no invocando desde el receptor:

- **Cubre también las filas que mete el drenaje**, sin duplicar lógica en dos sitios.
- **No entra en el presupuesto de los 5 s.** `net.http_post` no hace la llamada: la encola en la tabla
  de `pg_net` y un worker de fondo la ejecuta después del commit. Lo que paga el receptor es un `insert`
  más, de microsegundos.
- **Si la transacción hace rollback, no se envía nada**, que es el comportamiento correcto y difícil de
  conseguir desde fuera de la base.
- **A nivel de sentencia**, no de fila: un lote de veinte filas produce un aviso, no veinte.

Dos cosas que hay que vigilar y que son deuda operativa conocida de `pg_net`: el worker se puede
atascar, y las respuestas se acumulan en `net._http_response`, que necesita su TTL configurado y su
barrido. Están en la tabla de riesgos y en el punto 13 del acta.

#### Que no se pisen entre sí

Una ráfaga de webhooks dispara varios procesadores. `for update skip locked` hace que eso sea
**correcto** —ninguna fila se procesa dos veces— pero es derrochador. El procesador toma un
`pg_try_advisory_lock` sobre una clave fija al entrar y, si no lo consigue, sale de inmediato: ya hay
alguien drenando. El que sí lo consigue reclama lotes en bucle hasta vaciar la cola, con 400 s de
presupuesto para hacerlo.

El grado de concurrencia es una perilla, no una constante: el lock puede tener N ranuras
(`pg_try_advisory_lock(clave, ranura)`) y N se fija con el volumen medido. En fase 1, con un tenant en
dogfooding, N = 1 sobra.

#### Red de seguridad: `pg_cron`

Un job cada minuto que no procesa, solo empuja:

```sql
select cron.schedule('latido', '* * * * *', $$
  select private.reaparar_reclamos_vencidos();          -- en_proceso > 10 min → pendiente
  select private.avisar_si_hay_pendientes();            -- net.http_post al procesador
  select private.avisar_drenaje();                      -- net.http_post al drenaje
$$);
```

El drenaje se invoca incondicionalmente: no se puede consultar Blobs desde SQL, y un listado que
devuelve vacío es barato.

**Latencia esperada.** Con el disparador, del `insert` a la fila procesada hay el retardo del worker de
`pg_net` más un salto de red: sub-segundo. El minuto del `pg_cron` es el suelo cuando el disparador
falla, no el comportamiento normal. Esa distinción es la que hay que medir, y es el punto 10 del acta.

**Criterio de aceptación.** Con el job `latido` deshabilitado, una entrega firmada aparece procesada en
menos de 2 s. Con el trigger deshabilitado a propósito, aparece procesada en menos de 70 s. Cien
entregas en ráfaga producen cien filas procesadas exactamente una vez, y en los logs se ve que la
mayoría de los procesadores salieron de inmediato por no obtener el lock.

---

### Tarea 8 — Procesador mínimo de bitácora

El procesador de fase 1 es deliberadamente corto. Reclama, escribe las columnas de traza de `02` §7.6 y
nada más. Es el esqueleto sobre el que crece el normalizador de la fase 2, así que conviene que el
límite quede escrito en el propio código.

```ts
// supabase/functions/procesador/index.ts
Deno.serve(async (): Promise<Response> => {
  if (!(await tomarLock())) return new Response(null, { status: 204 });  // ya hay alguien

  for (;;) {
    const lote = await rpc('webhook_events_reclamar', { p_limite: 50 });
    if (lote.length === 0) break;

    for (const fila of lote) {
      try {
        // Aquí SÍ se puede parsear: estamos fuera del camino de la firma y del de los 5 s.
        // Lo que se guarda es el crudo; el parseo solo alimenta columnas de traza.
        const j = JSON.parse(fila.cuerpo_crudo);
        await marcarProcesado(fila.id, {
          object:    typeof j?.object === 'string' ? j.object : null,
          entry_ids: Array.isArray(j?.entry) ? j.entry.map((e: any) => String(e?.id)) : [],
        });
      } catch {
        // No se descarta: vuelve a 'pendiente' y el segador lo reintenta.
        // A los 5 intentos va a 'cuarentena', que es una investigación, no una limpieza.
        await devolverACola(fila.id);
      }
    }
  }
  return new Response(null, { status: 204 });
});
```

Fronteras explícitas, para que esto no se convierta en el normalizador por acumulación:

- **No resuelve `entry[].id` contra `meta_asset_routes`.** Guarda los identificadores en `entry_ids`
  para trazar, y nada más.
- No escribe en `messages`, ni en `conversations`, ni en `contacts`.
- No toca media.
- Un `JSON.parse` que falle no descarta la fila. Un payload que no parsea es una señal, no un evento a
  tirar.

**Criterio de aceptación.** Tras enviar la fixture de unicode con firma válida, hay exactamente una fila
en `webhook_events`, `estado = 'procesado'` y `cuerpo_crudo` coincide byte a byte con el fichero. Una
fila con un cuerpo deliberadamente corrupto acaba en `cuarentena` tras cinco intentos y genera P1.

---

### Tarea 9 — Suscripción de la app a los topics

Dos niveles distintos que se confunden con frecuencia:

1. **Nivel app**, una vez, en el App Dashboard → Webhooks: se registra la URL de callback y el verify
   token, y se suscribe la app a los topics `page`, `instagram` y `whatsapp_business_account`, marcando
   los campos de cada uno.
2. **Nivel objeto**, una vez por tenant: `POST /{page-id}/subscribed_apps` con `subscribed_fields`. Sin
   este paso la app está suscrita al topic pero no recibe nada de esa Página concreta. Según `02` §5.2
   esta llamada vive en el route handler del onboarding en Next.js, y su fallo debe abortar el alta con
   un mensaje concreto en vez de dejar un tenant a medio conectar.

`04` §2.4 nº2 documenta el error que se encuentra quien salta el paso 2 con el token equivocado:
`/subscribed_apps` **no acepta el token de system user**, devuelve error 190 subcode 2069032 y exige un
Page Access Token derivado.

#### Campos por topic

Conjunto mínimo propuesto para v1. Cada campo extra multiplica el volumen de la cola, así que se pide lo
que la fase 2 va a consumir y nada más:

| Topic | Campos v1 | Motivo |
|---|---|---|
| `page` | `messages`, `messaging_postbacks`, `message_echoes`, `standby`, `message_reads`, `messaging_referrals` | Mensajes, botones, lo que el cliente responde desde el móvil o Business Suite, el canal standby cuando Business Suite se apropia del hilo, el acuse de lectura para la bandeja, y el objeto `referral` que resuelve la atribución a pauta sin permisos de anuncios |
| `instagram` | `messages`, `messaging_postbacks`, `messaging_seen`, `message_echoes`, `messaging_referral`, `message_reactions`, `standby` | Los tres últimos, condicionados: ver abajo |
| `whatsapp_business_account` | `messages` como mínimo; `message_template_status_update`, `account_update` y `phone_number_quality_update` a evaluar | Sin verificar. Ver abajo |

Fuera de v1 y con motivo: `message_deliveries` (un evento por entrega, volumen alto, sin consumidor en
el modelo de datos), `messaging_optins`, `messaging_handovers`, y todo lo de comentarios, que `03` deja
explícitamente fuera de v1.

#### Lo que aquí no se puede dar por hecho

`03` marca cuatro cosas como inciertas y esta tarea no las resuelve por decreto:

- **Los nombres exactos del enum.** `messaging_referral` frente a `messaging_referrals`,
  `messaging_handover` frente a `messaging_handovers`, `message_reactions` frente a
  `messaging_reactions`. Un valor fuera del enum hace fallar la llamada entera, no el campo suelto. Se
  resuelve en consola, una vez, antes de escribir la llamada, y el resultado se anota en E15.
- **Si `message_reactions`, `standby`, `message_echoes` y `message_edit` existen en la vía Facebook
  Login para Instagram.** Una tabla oficial dice que no, otra página lista los dos primeros como
  suscribibles. No se afirma ninguna: se suscribe, se provoca el evento y se observa qué llega.
- **Si la suscripción de Instagram se hace sobre la Página o sobre el `ig_business_account_id`.**
  `02` §6.6 indica que la reconciliación corre contra los dos. La hipótesis de trabajo es que suscribir
  la Página cubre Instagram, pero no está confirmada y la tarea 10 comprueba las dos rutas.
- **Todo lo de WhatsApp.** `03` es explícito: WhatsApp no se investigó y ninguna sección debe afirmar
  nada más allá de los cinco puntos verificados. La forma del webhook
  (`object='whatsapp_business_account'`, `entry[].changes[].value.messages[]`, una cuarta forma de
  payload incompatible con las tres de Meta Messaging) es hipótesis de trabajo, no hecho. **El receptor
  es indiferente a la forma del payload porque no lo parsea, así que puede ingerir WhatsApp desde el
  primer día**; lo que no se puede es diseñar la fase 2 sobre una forma supuesta.

Confirmado el enum, la lista vive en una sola constante importada por el route handler de onboarding y
por la reconciliación. Que esos dos consumidores vivan en proveedores distintos —Netlify y Supabase— es
la costura que queda, y se cierra con un test de paridad, no con disciplina.

```
SUBSCRIBED_FIELDS_PAGE=messages,messaging_postbacks,message_echoes,standby,message_reads,messaging_referrals
SUBSCRIBED_FIELDS_IG=messages,messaging_postbacks,messaging_seen,...
SUBSCRIBED_FIELDS_WABA=messages,...
```

**Criterio de aceptación.** `POST /{page-id}/subscribed_apps` con la lista confirmada devuelve
`{"success":true}` para la Página de Boosty y para la Página de un cliente real, no solo la propia. Un
DM enviado desde una cuenta personal produce fila en `webhook_events` en menos de 10 s. E15 contiene la
lista literal de valores que el enum aceptó y los que rechazó.

---

### Tarea 10 — Reconciliación de suscripciones con `pg_cron` y `pg_net`

**Por qué existe.** Verbatim de `03`: a los 15 minutos de entregas fallidas Meta manda una alerta, y
tras 1 hora de fallos continuados la app queda **desuscrita** de esa Página o cuenta de Instagram, con
resuscripción manual. Una caída de una hora no degrada Kavea: la apaga por cliente y en silencio. No hay
error, no hay código de estado, no hay log. El cliente se entera cuando reclama.

**El argumento en contra, que hay que recoger sin adornarlo.** `02` §5.2 descartaba `pg_cron` con dos
razones: que este cron existe para recuperarse de una caída y por tanto no debería vivir dentro de lo
que puede caerse, y que las llamadas HTTPS salientes obligarían a `pg_net` y meterían esa dependencia
dentro de la base. Las dos siguen siendo ciertas. **La respuesta honesta es que durante una caída este
cron no podría hacer su trabajo de todos modos, porque necesita leer `meta_connections` y descifrar
tokens, y eso es Postgres.** Un planificador externo con la base caída se limitaría a fallar de forma
más visible. Lo que importa de este cron no es que corra durante el incidente: es que **cure al
recuperarse**, y para eso `pg_cron` sirve exactamente igual. Lo que sí hay que garantizar es que su
ausencia sea detectable desde fuera, y de eso se encarga el vigilante de la tarea 11.

#### El patrón: reloj en la base, trabajo en la función

```sql
-- Desplazado para no coincidir con el latido en punto.
select cron.schedule('reconciliacion', '3,18,33,48 * * * *', $$
  select net.http_post(
    url     := private.config('url_reconciliacion'),
    headers := jsonb_build_object('Authorization','Bearer '||private.config('clave_servicio')),
    body    := '{"modo":"suscripciones"}'::jsonb);
$$);

select cron.schedule('salud-credenciales', '17 4 * * *', $$
  select net.http_post(
    url     := private.config('url_reconciliacion'),
    headers := jsonb_build_object('Authorization','Bearer '||private.config('clave_servicio')),
    body    := '{"modo":"credenciales"}'::jsonb);
$$);
```

`pg_cron` corre en **UTC** y admite granularidad de minuto.

**Aquí los límites juegan a favor.** Con 28 Páginas y hasta tres comprobaciones por conexión son unas 84
llamadas a Graph API por ejecución, unos 25 s en serie. Los 400 s de reloj de una Edge Function dejan
trece veces ese margen: no hace falta trocear el barrido ni delegar en una segunda función. Y los 2 s de
CPU tampoco aprietan, porque el tiempo de espera de red no cuenta contra ellos y lo único que consume
CPU es parsear 84 respuestas JSON pequeñas.

```ts
const V = Deno.env.get('GRAPH_API_VERSION');   // v26.0. Nunca literal en el path.

// Require app secret (04 C2) obliga a firmar cada llamada con el token como mensaje.
async function appsecretProof(token: string, appSecret: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function revisar(assetId: string, pageToken: string, esperados: string[]) {
  const u = new URL(`https://graph.facebook.com/${V}/${assetId}/subscribed_apps`);
  u.searchParams.set('access_token',    pageToken);   // NO el token de system user: 190/2069032
  u.searchParams.set('appsecret_proof', await appsecretProof(pageToken, Deno.env.get('META_APP_SECRET')!));

  const r = await fetch(u);
  const cuota = { app: r.headers.get('x-app-usage'), bucds: r.headers.get('x-business-use-case-usage') };
  const j = await r.json();

  if (!r.ok) {
    // 190 = token invalidado: se marca la conexión como desconectada y se PARA. No en bucle.
    // 4, 17, 32, 613, 80001/80002/80006 = throttling: respetar estimated_time_to_regain_access.
    return { estado: 'error', codigo: j?.error?.code, cuota };
  }

  const mia    = (j.data ?? []).find((a: any) => a.id === Deno.env.get('META_APP_ID'));
  const tiene  = new Set<string>(mia?.subscribed_fields ?? []);
  const faltan = esperados.filter((f) => !tiene.has(f));

  return { estado: mia ? (faltan.length ? 'incompleta' : 'ok') : 'desuscrita', faltan, cuota };
}
```

Reacción por estado, escrita sobre `meta_connections` (`subscription_ok`, `last_subscription_check_at`,
`subscribed_fields_messenger`, `subscribed_fields_instagram`, `estado`), que `02` §7.2 ya prevé:

| Estado | Acción | Alerta |
|---|---|---|
| `ok` | `subscription_ok = true`, `last_subscription_check_at = now()` | Ninguna |
| `incompleta` | `POST /subscribed_apps` con la lista completa | P2. Puede ser un despliegue de campos nuevos, no una desuscripción |
| `desuscrita` | `POST /subscribed_apps` con la lista completa | **P1.** Meta desuscribió. Registrar el intervalo desde la última entrega recibida de ese `entry[].id` |
| `error` código 190 | `estado = 'disconnected'`, `token_invalid_since = now()`, parar | P1 por tenant |
| `error` throttling | Parar el barrido, respetar `estimated_time_to_regain_access` | P2 |

**Cadencia.** Cada 15 minutos, más una ejecución forzada tras cada despliegue del receptor y tras
cualquier incidente. La ejecución forzada es un `POST` directo a la función con la clave de servicio. Se
lee `X-App-Usage` en cada respuesta y se baja a 30 minutos si el consumo sube: `03` es explícito en que
seguir llamando durante un throttling alarga el bloqueo.

**Criterio de aceptación.** Se desuscribe la app a mano de la Página de staging
(`DELETE /{page-id}/subscribed_apps`), se espera al siguiente ciclo y sin intervención humana: la app
vuelve a estar suscrita, hay alerta P1 de tipo `desuscripcion` con correo entregado,
`meta_connections.subscription_ok` pasó por `false` y volvió a `true`, y un DM posterior vuelve a
producir fila en `webhook_events`. Además, la ausencia de dos ejecuciones seguidas genera alerta, y eso
se prueba deshabilitando el job.

---

### Tarea 11 — Alertas, y el vigilante que vive fuera

Hay dos caminos de alerta y son distintos porque cubren fallos distintos.

#### Camino interno: desde las funciones, por Resend

El camino primario no puede depender de Postgres, porque la alerta que más importa es la que se produce
cuando Postgres no está. Las funciones llaman a Resend por HTTPS directamente, con
`EdgeRuntime.waitUntil()` para no pagar la latencia dentro del presupuesto de Meta.

El cortacircuitos necesita estado fuera de Postgres, y el único almacén que sigue en pie durante una
caída de la base es **Blobs**. Netlify Blobs documenta las opciones `onlyIfNew` y `onlyIfMatch` en
`set()`, que dan un compare-and-set suficiente para que dos invocaciones concurrentes no manden dos
correos:

```
alertar(tipo, severidad, detalle):
  1. getMetadata(`alertas/ultima/${tipo}`) → etag y marca temporal previa
  2. si han pasado menos de 10 minutos → no se manda correo, solo se acumula
  3. set(..., { metadata: { ts: ahora }, onlyIfMatch: etag })
       └─ si es rechazado, otro proceso ganó la carrera: no se manda
  4. si fue aceptado → POST a Resend
  5. si Blobs tampoco responde → se manda el correo SIN deduplicar
```

El paso 5 es deliberado y es fail-open: cuando los dos almacenes están caídos, un correo duplicado es
mucho mejor que ningún correo, y el propio flood es información.

**Honestidad sobre la garantía.** Un compare-and-set sobre un almacén de objetos es más débil que el
Durable Object del diseño de Cloudflare, que daba serialización real por identificador. Que
`onlyIfMatch` se comporte como un compare-and-set atómico bajo concurrencia real es el punto 12 del
acta: se mide con una ráfaga, no se lee.

Reglas:

- Las P1 salen en el primer ciclo. Las P2 se agrupan en un resumen cada 15 minutos, emitido por la
  función de reconciliación, que ya corre a esa cadencia.
- El correo lleva tipo, severidad, recuento, ventana temporal y el `organization_id` cuando se conoce.
  **Nunca contenido de mensajes.**
- El espejo en la tabla `alertas` de Postgres lo escribe el procesador, en el mejor esfuerzo. Que ese
  `insert` falle no impide el aviso.
- La alerta va primero a Boosty, no al cliente, según `02` §5.4.

#### Camino externo: el vigilante, que es lo único que cubre el fallo total

Este camino es nuevo y lo obliga la arquitectura. **Si el proyecto de Supabase se cae entero, no hay
receptor, no hay base, no hay `pg_cron` y no hay función que pueda alertar.** Meta empieza a recibir
errores, el reloj de la hora corre, y desde dentro no hay nadie que lo diga. Es el escenario que
`02` §5.3 describía y que esta decisión acepta.

El vigilante vive **en Netlify**, que es el otro proveedor, y no comparte nada con la ingesta salvo la
red pública:

- Cada minuto hace un GET de handshake contra el receptor, con un `hub.challenge` conocido y el verify
  token real.
- Si la respuesta no es el challenge exacto **dos veces seguidas**, manda correo por Resend con su
  propia clave de API, distinta de la que usan las funciones.
- No escribe en Postgres. No lee de Postgres. Si lo hiciera, dejaría de servir para lo único que sirve.
- Su propio silencio no está cubierto en v1. Es una decisión de coste consciente y está en la pregunta
  abierta 15.

El vigilante usa el handshake y no un endpoint de salud propio a propósito: comprueba exactamente el
camino que Meta usa, incluida la capa de `verify_jwt`. Un `verify_jwt` reactivado por error lo detecta
en dos minutos.

**Criterio de aceptación.** Provocar una firma inválida produce correo en menos de 60 s. Provocar 500
firmas inválidas seguidas en paralelo produce **uno o dos** correos, no 500, y el recuento agregado
aparece en el resumen. Con Postgres bloqueado, el correo sigue llegando. **Pausar el proyecto de
Supabase produce correo del vigilante en menos de tres minutos**, y ese es el criterio que cubre el
riesgo aceptado.

---

### Tarea 12 — Observabilidad

Los logs de las funciones tienen retención corta y no son el registro. El registro es `webhook_events`.
En los logs solo va lo que no es contenido: método, resultado, bytes, `duracion_ms`, ruta, presencia de
la cabecera de firma. **Nunca el cuerpo.**

Aquí el cambio de plataforma es una mejora clara: con Postgres en el camino de ingesta, **la
observabilidad deja de estar partida en dos sistemas**. Latencia, tamaño, ruta y contenido se cruzan en
una sola consulta SQL, cosa que con Analytics Engine y la bitácora en sitios distintos era imposible.

Lo que necesita ayuda es la parte que Postgres no ve: la profundidad del amortiguador. La escribe el
drenaje en cada pasada.

```sql
create table public.ingesta_pulso (
  momento           timestamptz primary key default now(),
  cola_pendientes   integer not null,
  cola_edad_s       integer,
  cola_en_proceso   integer not null,
  blobs_pendientes  integer not null,
  blobs_edad_s      integer,
  blobs_cuarentena  integer not null,
  canario_ok        boolean
);
```

Se retiene 30 días y un job diario de `pg_cron` borra lo anterior, junto con el barrido de
`net._http_response`.

#### Qué se mide

| Métrica | Fuente | Para qué |
|---|---|---|
| Entregas por minuto | `webhook_events` | Línea base de tráfico y detección de silencio |
| p50 / p95 / p99 de `duracion_ms` | `webhook_events` | El presupuesto de 5 s es un techo, no un objetivo |
| Reparto entre `ruta = 'directa'` y `ruta = 'blobs'` | `webhook_events` | Salud real de Postgres vista desde el receptor |
| Distribución de `cuerpo_bytes` y máximo | `webhook_events` | Mide el lote real frente al supuesto de 1000 updates y calibra `MAX_BYTES` |
| Recuento de 401 por firma inválida | `alertas` y logs | Rotación de secreto, error de configuración o escaneo externo. **La señal de firma, no la columna `firma_ok`** |
| Recuento de 500 por almacenamiento no disponible | `alertas` y logs | El riesgo aceptado, medido |
| Profundidad y edad de la cola de Postgres | `ingesta_pulso` | Salud del procesador |
| Profundidad, edad y cuarentena del amortiguador | `ingesta_pulso` | Salud del amortiguador. No hay otra forma de verlo |
| Resultado del canario | `ingesta_pulso` | Si las credenciales de Blobs siguen vivas |
| Latencia del disparador frente al `pg_cron` | logs del procesador | Si la bandeja va en vivo o va a un minuto |
| Cola y retraso de `pg_net` | `net.http_request_queue`, `net._http_response` | Si el disparador inmediato está vivo |
| Última reconciliación correcta y conexiones re-suscritas | `meta_connections`, `alertas` | Estado real de las suscripciones |
| Silencio por objeto | `webhook_events` | Desuscripción silenciosa, toggle del cliente desactivado, app restringida |

```sql
create or replace view public.v_receptor_salud as
select date_trunc('minute', recibido_en)                         as minuto,
       count(*)                                                  as entregas,
       count(*) filter (where ruta = 'blobs')                    as por_blobs,
       percentile_disc(0.50) within group (order by duracion_ms) as p50_ms,
       percentile_disc(0.95) within group (order by duracion_ms) as p95_ms,
       max(duracion_ms)                                          as max_ms,
       max(cuerpo_bytes)                                         as bytes_max
  from public.webhook_events
 where recibido_en > now() - interval '6 hours'
 group by 1
 order by 1 desc;

create or replace view public.v_ingesta_silencio as
select coalesce(object, 'desconocido') as objeto,
       max(recibido_en)                as ultima_entrega,
       now() - max(recibido_en)        as silencio
  from public.webhook_events
 group by 1;
```

#### Qué dispara alerta

| Condición | Severidad | Por qué |
|---|---|---|
| Una sola firma inválida | P1 | Si el App Secret está mal, fallan el 100% de las entregas y hay menos de una hora antes de la desuscripción |
| Cualquier 5xx del receptor | P1 | Alimenta directamente el reloj de una hora |
| Cualquier evento con `ruta = 'blobs'` | P1 | Postgres no respondió al receptor |
| Objeto bajo `crudo/` con más de 15 minutos y Postgres sano | P1 | El drenaje no corre. El amortiguador se llena sin vaciarse |
| Canario fallido | P1 | El amortiguador está muerto y no se sabría hasta el día del incidente |
| Cualquier objeto bajo `cuarentena/` | P1 | Un evento que el drenaje no supo meter en la base |
| Cualquier fila en `estado = 'cuarentena'` | P1 | El equivalente de un mensaje en la cola de mensajes muertos |
| p95 de `duracion_ms` > 2000 ms durante 5 minutos | P2 | Margen antes del techo de 5 s |
| Edad de la fila `pendiente` más antigua > 5 minutos | P1 | El procesador no drena y la bandeja va con retraso |
| Cola de `pg_net` creciendo sin drenarse | P1 | El disparador inmediato está muerto y la bandeja va al ritmo del cron sin que nadie lo note |
| Un job de `pg_cron` no corre o falla dos ciclos seguidos | P1 | Se pierde la única vigilancia sobre la desuscripción |
| El cron re-suscribe cualquier conexión | P1 | Hubo desuscripción real y hubo pérdida |
| Error 190 en cualquier conexión | P1 por tenant | Token invalidado: para, no reintentes |
| **El vigilante externo no obtiene el challenge dos veces seguidas** | **P1** | **El proyecto entero está caído, o `verify_jwt` se reactivó. Es el único aviso posible en ese escenario** |
| Sin entregas durante 2 horas en horario laboral | P1 | El fallo silencioso. Umbral a calibrar tras una semana de línea base |
| `cuerpo_bytes` por encima de 1 MB en una entrega | P2 informativo | Aprender el techo real del lote y su distancia a los 2 s de CPU |

El umbral de silencio es el que más ajuste necesita: durante el dogfooding solo hay un tenant y el
tráfico nocturno es cero por razones legítimas. Se calibra con datos, no antes. La versión por
organización es de fase 3, cuando haya varios tenants con líneas base distintas.

**Un punto ciego que hay que nombrar.** Mientras Postgres está caído no se escriben ni la bitácora ni el
pulso, y la única observabilidad en vivo son los correos y los logs de la función. Eso es peor que en el
diseño de Cloudflare, donde las métricas del receptor vivían fuera de Postgres. No hay forma de
arreglarlo sin reintroducir un tercer proveedor. Se compensa con que el correo de `postgres_caido` lleva
recuento y ventana, y con que al recuperarse la base el drenaje reconstruye la serie con los
`recibido_en` originales.

**Criterio de aceptación.** Las dos vistas y `ingesta_pulso` devuelven datos tras una hora de tráfico
real. Cada condición de la tabla se dispara al menos una vez en staging, provocada a mano, y produce la
alerta esperada. Una condición que no se ha visto disparar no está implementada.

---

### Tarea 13 — Endurecimiento del endpoint público

El endpoint no lleva autenticación de transporte —`verify_jwt = false` es una decisión, no un
descuido— así que cualquiera puede llamarlo. Medidas proporcionadas:

- Rechazo temprano: sin `X-Hub-Signature-256` bien formada no se lee el cuerpo ni se calcula HMAC. Con
  2 s de CPU por invocación, esto no es solo higiene: es lo que evita que un flood de peticiones grandes
  sin firma consuma CPU.
- Guarda de `content-length` por debajo de lo que midan los puntos 7 y 9 del acta. Un 413 a una entrega
  legítima cuenta como fallo de entrega y alimenta el reloj de la hora, así que el guardarraíl se pone
  alto y solo se baja con datos.
- Sin cabeceras CORS y sin manejador de `OPTIONS`.
- Métrica del volumen de 401. Un pico sostenido es consumo de invocaciones, no un riesgo de datos.
- **Ninguna regla de límite de tasa delante de la función.** Sea cual sea la forma que tome si algún día
  hace falta, tiene que excluir el tráfico de Meta: una regla mal puesta aquí es una desuscripción
  silenciosa por cliente.
- v1 **no** valida el certificado de cliente de Meta. La autenticidad se establece con el HMAC. `03`
  marca el cambio de CA de los certificados mTLS (31-mar-2026, `meta-outbound-api-ca-2025-12.pem`) como
  corroborado solo por snippets, porque el changelog de Messenger Platform devuelve HTTP 500. Si Meta
  llegara a exigir mTLS de cliente, no hay mitigación disponible en Supabase hoy. Riesgo abierto.

**Criterio de aceptación.** Un POST sin cabecera de firma devuelve 401 sin haber leído el cuerpo, medido
por una duración claramente menor que la de una entrega válida.

---

### Tarea 14 — Cómo se prueba

#### 14.1 Fixtures

Cuatro como mínimo, en `pruebas/fixtures/`:

| Fixture | Contenido | Qué prueba |
|---|---|---|
| `messenger-texto-ascii.json` | Mensaje de texto en inglés | Camino feliz. **Pasa aunque el código esté roto** |
| `messenger-texto-unicode.json` | `"text":"ñandú café 🍻"` tal cual, con las barras invertidas literales | El bug de tildes y emoji. Es la fixture que importa |
| `instagram-mensaje.json` | Payload con `"object":"instagram"` | Que el receptor no discrimina por `object` |
| `lote-grande.json` | 1000 `entry[]` sintéticos | El supuesto de tamaño de lote, el presupuesto de 5 s y el techo de 2 s de CPU |

La fixture de unicode se genera **sin pasar por `JSON.stringify`**: se escribe a mano o se copia de una
entrega real capturada. Un generador que serialice un objeto de JavaScript produciría los caracteres ya
decodificados y la fixture dejaría de probar lo que debe.

#### 14.2 Entrega con firma válida

```bash
URL=https://<ref>.supabase.co/functions/v1/meta
F=pruebas/fixtures/messenger-texto-unicode.json

FIRMA=$(openssl dgst -sha256 -hmac "$META_APP_SECRET" -binary < "$F" | xxd -p -c 256)

curl -sS -X POST "$URL" \
  -H "content-type: application/json" \
  -H "X-Hub-Signature-256: sha256=$FIRMA" \
  --data-binary @"$F" \
  -o /dev/null -w 'http=%{http_code} tiempo=%{time_total}'
```

`--data-binary` es obligatorio. `-d @archivo` elimina los saltos de línea del fichero, cambia los bytes
y produce una firma que no cuadra: se pierde media tarde buscando un bug en el handler que está en el
cliente de prueba.

**Nótese que no se manda cabecera `Authorization`.** Si la respuesta es un 401 con cuerpo JSON de la
plataforma, `verify_jwt` sigue activo y no hay nada más que probar hasta arreglarlo.

El script portable `pruebas/firmar.ts` (E13) hace lo mismo sin `openssl` ni `xxd`, leyendo los **bytes**
del fichero, firmándolos y enviando exactamente esos bytes. Sirve en Windows y se reutiliza en la suite.
La misma comprobación corre en local contra `supabase functions serve`.

Resultado esperado: `200 EVENT_RECEIVED`, y una fila en `webhook_events` cuyo `cuerpo_crudo` coincide
byte a byte con el fichero.

#### 14.3 Entrega con firma inválida

Cinco casos, todos con 401, sin fila en `webhook_events` y **sin objeto en Blobs**:

1. Sin cabecera `X-Hub-Signature-256`.
2. Cabecera sin el prefijo `sha256=`.
3. Firma correcta con un solo carácter hex cambiado.
4. Firma calculada con un App Secret distinto.
5. Solo `X-Hub-Signature` (SHA1), correctamente calculada. Se rechaza: SHA1 es legacy.

Y el caso que descubre el bug de unicode: firmar `messenger-texto-unicode.json` correctamente y
comprobar que devuelve **200**. Si devuelve 401 con la firma bien calculada, alguien reintrodujo un
`JSON.parse` en el camino.

#### 14.4 Handshake

```bash
curl -s "$URL?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=$META_VERIFY_TOKEN"
# → 1158201444  (sin comillas, sin salto de línea, content-type text/plain)

curl -s -o /dev/null -w '%{http_code}' "$URL?hub.mode=subscribe&hub.challenge=1&hub.verify_token=incorrecto"
# → 403
```

Y la prueba real: guardar la URL en el App Dashboard. Meta hace el handshake al guardar y muestra el
error si no cuadra.

#### 14.5 La prueba de apagar Supabase

**Es la prueba central de la fase y es más importante que nunca**, porque ahora es lo único que
demuestra que el camino del amortiguador funciona. Se ejecuta de verdad y se repite en cada cambio que
toque el receptor o el drenaje.

Aquí hay un matiz que la arquitectura obliga a distinguir, y que no existía en las versiones anteriores
de este plan: **"apagar Supabase" ya no es una sola cosa.** Pausar el proyecto apaga también la función,
así que esa variante no prueba el amortiguador, prueba el fallo total. Son tres escenarios y prueban
cosas distintas.

**Variante A, fallo rápido de la base.** Revocar o rotar la clave de rol de servicio. PostgREST responde
401 de inmediato, el receptor cae al camino de Blobs sin agotar el timeout. Prueba la rama, no el
presupuesto.

**Variante B, fallo lento de la base.** La que importa, porque es el escenario que `02` §5.3 describe:
un pool agotado o una migración larga. Se reproduce abriendo una transacción que tome
`lock table public.webhook_events in access exclusive mode` y dejándola abierta, o saturando el pool.
Las escrituras se cuelgan y el receptor agota los 1 500 ms antes de caer a Blobs.

Con la variante B:

1. Mandar tres DMs reales a la Página de staging.
2. El receptor devuelve **200** a los tres, y cada respuesta está por debajo de 5 s medida con
   `%{time_total}`. Si alguna pasa de 5 s, el presupuesto está mal repartido y hay que bajar el timeout
   de Postgres antes de seguir.
3. `list({ prefix: 'crudo/' })` devuelve exactamente tres objetos, con las claves ordenadas por hora de
   llegada y la metadata completa: `ingesta_id`, `recibido_en`, `bytes`, `sha256`.
4. Llega alerta P1 `postgres_caido`, una sola vez y no tres, con recuento agregado. No llega ninguna
   `ingesta_caida_total`.
5. Soltar el lock. En la siguiente pasada del drenaje, como mucho 60 s después, aparecen las tres filas
   con `ruta = 'blobs'`, `recibido_en` el original de la entrega y `drenado_en` el del rescate.
6. `crudo/` queda vacío. **Sin pérdidas: tres entregas, tres filas.**
7. **Sin duplicados:** invocar el drenaje otra vez a mano y comprobar que no aparece ninguna fila nueva.
8. El caso de duplicado real, que hay que provocar y no razonar: escribir a mano en Blobs un objeto cuyo
   `ingesta_id` ya exista en `webhook_events`, invocar el drenaje y comprobar que no se crea una segunda
   fila y que el objeto se borra igual. Es exactamente el escenario del `insert` que commiteó pero cuya
   respuesta se perdió.

**Variante C, el proyecto entero pausado.** No hay 200. No hay función. **El resultado esperado no es
que el receptor responda: es que el vigilante externo avise.** Se pausa el proyecto, se comprueba que
Meta recibe errores y que llega correo del vigilante en menos de tres minutos, y se restaura antes de la
hora. Es la prueba del riesgo aceptado, no de su mitigación, porque mitigación no hay.

#### 14.6 Los dos almacenes caídos

Bloquear la tabla como en la variante B y, a la vez, dejar Blobs inalcanzable (token roto en una rama de
prueba):

1. La respuesta es **500**, no 200. Un 200 aquí perdería el evento para siempre.
2. El 500 llega dentro del presupuesto, no al agotar el reloj de la función. Si tarda más, los dos
   timeouts encadenados están mal fijados.
3. Llega alerta P1 `ingesta_caida_total` aunque Blobs, que es donde vive el cortacircuitos, esté caído:
   el fail-open del paso 5 de la tarea 11 es lo que se está probando.
4. Meta reintenta y, al restaurar cualquiera de los dos almacenes, el evento entra.

#### 14.7 El canario

Revocar el token de Netlify a propósito y comprobar que la siguiente ejecución del canario produce
`canario_fallido` con correo. Restaurar el token y comprobar que la alerta se cierra. Es la prueba de
que el amortiguador no está muerto en silencio.

#### 14.8 Latencia del procesador

1. Con el job `latido` deshabilitado, una entrega firmada pasa de `pendiente` a `procesado` en menos de
   2 s.
2. Con el trigger de `pg_net` deshabilitado, en menos de 70 s.
3. Cien entregas en ráfaga: cien filas, cada una procesada exactamente una vez, y en los logs se ve que
   la mayoría de las invocaciones del procesador salieron de inmediato sin obtener el lock.

#### 14.9 Reintento y desuscripción

Solo en staging y sobre una Página de pruebas, porque el resultado esperado es que Meta desuscriba esa
Página. Es el objetivo del experimento, y **es la prueba que cierra la pregunta de cuánto vale de verdad
el amortiguador**, porque mide dónde está la frontera de la hora.

1. Desplegar una variante del receptor que devuelva 500 a todo POST firmado. Vive en una rama y no se
   mezcla: nada de una variable de entorno que active 500 en producción.
2. Mandar un DM a la Página de staging desde una cuenta personal.
3. Registrar la marca temporal de cada reintento. `03` deja el backoff sin confirmar: Graph API Webhooks
   dice *"retry immediately, then a few more times with decreasing frequency over the next 36 hours"*;
   Messenger Platform dice alerta a los 15 minutos y desuscripción a la hora. Son dos políticas
   oficiales que Meta no reconcilia. **Este experimento las mide.**
4. Comprobar si llega la alerta de desarrollador a los 15 minutos y la de "Webhooks Disabled" a la hora,
   y si `GET /{page-id}/subscribed_apps` deja de listar la app.
5. Restaurar el receptor correcto y comprobar que la reconciliación re-suscribe sola.

Anotar los intervalos reales en E15. Es la única forma de saber cuánto margen hay de verdad en un
incidente y de calibrar el umbral de silencio de la tarea 12.

Prueba corta, sin esperar una hora: devolver 500 durante dos minutos y confirmar que el mismo evento
llega más de una vez y produce dos filas en `webhook_events` con el mismo `mid` dentro del cuerpo. Dos
filas es lo correcto; la deduplicación de mensajes es de la fase 2. Nótese que `ingesta_id` **no**
deduplica esto: son dos entregas distintas de Meta, cada una con su identidad de ingesta. `ingesta_id`
solo deduplica el camino directo contra el del amortiguador.

#### 14.10 El botón de prueba del App Dashboard

El Dashboard tiene un envío de payload de muestra por topic. Dos cosas que comprobar antes de usarlo
como prueba: si firma el payload con el App Secret, y qué identificadores lleva. Si no firma, el receptor
lo rechazará con 401 y ese es el comportamiento correcto, no un fallo. Sus identificadores son ficticios
y en la fase 2 caerán en cuarentena por no resolver contra `meta_asset_routes`.
**Sin confirmar: verificar en el Dashboard y anotar en E15.**

---

### Tarea 15 — Acta de mediciones

Documento `docs/fases/01-mediciones.md` con lo que esta fase mide y que cierra puntos abiertos de `03` y
del cambio de plataforma:

1. Valores del enum de `subscribed_fields` aceptados y rechazados, por topic.
2. Si `message_reactions`, `standby`, `message_echoes` y `message_edit` llegan de verdad en la vía
   Facebook Login para Instagram.
3. Si `object` llega como `page` o como `instagram` para eventos de Instagram, con payload real. No
   cambia el diseño del receptor, que no lo lee, pero cierra una contradicción documental.
4. **Backoff real de reintentos de Meta y tiempo hasta la desuscripción.** No es solo una curiosidad
   documental: es lo que dice a partir de qué minuto el amortiguador deja de ser redundante con los
   reintentos de Meta y pasa a ser lo único que evita la pérdida.
5. Si `/{ig-business-account-id}/subscribed_apps` existe y responde, o si la suscripción de Instagram
   vive solo en la Página.
6. Forma real del primer webhook de WhatsApp: valor de `object`, estructura de `entry[]`, qué
   identificador lleva `entry[].id`, dónde vive `phone_number_id`, y si viene firmado con el mismo App
   Secret.
7. **Techo real de tamaño de payload de una Edge Function**, y qué lo impone: si hay un límite de tamaño
   de petición publicado o si el que manda es el de 2 s de CPU con los 256 MB de memoria. Se mide
   enviando `lote-grande.json` y payloads sintéticos crecientes hasta el punto de rechazo, anotando qué
   código devuelve. `MAX_BYTES` es una suposición hasta cerrarlo.
8. Distribución de tamaño de lote y de `entry[]` por entrega. Con Postgres absorbiendo megabytes en una
   columna `text` esto ya no decide una ruta de desborde, pero calibra el guardarraíl y valida o refuta
   el supuesto de 1000 updates.
9. **p50/p95/p99 del receptor en frío y en caliente**, coste del arranque en frío, y **CPU consumida por
   invocación** frente al techo de 2 s. Es la medición que decide si el timeout de 1 500 ms para
   Postgres es correcto o generoso.
10. **Latencia del disparador inmediato**: del `insert` al `estado = 'procesado'`, p50 y p95, separando
    el camino del trigger del camino del `pg_cron`.
11. Si el botón de prueba del Dashboard firma sus payloads.
12. **Netlify Blobs desde fuera del runtime**: si `list()` honra la consistencia fuerte del store, si el
    orden de `list()` es estable, y si `onlyIfMatch` se comporta como un compare-and-set atómico bajo
    concurrencia. De lo último depende que el cortacircuitos mande un correo y no cincuenta.
13. **Comportamiento operativo de `pg_net`.** Si el worker se atasca y con qué síntoma, cuál es el TTL
    efectivo de `net._http_response`, qué pasa con la cola durante un reinicio del proyecto, y si un
    `timeout_milliseconds` bajo produce falsos negativos. Es la pieza menos conocida del diseño.
14. **Add-on de Custom Domains de Supabase**: si existe para este plan, su coste, y la forma exacta del
    path resultante para una Edge Function bajo `hooks.kavea.ai`.
15. Si Meta sigue redirecciones en la entrega de webhooks. Decide si algún día se puede mover el
    receptor a un dominio propio sin re-registrar la URL en el App Dashboard.
16. **Vida útil y política de revocación del token de acceso de Netlify**, y si el canario diario lo
    detecta con la latencia esperada. Es la credencial que sostiene el amortiguador entero.

**Criterio de aceptación.** Los dieciséis puntos tienen respuesta o una razón explícita de por qué siguen
abiertos. Un punto sin respuesta y sin razón es deuda de fase, y la regla de `00` §9 dice que no se pasa
de fase con deuda de la anterior.

---

## 5. Qué se gana y qué se pierde con Supabase frente a Cloudflare

La decisión es de Gabriel y está tomada. Lo que sigue no la discute: la documenta con precisión, para
que dentro de seis meses nadie tenga que reconstruir por qué el sistema es como es. Hay cosas del diseño
de Cloudflare que eran mejores y quedan escritas en vez de enterradas.

### Lo que se gana

1. **Dos proveedores y ninguno más, que es el motivo.** Netlify para la web, la aplicación, el
   amortiguador y el vigilante; Supabase para el receptor, la base y los crones. Un pipeline de
   despliegue menos, un plan de facturación menos, un panel menos que mirar durante un incidente.
2. **Desaparece el tope de 128 KB por mensaje y con él el desborde por tamaño.** Una columna `text`
   absorbe megabytes y un objeto de Blobs llega a 5 GB. El amortiguador es ahora un mecanismo de
   disponibilidad y no un parche a un límite de tamaño: es un modo de fallo distinto y menos frecuente.
   En el balance del diseño de Cloudflare este punto se reconocía como estrictamente peor; se recupera.
3. **Se acaba el reloj de retención de la cola.** Queues descartaba pasados 14 días en plan de pago y 24
   horas en el gratuito. Una tabla retiene lo que se quiera. Un procesador roto tres semanas no pierde
   nada, y el plan de pago de Workers deja de ser un requisito derivado de la arquitectura.
4. **La cola vuelve a ser inspeccionable con un `select`.** Cualquier pregunta sobre lo pendiente se
   responde con SQL, y desaparece el consumidor que había que escribir solo para poder ver lo ingerido.
5. **La observabilidad deja de estar partida.** Latencia, tamaño, ruta y contenido se cruzan en una
   consulta. Antes vivían en Analytics Engine y en Postgres y ninguna consulta los cruzaba.
6. **El `check (firma_ok)` vuelve al camino de ingesta.** El diseño de Cloudflare lo perdía: la garantía
   se degradaba a "el código lo hace bien" hasta que la fila llegaba a la bitácora, un salto después.
   Ahora la base rechaza el `insert` de un cuerpo no verificado en el mismo instante en que el receptor
   lo intenta.
7. **Vuelve `waitUntil`.** El receptor puede alertar después de responder, sin pagar la latencia dentro
   del presupuesto de Meta.
8. **400 s de reloj para el trabajo asíncrono.** La reconciliación de las 28 Páginas cabe trece veces.
   No hay que trocear nada ni inventar un patrón de reloj más ejecutor.

### Lo que se pierde

1. **El 200 vuelve a depender de Postgres, y el receptor vive dentro del mismo proyecto que la base.**
   Es el argumento entero de `02` §5.3 y no está refutado. Hay que decir la forma más aguda: **un
   incidente del proyecto de Supabase completo apaga a la vez el receptor y la base**, que es
   exactamente lo que `02` §5.3 temía. Es menos probable que un pool agotado o una migración larga, pero
   existe, y **el amortiguador no lo mitiga**, porque la función que escribiría en Blobs tampoco corre.
   La única respuesta disponible es detectarlo desde fuera, y eso es el vigilante de la tarea 11: avisa,
   no salva. Los eventos de esa ventana se recuperan solo si Meta los reintenta dentro de su plazo, y a
   partir de la hora hay desuscripción por cliente.
2. **Blobs no es una cola.** Sin entrega garantizada, sin reintentos, sin cola de mensajes muertos, sin
   métrica de profundidad ni de edad, y **sin reglas de ciclo de vida**: la caducidad de la cuarentena es
   código propio. El drenaje, el orden, la deduplicación y la vigilancia también. **En este punto
   concreto el diseño de Cloudflare era estrictamente mejor**, y es el precio directo de reducir
   proveedores.
3. **Consistencia eventual por defecto**, con hasta 60 s de propagación. Hay que pedir la fuerte
   explícitamente en cada apertura del store, y no está documentado si `list()` la honra ni si su orden
   es estable. Una cola no tiene modos de consistencia que recordar.
4. **El amortiguador depende de una credencial de larga vida en un camino que casi nunca se ejercita.**
   Un token de Netlify revocado lo deja inservible en silencio. El canario diario lo detecta; no lo
   evita. Con un binding de Cloudflare esta clase de fallo no existía.
5. **No hay Durable Objects.** La deduplicación de alertas pasa de una primitiva con serialización real
   a un compare-and-set sobre un almacén de objetos, más débil y por medir. Y de cara a la fase 4, el
   token bucket por `page_id` se implementará con `pg_advisory_xact_lock`, que mete Postgres en el
   camino caliente del envío. Es aceptable ahí porque el envío ya necesita la base para leer el token;
   no lo era para la ingesta.
6. **El planificador vive dentro de lo que vigila.** `pg_cron` no corre si la base no corre. La respuesta
   honesta es que este cron no podría hacer su trabajo de todos modos —necesita leer tokens de la base—
   y que lo que importa es que cure al recuperarse. Pero la propiedad que `02` §5.2 pedía, que el
   planificador sea independiente, se ha perdido de verdad.
7. **`pg_net` es la pieza menos conocida del diseño.** Es un worker de fondo con una cola en tablas y una
   tabla de respuestas que crece: puede atascarse y su fallo es silencioso, porque el síntoma es una
   bandeja que va al ritmo del cron en vez de en vivo. En el diseño de Cloudflare la entrega al
   consumidor era una garantía del proveedor.
8. **`verify_jwt` es un interruptor que apaga la ingesta entera.** Un despliegue sin la bandera, una
   plantilla de CI, una restauración de configuración, y todas las entregas reciben 401 sin que el
   código se entere. Fijarlo en `config.toml` lo mitiga; no lo elimina. En el diseño de Cloudflare no
   había ningún interruptor equivalente delante del código.
9. **Punto ciego de observabilidad durante el incidente.** Cuando Postgres está caído no se escribe ni
   la bitácora ni el pulso, y la única señal en vivo es el correo. Antes las métricas del receptor
   vivían fuera de Postgres precisamente para que la caída de la base no cegara al observador.
10. **2 s de CPU por invocación.** Es el techo que ningún diseño anterior tenía en esta forma. Sobra para
    el receptor, pero es lo que fija `MAX_BYTES` y lo que convierte un payload patológico en un 5xx que
    Meta cuenta.
11. **El App Secret sigue viviendo en dos sitios**, porque el onboarding y el `appsecret_proof` siguen en
    Next.js sobre Netlify. La reducción de proveedores acorta la lista de valores que pueden
    desincronizarse, pero no la elimina, y el test de paridad sigue haciendo falta.

Y una cosa que no es ganancia ni pérdida sino calibración: **el amortiguador cubre menos de lo que
parece**. Por debajo de una hora de caída, los reintentos de Meta ya evitan la pérdida; el amortiguador
solo evita el retraso. Su valor real está en la caída larga, que es rara y catastrófica. Se construye
igual, desde el primer despliegue, porque la promesa del producto es que no se pierde nada. Pero no debe
presentarse como la red que sostiene la operación diaria: la red del día a día son los reintentos de
Meta y el hecho de que Postgres esté disponible.

Nada de esto reabre la decisión, que ya está tomada y con su riesgo aceptado por escrito.

---

## 6. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `verify_jwt` activo o reactivado | El 100% de las entregas recibe 401 de la plataforma, el código no se entera y a la hora hay desuscripción | `verify_jwt = false` en `config.toml`, no en la bandera de despliegue. Criterio de aceptación que distingue el 403 propio del 401 de la plataforma. El vigilante externo lo detecta en dos minutos |
| Alguien reintroduce `JSON.parse` antes del HMAC | Fallo solo con tildes y emoji: invisible en pruebas, total en VE, RD y MX | Fixture de unicode escapado obligatoria en CI, con prueba de regresión que distingue la fixture ASCII de la unicode |
| Renombrar la función después de registrar la URL en Meta | Cambia el endpoint, mueren las entregas de los tres topics a la vez | Nombre congelado desde el registro. Cambiarlo exige re-registrar la URL y rehacer el handshake, y se trata como una ventana de cambio |
| Caída lenta de Postgres: pool agotado, migración larga | Por debajo de una hora, retraso; por encima, pérdida y desuscripción | Camino de Blobs desde el primer despliegue, timeout corto y calibrado, alerta P1 en el primer evento con `ruta='blobs'`, y la prueba 14.5 variante B ejecutada de verdad |
| **Caída del proyecto de Supabase completo** | **No hay receptor, no hay base, no hay aviso desde dentro. Desuscripción por cliente a la hora** | **Sin mitigación posible: es el riesgo aceptado.** Lo único disponible es detección: el vigilante externo de la tarea 11, que avisa en menos de tres minutos |
| Caída simultánea de Postgres y Blobs | 500 sostenido y desuscripción | 500 explícito para que Meta reintente, alerta P1 con fail-open, reconciliación después. No hay tercer almacén y añadirlo devolvería el proveedor que la decisión quitó |
| **Token de Netlify revocado o caducado** | El amortiguador está muerto y no se sabe hasta el día del incidente | Canario diario con alerta P1. Es lo único que convierte "tenemos amortiguador" en "el amortiguador funciona hoy" |
| Uso de `getDeployStore` en vez de `getStore` | Un despliegue del sitio durante un incidente deja huérfanos los eventos pendientes | Revisión de código, y prueba: escribir, desplegar el sitio, comprobar que el drenaje sigue viéndolos |
| Consistencia eventual de Blobs | El drenaje lista un store que parece vacío justo después de una caída | Consistencia fuerte explícita en cada apertura del store; el drenaje no borra basándose solo en un listado; punto 12 del acta |
| El drenaje no corre y el amortiguador se llena | Eventos confirmados a Meta con 200 que nunca llegan a la bandeja | Alerta P1 por objeto en `crudo/` con más de 15 minutos, `ingesta_pulso` en cada pasada, y 400 s de presupuesto para el peor caso post-incidente |
| El drenaje duplica eventos que sí se habían insertado | Dos filas por evento, y en fase 2 dos entradas en la bandeja | `ingesta_id` único compartido por los dos caminos, `on conflict do nothing`, borrado del objeto solo tras confirmar. Se prueba provocando el caso |
| La caducidad de la cuarentena no se escribe | Texto de usuarios finales acumulándose sin límite en un almacén sin reglas de ciclo de vida | Paso 4 del bucle del drenaje, con criterio de aceptación propio: un objeto de hace 8 días desaparece |
| El worker de `pg_net` se atasca | La bandeja pasa de tiempo real a un minuto sin que nadie lo note. Es el fallo silencioso más plausible del diseño | Alerta por crecimiento de `net.http_request_queue`, barrido de `net._http_response`, y el `pg_cron` de un minuto como suelo garantizado. Punto 13 del acta |
| Un job de `pg_cron` se desactiva o falla | Se pierde la reconciliación y el suelo del procesador | Alerta por ausencia de ejecución, no solo por ejecución fallida. Se prueba deshabilitando el job |
| Un payload patológico agota los 2 s de CPU | 5xx que Meta cuenta contra el reloj de la hora | Guardarraíl `MAX_BYTES` por debajo de lo medido, rechazo antes de leer el cuerpo si falta la firma, y `lote-grande.json` en la suite |
| Ráfaga de webhooks dispara muchos procesadores | Coste, no incorrección | `skip locked` garantiza corrección; `pg_try_advisory_lock` hace que los sobrantes salgan de inmediato |
| Un valor fuera del enum en `subscribed_fields` | La llamada de suscripción falla entera en el onboarding | Confirmar el enum en consola antes de escribir la llamada, y una sola constante compartida, con test de paridad entre Netlify y Supabase |
| mTLS obligatorio en webhooks de Meta | Sin mitigación disponible en Supabase hoy | Riesgo abierto. El changelog de Messenger Platform devuelve HTTP 500 y no se puede confirmar; abrirlo en navegador y guardar copia |
| Meta restringe la app entera | Todos los tenants a la vez, sin aviso | Fuera del alcance de esta fase. `03` lo cubre con kill-switch por canal y tenant |

---

## 7. Definición de terminado

La fase 1 está cerrada cuando todo lo siguiente es cierto y verificable por otra persona:

- [ ] El endpoint `https://<ref>.supabase.co/functions/v1/meta` está registrado en el App Dashboard y el
      handshake pasa al guardar.
- [ ] `config.toml` fija `verify_jwt = false` para `meta` y solo para `meta`, y un POST sin cabecera
      `Authorization` llega al código.
- [ ] Un GET sin parámetros devuelve 403 generado por la función, no un 401 de la plataforma.
- [ ] Las cinco pruebas de firma inválida devuelven 401, sin fila en la bitácora y sin objeto en Blobs.
- [ ] La fixture con unicode escapado devuelve 200 y su `cuerpo_crudo` coincide byte a byte.
- [ ] `lote-grande.json` devuelve 200 dentro del presupuesto, el techo real de payload está medido y
      `MAX_BYTES` fijado por debajo.
- [ ] Un DM real desde Instagram, uno desde Messenger y uno desde WhatsApp producen fila en
      `webhook_events` en menos de 10 s.
- [ ] **Con Postgres bloqueado, el receptor devuelve 200 por debajo de 5 s, los eventos acaban en Blobs
      y al recuperarse la base se drenan sin pérdidas ni duplicados.** Ejecutado en la variante lenta,
      no supuesto.
- [ ] **Con Postgres y Blobs caídos, la respuesta es 500 dentro del presupuesto y llega la alerta P1.**
- [ ] **Con el proyecto de Supabase pausado, llega correo del vigilante externo en menos de tres
      minutos.**
- [ ] El caso de duplicado —objeto en Blobs cuyo `ingesta_id` ya está en la base— no crea una segunda
      fila.
- [ ] Un objeto que el drenaje no consigue insertar acaba en `cuarentena/` con alerta P1, y la caducidad
      de 7 días está implementada en el bucle del drenaje y probada con un objeto antiguo.
- [ ] El canario diario corre, y revocar el token de Netlify produce `canario_fallido` con correo.
- [ ] El store cuelga de un sitio de Netlify propio, se abre siempre con `getStore` y consistencia
      fuerte, y no hay ninguna llamada a `getDeployStore` en el repositorio.
- [ ] El disparador de `pg_net` lleva un evento de `pendiente` a `procesado` en menos de 2 s con el
      `pg_cron` deshabilitado, y en menos de 70 s con el disparador deshabilitado.
- [ ] p95 de `duracion_ms` por debajo de 500 ms sobre al menos 200 entregas reales, ninguna entrega por
      encima de 5 000 ms, y ninguna invocación cerca de los 2 s de CPU.
- [ ] El constraint `webhook_events_firma_ok_chk` está en la base y rechaza el insert de prueba, y está
      documentado en el propio esquema que `firma_ok` no es una señal y no lleva alertas encima.
- [ ] La reconciliación corre cada 15 minutos, detecta una desuscripción provocada a mano, re-suscribe
      sin intervención y genera alerta P1 con correo entregado. La ausencia de dos ciclos también alerta.
- [ ] Cada condición de la tabla de alertas de la tarea 12 se ha disparado al menos una vez en staging.
- [ ] La lista de `subscribed_fields` está confirmada contra el enum real y vive en una sola constante,
      con test de paridad entre Netlify y Supabase.
- [ ] `GRAPH_API_VERSION` es la única fuente de la versión y no hay ninguna versión literal en un path
      del repositorio, en ninguno de los dos entornos.
- [ ] Ningún log contiene el cuerpo de un webhook. Ninguna metadata de Blobs contiene texto de mensajes.
      No se ha descargado ni almacenado ningún binario de media entrante.
- [ ] `docs/fases/01-mediciones.md` responde a los dieciséis puntos de la tarea 15 o explica por qué
      alguno sigue abierto.
- [ ] **`06-arquitectura-plataforma.md` está actualizado**: su §1, su §1.1 y la fila de ingesta de su §2
      describen esta arquitectura y no ninguna de las anteriores, y Cloudflare ya no aparece como
      proveedor. Es deuda de documentación de esta fase, no de la siguiente.

Lo que **no** hace falta para cerrar la fase: normalización, resolución de tenant, `messages`, media,
bandeja. Todo eso es fase 2 y posteriores.

---

## 8. Preguntas abiertas

Las cinco primeras vienen de la sección `inciertos` de `03` y esta fase no las resuelve por decisión,
las resuelve por medición. Las demás las abre esta fase o el cambio de plataforma.

1. **Nombres del enum de `subscribed_fields`.** `messaging_referral` frente a `messaging_referrals`,
   `messaging_handover` frente a `messaging_handovers`, `message_reactions` frente a
   `messaging_reactions`. Se cierra en Graph API Explorer antes de escribir la llamada de la tarea 9.
   Bloqueante para el onboarding, no para el receptor.

2. **Campos realmente disponibles en la vía Facebook Login para Instagram.** Dos páginas oficiales se
   contradicen sobre `message_reactions`, `standby`, `message_echoes`, `messaging_handover` y
   `messaging_optins`. `message_edit` aparece en el changelog pero no en la tabla viva. Consecuencia si
   `standby` no existe en Instagram: Kavea se queda ciega cuando Business Suite se apropia de un hilo de
   Instagram, y eso cambia el diseño de la fase 2.

3. **Dónde vive la suscripción de Instagram.** Sobre la Página o sobre el `ig_business_account_id`. La
   reconciliación comprueba las dos rutas y anota cuál responde.

4. **Backoff real de reintentos y ventana hasta la desuscripción.** Dos políticas oficiales
   incompatibles, ninguna reconciliada por Meta. Se mide con 500 deliberados en staging. **Esta pregunta
   determina cuánto vale el amortiguador**: mientras no esté cerrada, la afirmación de que por debajo de
   una hora los reintentos de Meta cubren la pérdida es hipótesis de trabajo.

5. **Todo lo de WhatsApp.** `03` es explícito: fuera de los cinco puntos verificados, no se afirma nada.
   El receptor puede ingerir WhatsApp desde el día uno porque no parsea, pero la forma del payload, el
   identificador de enrutado y si viene firmado con el mismo App Secret son hipótesis que hay que medir
   con la primera entrega real. La fase 2 no se diseña antes de esa medición.

6. **WhatsApp contra `meta_asset_routes`.** `02` §7.2 aplana el enrutado en `meta_asset_routes` con
   `asset_id` como primary key, que absorbe un tercer espacio de identificadores sin cambio estructural.
   Lo que sí hay que tocar cuando llegue el primer webhook real de WhatsApp:

   - `tipo` tiene `check (tipo in ('page','ig_business_account'))` y rechazaría una fila de WhatsApp.
     Hace falta un tercer valor, y su nombre depende de qué identificador llegue de verdad en
     `entry[].id`: el WABA ID o el `phone_number_id`.
   - Si `entry[].id` es el WABA ID y el envío se hace por `phone_number_id`, hacen falta **dos** filas
     por conexión, o una fila de enrutado más una columna de envío en otra tabla. No se decide sin el
     payload delante.
   - `asset_id` como primary key sigue siendo correcto mientras el mapeo sea una función. Lo es mientras
     cada cliente tenga su propia WABA. Si algún día Boosty alojara números de varios clientes bajo una
     WABA propia, habría que enrutar por `phone_number_id`.
   - `meta_connections.page_id` es `not null`, así que un tenant solo-WhatsApp no cabe en el esquema
     actual. En v1 no es un problema porque la invariante exige Página para IG y Messenger, pero un
     cliente que solo quiera WhatsApp sí lo es.

7. **`webhook_events.cuerpo jsonb`.** Esta fase lo deja nullable y sin uso, con `cuerpo_crudo text` como
   fuente de verdad. Hay que decidir al final de la fase 2 si se elimina la columna o si se convierte en
   generada. Enmienda un punto de `02` §7.6 y necesita visto bueno explícito.

8. **Techo real de payload de una Edge Function y qué lo impone.** Punto 7 del acta. Hasta cerrarlo,
   `MAX_BYTES` es una suposición conservadora.

9. **Comportamiento operativo de `pg_net`.** Punto 13 del acta. Es la dependencia menos conocida del
   diseño y su fallo es silencioso: la bandeja deja de ir en vivo y sigue funcionando.

10. **Netlify Blobs desde fuera del runtime.** Punto 12 del acta: consistencia del listado, estabilidad
    de su orden y atomicidad de `onlyIfMatch`. El drenaje está escrito para no depender de las dos
    primeras, y el cortacircuitos sí depende de la tercera.

11. **Vida del token de Netlify.** Punto 16 del acta. Es la credencial que sostiene el amortiguador
    entero y hoy no se sabe si caduca sola.

12. **Grado de concurrencia del procesador.** En fase 1, con un tenant, una sola ranura de lock sobra.
    Cuándo hay que abrir más ranuras, y cuántas, se decide con el volumen medido y con el p95 del punto
    10 del acta, no antes.

13. **Umbral del detector de silencio.** Con un solo tenant en dogfooding y tráfico nocturno cero, las 2
    horas son una suposición. Se calibra con una semana de línea base. La versión por organización queda
    para cuando haya varios tenants.

14. **Si el timeout de 1 500 ms para Postgres es el correcto.** Es una hipótesis puesta entre dos
    restricciones: tiene que estar por encima del p99 de una base sana y dejar sitio para intentar Blobs
    y responder dentro de 5 s. Los puntos 9 y 10 del acta lo cierran, y hasta entonces cualquier ajuste
    va acompañado de la prueba 14.5 completa.

15. **Hasta dónde llega el vigilante externo.** En v1 comprueba el handshake cada minuto y avisa por
    correo. Lo que no cubre es su propio silencio: si el vigilante se cae, nadie lo dice. Cerrar ese
    hueco —un segundo vigilante, un servicio de monitorización externo, o una revisión periódica— es una
    decisión de coste que hay que tomar antes de entrar el primer cliente, no durante.

16. **Dominio propio para el receptor.** Punto 14 del acta. Hoy no bloquea nada: `*.supabase.co` le sirve
    a Meta igual. Lo que hay que decidir antes de moverlo es si el re-registro de la URL en el App
    Dashboard vale la ganancia, que es cosmética.
