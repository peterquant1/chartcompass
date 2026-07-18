# ChartCompass 收款后端（Cloudflare Worker）

点击购买 → 现开 OxaPay 发票 → 付款 → 回调验签 → 买家提交 TradingView 用户名 → Telegram 通知交付。

## 部署步骤（约 10 分钟，只需一次）

前提：有 Cloudflare 账号（免费版即可）。

```bash
cd worker

# 1. 登录 Cloudflare（浏览器弹窗授权）
npx wrangler login

# 2. 创建 KV 存储（记录订单状态）
npx wrangler kv namespace create ORDERS
#    把输出的 id 填入 wrangler.toml 的 REPLACE_WITH_KV_NAMESPACE_ID

# 3. 设置 OxaPay 商户 API Key（在 OxaPay 后台 Merchant API 页面生成）
npx wrangler secret put OXAPAY_MERCHANT_API_KEY

# 4.（可选但强烈建议）Telegram 收款通知
#    @BotFather 建一个 bot 拿 token；给 bot 发条消息后访问
#    https://api.telegram.org/bot<TOKEN>/getUpdates 拿你的 chat id
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID

# 5. 部署
npx wrangler deploy
#    输出形如 https://chartcompass-pay.<你的子域>.workers.dev
```

最后把部署得到的地址填到站点两个文件里的 `window.CC_CONFIG.apiBase`：
`index.html` 和 `success.html`（搜索 `CC_CONFIG`），提交推送即可。

## 验证

1. 打开站点点「获取 ChartCompass」→ 应跳到一张全新的 OxaPay 发票（不再是"支付已过期"）。
2. OxaPay 后台可以用小金额把 `PRICE_AMOUNT` 临时改成 1 来实测一整条链路，测完改回 1500 重新 deploy。
3. 付款确认后自动跳回 `success.html?order=...`，页面轮询到 Paid 状态后出现 TradingView 用户名表单，提交后你的 Telegram 会收到交付通知。

## 接口

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/checkout` | 创建发票，返回 `payment_url` |
| POST | `/api/webhook` | OxaPay 回调（HMAC sha512 验签） |
| GET | `/api/order/:id` | 订单状态轮询 |
| POST | `/api/claim` | 买家提交 TradingView 用户名 |
