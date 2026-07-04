$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$api = 'https://asin-radar-config.xiaopong190-asin-radar.workers.dev'
Push-Location (Join-Path $root 'worker')
try {
  npx wrangler deploy
  if ($LASTEXITCODE -ne 0) { throw 'Worker 部署失败' }
} finally { Pop-Location }
Start-Sleep -Seconds 3
$health = Invoke-RestMethod -Uri "$api/health" -TimeoutSec 20
if (!$health.ok -or $health.storage -ne 'cloudflare-kv') { throw 'Worker 健康验证失败' }
$config = Get-Content (Join-Path $root 'monitoring.config.json') -Raw | ConvertFrom-Json
foreach ($product in $config.products) {
  $body = @{ action='add'; asin=$product.asin; keywords=@($product.keywords) } | ConvertTo-Json
  $result = Invoke-RestMethod -Method Post -Uri "$api/config" -ContentType 'application/json' -Body $body -TimeoutSec 20
  if (!$result.ok) { throw "配置迁移失败：$($product.asin)" }
}
$saved = Invoke-RestMethod -Uri "$api/config" -TimeoutSec 20
if (@($saved.products).Count -lt @($config.products).Count) { throw '配置回读验证失败' }
& powershell -ExecutionPolicy Bypass -File (Join-Path $root 'publish-to-github.ps1')
if ($LASTEXITCODE -ne 0) { throw 'GitHub 发布失败' }
Write-Host '简化版部署完成：网页配置使用 Cloudflare KV，采集结果使用 Gist。' -ForegroundColor Green
