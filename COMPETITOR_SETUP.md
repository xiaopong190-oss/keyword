# 竞品对比分析

在 `monitoring.config.json` 的主ASIN下填写用户指定竞品：

```json
{
  "asin": "主ASIN",
  "keywords": ["共同关键词"],
  "competitors": ["竞品ASIN1", "竞品ASIN2"]
}
```

还需要把竞品作为独立产品加入 `products`，并配置相同关键词，采集口径才可比较。采集完成后运行：

`node --env-file-if-exists=.env.local comparison-analysis.mjs`

分析调用顺序由 `ANALYSIS_PROVIDER_ORDER` 控制，默认是本机Codex、DeepSeek、OpenAI。报告写入 `public/data/reports.json`，下次Gist同步时自动上传。
