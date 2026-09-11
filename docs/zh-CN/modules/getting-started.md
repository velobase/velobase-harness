# 启动原来的 Harness

打开 Docker Desktop，在仓库根目录执行：

```sh
docker compose -f compose.demo.yml up --build
```

打开 [Harness](http://localhost:3003)，点击登录，选择 **以本地管理员身份体验 / Explore as local administrator**。启动的是原有首页、登录、Admin 和业务页面，使用原有 Prisma 数据结构与种子数据。数据库、Redis、Web 和 Worker 自动准备。

先看 Admin 的用户、商品，再看功能管理和服务连接。已装模块在 Admin 保留配置与历史入口，关闭后限制新的业务操作。模型、支付、邮箱需要的外部配置单独显示；浏览应用和管理用户、商品不需要模型密钥。

按 Ctrl+C 停止，数据库和会话密钥保存在本地 Docker 卷。体验命令只对隔离的本地数据库执行 `prisma db push`，没有重置或允许丢失数据的参数。正常部署继续使用原有迁移与认证；体验登录仅在开发模式和本机 HTTP 地址下注册。

日常源码开发使用根目录 `.env.example`、PostgreSQL/Redis 和 `pnpm dev:all`，仍然是同一个应用。继续看[模块目录](./catalog.md)和[组合方式](./composition.md)。
