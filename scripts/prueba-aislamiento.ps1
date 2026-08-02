# Batería de aislamiento entre organizaciones, con SESIONES REALES.
#
# Los canarios de supabase/tests/canarios.sql comprueban la forma del esquema.
# Esto comprueba el comportamiento: dos usuarios reales, dos JWT reales, y
# consultas por PostgREST que es la superficie que ve el mundo.
#
# La diferencia importa: pgTAP no ve un `grant` mal puesto, y un esquema
# perfecto con un privilegio de más sigue filtrando datos.
#
# CRITERIO: esta batería tiene que FALLAR si se rompe una política a propósito.
# Una prueba que pasa siempre no prueba nada.

param(
  [Parameter(Mandatory = $true)] [string] $TokenGestion,
  [string] $ProjectRef = "sdazqohyjzzylwbkvovx"
)

$ErrorActionPreference = "Stop"
$hg = @{ Authorization = "Bearer $TokenGestion"; "Content-Type" = "application/json" }
$sqlUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$base = "https://$ProjectRef.supabase.co"

function Sql($q) {
  $b = @{ query = $q } | ConvertTo-Json -Depth 3
  Invoke-RestMethod -Uri $sqlUrl -Method Post -Headers $hg -Body $b
}

$claves = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef/api-keys?reveal=true" -Headers $hg
$publicable = ($claves | Where-Object { $_.api_key -like "sb_publishable*" }).api_key
$secreta    = ($claves | Where-Object { $_.api_key -like "sb_secret*" }).api_key

$aprobadas = 0; $fallidas = 0
function Comprobar($nombre, $condicion, $detalle = "") {
  if ($condicion) { $script:aprobadas++; Write-Host ("  OK    {0}" -f $nombre) -ForegroundColor Green }
  else { $script:fallidas++; Write-Host ("  FALLA {0}  {1}" -f $nombre, $detalle) -ForegroundColor Red }
}

Write-Host "`n=== Preparacion ===" -ForegroundColor Cyan

# SE LIMPIA AL EMPEZAR, NO SOLO AL TERMINAR.
#
# Una corrida que aborta a mitad no llega a su limpieza y deja las
# organizaciones de prueba, el usuario dentro de `staff` y los campos ya
# creados. La siguiente corrida entonces falla en cosas que funcionan
# perfectamente: "A ve tres organizaciones", "es_staff() no es falso", "A ve los
# adjuntos de B". Pasó exactamente eso, y perder diez minutos persiguiendo un
# fallo de aislamiento inventado es peor que no tener la prueba.
#
# El estado previo se borra aquí porque aquí sí se ejecuta siempre.
Sql @"
delete from public.staff where user_id in (
  select id from auth.users where email in ('prueba-a@kavea.test','prueba-b@kavea.test'));
delete from public.organizations where slug in ('prueba-a','prueba-b');
"@ | Out-Null

# Dos organizaciones desechables con prefijo reconocible, para poder limpiarlas.
Sql @"
insert into public.organizations (id,nombre,slug) values
  ('00000000-0000-4000-8000-00000000aa01','Prueba A','prueba-a'),
  ('00000000-0000-4000-8000-00000000bb01','Prueba B','prueba-b')
on conflict (slug) do nothing;
"@ | Out-Null

# Dos usuarios reales por la API de administracion. auth.users es propiedad de
# Supabase Auth: insertarlo a mano exige coherencia con auth.identities.
# User-Agent explícito: las claves sb_secret_* rechazan peticiones que parezcan
# venir de un navegador, y el agente por defecto de Invoke-RestMethod lo parece.
# El mensaje que devuelve Supabase —"Forbidden use of secret API key in browser"—
# es correcto y la protección es buena; solo hay que identificarse como servidor.
$ha = @{
  apikey          = $secreta
  Authorization   = "Bearer $secreta"
  "Content-Type"  = "application/json"
  "User-Agent"    = "kavea-scripts/0.1"
}
$usuarios = @{}
foreach ($n in @("a","b")) {
  $correo = "prueba-$n@kavea.test"
  $cuerpo = @{ email = $correo; password = "Prueba-$n-2026!"; email_confirm = $true } | ConvertTo-Json
  try {
    $u = Invoke-RestMethod -Uri "$base/auth/v1/admin/users" -Method Post -Headers $ha -Body $cuerpo
    $usuarios[$n] = $u.id
  } catch {
    $lista = Invoke-RestMethod -Uri "$base/auth/v1/admin/users?filter=$correo" -Headers $ha
    $usuarios[$n] = ($lista.users | Where-Object { $_.email -eq $correo }).id
  }
}
Write-Host "  usuario A: $($usuarios['a'])"
Write-Host "  usuario B: $($usuarios['b'])"

