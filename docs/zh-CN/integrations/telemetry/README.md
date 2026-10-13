# OpenTelemetry 链路追踪

Harness 支持 Next.js Web 服务端、可选 Hono API 和 BullMQ Worker 的链路追踪，
默认关闭。通过 OTLP HTTP/JSON 上报，不包含浏览器 RUM、日志或指标上报。

```dotenv
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_TRACES_SAMPLER_ARG=1
# 可选：按独立部署设置服务名
# OTEL_SERVICE_NAME=my-product-web
# 可选：完整 traces URL，优先于上面的基础地址
# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://collector.example.com/v1/traces
# 可选：值使用百分号编码
# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20token
```

基础地址会追加 `/v1/traces`；Collector 必须支持 OTLP HTTP/JSON。
容器部署时请使用可访问的 Collector 主机名。配置通过 `src/env.js` 校验，修改后重启。
根链路采样比例为 0–1；已有上游链路遵循上游采样决定。

Web 在 Next.js instrumentation 中初始化，API 记录请求 span，队列通过 BullMQ
官方适配器自动传递上下文；Worker 执行 span 与入队 span 保持相同 trace ID。
原生 fetch 自动传递 W3C 上下文；不自动采集 Prisma、Redis、Axios 或原生 http 调用。
新增队列需要配置 `telemetry: queueTelemetry()`，Worker 继续使用统一工厂。

API/Worker 退出时等待队列和请求结束，再刷新追踪数据；Web 由 Next.js 管理生命周期，
信号触发的刷新为尽力而为，强制退出可能丢失尚未上报的 span。

执行 `pnpm test:telemetry` 验证。跨进程队列测试需要本机 `redis-server`，会创建临时实例。
完整服务命名、采集范围和限制见[英文文档](../../../en/integrations/telemetry/README.md)。
