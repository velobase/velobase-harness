import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { createStorageConformance } from "@earendil-works/pi-durable/testing";
import { Pool } from "pg";
import { z } from "zod";
import {
  defineChatTool,
  filterUnsupportedToolCalls,
  getToolName,
  isToolUIPart,
  openPostgresStorage,
  runDurableChat,
  ToolRegistry,
  type PiChatModel,
  type UIMessage,
} from "./index";

function createTestModel() {
  const faux = fauxProvider({
    provider: "faux",
    models: [{ id: "faux-chat" }],
  });
  const models = createModels();
  models.setProvider(faux.provider);
  const model: PiChatModel = {
    provider: "faux",
    modelId: "faux-chat",
    modelRef: { provider: "faux", modelId: "faux-chat" },
    models,
  };
  return { faux, model };
}

void describe("Pi Durable chat runtime", () => {
  void it("should stream a multi-turn response and record usage", async () => {
    const { faux, model } = createTestModel();
    faux.setResponses([
      fauxAssistantMessage("Paris is the capital of France."),
    ]);

    const storage = new MemoryStorage();
    const progressUpdates: UIMessage[] = [];
    let recordedInput = 0;
    let recordedOutput = 0;
    let steps = 0;

    const result = await runDurableChat({
      model,
      storage,
      system: "Be concise.",
      requestId: "req-1",
      assistantMessageId: "msg-assistant-1",
      messages: [
        {
          id: "msg-user-0",
          role: "user",
          parts: [{ type: "text", text: "Hello!" }],
        },
        {
          id: "msg-assistant-0",
          role: "assistant",
          parts: [{ type: "text", text: "Hi there!" }],
        },
        {
          id: "msg-user-1",
          role: "user",
          parts: [{ type: "text", text: "What is the capital of France?" }],
        },
        {
          id: "msg-assistant-1",
          role: "assistant",
          parts: [],
        },
      ],
      onStepStart: () => {
        steps++;
      },
      onStepFinish: ({ usage }) => {
        recordedInput += usage.inputTokens;
        recordedOutput += usage.outputTokens;
      },
      onProgress: (msg) => {
        progressUpdates.push(msg);
      },
    });

    assert.equal(result.finishReason, "stop");
    assert.equal(steps, 1);
    assert.ok(progressUpdates.length >= 1);
    assert.deepEqual(result.message.parts, [
      { type: "text", text: "Paris is the capital of France." },
    ]);
    assert.ok(recordedInput >= 0 && recordedOutput >= 0);
  });

  void it("should execute Zod-validated tools and project tool call and output parts", async () => {
    const { faux, model } = createTestModel();
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            "lookup_doc",
            { title: "Architecture" },
            { id: "call-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([
        fauxText("The Architecture document has 42 lines."),
      ]),
    ]);

    const registry = new ToolRegistry();
    registry.register({
      name: "doc_tools",
      description: "Document lookup tools",
      factory: () => ({
        lookup_doc: defineChatTool({
          description: "Look up document metadata by title",
          inputSchema: z.object({
            title: z.string(),
            includeArchived: z.boolean().default(false),
          }),
          execute: async ({ title, includeArchived }) => ({
            found: true,
            title,
            includeArchived,
            lines: 42,
          }),
        }),
      }),
    });

    const tools = registry.prepare(["doc_tools"], { projectId: "proj-1" });
    const storage = new MemoryStorage();

    const result = await runDurableChat({
      model,
      storage,
      tools,
      toolPolicies: { lookup_doc: "safe" },
      system: "Use lookup_doc when asked about documents.",
      requestId: "req-tool-1",
      assistantMessageId: "msg-assistant-2",
      messages: [
        {
          id: "msg-user-2",
          role: "user",
          parts: [{ type: "text", text: "How many lines in Architecture?" }],
        },
        {
          id: "msg-assistant-2",
          role: "assistant",
          parts: [],
        },
      ],
    });

    assert.equal(result.finishReason, "stop");
    assert.equal(result.message.parts.length, 2);
    const toolPart = result.message.parts[0];
    assert.ok(isToolUIPart(toolPart));
    assert.equal(getToolName(toolPart), "lookup_doc");
    assert.equal(toolPart.state, "output-available");
    assert.deepEqual(toolPart.output, {
      found: true,
      title: "Architecture",
      includeArchived: false,
      lines: 42,
    });
    assert.deepEqual(result.message.parts[1], {
      type: "text",
      text: "The Architecture document has 42 lines.",
    });

    const filtered = filterUnsupportedToolCalls([result.message], []);
    assert.equal(filtered[0]?.parts.length, 1);
  });

  void it("should terminate round early when a tool returns pending: true and resume on continuation", async () => {
    const { faux, model } = createTestModel();
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall(
            "generate_image",
            { prompt: "Sunset" },
            { id: "call-img-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Here is your generated sunset image.")]),
    ]);

    const tools = {
      generate_image: defineChatTool({
        description: "Generate image",
        inputSchema: z.object({ prompt: z.string() }),
        execute: async () => ({
          success: false,
          pending: true,
          task_id: "img-task-1",
        }),
      }),
    };

    const storage = new MemoryStorage();
    const firstAttempt = await runDurableChat({
      model,
      storage,
      tools,
      toolPolicies: { generate_image: "safe" },
      system: "Generate images.",
      requestId: "req-img-1",
      assistantMessageId: "msg-assistant-img",
      messages: [
        {
          id: "msg-user-img",
          role: "user",
          parts: [{ type: "text", text: "Draw a sunset" }],
        },
        {
          id: "msg-assistant-img",
          role: "assistant",
          parts: [],
        },
      ],
    });

    assert.equal(firstAttempt.finishReason, "stop");
    assert.equal(faux.state.callCount, 1);
    assert.equal(firstAttempt.message.parts.length, 1);
    assert.equal(firstAttempt.message.parts[0]?.type, "dynamic-tool");

    // Simulate second attempt after async image task completed
    const restoredAssistant: UIMessage = {
      id: "msg-assistant-img",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "generate_image",
          toolCallId: "call-img-1",
          state: "output-available",
          input: { prompt: "Sunset" },
          output: {
            success: true,
            image_url: "https://example.com/sunset.png",
          },
        },
      ],
    };

    const secondAttempt = await runDurableChat({
      model,
      storage: new MemoryStorage(),
      tools,
      toolPolicies: { generate_image: "safe" },
      system: "Generate images.",
      requestId: "req-img-1",
      assistantMessageId: "msg-assistant-img",
      messages: [
        {
          id: "msg-user-img",
          role: "user",
          parts: [{ type: "text", text: "Draw a sunset" }],
        },
        restoredAssistant,
      ],
    });

    assert.equal(secondAttempt.finishReason, "stop");
    assert.equal(faux.state.callCount, 2);
    assert.equal(secondAttempt.message.parts.length, 2);
    assert.deepEqual(secondAttempt.message.parts[1], {
      type: "text",
      text: "Here is your generated sunset image.",
    });
  });
});

