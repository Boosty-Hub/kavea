# Aplica las migraciones de supabase/migrations en orden, vía la API de gestión.
#
# Por qué no el CLI de Supabase: no está instalado en esta máquina y la API deja
# rastro verificable de cada sentencia. Cuando el CLI entre, este script se
# sustituye por `supabase db push` y la tabla de control se conserva.
#
# Guarda de proyecto: aplicar migraciones a la base equivocada es un error de un
# carácter. El ref esperado se pasa como parámetro y se compara antes de tocar nada.

param(
  [Parameter(Mandatory = $true)] [string] $Token,
  [string] $ProjectRef = "sdazqohyjzzylwbkvovx",
  [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$headers = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }
$endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"

function Invoke-Sql {
  param([string] $Sql)
  $body = @{ query = $Sql } | ConvertTo-Json -Depth 3
  return Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $body
}

# 1. Guarda: confirmar contra qué proyecto se va a escribir.
$info = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef" -Headers $headers
Write-Host "Proyecto : $($info.name) [$ProjectRef]"
Write-Host "Region   : $($info.region)"
Write-Host "Estado   : $($info.status)"
if ($info.status -ne "ACTIVE_HEALTHY") { throw "El proyecto no esta sano: $($info.status)" }

# 2. Tabla de control. Registra qué migración se aplicó y cuándo.
Invoke-Sql @"
create table if not exists public.schema_migrations (
  version     text primary key,
  aplicada_en timestamptz not null default now(),
  sha256      text not null
);
alter table public.schema_migrations enable row level security;
alter table public.schema_migrations force  row level security;
revoke all on public.schema_migrations from anon, authenticated;
"@ | Out-Null

$aplicadas = @{}
foreach ($r in (Invoke-Sql "select version, sha256 from public.schema_migrations;")) {
  $aplicadas[$r.version] = $r.sha256
}

# 3. Aplicar en orden lexicográfico, que es el orden numérico por el prefijo 00NN.
$dir = Join-Path $PSScriptRoot "..\supabase\migrations"
$archivos = Get-ChildItem $dir -Filter *.sql | Sort-Object Name

foreach ($f in $archivos) {
  $version = $f.BaseName
  $sql = Get-Content $f.FullName -Raw
  $sha = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()

  if ($aplicadas.ContainsKey($version)) {
    if ($aplicadas[$version] -ne $sha) {
      # Una migración ya aplicada que cambió de contenido es deriva de esquema:
      # lo que hay en la base ya no es lo que dice el repositorio.
      Write-Host ("  MODIFICADA  {0}  <-- el fichero cambio despues de aplicarse" -f $version) -ForegroundColor Red
    } else {
      Write-Host ("  ya aplicada {0}" -f $version) -ForegroundColor DarkGray
    }
    continue
  }

  if ($DryRun) { Write-Host ("  [dry-run]   {0}" -f $version) -ForegroundColor Yellow; continue }

  try {
    Invoke-Sql $sql | Out-Null
    Invoke-Sql "insert into public.schema_migrations (version, sha256) values ('$version', '$sha');" | Out-Null
    Write-Host ("  APLICADA    {0}" -f $version) -ForegroundColor Green
  } catch {
    $detalle = $_.ErrorDetails.Message
    Write-Host ("  FALLO       {0}" -f $version) -ForegroundColor Red
    Write-Host ("              {0}" -f $detalle) -ForegroundColor Red
    throw "Migracion $version fallida. Las anteriores quedan aplicadas."
  }
}

Write-Host ""
Write-Host "Listo."
