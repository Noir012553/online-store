@echo off
"%~dp0cloudflared.exe" tunnel --protocol http2 --ha-connections 2 --config "%~dp0.cloudflared\config.windows.yml" run