Sql @"
insert into public.organization_members (organization_id, user_id, rol) values
  ('00000000-0000-4000-8000-00000000aa01','$($usuarios['a'])','owner'),
  ('00000000-0000-4000-8000-00000000bb01','$($usuarios['b'])','agente')
on conflict do nothing;

insert into public.contacts (id, organization_id, nombre) values
  ('00000000-0000-4000-8000-00000000aa02','00000000-0000-4000-8000-00000000aa01','Contacto de A'),
  ('00000000-0000-4000-8000-00000000bb02','00000000-0000-4000-8000-00000000bb01','Contacto de B')
on conflict do nothing;

-- Conversación completa por organización: conexión, canal, hilo, mensaje,
-- adjunto y actividad.
--
-- Sin esto la suite no tocaba `linea_tiempo`, que es precisamente la superficie
-- donde vive TODO el contenido de los mensajes: si algún día se filtra algo,
-- se filtra por ahí. La vista se creó además sin `security_invoker`, con lo que
-- el acceso a las tablas base se comprobaba como su dueño; se corrigió en 0026
-- y esta comprobación es lo que impide que vuelva a pasar sin que nadie se dé
-- cuenta.
insert into public.meta_connections (id, organization_id, page_id) values
  ('00000000-0000-4000-8000-00000000aa03','00000000-0000-4000-8000-00000000aa01','pagina-a'),
  ('00000000-0000-4000-8000-00000000bb03','00000000-0000-4000-8000-00000000bb01','pagina-b')
on conflict do nothing;

insert into public.channels (id, organization_id, meta_connection_id, canal, nombre) values
  ('00000000-0000-4000-8000-00000000aa04','00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa03','instagram','IG de A'),
  ('00000000-0000-4000-8000-00000000bb04','00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000bb03','instagram','IG de B')
on conflict do nothing;

-- La tarjeta es la unidad de trabajo desde 0027 y la conversacion no puede
-- existir sin ella.
insert into public.tarjetas (id, organization_id, contact_id, estado) values
  ('00000000-0000-4000-8000-00000000aa08','00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa02','en_curso'),
  ('00000000-0000-4000-8000-00000000bb08','00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000bb02','en_curso')
on conflict do nothing;

insert into public.conversations (id, organization_id, channel_id, canal, contact_id, tarjeta_id) values
  ('00000000-0000-4000-8000-00000000aa05','00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa04','instagram','00000000-0000-4000-8000-00000000aa02','00000000-0000-4000-8000-00000000aa08'),
  ('00000000-0000-4000-8000-00000000bb05','00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000bb04','instagram','00000000-0000-4000-8000-00000000bb02','00000000-0000-4000-8000-00000000bb08')
on conflict do nothing;

insert into public.messages (id, organization_id, conversation_id, canal, mid, direccion, texto, meta_timestamp_ms, raw) values
  ('00000000-0000-4000-8000-00000000aa06','00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa05','instagram','mid-a','inbound','SECRETO DE A',1000,'{}'),
  ('00000000-0000-4000-8000-00000000bb06','00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000bb05','instagram','mid-b','inbound','SECRETO DE B',1000,'{}')
on conflict do nothing;

insert into public.media (organization_id, message_id, origen, cdn_url, cdn_host, tipo, payload) values
  ('00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa06','meta_cdn','https://lookaside.fbsbx.com/secreto-a','lookaside.fbsbx.com','image','{}'),
  ('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000bb06','meta_cdn','https://lookaside.fbsbx.com/secreto-b','lookaside.fbsbx.com','image','{}')
on conflict do nothing;

