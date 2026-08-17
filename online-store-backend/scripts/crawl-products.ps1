param(
    [string]$SearchTerm = "",
    [string[]]$SearchTerms = @(),
    [string]$OutputFile = "",
    [string]$Category = "",
    [string]$Seller = "",
    [int]$MaxPages = 20,
    [int]$PageSize = 40,
    [int]$DelayMilliseconds = 250,
    [int]$MaxRetries = 3,
    [switch]$SkipDetails
)

$ErrorActionPreference = "Stop"

if ($MaxPages -lt 1) { throw "MaxPages must be greater than 0" }
if ($PageSize -lt 1) { throw "PageSize must be greater than 0" }
if ($MaxRetries -lt 1) { throw "MaxRetries must be greater than 0" }
if ($DelayMilliseconds -lt 0) { throw "DelayMilliseconds cannot be negative" }

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$dataDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "data"))
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    $OutputFile = Join-Path $dataDirectory "products-crawl.json"
}

$outputPath = [System.IO.Path]::GetFullPath($OutputFile)
$dataDirectoryPrefix = $dataDirectory.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $outputPath.StartsWith($dataDirectoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputFile must be inside the backend data directory: $dataDirectory"
}

$outputDirectory = Split-Path -Parent $outputPath
if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$headers = @{
    "User-Agent"      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    "Accept"          = "application/json, text/plain, */*"
    "Accept-Language" = "vi-VN,vi;q=0.9"
}

$allProducts = [System.Collections.Generic.List[PSObject]]::new()
$processedIds = [System.Collections.Generic.HashSet[string]]::new()

function Get-Text {
    param([object]$Value)
    if ($null -eq $Value) { return "" }
    return ([string]$Value).Trim()
}

$queries = @($SearchTerm, ($SearchTerms -split ",")) |
    ForEach-Object { Get-Text $_ } |
    Where-Object { $_ } |
    Select-Object -Unique
if ($queries.Count -eq 0) { throw "SearchTerm or SearchTerms is required" }

function Get-CategoryNames {
    param([object]$Item)

    $categoryNames = [System.Collections.Generic.List[string]]::new()
    foreach ($category in @($Item.categories)) {
        $categoryName = Get-Text $category.name
        if ($categoryName -and -not $categoryNames.Contains($categoryName)) {
            $categoryNames.Add($categoryName)
        }
    }

    foreach ($breadcrumb in @($Item.breadcrumbs)) {
        $breadcrumbName = Get-Text $breadcrumb.name
        if ($breadcrumbName -and -not $categoryNames.Contains($breadcrumbName)) {
            $categoryNames.Add($breadcrumbName)
        }
    }

    return $categoryNames.ToArray()
}

function Get-Seller {
    param([object]$Item)

    $sellerCandidates = @($Item.current_seller, $Item.seller, $Item.seller_name)
    foreach ($candidate in $sellerCandidates) {
        if ($null -eq $candidate) { continue }

        if ($candidate -is [string]) {
            $serializedName = [regex]::Match($candidate, 'name\s*=\s*([^;}]+)').Groups[1].Value.Trim()
            if (-not $serializedName) {
                $serializedName = [regex]::Match($candidate, 'store_name\s*=\s*([^;}]+)').Groups[1].Value.Trim()
            }
            if (-not $serializedName) {
                $serializedName = [regex]::Match($candidate, 'seller_name\s*=\s*([^;}]+)').Groups[1].Value.Trim()
            }
            if ($serializedName) {
                $serializedId = [regex]::Match($candidate, 'id\s*=\s*([^;}]+)').Groups[1].Value.Trim()
                return [PSCustomObject]@{
                    id   = $serializedId
                    name = $serializedName
                }
            }

            if ($candidate.Trim()) {
                return [PSCustomObject]@{
                    id   = $null
                    name = $candidate.Trim()
                }
            }
            continue
        }

        $sellerName = Get-Text $candidate.name
        if (-not $sellerName) { $sellerName = Get-Text $candidate.store_name }
        if (-not $sellerName) { $sellerName = Get-Text $candidate.seller_name }
        if (-not $sellerName) { continue }
        return [PSCustomObject]@{
            id   = $candidate.id
            name = $sellerName
        }
    }

    return $null
}

