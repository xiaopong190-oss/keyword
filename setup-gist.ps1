$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root '.env.local'
$token = Read-Host '粘贴 GitHub Token（输入内容会隐藏）' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Token 不能为空' }
$existing = if (Test-Path $envFile) { Get-Content $envFile } else { @() }
$kept = @($existing | Where-Object { $_ -notmatch '^GITHUB_GIST_(TOKEN|ID)=' })
$content = (@($kept + "GITHUB_GIST_TOKEN=$plain" + 'GITHUB_GIST_ID=') -join [Environment]::NewLine) + [Environment]::NewLine
[IO.File]::WriteAllText($envFile, $content, [Text.UTF8Encoding]::new($false))
$plain = $null
$node = 'C:\Users\15869\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Push-Location $root
try { & $node --env-file=.env.local sync-gist-now.mjs; if ($LASTEXITCODE -ne 0) { throw 'Gist 同步失败，请检查 Token 权限' } } finally { Pop-Location }
Write-Host 'Gist 已创建并完成首次同步。' -ForegroundColor Green
