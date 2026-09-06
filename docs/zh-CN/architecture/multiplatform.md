# 多平台工作区

Velobase Harness 现在提供 Web、Desktop 和 Mobile 三个应用宿主，以及 API、Worker
两个后台进程边界。Android 和 iOS 共用一套 Expo 代码。首个共享能力是现有公开健康检查
API：Web `/status`、桌面端和移动端通过同一个类型化客户端访问它。

```text
apps/web/              Next 配置、根布局/首页、状态页、Web 适配器
apps/desktop/          Electron main -> 受限 preload -> 本地 renderer
apps/mobile/           Expo Android + iOS、原生 UI、网络与配置适配器
packages/contracts/   平台无关的 Zod schema 和接口类型
packages/api-client/  注入 transport 的类型化客户端
services/api/          可选 Hono 进程入口
services/worker/       BullMQ 进程入口
src/                   现有框架实现与兼容入口
```

## 兼容性与归属

这是渐进式拆分。Next 仍从仓库根目录运行，`src/app` 保留路由表；根布局、首页和健康
检查入口委托给 `apps/web`。现有 URL、`@/*`、public、messages、Prisma 配置/迁移、
`.next/standalone/server.js` 和 Docker 入口路径保持兼容。Web 组装归 `apps/web`
所有，迁移期间可引用 `src` 中的既有实现；Web 尚未成为可独立安装的应用包。

API/Worker 进程入口迁到 `services`，原 `src/api/index.ts`、`src/workers/index.ts`
继续转发。启动函数、路由、队列处理器和业务服务保留在 `src`，不改变执行行为。
组合启动器和默认 `SERVICE_MODE=web,worker` 保持不变，Hono 仍然按需启用。

目录边界、注入式客户端、Electron 隔离桥与 Expo 配置归属参考了固定版本的 VeloAgent；
没有复制私有产品功能、品牌或认证协议。平台依据见
[Electron 安全文档](https://www.electronjs.org/docs/latest/tutorial/security) 和
[Expo monorepo 文档](https://docs.expo.dev/guides/monorepos/)。

## 运行与验证

全平台开发使用 Node 22.13+（推荐 22 LTS）和固定 pnpm 10.12.1；现有 Web/Server
Node 20 部署镜像继续保留。

```bash
pnpm install --frozen-lockfile
pnpm dev:web                         # 兼容 pnpm dev，访问 /status
pnpm dev:desktop                     # 默认连接 http://localhost:3000
VELOBASE_MOBILE_ENV=development \
VELOBASE_MOBILE_API_ORIGIN=http://192.168.1.10:3000 pnpm dev:mobile
```

移动端必须指定设备可访问的服务器 origin。真机 localhost 指向手机本身，应使用电脑
局域网地址或 HTTPS 隧道。只有 development 配置允许 HTTP；生产配置必须 HTTPS。
部分原生开发构建还需要平台明文网络配置，因此真机测试优先使用 HTTPS。

桌面主进程读取 `VELOBASE_DESKTOP_API_ORIGIN`：开发默认 loopback HTTP，打包后必须
明确指定 HTTPS 地址，例如
`VELOBASE_DESKTOP_API_ORIGIN=https://your-app.example.com ./apps/desktop/out/Velobase-linux-x64/Velobase`。
桌面不自动读取根 `.env`。Expo 只把 `extra.apiOrigin` 写入公开配置，移动应用通过
`expo-constants` 读取。两个客户端都不导入 `src/env.js`；根 `.env.example` 记录配置项，
环境检查明确识别各平台独立校验边界。

```bash
pnpm check
pnpm test:existing                   # Node 22 module mocks 与既有 Redis build stub
pnpm check:architecture
pnpm check:packages
pnpm test:platforms
pnpm check:api && pnpm check:worker
pnpm check:desktop && pnpm package:desktop
pnpm check:mobile
VELOBASE_MOBILE_API_ORIGIN=https://example.com pnpm config:mobile
VELOBASE_MOBILE_API_ORIGIN=https://example.com pnpm build:mobile
SKIP_ENV_VALIDATION=true pnpm build:web
```

`build:desktop` 编译 main/preload/renderer，并在无显示环境验证编译后的 IPC 桥；
`package:desktop` 打包当前宿主平台（CI 为 Linux）。`build:mobile` 使用 Metro 导出
Android 和 iOS JavaScript，不生成 APK/AAB/IPA，也不代表真机测试。安装对应工具链后，
可运行 `pnpm --filter @velobase/mobile android` 或 `ios`。产品发布前需配置自己的
bundle ID、签名、图标和分发方式。

## 增加跨平台能力

1. 在 `packages/contracts` 定义向后兼容的输入/输出 schema，禁止 Node、DOM、React、
   Next、Prisma 和平台全局对象。
2. 在 `packages/api-client` 添加操作及成功/错误测试；宿主负责网络、取消与凭据处理。
3. 在既有框架服务或产品模块实现服务端行为，Web 提供薄 HTTP 入口。只有明确需要独立
   HTTP 服务时才启用 Hono。服务端和客户端共用契约。
4. 各平台添加 UI 和适配器。桌面只暴露逐项校验的 preload 方法，检查 IPC 来源帧，
   网络和 Node 能力留在 main；移动端只引用平台中立包和自身平台能力。
5. 运行边界、契约/客户端测试及受影响平台构建。

当前健康检查公开且不发送凭据。Web NextAuth 行为保持不变，本次不提供原生登录或
token 签发。需要登录时，应增加经过设计的服务端协议和平台安全存储适配器，不要复制
浏览器 cookie、把 NextAuth 导入移动端，或在 renderer state/local storage 保存 token。

架构测试检查依赖方向、相对路径、重新导出/动态导入、renderer 隔离，以及 API/Worker
完整本地依赖图中的 Next 专属引用。中立包只使用 ES 类型库，禁用 Node/DOM ambient
types；桌面构建还检查实际打包依赖，防止服务端代码泄漏。

PR 继续以 Web 生产构建作为门禁，部署前校验 Web。
`multiplatform-check.yml` 在 Linux 检查共享包、后台入口、Electron 打包和两端 Expo
导出。Docker 先复制中立包再冻结安装，只安装根服务端依赖闭包；`tsx`、Prisma 已成为
锁定的运行时依赖，镜像构建不再执行 `pnpm add`。
