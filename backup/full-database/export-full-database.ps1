[CmdletBinding()]
param(
  [string]$SourceEnv = (Join-Path $PSScriptRoot "..\..\.env")
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment file not found: $Path"
  }

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
      continue
    }
    $name, $value = $trimmed.Split("=", 2)
    $values[$name.Trim()] = $value.Trim().Trim('"').Trim("'")
  }
  return $values
}

function Require-Value {
  param([hashtable]$Values, [string]$Name)
  $value = $Values[$Name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Name is missing from $SourceEnv"
  }
  return $value
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is required."
}

$config = Read-DotEnv -Path $SourceEnv
$dbHost = Require-Value -Values $config -Name "DB_HOST"
$dockerDbHost = if ($dbHost -in @("localhost", "127.0.0.1", "::1")) {
  "host.docker.internal"
} else {
  $dbHost
}
$dbPort = if ($config["DB_PORT"]) { $config["DB_PORT"] } else { "5432" }
$dbUser = Require-Value -Values $config -Name "DB_USERNAME"
$dbPassword = Require-Value -Values $config -Name "DB_PASSWORD"
$dbName = Require-Value -Values $config -Name "DB_DATABASE"
$backupDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$dumpPath = Join-Path $PSScriptRoot "cps-database-full.dump"
$checksumPath = Join-Path $PSScriptRoot "cps-database-full.dump.sha256"

$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $dbPassword
try {
  Write-Host "Exporting the complete database '$dbName'..."
  docker run --rm `
    -e PGPASSWORD `
    -v "${backupDirectory}:/backup" `
    postgres:18 `
    pg_dump `
    --host=$dockerDbHost `
    --port=$dbPort `
    --username=$dbUser `
    --dbname=$dbName `
    --format=custom `
    --compress=9 `
    --no-owner `
    --no-privileges `
    --file=/backup/cps-database-full.dump
  if ($LASTEXITCODE -ne 0) { throw "Full database export failed." }
}
finally {
  $env:PGPASSWORD = $previousPassword
}

$hash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $checksumPath -Value "$hash  cps-database-full.dump" -Encoding ascii

Write-Host "Complete backup created: $dumpPath"
Write-Host "SHA256: $hash"
