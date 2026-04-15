# 广告（Ads）— Google Ads + Twitter Ads

## 选型


| 服务                              | 角色     | 说明                           |
| ------------------------------- | ------ | ---------------------------- |
| **Google Ads**                  | 主要付费获客 | 前端 gtag 转化 + 服务端离线回传 + 增强型转化 |
| **Twitter/X Ads**               | 辅助投放   | 前端 `twq` 购买转化事件              |
| **PropellerAds / TrafficJunky** | 辅助投放   | 支付成功页 Image Pixel（硬编码，按需开关）  |


> Google Ads 是唯一需要服务端 API 的广告平台，其他平台仅前端像素。

---

## 架构

广告集成分为三层：

```
┌──────────────────────────────────────────────────────────────┐
│  第 1 层：归因采集（Middleware + UtmTracker）                   │
│  URL → Cookie（gclid/wbraid/gbraid/UTM/visitor_id）           │
│  注册时 → 写入 User 表（adClickId/adClickProvider/utm*）       │
├──────────────────────────────────────────────────────────────┤
│  第 2 层：前端转化上报（支付成功页）                              │
│  gtag('event','conversion') / twq / Image Pixel              │
├──────────────────────────────────────────────────────────────┤
│  第 3 层：服务端离线回传（BullMQ Worker）                        │
│  履约成功 → Redis ZSET 入队 → 每 5 分钟批量上传 Google Ads API  │
│  ├── 离线点击转化（gclid/wbraid/gbraid）                       │
│  └── 增强型网页转化（gclid + hashed email）                     │
└──────────────────────────────────────────────────────────────┘
```

### 代码位置

```
src/analytics/ads/                     # 前端转化追踪
├── config.ts                          # 统一广告配置（env → ADS_CONFIG）+ 平台开关函数
├── twitter.ts                         # Twitter twq 事件封装
└── index.ts                           # 统一导出

src/server/ads/google-ads/             # 服务端 Google Ads API
├── client.ts                          # google-ads-api Customer 工厂
├── queue.ts                           # Redis ZSET 入队（enqueue*）
├── offline-purchase.ts                # 离线点击转化上传（单条）
├── web-enhancement.ts                 # 增强型网页转化上传（单条）
└── alert.ts                           # 失败告警（Lark）

src/workers/
├── queues/google-ads-upload.queue.ts  # BullMQ 队列定义
└── processors/google-ads-upload/
    ├── processor.ts                   # 批量 flush（离线 + Web Enhancement）
    └── scheduler.ts                   # Cron 每 5 分钟

src/components/analytics/
└── utm-tracker.tsx                    # 客户端 UTM/点击 ID Cookie 写入

src/middleware.ts                      # 服务端首触归因 Cookie 写入
src/app/payment/success/
└── success-client.tsx                 # 支付成功页多平台转化上报
```

---

## 数据流

### 归因链路

```
用户点击广告 → 带 gclid/utm_* 参数着陆
    │
    ├── middleware.ts：首触写入 Cookie（gclid / wbraid / gbraid / utm_* / visitor_id）
    │   + 写入 app_landing_path / app_ref_host / app_first_touch_at
    │
    ├── UtmTracker（客户端）：补充写入 Cookie（兜底 + 记录 utm_first_visit）
    │
    └── 注册/登录回调（auth/config.ts）：
        Cookie → User 表（adClickId / adClickProvider / utmSource / utmMedium / utmCampaign）
```

### 前端转化上报（支付成功页）

```
支付完成 → /payment/success
    │
    ├── Google Ads：gtag('event','conversion', { send_to, value, transaction_id })
    │   └── 兜底：googleadservices.com Image Pixel
    │
    ├── Twitter Ads：twq('event', 'tw-qv3gm-qv3gn', { value, conversion_id })
    │
    ├── PropellerAds：Image → ad.propellerads.com/conversion.php（如 visitor_id Cookie 存在）
    │
    └── TrafficJunky：Image → ads.trafficjunky.net/ct
```

