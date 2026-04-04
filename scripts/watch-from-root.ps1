param(
  [Parameter(Mandatory = $true)]
  [string]$EntryPath
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not (Test-Path $EntryPath)) {
  Write-Error "Entry file not found: $EntryPath"
  exit 1
}

$resolvedEntry = (Resolve-Path $EntryPath).Path
$envFile = Join-Path $repoRoot '.env'

& bun --cwd $repoRoot --env-file=$envFile --watch $resolvedEntry
exit $LASTEXITCODE
