# Start Homebase. Right-click > "Run with PowerShell", or run .\run.ps1 in a terminal.
# Open http://localhost:8254 on the laptop, or http://<laptop-name>:8254 on your phone over Tailscale.
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) {
    Write-Host "First run: setting up Python packages..."
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -q -r requirements.txt
}
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8254