insert into public.actividades (organization_id, conversation_id, tipo, actor_tipo, actor_nombre, detalle) values
  ('00000000-0000-4000-8000-00000000aa01','00000000-0000-4000-8000-00000000aa05','nota.añadida','usuario','Quien sea','{"texto":"NOTA DE A"}'),
  ('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000bb05','nota.añadida','usuario','Quien sea','{"texto":"NOTA DE B"}');
"@ | Out-Null

# Sesiones reales
$sesiones = @{}
foreach ($n in @("a","b")) {
  $c = @{ email = "prueba-$n@kavea.test"; password = "Prueba-$n-2026!" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$base/auth/v1/token?grant_type=password" -Method Post `
        -Headers @{ apikey = $publicable; "Content-Type" = "application/json" } -Body $c
  $sesiones[$n] = $r.access_token
}
Write-Host "  dos sesiones iniciadas"

function ComoUsuario($n, $ruta) {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones[$n])" }
  Invoke-RestMethod -Uri "$base/rest/v1/$ruta" -Headers $h
}

Write-Host "`n=== Lectura cruzada ===" -ForegroundColor Cyan

$orgsA = ComoUsuario "a" "organizations?select=slug"
Comprobar "A ve exactamente su organizacion" (($orgsA.Count -eq 1) -and ($orgsA[0].slug -eq "prueba-a")) "vio: $($orgsA.slug -join ',')"

$contactosA = ComoUsuario "a" "contacts?select=nombre"
Comprobar "A ve solo sus contactos" (($contactosA.Count -eq 1) -and ($contactosA[0].nombre -eq "Contacto de A")) "vio: $($contactosA.nombre -join ',')"

# Acceso DIRECTO por clave primaria a una fila de otro tenant: el caso que un
# filtro de aplicacion dejaria pasar y RLS tiene que cortar.
$directo = ComoUsuario "a" "contacts?select=nombre&id=eq.00000000-0000-4000-8000-00000000bb02"
Comprobar "A no alcanza el contacto de B por clave primaria" ($directo.Count -eq 0) "vio $($directo.Count) filas"

$rutas = ComoUsuario "a" "meta_asset_routes?select=asset_id"
Comprobar "A ve cero rutas de enrutado" ($rutas.Count -eq 0)

Write-Host "`n=== Tablas que no deben verse nunca ===" -ForegroundColor Cyan

try {
  $we = ComoUsuario "a" "webhook_events?select=id"
  Comprobar "webhook_events inaccesible" ($we.Count -eq 0) "devolvio $($we.Count) filas"
} catch { Comprobar "webhook_events inaccesible" $true }

try {
  ComoUsuario "a" "meta_credentials?select=meta_connection_id" | Out-Null
  Comprobar "private.meta_credentials inaccesible" $false "la peticion tuvo exito"
} catch { Comprobar "private.meta_credentials inaccesible" $true }

Write-Host "`n=== Escalada de privilegios ===" -ForegroundColor Cyan

# B es 'agente'. Si la politica de membresias fuera `for all` con es_miembro,
# esto le convertiria en owner de su propio tenant.
$hb = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['b'])"; "Content-Type" = "application/json"; Prefer = "return=representation" }
try {
  $r = Invoke-RestMethod -Uri "$base/rest/v1/organization_members?user_id=eq.$($usuarios['b'])" `
        -Method Patch -Headers $hb -Body (@{ rol = "owner" } | ConvertTo-Json)
  Comprobar "un agente no puede ascenderse a owner" ($r.Count -eq 0) "modifico $($r.Count) filas"
} catch { Comprobar "un agente no puede ascenderse a owner" $true }

# Escritura cruzada: A intenta renombrar un contacto de B.
$haU = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json"; Prefer = "return=representation" }
try {
  $r = Invoke-RestMethod -Uri "$base/rest/v1/contacts?id=eq.00000000-0000-4000-8000-00000000bb02" `
        -Method Patch -Headers $haU -Body (@{ nombre = "secuestrado" } | ConvertTo-Json)
  Comprobar "A no puede modificar contactos de B" ($r.Count -eq 0) "modifico $($r.Count) filas"
} catch { Comprobar "A no puede modificar contactos de B" $true }

