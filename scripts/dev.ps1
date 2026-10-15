param(
    [int]$Port = 8000,
    [switch]$Frontend,
    [int]$FrontendPort = 3000,
    [switch]$SmokeTest
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonCandidates = @($env:PYTHON, (Join-Path $projectRoot '.venv/Scripts/python.exe'), 'python', 'D:/Downloads/thonny-5.0.0-windows-portable-x64/python.exe')
$pythonCommand = $null
foreach ($candidate in $pythonCandidates) {
    if (!$candidate) { continue }
    try { & $candidate --version 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $pythonCommand = $candidate; break } } catch { }
    if ($env:PYTHON -and $candidate -eq $env:PYTHON) { throw 'PYTHON override is not a working interpreter.' }
}
if (!$pythonCommand) { throw 'Python 3.11+ required; set PYTHON to an interpreter path.' }
$arguments = @((Join-Path $PSScriptRoot 'local.py'), 'dev', '--port', "$Port", '--frontend-port', "$FrontendPort")
if ($Frontend) { $arguments += '--frontend' }
if ($SmokeTest) { $arguments += '--smoke-test' }
& $pythonCommand @arguments
exit $LASTEXITCODE
