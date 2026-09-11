# Local Admin sample data

`pnpm dev:local` imports the sample data once into the existing `harness_preview` database. For an already running local preview, run `pnpm db:seed:demo`, then refresh Admin. The PostgreSQL container must already be running, and the local preview must have been initialized.

The seed adds 32 users, 5 products, 48 orders with payment histories, 8 subscriptions, 6 promo codes with 24 redemption records, 8 commissions, 5 payout requests, 3 outreach scenes with bilingual templates and 28 schedules, and 24 email conversations. The first email conversation contains 26 messages for pagination. Existing rows are not reset; stable IDs and unique keys prevent duplicate imports. The import runs in one transaction.

Start at `/admin/users` and search for `demo.user01@example.test` to browse a populated user, subscription, orders, attribution, and affiliate account. Product names and campaign codes start with `Demo` / `DEMO`. Other users include missing profile data, long names, a blocked account, and a new account with no purchases.

Only the local preview database is accepted. Payments use `LOCAL_DEMO`, wallets are non-payable demo identifiers, and outreach scenes are inactive. Email replies and outreach schedules contain historical outcomes only, with no pending deliveries. The seed writes records directly; it does not send messages, charge cards, call providers, change module switches, or create connection credentials.

Credit balances and billing records live in the external Velobase ledger, not in PostgreSQL, and are not seeded. Promo redemption amounts are illustrative historical records, not grants to that ledger. External payment, email, and credit operations still require their existing service configuration.

## 中文

`pnpm dev:local` 会向本地 `harness_preview` 数据库一次性导入演示数据。当前服务已经启动时，执行 `pnpm db:seed:demo`，刷新 Admin 即可。脚本不会重启服务；重复执行不会增加重复记录，也不会重置已编辑的记录。

从用户列表搜索 `demo.user01@example.test` 开始，可以查看关联的订单、订阅、归因和分销信息。数据还覆盖长姓名、资料缺失、受限用户、无购买记录的新用户、不同订单状态、优惠码兑换、提现状态、双语邮件模板以及长邮件线程。

数据只写入本地演示库，不调用外部服务。积分账本不在本地数据库，本脚本不会创建虚假的积分余额；支付、邮件及积分的真实操作仍需要对应服务配置。
