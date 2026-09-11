import { z } from "zod";

export const sharingFeature = {
  id: "sharing",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
} as const;

export const shareInput = z.object({ id: z.string().min(1).max(256) });
export const listSharesInput = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export interface Publication {
  id: string;
  isShared: boolean | null;
}
export class SharingError extends Error {
  constructor(public readonly code: "UNAVAILABLE" | "NOT_FOUND") {
    super(
      code === "UNAVAILABLE" ? "Sharing is unavailable" : "Content not found",
    );
  }
}
/** Content storage owns atomic, owner-scoped writes. No content payload or AI types enter this package. */
export interface SharingRepository<T extends Publication> {
  setPublication(
    id: string,
    ownerId: string | undefined,
    sharedAt: Date | null,
  ): Promise<boolean>;
  listPublished(
    input: z.output<typeof listSharesInput>,
  ): Promise<{ items: T[]; nextCursor?: string }>;
}
export function createSharing<T extends Publication>(options: {
  repository: SharingRepository<T>;
  isEnabled(): Promise<boolean>;
}) {
  async function setPublication(
    input: unknown,
    ownerId: string | undefined,
    sharedAt: Date | null,
  ) {
    const { id } = shareInput.parse(input);
    if (!(await options.repository.setPublication(id, ownerId, sharedAt)))
      throw new SharingError("NOT_FOUND");
  }
  return {
    async publish(input: unknown, ownerId: string) {
      z.string().min(1).parse(ownerId);
      if (!(await options.isEnabled())) throw new SharingError("UNAVAILABLE");
      await setPublication(input, ownerId, new Date());
    },
    async revoke(input: unknown, ownerId: string) {
      z.string().min(1).parse(ownerId);
      await setPublication(input, ownerId, null);
    },
    /** Host authenticates an administrator before calling these operations. */
    async revokeAsAdmin(input: unknown) {
      await setPublication(input, undefined, null);
    },
    async listForAdmin(input: unknown) {
      return options.repository.listPublished(listSharesInput.parse(input));
    },
    async isPublic(publication: Pick<Publication, "isShared">) {
      return Boolean(publication.isShared && (await options.isEnabled()));
    },
  };
}
