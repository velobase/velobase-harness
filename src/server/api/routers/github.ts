import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { env } from "@/env";

/**
 * GitHub Integration Router
 * 
 * Manages GitHub OAuth connections and repository access
 */
export const githubRouter = createTRPCRouter({
  // Get GitHub connection status
  getConnection: protectedProcedure.query(async ({ ctx }) => {
    const connection = await ctx.db.gitHubConnection.findUnique({
      where: { userId: ctx.session.user.id },
    });

    if (!connection) {
      return { connected: false };
    }

    return {
      connected: true,
      githubUsername: connection.githubUsername,
      connectedAt: connection.createdAt,
    };
  }),

  // Get GitHub OAuth authorization URL
  getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
    const baseUrl = env.APP_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/auth/github/callback`;
    
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: 'repo',
      state: ctx.session.user.id, // Simple state - in production, use random token
    });

    return {
      authUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
    };
  }),

  // Disconnect GitHub
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.gitHubConnection.delete({
      where: { userId: ctx.session.user.id },
    });

    return { success: true };
  }),

  // List user's GitHub repositories
  listRepositories: protectedProcedure.query(async ({ ctx }) => {
    const connection = await ctx.db.gitHubConnection.findUnique({
      where: { userId: ctx.session.user.id },
    });

    if (!connection) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'GitHub not connected. Please connect your GitHub account first.',
      });
    }

    try {
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch repositories');
      }

      const repos = await response.json() as Array<{
        id: number;
        name: string;
        full_name: string;
        html_url: string;
        private: boolean;
        description: string | null;
        updated_at: string;
      }>;

      return repos.map(repo => ({
        id: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        isPrivate: repo.private,
        description: repo.description,
        updatedAt: repo.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching GitHub repositories:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch repositories from GitHub',
      });
    }
  }),

  // Get repository details
  getRepository: protectedProcedure
    .input(z.object({ owner: z.string(), repo: z.string() }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.db.gitHubConnection.findUnique({
        where: { userId: ctx.session.user.id },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'GitHub not connected',
        });
      }

      try {
        const response = await fetch(
          `https://api.github.com/repos/${input.owner}/${input.repo}`,
          {
            headers: {
              Authorization: `Bearer ${connection.accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (response.status === 404) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Repository not found or you don\'t have access',
          });
        }

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const repo = await response.json() as {
          id: number;
          name: string;
          full_name: string;
          html_url: string;
          private: boolean;
          description: string | null;
          default_branch: string;
          language: string | null;
          updated_at: string;
        };

        return {
          id: String(repo.id),
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          isPrivate: repo.private,
          description: repo.description,
          defaultBranch: repo.default_branch,
          language: repo.language,
          updatedAt: repo.updated_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('Error fetching GitHub repository:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch repository from GitHub',
        });
      }
    }),
});
