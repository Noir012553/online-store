[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [string]$WinSWPath,
  [switch]$InstallServices
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') { throw 'Run this installer on the Windows host.' }

$backendRoot = Split-Path $PSScriptRoot -Parent
$projectRoot = Split-Path $backendRoot -Parent
$frontendRoot = Join-Path $projectRoot 'online-store-frontend'
$programDataRoot = Join-Path $env:ProgramData 'LaptopStore'
$serviceRoot = Join-Path $programDataRoot 'services'
$logRoot = Join-Path $programDataRoot 'logs'
$secretRoot = Join-Path $programDataRoot 'secrets'
$tunnelSecretRoot = Join-Path $secretRoot 'tunnel'
$settingsSecretRoot = Join-Path $secretRoot 'settings'
$tokenPath = Join-Path $tunnelSecretRoot 'tunnel-token.dpapi'
$winswSource = (Resolve-Path $WinSWPath).Path
$node = Get-Command node.exe -ErrorAction Stop
$cloudflared = Get-Command cloudflared.exe -ErrorAction Stop

if (-not (Test-Path (Join-Path $backendRoot 'node_modules\express'))) { throw 'Backend dependencies are not installed.' }
if (-not (Test-Path (Join-Path $frontendRoot '.next\BUILD_ID'))) { throw 'Frontend production build is missing.' }
if (-not (Test-Path (Join-Path $backendRoot '.env'))) { throw 'Backend .env is missing; service configuration needs review.' }
if (Test-Path $programDataRoot) { throw "Refusing to modify existing service data directory: $programDataRoot" }

$services = @(
  @{ Id = 'LaptopStoreBackend'; Name = 'Laptop Store Backend'; Executable = $node.Source; Arguments = '--max-old-space-size=1024 src/app.js'; WorkingDirectory = $backendRoot; LogPath = Join-Path $logRoot 'backend'; ReadPath = $backendRoot; WritePaths = @((Join-Path $backendRoot 'uploads'), (Join-Path $backendRoot '.retranslate-progress'), (Join-Path $backendRoot 'reports')) },
  @{ Id = 'LaptopStoreFrontend'; Name = 'Laptop Store Frontend'; Executable = $node.Source; Arguments = 'node_modules/next/dist/bin/next start'; WorkingDirectory = $frontendRoot; LogPath = Join-Path $logRoot 'frontend'; ReadPath = $frontendRoot; WritePaths = @((Join-Path $frontendRoot '.next\cache')) },
  @{ Id = 'LaptopStoreTunnel'; Name = 'Laptop Store Cloudflare Tunnel'; Executable = $node.Source; Arguments = 'tunnel.js'; WorkingDirectory = Join-Path $serviceRoot 'LaptopStoreTunnel'; LogPath = Join-Path $logRoot 'tunnel'; ReadPath = Split-Path $cloudflared.Source -Parent; WritePaths = @(); Tunnel = $true }
)

foreach ($service in $services) {
  if (Get-Service -Name $service.Id -ErrorAction SilentlyContinue) {
    throw "Service $($service.Id) already exists; refusing to replace it."
  }
}

$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(3000, 5000) } |
  Select-Object LocalAddress, LocalPort, OwningProcess -Unique)
'Preflight passed; no files, services, or running processes have been changed.'
'Backend: {0}' -f $backendRoot
'Frontend: {0}' -f $frontendRoot
'Node: {0}' -f $node.Source
'cloudflared: {0}' -f $cloudflared.Source
'Tunnel DPAPI token path: {0}' -f $tokenPath
'Existing .env and Tunnel token contents were not read or printed.'
if ($listeners.Count -gt 0) { 'Ports 3000/5000 are occupied; existing listeners will not be stopped.'; $listeners | Format-Table -AutoSize }
if (-not $InstallServices) { 'Dry run only. Use -InstallServices during an approved maintenance window.'; return }

$isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdministrator) { throw 'Run with Administrator privileges to install services.' }
if (-not (Test-Path $tokenPath)) {
  Add-Type -AssemblyName System.Security
  $secureToken = Read-Host 'Paste the Cloudflare Tunnel token (input is hidden)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $tokenBytes = $null
  $protectedToken = $null
  try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($plainToken)) { throw 'Tunnel token cannot be empty.' }
    $tokenBytes = [Text.Encoding]::UTF8.GetBytes($plainToken)
    $protectedToken = [Security.Cryptography.ProtectedData]::Protect(
      $tokenBytes,
      $null,
      [Security.Cryptography.DataProtectionScope]::LocalMachine
    )
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    if ($tokenBytes) { [Array]::Clear($tokenBytes, 0, $tokenBytes.Length) }
    $plainToken = $null
  }
}

