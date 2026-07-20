param(
    [string]$BackendUrl = "http://localhost:5000",
    [string]$Language = "vi",
    [string]$InvalidCurrency = "ZZZ",
    [int]$OutputLimit = 12000,
    [string]$ReportDirectory = "."
)

$ErrorActionPreference = "Stop"
$BackendUrl = $BackendUrl.TrimEnd('/')
$Language = $Language.Trim().ToLowerInvariant()
$InvalidCurrency = $InvalidCurrency.Trim().ToUpperInvariant()

if ($OutputLimit -lt 1) {
    throw "OutputLimit must be greater than zero"
}

function Invoke-JsonApi {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Method = "GET"
    )

    try {
        $response = Invoke-WebRequest `
            -Uri $Uri `
            -Method $Method `
            -UseBasicParsing `
            -ErrorAction Stop

        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body = $response.Content
        }
    } catch {
        $statusCode = 0
        $body = $_.Exception.Message

        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                $reader.Dispose()
            } catch {
                $body = $_.Exception.Message
            }
        }

        return [pscustomobject]@{
            StatusCode = $statusCode
            Body = $body
        }
    }
}

function Convert-ResponseJson {
    param([string]$Body)

    if ([string]::IsNullOrWhiteSpace($Body)) {
        return $null
    }

    try {
        return $Body | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-PropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }

    return $property.Value
}

$results = New-Object System.Collections.Generic.List[string]
$passCount = 0
$failCount = 0
$currencyCode = $null
$statsWithCurrency = $null
$statsFallback = $null
$translations = $null

function Add-Result {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Details
    )

    if ($Passed) {
        $script:passCount++
        $status = "PASS"
    } else {
        $script:failCount++
        $status = "FAIL"
    }

    $script:results.Add("$status`t$Name`t$Details")
}

$currenciesResponse = Invoke-JsonApi -Uri "$BackendUrl/api/currencies?isActive=true"
$currenciesPayload = Convert-ResponseJson $currenciesResponse.Body
$currencies = @((Get-PropertyValue $currenciesPayload "data"))
$selectedCurrency = $currencies | Where-Object { $_.code } | Select-Object -First 1
$currencyCode = if ($selectedCurrency) { ([string]$selectedCurrency.code).ToUpperInvariant() } else { $null }
Add-Result `
    -Name "Active currencies trả HTTP 200 và có currency" `
    -Passed ($currenciesResponse.StatusCode -eq 200 -and $null -ne $currencyCode) `
    -Details "HTTP $($currenciesResponse.StatusCode); currency=$currencyCode"

$statsWithCurrencyResponse = Invoke-JsonApi -Uri "$BackendUrl/api/products/stats/overview?lang=$Language&currency=$currencyCode"
$statsWithCurrency = Convert-ResponseJson $statsWithCurrencyResponse.Body
$requiredStatsFields = @("totalProducts", "inStockProducts", "totalOrders", "totalRevenue", "totalCustomers")
$statsWithCurrencyComplete = $true
foreach ($field in $requiredStatsFields) {
    if ($null -eq (Get-PropertyValue $statsWithCurrency $field)) {
        $statsWithCurrencyComplete = $false
    }
}
Add-Result `
    -Name "Stats với currency động trả HTTP 200" `
    -Passed ($statsWithCurrencyResponse.StatusCode -eq 200) `
    -Details "HTTP $($statsWithCurrencyResponse.StatusCode)"
Add-Result `
    -Name "Stats với currency có đủ 5 trường" `
    -Passed ($statsWithCurrencyResponse.StatusCode -eq 200 -and $statsWithCurrencyComplete) `
    -Details "Fields hợp lệ=$statsWithCurrencyComplete"

$statsFallbackResponse = Invoke-JsonApi -Uri "$BackendUrl/api/products/stats/overview?lang=$Language"
$statsFallback = Convert-ResponseJson $statsFallbackResponse.Body
$statsFallbackComplete = $true
foreach ($field in $requiredStatsFields) {
    if ($null -eq (Get-PropertyValue $statsFallback $field)) {
        $statsFallbackComplete = $false
    }
}
Add-Result `
    -Name "Stats không truyền currency trả HTTP 200" `
    -Passed ($statsFallbackResponse.StatusCode -eq 200) `
    -Details "HTTP $($statsFallbackResponse.StatusCode)"
