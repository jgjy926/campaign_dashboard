# Replaces the Worker's access token without showing or saving it. Every device then
# needs the new one, entered by clicking the sync badge in the app.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })

Write-Host 'Saving the new token to the Worker...'
$token | npx wrangler secret put APP_API_KEY | Out-Null

Set-Clipboard -Value $token
Write-Host ''
Write-Host 'Your new access token is on the clipboard. Paste it into your password manager now.' -ForegroundColor Yellow
Write-Host 'The old key has stopped working. It cannot be read back from Cloudflare.'
