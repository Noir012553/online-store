$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $PSScriptRoot "run-retranslate-report.ps1"
$envPath = Join-Path $backendRoot ".env"
$taskName = "OnlineStore-Retranslate-Daily"

if (-not (Test-Path $envPath)) {
  throw "Missing $envPath. Add MONGO_URI before scheduling retranslation."
}

$envContents = Get-Content -Path $envPath -Raw
if ($envContents -notmatch '(?m)^\s*MONGO_URI\s*=\s*\S+') {
  throw "MONGO_URI is missing or empty in $envPath."
}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  throw "Scheduled task '$taskName' already exists. Remove or update it in Windows Task Scheduler before registering again."
}

$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
$action = New-ScheduledTaskAction `
  -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`"" `
  -WorkingDirectory $backendRoot
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddDays(1))

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Retranslate translation records daily at local midnight and save reports under backend/report."

Write-Host "Scheduled '$taskName' for 00:00 local time. Keep this Windows user signed in for the task to run."
