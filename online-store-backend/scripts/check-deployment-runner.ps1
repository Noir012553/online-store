$ErrorActionPreference = 'SilentlyContinue'

Write-Output '=== Deployment runner diagnostic (read-only) ==='
Write-Output "PowerShell: $($PSVersionTable.PSVersion)"
Write-Output "Computer: $env:COMPUTERNAME"

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node) {
    Write-Output "Node: $(& $node.Source --version 2>$null) ($($node.Source))"
} else {
    Write-Output 'Node: not found on PATH'
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if ($npm) {
    Write-Output "npm: $(& $npm.Source --version 2>$null)"
} else {
    Write-Output 'npm: not found on PATH (not required by the runner at runtime)'
}

$runnerScript = Join-Path $PSScriptRoot 'deployment-runner.js'
Write-Output "Runner script in this checkout: $(Test-Path -LiteralPath $runnerScript)"

$runnerIdSet = -not [string]::IsNullOrWhiteSpace($env:DEPLOYMENT_RUNNER_ID)
$routerUrlSet = -not [string]::IsNullOrWhiteSpace($env:DEPLOYMENT_ROUTER_URL)
$tokenPath = $env:DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE
$tokenPathSet = -not [string]::IsNullOrWhiteSpace($tokenPath)
$tokenFileExists = $tokenPathSet -and (Test-Path -LiteralPath $tokenPath -PathType Leaf)
Write-Output "Runner ID present in this shell: $runnerIdSet"
Write-Output "Router URL present in this shell: $routerUrlSet"
Write-Output "DPAPI token path present in this shell: $tokenPathSet"
Write-Output "DPAPI token file exists: $tokenFileExists"

$services = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '(?i)deployment|runner|LaptopStore(Frontend|Backend|Tunnel)' -or $_.DisplayName -match '(?i)deployment|runner|LaptopStore' } |
    Select-Object Name, State, StartMode
if ($services) {
    Write-Output 'Relevant Windows services:'
    $services | Format-Table -AutoSize | Out-String | Write-Output
} else {
    Write-Output 'Relevant Windows services: none found'
}

$runnerProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '(?i)deployment-runner\.js' } |
    Select-Object ProcessId, Name
if ($runnerProcesses) {
    Write-Output 'Runner processes (command line omitted):'
    $runnerProcesses | Format-Table -AutoSize | Out-String | Write-Output
} else {
    Write-Output 'Runner processes: none found'
}

Write-Output 'No files, services, environment variables, or packages were changed.'
