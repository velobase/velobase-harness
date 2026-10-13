import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import { env } from "@/env";

/** Extract remote W3C context without capturing headers, query strings or bodies. */
export const traceApiRequest: MiddlewareHandler = async (c, next) => {
  if (env.OTEL_ENABLED !== "true") return next();
  const parent = propagation.extract(ROOT_CONTEXT, {
    traceparent: c.req.header("traceparent"),
    tracestate: c.req.header("tracestate"),
  });
  await context.with(parent, () =>
    trace.getTracer("harness.api").startActiveSpan(
      `HTTP ${c.req.method}`,
      {
        kind: SpanKind.SERVER,
        attributes: { "http.request.method": c.req.method },
      },
      async (span) => {
        try {
          await next();
          const route = c.req.routePath;
          if (route) {
            span.updateName(`${c.req.method} ${route}`);
            span.setAttribute("http.route", route);
          }
          span.setAttribute("http.response.status_code", c.res.status);
          if (c.error || c.res.status >= 500)
            span.setStatus({ code: SpanStatusCode.ERROR });
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    ),
  );
};
