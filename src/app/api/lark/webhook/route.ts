/**
 * Lark 事件回调 API
 * 配置回调地址: https://example.com/api/lark/webhook
 *
 * 同时处理：
 * 1. 消息事件（im.message.receive_v1）
 * 2. 卡片交互事件（按钮点击）
 *
 * handler 注册在 src/server/init.ts（由 instrumentation.ts 启动时调用），
 * route 文件只负责 HTTP 解析 + 分发，零业务逻辑、零顶层副作用。
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const logger = createLogger('lark-webhook');

export async function POST(req: NextRequest) {
  try {
    const { handleEventRequest } = await import('@/lib/lark/event-handler');
    const body: unknown = await req.json();
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const result = await handleEventRequest(body, headers);
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to handle Lark webhook');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
