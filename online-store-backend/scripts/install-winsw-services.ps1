[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [string]$WinSWPath,
  [string]$WinSWSha256,
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
$workerRoot = Join-Path $serviceRoot 'LaptopStoreSettingsApplyWorker'
$workerRuntime = Join-Path $workerRoot 'runtime'
$tokenPath = Join-Path $tunnelSecretRoot 'tunnel-token.dpapi'
$winswSource = (Resolve-Path $WinSWPath).Path
$winswHash = (Get-FileHash -LiteralPath $winswSource -Algorithm SHA256).Hash
if ($WinSWSha256 -and $winswHash -ne $WinSWSha256.ToUpperInvariant()) { throw 'WinSW SHA-256 checksum does not match.' }
if ($InstallServices -and -not $WinSWSha256) { throw 'Pass the SHA-256 checksum verified from the official WinSW release before installation.' }
$node = Get-Command node.exe -ErrorAction Stop
$cloudflared = Get-Command cloudflared.exe -ErrorAction Stop

if (-not (Test-Path (Join-Path $backendRoot 'node_modules\express'))) { throw 'Backend dependencies are not installed.' }
if (-not (Test-Path (Join-Path $frontendRoot '.next\BUILD_ID'))) { throw 'Frontend production build is missing.' }
if (-not (Test-Path (Join-Path $backendRoot '.env'))) { throw 'Backend .env is missing; service configuration needs review.' }
if (Test-Path $programDataRoot) { throw "Refusing to modify existing service data directory: $programDataRoot" }
$frontendEnvFiles = @(Get-ChildItem -LiteralPath $frontendRoot -Force -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq '.env' -or $_.Name -like '.env.*' })
if ($frontendEnvFiles.Count -gt 0) { throw 'Frontend root contains .env files; remove or relocate them before granting the frontend service access.' }

$services = @(
  @{ Id = 'LaptopStoreBackend'; Name = 'Laptop Store Backend'; Executable = $node.Source; Arguments = '--max-old-space-size=1024 src/app.js'; WorkingDirectory = $backendRoot; LogPath = Join-Path $logRoot 'backend'; ReadPath = $backendRoot; WritePaths = @((Join-Path $backendRoot 'uploads'), (Join-Path $backendRoot '.retranslate-progress'), (Join-Path $backendRoot 'reports')) },
  @{ Id = 'LaptopStoreFrontend'; Name = 'Laptop Store Frontend'; Executable = $node.Source; Arguments = 'node_modules/next/dist/bin/next start'; WorkingDirectory = $frontendRoot; LogPath = Join-Path $logRoot 'frontend'; ReadPath = $frontendRoot; WritePaths = @((Join-Path $frontendRoot '.next\cache')) },
  @{ Id = 'LaptopStoreTunnel'; Name = 'Laptop Store Cloudflare Tunnel'; Executable = $node.Source; Arguments = 'tunnel.js'; WorkingDirectory = Join-Path $serviceRoot 'LaptopStoreTunnel'; LogPath = Join-Path $logRoot 'tunnel'; ReadPath = Join-Path $serviceRoot 'LaptopStoreTunnel'; WritePaths = @(); Tunnel = $true },
  @{ Id = 'LaptopStoreSettingsApplyWorker'; Name = 'Laptop Store Settings Apply Worker'; Executable = $node.Source; Arguments = 'scripts/settings-apply-worker.js'; WorkingDirectory = $workerRuntime; LogPath = Join-Path $logRoot 'settings-worker'; ReadPath = $workerRuntime; WritePaths = @(); SettingsWorker = $true }
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
'WinSW SHA-256: {0}' -f $winswHash
'Tunnel DPAPI token path: {0}' -f $tokenPath
'Existing .env and Tunnel token contents were not read or printed.'
if ($listeners.Count -gt 0) { 'Ports 3000/5000 are occupied; existing listeners will not be stopped.'; $listeners | Format-Table -AutoSize }
if (-not $InstallServices) { 'Dry run only. Use -InstallServices during an approved maintenance window.'; return }

$isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdministrator) { throw 'Run with Administrator privileges to install services.' }
if (-not $PSCmdlet.ShouldProcess('Windows host', 'Install four stopped WinSW services, protect the Tunnel token, and provision the settings worker')) { return }

