$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root '.env.local'
if (!(Test-Path $envFile)) { throw '找不到 .env.local，请先运行 setup-gist.ps1' }
$line = Get-Content $envFile | Where-Object { $_ -match '^GITHUB_GIST_TOKEN=' } | Select-Object -First 1
$token = if ($line) { $line.Substring($line.IndexOf('=') + 1).Trim() } else { '' }
if (!$token) { throw 'GITHUB_GIST_TOKEN 未配置' }
$token | gh secret set GIST_TOKEN --repo xiaopong190-oss/keyword
if ($LASTEXITCODE -ne 0) { throw 'GitHub Secret 设置失败' }
Write-Host '仓库 Secret GIST_TOKEN 已设置。' -ForegroundColor Green
