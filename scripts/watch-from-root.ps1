param(
  [Parameter(Mandatory = $true)]
  [string]$EntryPath
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resolvedEntry = (Resolve-Path $EntryPath).Path
$envFile = Join-Path $repoRoot '.env'

& bun --cwd $repoRoot --env-file=$envFile --watch $resolvedEntry
exit $LASTEXITCODE
