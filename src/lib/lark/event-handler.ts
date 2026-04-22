/**
 * Lark Event Handler
 * 使用官方 SDK EventDispatcher 处理事件回调
 * 同时支持卡片交互回调
 *
 * SDK 实例使用 getter 懒初始化，确保 import 本模块时不触发
 * 任何 env 读取或 SDK 构造，使其在 next build 期间安全。
 */

import type { LarkCard } from './types';
import type { InteractiveCardActionEvent } from '@larksuiteoapi/node-sdk';
import { createLogger } from '../logger';

const logger = createLogger('lark-event');

// ── 类型导出 ──────────────────────────────────────────────────────────────

export interface MessageEventData {
  sender: {
    sender_id: {
      union_id?: string;
      user_id?: string;
      open_id: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    create_time?: string;
    mentions?: Array<{
      key: string;
      id: { open_id: string; user_id?: string; union_id?: string };
      name: string;
    }>;
  };
}

export interface CardActionEventData {
  open_id: string;
  user_id?: string;
  open_message_id: string;
  open_chat_id?: string;
  tenant_key?: string;
  token: string;
  action: {
    value: Record<string, unknown>;
    tag: string;
    option?: string;
    timezone?: string;
  };
}

// ── 纯函数（无副作用，build 安全）──────────────────────────────────────────

export function parseTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text ?? content;
  } catch {
    return content;
  }
}

// ── Handler 注册（覆盖式，非列表订阅）──────────────────────────────────────

let messageHandler: ((data: MessageEventData) => Promise<void> | void) | null = null;
let cardActionHandler: ((data: CardActionEventData) => Promise<LarkCard | void> | LarkCard | void) | null = null;

export function onMessage(handler: (data: MessageEventData) => Promise<void> | void): void {
  messageHandler = handler;
}

export function onCardAction(handler: (data: CardActionEventData) => Promise<LarkCard | void> | LarkCard | void): void {
  cardActionHandler = handler;
}

// ── SDK 实例懒初始化（首次调用 handleEventRequest 时构造）──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _eventDispatcher: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cardDispatcher: any = null;

async function getEventDispatcher() {
  if (!_eventDispatcher) {
    const lark = await import('@larksuiteoapi/node-sdk');
    const { env } = await import('@/env');
    _eventDispatcher = new lark.EventDispatcher({
      encryptKey: env.LARK_ENCRYPT_KEY ?? '',
      verificationToken: env.LARK_VERIFICATION_TOKEN ?? '',
    }).register({
      'im.message.receive_v1': async (data) => {
        const typed = data as MessageEventData;
        logger.info(
          { chatId: typed.message?.chat_id, senderId: typed.sender?.sender_id?.open_id },
          'Message received',
        );
        if (messageHandler) {
          await messageHandler(typed);
        }
      },
    });
  }
  return _eventDispatcher as { invoke(data: unknown): Promise<unknown> };
}

async function getCardDispatcher() {
  if (!_cardDispatcher) {
    const lark = await import('@larksuiteoapi/node-sdk');
    const { env } = await import('@/env');
    _cardDispatcher = new lark.CardActionHandler(
      {
        encryptKey: env.LARK_ENCRYPT_KEY ?? '',
        verificationToken: env.LARK_VERIFICATION_TOKEN ?? '',
      },
      async (data: InteractiveCardActionEvent) => {
        const typed = data as unknown as CardActionEventData;
        logger.info(
          {
            openId: typed.open_id,
            messageId: typed.open_message_id,
            action: typed.action,
          },
          'Card action received',
        );
        if (cardActionHandler) {
          const result = await cardActionHandler(typed);
          if (result) {
            return result as unknown;
          }
        }
        return undefined;
      },
    );
  }
  return _cardDispatcher as { invoke(data: unknown): Promise<unknown> };
}

// ── 请求处理（public API）──────────────────────────────────────────────────

function isCardActionRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  if ('schema' in obj) return false;
  if ('action' in obj) return true;
  return false;
}

export async function handleEventRequest(
  body: unknown,
  headers: Record<string, string>
): Promise<unknown> {
  try {
    const merged = Object.create({ headers }) as Record<string, unknown> & {
      headers: Record<string, string>;
    };
    if (body && typeof body === 'object') {
      Object.assign(merged, body as Record<string, unknown>);
    }

    if (isCardActionRequest(body)) {
      logger.info('Processing as card action request');
      const dispatcher = await getCardDispatcher();
      const result = await dispatcher.invoke(merged);
      return result ?? { success: true };
    }

    const dispatcher = await getEventDispatcher();
    const result = await dispatcher.invoke(merged);
    return result ?? { success: true };
  } catch (error) {
    logger.error({ error }, 'EventDispatcher invoke error');
    return { error: 'internal_error' };
  }
}
