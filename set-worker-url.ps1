$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = (Read-Host '粘贴 Cloudflare Worker 地址（例如 https://asin-radar-config.xxx.workers.dev）').Trim().TrimEnd('/')
if ($url -notmatch '^https://[a-zA-Z0-9.-]+\.workers\.dev$') { throw 'Worker 地址格式不正确' }
$json = @{ configApiUrl = $url } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $root 'public\runtime-config.json'),$json + [Environment]::NewLine,[Text.UTF8Encoding]::new($false))
Write-Host 'Worker 地址已写入 public/runtime-config.json，请重新运行发布脚本。' -ForegroundColor Green