function Get-BrandName {
    param([object]$Item)

    if ($Item.brand -is [string]) {
        $brandName = Get-Text $Item.brand
        if ($brandName) { return $brandName }
    }
    if ($Item.brand.name) {
        $brandName = Get-Text $Item.brand.name
        if ($brandName) { return $brandName }
    }
    return Get-Text $Item.brand_name
}

function Get-FirstPositiveNumber {
    param([object[]]$Values)

    foreach ($value in $Values) {
        $number = 0
        if ([double]::TryParse(
                (Get-Text $value),
                [Globalization.NumberStyles]::Any,
                [Globalization.CultureInfo]::InvariantCulture,
                [ref]$number
            ) -and $number -gt 0) {
            return $number
        }
    }
    return 0
}

function Test-ProductMatch {
    param(
        [object]$Item,
        [string]$CategoryFilter,
        [string]$SellerFilter
    )

    if ($CategoryFilter) {
        $categoryNames = @(Get-CategoryNames $Item)
        if (-not ($categoryNames | Where-Object { $_ -like "*$CategoryFilter*" })) { return $false }
    }

    if ($SellerFilter) {
        $seller = Get-Seller $Item
        if ($null -eq $seller -or $seller.name -ine $SellerFilter) { return $false }
    }

    return $true
}

function Test-HasValue {
    param([object]$Value)

    if ($null -eq $Value) { return $false }
    if ($Value -is [string]) { return -not [string]::IsNullOrWhiteSpace($Value) }
    if ($Value -is [System.Collections.ICollection]) { return $Value.Count -gt 0 }
    return $true
}

function Merge-ProductData {
    param(
        [object]$Summary,
        [object]$Detail
    )

    if ($null -eq $Detail) { return $Summary }

    $merged = [ordered]@{}
    foreach ($property in $Summary.PSObject.Properties) {
        $merged[$property.Name] = $property.Value
    }
    foreach ($property in $Detail.PSObject.Properties) {
        if ($property.Name -eq 'current_seller' -and $null -eq (Get-Seller $Detail)) {
            continue
        }
        if (Test-HasValue $property.Value) {
            $merged[$property.Name] = $property.Value
        }
    }
    return [PSCustomObject]$merged
}

function Get-ProductDetail {
    param([string]$ProductId)

    $detailUrl = "https://tiki.vn/api/v2/products/$ProductId"
    for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri $detailUrl -Headers $headers -Method Get
            if ($null -ne $response.data) { return $response.data }
            return $response
        }
        catch {
            if ($attempt -eq $MaxRetries) {
                Write-Warning ("Product {0} detail failed after {1} attempts: {2}" -f $ProductId, $MaxRetries, $_.Exception.Message)
                return $null
            }
            Start-Sleep -Milliseconds ($DelayMilliseconds * $attempt)
        }
    }
    return $null
}

