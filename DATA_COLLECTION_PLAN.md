# Amazon ASIN 采集方案 v2

## 结论

旧方案失败在访问层：Codex 新建浏览器标签直接导航 Amazon 时持续超时，后续解析根本不会执行。新版改为：**用户在日常 Chrome 中正常打开页面，Codex 接管已加载页面，读取后本地保存**。

这不需要传统爬虫或第三方 API，但不适合完全无人值守。

## 主流程

1. 用户在 Chrome 打开目标 Amazon 站点并确认页面显示正常。
2. Codex 接管这个现有标签页，不重新导航或刷新，保留 Cookie、地区、登录态和已完成的页面验证。
3. 读取可见商品字段：标题、价格、评分、Review 数、类目 BSR、变体、库存状态、URL 和时间。
4. 用户在同一 Chrome 会话打开关键词搜索结果；Codex 接管结果页，按自然结果中的 ASIN 计算排名，广告位单独标记。
5. 数据经 `collector.mjs` 校验；缺失字段写 `null`，异常记录不覆盖上一次成功值。
6. 快照追加到 `data/captures/`，工作台据此生成日变化、7 日和 30 日报告。

## 状态机

- `waiting_for_page`：等待用户打开页面。
- `page_ready`：当前 URL/页面 ASIN 与目标匹配。
- `extracting`：读取公开可见字段。
- `validated`：类型与范围校验通过。
- `saved`：快照已落盘。
- `needs_user`：验证码、地区或登录需要用户处理。
- `partial`：页面可读但部分字段缺失。
- `failed`：页面错误、ASIN 不匹配或连续读取失败。

## 数据口径

- BSR 必须同时保存类目；不同类目不能直接比较。
- 关键词记录 `organicRank/page/sponsored/marketplace/deliveryRegion/signedIn/capturedAt`。
- 未找到记录 `not_found_within_range` 和已检查页数，不能写排名 0。
- 评论只保存日期、星级、标题、正文和 verified 标志，不保存用户名。
- Review 总数下降仅代表净变化，不能推断删除的是好评还是差评。

## 运行节奏

- 每日一次商品页采集。
- 每个 ASIN 3–5 个关键词，默认检查自然结果前 3 页。
- 出现验证码立即进入 `needs_user`，不绕过、不继续批量访问。
- 7 日/30 日报告只使用口径一致的成功或部分成功快照。

## 已验证的故障边界

- 独立浏览器直接访问 Amazon：超时。
- 新建 Chrome 标签直接访问 Amazon：仍超时。
- 因此新版必须从用户已正常打开的 Amazon 页面开始接管。
