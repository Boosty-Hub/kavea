# Kavea — Fase 1: Ingesta y receptor de eventos

**Fecha:** 2 de agosto de 2026
**Estado:** plan de ejecución, sin código escrito
**Depende de:** `03-invariantes-meta.md` (normativo), `06-arquitectura-plataforma.md` §1.1 y §2
(autoritativo en plataforma desde el 2-ago), `02-conexion-instagram-facebook.md` §5.1, §6 y §7
(autoritativo en todo lo de Meta), `04-configuracion-app-meta.md`
**Corresponde a:** fase 2 del flujo de `02` §5.1, bloque 1 del orden de construcción de `06` §8

> **Nota de revisión. Tercera versión de este plan.** La primera situaba el receptor en una Supabase
> Edge Function con la cola en Postgres. La segunda lo movió a Cloudflare Workers más Queues, porque
> `02` §5.3 descartaba explícitamente la primera. Esta tercera lo devuelve a **Netlify Functions más
> Postgres**, por decisión de Gabriel del 2 de agosto, documentada en `06` §1.1.
>
> **Esa decisión anula el `02` §5.3.** Conviene decir con precisión qué se anula: se anula la
> conclusión, no el argumento. El argumento de `02` §5.3 —si el receptor necesita Postgres para
> responder 200, una caída larga de la base desuscribe cada Página en silencio tras una hora— sigue
> siendo válido y no está refutado. La decisión asume ese riesgo a cambio de bajar de cuatro
> proveedores a dos, con un solo pipeline de despliegue y un solo almacén de secretos.
>
> La mitigación que hace viable la decisión es **Netlify Blobs como amortiguador de emergencia**, y no
> es un extra: es lo que sustituye a Cloudflare Queues. Va desde el primer despliegue y se prueba
> apagando Supabase. Todo lo que no dependía de la plataforma —tratamiento del cuerpo crudo, firma,
> handshake, alertas, observabilidad, cron de reconciliación, mediciones— se conserva y se adapta. La
> sección 5 recoge qué se gana y qué se pierde respecto al diseño de Cloudflare, sin adornos.

---

## 1. Objetivo

Que un evento emitido por Meta en cualquiera de los tres canales quede **persistido de forma durable**
con la firma verificada y con un 200 devuelto en menos de cinco segundos, que llegue al procesador en
segundos y no en minutos, y que Kavea se entere cuando Meta deje de entregar.

La fase termina con un endpoint público en `hooks.kavea.ai`, una cola en Postgres consumida con
`for update skip locked`, un amortiguador en Netlify Blobs con su drenaje, un procesador mínimo que
deja bitácora legible, un cron de reconciliación de suscripciones y las métricas que permiten afirmar
que la ingesta está viva. No incluye normalización, ni resolución de tenant, ni escritura en
`messages`: eso es la fase 2.

### La propiedad que gobierna el diseño

Tras una hora de entregas fallidas Meta manda "Webhooks Disabled" y **desuscribe la app de esa
Página**, con resuscripción manual. No es degradación: es apagado por cliente y en silencio. De ahí
sale la propiedad más cara del sistema, que es que el endpoint devuelva 200 pase lo que pase.

**Aquí está la diferencia con la versión anterior de este plan, y hay que mirarla de frente.** Con
Workers más Queues, el 200 no dependía de Postgres en absoluto. Ahora sí depende de que **al menos uno
de los dos almacenes responda**. La escala de degradación es esta y es el contrato del receptor:

| Estado | Qué hace el receptor | Respuesta a Meta |
|---|---|---|
| Postgres responde | `insert` en `webhook_events` | **200** |
| Postgres no responde, Blobs sí | vuelca el cuerpo crudo a Blobs con consistencia fuerte | **200** |
| No responde ninguno de los dos | nada que persistir | **500**, y el reloj de la hora corriendo |

La tercera fila es el riesgo aceptado de `06` §1.1 en su forma más concreta. No se disimula con un
200: un 200 sobre un evento que no se guardó lo pierde para siempre, porque Meta no reintenta un 200.
Se devuelve 500 a propósito para que Meta reintente, y se alerta en el primer caso.

### Lo que el receptor no hace

Cada uno de estos añadidos ha aparecido en implementaciones reales y todos rompen la invariante de los
cinco segundos o la de la firma:

- No parsea el JSON. No lee `object`, ni `entry[]`, ni `messaging[]`.
- No resuelve `entry[].id` contra `meta_asset_routes`. El enrutado multi-tenant es fase 2.
- No lee configuración de la base. La única lectura que necesita es el App Secret, que está en una
  variable de entorno del sitio, y es uno para toda la app porque solo hay una app de Meta.
- No deduplica eventos de Meta. La idempotencia vive en `unique (organization_id, canal, mid)` de
  `messages`. Un reintento de Meta produce dos filas en `webhook_events` y una sola en `messages`. Eso
  es correcto.
- No descarga media, no llama a Graph API, no llama a Claude.
- **No responde 200 antes de que uno de los dos almacenes haya confirmado la escritura.**
- **No espera a Postgres sin límite.** El presupuesto de espera es explícito y corto; agotarlo es la
  señal que dispara el camino de Blobs, no un error.

Sobre el último punto hay una diferencia de plataforma que condiciona todo el diseño y que conviene
escribir aquí en vez de descubrirla depurando: **en Netlify Functions no existe `ctx.waitUntil()`**.
El runtime es Lambda y no hay trabajo después de la respuesta; cuando la función devuelve, el proceso
se congela. Todo lo que el receptor quiera hacer fuera de banda —alertar, disparar el procesador— hay
que pagarlo **antes** del 200 o no ocurre. La consecuencia práctica es que esas llamadas llevan
presupuesto propio y sus fallos se tragan: nada de lo accesorio puede impedir el 200.

El coste del handler es constante respecto al número de eventos del lote y lineal respecto a los
bytes. Un lote de 1000 `entry[]` cuesta lo mismo que uno de 1.

### Presupuesto de tiempo, escrito como números

| Concepto | Valor | Origen |
|---|---|---|
| Presupuesto de respuesta a Meta | **5 000 ms** | `03`, invariante |
| Techo de la Netlify Function sincrónica | **10 000 ms** | límite de plataforma |
| Timeout de la escritura a Postgres | 1 500 ms | esta fase, a calibrar con la medición 9 |
| Timeout de la escritura a Blobs | 1 500 ms | esta fase |
| Timeout del disparo del procesador | 500 ms, errores tragados | esta fase |
| Peor caso encadenado, en caliente | ≈ 3,5 s + HMAC | suma de los tres |

Los 10 s bastan pero no sobran: el peor caso en caliente deja 1,5 s de margen contra los 5 s de Meta,
y ese margen es exactamente lo que se come un arranque en frío. Medirlo es el punto 9 del acta.

---

## 2. Precondiciones

| # | Precondición | Origen | Cómo se verifica |
|---|---|---|---|
| P1 | App de Meta nueva, tipo Business, bajo el portfolio de Boosty Digital LLC | `04` A2 | El App Dashboard muestra el App ID y `Verified` en Review → Verification |
| P2 | Zona `kavea.ai` delegada a Netlify DNS y nameservers cambiados en GoDaddy | `06` §3 | `dig NS kavea.ai` devuelve `dns[1-4].p05.nsone.net` |
| P3 | Sitio de Netlify de la ingesta creado, con `base = hooks/` y dominio `hooks.kavea.ai` con certificado emitido | `06` §2 | `curl -sv https://hooks.kavea.ai/` muestra certificado válido y lo sirve Netlify |
| P4 | App Secret y verify token como variables de entorno **de ese sitio**, no de la organización | `02` §5.4 | Aparecen en Site configuration → Environment variables con alcance limitado al sitio de hooks |
| P5 | Credenciales de Supabase (URL del proyecto y clave de rol de servicio) en el mismo sitio | esta fase | Una invocación de prueba lee y escribe una fila de descarte |
| P6 | `GRAPH_API_VERSION=v26.0` como variable única leída por todos los clientes HTTP | `03` invariantes | Ninguna cadena `graph.facebook.com/v` con versión literal en el repositorio |
| P7 | Cuenta de Netlify en plan de pago, ya existente | `06` §1.1 | La cuenta es Pro |
| P8 | Tablas `organizations`, `meta_connections`, `meta_asset_routes` y `webhook_events` desplegadas según `02` §7 | `02` §7 | La migración corre limpia en un proyecto vacío |
| P9 | Al menos una Página de staging con tarea de mensajería concedida al system user de Kavea | `04` §2 | `GET /me/accounts` la lista con la tarea correcta en `tasks` |
| P10 | Page Access Token derivable para esa Página | `04` §2.4 nº2 | `GET /{page-id}?fields=access_token` devuelve token |
| P11 | Resultado del test de `04` §5 anotado | `04` §5 | Se sabe si `POST /subscribed_apps` funciona con Standard Access o si el App Review es ruta crítica |

**Sobre P2 y P3, que son nuevas y bloquean.** La versión anterior de este plan no tenía dependencia de
DNS: `*.workers.dev` existía desde el primer minuto con certificado emitido por Cloudflare. Ahora la
URL del receptor es `https://hooks.kavea.ai/meta` y no existe hasta que el cambio de nameservers de
`06` §3 esté hecho y Netlify haya emitido el certificado. Al 2 de agosto ese cambio está **pendiente**
en GoDaddy.

Hay una salida provisional y tiene un coste que hay que entender antes de tomarla: se puede registrar
en el App Dashboard la URL `*.netlify.app` que Netlify asigna al sitio, y cambiarla después. **El
cambio no es gratis.** La URL de callback es un ajuste a nivel de app que afecta a los tres topics a
la vez, obliga a rehacer el handshake y se trata como una ventana de cambio, no como un refactor. La
recomendación es hacer el cambio de nameservers antes de registrar nada. Si el calendario obliga a lo
contrario, se registra la URL provisional y el re-registro entra en el plan con fecha y responsable.

**Sobre P4.** Las variables de entorno de Netlify pueden definirse a nivel de equipo o de sitio. El
App Secret y el verify token se definen **solo en el sitio de hooks**. No es cosmético: es la única
forma de que un despliegue de la interfaz no pueda leerlos por accidente y de que la superficie de
exposición coincida con la de la separación de despliegues.

**Sobre P11.** Si el test de `04` §5 falla, esta fase se construye y se prueba igual contra la Página
de Boosty en modo desarrollo, pero suscribir Páginas de clientes queda bloqueado hasta el App Review.
Cambia el calendario, no el diseño.