const pgTestUrl = process.env.DATABASE_URL;
if (pgTestUrl) {
  void describe("PostgresStorage Pi Durable conformance", async () => {
    const pool = new Pool({ connectionString: pgTestUrl });
    after(async () => {
      await pool.end();
    });
    const cases = createStorageConformance({
      assertions: {
        ok: (value, message) => assert.ok(value, message),
        strictEqual: (actual, expected) => assert.strictEqual(actual, expected),
        deepEqual: (actual, expected) =>
          assert.deepStrictEqual(actual, expected),
        partialDeepEqual: (actual, expected) => {
          for (const [k, v] of Object.entries(
            expected as Record<string, unknown>,
          )) {
            assert.deepStrictEqual((actual as Record<string, unknown>)[k], v);
          }
        },
        greaterThan: (actual, expected) =>
          assert.ok(actual > expected, `${actual} <= ${expected}`),
        rejects: async (operation, messageIncludes) => {
          await assert.rejects(operation, (err: Error) =>
            err.message.includes(messageIncludes),
          );
        },
      },
      withStorage: async (runWithStorage) => {
        const storage = await openPostgresStorage(pool, {
          sessionId: `conformance:${randomUUID()}`,
        });
        try {
          await runWithStorage(storage);
        } finally {
          await storage.close(BACKGROUND_CONTEXT);
        }
      },
    });

    for (const c of cases) {
      void it(c.name, async () => {
        await c.run();
      });
    }

    void it("persists and resumes a multi-attempt chat run across reopened PostgresStorage instances", async () => {
      const { faux, model } = createTestModel();
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall(
              "generate_image",
              { prompt: "Aurora" },
              { id: "call-pg-1" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        fauxAssistantMessage([fauxText("Aurora image is ready.")]),
      ]);

      const tools = {
        generate_image: defineChatTool({
          description: "Generate image",
          inputSchema: z.object({ prompt: z.string() }),
          execute: async () => ({
            success: false,
            pending: true,
            task_id: "pg-task-1",
          }),
        }),
      };

      const sessionId = `chat-resume:${randomUUID()}`;
      const attempt1 = await runDurableChat({
        model,
        storage: await openPostgresStorage(pool, { sessionId }),
        tools,
        toolPolicies: { generate_image: "safe" },
        system: "Generate images.",
        requestId: "req-pg-1",
        assistantMessageId: "msg-pg-assistant",
        messages: [
          {
            id: "msg-pg-user",
            role: "user",
            parts: [{ type: "text", text: "Draw an aurora" }],
          },
          {
            id: "msg-pg-assistant",
            role: "assistant",
            parts: [],
          },
        ],
      });

      assert.equal(attempt1.finishReason, "stop");
      assert.equal(faux.state.callCount, 1);

      const attempt2 = await runDurableChat({
        model,
        storage: await openPostgresStorage(pool, { sessionId }),
        tools,
        toolPolicies: { generate_image: "safe" },
        system: "Generate images.",
        requestId: "req-pg-1",
        assistantMessageId: "msg-pg-assistant",
        messages: [
          {
            id: "msg-pg-user",
            role: "user",
            parts: [{ type: "text", text: "Draw an aurora" }],
          },
          {
            id: "msg-pg-assistant",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "generate_image",
                toolCallId: "call-pg-1",
                state: "output-available",
                input: { prompt: "Aurora" },
                output: {
                  success: true,
                  image_url: "https://example.com/aurora.png",
                },
              },
            ],
          },
        ],
      });

      assert.equal(attempt2.finishReason, "stop");
      assert.equal(faux.state.callCount, 2);
      assert.equal(attempt2.message.parts.length, 2);
      assert.deepEqual(attempt2.message.parts[1], {
        type: "text",
        text: "Aurora image is ready.",
      });
    });
  });
}
