# Cifra un Page Access Token y lo guarda en private.meta_credentials.
#
# AES-256-GCM con la clave FUERA de la base de datos, tal como fija docs/02 §7.8:
# un volcado de la base no contiene la clave. El `kid` va desde el primer dia,
# porque sin identificador de clave rotar significa descifrar y volver a cifrar
# todo a la vez, con ventana de indisponibilidad.
#
# El token nunca se imprime, ni siquiera truncado.

param(
  [Parameter(Mandatory = $true)] [string] $TokenSupabase,
  [Parameter(Mandatory = $true)] [string] $ConexionId,
  [Parameter(Mandatory = $true)] [string] $PageAccessToken,
  [string] $ClaveBase64,
  [string] $Kid = "k1",
  [string] $ProjectRef = "sdazqohyjzzylwbkvovx"
)

$ErrorActionPreference = "Stop"

# Clave de 256 bits. Si no se pasa una, se genera y se devuelve para guardarla
# en el almacen de secretos: sin ella el token es irrecuperable.
if ($ClaveBase64) {
  $clave = [Convert]::FromBase64String($ClaveBase64)
} else {
  $clave = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($clave)
  Write-Host "CLAVE NUEVA GENERADA (guardala en los secretos del proyecto):"
  Write-Host "  KAVEA_CRED_KEY_$Kid = $([Convert]::ToBase64String($clave))"
}

# Nonce de 96 bits, el tamano que recomienda GCM. Uno por cifrado, nunca reusado.
$nonce = New-Object byte[] 12
[Security.Cryptography.RandomNumberGenerator]::Fill($nonce)

$plano  = [Text.Encoding]::UTF8.GetBytes($PageAccessToken)
$cifra  = New-Object byte[] $plano.Length
$tag    = New-Object byte[] 16

$gcm = [Security.Cryptography.AesGcm]::new($clave, 16)
$gcm.Encrypt($nonce, $plano, $cifra, $tag)
$gcm.Dispose()

# El tag de autenticacion se concatena al ciphertext: sin el, GCM no detecta
# manipulacion y deja de ser cifrado autenticado.
$cifraConTag = New-Object byte[] ($cifra.Length + $tag.Length)
[Array]::Copy($cifra, 0, $cifraConTag, 0, $cifra.Length)
[Array]::Copy($tag, 0, $cifraConTag, $cifra.Length, $tag.Length)

function Hex($b) { '\x' + (($b | ForEach-Object { $_.ToString('x2') }) -join '') }

$sql = @"
insert into private.meta_credentials
  (meta_connection_id, page_access_token_cipher, page_access_token_nonce, page_access_token_kid)
values
  ('$ConexionId', '$(Hex $cifraConTag)'::bytea, '$(Hex $nonce)'::bytea, '$Kid')
on conflict (meta_connection_id) do update set
  page_access_token_cipher = excluded.page_access_token_cipher,
  page_access_token_nonce  = excluded.page_access_token_nonce,
  page_access_token_kid    = excluded.page_access_token_kid,
  rotado_en                = now();

select 'credencial guardada, ' || octet_length(page_access_token_cipher)::text || ' bytes cifrados, kid=' || page_access_token_kid as l
  from private.meta_credentials where meta_connection_id = '$ConexionId';
"@

$h = @{ Authorization = "Bearer $TokenSupabase"; "Content-Type" = "application/json" }
$r = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" `
      -Method Post -Headers $h -Body (@{ query = $sql } | ConvertTo-Json -Depth 3)
$r | ForEach-Object { Write-Host "  $($_.l)" }
