# 内置功能

内置功能是 `src/server/features/` 中实现的可复用框架能力。

它们不同于：

- 第三方集成：封装外部 API 或 SDK。
- 可插拔模块：订阅事件并可启停。
- 应用能力：界面、服务、Worker 分别放在已有职责目录。

## 功能列表

| 功能             | 用途                                    | 文档                                                 |
| ---------------- | --------------------------------------- | ---------------------------------------------------- |
| Daily Bonus      | 给登录用户发放每日积分                  | [daily-bonus](./daily-bonus/README.md)               |
| Anti-Abuse Guard | 检测注册滥用并回收积分                  | [anti-abuse](./anti-abuse/README.md)                 |
| CDN Adapters     | 统一 CDN/proxy 环境下的 request context | [cdn-adapters](./cdn-adapters/README.md)             |
| 转化告警         | 生成转化报表并通过 Lark 投递            | [conversion-alert](./conversion-alert/README.md)     |
| 客服自动化       | 使用 AI 和审核流程处理客服邮件          | [support-automation](./support-automation/README.md) |
| 用户触达生命周期 | 定时投递用户生命周期触达消息            | [touch](./touch/README.md)                           |

## 规则

- 需要功能时显式调用。
- 策略常量和策略函数应易于 AI 阅读和修改。
- 不要把产品特定策略隐藏在框架通用代码中。
- 如果功能依赖集成，修改前阅读对应集成文档。
