param(
  [switch]$ConfirmStop
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') { throw 'Run this operation on the Windows host.' }
if (-not $ConfirmStop) { throw 'Pass -ConfirmStop only after the deployment preflight and maintenance approval succeed.' }

$serviceIds = @('LaptopStoreBackend', 'LaptopStoreFrontend')
$verifiedServices = @()

foreach ($serviceId in $serviceIds) {
  $service = Get-Service -Name $serviceId -ErrorAction Stop
  if ($service.Status -notin @('Running', 'Stopped')) {
    throw "Service $serviceId is in an unexpected state: $($service.Status)"
  }

  $verifiedServices += [PSCustomObject]@{ Id = $serviceId; State = [string]$service.Status }
}

$stoppedServices = @()
try {
  foreach ($service in $verifiedServices | Where-Object { $_.State -eq 'Running' }) {
    Stop-Service -Name $service.Id -ErrorAction Stop
    $stoppedServices += $service.Id
    (Get-Service -Name $service.Id).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
  }
} catch {
  $stopError = $_
  for ($index = $stoppedServices.Count - 1; $index -ge 0; $index -= 1) {
    $serviceId = $stoppedServices[$index]
    try {
      Start-Service -Name $serviceId -ErrorAction Stop
      (Get-Service -Name $serviceId).WaitForStatus('Running', [TimeSpan]::FromSeconds(45))
    } catch {
      Write-Warning "Rollback could not restart $serviceId. Manual recovery is required."
    }
  }
  throw $stopError
}

[PSCustomObject]@{
  Success = $true
  StoppedServices = @($verifiedServices | Where-Object { $_.State -eq 'Running' } | ForEach-Object Id)
  AlreadyStoppedServices = @($verifiedServices | Where-Object { $_.State -eq 'Stopped' } | ForEach-Object Id)
}