Write-Host "`n=== Break-glass ===" -ForegroundColor Cyan

Comprobar "sin fila en staff, es_staff() es falso" ((ComoUsuario "a" "rpc/es_staff") -ne $true)

Sql "insert into public.staff (user_id, rol) values ('$($usuarios['a'])','soporte') on conflict do nothing;" | Out-Null
Comprobar "con fila en staff, es_staff() es cierto" ((ComoUsuario "a" "rpc/es_staff") -eq $true)

$orgsStaff = ComoUsuario "a" "organizations?select=slug"
Comprobar "el staff ve metadatos de todas las organizaciones" ($orgsStaff.Count -ge 2) "vio $($orgsStaff.Count)"

# Se pregunta por los mensajes DE B, no por todos.
#
# La versión anterior exigía que el staff viera CERO mensajes en total, y A es
# owner de la organización A: sus propios mensajes los ve como miembro, no como
# staff. La comprobación pasaba únicamente porque la suite no sembraba ningún
# mensaje, así que durante semanas afirmó que el break-glass funcionaba sin
# haberlo ejercido ni una vez. Una comprobación que no puede fallar no es una
# comprobación.
$ajena = "messages?select=id&organization_id=eq.00000000-0000-4000-8000-00000000bb01"
$msgs = ComoUsuario "a" $ajena
Comprobar "el staff SIN grant no ve el contenido ajeno" ($msgs.Count -eq 0) "vio $($msgs.Count) mensajes de B"

# Y el lado positivo, que tampoco se probaba: con un grant válido SÍ se ve. Un
# break-glass que no abre es tan inútil como uno que no cierra, y el que no abre
# se descubre el día de la incidencia, que es el peor momento.
Sql @"
insert into public.access_grants (organization_id, user_id, motivo, expira_en)
values ('00000000-0000-4000-8000-00000000bb01','$($usuarios['a'])',
        'incidencia de soporte reproducible en el hilo del cliente', now() + interval '2 hours');
"@ | Out-Null
$conGrant = ComoUsuario "a" $ajena
Comprobar "el staff CON grant si ve el contenido ajeno" ($conGrant.Count -eq 1) "vio $($conGrant.Count)"

Sql "delete from public.access_grants where user_id = '$($usuarios['a'])';" | Out-Null
$trasRevocar = ComoUsuario "a" $ajena
Comprobar "al revocar el grant deja de verse" ($trasRevocar.Count -eq 0) "vio $($trasRevocar.Count)"

# Un grant se rechaza si el motivo es corto o si dura mas de 72 horas.
$rechazado = $false
try { Sql "insert into public.access_grants (organization_id,user_id,motivo,expira_en) values ('00000000-0000-4000-8000-00000000bb01','$($usuarios['a'])','corto', now() + interval '1 hour');" | Out-Null }
catch { $rechazado = $true }
Comprobar "un grant con motivo corto se rechaza" $rechazado

$rechazado = $false
try { Sql "insert into public.access_grants (organization_id,user_id,motivo,expira_en) values ('00000000-0000-4000-8000-00000000bb01','$($usuarios['a'])','motivo suficientemente largo para pasar', now() + interval '7 days');" | Out-Null }
catch { $rechazado = $true }
Comprobar "un grant de mas de 72 horas se rechaza" $rechazado

Write-Host "`n=== El hilo: mensajes, adjuntos y actividad ===" -ForegroundColor Cyan

# `linea_tiempo` es la vista que mezcla las tres cosas. Es la consulta que sirve
# la pantalla del hilo y la que más contenido expone de golpe.
$hiloA = ComoUsuario "a" "linea_tiempo?select=tipo,detalle"
$textos = ($hiloA | ForEach-Object { $_.detalle | ConvertTo-Json -Compress }) -join ' '
Comprobar "A ve su propia linea de tiempo" ($hiloA.Count -ge 2) "vio $($hiloA.Count) entradas"
Comprobar "la linea de tiempo de A no contiene nada de B" (-not ($textos -match 'SECRETO DE B|NOTA DE B')) "fuga en el contenido"

$msgsA = ComoUsuario "a" "messages?select=texto"
Comprobar "A no ve los mensajes de B" (($msgsA.Count -eq 1) -and ($msgsA[0].texto -eq 'SECRETO DE A')) "vio: $($msgsA.texto -join ',')"

