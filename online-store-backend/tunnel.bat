@echo off
"%~dp0cloudflared.exe" tunnel --protocol auto --ha-connections 2 --config "%~dp0.cloudflared\config.windows.yml" run
