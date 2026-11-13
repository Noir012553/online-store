param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$protected = [System.IO.File]::ReadAllBytes($Path)
$secretBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $protected,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::LocalMachine
)
try {
  [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($secretBytes))
} finally {
  [Array]::Clear($secretBytes, 0, $secretBytes.Length)
  [Array]::Clear($protected, 0, $protected.Length)
}
