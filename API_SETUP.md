# 分析服务配置

## API 密钥位置

1. 复制 `.env.example` 为 `.env.local`。
2. 在 `.env.local` 中填写：

   `OPENAI_API_KEY=你的密钥`

3. `.env.local` 已加入 `.gitignore`，不要提交到 GitHub、聊天或截图中。

## 自动切换顺序

1. 程序先实际调用本机 `codex exec`。
2. 调用成功时，报告标记为 `codex-local`。
3. Codex CLI 不存在、未登录、超时或调用失败时，才读取 `OPENAI_API_KEY` 并调用 Responses API。
4. API 也不可用时，任务标记为 `queued`，采集数据保持不变，稍后可以重新分析。

“Codex窗口正在显示”不是可靠信号；实际试调用可以同时验证CLI、登录状态和可用额度。

## 手动运行

`node --env-file=.env.local analysis-provider.mjs data-summary.json`

分析结果默认写入 `analysis-output/`。
