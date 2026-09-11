# 在原 Harness 中组合和管理模块

原来的页面、数据和业务流程继续作为同一个产品。代码选择和 Admin 开关都作用于这个 Harness。

| 层次 | 入口 | 负责什么 |
| --- | --- | --- |
| 业务包 | `packages/<module>` | 业务规则，以及明确的数据和服务接口 |
| 原应用接入 | `src/modules/<module>`、原有服务与页面 | 接回 Harness 原数据、权限和界面 |
| 部署清单 | `packages/example-composition/src/index.ts` | 声明包含的模块及其依赖 |
| Admin 运营 | `/admin/features`、`/admin/connections` | 配置已装模块，控制新业务操作 |
| 技术适配 | `src/config/modules.ts`、供应商包 | 凭据和外部协议 |

邮件直接使用原 Admin 的服务连接与 `/admin/email` 收件箱。收信、人工回复与 AI 客服分开；有模型配置后再单独开启 AI 客服。活动继续使用 `/admin/promo-codes`，分享继续使用原会话分享流程。抽出的 `activities`、`sharing` 规则接回原奖励、内容和权限。

部署清单只是代码可选的一部分。移除模块还需要处理它的 imports、路由注册和 SDK 依赖，并妥善处理已接受的任务及历史数据。当前根应用仍有静态旧代码引用，仅修改清单还不能卸载所有 SDK；不能把这部分宣称为已经完成。

Admin 关闭不删除代码或历史。关闭新订单、发奖、投递或模型请求后，结算、退款、取消和已接受的任务仍应按原规则处理。模块拆分不改变原有商业规则。
