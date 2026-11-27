param(
  [switch]$ConfirmStart
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') { throw 'Run this operation on the Windows host.' }
if (-not $ConfirmStart) { throw 'Pass -ConfirmStart only after routing has been returned to Tunnel.' }

$serviceRoot = Join-Path $env:ProgramData 'LaptopStore\services'
$serviceIds = @('LaptopStoreBackend', 'LaptopStoreFrontend')
$verifiedServices = @()

foreach ($serviceId in $serviceIds) {
  $service = Get-CimInstance Win32_Service -Filter "Name = '$serviceId'"
  if (-not $service) { throw "Required WinSW service is not installed: $serviceId" }

  $expectedExecutable = Join-Path (Join-Path $serviceRoot $serviceId) ($serviceId + '.exe')
  $expectedCommandPrefix = '"{0}"' -f [IO.Path]::GetFullPath($expectedExecutable)
  if (-not $service.PathName.StartsWith($expectedCommandPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to control a service not installed from the LaptopStore WinSW directory: $serviceId"
  }

  if ($service.State -notin @('Running', 'Stopped')) {
    throw "Service $serviceId is in an unexpected state: $($service.State)"
  }

  $verifiedServices += [PSCustomObject]@{ Id = $serviceId; State = $service.State }
}

$startedServices = @()
try {
  foreach ($service in $verifiedServices | Where-Object { $_.State -eq 'Stopped' }) {
    Start-Service -Name $service.Id -ErrorAction Stop
    $startedServices += $service.Id
    (Get-Service -Name $service.Id).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
  }
} catch {
  $startError = $_
  for ($index = $startedServices.Count - 1; $index -ge 0; $index -= 1) {
    $serviceId = $startedServices[$index]
    try {
      Stop-Service -Name $serviceId -ErrorAction Stop
      (Get-Service -Name $serviceId).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
    } catch {
      Write-Warning "Rollback could not stop $serviceId. Manual recovery is required."
    }
  }
  throw $startError
}

[PSCustomObject]@{
  Success = $true
  StartedServices = @($verifiedServices | Where-Object { $_.State -eq 'Stopped' } | ForEach-Object Id)
  AlreadyRunningServices = @($verifiedServices | Where-Object { $_.State -eq 'Running' } | ForEach-Object Id)
}
