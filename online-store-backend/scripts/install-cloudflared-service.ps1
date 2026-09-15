#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$binaryCandidates = @(
  "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
  "$env:ProgramFiles\cloudflared\cloudflared.exe",
  "$env:ProgramFiles\Cloudflare\cloudflared\cloudflared.exe"
)

$pathCommand = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
if ($pathCommand) {
  $binaryCandidates += $pathCommand.Source
}

$cloudflared = $binaryCandidates |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  Select-Object -First 1

if (-not $cloudflared) {
  throw 'Không tìm thấy cloudflared.exe.'
}

$version = (& $cloudflared version 2>&1 | Out-String).Trim()
Write-Host "Binary: $cloudflared"
Write-Host $version

$secureToken = Read-Host 'Dán installation token mới của tunnel online-store (không hiển thị)' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$token = $null
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'Token rỗng.'
}

$existingService = Get-Service -Name Cloudflared -ErrorAction SilentlyContinue
if ($existingService) {
  if ($existingService.Status -ne 'Stopped') {
    Stop-Service -Name Cloudflared -Force
  }

  & $cloudflared service uninstall *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Không thể gỡ service Cloudflared. Exit code: $LASTEXITCODE"
  }
}

& $cloudflared service install $token *> $null
$installExitCode = $LASTEXITCODE
$token = $null

if ($installExitCode -ne 0) {
  throw "Không thể cài service Cloudflared. Exit code: $installExitCode"
}

Start-Service -Name Cloudflared
Start-Sleep -Seconds 3
$service = Get-Service -Name Cloudflared

if ($service.Status -ne 'Running') {
  throw "Cloudflared chưa chạy. Trạng thái: $($service.Status)"
}

Write-Host "Cloudflared service: $($service.Status)"
Write-Host 'Cài đặt hoàn tất. Token không được in ra.'
