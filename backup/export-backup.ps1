[CmdletBinding()]
param(
  [string]$SourceEnv = (Join-Path $PSScriptRoot "..\.env")
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
  param(
    [hashtable]$Values,
    [string]$Name
  )

  $value = $Values[$Name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Name is missing from $SourceEnv"
  }
  return $value
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required to generate the SQL backup."
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
$initDirectory = Join-Path $PSScriptRoot "init"

New-Item -ItemType Directory -Force -Path $initDirectory | Out-Null
$resolvedInitDirectory = (Resolve-Path -LiteralPath $initDirectory).Path
$resolvedBackupDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path

$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $dbPassword
try {
  Write-Host "Exporting schema structure..."
  docker run --rm `
    -e PGPASSWORD `
    -v "${resolvedInitDirectory}:/backup" `
    postgres:18 `
    pg_dump `
    --host=$dockerDbHost `
    --port=$dbPort `
    --username=$dbUser `
    --dbname=$dbName `
    --schema-only `
    --no-owner `
    --no-privileges `
    --schema=iam `
    --schema=master `
    --schema=inventory `
    --file=/backup/001-structure.sql
  if ($LASTEXITCODE -ne 0) { throw "Schema export failed." }

  Write-Host "Exporting IAM seed data (excluding sessions and audit logs)..."
  docker run --rm `
    -e PGPASSWORD `
    -v "${resolvedInitDirectory}:/backup" `
    postgres:18 `
    pg_dump `
    --host=$dockerDbHost `
    --port=$dbPort `
    --username=$dbUser `
    --dbname=$dbName `
    --data-only `
    --inserts `
    --disable-triggers `
    --no-owner `
    --no-privileges `
    --table=iam.actions `
    --table=iam.department_permissions `
    --table=iam.departments `
    --table=iam.menus `
    --table=iam.migrations `
    --table=iam.permissions `
    --table=iam.role_actions `
    --table=iam.roles `
    --table=iam.user_department_permissions `
    --table=iam.user_department_roles `
    --table=iam.users `
    --file=/backup/002-iam-seed.sql
  if ($LASTEXITCODE -ne 0) { throw "IAM seed export failed." }

  Write-Host "Exporting standalone IAM schema and seed query..."
  docker run --rm `
    -e PGPASSWORD `
    -v "${resolvedBackupDirectory}:/backup" `
    postgres:18 `
    pg_dump `
    --host=$dockerDbHost `
    --port=$dbPort `
    --username=$dbUser `
    --dbname=$dbName `
    --no-owner `
    --no-privileges `
    --schema=iam `
    --exclude-table-data=iam.auth_sessions `
    --exclude-table-data=iam.audit_logs `
    --file=/backup/iam-schema-and-seed.sql
  if ($LASTEXITCODE -ne 0) { throw "Standalone IAM export failed." }

  Write-Host "Exporting all schemas, all tables, and IAM-only seed query..."
  docker run --rm `
    -e PGPASSWORD `
    -v "${resolvedBackupDirectory}:/backup" `
    postgres:18 `
    pg_dump `
    --host=$dockerDbHost `
    --port=$dbPort `
    --username=$dbUser `
    --dbname=$dbName `
    --no-owner `
    --no-privileges `
    --schema=iam `
    --schema=master `
    --schema=inventory `
    --exclude-table-data=iam.auth_sessions `
    --exclude-table-data=iam.audit_logs `
    --exclude-table-data=master.* `
    --exclude-table-data=inventory.* `
    --file=/backup/database-schema-and-iam-seed.sql
  if ($LASTEXITCODE -ne 0) { throw "Combined database export failed." }
}
finally {
  $env:PGPASSWORD = $previousPassword
}

Write-Host "Backup generated in $PSScriptRoot"
