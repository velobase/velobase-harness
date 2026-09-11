import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FeatureDefinition } from "@velobase/module-runtime";

export const outreachFeature = {
  id: "touch",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
  href: "/admin/touches",
  connection: "email",
} as const satisfies FeatureDefinition;
const id = z.string().min(1).max(256);
export const sceneInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,100}$/),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  isActive: z.boolean().default(false),
});
export const templateInput = z.object({
  id: id.optional(),
  sceneKey: id,
  name: z.string().trim().min(1).max(100),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !/[\r\n]/.test(value)),
  text: z.string().trim().min(1).max(100000),
  html: z.string().max(200000).optional(),
});
export const scheduleInput = z.object({
  sceneKey: id,
  templateId: id,
  recipientId: id,
  requestId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
  variables: z.record(z.string().max(10000)).default({}),
});
export const pageInput = z.object({
  cursor: id.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type Scene = z.output<typeof sceneInput>;
export type Template = Omit<z.output<typeof templateInput>, "id"> & {
  id: string;
};
export type Recipient = { id: string; email: string; allowed: boolean };
export const snapshotSchema = z.object({
  recipientId: id,
  to: z.string().email(),
  templateId: id,
  subject: z.string(),
  text: z.string(),
  html: z.string().optional(),
});
export type Snapshot = z.output<typeof snapshotSchema>;
export type Schedule = {
  id: string;
  sceneKey: string;
  requestId: string;
  scheduledAt: Date;
  snapshot: Snapshot;
  status: "PENDING" | "PROCESSING" | "SENT" | "CANCELLED" | "UNKNOWN";
  updatedAt: Date;
};
export type Page<T> = { items: T[]; nextCursor?: string };
export interface OutreachRepository {
  saveScene(data: Scene): Promise<Scene>;
  getScene(key: string): Promise<Scene | null>;
  listScenes(page: z.output<typeof pageInput>): Promise<Page<Scene>>;
  saveTemplate(data: Template): Promise<Template>;
  getTemplate(id: string): Promise<Template | null>;
  listTemplates(
    sceneKey: string,
    page: z.output<typeof pageInput>,
  ): Promise<Page<Template>>;
  createSchedule(data: Schedule): Promise<Schedule>;
  listSchedules(page: z.output<typeof pageInput>): Promise<Page<Schedule>>;
  due(limit: number): Promise<Schedule[]>;
  claim(id: string, token: string): Promise<boolean>;
  release(id: string, token: string): Promise<void>;
  cancel(id: string): Promise<boolean>;
  recoverInterrupted(before: Date): Promise<void>;
  finish(
    id: string,
    token: string,
    result: {
      status: "SENT" | "UNKNOWN";
      provider?: string;
      messageId?: string;
    },
  ): Promise<void>;
}
export class OutreachError extends Error {
  constructor(
    public readonly code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}
function render(
  source: string,
  variables: Record<string, string>,
  html = false,
) {
  return source.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in variables))
      throw new OutreachError(
        "BAD_REQUEST",
        `Missing template variable: ${key}`,
      );
    const value = variables[key]!;
    return html
      ? value.replace(
          /[&<>"']/g,
          (char) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[char]!,
        )
      : value;
  });
}
/** Importing this entry does not import SMTP, Core, Next or a database client. */
export function createOutreach(options: {
  repository: OutreachRepository;
  isEnabled(): Promise<boolean>;
  recipient(id: string): Promise<Recipient | null>;
  deliver(
    snapshot: Snapshot,
    messageId: string,
  ): Promise<{ provider: string; messageId: string }>;
}) {
  const store = options.repository;
  async function requireEnabled() {
    if (!(await options.isEnabled()))
      throw new OutreachError("NOT_FOUND", "Outreach is unavailable");
  }
  return {
    async saveScene(input: unknown) {
      return store.saveScene(sceneInput.parse(input));
    },
    async listScenes(input: unknown = {}) {
      return store.listScenes(pageInput.parse(input));
    },
    async saveTemplate(input: unknown) {
      const parsed = templateInput.parse(input);
      if (!(await store.getScene(parsed.sceneKey)))
        throw new OutreachError("NOT_FOUND", "Scene not found");
      return store.saveTemplate({ ...parsed, id: parsed.id ?? randomUUID() });
    },
    async listTemplates(sceneKey: string, input: unknown = {}) {
      return store.listTemplates(id.parse(sceneKey), pageInput.parse(input));
    },
    async listSchedules(input: unknown = {}) {
      await store.recoverInterrupted(new Date(Date.now() - 5 * 60_000));
      return store.listSchedules(pageInput.parse(input));
    },
    async schedule(input: unknown) {
      const parsed = scheduleInput.parse(input);
      await requireEnabled();
      const [scene, template, recipient] = await Promise.all([
        store.getScene(parsed.sceneKey),
        store.getTemplate(parsed.templateId),
        options.recipient(parsed.recipientId),
      ]);
      if (!scene?.isActive || !template || template.sceneKey !== scene.key)
        throw new OutreachError(
          "BAD_REQUEST",
          "Choose an active scene and its template",
        );
      if (
        !recipient?.allowed ||
        !z.string().email().safeParse(recipient.email).success
      )
        throw new OutreachError("BAD_REQUEST", "Recipient is unavailable");
      const subject = render(template.subject, parsed.variables);
      if (/[\r\n]/.test(subject))
        throw new OutreachError("BAD_REQUEST", "Subject must have one line");
      const snapshot: Snapshot = {
        recipientId: recipient.id,
        to: recipient.email,
        templateId: template.id,
        subject,
        text: render(template.text, parsed.variables),
        ...(template.html
          ? { html: render(template.html, parsed.variables, true) }
          : {}),
      };
      const data: Schedule = {
        id: `${Date.now().toString().padStart(16, "0")}-${randomUUID()}`,
        requestId: parsed.requestId,
        sceneKey: scene.key,
        scheduledAt: new Date(parsed.scheduledAt),
        snapshot,
        status: "PENDING",
        updatedAt: new Date(),
      };
      const stored = await store.createSchedule(data);
      if (
        stored.sceneKey !== data.sceneKey ||
        stored.scheduledAt.getTime() !== data.scheduledAt.getTime() ||
        JSON.stringify(snapshotSchema.parse(stored.snapshot)) !==
          JSON.stringify(snapshotSchema.parse(snapshot))
      )
        throw new OutreachError(
          "CONFLICT",
          "Request identity already belongs to another delivery",
        );
      return stored;
    },
    async cancel(input: unknown) {
      const parsed = z.object({ id }).parse(input);
      if (!(await store.cancel(parsed.id)))
        throw new OutreachError(
          "CONFLICT",
          "Only pending deliveries can be canceled",
        );
    },
    async processDue(limit = 20) {
      z.number().int().min(1).max(100).parse(limit);
      if (!(await options.isEnabled())) return { processed: 0 };
      // A crashed sender may already have reached SMTP. Never automatically resend it.
      await store.recoverInterrupted(new Date(Date.now() - 5 * 60_000));
      const due = await store.due(limit);
      let processed = 0;
      for (const schedule of due) {
        if (!(await options.isEnabled())) break;
        const [scene, recipient] = await Promise.all([
          store.getScene(schedule.sceneKey),
          options.recipient(schedule.snapshot.recipientId),
        ]);
        if (
          !scene?.isActive ||
          !recipient?.allowed ||
          recipient.email.toLowerCase() !== schedule.snapshot.to.toLowerCase()
        ) {
          await store.cancel(schedule.id);
          continue;
        }
        const token = randomUUID();
        if (!(await store.claim(schedule.id, token))) continue;
        if (!(await options.isEnabled())) {
          await store.release(schedule.id, token);
          break;
        }
        try {
          const result = await options.deliver(
            schedule.snapshot,
            `<outreach-${schedule.id}@harness.local>`,
          );
          await store.finish(schedule.id, token, { status: "SENT", ...result });
        } catch {
          await store.finish(schedule.id, token, { status: "UNKNOWN" });
        }
        processed++;
      }
      return { processed };
    },
  };
}