### 服务端离线回传

```
Webhook/Direct Charge 履约成功
    │
    └── enqueueGoogleAdsUploadsForPayment(paymentId)
        ├── Redis ZSET google-ads:pending:offline（score=时间戳）
        └── Redis ZSET google-ads:pending:web（score=时间戳）

BullMQ Scheduler（每 5 分钟）
    │
    └── processGoogleAdsUploadJob("flush")
        ├── flushOfflinePurchases()
        │   └── ZPOPMIN → 批量查 DB → 过滤有 gclid/wbraid/gbraid 的
        │       → UploadClickConversions API（batch, partial_failure）
        │       → 成功：payment.extra.googleAds.offlinePurchase.uploadedAt
        │       → 失败：pushBack + alert
        │
        └── flushWebEnhancements()
            └── ZPOPMIN → 批量查 DB → 过滤有 gclid 的
                → UploadConversionAdjustments API（ENHANCEMENT）
                → 用户信息 SHA256 hash（email / name）
                → 成功/失败：同上
```

---

## 对外接口

### 前端 API（从 `@/analytics/ads` 导入）

```typescript
// Google Ads Measurement ID 和 Conversion Label 配置
function getGoogleAdsConfig(hostname?: string): {
  domain: string;
  measurementId: string;
  conversionLabel: string;
};

// Twitter 转化事件
function trackTwitterConversion(eventId: string, params?: TwitterConversionParams): void;
function trackTwitterPurchase(params: {
  orderId: string;
  value: number;
  currency?: string;
  email?: string;
  items?: Array<{ id: string; name: string; price: number; quantity: number }>;
}): void;
```

### 服务端 API（从 `@/server/ads/google-ads/queue` 导入）

```typescript
// 支付履约后调用，自动入 Redis 队列等待批量上传
async function enqueueGoogleAdsUploadsForPayment(paymentId: string): Promise<void>;

// 单独入队（通常不需要直接调用）
async function enqueueGoogleAdsOfflinePurchaseUpload(paymentId: string): Promise<void>;
async function enqueueGoogleAdsWebEnhancementUpload(paymentId: string): Promise<void>;
```

---

## 配置

### 环境变量

所有广告平台通过环境变量配置，**未配置的平台自动禁用**（代码是 no-op）。

```bash
# ─── 前端转化追踪（全部可选） ───
# Google Ads: Google Ads → 工具 → 转化 → 代码安装
NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ID=AW-1234567890
NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL=AbCdEfGhIjKlMnOpQr
# Twitter/X Ads: Twitter Ads → Events Manager
NEXT_PUBLIC_TWITTER_PIXEL_ID=abcde
NEXT_PUBLIC_TWITTER_PURCHASE_EVENT_ID=tw-xxxxx-xxxxx
# PropellerAds
NEXT_PUBLIC_PROPELLER_AID=
NEXT_PUBLIC_PROPELLER_TID=
# TrafficJunky
NEXT_PUBLIC_TJ_ACCOUNT_ID=
NEXT_PUBLIC_TJ_MEMBER_ID=

# ─── Google Ads 服务端 API（离线回传，可选） ───
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
# GOOGLE_ADS_MCC_ID=
GOOGLE_ADS_CONVERSION_ACTION_ID=
GOOGLE_ADS_WEB_CONVERSION_ACTION_ID=
```

### 开启/关闭规则

| 平台 | 开启条件 | 关闭方式 |
| --- | --- | --- |
| Google Ads (前端) | `NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ID` 非空 | 留空即禁用 |
| Google Ads (服务端) | `GOOGLE_ADS_CUSTOMER_ID` + `GOOGLE_ADS_CONVERSION_ACTION_ID` 非空 | 留空即禁用 |
| Twitter Ads | `NEXT_PUBLIC_TWITTER_PIXEL_ID` + `NEXT_PUBLIC_TWITTER_PURCHASE_EVENT_ID` 非空 | 留空即禁用 |
| PropellerAds | `NEXT_PUBLIC_PROPELLER_AID` 非空 | 留空即禁用 |
| TrafficJunky | `NEXT_PUBLIC_TJ_ACCOUNT_ID` 非空 | 留空即禁用 |