$createdServices = @()
try {
  if ($PSCmdlet.ShouldProcess($programDataRoot, 'Create protected service directories')) {
    New-Item -ItemType Directory -Path $programDataRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $serviceRoot, $logRoot, $secretRoot, $tunnelSecretRoot, $settingsSecretRoot -Force | Out-Null
    [IO.File]::WriteAllBytes($tokenPath, $protectedToken)
    & icacls.exe $programDataRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict ProgramData ACL.' }
    & icacls.exe $tunnelSecretRoot /grant 'NT SERVICE\LaptopStoreTunnel:(OI)(CI)RX' | Out-Null
    & icacls.exe $settingsSecretRoot /grant 'NT SERVICE\LaptopStoreBackend:(OI)(CI)RX' | Out-Null
    & icacls.exe $tokenPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' 'NT SERVICE\LaptopStoreTunnel:R' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict DPAPI Tunnel token ACL.' }
  }

  foreach ($service in $services) {
    $directory = Join-Path $serviceRoot $service.Id
    $logDirectory = $service.LogPath
    New-Item -ItemType Directory -Path $directory, $logDirectory -Force | Out-Null
    & icacls.exe $directory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' "NT SERVICE\$($service.Id):(OI)(CI)RX" | Out-Null
    & icacls.exe $logDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' "NT SERVICE\$($service.Id):(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not set service directory ACL for $($service.Id)." }

    $exePath = Join-Path $directory ($service.Id + '.exe')
    $xmlPath = Join-Path $directory ($service.Id + '.xml')
    Copy-Item -LiteralPath $winswSource -Destination $exePath
    $tunnelEnvironment = ''
    if ($service.Tunnel) {
      Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tunnel.js') -Destination (Join-Path $directory 'tunnel.js')
      Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'read-dpapi-secret.ps1') -Destination (Join-Path $directory 'read-dpapi-secret.ps1')
      $tunnelEnvironment = @"
  <env name="CLOUDFLARED_BIN" value="$([Security.SecurityElement]::Escape($cloudflared.Source))" />
  <env name="CLOUDFLARED_TUNNEL_TOKEN_DPAPI_FILE" value="$([Security.SecurityElement]::Escape($tokenPath))" />
"@
    }
    $xml = @"
<service>
  <id>$($service.Id)</id>
  <name>$($service.Name)</name>
  <description>Managed by WinSW.</description>
  <executable>$([Security.SecurityElement]::Escape($service.Executable))</executable>
  <arguments>$([Security.SecurityElement]::Escape($service.Arguments))</arguments>
  <workingdirectory>$([Security.SecurityElement]::Escape($service.WorkingDirectory))</workingdirectory>
  <startmode>Automatic</startmode>
  <logpath>$([Security.SecurityElement]::Escape($logDirectory))</logpath>
  <log mode="roll" />
$tunnelEnvironment</service>
"@
    [IO.File]::WriteAllText($xmlPath, $xml, [Text.UTF8Encoding]::new($false))

    & icacls.exe $exePath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' "NT SERVICE\$($service.Id):RX" | Out-Null
    & icacls.exe $xmlPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' "NT SERVICE\$($service.Id):R" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not set WinSW file ACL for $($service.Id)." }

    & icacls.exe $service.ReadPath /grant "NT SERVICE\$($service.Id):(OI)(CI)RX" /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not grant read access to $($service.ReadPath)." }
    foreach ($writePath in $service.WritePaths) {
      New-Item -ItemType Directory -Path $writePath -Force | Out-Null
      & icacls.exe $writePath /grant "NT SERVICE\$($service.Id):(OI)(CI)M" /T /C | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Could not grant runtime write access to $writePath." }
    }
    if ($service.Id -eq 'LaptopStoreBackend') {
      & icacls.exe (Join-Path $backendRoot '.env') /grant 'NT SERVICE\LaptopStoreBackend:R' | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Could not grant backend read access to .env.' }
    }

    & $exePath install $xmlPath
    if ($LASTEXITCODE -ne 0) { throw "WinSW install failed for $($service.Id)." }
    $createdServices += [PSCustomObject]@{ Id = $service.Id; Exe = $exePath; Xml = $xmlPath }
    & sc.exe config $service.Id 'obj=' "NT SERVICE\$($service.Id)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not assign the virtual service account to $($service.Id)." }
    & sc.exe config $service.Id 'start=' 'demand' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not keep $($service.Id) stopped until cutover." }
  }
} catch {
  foreach ($service in $createdServices) {
    & $service.Exe uninstall $service.Xml | Out-Null
  }
  throw
} finally {
  if ($protectedToken) { [Array]::Clear($protectedToken, 0, $protectedToken.Length) }
}

'WinSW services are installed but remain stopped. Existing cmd.exe processes and port listeners were not stopped.'
'After reviewing service status and ACLs, schedule a maintenance window to stop old consoles and start the three services.'
'No .env content or Tunnel token was printed.'
