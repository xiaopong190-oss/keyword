# Cloudflare Worker 配置

1. 先运行 `node --env-file=.env.local sync-gist-now.mjs`，为 Gist 创建 `config.json`。
2. 将 `worker/wrangler.toml.example` 复制为 `worker/wrangler.toml`。
3. 在项目目录运行：

```powershell
npx wrangler login
cd worker
npx wrangler secret put GIST_TOKEN
npx wrangler secret put GIST_ID
npx wrangler secret put EDIT_KEY
npx wrangler deploy
```

- `GIST_TOKEN`：已有的 Gist Token。
- `GIST_ID`：`2a69455c29b1997119a1dd91e4c679ae`。
- `EDIT_KEY`：自行设置的共享编辑密码。

4. 复制部署后显示的 `https://...workers.dev` 地址，运行根目录的 `set-worker-url.ps1`。
5. 重新运行 `publish-to-github.ps1`。

网页只公开 Worker 地址，不公开 Gist Token 和编辑密码。
