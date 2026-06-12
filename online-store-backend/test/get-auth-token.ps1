# ============================================================================
# GET AUTH TOKEN - Login and retrieve JWT token
# Sử dụng script này để lấy JWT token từ admin account
# ============================================================================

# Configuration
$BACKEND_URL = "http://localhost:5000"  # Thay đổi nếu backend chạy trên port khác
$ADMIN_EMAIL = "noir@example.com"       # Email admin account
$ADMIN_PASSWORD = "password123"         # Password admin account

# Colors for output
$Colors = @{
    'Success' = 'Green'
    'Error'   = 'Red'
    'Info'    = 'Cyan'
    'Warning' = 'Yellow'
}

Write-Host "`n═══════════════════════════════════════════════════════════════════" -ForegroundColor $Colors.Info
Write-Host "GET AUTH TOKEN - Login Admin Account" -ForegroundColor $Colors.Info
Write-Host "═══════════════════════════════════════════════════════════════════`n" -ForegroundColor $Colors.Info

Write-Host "Configuration:" -ForegroundColor $Colors.Info
Write-Host "  Backend URL: $BACKEND_URL" -ForegroundColor $Colors.Info
Write-Host "  Admin Email: $ADMIN_EMAIL" -ForegroundColor $Colors.Info
Write-Host "  ⚠️  UPDATE credentials trước khi chạy!`n" -ForegroundColor $Colors.Warning

# ============================================================================
# Step 1: Login
# ============================================================================
Write-Host "🔑 Step 1: Logging in..." -ForegroundColor $Colors.Info
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor $Colors.Info

$Uri_Login = "$BACKEND_URL/api/users/login"
$Body_Login = @{
    email    = $ADMIN_EMAIL
    password = $ADMIN_PASSWORD
} | ConvertTo-Json

Write-Host "POST $Uri_Login" -ForegroundColor $Colors.Info
Write-Host "Body: {`"email`": `"$ADMIN_EMAIL`", `"password`": `"***`"}`n" -ForegroundColor $Colors.Info

$AuthToken = $null
$RefreshToken = $null
$UserId = $null

try {
    $Response_Login = Invoke-RestMethod -Uri $Uri_Login `
        -Method Post `
        -Headers @{
            "Content-Type" = "application/json"
        } `
        -Body $Body_Login `
        -ErrorAction Stop

    Write-Host "✅ LOGIN SUCCESS" -ForegroundColor $Colors.Success
    Write-Host "User Email: $($Response_Login.email)" -ForegroundColor $Colors.Success
    Write-Host "User Role: $($Response_Login.role)" -ForegroundColor $Colors.Success
    
    # Extract tokens
    $AuthToken = $Response_Login.token
    $RefreshToken = $Response_Login.refreshToken
    $UserId = $Response_Login._id

    Write-Host "`n📌 ACCESS TOKEN (JWT):" -ForegroundColor $Colors.Info
    Write-Host $AuthToken -ForegroundColor $Colors.Success
    
    Write-Host "`n📌 REFRESH TOKEN:" -ForegroundColor $Colors.Info
    Write-Host $RefreshToken -ForegroundColor $Colors.Success
    
    Write-Host "`n📌 USER ID:" -ForegroundColor $Colors.Info
    Write-Host $UserId -ForegroundColor $Colors.Success

} catch {
    Write-Host "❌ LOGIN FAILED" -ForegroundColor $Colors.Error
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor $Colors.Error
    
    if ($_.Exception.Response) {
        try {
            $errorContent = $_.Exception.Response.Content.ReadAsStream() | % { [System.IO.StreamReader]::new($_).ReadToEnd() }
            Write-Host "Response: $errorContent" -ForegroundColor $Colors.Error
        } catch {}
    }
    
    Write-Host "`n⚠️  TROUBLESHOOTING:" -ForegroundColor $Colors.Warning
    Write-Host "  1. Kiểm tra backend có chạy trên $BACKEND_URL không" -ForegroundColor $Colors.Warning
    Write-Host "  2. Kiểm tra email/password có đúng không" -ForegroundColor $Colors.Warning
    Write-Host "  3. Kiểm tra account có role 'admin' không" -ForegroundColor $Colors.Warning
    
    Exit 1
}

# ============================================================================
# Step 2: Test token by calling protected endpoint
# ============================================================================
Start-Sleep -Seconds 2

Write-Host "`n🧪 Step 2: Testing token with protected endpoint..." -ForegroundColor $Colors.Info
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor $Colors.Info

$Uri_Profile = "$BACKEND_URL/api/users/profile"

Write-Host "GET $Uri_Profile`n" -ForegroundColor $Colors.Info

try {
    $Response_Profile = Invoke-RestMethod -Uri $Uri_Profile `
        -Method Get `
        -Headers @{
            "Authorization" = "Bearer $AuthToken"
            "Content-Type"  = "application/json"
        } `
        -ErrorAction Stop

    Write-Host "✅ TOKEN VALID" -ForegroundColor $Colors.Success
    Write-Host "Profile: $($Response_Profile.email)" -ForegroundColor $Colors.Success

} catch {
    Write-Host "❌ TOKEN INVALID" -ForegroundColor $Colors.Error
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor $Colors.Error
    Exit 1
}

# ============================================================================
# Step 3: Save token to config file
# ============================================================================
Start-Sleep -Seconds 1

Write-Host "`n💾 Step 3: Saving token to config file..." -ForegroundColor $Colors.Info
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor $Colors.Info

$ConfigFile = "auth-config.json"
$Config = @{
    timestamp     = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    authToken     = $AuthToken
    refreshToken  = $RefreshToken
    userId        = $UserId
    adminEmail    = $ADMIN_EMAIL
    backendUrl    = $BACKEND_URL
} | ConvertTo-Json

$Config | Out-File -FilePath $ConfigFile -Encoding UTF8 -Force

Write-Host "✅ Config saved to: $ConfigFile" -ForegroundColor $Colors.Success

# ============================================================================
# Step 4: Display usage instructions
# ============================================================================
Write-Host "`n📝 NEXT STEPS - Sử dụng token cho các test scripts:" -ForegroundColor $Colors.Info
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor $Colors.Info

Write-Host "`n✏️  Option 1: Update script credentials manually" -ForegroundColor $Colors.Info
Write-Host "  Sửa các test script (test-tier*.ps1):" -ForegroundColor $Colors.Info
Write-Host "`$AUTH_TOKEN = `"$($AuthToken.Substring(0, 50))...`"" -ForegroundColor $Colors.Success

Write-Host "`n✏️  Option 2: Use automated script (RECOMMENDED)" -ForegroundColor $Colors.Info
Write-Host "  Chạy run-tests-with-auth.ps1 (sẽ tự load token từ auth-config.json)" -ForegroundColor $Colors.Info

Write-Host "`n🚀 Run tests:" -ForegroundColor $Colors.Info
Write-Host "  1. Update credentials trong script này (ADMIN_EMAIL, ADMIN_PASSWORD)" -ForegroundColor $Colors.Info
Write-Host "  2. Chạy: .\get-auth-token.ps1" -ForegroundColor $Colors.Info
Write-Host "  3. Chạy: .\run-tests-with-auth.ps1" -ForegroundColor $Colors.Info

Write-Host "`n═══════════════════════════════════════════════════════════════════" -ForegroundColor $Colors.Info
Write-Host "✅ AUTH TOKEN GENERATED SUCCESSFULLY" -ForegroundColor $Colors.Success
Write-Host "═══════════════════════════════════════════════════════════════════`n" -ForegroundColor $Colors.Info
