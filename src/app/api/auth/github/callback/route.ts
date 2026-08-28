import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { env } from '@/env';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Handle user cancellation
    if (error === 'access_denied') {
      return NextResponse.redirect(new URL('/chat?github_error=cancelled', request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/chat?github_error=no_code', request.url));
    }

    // Get current session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/auth/signin?github_error=not_logged_in', request.url));
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID!,
        client_secret: env.GITHUB_CLIENT_SECRET!,
        code,
      }),
    });

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub OAuth error:', tokenData);
      return NextResponse.redirect(new URL('/chat?github_error=token_exchange_failed', request.url));
    }

    // Get GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userResponse.json() as {
      id: number;
      login: string;
    };

    // Store GitHub connection (upsert)
    await db.gitHubConnection.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        githubUserId: String(githubUser.id),
        githubUsername: githubUser.login,
        accessToken: tokenData.access_token,
        scope: tokenData.scope ?? 'repo',
      },
      update: {
        githubUserId: String(githubUser.id),
        githubUsername: githubUser.login,
        accessToken: tokenData.access_token,
        scope: tokenData.scope ?? 'repo',
        updatedAt: new Date(),
      },
    });

    // Redirect back to chat
    return NextResponse.redirect(new URL('/chat?github=connected', request.url));
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return NextResponse.redirect(new URL('/chat?github_error=unknown', request.url));
  }
}
