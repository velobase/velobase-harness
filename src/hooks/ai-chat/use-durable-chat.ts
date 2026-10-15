"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatUIMessage } from "@/types/ai-chat/message";

type RunView = {
  id: string;
  status: string;
  errorCode: string | null;
  usageUncertain: boolean;
  assistantMessageId: string;
};
type Snapshot = { run: RunView | null; messages: ChatUIMessage[] };
type SendOptions = { body?: Record<string, unknown> };
type Input = {
  text?: string;
  parts?: ChatUIMessage["parts"];
  messageId?: string;
  requestId?: string;
};
const active = new Set(["QUEUED", "RUNNING", "SUSPENDED"]);

async function readResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error((body as { error?: string }).error ?? "REQUEST_FAILED");
  return body as T;
}

/** Observation can unmount/reconnect without controlling Worker lifetime. */
export function useDurableChat(options: {
  id?: string;
  enabled?: boolean;
  agent: () => { agentId?: string; userAgentId?: string };
  onFinish?: (event: {
    message: ChatUIMessage;
    messages: ChatUIMessage[];
  }) => void;
}) {
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [status, setStatus] = useState<
    "ready" | "submitted" | "streaming" | "error"
  >("ready");
  const [error, setError] = useState<Error>();
  const [run, setRun] = useState<RunView | null>(null);
  const callbacks = useRef(options);
  callbacks.current = options;
  const generation = useRef(0);
  const completed = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const requestVersion = useRef(0);
  const observedActive = useRef(false);
  const pending = useRef<
    { id: string; body: Record<string, unknown> } | undefined
  >(undefined);

  const refresh = useCallback(async (id: string, currentGeneration: number) => {
    const version = requestVersion.current;
    const snapshot = await readResponse<Snapshot>(
      await fetch(`/api/chat/${encodeURIComponent(id)}/run`, {
        cache: "no-store",
      }),
    );
    if (
      generation.current !== currentGeneration ||
      version !== requestVersion.current
    )
      return;
    observedActive.current = !!snapshot.run && active.has(snapshot.run.status);
    if (snapshot.run?.status !== "FAILED" && !pending.current)
      setError(undefined);
    setMessages(snapshot.messages);
    setRun(snapshot.run);
    const current = snapshot.run;
    if (current && active.has(current.status)) {
      setStatus(current.status === "RUNNING" ? "streaming" : "submitted");
    } else {
      setStatus(current?.status === "FAILED" ? "error" : "ready");
      if (current?.status === "FAILED")
        setError(new Error(current.errorCode ?? "EXECUTION_FAILED"));
      if (current?.status === "SUCCEEDED" && completed.current !== current.id) {
        completed.current = current.id;
        const message = snapshot.messages.find(
          (message) => message.id === current.assistantMessageId,
        );
        if (message)
          callbacks.current.onFinish?.({
            message,
            messages: snapshot.messages,
          });
      }
    }
  }, []);

  useEffect(() => {
    generation.current++;
    const current = generation.current;
    completed.current = undefined;
    setRun(null);
    setMessages([]);
    setError(undefined);
    setStatus("ready");
    const id = options.id;
    if (!id || options.enabled === false) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!inFlight.current) await refresh(id, current);
      } catch (error) {
        if (!disposed)
          setError(
            error instanceof Error ? error : new Error("OBSERVATION_FAILED"),
          );
      }
      if (!disposed)
        timer = setTimeout(
          () => {
            void poll();
          },
          observedActive.current ? 1000 : 5000,
        );
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      generation.current = current + 1;
    };
  }, [options.id, options.enabled, refresh]);

  const submit = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      requestVersion.current++;
      pending.current = { id, body };
      setError(undefined);
      setStatus("submitted");
      try {
        await readResponse<{ runId: string }>(
          await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        pending.current = undefined;
        await refresh(id, generation.current);
      } catch (error) {
        setError(error instanceof Error ? error : new Error("REQUEST_FAILED"));
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [refresh],
  );

  const sendMessage = useCallback(
    async (input: Input, overrides?: SendOptions) => {
      const id =
        typeof overrides?.body?.id === "string"
          ? overrides.body.id
          : callbacks.current.id;
      if (!id) return;
      await submit(id, {
        id,
        requestId: input.requestId ?? crypto.randomUUID(),
        trigger: "submit-message",
        message: {
          parts: input.parts ?? [{ type: "text", text: input.text ?? "" }],
        },
        messageId: input.messageId,
        ...callbacks.current.agent(),
        ...overrides?.body,
      });
    },
    [submit],
  );
  const regenerate = useCallback(
    async (input: { messageId: string; body?: Record<string, unknown> }) => {
      const id = callbacks.current.id;
      if (id)
        await submit(id, {
          id,
          requestId: crypto.randomUUID(),
          trigger: "regenerate-message",
          messageId: input.messageId,
          ...callbacks.current.agent(),
          ...input.body,
        });
    },
    [submit],
  );
  const retry = useCallback(async () => {
    const input = pending.current;
    if (input) await submit(input.id, input.body);
  }, [submit]);
  const stop = useCallback(async () => {
    const id = callbacks.current.id;
    if (!id || !run) return;
    try {
      await readResponse(
        await fetch(`/api/chat/${encodeURIComponent(id)}/run`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: run.id }),
        }),
      );
      await refresh(id, generation.current);
    } catch (error) {
      setError(error instanceof Error ? error : new Error("REQUEST_FAILED"));
    }
  }, [run, refresh]);
  const clearError = useCallback(() => setError(undefined), []);
  return {
    messages,
    setMessages,
    status,
    error,
    clearError,
    sendMessage,
    regenerate,
    stop,
    retry,
    canRetry: !!pending.current,
    run,
  };
}
