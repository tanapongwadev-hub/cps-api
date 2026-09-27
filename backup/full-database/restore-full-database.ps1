[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot ".env"
$dumpPath = Join-Path $PSScriptRoot "cps-database-full.dump"
$checksumPath = Join-Path $PSScriptRoot "cps-database-full.dump.sha256"
$composeFile = Join-Path $PSScriptRoot "docker-compose.yml"

function Read-DotEnv {
  param([string]$Path)
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

foreach ($requiredFile in @($envFile, $dumpPath, $checksumPath, $composeFile)) {
  if (-not (Test-Path -LiteralPath $requiredFile)) {
    throw "Required file not found: $requiredFile"
  }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is required."
}

$config = Read-DotEnv -Path $envFile
$dbUser = $config["DB_USERNAME"]
$dbName = $config["DB_DATABASE"]
if ($dbUser -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw "DB_USERNAME contains unsupported characters."
}
if ($dbName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw "DB_DATABASE contains unsupported characters."
}

$expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) {
  throw "Backup checksum mismatch. Copy the backup file again before restoring."
}

Write-Host "WARNING: this replaces the complete '$dbName' database in the Docker volume."
$confirmation = Read-Host "Type the database name '$dbName' to continue"
if ($confirmation -cne $dbName) {
  throw "Restore cancelled: database name did not match."
}

docker compose --env-file $envFile -f $composeFile up -d --wait
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL startup failed." }

docker compose --env-file $envFile -f $composeFile exec -T postgres `
  dropdb --username $dbUser --if-exists --force $dbName
if ($LASTEXITCODE -ne 0) { throw "Unable to remove the target database." }

docker compose --env-file $envFile -f $composeFile exec -T postgres `
  createdb --username $dbUser $dbName
if ($LASTEXITCODE -ne 0) { throw "Unable to create the target database." }

docker compose --env-file $envFile -f $composeFile exec -T postgres `
  pg_restore `
  --username $dbUser `
  --dbname $dbName `
  --exit-on-error `
  --no-owner `
  --no-privileges `
  /backup/cps-database-full.dump
if ($LASTEXITCODE -ne 0) { throw "Database restore failed." }

docker compose --env-file $envFile -f $composeFile exec -T postgres `
  psql --username $dbUser --dbname $dbName --set ON_ERROR_STOP=1 `
  --command "SELECT table_schema, count(*) AS tables FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') GROUP BY table_schema ORDER BY table_schema;"
if ($LASTEXITCODE -ne 0) { throw "Database verification failed." }

Write-Host "Restore complete. Database is available on localhost:$($config['DB_PORT'])/$dbName"
