$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$reportDir = Join-Path $backendRoot "report"
$startedAt = Get-Date
$exitCode = 1
$failureReason = $null

New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$env:TRANSLATION_REPORT_DIR = $reportDir

Push-Location $backendRoot
try {
  & npm.cmd run retranslate
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    $failureReason = "npm run retranslate exited with code $exitCode"
  }
} catch {
  $exitCode = 1
  $failureReason = $_.Exception.Message
} finally {
  Pop-Location
}

if ($exitCode -ne 0) {
  $completedAt = Get-Date
  $failureReport = [ordered]@{
    type = "scheduled_retranslate_run"
    status = "failed"
    startedAt = $startedAt.ToString("o")
    completedAt = $completedAt.ToString("o")
    exitCode = $exitCode
    error = $failureReason
  }
  $filename = "retranslate-run-$($startedAt.ToString('yyyy-MM-dd-HHmmss')).json"
  $failureReport | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $reportDir $filename) -Encoding UTF8
}

exit $exitCode