Add-Type -AssemblyName System.Security
$secureToken = Read-Host 'Paste the Cloudflare Tunnel token (input is hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$tokenBytes = $null
$protectedToken = $null
$createdServices = @()
$createdProgramData = $false
$aclBackupDirectory = Join-Path $env:TEMP ('LaptopStoreAcl-' + [guid]::NewGuid().ToString('N'))
$backendAclBackup = Join-Path $aclBackupDirectory 'backend.acl'
$frontendAclBackup = Join-Path $aclBackupDirectory 'frontend.acl'
$serviceDaclBackups = @{}
$envAclBackups = @{}
$envFiles = @()

function Invoke-Icacls {
  param([string[]]$Arguments)
  & icacls.exe @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls failed: $($Arguments -join ' ')" }
}

function Set-RestrictedDirectoryAcl {
  param([string]$Path, [string[]]$Grants)
  Invoke-Icacls @($Path, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')
  foreach ($grant in $Grants) { Invoke-Icacls @($Path, '/grant', $grant) }
}

function Get-ServiceDacl {
  param([string]$ServiceId)
  $output = & sc.exe sdshow $ServiceId 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not read service DACL for $ServiceId." }
  $line = @($output | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^\s*(?:O:|G:|D:)' } | Select-Object -First 1)
  if (-not $line) { throw "Could not parse service DACL for $ServiceId." }
  return $line.Trim()
}

function Add-WorkerBackendServiceRights {
  param([string]$ServiceId, [string]$Account)
  $sid = (New-Object Security.Principal.NTAccount($Account)).Translate([Security.Principal.SecurityIdentifier])
  $descriptor = [Security.AccessControl.RawSecurityDescriptor]::new((Get-ServiceDacl $ServiceId))
  if (-not $descriptor.DiscretionaryAcl) { throw "Service $ServiceId has no DACL; refusing to grant worker access." }
  $ace = [Security.AccessControl.CommonAce]::new(
    [Security.AccessControl.AceFlags]::None,
    [Security.AccessControl.AceQualifier]::AccessAllowed,
    0x0034,
    $sid,
    $false,
    $null
  )
  $insertAt = $descriptor.DiscretionaryAcl.Count
  for ($index = 0; $index -lt $descriptor.DiscretionaryAcl.Count; $index++) {
    if ($descriptor.DiscretionaryAcl[$index].IsInherited) { $insertAt = $index; break }
  }
  $descriptor.DiscretionaryAcl.InsertAce($insertAt, $ace)
  $sddl = $descriptor.GetSddlForm([Security.AccessControl.AccessControlSections]::All)
  & sc.exe sdset $ServiceId $sddl | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not grant only query/start/stop access to $ServiceId." }
}

try {
  New-Item -ItemType Directory -Path $aclBackupDirectory -Force | Out-Null
  & icacls.exe $backendRoot /save $backendAclBackup /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not back up backend ACLs; no host changes were made.' }
  & icacls.exe $frontendRoot /save $frontendAclBackup /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not back up frontend ACLs; no host changes were made.' }

  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($plainToken)) { throw 'Tunnel token cannot be empty.' }
  $tokenBytes = [Text.Encoding]::UTF8.GetBytes($plainToken)
  $protectedToken = [Security.Cryptography.ProtectedData]::Protect(
    $tokenBytes,
    $null,
    [Security.Cryptography.DataProtectionScope]::LocalMachine
  )
  $plainToken = $null

  $envFiles = @(Get-ChildItem -LiteralPath $backendRoot -Force -File -Filter '.env*')
  foreach ($envFile in $envFiles) { $envAclBackups[$envFile.FullName] = Get-Acl $envFile.FullName }
  $operatorAccount = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  New-Item -ItemType Directory -Path $programDataRoot -Force | Out-Null
  $createdProgramData = $true
  New-Item -ItemType Directory -Path $serviceRoot, $logRoot, $secretRoot, $tunnelSecretRoot, $settingsSecretRoot, $workerRoot, $workerRuntime, (Join-Path $workerRuntime 'scripts'), (Join-Path $workerRuntime 'src\services'), (Join-Path $logRoot 'settings-worker') -Force | Out-Null
  Set-RestrictedDirectoryAcl $programDataRoot @()
  Set-RestrictedDirectoryAcl $serviceRoot @()
  Set-RestrictedDirectoryAcl $logRoot @()
  Set-RestrictedDirectoryAcl $secretRoot @()
  Set-RestrictedDirectoryAcl $tunnelSecretRoot @()
  Set-RestrictedDirectoryAcl $settingsSecretRoot @()
  Set-RestrictedDirectoryAcl $workerRoot @()
  Set-RestrictedDirectoryAcl $workerRuntime @()
  Set-RestrictedDirectoryAcl (Join-Path $logRoot 'settings-worker') @()
  $workerAccount = 'NT SERVICE\LaptopStoreSettingsApplyWorker'
  $keyProvision = Start-Process -FilePath $node.Source -ArgumentList @('scripts/provision-settings-worker-keys.js') -WorkingDirectory $backendRoot -Wait -PassThru -NoNewWindow
  if ($keyProvision.ExitCode -ne 0) { throw 'Could not provision signed worker heartbeat keys.' }
  $privateKeyPath = Join-Path $workerRoot 'heartbeat-private.pem'
  Invoke-Icacls @($privateKeyPath, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F')
  $publicKeyPath = Join-Path $workerRoot 'settings-worker-heartbeat-public.pem'
  Invoke-Icacls @($publicKeyPath, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F', "$operatorAccount`:R")
  [IO.File]::WriteAllBytes($tokenPath, $protectedToken)
  Invoke-Icacls @($tokenPath, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F', 'NT SERVICE\LaptopStoreTunnel:R')

  foreach ($service in $services) {
    $directory = Join-Path $serviceRoot $service.Id
    New-Item -ItemType Directory -Path $directory, $service.LogPath -Force | Out-Null
    $exePath = Join-Path $directory ($service.Id + '.exe')
    $xmlPath = Join-Path $directory ($service.Id + '.xml')
    Copy-Item -LiteralPath $winswSource -Destination $exePath

    $tunnelEnvironment = ''
    if ($service.SettingsWorker) {
      Copy-Item -LiteralPath (Join-Path $backendRoot 'scripts\settings-apply-worker.js') -Destination (Join-Path $workerRuntime 'scripts\settings-apply-worker.js')
      Copy-Item -LiteralPath (Join-Path $backendRoot 'src\services\adminSettingsDraftStore.js') -Destination (Join-Path $workerRuntime 'src\services\adminSettingsDraftStore.js')
      Copy-Item -LiteralPath (Join-Path $backendRoot 'src\services\adminSettingsRegistry.js') -Destination (Join-Path $workerRuntime 'src\services\adminSettingsRegistry.js')
    }
    if ($service.Tunnel) {
      Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tunnel.js') -Destination (Join-Path $directory 'tunnel.js')
      Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'read-dpapi-secret.ps1') -Destination (Join-Path $directory 'read-dpapi-secret.ps1')
      $cloudflaredServicePath = Join-Path $directory 'cloudflared.exe'
      Copy-Item -LiteralPath $cloudflared.Source -Destination $cloudflaredServicePath
      $tunnelEnvironment = @"
  <env name="CLOUDFLARED_BIN" value="$([Security.SecurityElement]::Escape($cloudflaredServicePath))" />
  <env name="LAPTOP_STORE_BACKEND_ROOT" value="$([Security.SecurityElement]::Escape($backendRoot))" />
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
  <startmode>Manual</startmode>
  <logpath>$([Security.SecurityElement]::Escape($service.LogPath))</logpath>
  <log mode="roll" />
$tunnelEnvironment</service>
"@
    [IO.File]::WriteAllText($xmlPath, $xml, [Text.UTF8Encoding]::new($false))
    Invoke-Icacls @($directory, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')
    Invoke-Icacls @($service.LogPath, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')

    $createdServices += [PSCustomObject]@{ Id = $service.Id; Exe = $exePath; Xml = $xmlPath }
    & $exePath install $xmlPath
    if ($LASTEXITCODE -ne 0) { throw "WinSW install failed for $($service.Id)." }
    if ($service.Id -eq 'LaptopStoreBackend') { $serviceDaclBackups[$service.Id] = Get-ServiceDacl $service.Id }
    & sc.exe config $service.Id 'obj=' "NT SERVICE\$($service.Id)" 'password=' '' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not assign the virtual service account to $($service.Id)." }
    & sc.exe config $service.Id 'start=' 'demand' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not keep $($service.Id) stopped until cutover." }

    $account = "NT SERVICE\$($service.Id)"
    Invoke-Icacls @($programDataRoot, '/grant', "$account`:(RX)")
    Invoke-Icacls @($serviceRoot, '/grant', "$account`:(RX)")
    Invoke-Icacls @($logRoot, '/grant', "$account`:(RX)")
    Invoke-Icacls @($directory, '/grant', "$account`:(OI)(CI)RX")
    Invoke-Icacls @($service.LogPath, '/grant', "$account`:(OI)(CI)M")
    Invoke-Icacls @($exePath, '/grant', "$account`:RX")
    Invoke-Icacls @($xmlPath, '/grant', "$account`:R")
    Invoke-Icacls @($service.ReadPath, '/grant', "$account`:(OI)(CI)RX", '/T', '/C')
    if ($LASTEXITCODE -ne 0) { throw "Could not grant read access to $($service.ReadPath)." }
    foreach ($writePath in $service.WritePaths) {
      New-Item -ItemType Directory -Path $writePath -Force | Out-Null
      Invoke-Icacls @($writePath, '/grant', "$account`:(OI)(CI)M", '/T', '/C')
    }
    if ($service.Tunnel) {
      Invoke-Icacls @($secretRoot, '/grant', "$account`:(RX)")
      Invoke-Icacls @($tunnelSecretRoot, '/grant', "$account`:(OI)(CI)RX")
      Invoke-Icacls @($tokenPath, '/grant', "$account`:R")
    }
    if ($service.Id -eq 'LaptopStoreBackend') {
      Invoke-Icacls @($secretRoot, '/grant', "$account`:(RX)")
      Invoke-Icacls @($workerRoot, '/grant', "$account`:(X)")
      Invoke-Icacls @($settingsSecretRoot, '/grant', "$account`:(OI)(CI)M")
      foreach ($envFile in $envFiles) {
        Invoke-Icacls @($envFile.FullName, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F', "$operatorAccount`:R", "$account`:R")
      }
    }
    if ($service.SettingsWorker) {
      Invoke-Icacls @($secretRoot, '/grant', "$account`:(RX)")
      Invoke-Icacls @($settingsSecretRoot, '/grant', "$account`:(OI)(CI)M")
      Invoke-Icacls @($workerRoot, '/grant', "$account`:(OI)(CI)RX", '/T', '/C')
      Invoke-Icacls @($privateKeyPath, '/grant', "$account`:R")
      Invoke-Icacls @((Join-Path $logRoot 'settings-worker'), '/grant', "$account`:(OI)(CI)M")
      Invoke-Icacls @($publicKeyPath, '/grant', 'NT SERVICE\LaptopStoreBackend:R')
      Invoke-Icacls @($publicKeyPath, '/grant', "$account`:R")
      Add-WorkerBackendServiceRights 'LaptopStoreBackend' $account
    }
  }

} catch {
  $rollbackFailures = @()
  foreach ($serviceId in $serviceDaclBackups.Keys) {
    try {
      & sc.exe sdset $serviceId $serviceDaclBackups[$serviceId] | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Could not restore service DACL for $serviceId." }
    } catch {
      $rollbackFailures += "$serviceId-service-acl"
      Write-Warning "Could not restore service DACL for $serviceId; manual recovery is required."
    }
  }
  for ($index = $createdServices.Count - 1; $index -ge 0; $index -= 1) {
    $service = $createdServices[$index]
    try {
      & $service.Exe uninstall $service.Xml | Out-Null
      if ($LASTEXITCODE -ne 0 -or (Get-Service -Name $service.Id -ErrorAction SilentlyContinue)) {
        throw "WinSW service $($service.Id) remains installed."
      }
    } catch {
      $rollbackFailures += $service.Id
      Write-Warning "Could not remove $($service.Id); preserving its files and ACLs for manual recovery."
    }
  }
  if ($rollbackFailures.Count -eq 0) {
    foreach ($envFile in $envFiles) {
      if ($envAclBackups.ContainsKey($envFile.FullName)) {
        try { Set-Acl -LiteralPath $envFile.FullName -AclObject $envAclBackups[$envFile.FullName] } catch {}
      }
    }
    if (Test-Path $backendAclBackup) { try { & icacls.exe $backendRoot /restore $backendAclBackup /C | Out-Null } catch {} }
    if (Test-Path $frontendAclBackup) { try { & icacls.exe $frontendRoot /restore $frontendAclBackup /C | Out-Null } catch {} }
    if ($createdProgramData -and (Test-Path $programDataRoot)) {
      Remove-Item -LiteralPath $programDataRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  } else {
    Write-Warning ('Manual recovery required for: {0}. Service files and current ACLs were preserved.' -f ($rollbackFailures -join ', '))
  }
  throw
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  if ($tokenBytes) { [Array]::Clear($tokenBytes, 0, $tokenBytes.Length) }
  if ($protectedToken) { [Array]::Clear($protectedToken, 0, $protectedToken.Length) }
  $plainToken = $null
}

'Four WinSW services are installed with Manual startup and remain stopped; current listeners on ports 3000/5000 were not stopped.'
'ACL backups are retained at: {0}' -f $aclBackupDirectory
'After reviewing service status and ACLs, schedule a separate maintenance-window cutover to stop old consoles and start the services.'
'No .env content or Tunnel token was printed.'