**Consecuencia de `04` C2 (Require app secret).** Con ese ajuste activo, toda llamada a Graph API
necesita `appsecret_proof`. El cron de reconciliación es la primera llamada saliente del proyecto y
falla con 400 si se olvida. Está contemplado en la tarea 10.

---

## 3. Entregables

| # | Entregable | Dónde |
|---|---|---|
| E1 | Sitio de Netlify de la ingesta, con `hooks.kavea.ai` y sin ninguna redirección comodín | `hooks/netlify.toml` |
| E2 | Function sincrónica receptora, ruta `/meta` | `hooks/netlify/functions/meta.mts` |
| E3 | Background Function del procesador de bitácora | `hooks/netlify/functions/procesador-background.mts` |
| E4 | Background Function del drenaje de Blobs | `hooks/netlify/functions/drenaje-background.mts` |
| E5 | Background Function de reconciliación de suscripciones | `hooks/netlify/functions/reconciliacion-background.mts` |
| E6 | Scheduled Function `latido`, cada minuto: reloj del procesador y del drenaje | `hooks/netlify/functions/latido.mts` |
| E7 | Scheduled Function `reloj-reconciliacion`, cada 15 minutos, más la diaria de salud de credenciales | `hooks/netlify/functions/reloj-reconciliacion.mts` |
| E8 | Módulo de alertas: salida por Resend y deduplicación con compare-and-set sobre Blobs | `hooks/src/alertas.ts` |
| E9 | Migración: cola y bitácora sobre `webhook_events` (`cuerpo_crudo`, `ingesta_id`, `estado`, `ruta`, `duracion_ms`, `drenado_en`) y el RPC de reclamación | `supabase/migrations/` |
| E10 | Migración: tabla `alertas` como espejo para el panel interno | `supabase/migrations/` |
| E11 | Migración: tabla `ingesta_pulso` y vistas de observabilidad | `supabase/migrations/` |
| E12 | Fixtures de payload firmables, incluida la de unicode escapado | `pruebas/fixtures/` |
| E13 | Script de firma y envío para pruebas manuales | `pruebas/firmar.ts` |
| E14 | Constante de `subscribed_fields` confirmada contra el enum real | variables de entorno + acta |
| E15 | Acta de mediciones empíricas de la fase | `docs/fases/01-mediciones.md` |

E15 no es documentación decorativa. Cierra varios de los `inciertos` de `03`, cierra las dudas nuevas
que abre la plataforma y es la entrada de la fase 2.

---

## 4. Tareas

### Tarea 1 — El sitio de la ingesta: dominio, despliegue y qué hay delante del código

La ingesta va en un **sitio de Netlify aparte**, con `base = hooks/`, no como una ruta más del sitio de
la aplicación. Es lo único que queda del principio de separar dominios de fallo: un despliegue roto de
la interfaz no puede tumbar la recepción de webhooks, porque son dos despliegues con dos ciclos
distintos. Conviene ser exacto sobre qué protege eso y qué no: protege del despliegue roto y del
error humano en el sitio equivocado; **no protege de una incidencia de plataforma de Netlify**, que
ahora apaga la interfaz y la ingesta a la vez. Eso está en el balance de la sección 5 como pérdida.

```toml
# hooks/netlify.toml
[build]
  functions = "netlify/functions"
  publish   = "public"        # directorio vacío a propósito: este sitio no sirve páginas

# Sin [[redirects]]. Ni uno. Ver la lista de trampas de abajo.
```

```ts
// hooks/netlify/functions/meta.mts — Functions v2, firma estándar de la Fetch API
import type { Config, Context } from '@netlify/functions';

export default async (req: Request, context: Context): Promise<Response> => { /* tarea 5 */ };

export const config: Config = { path: '/meta' };
```

#### Qué capas hay delante del código

Esta es la lista que sustituye a la de trampas de zona de Cloudflare. Es más corta pero ninguna de
estas es teórica: cada una rompe la ingesta de una forma distinta y todas son silenciosas.

- **Redirecciones comodín.** Un `[[redirects]]` con `from = "/*"`, o un `_redirects` con el fallback
  de SPA, se traga `/meta` antes de que la función exista. El sitio de hooks no tiene ninguna
  redirección, y que no la tenga es criterio de aceptación, no una convención.
- **Edge Functions.** Una Edge Function declarada sobre `/*` corre antes que la función y puede leer
  o reescribir el cuerpo. En este sitio no se despliega ninguna. Si algún día hace falta una, hay que
  volver a verificar que los bytes llegan intactos: es exactamente el escenario que el
  `03` describe como "ningún proxy que reescriba el cuerpo".
- **Functions v2 obligatoria.** La firma legacy `exports.handler = async (event) => …` entrega
  `event.body` como **string** más una bandera `isBase64Encoded`. Ese round-trip es un sitio donde los
  bytes pueden cambiar, y cambiar bytes es romper el HMAC. Con v2 se recibe un `Request` estándar y
  `await req.arrayBuffer()` da los bytes que llegaron por el socket. **La firma legacy está prohibida
  en este repositorio.**
- **`getStore`, nunca `getDeployStore`.** Netlify Blobs ofrece stores de sitio y stores por despliegue.
  Un store por despliegue **pierde de vista los objetos pendientes en cuanto se publica una versión
  nueva**, que es justo lo que pasa durante un incidente cuando alguien despliega el arreglo. El
  amortiguador usa un store de sitio y esto se comprueba en revisión de código.
- **Protección del sitio.** La protección por contraseña de Netlify, si se activa en producción,
  convierte cada entrega de Meta en un 401 de plataforma. Producción no la lleva.
- **Contextos de despliegue.** Meta conoce una sola URL, la de producción. Los deploy previews tienen
  su propia URL y no reciben tráfico de Meta; no son un entorno de prueba válido para el handshake.
- **El límite de tamaño de petición de la función.** No está publicado en la página de resumen de
  Netlify Functions y el runtime subyacente impone el suyo. `03` dice que los lotes traen hasta 1000
  updates. **Es una verificación pendiente, punto 7 del acta**, y hasta cerrarla el guardarraíl
  `MAX_BYTES` se fija por debajo de lo que se mida, no por encima.

Lo que **no** hay que vigilar aquí, y merece decirse porque en el diseño anterior sí: Netlify publica
de forma atómica y no reparte tráfico por porcentaje entre versiones. Desaparece el riesgo de un
receptor a medio desplegar con dos comportamientos de firma distintos.

**Criterio de aceptación.** `curl -i https://hooks.kavea.ai/meta` sin parámetros devuelve **403 con
cuerpo `forbidden`**, generado por la función. Cualquier otra cosa —la página 404 de Netlify, un 401
de protección de sitio, un 200 con HTML— significa que la petición no llegó a la función y que Meta
tampoco llegaría. **La distinción entre "la función rechazó" y "algo anterior a la función rechazó"
es el criterio.** `curl -sv` muestra certificado válido para `hooks.kavea.ai` y ninguna redirección
previa. El repositorio no contiene ningún `_redirects` ni ningún bloque `[[redirects]]` bajo `hooks/`.

---

### Tarea 2 — Migración: la cola, la bitácora y el RPC de reclamación

`02` §7.6 define `webhook_events` como bitácora. En este diseño esa tabla es **bitácora y cola a la
vez**. La enmienda de las dos versiones anteriores de este plan sigue siendo válida y aquí es igual
de necesaria.

#### El cuerpo va en `text`, no en `jsonb`

**`jsonb` normaliza al almacenar: reordena claves, elimina espaciado y desescapa las secuencias
`\uXXXX`.** Meta manda `café` como `café` y firma sobre esa forma. Un cuerpo guardado como
`jsonb` ya no permite recalcular el HMAC ni reproducir el incidente. La columna es `text` y no se
convierte, ni ahora ni después.

```sql
-- El cuerpo crudo va en text. Es la única representación con la que la firma cuadra.
alter table public.webhook_events add column cuerpo_crudo text;
alter table public.webhook_events alter column cuerpo drop not null;

-- Identidad de ingesta: la genera el RECEPTOR antes de intentar escribir, y viaja igual
-- por el camino directo y por el de Blobs. Es lo que cierra el duplicado del drenaje.
alter table public.webhook_events add column ingesta_id uuid not null;
alter table public.webhook_events add constraint webhook_events_ingesta_id_key unique (ingesta_id);

-- Estado de cola. text con check, nunca enum (06 §4, regla 1).
alter table public.webhook_events add column estado text not null default 'pendiente'
  check (estado in ('pendiente','en_proceso','procesado','cuarentena'));
alter table public.webhook_events add column reclamado_en timestamptz;

-- Traza del camino que siguió el evento y cuánto costó.
alter table public.webhook_events add column ruta        text
  check (ruta in ('directa','blobs'));
alter table public.webhook_events add column duracion_ms integer;
alter table public.webhook_events add column drenado_en  timestamptz;

comment on column public.webhook_events.cuerpo_crudo is
  'Bytes del cuerpo decodificados como UTF-8, sin parsear. No convertir a jsonb: destruye el escapado unicode y con el la firma.';
comment on column public.webhook_events.ruta is
  'directa = el receptor escribio esta fila. blobs = la escribio el drenaje tras una caida de Postgres; recibido_en es el original y drenado_en el del rescate.';
```

El índice de cola sustituye al de `02` §7.6, que estaba escrito sobre `procesado_en is null`:

```sql
create index webhook_events_cola_idx
  on public.webhook_events (recibido_en)
  where estado = 'pendiente';
```

`cuerpo jsonb` se deja nullable y sin uso en fase 1. Si al final de la fase 2 sigue vacía se elimina;
es una decisión que necesita visto bueno explícito porque toca el esquema de `02` §7.6.

#### La reclamación: `for update skip locked` por RPC

El procesador reclama lotes con el patrón estándar. Va dentro de una función, y la función se invoca
por PostgREST: **una llamada, una transacción**, sin necesidad de mantener una sesión de Postgres
abierta desde Lambda ni de meter un pooler en el camino.

