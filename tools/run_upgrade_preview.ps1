param(
    [Parameter(Mandatory=$true)][ValidateSet('backend','frontend')][string]$Component,
    [int]$WebPort = 3020,
    [int]$ApiPort = 8020,
    [string]$DataPath = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot
$targetPort = if ($Component -eq 'backend') { $ApiPort } else { $WebPort }
if (Get-NetTCPConnection -State Listen -LocalPort $targetPort -ErrorAction SilentlyContinue) {
    throw "Port $targetPort is already in use; no process was stopped."
}
# Explicit offline preview: no dotenv/credential discovery, Google APIs or provider calls.
$env:FOODTOUR_CHAT_V2 = '1'
$env:FOODTOUR_UI_GUIDED = '1'
$env:FOODTOUR_UI_V2 = '1'
$env:FOODTOUR_LLM = 'mock'
$env:FOODTOUR_EXPLAIN = 'template'
$env:FOODTOUR_ROUTING = 'estimate'
$env:FOODTOUR_GEOCODER = 'off'
$env:GOOGLE_MAPS_BROWSER_KEY = ''
$env:GOOGLE_MAPS_SERVER_KEY = ''
$env:GOOGLE_MAPS_MAP_ID = ''
$env:FOODTOUR_SESSION_DB = ''
$env:FOODTOUR_EVIDENCE_PATH = ''
$env:WEB_ORIGIN = "http://127.0.0.1:$WebPort,http://localhost:$WebPort"
if ($Component -eq 'backend') {
    $env:PYTHONPATH = Join-Path $repoRoot 'backend'
    $env:PYTHONIOENCODING = 'utf-8'
    $env:FOODTOUR_DATA_PATH = if ($DataPath) { $DataPath } else { Join-Path $repoRoot 'contracts/fixtures/venues.chat.synthetic.json' }
    & (Join-Path $repoRoot '.venv/Scripts/python.exe') -m uvicorn app.main:app --host 127.0.0.1 --port $ApiPort
} else {
    $env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:$ApiPort"
    $env:NEXT_PUBLIC_API_MODE = 'real'
    $env:NEXT_PUBLIC_UI_GUIDED = '1'
    $env:NEXT_PUBLIC_CHAT_V2 = '1'
    $env:NEXT_PUBLIC_UI_V2 = '1'
    & node (Join-Path $repoRoot 'frontend/node_modules/next/dist/bin/next') dev (Join-Path $repoRoot 'frontend') --hostname 127.0.0.1 --port $WebPort
}
exit $LASTEXITCODE
