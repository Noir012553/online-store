[CmdletBinding()]
param(
    [int]$ProvinceId = 0,
    [int]$DistrictId = 0
)

$ErrorActionPreference = "Stop"
$projectRoot = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    (Get-Location).Path
}
$envPath = Join-Path $projectRoot ".env"
$defaultBaseUrl = "https://dev-online-gateway.ghn.vn/shiip/public-api"

function Get-DotEnvValue {
    param([string]$Name)

    if (-not (Test-Path $envPath)) { return $null }
    $line = Get-Content $envPath |
        Where-Object { $_ -match "^\s*$Name\s*=" } |
        Select-Object -First 1
    if (-not $line) { return $null }

    $value = ($line -replace "^\s*$Name\s*=", '').Trim()
    return $value.Trim('"').Trim("'")
}

function Invoke-GhnRequest {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [object]$Body = $null
    )

    try {
        $params = @{
            Method = $Method
            Uri = $Uri
            Headers = $Headers
            ContentType = "application/json"
        }
        if ($null -ne $Body) {
            $params.Body = ($Body | ConvertTo-Json -Compress)
        }

        $response = Invoke-RestMethod @params
        return [PSCustomObject]@{
            Success = $true
            StatusCode = 200
            Body = $response
            Error = $null
        }
    }
    catch {
        $statusCode = $null
        $errorBody = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errorBody = $reader.ReadToEnd() | ConvertFrom-Json
            }
            catch { }
        }
        return [PSCustomObject]@{
            Success = $false
            StatusCode = $statusCode
            Body = $errorBody
            Error = $_.Exception.Message
        }
    }
}

$token = Get-DotEnvValue "GHN_API_TOKEN"
$baseUrl = Get-DotEnvValue "GHN_API_URL"
if (-not $baseUrl) { $baseUrl = $defaultBaseUrl }
if (-not $token) { throw "GHN_API_TOKEN is missing in $envPath" }

$headers = @{
    Token = $token
    Accept = "application/json"
}
$shopId = Get-DotEnvValue "GHN_SHOP_ID"
if ($shopId) { $headers.ShopId = $shopId }

Write-Host "GHN base URL: $baseUrl"
Write-Host "Token: configured"
Write-Host "ShopId: $($(if ($shopId) { 'configured' } else { 'not configured' }))"

$provinceResponse = Invoke-GhnRequest -Method GET -Uri "$baseUrl/master-data/province" -Headers $headers
$provinceBody = $provinceResponse.Body
Write-Host "Province: HTTP $($provinceResponse.StatusCode), code=$($provinceBody.code), message=$($provinceBody.message), count=$(@($provinceBody.data).Count)"
if (-not $provinceResponse.Success -or $provinceBody.code -ne 200) {
    throw "Province request failed: $($provinceResponse.Error)"
}

function Get-DistrictList {
    param([object]$Payload)

    if ($null -eq $Payload) { return @() }
    if ($Payload -is [System.Array]) { return @($Payload) }

    $properties = @($Payload.PSObject.Properties.Name)
    foreach ($name in @('data', 'districts', 'items')) {
        $nestedProperty = $properties | Where-Object { $_ -ieq $name } | Select-Object -First 1
        if ($nestedProperty) {
            $nested = Get-DistrictList $Payload.$nestedProperty
            if ($nested.Count -gt 0) { return $nested }
        }
    }

    $idProperty = $properties | Where-Object { $_ -match '^district_?id$' } | Select-Object -First 1
    if ($idProperty -and $Payload.$idProperty) { return @($Payload) }
    return @()
}

$provinceCandidates = if ($ProvinceId -gt 0) {
    @($provinceBody.data | Where-Object { [int]$_.ProvinceID -eq $ProvinceId })
} else {
    @($provinceBody.data)
}
if ($provinceCandidates.Count -eq 0) {
    throw "ProvinceId $ProvinceId was not found in GHN province response"
}

$districtResponse = $null
$districtBody = $null
$districts = @()
foreach ($province in $provinceCandidates) {
    $candidateProvinceId = [int]$province.ProvinceID
    $candidateResponse = Invoke-GhnRequest `
        -Method POST `
        -Uri "$baseUrl/master-data/district" `
        -Headers $headers `
        -Body @{ province_id = $candidateProvinceId }
    $candidateDistricts = if ($candidateResponse.Success -and $candidateResponse.Body.code -eq 200) {
        Get-DistrictList $candidateResponse.Body.data
    } else {
        @()
    }

    if ($candidateDistricts.Count -gt 0) {
        $ProvinceId = $candidateProvinceId
        $districtResponse = $candidateResponse
        $districtBody = $candidateResponse.Body
        $districts = $candidateDistricts
        break
    }
}

if ($districts.Count -eq 0) {
    throw "GHN returned no districts for the tested provinces"
}
Write-Host "ProvinceId: $ProvinceId"
Write-Host "District: HTTP $($districtResponse.StatusCode), code=$($districtBody.code), message=$($districtBody.message), count=$($districts.Count)"

if ($DistrictId -eq 0) {
    $districtIdProperty = @($districts[0].PSObject.Properties.Name) |
        Where-Object { $_ -match '^district_?id$' } |
        Select-Object -First 1
    $DistrictId = [int]$districts[0].$districtIdProperty
}
Write-Host "DistrictId: $DistrictId"

function Get-WardList {
    param([object]$Payload)

    $data = $Payload.data
    if ($data -is [System.Array]) { return @($data) }
    if ($data.wards -is [System.Array]) { return @($data.wards) }
    if ($data.data -is [System.Array]) { return @($data.data) }
    if ($data.WardCode -or $data.wardCode) { return @($data) }
    return @()
}

$wardUri = "$baseUrl/master-data/ward?district_id=$DistrictId"
$getWardResponse = Invoke-GhnRequest -Method GET -Uri $wardUri -Headers $headers
$getWardBody = $getWardResponse.Body
$getWards = Get-WardList $getWardBody
Write-Host "Ward GET: HTTP $($getWardResponse.StatusCode), code=$($getWardBody.code), message=$($getWardBody.message), count=$($getWards.Count)"
if ($getWards.Count -gt 0) {
    $getWards | Select-Object -First 3 WardCode, DistrictID, WardName | Format-Table -AutoSize
}

$postWardResponse = Invoke-GhnRequest `
    -Method POST `
    -Uri $wardUri `
    -Headers $headers `
    -Body @{ district_id = $DistrictId }
$postWardBody = $postWardResponse.Body
$postWards = Get-WardList $postWardBody
Write-Host "Ward POST: HTTP $($postWardResponse.StatusCode), code=$($postWardBody.code), message=$($postWardBody.message), count=$($postWards.Count)"
if ($postWards.Count -gt 0) {
    $postWards | Select-Object -First 3 WardCode, DistrictID, WardName | Format-Table -AutoSize
}

if ($getWards.Count -eq 0 -and $postWards.Count -eq 0) {
    Write-Error "Both Ward requests returned no data. Check the selected DistrictId, GHN token/account, and API environment."
    exit 2
}

Write-Host "GHN Ward diagnostic passed." -ForegroundColor Green