```sql
create or replace function private.webhook_events_reclamar(p_limite int)
returns setof public.webhook_events
language sql
volatile
security definer
set search_path = ''
as $$
  update public.webhook_events e
     set estado       = 'en_proceso',
         intentos     = e.intentos + 1,
         reclamado_en = now()
   where e.id in (
     select id
       from public.webhook_events
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
procesar dos veces la misma fila. Y hace falta un segador, porque una Background Function puede morir
con filas reclamadas: **toda fila en `en_proceso` con `reclamado_en` de hace más de 20 minutos vuelve a
`pendiente`**. Veinte minutos es el techo de la Background Function más margen. Una fila que ha vuelto
más de cinco veces pasa a `cuarentena` y genera alerta P1: es el equivalente de la DLQ que Queues daba
hecha, y aquí hay que escribirlo.

#### La columna `firma_ok` deja de discriminar, y se dice en voz alta

`02` §7.6 declara `firma_ok boolean not null`. En este diseño **los cuerpos con firma inválida nunca se
guardan**, ni en Postgres ni en Blobs, así que esa columna vale `true` en el cien por cien de las
filas, siempre, por construcción.

**Decisión: la columna se queda y el constraint también.**

```sql
alter table public.webhook_events
  add constraint webhook_events_firma_ok_chk check (firma_ok);
