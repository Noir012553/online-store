$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$backendRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $backendRoot '.env'
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  Write-Error 'Backend .env file was not found.'
  exit 1
}

$dotenvLoader = @'
const path = require('node:path');
const backendRoot = process.argv[1];
const dotenv = require(require.resolve('dotenv', { paths: [backendRoot] }));
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });
const selected = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
  /^CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN|AI_MODEL)(?:_\d+)?$/.test(key)
  || key === 'CLOUDFLARE_AI_MAX_TOKENS'
)));
process.stdout.write(JSON.stringify(selected));
'@
$dotenvJson = & node -e $dotenvLoader $backendRoot 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Error 'Could not load backend .env through the installed dotenv package.'
  exit 1
}
try {
  $loadedEnvValues = $dotenvJson | ConvertFrom-Json -ErrorAction Stop
} catch {
  Write-Error 'Could not parse backend environment configuration.'
  exit 1
}
$envFileValues = @{}
foreach ($property in $loadedEnvValues.PSObject.Properties) {
  $envFileValues[$property.Name] = [string]$property.Value
}

function Get-EffectiveValue([string]$name) {
  if ($envFileValues.ContainsKey($name)) { return [string]$envFileValues[$name] }
  return $null
}

$numberedIndexes = @(
  foreach ($name in $envFileValues.Keys) {
    if ($name -match '^CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN|AI_MODEL)_(\d+)$') { [int]$Matches[1] }
  }
  foreach ($item in Get-ChildItem Env:) {
    if ($item.Name -match '^CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN|AI_MODEL)_(\d+)$') { [int]$Matches[1] }
  }
) | Sort-Object -Unique

$configIndex = 1
if ($numberedIndexes.Count -gt 0) {
  $maxIndex = ($numberedIndexes | Measure-Object -Maximum).Maximum
  for ($index = 1; $index -le $maxIndex; $index++) {
    $accountId = Get-EffectiveValue "CLOUDFLARE_ACCOUNT_ID_$index"
    $apiToken = Get-EffectiveValue "CLOUDFLARE_API_TOKEN_$index"
    $model = Get-EffectiveValue "CLOUDFLARE_AI_MODEL_$index"
    if ([string]::IsNullOrWhiteSpace($accountId) -or [string]::IsNullOrWhiteSpace($apiToken)) {
      Write-Error "Cloudflare configuration group $index is incomplete. Check account ID and API token variable names; values are not displayed."
      exit 1
    }
  }
  $configIndex = 1
  $accountId = Get-EffectiveValue 'CLOUDFLARE_ACCOUNT_ID_1'
  $apiToken = Get-EffectiveValue 'CLOUDFLARE_API_TOKEN_1'
  $model = Get-EffectiveValue 'CLOUDFLARE_AI_MODEL_1'
} else {
  $accountId = Get-EffectiveValue 'CLOUDFLARE_ACCOUNT_ID'
  $apiToken = Get-EffectiveValue 'CLOUDFLARE_API_TOKEN'
  $model = Get-EffectiveValue 'CLOUDFLARE_AI_MODEL'
}

if ([string]::IsNullOrWhiteSpace($accountId) -or [string]::IsNullOrWhiteSpace($apiToken)) {
  Write-Error 'Cloudflare account ID or API token is missing. Check the expected variable names; values are not displayed.'
  exit 1
}
if ([string]::IsNullOrWhiteSpace($model)) { $model = '@cf/meta/llama-3-8b-instruct' }

$maxTokensValue = Get-EffectiveValue 'CLOUDFLARE_AI_MAX_TOKENS'
$maxTokens = 2048
if (-not [string]::IsNullOrWhiteSpace($maxTokensValue)) {
  $parsedMaxTokens = 0
  if (-not [int]::TryParse($maxTokensValue, [ref]$parsedMaxTokens) -or $parsedMaxTokens -lt 1) {
    Write-Error 'CLOUDFLARE_AI_MAX_TOKENS must be a positive integer.'
    exit 1
  }
  $maxTokens = $parsedMaxTokens
}