Add-Result `
    -Name "Stats fallback có đủ 5 trường" `
    -Passed ($statsFallbackResponse.StatusCode -eq 200 -and $statsFallbackComplete) `
    -Details "Fields hợp lệ=$statsFallbackComplete"

$invalidCurrencyResponse = Invoke-JsonApi -Uri "$BackendUrl/api/products/stats/overview?lang=$Language&currency=$InvalidCurrency"
Add-Result `
    -Name "Currency không hợp lệ trả HTTP 400" `
    -Passed ($invalidCurrencyResponse.StatusCode -eq 400) `
    -Details "HTTP $($invalidCurrencyResponse.StatusCode); currency=$InvalidCurrency"

$translationsResponse = Invoke-JsonApi -Uri "$BackendUrl/api/translations?lang=$Language&ns=common"
$translationsPayload = Convert-ResponseJson $translationsResponse.Body
$translations = Get-PropertyValue (Get-PropertyValue $translationsPayload "data") "translations"
$translationKeys = @(
    "upload_signature_error",
    "upload_file_too_large",
    "upload_file_must_be_image",
    "upload_failed",
    "image_validation_failed",
    "image_validation_request_failed"
)
$missingTranslationKeys = @($translationKeys | Where-Object {
    $value = Get-PropertyValue $translations $_
    [string]::IsNullOrWhiteSpace([string]$value)
})
Add-Result `
    -Name "Common translations trả HTTP 200" `
    -Passed ($translationsResponse.StatusCode -eq 200) `
    -Details "HTTP $($translationsResponse.StatusCode)"
Add-Result `
    -Name "Có đủ 6 khóa toast tiếng Việt" `
    -Passed ($translationsResponse.StatusCode -eq 200 -and $missingTranslationKeys.Count -eq 0) `
    -Details $(if ($missingTranslationKeys.Count -eq 0) { "Đủ khóa" } else { "Thiếu: $($missingTranslationKeys -join ', ')" })

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("Dynamic product stats and i18n test")
$lines.Add("Backend: $BackendUrl")
$lines.Add("Language: $Language")
$lines.Add("Currency: $currencyCode")
$lines.Add("Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$lines.Add("")
$lines.Add("Status`tTest`tDetails")
$lines.AddRange($results)
$lines.Add("")
$lines.Add("Summary: $passCount PASS, $failCount FAIL")
$output = $lines -join [Environment]::NewLine

if ($output.Length -gt $OutputLimit) {
    $reportName = "dynamic-test-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"
    $reportPath = Join-Path -Path $ReportDirectory -ChildPath $reportName
    $markdown = @(
        "# Dynamic product stats and i18n test",
        "",
        "- Backend: `$BackendUrl`",
        "- Language: `$Language`",
        "- Currency: `$currencyCode`",
        "- Started: `$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')`",
        "",
        "| Status | Test | Details |",
        "| --- | --- | --- |"
    )
    $markdown += @($results | ForEach-Object {
        $columns = $_ -split "`t", 3
        "| $($columns[0]) | $($columns[1]) | $($columns[2]) |"
    })
    $markdown += "", "**Summary:** $passCount PASS, $failCount FAIL"
    Set-Content -Path $reportPath -Value ($markdown -join [Environment]::NewLine) -Encoding UTF8
    Write-Output "Kết quả dài hơn $OutputLimit ký tự; đã ghi báo cáo vào: $reportPath"
} else {
    Write-Output $output
}

if ($failCount -gt 0) {
    exit 1
}

exit 0
