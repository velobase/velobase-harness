import {
  conversationSharing,
  sharingOperation,
} from "@/modules/sharing/server/service";
import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";

// Import services from ai-chat module
import { buildUIProjection, loadUIInteractions } from "@/modules/ai-chat";

export const conversationRouter = createTRPCRouter({
  // List conversations (can filter by projectId)
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        // archived filter: undefined = all, true = only archived, false = only active
        archived: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Build where clause
      const where: Prisma.ConversationWhereInput = {
        userId: ctx.session.user.id,
      };

      // Filter by archived status if specified
      if (input.archived !== undefined) {
        where.isArchived = input.archived;
      }

      // Filter by projectId if provided (using direct foreign key)
      if (input.projectId) {
        where.projectId = input.projectId;
      }

      return ctx.db.conversation.findMany({
        where,
        orderBy: {
          updatedAt: "desc",
        },
        take: input.limit,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          createdAt: true,
          metadata: true,
          isArchived: true,
          projectId: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }),

  // Get a single conversation with messages (returns CustomUIMessage format)
  // Public procedure to support guest conversations and shared conversations
  get: publicProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const session = ctx.session;
      const isGuest = !session?.user;

      // Fetch conversation with user info
      const conversation = await ctx.db.conversation.findUnique({
        where: {
          id: input.conversationId,
        },
        include: {
          interactions: {
            orderBy: {
              createdAt: "asc",
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      if (!conversation) {
        return null;
      }

      // Verify access permissions
      const conversationIsGuest = conversation.isGuest ?? false;
      const conversationIsShared =
        await conversationSharing.isPublic(conversation);

      if (isGuest) {
        // Guest can access: guest conversations OR shared conversations
        if (!conversationIsGuest && !conversationIsShared) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You don't have permission to access this conversation.",
          });
        }
      } else {
        // Logged-in user can access:
        // - Their own conversations
        // - Shared conversations (from others)
        const isOwner = conversation.userId === session.user.id;

        if (!isOwner && !conversationIsShared) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You don't have permission to access this conversation.",
          });
        }
      }

      // Transform interactions to UI messages on the server
      // Pass activeInteractionId to build the correct branch/path
      const messages = buildUIProjection(
        conversation.interactions,
        conversation.activeInteractionId,
      );

      return {
        id: conversation.id,
        title: conversation.title,
        metadata: conversation.metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        activeInteractionId: conversation.activeInteractionId,
        isShared: conversationIsShared,
        sharedAt: conversation.sharedAt ?? null,
        isGuest: conversation.isGuest ?? false,
        userId: conversation.userId,
        owner: conversation.user
          ? {
              id: conversation.user.id,
              name: conversation.user.name,
              image: conversation.user.image,
            }
          : null,
        messages,
      };
    }),

  // Create a new conversation (logged-in users)
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
        projectId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.conversation.create({
        data: {
          userId: ctx.session.user.id,
          isGuest: false,
          title: input.title,
          projectId: input.projectId,
          metadata: input.metadata
            ? (input.metadata as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
    }),

  // Create a guest conversation (unauthenticated users)
  createGuest: publicProcedure
    .input(
      z.object({
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx }) => {
      return ctx.db.conversation.create({
        data: {
          userId: null,
          isGuest: true,
          title: "New conversation",
        },
      });
    }),

  // Delete a conversation
  delete: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.conversation.delete({
        where: {
          id: input.conversationId,
          userId: ctx.session.user.id,
        },
      });
      return { success: true };
    }),

  // Update conversation title
  updateTitle: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        title: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await ctx.db.conversation.update({
        where: {
          id: input.conversationId,
          userId: ctx.session.user.id,
        },
        data: {
          title: input.title,
        },
      });
      return { success: true, title: conversation.title };
    }),

  // Archive a conversation
  archive: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.conversation.update({
        where: {
          id: input.conversationId,
          userId: ctx.session.user.id,
        },
        data: {
          isArchived: true,
        },
      });
      return { success: true };
    }),

  // Unarchive a conversation
  unarchive: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.conversation.update({
        where: {
          id: input.conversationId,
          userId: ctx.session.user.id,
        },
        data: {
          isArchived: false,
        },
      });
      return { success: true };
    }),

  // Get messages for a conversation
  /**
   * @deprecated Use `conversation.get` which returns conversation info with messages.
   * This endpoint is kept for backward compatibility and may be removed later.
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify conversation ownership
      const conversation = await ctx.db.conversation.findUnique({
        where: {
          id: input.conversationId,
          userId: ctx.session.user.id,
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Load UI interactions for the conversation
      return loadUIInteractions(input.conversationId);
    }),

  // Share a conversation (make it publicly accessible)
  share: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await sharingOperation(() =>
        conversationSharing.publish(
          { id: input.conversationId },
          ctx.session.user.id,
        ),
      );
      return { success: true };
    }),

  // Unshare a conversation (revoke public access)
  unshare: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await sharingOperation(() =>
        conversationSharing.revoke(
          { id: input.conversationId },
          ctx.session.user.id,
        ),
      );
      return { success: true };
    }),

  // Fork a shared conversation to your own account
  fork: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Get original conversation (must be shared)
      const original = await ctx.db.conversation.findUnique({
        where: { id: input.conversationId },
        include: {
          interactions: {
            include: {
              userAgent: {
                include: {
                  agent: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      if (!original) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const originalIsShared = await conversationSharing.isPublic(original);
      if (!originalIsShared) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot fork non-shared conversation",
        });
      }

      // 2. Collect all unique agents used in the conversation
      const agentIds = new Set<string>();
      for (const interaction of original.interactions) {
        if (interaction.userAgent?.agentId) {
          agentIds.add(interaction.userAgent.agentId);
        }
      }

      // 3. Check if user has all required agents installed
      const missingAgents: Array<{ id: string; name: string }> = [];
      for (const agentId of agentIds) {
        const userAgent = await ctx.db.userAgent.findUnique({
          where: {
            userId_agentId: {
              userId: ctx.session.user.id,
              agentId: agentId,
            },
          },
          include: {
            agent: true,
          },
        });

        if (!userAgent) {
          // Find agent info for error message
          const agent = await ctx.db.agent.findUnique({
            where: { id: agentId },
          });
          if (agent) {
            missingAgents.push({ id: agent.id, name: agent.name });
          }
        }
      }

      // If any agents are missing, return error with agent info
      if (missingAgents.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AGENT_NOT_INSTALLED",
          cause: {
            missingAgents,
          },
        });
      }

      // 4. Create new conversation for current user
      const forked = await ctx.db.conversation.create({
        data: {
          userId: ctx.session.user.id,
          title: original.title
            ? `${original.title} (forked)`
            : "Forked conversation",
          isGuest: false,
          isShared: false,
          metadata: original.metadata as Prisma.InputJsonValue,
        },
      });

      // 5. Copy all interactions
      // Note: userAgentId is set to undefined, will be populated when user continues the conversation
      await ctx.db.interaction.createMany({
        data: original.interactions.map((int) => ({
          conversationId: forked.id,
          type: int.type,
          parts: int.parts as Prisma.InputJsonValue,
          metadata: int.metadata as Prisma.InputJsonValue,
          correlationId: int.correlationId,
          parentId: int.parentId,
          userAgentId: undefined, // Clear userAgentId for forked conversation
        })),
      });

      return {
        success: true,
        conversationId: forked.id,
        conversation: forked,
      };
    }),
});