$mediaA = ComoUsuario "a" "media?select=cdn_url"
Comprobar "A no ve los adjuntos de B" (($mediaA.Count -eq 1) -and ($mediaA[0].cdn_url -notmatch 'secreto-b')) "vio $($mediaA.Count)"

$actA = ComoUsuario "a" "actividades?select=detalle"
Comprobar "A no ve la actividad de B" (($actA.Count -eq 1) -and (($actA[0].detalle | ConvertTo-Json) -notmatch 'NOTA DE B')) "vio $($actA.Count)"

# La actividad es un registro de auditoría: si el auditado puede escribirla o
# borrarla, no registra nada. Los grants de Supabase la dejan abierta a
# `authenticated`; lo que la cierra es que RLS no tiene política de escritura.
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
  $cuerpo = @{ organization_id = '00000000-0000-4000-8000-00000000aa01'; tipo = 'inventada'; actor_tipo = 'usuario' } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/rest/v1/actividades" -Method Post -Headers $h -Body $cuerpo | Out-Null
} catch { $rechazado = $true }
Comprobar "nadie puede fabricar actividad desde el cliente" $rechazado

Write-Host "`n=== Una persona, varios canales ===" -ForegroundColor Cyan

# La fusión mueve conversaciones entre contactos. Si aceptara contactos de dos
# organizaciones, sería una forma de arrastrar los hilos de otro cliente a la
# bandeja propia: es el peor fallo posible bajo RLS y por eso se comprueba.
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
  $cuerpo = @{
    p_superviviente = '00000000-0000-4000-8000-00000000aa02'
    p_absorbido     = '00000000-0000-4000-8000-00000000bb02'
    p_motivo        = 'intento de fusion cruzada entre organizaciones'
  } | ConvertTo-Json
  Invoke-RestMethod -Uri "$base/rest/v1/rpc/fusionar_contactos" -Method Post -Headers $h -Body $cuerpo | Out-Null
} catch { $rechazado = $true }
Comprobar "no se pueden fusionar contactos de organizaciones distintas" $rechazado

$sigue = ComoUsuario "a" "conversations?select=id"
Comprobar "el intento de fusion no movio ningun hilo" ($sigue.Count -eq 1) "A ve $($sigue.Count) conversaciones"

# `fusionado_en` la mueve el RPC, que deja registro. Un PATCH directo dejaría el
# contacto marcado como fusionado sin haber movido nada.
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json"; Prefer = "return=representation" }
  $r = Invoke-RestMethod -Uri "$base/rest/v1/contacts?id=eq.00000000-0000-4000-8000-00000000aa02" -Method Patch -Headers $h `
        -Body (@{ fusionado_en = '00000000-0000-4000-8000-00000000bb02' } | ConvertTo-Json)
  if ($r.Count -eq 0) { $rechazado = $true }
} catch { $rechazado = $true }
Comprobar "fusionado_en no se puede tocar con un PATCH directo" $rechazado

Write-Host "`n=== Tarjetas y campos ===" -ForegroundColor Cyan

$tA = ComoUsuario "a" "tarjetas?select=id,estado"
Comprobar "A ve su tarjeta y solo la suya" ($tA.Count -eq 1) "vio $($tA.Count)"

# Unir mueve conversaciones entre tarjetas. Si aceptara tarjetas de dos
# organizaciones seria una forma de arrastrar los hilos de otro cliente a la
# bandeja propia: el peor fallo posible bajo RLS.
$tB = (Sql "select id from public.tarjetas where organization_id = '00000000-0000-4000-8000-00000000bb01'").id
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Uri "$base/rest/v1/rpc/unir_tarjetas" -Method Post -Headers $h -Body (@{
    p_superviviente = $tA[0].id; p_absorbida = $tB
    p_motivo = 'intento de union cruzada entre organizaciones'
  } | ConvertTo-Json) | Out-Null
} catch { $rechazado = $true }
Comprobar "no se pueden unir tarjetas de organizaciones distintas" $rechazado

