$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root '.env.local'
$gistFile = Join-Path $root 'data\gist-id.txt'
$worker = Join-Path $root 'worker'
if (!(Test-Path $envFile)) { throw '找不到 .env.local，请先运行 setup-gist.ps1' }
if (!(Test-Path $gistFile)) { throw '找不到 Gist ID，请先运行 sync-gist-now.mjs' }
$line = Get-Content $envFile | Where-Object { $_ -match '^GITHUB_GIST_TOKEN=' } | Select-Object -First 1
$token = if ($line) { $line.Substring($line.IndexOf('=') + 1).Trim() } else { '' }
$gistId = (Get-Content $gistFile -Raw).Trim()
if (!$token) { throw 'GITHUB_GIST_TOKEN 未配置' }
if ($gistId -notmatch '^[a-f0-9]{20,}$') { throw 'Gist ID 格式不正确' }
$secure = Read-Host '设置共享编辑密码（输入会隐藏，请自行记住）' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $editKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($editKey.Length -lt 8) { throw '编辑密码至少需要8位' }
$toml = Join-Path $worker 'wrangler.toml'
if (!(Test-Path $toml)) { Copy-Item (Join-Path $worker 'wrangler.toml.example') $toml }
Push-Location $worker
try {
  $token | npx wrangler secret put GIST_TOKEN
  if ($LASTEXITCODE -ne 0) { throw 'GIST_TOKEN 设置失败' }
  $gistId | npx wrangler secret put GIST_ID
  if ($LASTEXITCODE -ne 0) { throw 'GIST_ID 设置失败' }
  $editKey | npx wrangler secret put EDIT_KEY
  if ($LASTEXITCODE -ne 0) { throw 'EDIT_KEY 设置失败' }
  npx wrangler deploy
  if ($LASTEXITCODE -ne 0) { throw 'Worker 部署失败' }
} finally {
  $token=$null;$editKey=$null;Pop-Location
}
Write-Host 'Worker 配置与部署完成。请复制上方 workers.dev 地址。' -ForegroundColor Green
