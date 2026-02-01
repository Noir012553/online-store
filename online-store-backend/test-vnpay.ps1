# VNPAY Debug Testing Script for PowerShell
# Usage: powershell -ExecutionPolicy Bypass -File test-vnpay.ps1

$baseUrl = "http://localhost:5000"

Write-Host "╔═════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          VNPAY Configuration & Testing Script              ║" -ForegroundColor Cyan
Write-Host "╚═════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ==================== TEST 1: Verify Config ====================
Write-Host "`n📋 TEST 1: Verifying VNPAY Configuration..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/payments/debug/vnpay-config" `
        -Method Get `
        -UseBasicParsing
    
    $config = $response.Content | ConvertFrom-Json
    
    if ($config.success) {
        Write-Host "✅ Config retrieved successfully!" -ForegroundColor Green
        
        Write-Host "`n📊 Current Configuration:" -ForegroundColor Cyan
        Write-Host "   Terminal ID: $($config.config.VNPAY_TMN_CODE)"
        Write-Host "   Secret Key Length: $($config.config.VNPAY_HASH_SECRET_LENGTH) characters" -ForegroundColor $(if ($config.config.VNPAY_HASH_SECRET_LENGTH -eq 34) { "Green" } else { "Red" })
        Write-Host "   Secret Key (masked): $($config.config.VNPAY_HASH_SECRET)"
        Write-Host "   Endpoint: $($config.config.VNPAY_ENDPOINT)"
        Write-Host "   Return URL: $($config.config.VNPAY_RETURN_URL)"
        Write-Host "   Callback URL: $($config.config.VNPAY_CALLBACK_URL)"
        
        # Check if secret key length is correct
        if ($config.config.VNPAY_HASH_SECRET_LENGTH -ne 34 -and $config.config.VNPAY_HASH_SECRET_LENGTH -ne 32) {
            Write-Host "`n⚠️  WARNING: Secret Key length is $($config.config.VNPAY_HASH_SECRET_LENGTH), expected 32-34 characters!" -ForegroundColor Red
            Write-Host "   Action: Check .env file - secret key may have extra spaces!" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "❌ Error retrieving config: $_" -ForegroundColor Red
}

# ==================== TEST 2: Test Webhook ====================
Write-Host "`n📋 TEST 2: Testing Webhook..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/payments/debug/test-webhook" `
        -Method Post `
        -UseBasicParsing `
        -ContentType "application/json"
    
    $result = $response.Content | ConvertFrom-Json
    
    if ($result.success) {
        Write-Host "✅ Webhook test passed!" -ForegroundColor Green
        Write-Host "   Order: $($result.details.orderTested)"
        Write-Host "   Signature Length: $($result.details.signature.length)"
        Write-Host "   Webhook Response: $($result.details.webhookResponse.success)"
    } else {
        Write-Host "❌ Webhook test failed!" -ForegroundColor Red
        Write-Host "   Error: $($result.message)" -ForegroundColor Red
        Write-Host "   Details: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error testing webhook: $_" -ForegroundColor Red
}

# ==================== TEST 3: List Orders ====================
Write-Host "`n📋 TEST 3: Getting Test Orders..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/payments/debug/orders" `
        -Method Get `
        -UseBasicParsing
    
    $orders = $response.Content | ConvertFrom-Json
    
    if ($orders.success) {
        Write-Host "✅ Orders retrieved!" -ForegroundColor Green
        Write-Host "   Total unpaid orders: $($orders.data.pagination.total)"
        
        if ($orders.data.orders.Count -gt 0) {
            Write-Host "`n   Recent orders:" -ForegroundColor Cyan
            $orders.data.orders | Select-Object -First 3 | ForEach-Object {
                Write-Host "   - Order: $($_.orderId)"
                Write-Host "     Amount: $($_.totalPrice) VND"
                Write-Host "     Created: $($_.createdAt)"
            }
        }
    }
} catch {
    Write-Host "❌ Error getting orders: $_" -ForegroundColor Red
}

Write-Host "`n╔═════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                     Testing Complete                        ║" -ForegroundColor Cyan
Write-Host "╚═════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n⚠️  Next Steps:" -ForegroundColor Yellow
Write-Host "1. If Secret Key length ≠ 32-34, copy from VNPAY email again"
Write-Host "2. Check .env for extra spaces or newlines"
Write-Host "3. Restart backend: npm run dev"
Write-Host "4. Re-run this script to verify"
