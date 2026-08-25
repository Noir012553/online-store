[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$BackendPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

function Write-CheckResult {
  param(
    [string]$Label,
    [bool]$Passed,
    [string]$Details
  )

  $status = if ($Passed) { 'OK' } else { 'FAIL' }
  Write-Host "[$status] $Label - $Details" -ForegroundColor $(if ($Passed) { 'Green' } else { 'Red' })
}

function Get-MongoTarget {
  param([string]$ConnectionString)

  $match = [regex]::Match(
    $ConnectionString,
    '^mongodb(?:\+srv)?://(?:[^@/]+@)?(?<host>[^/:?,]+)(?::(?<port>\d+))?'
  )

  if (-not $match.Success) {
    throw 'Không đọc được host từ MONGO_URI.'
  }

  $isSrv = $ConnectionString -match '^mongodb\+srv://'
  $port = if ($match.Groups['port'].Success) { [int]$match.Groups['port'].Value } else { 27017 }

  [pscustomobject]@{
    Host = $match.Groups['host'].Value
    Port = $port
    IsSrv = $isSrv
  }
}

try {
  if (-not (Test-Path -LiteralPath $BackendPath -PathType Container)) {
    throw "Không tìm thấy thư mục backend: $BackendPath"
  }

  Set-Location -LiteralPath $BackendPath

  if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
    Write-CheckResult '.env' $false 'Không tìm thấy file .env trong thư mục backend.'
    exit 1
  }

  $mongoUri = (& node -e "require('dotenv').config(); process.stdout.write(process.env.MONGO_URI || '')").Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($mongoUri)) {
    Write-CheckResult 'MONGO_URI' $false 'Không đọc được MONGO_URI từ .env.'
    exit 1
  }

  $target = Get-MongoTarget $mongoUri
  $safeUri = $mongoUri -replace '(^mongodb(?:\+srv)?://)([^@]+)@', '$1***:***@'

  Write-Host "Mongo URI: $safeUri"
  Write-Host "Backend:   $((Get-Location).Path)"
  Write-Host ''

  $dnsPassed = $false
  $parsedIp = $null
  if ([System.Net.IPAddress]::TryParse($target.Host, [ref]$parsedIp)) {
    $dnsPassed = $true
    Write-CheckResult 'DNS' $true "$($target.Host) là địa chỉ IP trực tiếp"
  } else {
    try {
      $dnsRecords = Resolve-DnsName -Name $target.Host -ErrorAction Stop
      $addresses = @($dnsRecords | Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress -Unique)
      $dnsPassed = $addresses.Count -gt 0
      Write-CheckResult 'DNS' $dnsPassed "$($target.Host) -> $($addresses -join ', ')"
    } catch {
      Write-CheckResult 'DNS' $false "$($target.Host) không phân giải được: $($_.Exception.Message)"
    }
  }

  $srvPassed = $true
  $tcpTargets = @()
  if ($target.IsSrv) {
    try {
      $srvRecords = @(Resolve-DnsName -Name "_mongodb._tcp.$($target.Host)" -Type SRV -ErrorAction Stop)
      $tcpTargets = @($srvRecords | Where-Object { $_.NameTarget } | ForEach-Object {
        [pscustomobject]@{
          Host = $_.NameTarget.TrimEnd('.')
          Port = [int]$_.Port
        }
      })
      $srvPassed = $tcpTargets.Count -gt 0
      Write-CheckResult 'SRV DNS' $srvPassed "$($tcpTargets.Count) MongoDB node(s) được phát hiện"
    } catch {
      $srvPassed = $false
      Write-CheckResult 'SRV DNS' $false "Không đọc được bản ghi SRV: $($_.Exception.Message)"
    }
  } else {
    $tcpTargets = @([pscustomobject]@{ Host = $target.Host; Port = $target.Port })
  }

  $tcpPassed = $false
  foreach ($tcpTarget in $tcpTargets) {
    try {
      $tcp = Test-NetConnection -ComputerName $tcpTarget.Host -Port $tcpTarget.Port -InformationLevel Quiet -WarningAction SilentlyContinue
      if ($tcp) {
        $tcpPassed = $true
        Write-CheckResult 'TCP' $true "$($tcpTarget.Host):$($tcpTarget.Port) có thể truy cập"
      } else {
        Write-CheckResult 'TCP' $false "$($tcpTarget.Host):$($tcpTarget.Port) không truy cập được"
      }
    } catch {
      Write-CheckResult 'TCP' $false "$($tcpTarget.Host):$($tcpTarget.Port) - $($_.Exception.Message)"
    }
  }

  $nodeProbe = @'
const mongoose = require('mongoose');
const { mongooseOptions } = require('./src/config/mongoConfig');

(async () => {
  const uri = process.env.MONGO_URI;
  try {
    await mongoose.connect(uri, {
      ...mongooseOptions,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 10000,
      maxPoolSize: 1,
      minPoolSize: 0,
      retryWrites: false,
    });
    await mongoose.connection.db.admin().ping();
    console.log('MongoDB ping: OK');
  } catch (error) {
    console.error(`MongoDB ping: FAIL - ${error.name}: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
})();
'@

  $env:MONGO_URI = $mongoUri
  $probeOutput = $nodeProbe | & node -
  $probePassed = $LASTEXITCODE -eq 0
  Write-CheckResult 'MongoDB' $probePassed (($probeOutput -join ' ').Trim())

  Write-Host ''
  if (($dnsPassed -or $srvPassed) -and $tcpPassed -and $probePassed) {
    Write-Host 'KẾT LUẬN: Backend có thể phân giải, mở TCP và ping MongoDB.' -ForegroundColor Green
    exit 0
  }

  Write-Host 'KẾT LUẬN: Kết nối MongoDB chưa hoạt động ổn định. Kiểm tra MONGO_URI, DNS, firewall và IP whitelist.' -ForegroundColor Yellow
  exit 1
} catch {
  Write-Host "[FAIL] Script - $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
