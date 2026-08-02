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

$msgs = ComoUsuario "a" "messages?select=id"
Comprobar "el staff SIN grant no ve contenido" ($msgs.Count -eq 0) "vio $($msgs.Count) mensajes"

# Un grant se rechaza si el motivo es corto o si dura mas de 72 horas.
$rechazado = $false
try { Sql "insert into public.access_grants (organization_id,user_id,motivo,expira_en) values ('00000000-0000-4000-8000-00000000bb01','$($usuarios['a'])','corto', now() + interval '1 hour');" | Out-Null }
catch { $rechazado = $true }
Comprobar "un grant con motivo corto se rechaza" $rechazado

$rechazado = $false
try { Sql "insert into public.access_grants (organization_id,user_id,motivo,expira_en) values ('00000000-0000-4000-8000-00000000bb01','$($usuarios['a'])','motivo suficientemente largo para pasar', now() + interval '7 days');" | Out-Null }
catch { $rechazado = $true }
Comprobar "un grant de mas de 72 horas se rechaza" $rechazado

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
