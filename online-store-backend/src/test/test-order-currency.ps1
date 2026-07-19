[CmdletBinding()]
param(
    [string]$BackendUrl = "http://localhost:5000",
    [string]$Email = "anyemail@email.com",
    [string]$Password = "123456",
    [string]$CurrencyCode = "VND",
    [int]$Quantity = 1,
    [switch]$UseFirstProduct
)

$ErrorActionPreference = "Stop"
$BackendUrl = $BackendUrl.TrimEnd('/')
$CurrencyCode = $CurrencyCode.Trim().ToUpperInvariant()

function Invoke-JsonApi {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Method,
        [hashtable]$Headers = @{},
        [object]$Body
    )

    $requestParameters = @{
        Uri = $Uri
        Method = $Method
        Headers = $Headers
        UseBasicParsing = $true
        ErrorAction = "Stop"
    }

    if ($null -ne $Body) {
        $requestParameters.ContentType = "application/json"
        $requestParameters.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }

    try {
        $response = Invoke-WebRequest @requestParameters
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body = $response.Content
        }
    } catch {
        $statusCode = 0
        $responseBody = $_.Exception.Message
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $responseBody = $reader.ReadToEnd()
                $reader.Dispose()
                $stream.Dispose()
            } catch {
                $responseBody = $_.Exception.Message
            }
        }

        return [pscustomobject]@{
            StatusCode = $statusCode
            Body = $responseBody
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

function Write-ApiFailure {
    param(
        [string]$Step,
        [pscustomobject]$Response
    )

    Write-Host "[$Step] HTTP $($Response.StatusCode)" -ForegroundColor Red
    Write-Host $Response.Body -ForegroundColor Red
    throw "$Step failed"
}

if ($Quantity -lt 1) {
    throw "Quantity must be at least 1"
}

if ($CurrencyCode -notmatch '^[A-Z]{3}$') {
    throw "CurrencyCode must be a 3-letter code, for example VND or USD"
}

Write-Host "Backend: $BackendUrl" -ForegroundColor Cyan
Write-Host "User: $Email" -ForegroundColor Cyan
Write-Host "Currency: $CurrencyCode" -ForegroundColor Cyan

Write-Host "`n1. Dang nhap..." -ForegroundColor Yellow
$loginResponse = Invoke-JsonApi `
    -Uri "$BackendUrl/api/users/login" `
    -Method "POST" `
    -Body @{ email = $Email; password = $Password }

$login = Convert-ResponseJson $loginResponse.Body
if ($loginResponse.StatusCode -lt 200 -or $loginResponse.StatusCode -ge 300 -or [string]::IsNullOrWhiteSpace($login.token)) {
    Write-ApiFailure -Step "Login" -Response $loginResponse
}

$headers = @{ Authorization = "Bearer $($login.token)" }
Write-Host "Login thanh cong: $($login.email)" -ForegroundColor Green

Write-Host "`n2. Lay san pham con ton kho..." -ForegroundColor Yellow
$productsResponse = Invoke-JsonApi `
    -Uri "$BackendUrl/api/products?pageNumber=1&pageSize=500&inStock=true&lang=vi" `
    -Method "GET"

$productsPayload = Convert-ResponseJson $productsResponse.Body
if ($productsResponse.StatusCode -lt 200 -or $productsResponse.StatusCode -ge 300) {
    Write-ApiFailure -Step "Get products" -Response $productsResponse
}

$allProducts = @($productsPayload.products)
$invalidCurrencyProducts = @($allProducts | Where-Object {
    $_._id -and
    (-not ($_.baseCurrencyCode -is [string]) -or $_.baseCurrencyCode -notmatch '^[A-Z]{3}$')
})

if ($invalidCurrencyProducts.Count -gt 0) {
    Write-Host "FAIL: Phat hien $($invalidCurrencyProducts.Count) san pham co baseCurrencyCode khong hop le:" -ForegroundColor Red
    $invalidCurrencyProducts | ForEach-Object {
        Write-Host "- $($_._id) | $($_.name) | baseCurrencyCode = '$($_.baseCurrencyCode)'" -ForegroundColor Red
    }
    exit 4
}

$products = @($allProducts | Where-Object {
    $_._id -and
    $_.countInStock -ge $Quantity -and
    $_.baseCurrencyCode -is [string] -and
    $_.baseCurrencyCode -match '^[A-Z]{3}$'
})

if ($products.Count -eq 0) {
    throw "Khong tim thay san pham con du ton kho va co baseCurrencyCode hop le"
}

$product = if ($UseFirstProduct) {
    $products[0]
} else {
    $products | Sort-Object countInStock -Descending | Select-Object -First 1
}

Write-Host "San pham: $($product.name)" -ForegroundColor Green
Write-Host "Product ID: $($product._id)" -ForegroundColor Green
Write-Host "Base currency: $($product.baseCurrencyCode)" -ForegroundColor Green
Write-Host "Ton kho hien tai: $($product.countInStock)" -ForegroundColor Green

$orderBody = @{
    cartItems = @(
        @{
            productId = [string]$product._id
            quantity = $Quantity
        }
    )
    currencyCode = $CurrencyCode
    shippingAddress = @{
        address = "123 Duong Test"
        city = "Ho Chi Minh"
        postalCode = "700000"
        country = "Vietnam"
    }
    customerName = if ($login.name) { [string]$login.name } else { "Demo User" }
    customerEmail = $Email
    customerPhone = "0901234567"
    paymentMethod = "COD"
    idempotencyKey = "ps-order-currency-$(New-Guid)"
}

Write-Host "`n3. Tao don hang..." -ForegroundColor Yellow
$orderResponse = Invoke-JsonApi `
    -Uri "$BackendUrl/api/orders?lang=vi" `
    -Method "POST" `
    -Headers $headers `
    -Body $orderBody

$orderPayload = Convert-ResponseJson $orderResponse.Body
Write-Host "Create order: HTTP $($orderResponse.StatusCode)" -ForegroundColor Cyan

if ($orderResponse.StatusCode -eq 422) {
    Write-Host "FAIL: Van gap HTTP 422. Chi tiet response:" -ForegroundColor Red
    Write-Host $orderResponse.Body -ForegroundColor Red
    exit 2
}

if ($orderResponse.StatusCode -lt 200 -or $orderResponse.StatusCode -ge 300) {
    Write-Host "Request khong con 422 nhung that bai o loi nghiep vu khac:" -ForegroundColor Yellow
    Write-Host $orderResponse.Body -ForegroundColor Yellow
    exit 3
}

$orderId = if ($orderPayload.data._id) { $orderPayload.data._id } elseif ($orderPayload._id) { $orderPayload._id } else { "unknown" }
Write-Host "PASS: Tao don thanh cong, orderId = $orderId" -ForegroundColor Green
Write-Host "Khong con loi baseCurrencyCode HTTP 422." -ForegroundColor Green
