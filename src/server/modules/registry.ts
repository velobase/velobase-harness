import type { AppEventBus } from "@/server/events/bus";
import type { AnyRouter } from "@trpc/server";

export interface FrameworkModule {
  name: string;
  enabled: boolean;

  /** Register event listeners on the shared bus */
  registerEventHandlers?(bus: AppEventBus): void;

  /** Provide a tRPC router to be merged into appRouter */
  getRouter?(): AnyRouter;

  /** Provide a webhook route handler (path relative to /api/) */
  getWebhookHandler?(): {
    path: string;
    handler: (req: Request) => Promise<Response>;
  };

  /** Run one-time init logic at startup */
  onInit?(): Promise<void>;

  /** Frontend metadata (used by dashboard integrations panel) */
  ui?: {
    settingsComponent?: () => Promise<{ default: React.ComponentType }>;
    sidebarItems?: Array<{ label: string; href: string; icon?: string }>;
  };
}