$systemPrompt = @'
You are a translator for e-commerce products.

KEY RULES:
1. Preserve every technical specification, number, unit, SKU, and model identifier exactly as written; do not normalize, correct, infer, or replace them
2. Do not add technical details, features, or product claims that are absent from the source
3. Do NOT translate HTML tags, only text content
4. Keep brand names unchanged
5. Return ONLY translated text, NO explanations
6. Preserve formatting and line breaks
7. Do NOT leave Vietnamese words or sentences in the translation, except brand names, model names, and technical identifiers
8. The source text may be a single word or proper noun; never claim that the input text is missing

IMPORTANT:
- Chính hãng → Official/Genuine
- Stock numbers, CPU/RAM/storage specs → Keep unchanged
- Professional, formal tone for products
'@
$userPrompt = "Translate this text from Vietnamese to English. Return only the translation.`n`n100"
$body = @{
  messages = @(
    @{ role = 'system'; content = $systemPrompt },
    @{ role = 'user'; content = $userPrompt }
  )
  max_tokens = $maxTokens
} | ConvertTo-Json -Depth 5 -Compress

$uri = "https://api.cloudflare.com/client/v4/accounts/$accountId/ai/run/$model"
$headers = @{ Authorization = "Bearer $apiToken"; 'Content-Type' = 'application/json' }
$statusCode = $null
$responseContent = $null

try {
  $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -Body $body -UseBasicParsing -ErrorAction Stop
  $statusCode = [int]$response.StatusCode
  $responseContent = [string]$response.Content
} catch {
  $webResponse = $_.Exception.Response
  if ($null -ne $webResponse) {
    try {
      $statusCode = [int]$webResponse.StatusCode
      $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
      $responseContent = $reader.ReadToEnd()
      $reader.Dispose()
    } catch {
      $responseContent = $null
    }
  } else {
    [pscustomobject]@{
      ok = $false
      configIndex = $configIndex
      model = $model
      failure = 'Network or TLS request failed; diagnostic details were hidden.'
      errorType = $_.Exception.GetType().Name
    } | ConvertTo-Json -Compress
    exit 2
  }
}

$parsed = $null
$jsonValid = $false
if (-not [string]::IsNullOrWhiteSpace($responseContent)) {
  try {
    $parsed = $responseContent | ConvertFrom-Json -ErrorAction Stop
    $jsonValid = $true
  } catch {
    $jsonValid = $false
  }
}

$topLevelKeys = @()
$resultKeys = @()
$responseType = 'missing'
$responseLength = 0
$providerSuccess = $null
if ($jsonValid -and $null -ne $parsed) {
  $topLevelKeys = @($parsed.PSObject.Properties.Name)
  $providerSuccess = $parsed.success
  $resultObject = $parsed.result
  if ($null -ne $resultObject) {
    $resultKeys = @($resultObject.PSObject.Properties.Name)
    $responseValue = $resultObject.response
    if ($null -ne $responseValue) {
      $responseType = $responseValue.GetType().Name
      if ($responseValue -is [string]) { $responseLength = $responseValue.Length }
    }
  }
}

$ok = ($statusCode -eq 200) -and $jsonValid -and ($providerSuccess -ne $false) -and ($responseType -eq 'String') -and ($responseLength -gt 0)
[pscustomobject]@{
  ok = $ok
  configIndex = $configIndex
  model = $model
  httpStatus = $statusCode
  jsonValid = $jsonValid
  providerSuccess = $providerSuccess
  topLevelKeys = $topLevelKeys
  resultKeys = $resultKeys
  responseType = $responseType
  responseLength = $responseLength
  responseTextPrinted = $false
} | ConvertTo-Json -Depth 4 -Compress

if (-not $ok) { exit 2 }
