# 部署到 Velobase Cloud

本文是 Velobase Harness 的中文部署入口。

使用 Velobase Cloud CLI 完成项目初始化、Cloud 适配、部署检查和运维操作。

## 1. 安装 CLI

```bash
npm install -g @velobaseai/cloud-cli@latest
```

CLI 命令是 `velobase-cloud`。

## 2. 登录并连接 GitHub

```bash
velobase-cloud login
velobase-cloud github connect
```

CLI 使用浏览器登录，并把本地凭证保存到 `~/.velobase-cloud/`。

查看项目额度和付费状态：

```bash
velobase-cloud billing
```

Velobase Cloud 使用 project/month 模型。每个初始化后的项目会消耗一个项目额度，并获得独立 PostgreSQL、独立 Redis 和 App 计算资源预算。新账号可用免费试用额度；额度不足时，CLI 会提示进入付费页面购买项目额度。

## 3. 初始化项目

在 Harness 仓库根目录运行：

```bash
velobase-cloud init
```

`init` 会扫描项目、识别 Velobase Harness、消耗一个可用项目额度，创建 Cloud project 和独立基础设施，写入 `.github/workflows/deploy-velobase.yml`、尽可能配置 GitHub secrets，并把项目绑定信息保存到 `.velobase/config.json`。

## 4. 适配 Cloud

- 使用 `pnpm install` 安装依赖。
- 根据 `.env.example` 配置 `.env`。
- 确认 database、Redis、auth 和必需 provider keys 可用。
- 执行 `docs/zh-CN/ai/completion-checklist.md` 中的相关检查。

生成 AI 部署适配上下文：

```bash
velobase-cloud adapt
```

该命令会写入 `.velobase/ai-prompt.md`。在 IDE 中打开它，让本地 AI 按 Cloud 约束调整项目。

## 5. 选择 Runtime Mode

使用 `SERVICE_MODE`：

- `web,worker` 用于默认组合 runtime，不启用可选 API 服务。
- `web` 和 `worker` 用于生产拆分部署。
- `api` 仅在新增真实 Hono routes 且需要独立服务后使用。
- `all` 用于明确希望 Web、API 和 Worker 在同一进程中启动的场景。
- 需要时使用 `web,api` 等逗号分隔组合。

详见 `docs/zh-CN/architecture/web-api-service-split.md`。

## 6. 验证

部署前：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

如果 schema 变更，确认 migrations 已提交，线上使用 `prisma migrate deploy`。

然后运行 CLI readiness check：

```bash
velobase-cloud doctor
```

`doctor` 会检查 Dockerfile、端口 `3000`、health endpoint、migration setup、workflow、secrets 和环境变量校验等部署要求。

## 7. 部署

默认部署路径是 GitHub Actions：

```bash
git push origin main
```

也可以通过 CLI 触发部署：

```bash
velobase-cloud deploy trigger --branch main --watch
```

切换部署模式时，需要确认当前启用的 GitHub Actions workflow：

- 单服务部署使用 `.github/workflows/deploy-velobase.yml`。它构建一个统一镜像，并把默认 App 预算分配给 `app` 服务。
- 多服务部署使用 `.github/workflows/deploy-velobase-multi.yml`。它默认构建并部署 `web`、`worker` 服务，并把 App 预算平均分配给这两个服务。
- 同一时间只保留一个部署 workflow 监听 `main` 分支的 `push`。另一个 workflow 应禁用、移除 `push` 触发，或只保留 `workflow_dispatch`，避免一次提交触发重复部署。

Deploy API 要求每个服务显式声明 `cpu_request`、`memory_request`、`cpu_limit` 和 `memory_limit`。默认 App 预算是 `970m` CPU 和 `2355Mi` 内存；双服务模板默认每个服务 `485m` 和 `1177Mi`，并使用 `request == limit`。如需调整资源，修改 workflow 中对应服务的资源字段，但所有服务 request 之和必须不超过项目 App 预算。

默认多服务部署是 Web + Worker，`exposed_service` 设置为 `web`。只有在独立 Hono routes 已启用时才增加 API 服务；此时在 services 中加入 `mode: "api"`、`port: 3002` 的 API 条目，并重新把 App 预算分配给 Web、API 和 Worker。除非主域名（`{subdomain}.velobase.app`）确实要直接路由到 API，否则 `exposed_service` 仍保持 `web`。

## 8. 运维

使用 CLI 查看状态、部署记录、日志、环境变量和回滚：

```bash
velobase-cloud status
velobase-cloud deploy runs
velobase-cloud logs deploy
velobase-cloud logs pods
velobase-cloud env list
velobase-cloud billing
velobase-cloud deploy rollback <deployment-id>
```

- 检查 Web 和 Worker health endpoints。只有启用可选 API 服务时才检查 API health。
- 如果命令返回 `PROJECT_OVERDUE`，先恢复项目订阅，再部署或应用环境变量变更。
- 从日志确认必需模块已初始化。
- 生产问题先收集 Cloud runtime logs，再按 `docs/zh-CN/debugging/online-local-debug.md` 排查。