---

## 异常处理

### 前端转化


| 场景                           | 处理                                       |
| ---------------------------- | ---------------------------------------- |
| gtag 未加载（EEA 用户未同意）          | 不触发 Google 转化，不影响支付流程                    |
| gtag 加载但 `conversion` 发送失败   | 使用 `googleadservices.com` Image Pixel 兜底 |
| `twq` 不存在（未加载 Twitter pixel） | `trackTwitterConversion` 静默跳过            |


### 服务端离线回传


| 场景                          | 处理                                                             |
| --------------------------- | -------------------------------------------------------------- |
| Google Ads 凭据未配置            | `enqueue`* 函数直接 return，不入队                                     |
| 用户无 gclid/wbraid/gbraid     | skip，不上传（记录到 payment.extra）                                    |
| Google Ads API 限流（429）      | 放回 Redis 队列 + 抛异常让 BullMQ 重试                                   |
| gRPC client 过期（TTLCache 关闭） | 自动重新创建 Customer 实例重试 1 次                                       |
| 部分失败（partial_failure）       | 非限流：标记成功（Google 按 order_id 去重）；限流：全部放回                         |
| 上传失败                        | 记录到 `payment.extra.googleAds.*.lastError` + Lark 告警（每笔仅告警 1 次） |
| 幂等保证                        | `payment.extra.googleAds.*.uploadedAt` 存在则跳过                   |


---

## 幂等与去重

- **Google Ads 侧**：使用 `order_id`（orderId）去重，重复上传同一 order_id 不会产生重复转化
- **框架侧**：`payment.extra.googleAds.offlinePurchase.uploadedAt` / `webEnhancement.uploadedAt` 标记已上传
- **Redis ZSET**：member 是 paymentId，天然去重
- **BullMQ Scheduler**：固定 `jobId: "google-ads-upload-flush"`，不会重复注册

---

## AI 引导

### 硬规则

1. **前端广告追踪** → `import { ... } from "@/analytics/ads"`，禁止直接调用 `window.gtag` 或 `window.twq`
2. **支付履约后触发回传** → 在 Webhook/Direct Charge 处理成功后调用 `enqueueGoogleAdsUploadsForPayment(paymentId)`
3. **禁止**在非 Worker 代码中直接调用 `uploadGoogleAdsOfflinePurchaseForPayment`（应通过队列异步处理）
4. 修改 Google Ads Measurement ID → 编辑 `src/analytics/ads/google.ts`
5. 修改 Twitter 事件 ID → 编辑 `src/analytics/ads/twitter.ts`
6. 新增广告平台的前端像素 → 在 `src/app/payment/success/success-client.tsx` 的转化上报区域添加

### UTM 归因规则

- Middleware 负责首触归因写 Cookie（first-touch attribution）
- `UtmTracker` 在客户端补充写入（last-touch 覆盖策略）
- 登录时写入 User 表 → 后续订单和离线回传自动关联
- **禁止**在业务代码中直接读写归因 Cookie，使用 Prisma User 模型上的字段

### 新增广告平台模板

```typescript
// 1. 在 src/analytics/ads/ 中新建 my-platform.ts
export function trackMyPlatformConversion(params: {
  orderId: string;
  value: number;
}): void {
  if (typeof window !== "undefined" && window.myPlatformTracker) {
    window.myPlatformTracker("conversion", params);
  }
}

// 2. 在 src/analytics/ads/index.ts 中导出
export { trackMyPlatformConversion } from "./my-platform";

// 3. 在 success-client.tsx 的转化上报区域调用
trackMyPlatformConversion({ orderId, value: amount });

// 4. 如需服务端回传，参考 src/server/ads/google-ads/ 的模式
```