$sigueB = (Sql "select count(*)::int as n from public.conversations where organization_id='00000000-0000-4000-8000-00000000bb01' and tarjeta_id = '$tB'").n
Comprobar "el intento de union no movio los hilos de B" ($sigueB -eq 1) "B tiene $sigueB"

# Definir un campo cambia el formulario de toda la organizacion: no es una
# accion de quien atiende un hilo. B es 'agente', no owner.
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['b'])"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Uri "$base/rest/v1/rpc/definir_campo" -Method Post -Headers $h -Body (@{
    p_org = '00000000-0000-4000-8000-00000000bb01'; p_clave = 'colado'
    p_etiqueta = 'Colado'; p_tipo = 'texto'
  } | ConvertTo-Json) | Out-Null
} catch { $rechazado = $true }
Comprobar "un agente no puede definir campos" $rechazado

# El tipo lo impone la definicion en la frontera, no la interfaz.
Sql @"
insert into public.campos (id, organization_id, clave, etiqueta, tipo, ambito)
values ('00000000-0000-4000-8000-00000000aa07','00000000-0000-4000-8000-00000000aa01','importe','Importe','numero','tarjeta')
on conflict do nothing;
"@ | Out-Null

$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Uri "$base/rest/v1/rpc/guardar_campo" -Method Post -Headers $h -Body (@{
    p_campo = '00000000-0000-4000-8000-00000000aa07'; p_destino = $tA[0].id; p_valor = 'no soy un numero'
  } | ConvertTo-Json) | Out-Null
} catch { $rechazado = $true }
Comprobar "un texto en un campo numerico se rechaza" $rechazado

# Y A no puede escribir un valor en una tarjeta de B aunque invente el id.
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Uri "$base/rest/v1/rpc/guardar_campo" -Method Post -Headers $h -Body (@{
    p_campo = '00000000-0000-4000-8000-00000000aa07'; p_destino = $tB; p_valor = 42
  } | ConvertTo-Json) | Out-Null
  $cruzado = (Sql "select count(*)::int as n from public.campo_valores where tarjeta_id = '$tB'").n
  if ($cruzado -eq 0) { $rechazado = $true }
} catch { $rechazado = $true }
Comprobar "A no puede escribir un campo en una tarjeta de B" $rechazado

$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['b'])"; "Content-Type" = "application/json"; Prefer = "return=representation" }
  $r = Invoke-RestMethod -Uri "$base/rest/v1/campo_valores" -Method Post -Headers $h `
        -Body (@{ organization_id = '00000000-0000-4000-8000-00000000bb01'; campo_id = '00000000-0000-4000-8000-00000000aa07'; tarjeta_id = $tB; valor = 1 } | ConvertTo-Json)
  if ($r.Count -eq 0) { $rechazado = $true }
} catch { $rechazado = $true }
Comprobar "nadie escribe valores saltandose el RPC" $rechazado

Write-Host "`n=== Embudos y etapas ===" -ForegroundColor Cyan

# La migracion siembra un embudo por organizacion, asi que A y B tienen el suyo.
$etapasA = ComoUsuario "a" "etapas?select=id,nombre,tipo&order=orden"
Comprobar "A ve las etapas de su embudo y solo las suyas" ($etapasA.Count -eq 6) "vio $($etapasA.Count)"

$etapaB = (Sql "select e.id from public.etapas e join public.embudos b on b.id=e.embudo_id where b.organization_id='00000000-0000-4000-8000-00000000bb01' order by e.orden limit 1").id

# Mover una tarjeta a la etapa de otra organizacion seria arrastrar el negocio
# de un cliente al tablero de otro.
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Uri "$base/rest/v1/rpc/mover_etapa" -Method Post -Headers $h `
    -Body (@{ p_tarjeta = $tA[0].id; p_etapa = $etapaB } | ConvertTo-Json) | Out-Null
} catch { $rechazado = $true }
Comprobar "no se mueve una tarjeta a la etapa de otra organizacion" $rechazado

$sigue = (Sql "select etapa_id from public.tarjetas where id = '$($tA[0].id)'").etapa_id
Comprobar "la tarjeta de A sigue en una etapa de A" ($sigue -ne $etapaB)

# Mover SI funciona dentro de la organizacion, y deja actividad.
$destino = ($etapasA | Where-Object { $_.tipo -eq 'abierta' })[1].id
$h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "$base/rest/v1/rpc/mover_etapa" -Method Post -Headers $h `
  -Body (@{ p_tarjeta = $tA[0].id; p_etapa = $destino } | ConvertTo-Json) | Out-Null
