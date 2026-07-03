# GitHub Gist 数据存储

## 配置

1. 创建只用于本项目的 GitHub Token，并授予 Gist 写入权限。
2. 复制 `.env.example` 为 `.env.local`。
3. 填写 `GITHUB_GIST_TOKEN`。已有Gist可同时填写 `GITHUB_GIST_ID`；留空则首次同步自动创建Secret Gist。
4. 定时运行使用：`node --env-file=.env.local run-collection.mjs`。

也可以右键 `setup-gist.ps1`，选择“使用 PowerShell 运行”，粘贴 Token 后自动创建 Secret Gist、首次同步，并生成 `public/data-source.json`。以后每次采集会自动同步；手动同步可运行 `node --env-file=.env.local sync-gist-now.mjs`。

Token不能写进网页、仓库或截图。Secret Gist并非真正私有，任何获得URL的人都能读取，因此不要保存API密钥、Cookie或个人信息。

## 文件布局

- `latest.json`：前端所需最新快照。
- `history-YYYY-MM.json`：按月保存历史，每月最多保留62次（每天两次）。
- `reports.json`：Codex生成的7/15/30天分析报告。

本地SQLite仍是完整数据源。Gist同步失败不会影响采集和本地保存。
