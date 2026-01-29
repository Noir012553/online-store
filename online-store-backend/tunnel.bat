@echo off
"C:\Program Files\cloudflared.exe" tunnel --protocol http2 --ha-connections 2 --config "%~dp0cloudflared-config.yml" run