$movida = (Sql "select etapa_id from public.tarjetas where id = '$($tA[0].id)'").etapa_id
Comprobar "mover dentro de la organizacion si funciona" ($movida -eq $destino)

$actMover = (Sql "select count(*)::int as n from public.actividades where tarjeta_id='$($tA[0].id)' and tipo='tarjeta.etapa'").n
Comprobar "mover de etapa deja UNA linea de actividad" ($actMover -eq 1) "hay $actMover"

# El eje comercial no toca el de atencion. Es la diferencia deliberada con Kommo.
$estado = (Sql "select estado from public.tarjetas where id = '$($tA[0].id)'").estado
Comprobar "mover de etapa NO cambia el estado de atencion" ($estado -eq 'en_curso') "estado: $estado"

# Definir etapas cambia el tablero de toda la organizacion. B es 'agente'.
$rechazado = $false
try {
  $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['b'])"; "Content-Type" = "application/json" }
  $embudoB = (Sql "select id from public.embudos where organization_id='00000000-0000-4000-8000-00000000bb01'").id
  Invoke-RestMethod -Uri "$base/rest/v1/rpc/definir_etapa" -Method Post -Headers $h `
    -Body (@{ p_embudo = $embudoB; p_nombre = 'Colada' } | ConvertTo-Json) | Out-Null
} catch { $rechazado = $true }
Comprobar "un agente no puede definir etapas" $rechazado

# Un embudo sin ninguna etapa abierta dejaria las tarjetas nuevas sin sitio.
$abiertas = $etapasA | Where-Object { $_.tipo -eq 'abierta' }
$rechazado = $false
try {
  foreach ($e in $abiertas) {
    $h = @{ apikey = $publicable; Authorization = "Bearer $($sesiones['a'])"; "Content-Type" = "application/json" }
    Invoke-RestMethod -Uri "$base/rest/v1/rpc/archivar_etapa" -Method Post -Headers $h `
      -Body (@{ p_etapa = $e.id } | ConvertTo-Json) | Out-Null
  }
} catch { $rechazado = $true }
Comprobar "no se puede archivar la ultima etapa abierta" $rechazado

Write-Host "`n=== Frontera de escritura, con rol de servicio ===" -ForegroundColor Cyan
Write-Host "  (BYPASSRLS: lo que bloquea aqui es la clave compuesta, no RLS)"

$rechazado = $false
try { Sql "insert into public.contact_identities (organization_id, contact_id, canal, scoped_id) values ('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000aa02','messenger','cruzado-1');" | Out-Null }
catch { $rechazado = $true }
Comprobar "identidad de B no puede apuntar a contacto de A" $rechazado

$rechazado = $false
try { Sql "insert into public.meta_asset_routes (asset_id,tipo,organization_id,meta_connection_id) values ('x-1','page','00000000-0000-4000-8000-00000000aa01', gen_random_uuid());" | Out-Null }
catch { $rechazado = $true }
Comprobar "una ruta no puede apuntar a una conexion inexistente" $rechazado

Write-Host "`n=== Limpieza ===" -ForegroundColor Cyan
Sql @"
delete from public.staff where user_id in ('$($usuarios['a'])','$($usuarios['b'])');
delete from public.organizations where slug in ('prueba-a','prueba-b');
"@ | Out-Null
foreach ($n in @("a","b")) {
  try { Invoke-RestMethod -Uri "$base/auth/v1/admin/users/$($usuarios[$n])" -Method Delete -Headers $ha | Out-Null } catch {}
}
Write-Host "  organizaciones y usuarios de prueba eliminados"

Write-Host ""
Write-Host ("RESULTADO: {0} aprobadas, {1} fallidas" -f $aprobadas, $fallidas) `
  -ForegroundColor $(if ($fallidas -eq 0) { "Green" } else { "Red" })
if ($fallidas -gt 0) { exit 1 }