function Get-ProductRecord {
    param(
        [object]$Item,
        [object]$Seller
    )

    $name = Get-Text $Item.name
    $price = Get-FirstPositiveNumber @($Item.price, $Item.current_seller.price)
    $thumbnailUrl = Get-Text $Item.thumbnail_url
    if (-not $thumbnailUrl -and $Item.images -is [System.Array]) {
        $thumbnailUrl = Get-Text $Item.images[0].base_url
        if (-not $thumbnailUrl) { $thumbnailUrl = Get-Text $Item.images[0].large_url }
    }
    if (-not $name -or -not $price -or -not $thumbnailUrl) {
        return $null
    }

    $summary = Get-Text $Item.summary
    if (-not $summary) { $summary = Get-Text $Item.description }
    if (-not $summary) { $summary = $name }

    $images = if ($Item.images) { $Item.images } else {
        @(@{ base_url = $thumbnailUrl; large_url = $thumbnailUrl })
    }

    return [PSCustomObject]@{
        id                    = $Item.id
        master_id             = $Item.master_id
        sku                   = $Item.sku
        name                  = $name
        brand                 = Get-BrandName $Item
        brand_name            = Get-Text $Item.brand_name
        categories            = $Item.categories
        breadcrumbs           = $Item.breadcrumbs
        current_seller        = if ($null -eq $Seller) {
            $null
        } else {
            [PSCustomObject]@{
                id   = $Seller.id
                name = $Seller.name
            }
        }
        price                 = $Item.price
        original_price        = $Item.original_price
        list_price            = $Item.list_price
        thumbnail_url         = $thumbnailUrl
        images                = $images
        inventory_status      = $Item.inventory_status
        stock_item            = $Item.stock_item
        description           = $summary
        short_description     = $summary
        specifications        = if ($Item.specifications) { $Item.specifications } else { @() }
        configurable_options  = if ($Item.configurable_options) { $Item.configurable_options } else { @() }
        configurable_products = if ($Item.configurable_products) { $Item.configurable_products } else { @() }
        type                  = $Item.type
    }
}

foreach ($query in $queries) {
    Write-Host ("Crawling products for search term '{0}'..." -f $query) -ForegroundColor Green

    for ($page = 1; $page -le $MaxPages; $page++) {
        $encodedSearchTerm = [Uri]::EscapeDataString($query)
        $listUrl = "https://tiki.vn/api/v2/products?limit=$PageSize&q=$encodedSearchTerm&page=$page"
        $response = $null
        $pageCompleted = $false

        for ($attempt = 1; $attempt -le $MaxRetries; $attempt++) {
            try {
                $response = Invoke-RestMethod -Uri $listUrl -Headers $headers -Method Get
                $pageCompleted = $true
                break
            }
            catch {
                if ($attempt -eq $MaxRetries) {
                    throw "Query '$query' page $page failed after $MaxRetries attempts: $($_.Exception.Message)"
                }
                Start-Sleep -Milliseconds ($DelayMilliseconds * $attempt)
            }
        }

        if (-not $pageCompleted) { throw "Query '$query' page $page did not complete" }

        $items = @($response.data)
        if ($items.Count -eq 0) { break }

        $newItemsOnPage = 0
        $keptItemsOnPage = 0
        foreach ($item in $items) {
            $itemId = Get-Text $item.id
            if (-not $itemId -or $processedIds.Contains($itemId)) { continue }
            [void]$processedIds.Add($itemId)
            $newItemsOnPage++

            $sourceItem = $item
            if (-not $SkipDetails) {
                $detail = Get-ProductDetail $itemId
                if ($null -ne $detail) {
                    $sourceItem = Merge-ProductData $item $detail
                }
            }

            if (-not (Test-ProductMatch $sourceItem $Category $Seller)) { continue }

            $seller = Get-Seller $sourceItem
            $productRecord = Get-ProductRecord $sourceItem $seller
            if ($null -ne $productRecord) {
                $allProducts.Add($productRecord)
                $keptItemsOnPage++
            }
        }

        Write-Host ("'{0}' page {1}/{2}: {3} new products, {4} kept, {5} total" -f $query, $page, $MaxPages, $newItemsOnPage, $keptItemsOnPage, $allProducts.Count) -ForegroundColor Cyan
        Start-Sleep -Milliseconds $DelayMilliseconds
    }
}

$productsForJson = [object[]]$allProducts.ToArray()
if ($productsForJson.Count -eq 0) {
    throw "No products matched the requested search, category, or seller filters"
}

$jsonOutput = ConvertTo-Json -InputObject $productsForJson -Depth 20
[System.IO.File]::WriteAllText($outputPath, $jsonOutput, [System.Text.Encoding]::UTF8)

Write-Host ("Saved {0} products from {1} search terms to {2}" -f $allProducts.Count, $queries.Count, $outputPath) -ForegroundColor Green