```

El motivo es que su valor no es informativo, es de contención: es una red que hace fallar en voz alta
cualquier cambio futuro que empiece a persistir cuerpos sin verificar, con independencia de lo que
haga el código. Un `insert` con `firma_ok = false` no llega a la tabla.

Y la parte que hay que dejar escrita para que nadie la monte mal: **`firma_ok` no es una señal y no
puede haber ninguna alerta ni ninguna vista construida sobre ella.** `select count(*) from
webhook_events where not firma_ok` devuelve cero siempre, y un cero permanente en un panel se lee como
"todo va bien" cuando en realidad no se está midiendo nada. La señal real de firmas inválidas es el
**contador de respuestas 401** y la alerta P1 sin umbral de la tarea 4. Si alguien quiere un número de
firmas inválidas, sale de `alertas`, no de `webhook_events`.

#### Tabla de alertas

`02` no define una y la invariante de desuscripción exige "alerta interna". Entra aquí como **espejo
para el panel interno**, no como camino primario: el camino primario sale por Resend y no puede
depender de Postgres, porque la alerta que más importa es la que se produce cuando Postgres no está.

```sql
create table public.alertas (
  id              bigserial primary key,
  tipo            text not null,   -- firma_invalida | postgres_caido | ingesta_caida_total
                                   -- | blobs_atascado | drenaje_fallido | cuarentena
                                   -- | desuscripcion | reconciliacion_fallida | token_invalido
                                   -- | backlog | silencio
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
es rechazado por el constraint. Dos llamadas concurrentes a `webhook_events_reclamar(10)` sobre 20
filas pendientes devuelven diez filas cada una, sin solape. El segador devuelve a `pendiente` una fila
que se dejó en `en_proceso` con fecha antigua.

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
      iguales(token, process.env.META_VERIFY_TOKEN!)) {
    return new Response(challenge, {
      status:  200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
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
revalida el endpoint durante un incidente, no puede fallar por algo que no necesita.

**Criterio de aceptación.**

```bash
URL=https://hooks.kavea.ai/meta
curl -s "$URL?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=$META_VERIFY_TOKEN" | xxd | tail -2
```

La salida es exactamente `1158201444` y diez bytes, sin `0a` final. Con un token equivocado devuelve
403. Con `hub.mode=unsubscribe` devuelve 403. Con Supabase apagado sigue devolviendo el challenge.

---

### Tarea 4 — Validación de firma sobre el cuerpo crudo

Esta es la tarea que decide si Kavea funciona en Venezuela, República Dominicana y México. **No cambia
con la plataforma**: la Fetch API es la misma en una Netlify Function v2 que en un Worker o en Deno, y
el error posible es idéntico.

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

#### Cómo se obtiene el cuerpo crudo en una Netlify Function

Una función v2 recibe un `Request` estándar de la Fetch API. El cuerpo es un `ReadableStream` que
**solo se puede consumir una vez**:

```ts
export default async (req: Request, context: Context): Promise<Response> => {
  // Primera y única lectura del stream. Los bytes exactos que llegaron por el socket.
  const bytes = new Uint8Array(await req.arrayBuffer());
  // A partir de aquí req.json(), req.text() y req.formData() lanzan.
};
```

- `req.arrayBuffer()` entrega los bytes sin transformar. Es la única fuente admisible para el HMAC.
- `req.text()` también sirve, porque decodifica UTF-8 sin reinterpretar el contenido: las secuencias
  `é` son literales ASCII dentro del JSON y sobreviven al decodificado. Se prefiere
  `arrayBuffer()` porque el HMAC opera sobre bytes y evita una reconversión.
- `req.json()` está prohibido en este handler. No es una recomendación de estilo: es el bug.
- `req.clone()` no hace falta y duplica el cuerpo en memoria.
- La firma legacy con `event.body` e `isBase64Encoded` está prohibida, por lo dicho en la tarea 1.
- Entre Meta y la función no hay parseador de cuerpo, así que el problema clásico de Express
  (`express.json()` consumiendo el stream antes del handler) no aplica. **Sí aplica el riesgo de
  interponer algo**: una Edge Function o una redirección en el sitio de hooks vuelven a poner un
  intermediario entre Meta y los bytes. Por eso la tarea 1 los prohíbe y por eso está en el criterio
  de aceptación y no en una nota.
- Lo que se guarda en Postgres es el **string decodificado**, en una columna `text`, y lo que se
  guarda en Blobs son los **bytes originales**. Las dos representaciones permiten recalcular el HMAC.
  Lo que rompe es `JSON.stringify(JSON.parse(texto))`, que es otra operación y no ocurre en ningún
  punto de este camino.

```ts
// hooks/src/firma.ts
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
`webhook_events`, ni objeto en Blobs. Es contenido controlado por un tercero no autenticado y meterlo
en la cola lo convierte en entrada del normalizador de fase 2. Se registra una alerta con metadatos y
nada más.

Un detalle que el cambio de plataforma mejora y conviene anotar: con un solo proveedor, el App Secret
vive en un único almacén de secretos. La clase entera de fallos por desincronización entre dos
entornos, que `02` §5.3 admitía como precio de la decisión anterior, desaparece.

**Criterio de aceptación.** Los casos de la tarea 14 pasan, incluida la fixture con unicode escapado. Y
una prueba de regresión que falla a propósito: un commit que introduzca
`JSON.stringify(JSON.parse(cuerpo))` antes del HMAC debe hacer fallar la suite en la fixture de unicode
y pasar en la fixture ASCII. Si ambas fallan o ambas pasan, la suite no está probando lo que cree.

---

### Tarea 5 — El receptor: Postgres primero, Blobs después, 200 casi siempre

```ts
// hooks/netlify/functions/meta.mts
import { getStore } from '@netlify/blobs';
import { firmaValida } from '../../src/firma';

// Guarda contra floods. Se fija POR DEBAJO del límite de petición que mida el punto 7
// del acta: un 413 a una entrega legítima cuenta como fallo de entrega.
const MAX_BYTES = 5 * 1024 * 1024;

const MS_POSTGRES  = 1_500;
const MS_BLOBS     = 1_500;
const MS_DISPARO   =   500;

export default async (req: Request, context: Context): Promise<Response> => {
  const t0 = Date.now();

  if (req.method === 'GET')  return handshake(req);
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const declarado = Number(req.headers.get('content-length') ?? '0');
  if (declarado > MAX_BYTES) return new Response('payload too large', { status: 413 });

  // Se comprueba la forma de la cabecera antes de gastar CPU en el HMAC.
  const cabecera = req.headers.get('x-hub-signature-256');
  if (!cabecera?.startsWith('sha256=')) {
    await alertar('firma_invalida', 'p1', { motivo: 'cabecera ausente o mal formada' });
    return new Response('missing signature', { status: 401 });
  }

  // Los BYTES, una sola vez, antes de nada. Nunca req.json().
  const bytes = new Uint8Array(await req.arrayBuffer());

  if (!(await firmaValida(bytes, cabecera, process.env.META_APP_SECRET!))) {
    await alertar('firma_invalida', 'p1', { bytes: bytes.byteLength });
    return new Response('signature mismatch', { status: 401 });
  }

  // Identidad de ingesta: se genera ANTES de intentar escribir y viaja por los dos caminos.
  // Es lo que permite que el drenaje no cree una segunda fila si el insert sí commiteó.
  const ingestaId   = crypto.randomUUID();
  const recibidoEn  = new Date().toISOString();
  const cuerpoCrudo = new TextDecoder('utf-8').decode(bytes);   // solo para transportar

  // 1. Camino normal: Postgres.
  try {
    await insertarEvento({
      ingesta_id: ingestaId, recibido_en: recibidoEn, firma_ok: true,
      cuerpo_crudo: cuerpoCrudo, cuerpo_bytes: bytes.byteLength,
      ruta: 'directa', duracion_ms: Date.now() - t0,
    }, MS_POSTGRES);

    // Disparo inmediato del procesador. Presupuesto corto y errores TRAGADOS:
    // el latido de la tarea 7 es la red de seguridad y esto no puede tocar el 200.
    await dispararProcesador(MS_DISPARO).catch(() => {});

    return new Response('EVENT_RECEIVED', { status: 200 });
  } catch (ePg) {
    // 2. Amortiguador: Blobs, con consistencia FUERTE. Ver tarea 6.
    try {
      const store = getStore({ name: 'ingesta-emergencia', consistency: 'strong' });
      await conTimeout(store.set(claveBlob(recibidoEn, ingestaId), bytes, {
        metadata: {
          ingesta_id: ingestaId, recibido_en: recibidoEn,
          bytes: bytes.byteLength, sha256: await sha256Hex(bytes),
          motivo: String(ePg).slice(0, 200), intentos: 0,
        },
      }), MS_BLOBS);

      await alertar('postgres_caido', 'p1', { ingesta_id: ingestaId }).catch(() => {});
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (eBlobs) {
      // 3. Los dos almacenes caídos. 500 a propósito: Meta reintenta un 500;
      //    un 200 pierde el evento para siempre. Este es el riesgo aceptado de 06 §1.1.
      await alertar('ingesta_caida_total', 'p1', {
        pg: String(ePg).slice(0, 200), blobs: String(eBlobs).slice(0, 200),
      }).catch(() => {});
      return new Response('storage unavailable', { status: 500 });
    }
  }
};
```

Notas de diseño:

- **El timeout de Postgres es el disparador del camino de emergencia, no un error.** Sin él, una base
  lenta cuelga la función hasta los 10 s y se come el presupuesto de Meta antes de haber intentado
  Blobs. Los 1 500 ms son una hipótesis inicial: se calibran contra el p99 real medido, con la regla
  de que el timeout debe estar cómodamente por encima del p99 de una base sana y cómodamente por
  debajo de lo que deja intentar Blobs y responder.
- **Nada de `ctx.waitUntil()`, porque no existe.** El disparo del procesador y la alerta se pagan antes
  del 200. Por eso llevan presupuesto y por eso sus fallos se tragan con `.catch(() => {})`. Un fallo
  al alertar no puede convertir un evento bien guardado en un 500.
- **La alerta va antes del 200 y eso cuesta.** Cuando Postgres está caído, cada entrega paga el
  timeout de Postgres más la escritura a Blobs más el intento de alerta. La deduplicación de la tarea
  11 es lo que evita que ese coste sea un correo por evento; el compare-and-set falla rápido y el
  camino sale barato a partir del segundo evento.
- **La escritura a Postgres va por PostgREST sobre HTTPS**, con la clave de rol de servicio. No hace
  falta pooler ni conexión TCP desde Lambda, y el `for update skip locked` del procesador vive dentro
  del RPC, que es una sola llamada y una sola transacción.
- No hay cabeceras CORS ni manejador de `OPTIONS`. Meta no hace preflight.

**Criterio de aceptación.** Una entrega firmada devuelve 200 con
`curl -o /dev/null -s -w '%{http_code} %{time_total}'` por debajo de 0,5 s en caliente y por debajo de
5,0 s en frío. Aparece exactamente una fila en `webhook_events` con `ruta = 'directa'`. **Con Supabase
apagado por completo, la respuesta sigue siendo 200 y el evento aparece en Blobs.** Con Supabase
apagado y Blobs inalcanzable, la respuesta es 500 y llega la alerta. Estas tres se ejecutan de verdad;
la segunda es la que justifica la decisión de plataforma entera.

---

### Tarea 6 — El amortiguador de Blobs: claves, listado, drenaje y limpieza

Esta tarea es la que sustituye a Cloudflare Queues y es la más delicada de la fase, porque **Blobs no
es una cola**. No hay entrega garantizada, ni reintentos, ni cola de mensajes muertos, ni métrica de
profundidad, ni métrica de edad. Todo eso se escribe a mano aquí. Un amortiguador de emergencia mal
diseñado es peor que no tenerlo, porque da la sensación de red sin serlo.

#### Límites verificados el 2 de agosto de 2026

| Pieza | Límite |
|---|---|
| Tamaño de objeto | 5 GB |
| Metadata por objeto | 2 KB |
| Longitud de clave | 600 bytes |
| Página de `list()` | 1 000 entradas |
| Consistencia | **eventual por defecto**, con propagación de hasta 60 s; la fuerte se pide explícitamente |

Los 5 GB por objeto hacen que el problema que dominaba el diseño anterior —el tope de 128 KB por
mensaje de Queues y el desborde a R2— desaparezca por completo. Un lote de 1000 `entry[]` cabe sin
partirlo. Eso son dos piezas y dos modos de fallo menos.

#### Consistencia fuerte, explícita

El store se abre **siempre** con consistencia fuerte, tanto en el receptor como en el drenaje:

```ts
const store = getStore({ name: 'ingesta-emergencia', consistency: 'strong' });
```

El motivo es concreto. Con consistencia eventual, un objeto escrito durante la caída puede tardar hasta
60 segundos en ser visible globalmente. El drenaje corre cada minuto: listaría un store que parece
vacío, concluiría que no hay nada pendiente, y el borrado posterior de la limpieza actuaría sobre una
vista antigua. Se paga con lecturas más lentas, y ese pago cabe en el presupuesto porque el camino de
Blobs solo se recorre durante un incidente.

**Queda una duda que hay que medir, no suponer:** la documentación describe la opción de consistencia
sobre el store y sobre las lecturas individuales, pero no afirma explícitamente que `list()` la honre.
Es el punto 12 del acta. Mientras no esté cerrado, el drenaje no borra nada basándose solo en un
listado: borra un objeto concreto después de haber confirmado su fila en Postgres.

#### Disciplina de claves

```
crudo/<YYYYMMDDTHHMMSSsssZ>-<ingesta_id>
cuarentena/<YYYYMMDDTHHMMSSsssZ>-<ingesta_id>
```

Cuatro decisiones dentro de ese formato:

1. **La marca temporal va primero y en formato compacto y ordenable.** Las claves ordenan
   lexicográficamente igual que cronológicamente, así que el listado sale en orden de llegada sin
   ordenar nada.
2. **`ingesta_id` va en la clave**, no solo en la metadata. La clave es autocontenida: identifica el
   evento sin abrir el objeto, y ese identificador es el mismo que la columna `unique` de
   `webhook_events`. Son unos 62 bytes de los 600 disponibles.
3. **El prefijo separa los dos espacios.** `crudo/` es el pendiente; `cuarentena/` es lo que el drenaje
   no consiguió meter en Postgres tras varios intentos. Se listan por separado y disparan alertas
   distintas.
4. **El orden de drenaje es cronológico pero no es una garantía de la que dependa nada.** Meta ya no
   garantiza orden (`02` §6.6) y `03` fija que el orden real se deriva del `timestamp` del evento, que
   viene en milisegundos. El orden del drenaje es una conveniencia para que la bandeja se rellene de
   forma sensata, no una propiedad del sistema.

#### Metadata, que es donde vive el estado

Cabe en los 2 KB con holgura y **no contiene contenido de mensajes**, solo metadatos:

| Campo | Para qué |
|---|---|
| `ingesta_id` | Clave de deduplicación contra `webhook_events` |
| `recibido_en` | Instante real de la entrega, que es el que va a la fila, no el del rescate |
| `bytes` | Tamaño, para la métrica |
| `sha256` | Integridad: el drenaje comprueba que lo que lee es lo que se escribió |
| `motivo` | Por qué falló Postgres. Truncado |
| `intentos` | Contador de drenajes fallidos. Vive aquí y no en Postgres, porque Postgres puede ser justo lo que no está |

#### El drenaje

Corre en una Background Function, invocada por el latido de la tarea 7. Los 15 minutos importan: el
drenaje ocurre justo después de una caída, que es cuando hay más volumen acumulado, y es el peor
momento posible para quedarse corto con los 30 s de una Scheduled Function.

```
para cada objeto en list({ prefix: 'crudo/', paginate: true }), en orden de clave:
  1. getWithMetadata(clave)                      → bytes + metadata
  2. comprobar sha256; si no cuadra → cuarentena + P1
  3. insert into webhook_events (...) on conflict (ingesta_id) do nothing
       ruta = 'blobs', recibido_en = metadata.recibido_en, drenado_en = now()
  4. si el paso 3 termina sin error (haya insertado o no) → delete(clave)
  5. si el paso 3 falla → metadata.intentos++ ; si intentos >= 5 → mover a cuarentena/ + P1
```

Tres propiedades de ese bucle:

- **El borrado va después de la confirmación, nunca antes.** Es entrega al-menos-una-vez sobre un
  destino idempotente, que da el efecto de exactamente-una-vez. Al revés se pierden eventos.
- **`on conflict (ingesta_id) do nothing` es lo que cierra el duplicado**, y hay un caso concreto en el
  que ocurre de verdad: el `insert` del receptor commitea en Postgres pero la respuesta se pierde o
  llega después del timeout de 1 500 ms. El receptor concluye que falló y vuelca a Blobs. Sin la clave
  única compartida, ese evento acabaría dos veces en la bitácora y dos veces en la cola del
  normalizador. Con ella, el drenaje ve el conflicto, no inserta nada, borra el objeto y sigue. **Ese
  caso hay que provocarlo en la prueba, no razonarlo.**
- **La cuarentena es la DLQ escrita a mano.** No caduca sola y no se borra sin mirarla. Como contiene
  texto de usuarios finales, lleva **borrado a los 7 días**, ejecutado por el barrido diario, con la
  incidencia sobreviviendo como fila en `alertas` con metadatos y sin contenido. Blobs no tiene reglas
  de ciclo de vida: esa caducidad es código, y si no se escribe no existe.

#### Limpieza y vigilancia

El barrido del latido comprueba dos cosas que no se pueden consultar con SQL, porque Blobs no está en
Postgres:

- **`crudo/` debería estar vacío casi siempre.** Un objeto ahí de hace más de 15 minutos con Postgres
  sano significa que el drenaje no corre: alerta P1 `blobs_atascado`.
- **La profundidad y la edad del prefijo se publican en `ingesta_pulso`** (tarea 12) para que existan
  como serie temporal consultable. Con la salvedad honesta de que, mientras Postgres está caído, esa
  serie tampoco se escribe: durante el incidente la única señal es el correo.

**Criterio de aceptación.** Con Supabase pausado, tres entregas firmadas producen tres objetos bajo
`crudo/`, con las claves ordenadas por hora de llegada y la metadata completa. Al restaurar Supabase, el
siguiente latido las drena, `crudo/` queda vacío y las tres filas tienen `ruta = 'blobs'`,
`recibido_en` el original y `drenado_en` el del rescate. Invocar el drenaje otra vez no crea filas
nuevas. Un objeto con `sha256` manipulado acaba en `cuarentena/` con alerta P1 y no en la bitácora.

---

### Tarea 7 — Disparo del procesador y latencia de la bandeja

Con la cola en Postgres, la pregunta que no existía antes es **cómo se dispara el consumo**. Un cron de
un minuto significa hasta 60 s de retraso para que un mensaje aparezca en la bandeja, y eso es
inaceptable para una bandeja en vivo. La respuesta tiene dos mitades y está condicionada por una
propiedad de la plataforma que hay que fijar antes de diseñar nada.

#### Lo que las Scheduled Functions son y lo que no

Verificado en la documentación de Netlify el 2 de agosto de 2026:

| Propiedad | Valor |
|---|---|
| Límite de ejecución de una Scheduled Function | **30 segundos**. La documentación remite a Background Functions para lo que dure más |
| Sintaxis | cron estándar con granularidad de minuto. `* * * * *` y `*/15 * * * *` son válidos. Extensiones RFC salvo `@reboot` y `@annually` |
| Zona horaria | UTC |
| **Invocación por URL** | **No existe.** Solo por su cron, por "Run now" en el panel, o por `netlify functions:invoke` desde el CLI |
| Background Function | 15 minutos, invocable por HTTP, responde 202 de inmediato |

De ahí sale el patrón que gobierna las tres piezas asíncronas de esta fase: **Scheduled Function como
reloj, Background Function como trabajo.** El reloj no procesa nada; invoca por HTTP y termina en
milisegundos. Y una consecuencia que hay que tener presente al diseñar cualquier disparo manual: una
Scheduled Function **no sirve como red de seguridad invocable**, porque nadie puede invocarla. Lo que
tenga que poder dispararse desde fuera es una Background Function o una función normal protegida con
un secreto.

#### Disparo inmediato

El receptor, tras confirmar el `insert`, invoca por HTTP la Background Function del procesador. Como no
hay `ctx.waitUntil()`, esa invocación se paga antes del 200, y por eso:

- Se hace con un `AbortController` de **500 ms**. La invocación devuelve 202 de inmediato y en la
  práctica cuesta decenas de milisegundos dentro de la misma región; los 500 ms son el tope, no el
  coste esperado.
- **Cualquier fallo se traga.** Un procesador que no arranca es un retraso de como mucho un minuto,
  porque el latido lo recogerá. Un 500 a Meta por no haber podido invocar al procesador sería un error
  de diseño: el evento ya está guardado y Meta merece su 200.
- No se hace en la rama de Blobs. Si el evento fue a Blobs es porque no hay fila que procesar.

Conviene decir en voz alta lo que esto cuesta: **el número de invocaciones de funciones se duplica**,
porque cada webhook produce una invocación del receptor y una del procesador. `06` §1.1 ya señala
vigilar el consumo de invocaciones y esta es la razón concreta. Se mide, y si el volumen lo exige la
palanca es agrupar el disparo, no quitarlo.

#### Que no se pisen entre sí

Una ráfaga de cien webhooks dispara cien procesadores. `for update skip locked` hace que eso sea
**correcto** —ninguna fila se procesa dos veces— pero es derrochador. El procesador toma un
`pg_try_advisory_lock` sobre una clave fija al entrar y, si no lo consigue, sale de inmediato: ya hay
alguien drenando. El que sí lo consigue reclama lotes en bucle hasta que la cola queda vacía.

El grado de concurrencia es una perilla, no una constante: el lock puede tener N ranuras
(`pg_try_advisory_lock(clave, ranura)`) y N se fija con el volumen medido. En fase 1, con un tenant en
dogfooding, N = 1 sobra.

#### Red de seguridad

Una Scheduled Function `latido` con cron `* * * * *`. No procesa: mira y delega, dentro de sus 30 s.

1. ¿Hay filas `pendiente` en `webhook_events`? Invoca `procesador-background`.
2. ¿Hay algo bajo `crudo/` en Blobs? Invoca `drenaje-background`.
3. Devuelve a `pendiente` las filas `en_proceso` con más de 20 minutos.
4. Escribe una fila en `ingesta_pulso` con la profundidad y la edad de las dos colas.

**Latencia esperada.** Con el disparo inmediato, del 200 a la fila normalizada hay un salto de red y
un `insert`: sub-segundo. El minuto del latido es el suelo cuando el disparo inmediato falla, no el
comportamiento normal. Esa distinción es la que hay que medir: el p95 que importa no es el del latido,
es el del camino inmediato.

**Criterio de aceptación.** Con el latido deshabilitado, una entrega firmada aparece procesada en menos
de 2 s. Con el disparo inmediato deshabilitado a propósito, aparece procesada en menos de 70 s. Cien
entregas en ráfaga producen cien filas procesadas exactamente una vez, y en los logs se ve que la
mayoría de los procesadores salieron de inmediato por no obtener el lock.

---

### Tarea 8 — Procesador mínimo de bitácora

El procesador de fase 1 es deliberadamente corto. Reclama, escribe las columnas de traza de `02` §7.6 y
nada más. Es el esqueleto sobre el que crece el normalizador de la fase 2, así que conviene que el
límite quede escrito en el propio código.

```ts
// hooks/netlify/functions/procesador-background.mts
export default async (req: Request): Promise<Response> => {
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
};

export const config = { background: true };
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

1. **Nivel app**, una vez, en el App Dashboard → Webhooks: se registra la URL de callback
   (`https://hooks.kavea.ai/meta`) y el verify token, y se suscribe la app a los topics `page`,
   `instagram` y `whatsapp_business_account`, marcando los campos de cada uno.
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

Confirmado el enum, la lista vive en variables de entorno y **ahora en un solo sitio**, porque
onboarding y reconciliación comparten proveedor. El test de paridad entre entornos que exigía el diseño
anterior deja de hacer falta; lo que sí queda es que la lista sea una sola constante importada por los
dos consumidores, no dos literales.

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

### Tarea 10 — Reconciliación de suscripciones: reloj más trabajo

**Por qué existe.** Verbatim de `03`: a los 15 minutos de entregas fallidas Meta manda una alerta, y
tras 1 hora de fallos continuados la app queda **desuscrita** de esa Página o cuenta de Instagram, con
resuscripción manual. Una caída de una hora no degrada Kavea: la apaga por cliente y en silencio. No
hay error, no hay código de estado, no hay log. El cliente se entera cuando reclama.

**Por qué no en `pg_cron`.** El motivo de `02` §5.2 sobrevive intacto al cambio de plataforma: este
cron existe para recuperarse de una caída y tiene que funcionar cuando el resto no funciona; además
hace llamadas HTTPS salientes, que en `pg_cron` obligarían a `pg_net` y meterían la dependencia dentro
de la base de datos. Un planificador que vive dentro de la base no puede vigilar la caída de la base.

#### Por qué esto no cabe en una Scheduled Function

Los 30 segundos no son un detalle de implementación, son la restricción de diseño. Con 28 Páginas y
hasta tres comprobaciones por conexión son unas **84 llamadas a Graph API por ejecución**. En serie, a
300 ms por llamada, son unos 25 segundos. Cabe, pero el margen es del ancho de una latencia de cola:
una sola respuesta lenta, un reintento o un backoff por throttling y la ejecución muere a medias,
dejando la mitad de las conexiones sin comprobar y sin que nadie lo sepa.

Como orden de magnitud: **30 segundos dan para unas 100 llamadas en serie, es decir unas 33
organizaciones.** El primer cliente que entre después del dogfooding rompe ese techo.

Por eso el troceado se diseña desde el principio y no cuando falle:

```
reloj-reconciliacion   (Scheduled Function, "3,18,33,48 * * * *", UTC)
      └─ invoca por HTTP ─► reconciliacion-background   (Background Function, 15 min)
                                 └─ recorre todas las conexiones, con concurrencia acotada
```

El desplazamiento de los minutos evita coincidir con el latido en punto. El segundo cron diario
(`17 4 * * *`) hace la salud de credenciales (`GET /debug_token`) y la vigilancia de versión de
`02` §5.1, con el mismo patrón de reloj más trabajo.

```ts
const V = process.env.GRAPH_API_VERSION;   // v26.0. Nunca literal en el path.

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
  u.searchParams.set('appsecret_proof', await appsecretProof(pageToken, process.env.META_APP_SECRET!));

  const r = await fetch(u);
  const cuota = { app: r.headers.get('x-app-usage'), bucds: r.headers.get('x-business-use-case-usage') };
  const j = await r.json();

  if (!r.ok) {
    // 190 = token invalidado: se marca la conexión como desconectada y se PARA. No en bucle.
    // 4, 17, 32, 613, 80001/80002/80006 = throttling: respetar estimated_time_to_regain_access.
    return { estado: 'error', codigo: j?.error?.code, cuota };
  }

  const mia    = (j.data ?? []).find((a: any) => a.id === process.env.META_APP_ID);
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

**Dependencia que hay que decir en voz alta.** El cron necesita leer `meta_connections` y descifrar
tokens, así que **depende de Postgres**. Si Supabase está caído, el cron no puede reconciliar. En el
diseño anterior esa dependencia era una excepción dentro de un camino de ingesta independiente; aquí es
la norma, y lo único que la hace tolerable es que la incapacidad de leer la base sea en sí misma una
alerta P1 por un camino que no pasa por la base. El módulo de la tarea 11 cumple ese papel.

**Cadencia.** Cada 15 minutos, más una ejecución forzada tras cada despliegue del receptor y tras
cualquier incidente. Como una Scheduled Function no se puede invocar por URL, **la ejecución forzada se
hace invocando directamente la Background Function**, no el reloj. Se lee `X-App-Usage` en cada
respuesta y se baja a 30 minutos si el consumo sube: `03` es explícito en que seguir llamando durante
un throttling alarga el bloqueo.

**Criterio de aceptación.** Se desuscribe la app a mano de la Página de staging
(`DELETE /{page-id}/subscribed_apps`), se espera al siguiente ciclo y sin intervención humana: la app
vuelve a estar suscrita, hay alerta P1 de tipo `desuscripcion` con correo entregado,
`meta_connections.subscription_ok` pasó por `false` y volvió a `true`, y un DM posterior vuelve a
producir fila en `webhook_events`. El reloj termina en menos de 2 s: si tarda más, está haciendo
trabajo que no le toca.

---

### Tarea 11 — Alertas sin Durable Objects

El camino de alerta no puede depender de Postgres, porque la alerta que más importa es la que se
produce cuando Postgres no está. Sin Durable Objects, hace falta otro sitio donde guardar el estado del
cortacircuitos, y el único almacén que sigue en pie durante una caída de Supabase es **Blobs**.

La deduplicación se hace con compare-and-set. Netlify Blobs documenta las opciones `onlyIfNew` y
`onlyIfMatch` en `set()`, y eso es suficiente para que dos invocaciones concurrentes no manden dos
correos:

```
alertar(tipo, severidad, detalle):
  1. getMetadata(`ultima/${tipo}`)  → etag y marca temporal previa
  2. si han pasado menos de 10 minutos desde la marca → no se manda correo, solo se acumula
  3. set(`ultima/${tipo}`, '', { metadata: { ts: ahora }, onlyIfMatch: etag })
       └─ si el set es rechazado, otro proceso ganó la carrera: no se manda
  4. si el set fue aceptado → POST a Resend
  5. si Blobs tampoco responde → se manda el correo SIN deduplicar
```

El paso 5 es deliberado y es fail-open: cuando los dos almacenes están caídos, un correo duplicado es
mucho mejor que ningún correo. Es el único momento en que el flood de correos es aceptable, y el propio
flood es información.

Reglas:

- Las P1 salen en el primer ciclo. Las P2 se agrupan en un resumen cada 15 minutos, emitido por la
  Background Function de reconciliación, que ya corre a esa cadencia.
- El correo lleva tipo, severidad, recuento, ventana temporal y el `organization_id` cuando se conoce.
  **Nunca contenido de mensajes.**
- El espejo en la tabla `alertas` de Postgres lo escribe el procesador, en el mejor esfuerzo, para que
  el panel interno pueda mostrar el histórico. Que ese `insert` falle no impide el aviso.
- La alerta va primero a Boosty, no al cliente, según `02` §5.4.

**Honestidad sobre la garantía.** Un compare-and-set sobre un almacén de objetos es más débil que un
Durable Object: el DO daba serialización real por identificador, y esto da una carrera que se resuelve
casi siempre bien. Que `onlyIfMatch` se comporte de verdad como un compare-and-set atómico bajo
concurrencia es el **punto 13 del acta**, y hay que medirlo con una ráfaga real, no leerlo.

**Criterio de aceptación.** Provocar una firma inválida produce correo en menos de 60 s. Provocar 500
firmas inválidas seguidas en paralelo produce **uno o dos** correos, no 500, y el recuento agregado
aparece en el resumen. Con Supabase apagado, el correo sigue llegando. Con Supabase y Blobs apagados,
también llega, sin deduplicar.

---

### Tarea 12 — Observabilidad

Los logs de las funciones tienen retención corta y no son el registro. El registro es `webhook_events`.
En los logs solo va lo que no es contenido: método, resultado, bytes, `duracion_ms`, ruta, presencia de
la cabecera de firma. **Nunca el cuerpo.**

Aquí el cambio de plataforma es una mejora clara y conviene aprovecharla: con Postgres en el camino de
ingesta, **la observabilidad deja de estar partida en dos sistemas**. Latencia, tamaño, ruta y
contenido se cruzan en una sola consulta SQL, cosa que con Analytics Engine y la bitácora en sitios
distintos era imposible.

Lo que sí necesita ayuda es la parte que Postgres no ve: la profundidad del amortiguador de Blobs y la
edad de la cola. Eso lo publica el latido.

```sql
create table public.ingesta_pulso (
  momento           timestamptz primary key default now(),
  cola_pendientes   integer not null,
  cola_edad_s       integer,
  cola_en_proceso   integer not null,
  blobs_pendientes  integer not null,
  blobs_edad_s      integer,
  blobs_cuarentena  integer not null
);
```

Se retiene 30 días y el barrido diario borra lo anterior.

#### Qué se mide

| Métrica | Fuente | Para qué |
|---|---|---|
| Entregas por minuto | `webhook_events` | Línea base de tráfico y detección de silencio |
| p50 / p95 / p99 de `duracion_ms` | `webhook_events` | El presupuesto de 5 s es un techo, no un objetivo |
| Reparto entre `ruta = 'directa'` y `ruta = 'blobs'` | `webhook_events` | Salud real de Postgres vista desde el receptor |
| Distribución de `cuerpo_bytes` y máximo | `webhook_events` | Mide el lote real frente al supuesto de 1000 updates y calibra `MAX_BYTES` |
| Recuento de 401 por firma inválida | `alertas` y logs | Rotación de secreto, error de configuración o escaneo externo. **La señal de firma, no la columna `firma_ok`** |
| Recuento de 500 por almacenamiento no disponible | `alertas` y logs | El riesgo aceptado de `06` §1.1, medido |
| Profundidad y edad de la cola de Postgres | `ingesta_pulso` | Salud del procesador |
| Profundidad, edad y cuarentena de Blobs | `ingesta_pulso` | Salud del amortiguador. No hay otra forma de verlo |
| Latencia del disparo inmediato frente al latido | logs del procesador | Si la bandeja va en vivo o va a un minuto |
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
| Cualquier evento con `ruta = 'blobs'` | P1 | Postgres no respondió al receptor. La red funcionó, pero la red no es el sitio donde deben vivir los eventos |
| Objeto bajo `crudo/` con más de 15 minutos y Postgres sano | P1 | El drenaje no corre. El amortiguador se está llenando sin vaciarse |
| Cualquier objeto bajo `cuarentena/` | P1 | Un evento que el drenaje no supo meter en la base |
| Cualquier fila en `estado = 'cuarentena'` | P1 | El equivalente de un mensaje en la DLQ |
| p95 de `duracion_ms` > 2000 ms durante 5 minutos | P2 | Margen antes del techo de 5 s |
| Edad de la fila `pendiente` más antigua > 5 minutos | P1 | El procesador no está drenando y la bandeja va con retraso |
| Filas en `en_proceso` con más de 20 minutos que el segador no recupera | P1 | El segador tampoco corre |
| El reloj de reconciliación no corre o falla dos ciclos seguidos | P1 | Se pierde la única vigilancia sobre la desuscripción |
| El cron re-suscribe cualquier conexión | P1 | Hubo desuscripción real y hubo pérdida |
| Error 190 en cualquier conexión | P1 por tenant | Token invalidado: para, no reintentes |
| Sin entregas durante 2 horas en horario laboral | P1 | El fallo silencioso. Umbral a calibrar tras una semana de línea base |
| `cuerpo_bytes` por encima de 1 MB en una entrega | P2 informativo | Aprender el techo real del lote y su distancia al límite de petición de la función |

El umbral de silencio es el que más ajuste necesita: durante el dogfooding solo hay un tenant y el
tráfico nocturno es cero por razones legítimas. Se calibra con datos, no antes. La versión por
organización es de fase 3, cuando haya varios tenants con líneas base distintas.

**Un punto ciego que hay que nombrar.** Mientras Postgres está caído, ni `webhook_events` ni
`ingesta_pulso` se escriben. Durante el incidente, la única observabilidad son los correos de alerta y
los logs de la función. Eso es peor que en el diseño anterior, donde las métricas del receptor vivían
fuera de Postgres, y no hay forma de arreglarlo sin reintroducir un segundo proveedor. Se compensa con
que el correo de `postgres_caido` lleva recuento y ventana, y con que al restaurar la base el drenaje
reconstruye la serie con los `recibido_en` originales.

**Criterio de aceptación.** Las dos vistas y `ingesta_pulso` devuelven datos tras una hora de tráfico
real. Cada condición de la tabla se dispara al menos una vez en staging, provocada a mano, y produce la
alerta esperada. Una condición que no se ha visto disparar no está implementada.

---

### Tarea 13 — Endurecimiento del endpoint público

El endpoint no lleva autenticación de transporte por diseño, así que cualquiera puede llamarlo. Medidas
proporcionadas:

- Rechazo temprano: sin `X-Hub-Signature-256` bien formada no se lee el cuerpo ni se calcula HMAC.
- Guarda de `content-length` por debajo del límite de petición que mida el punto 7 del acta. Un 413 a
  una entrega legítima cuenta como fallo de entrega y alimenta el reloj de la hora, así que el
  guardarraíl se pone alto y solo se baja con datos.
- Sin cabeceras CORS y sin manejador de `OPTIONS`.
- Métrica del volumen de 401. Un pico sostenido es consumo de invocaciones, no un riesgo de datos, pero
  con facturación por invocación ese consumo tiene precio y hay que verlo.
- **Ninguna regla de límite de tasa delante de la función.** Sea cual sea la forma que tome si algún
  día hace falta, tiene que excluir el tráfico de Meta: una regla mal puesta aquí es una
  desuscripción, y una desuscripción silenciosa por cliente.
- v1 **no** valida el certificado de cliente de Meta. La autenticidad se establece con el HMAC. `03`
  marca el cambio de CA de los certificados mTLS (31-mar-2026, `meta-outbound-api-ca-2025-12.pem`) como
  corroborado solo por snippets, porque el changelog de Messenger Platform devuelve HTTP 500. Si Meta
  llegara a exigir mTLS de cliente, no hay mitigación disponible en Netlify hoy. Queda como riesgo
  abierto, igual que en el diseño anterior y por motivos distintos.

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
| `lote-grande.json` | 1000 `entry[]` sintéticos | El supuesto de tamaño de lote, el presupuesto de 5 s y el límite de petición de la función |

La fixture de unicode se genera **sin pasar por `JSON.stringify`**: se escribe a mano o se copia de una
entrega real capturada. Un generador que serialice un objeto de JavaScript produciría los caracteres ya
decodificados y la fixture dejaría de probar lo que debe.

#### 14.2 Entrega con firma válida

```bash
URL=https://hooks.kavea.ai/meta
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

El script portable `pruebas/firmar.ts` (E13) hace lo mismo sin `openssl` ni `xxd`, leyendo los **bytes**
del fichero con `readFile`, firmándolos y enviando exactamente esos bytes. Sirve en Windows y se
reutiliza en la suite. La misma comprobación corre en local contra `netlify dev`, cambiando la URL.

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

**Es la prueba central de la fase y es más importante que en el diseño anterior**, porque ahora es lo
único que demuestra que el camino de Blobs funciona. Un camino de emergencia que no se ejercita es un
camino que no funciona. Se ejecuta de verdad, y se repite en cada cambio que toque el receptor o el
drenaje.

Se hace en dos variantes, porque prueban cosas distintas:

**Variante A, fallo rápido.** Revocar la clave de rol de servicio. PostgREST responde 401 de inmediato,
el receptor cae al camino de Blobs sin agotar el timeout. Prueba la rama, no el presupuesto.

**Variante B, fallo lento.** Pausar el proyecto de Supabase. Las peticiones se quedan colgando y el
receptor agota los 1 500 ms antes de caer a Blobs. **Es la que importa**, porque es la que mide si el
presupuesto de tiempo aguanta: cada entrega paga el timeout entero.

Con la variante B:

1. Mandar tres DMs reales a la Página de staging.
2. El receptor devuelve **200** a los tres, y cada respuesta está por debajo de 5 s medida con
   `%{time_total}`. Si alguna pasa de 5 s, el presupuesto está mal repartido y hay que bajar el timeout
   de Postgres antes de seguir.
3. `list({ prefix: 'crudo/' })` devuelve exactamente tres objetos, con claves ordenadas por hora de
   llegada y metadata completa: `ingesta_id`, `recibido_en`, `bytes`, `sha256`.
4. Llega alerta P1 `postgres_caido`, una sola vez y no tres, con recuento agregado. No llega ninguna
   `ingesta_caida_total`.
5. Restaurar Supabase. En el siguiente latido, como mucho 60 s después, aparecen las tres filas con
   `ruta = 'blobs'`, `recibido_en` el original de la entrega y `drenado_en` el del rescate.
6. `crudo/` queda vacío. **Sin pérdidas: tres entregas, tres filas.**
7. **Sin duplicados:** invocar `drenaje-background` otra vez a mano y comprobar que no aparece ninguna
   fila nueva.
8. El caso de duplicado real, que hay que provocar y no razonar: escribir a mano en Blobs un objeto
   cuyo `ingesta_id` ya exista en `webhook_events`, invocar el drenaje y comprobar que no se crea una
   segunda fila y que el objeto se borra igual. Es exactamente el escenario del `insert` que commiteó
   pero cuya respuesta se perdió.

Con la arquitectura anterior este escenario terminaba con la cola de Cloudflare acumulando y el
receptor sin enterarse. Con esta, termina con Blobs acumulando y el receptor pagando latencia. El
resultado observable para Meta es el mismo —200 en todas— y ese es el punto.

#### 14.6 Los dos almacenes caídos

El escenario que el diseño anterior no tenía. Pausar Supabase y, a la vez, dejar Blobs inalcanzable
(nombre de store inválido en una rama de prueba, o credenciales rotas):

1. La respuesta es **500**, no 200. Un 200 aquí perdería el evento para siempre.
2. El 500 llega dentro del presupuesto, no al agotar los 10 s de la función. Si llega al techo, los dos
   timeouts encadenados están mal fijados.
3. Llega alerta P1 `ingesta_caida_total` aunque Blobs, que es donde vive el cortacircuitos, esté caído:
   el fail-open del paso 5 de la tarea 11 es lo que se está probando.
4. Meta reintenta y, al restaurar cualquiera de los dos almacenes, el evento entra.

#### 14.7 Latencia del procesador

1. Con el latido deshabilitado, una entrega firmada pasa de `pendiente` a `procesado` en menos de 2 s.
2. Con el disparo inmediato deshabilitado, en menos de 70 s.
3. Cien entregas en ráfaga: cien filas, cada una procesada exactamente una vez, y en los logs se ve que
   la mayoría de las invocaciones del procesador salieron de inmediato sin obtener el lock.

#### 14.8 Reintento y desuscripción

Solo en staging y sobre una Página de pruebas, porque el resultado esperado es que Meta desuscriba esa
Página. Es el objetivo del experimento.

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
solo deduplica el camino directo contra el de Blobs.

#### 14.9 El botón de prueba del App Dashboard

El Dashboard tiene un envío de payload de muestra por topic. Dos cosas que comprobar antes de usarlo
como prueba: si firma el payload con el App Secret, y qué identificadores lleva. Si no firma, el
receptor lo rechazará con 401 y ese es el comportamiento correcto, no un fallo. Sus identificadores son
ficticios y en la fase 2 caerán en cuarentena por no resolver contra `meta_asset_routes`.
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
4. Backoff real de reintentos de Meta y tiempo hasta la desuscripción.
5. Si `/{ig-business-account-id}/subscribed_apps` existe y responde, o si la suscripción de Instagram
   vive solo en la Página.
6. Forma real del primer webhook de WhatsApp: valor de `object`, estructura de `entry[]`, qué
   identificador lleva `entry[].id`, dónde vive `phone_number_id`, y si viene firmado con el mismo App
   Secret.
7. **Límite de tamaño de petición de una Netlify Function sincrónica.** No está publicado en la página
   de resumen. Es el análogo del tope de mensaje que en el diseño anterior obligaba al desborde a R2, y
   hasta cerrarlo `MAX_BYTES` es una suposición. Se mide enviando `lote-grande.json` y payloads
   sintéticos crecientes hasta encontrar el punto de rechazo, y anotando qué código devuelve.
8. Distribución de tamaño de lote y de `entry[]` por entrega. Con Postgres absorbiendo megabytes en una
   columna `text`, esto ya no decide una ruta de desborde, pero sí calibra el guardarraíl y valida o
   refuta el supuesto de 1000 updates.
9. **p50/p95/p99 del receptor en frío y en caliente**, y coste del arranque en frío de una Netlify
   Function. Es la medición que decide si el timeout de 1 500 ms para Postgres es correcto o generoso.
10. **Latencia del disparo inmediato**: del 200 al `estado = 'procesado'`, p50 y p95, separando el
    camino inmediato del camino del latido.
11. Si el botón de prueba del Dashboard firma sus payloads.
12. **Si `list()` de Netlify Blobs honra la consistencia fuerte del store.** La documentación la
    describe para el store y para las lecturas individuales, pero no lo afirma para el listado. Decide
    si el drenaje puede fiarse de un listado o si tiene que seguir confirmando objeto a objeto.
13. **Si `onlyIfMatch` se comporta como un compare-and-set atómico bajo concurrencia real.** De ello
    depende que el cortacircuitos de alertas mande un correo y no cincuenta.
14. **Coste en invocaciones.** Cuántas invocaciones al mes produce el tráfico real con el disparo
    inmediato activo, que es aproximadamente el doble de las entregas. `06` §1.1 lo señala como el
    consumo a vigilar.
15. Si Meta sigue redirecciones en la entrega de webhooks. Con el receptor en un dominio propio de
    Netlify vuelve a haber un sistema de redirecciones capaz de interponerse, así que este punto sube
    de prioridad respecto al diseño anterior: decide qué tan grave sería un `_redirects` mal puesto.

**Criterio de aceptación.** Los quince puntos tienen respuesta o una razón explícita de por qué siguen
abiertos. Un punto sin respuesta y sin razón es deuda de fase, y la regla de `00` §9 dice que no se pasa
de fase con deuda de la anterior.

---

## 5. Qué se gana y qué se pierde con Netlify frente a Cloudflare

La decisión es de Gabriel y está tomada. Lo que sigue no la discute: la documenta con precisión, para
que dentro de seis meses nadie tenga que reconstruir por qué el sistema es como es. Hay cosas del
diseño de Cloudflare que eran mejores y quedan escritas en vez de enterradas.

### Lo que se gana

1. **Un solo almacén de secretos y una sola lista de campos.** `GRAPH_API_VERSION`, el App Secret y
   `subscribed_fields` dejaban de estar sincronizados en el diseño anterior, y `02` §5.3 lo admitía
   como precio. Esa clase entera de fallos desaparece, y con ella el test de paridad de entornos que la
   mitigaba.
2. **Desaparece el tope de 128 KB por mensaje y con él el desborde a R2 entero.** Una columna `text` y
   un objeto de hasta 5 GB absorben cualquier lote sin configuración. Son un bucket, una regla de ciclo
   de vida, un umbral medido sobre el mensaje serializado y dos modos de fallo que ya no existen. En el
   balance del diseño anterior este era el punto que se reconocía como estrictamente peor; se recupera.
3. **Se acaba el reloj de retención de la cola.** Queues descartaba pasados 14 días en plan de pago y 24
   horas en el gratuito. Una tabla retiene lo que se quiera. Un procesador roto tres semanas no pierde
   nada, y el plan de pago de Workers deja de ser un requisito derivado de la arquitectura.
4. **La cola vuelve a ser inspeccionable con un `select`.** Cualquier pregunta sobre lo pendiente se
   responde con SQL. Desaparece la necesidad de escribir un consumidor solo para poder ver lo ingerido,
   que era trabajo que el cambio anterior había añadido a esta fase.
5. **La observabilidad deja de estar partida.** Latencia, tamaño, ruta y contenido se cruzan en una
   consulta. Antes vivían en Analytics Engine y en Postgres y ninguna consulta los cruzaba.
6. **El `check (firma_ok)` vuelve al camino de ingesta.** El diseño anterior lo perdía: la garantía se
   degradaba a "el código lo hace bien" hasta que la fila llegaba a la bitácora, un salto después. Ahora
   la base rechaza el `insert` de un cuerpo no verificado en el mismo instante en que el receptor lo
   intenta.
7. **Dominio propio.** `hooks.kavea.ai` en vez de `kavea-meta-webhook.<subdominio>.workers.dev`. Es
   cosmético, pero también deja de haber un nombre de Worker congelado del que dependa el hostname.
8. **Un pipeline de despliegue, publicación atómica, sin reparto por porcentaje.** Se acaba el riesgo
   de un receptor a medio desplegar con dos comportamientos de firma distintos.

### Lo que se pierde

1. **El 200 vuelve a depender de una escritura remota.** Es el argumento entero de `02` §5.3 y no está
   refutado. La mitigación de Blobs cubre "Postgres no responde"; no cubre "Postgres y Blobs no
   responden", que es una fila más en la tabla de estados y un 500 real. Y añade un camino de
   emergencia que casi nunca se ejercita, con todo lo que eso implica: por eso la prueba de apagar
   Supabase es el criterio de cierre y no una comprobación más.
2. **Blobs no es una cola.** Sin entrega garantizada, sin reintentos, sin DLQ, sin métrica de
   profundidad ni de edad. El drenaje, el orden, la deduplicación, la cuarentena y la caducidad son
   código propio de esta fase, con bugs propios, frente a un servicio gestionado que lo daba hecho.
   **En este punto concreto el diseño anterior era estrictamente mejor**, y es el precio directo de
   reducir proveedores.
3. **Consistencia eventual por defecto**, con hasta 60 s de propagación. Hay que pedir la fuerte de
   forma explícita en cada apertura del store, y no está documentado si `list()` la honra. Una cola no
   tiene modos de consistencia que recordar.
4. **10 segundos de función sincrónica.** Bastan para los 5 s de Meta, pero obligan a presupuestar cada
   paso: timeout de Postgres, timeout de Blobs, timeout del disparo. Un Worker tenía más holgura y no
   obligaba a repartir el presupuesto entre tres intentos encadenados.
5. **No hay `ctx.waitUntil()`.** Todo lo accesorio —alertar, disparar el procesador— se paga antes del
   200. En el diseño anterior la alerta salía después de responder y no costaba nada al presupuesto.
6. **No hay Durable Objects.** La deduplicación de alertas pasa de una primitiva con serialización real
   a un compare-and-set sobre un almacén de objetos, que es más débil y hay que medir. Y de cara a la
   fase 4, el token bucket por `page_id` se implementará con `pg_advisory_xact_lock`, que mete Postgres
   en el camino caliente del envío. Es aceptable ahí porque el envío ya necesita la base para leer el
   token; no lo era para la ingesta.
7. **La ingesta y la interfaz comparten proveedor.** La separación de sitios protege del despliegue
   roto, que es el fallo frecuente. No protege de una incidencia de plataforma de Netlify, que ahora
   apaga las dos superficies a la vez. Con dos proveedores eso era imposible por construcción.
8. **Punto ciego de observabilidad durante el incidente.** Cuando Postgres está caído no se escribe ni
   la bitácora ni el pulso, y la única señal en vivo es el correo. Antes las métricas del receptor
   vivían fuera de Postgres precisamente para que la caída de la base no cegara al observador.
9. **Se dobla el número de invocaciones**, porque el disparo inmediato del procesador es una invocación
   más por webhook. Con Queues, la entrega al consumidor no se facturaba como una invocación extra del
   receptor.
10. **Depende del DNS.** `*.workers.dev` existía desde el primer minuto. `hooks.kavea.ai` no existe
    hasta que el cambio de nameservers de `06` §3 esté hecho, y eso es una precondición bloqueante que
    antes no había.

Nada de esto reabre la decisión, que ya está tomada y con su riesgo documentado en `06` §1.1. Lo que sí
determina es el orden de trabajo: los puntos 1 y 2 son la razón por la que el camino de Blobs se
construye desde el primer despliegue y no cuando aparezca el primer incidente, porque descubrirlo en
producción cuesta una desuscripción por cliente.

---

## 6. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Alguien reintroduce `JSON.parse` antes del HMAC | Fallo solo con tildes y emoji: invisible en pruebas, total en VE, RD y MX | Fixture de unicode escapado obligatoria en CI, con prueba de regresión que distingue la fixture ASCII de la unicode |
| Alguien usa la firma legacy `exports.handler` con `event.body` | Los bytes pasan por un round-trip de string y la firma deja de cuadrar de forma intermitente | Functions v2 obligatoria, comprobada en revisión de código y con una regla de lint sobre `hooks/` |
| Una redirección comodín o una Edge Function se cuela en el sitio de hooks | La petición no llega a la función, o el cuerpo llega alterado. Desuscripción silenciosa | Sitio sin `_redirects` ni `[[redirects]]` ni Edge Functions, verificado en el criterio de aceptación de la tarea 1 y en CI |
| Se usa `getDeployStore` en vez de `getStore` | Un despliegue durante un incidente deja huérfanos los eventos pendientes en Blobs | Revisión de código y prueba: escribir a Blobs, desplegar, comprobar que el drenaje sigue viéndolos |
| Caída larga de Postgres | Cada entrega paga el timeout completo y el amortiguador se llena | Camino de Blobs desde el primer despliegue, timeout corto y calibrado, alerta P1 en el primer evento con `ruta='blobs'`, y la prueba 14.5 ejecutada de verdad |
| **Caída simultánea de Postgres y Blobs** | 500 sostenido y desuscripción por cliente a la hora | 500 explícito para que Meta reintente, alerta P1 con fail-open, reconciliación después. **Es el riesgo aceptado de `06` §1.1 y no tiene mitigación completa: no hay tercer almacén y añadirlo devolvería el proveedor que la decisión quitó** |
| El drenaje no corre y Blobs se llena | Eventos confirmados a Meta con 200 que nunca llegan a la bandeja | Alerta P1 por objeto en `crudo/` con más de 15 minutos, `ingesta_pulso` cada minuto, y la Background Function con 15 minutos de presupuesto para el peor caso post-incidente |
| El drenaje duplica eventos que sí se habían insertado | Dos filas por evento, y en fase 2 dos entradas en la bandeja | `ingesta_id` único compartido por los dos caminos, `on conflict do nothing`, borrado del objeto solo tras confirmar. Se prueba provocando el caso, no razonándolo |
| Consistencia eventual de Blobs | El drenaje lista un store que parece vacío justo después de una caída | Consistencia fuerte explícita en cada apertura del store, y prohibición de borrar basándose solo en un listado hasta cerrar el punto 12 del acta |
| La reconciliación no cabe en los 30 s de una Scheduled Function | La mitad de las conexiones sin comprobar, sin que nadie lo sepa | Patrón reloj más Background Function desde el primer despliegue. Con 28 Páginas el margen ya es del ancho de una latencia de cola |
| El procesador se queda con filas en `en_proceso` y muere | La bandeja deja de avanzar en silencio | Segador que devuelve a `pendiente` lo reclamado hace más de 20 minutos, y alerta si el segador tampoco corre |
| Ráfaga de webhooks dispara cien procesadores | Coste en invocaciones, no incorrección | `skip locked` garantiza corrección; `pg_try_advisory_lock` hace que los sobrantes salgan de inmediato. El coste se mide, punto 14 del acta |
| Lote por encima del límite de petición de la función | 413 a una entrega legítima, que cuenta como fallo de entrega | Guardarraíl alto hasta cerrar la medición 7, `lote-grande.json` en la suite, y alerta informativa sobre `cuerpo_bytes` grandes |
| Un valor fuera del enum en `subscribed_fields` | La llamada de suscripción falla entera en el onboarding | Confirmar el enum en consola antes de escribir la llamada, y una sola constante compartida entre onboarding y reconciliación |
| El cambio de nameservers se retrasa y se registra una URL provisional | Re-registrar la URL es un cambio a nivel de app que afecta a los tres topics y obliga a rehacer el handshake | Hacer el cambio de DNS antes de registrar. Si no, ventana de cambio planificada con responsable, no un despliegue más |
| Incidencia de plataforma de Netlify | Interfaz e ingesta caen a la vez | Sin mitigación por diseño. Es la contrapartida directa de reducir proveedores y está en el balance como pérdida 7 |
| mTLS obligatorio en webhooks de Meta | Sin mitigación disponible en Netlify hoy | Riesgo abierto. El changelog de Messenger Platform devuelve HTTP 500 y no se puede confirmar; abrirlo en navegador y guardar copia |
| Meta restringe la app entera | Todos los tenants a la vez, sin aviso | Fuera del alcance de esta fase. `03` lo cubre con kill-switch por canal y tenant |

---

## 7. Definición de terminado

La fase 1 está cerrada cuando todo lo siguiente es cierto y verificable por otra persona:

- [ ] El endpoint `https://hooks.kavea.ai/meta` está registrado en el App Dashboard y el handshake pasa
      al guardar.
- [ ] Un GET sin parámetros devuelve 403 generado por la función, no la página 404 de Netlify.
- [ ] El sitio de hooks es un sitio de Netlify independiente, con `base = hooks/`, sin ninguna
      redirección y sin Edge Functions.
- [ ] Todas las funciones usan la firma v2 con `Request`/`Response`. No hay ni un `exports.handler` bajo
      `hooks/`.
- [ ] Las cinco pruebas de firma inválida devuelven 401, sin fila en la bitácora y sin objeto en Blobs.
- [ ] La fixture con unicode escapado devuelve 200 y su `cuerpo_crudo` coincide byte a byte.
- [ ] `lote-grande.json` devuelve 200 dentro del presupuesto, y el límite de petición de la función está
      medido y `MAX_BYTES` fijado por debajo.
- [ ] Un DM real desde Instagram, uno desde Messenger y uno desde WhatsApp producen fila en
      `webhook_events` en menos de 10 s.
- [ ] **Con Supabase apagado, el receptor devuelve 200 por debajo de 5 s, los eventos acaban en Blobs y
      al volver la base se drenan sin pérdidas ni duplicados.** Ejecutado en la variante lenta, no
      supuesto.
- [ ] **Con Supabase y Blobs caídos, la respuesta es 500 dentro del presupuesto y llega la alerta P1.**
- [ ] El caso de duplicado —objeto en Blobs cuyo `ingesta_id` ya está en la base— no crea una segunda
      fila.
- [ ] Un objeto que el drenaje no consigue insertar acaba en `cuarentena/` con alerta P1, y la caducidad
      de 7 días de la cuarentena está implementada, no solo escrita.
- [ ] El disparo inmediato lleva un evento de `pendiente` a `procesado` en menos de 2 s con el latido
      deshabilitado, y en menos de 70 s con el disparo deshabilitado.
- [ ] El store de Blobs se abre siempre con `getStore` y `consistency: 'strong'`. No hay ninguna llamada
      a `getDeployStore` en el repositorio.
- [ ] p95 de `duracion_ms` por debajo de 500 ms sobre al menos 200 entregas reales, y ninguna entrega
      por encima de 5 000 ms.
- [ ] El constraint `webhook_events_firma_ok_chk` está en la base y rechaza el insert de prueba, y está
      documentado en el propio esquema que `firma_ok` no es una señal y no lleva alertas encima.
- [ ] El reloj de reconciliación corre cada 15 minutos, delega en la Background Function, detecta una
      desuscripción provocada a mano, re-suscribe sin intervención y genera alerta P1 con correo
      entregado.
- [ ] Cada condición de la tabla de alertas de la tarea 12 se ha disparado al menos una vez en staging.
- [ ] La lista de `subscribed_fields` está confirmada contra el enum real y vive en una sola constante.
- [ ] `GRAPH_API_VERSION` es la única fuente de la versión y no hay ninguna versión literal en un path
      del repositorio.
- [ ] Ningún log contiene el cuerpo de un webhook. Ninguna metadata de Blobs contiene texto de mensajes.
- [ ] `docs/fases/01-mediciones.md` responde a los quince puntos de la tarea 15 o explica por qué alguno
      sigue abierto.

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
   incompatibles, ninguna reconciliada por Meta. Se mide con 500 deliberados en staging.

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

8. **Límite de tamaño de petición de una Netlify Function.** No publicado. Es el análogo del tope de
   Queues que en el diseño anterior obligaba al desborde a R2. Punto 7 del acta. Hasta cerrarlo,
   `MAX_BYTES` es una suposición conservadora.

9. **Si `list()` de Netlify Blobs honra la consistencia fuerte.** Punto 12 del acta. Decide si el
   drenaje puede fiarse de un listado o tiene que confirmar objeto a objeto, que es lo que hace mientras
   tanto.

10. **Si `onlyIfMatch` es un compare-and-set atómico de verdad.** Punto 13 del acta. De ello depende que
    el cortacircuitos de alertas mande un correo y no cincuenta durante un incidente.

11. **Grado de concurrencia del procesador.** En fase 1, con un tenant, una sola ranura de lock sobra.
    Cuándo hay que abrir más ranuras, y cuántas, se decide con el volumen medido y con el p95 del punto
    10 del acta, no antes.

12. **Umbral del detector de silencio.** Con un solo tenant en dogfooding y tráfico nocturno cero, las 2
    horas son una suposición. Se calibra con una semana de línea base. La versión por organización queda
    para cuando haya varios tenants.

13. **Si el timeout de 1 500 ms para Postgres es el correcto.** Es una hipótesis puesta a ojo entre dos
    restricciones: tiene que estar por encima del p99 de una base sana y dejar sitio para intentar Blobs
    y responder dentro de 5 s. Los puntos 9 y 10 del acta lo cierran, y hasta entonces cualquier ajuste
    va acompañado de la prueba 14.5 completa.
