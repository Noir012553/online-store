Set-Location "E:\dev-camp\24-9-26 copy 98\online-store-backend"
Start-Process node -ArgumentList "--max-old-space-size=1024", "src/app.js" -NoNewWindow -RedirectStandardOutput "..\translation-workspace\logs\backend.log" -RedirectStandardError "..\translation-workspace\logs\backend.err" -PassThru
