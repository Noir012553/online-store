param(
  [ValidateRange(5, 300)]
  [int]$RefreshSeconds = 30
)

$backendRoot = Split-Path -Parent $PSScriptRoot
$progressDirectory = Join-Path $backendRoot '.retranslate-progress'
$checkpointPath = Join-Path $progressDirectory '*.jsonl'
$lockPath = Join-Path $progressDirectory 'retranslate.lock'
$backlogScript = Join-Path $backendRoot 'src\scripts\retranslate-storefront-backlog.js'
$baselineBytes = $null

Set-Location $backendRoot
Write-Host "Read-only retranslation watcher. Refresh: ${RefreshSeconds}s. Press Ctrl+C to stop."

while ($true) {
  $output = & node $backlogScript --dry-run 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Write-Host ($output -join [Environment]::NewLine) -ForegroundColor Red
    Write-Host 'Backlog query failed; watcher stopped.' -ForegroundColor Red
    break
  }

  try {
    $backlog = ($output -join [Environment]::NewLine) | ConvertFrom-Json
  }
  catch {
    Write-Host ($output -join [Environment]::NewLine) -ForegroundColor Red
    Write-Host 'Could not parse dry-run output; watcher stopped.' -ForegroundColor Red
    break
  }

  $checkpoint = Get-ChildItem -Path $checkpointPath -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $checkpointBytes = 0
  $lastCheckpointWrite = 'not yet created'

  if ($checkpoint) {
    $checkpointBytes = $checkpoint.Length
    $lastCheckpointWrite = $checkpoint.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
    if ($null -eq $baselineBytes) { $baselineBytes = $checkpointBytes }
  }

  $bytesSinceWatcher = if ($null -eq $baselineBytes) { 0 } else { [Math]::Max(0, $checkpointBytes - $baselineBytes) }
  $runLock = Test-Path $lockPath
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Write-Host "[$timestamp] readiness backlog: $($backlog.candidateJobs) locale slots; ready: $($backlog.currentlyReady)/$($backlog.checkedProducts); checkpoint growth: $bytesSinceWatcher bytes; latest checkpoint: $lastCheckpointWrite; apply lock: $runLock"

  Start-Sleep -Seconds $RefreshSeconds
}
