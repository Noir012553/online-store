[CmdletBinding()]
param(
    [ValidateSet('production', 'local')]
    [string]$Environment = 'production',

    [ValidateSet('frontend', 'backend')]
    [string]$Target = 'frontend',

    [ValidateSet('json', 'csv')]
    [string]$Format = 'json',

    [ValidateSet('insert', 'update', 'upsert')]
    [string]$Mode = 'upsert',

    [ValidateRange(1, 10000)]
    [int]$Limit = 10,

    [ValidateRange(1, 720)]
    [int]$MaxWaitMinutes = 30,

    [ValidateRange(5, 300)]
    [int]$RequestTimeoutSeconds = 120,

    [ValidateRange(1, 60)]
    [int]$PollIntervalSeconds = 5,

    [string]$FrontendBaseUrl,
    [string]$BackendBaseUrl,
    [string]$ImportFile,
    [string]$ZipOutputPath,
    [string]$ReportPath,
    [string]$CredentialPath = "$HOME\.online-store-export-credential.xml",
    [string]$Python = 'python',
    [switch]$CommitImport
)

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot '..\python\test_import_export.py'
if (-not (Test-Path $scriptPath)) {
    throw "Không tìm thấy Python test script: $scriptPath"
}

if (-not $FrontendBaseUrl) {
    $FrontendBaseUrl = if ($Environment -eq 'production') { 'https://manln.online' } else { 'http://127.0.0.1:3000' }
}

if (-not $BackendBaseUrl) {
    $BackendBaseUrl = if ($Environment -eq 'production') { 'https://backend.manln.online' } else { 'http://127.0.0.1:5000' }
}

if (-not (Test-Path $CredentialPath)) {
    throw "Không tìm thấy credential file: $CredentialPath"
}

$credential = Import-Clixml -Path $CredentialPath
$env:EXPORT_TEST_EMAIL = $credential.UserName
$env:EXPORT_TEST_PASSWORD = $credential.GetNetworkCredential().Password

$arguments = @(
    $scriptPath,
    '--environment', $Environment,
    '--target', $Target,
    '--frontend-base-url', $FrontendBaseUrl,
    '--backend-base-url', $BackendBaseUrl,
    '--format', $Format,
    '--mode', $Mode,
    '--limit', $Limit,
    '--max-wait-minutes', $MaxWaitMinutes,
    '--request-timeout-seconds', $RequestTimeoutSeconds,
    '--poll-interval-seconds', $PollIntervalSeconds
)

if ($ImportFile) { $arguments += @('--import-file', $ImportFile) }
if ($ZipOutputPath) { $arguments += @('--zip-output', $ZipOutputPath) }
if ($ReportPath) { $arguments += @('--report', $ReportPath) }
if ($CommitImport) { $arguments += '--commit-import' }

try {
    Write-Host "[TEST MODE] EXPORT -> ZIP VALIDATE -> IMPORT"
    Write-Host "[ENVIRONMENT] $Environment"
    Write-Host "[TARGET] $Target"
    Write-Host "[FORMAT] $Format"
    Write-Host "[MODE] $Mode"
    Write-Host "[IMPORT] $(if ($CommitImport) { 'commit' } else { 'dry-run' })"
    Write-Host "[FRONTEND] $FrontendBaseUrl"
    Write-Host "[BACKEND] $BackendBaseUrl"
    & $Python @arguments
    if ($LASTEXITCODE -ne 0) { throw "Python Playwright test thất bại với exit code $LASTEXITCODE" }
}
finally {
    Remove-Item Env:EXPORT_TEST_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_TEST_PASSWORD -ErrorAction SilentlyContinue
}
