import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/server/features/state";
import { auth } from "@/server/auth";
import { StartPanel, ChatHeader } from "@/components/ai-chat";
import { ConversationSidebar } from "@/components/conversation-sidebar";
import { GUEST_MODE_CONFIG } from "@/config/guest-mode";

/**
 * New Chat Page - Start a fresh conversation
 * Route: /chat
 */
export default async function NewChatPage() {
  if (!(await isFeatureEnabled("ai-chat"))) notFound();
  const session = await auth();
  const isGuest = !session;

  return (
    <div className="flex h-full w-full overflow-hidden md:h-screen">
      {/* Sidebar - Desktop only */}
      <ConversationSidebar className="hidden md:flex" isGuest={isGuest} />

      {/* Main Chat Area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Chat Header - Desktop only (mobile uses MobileShell header) */}
        <div className="hidden md:block">
          <ChatHeader isGuest={isGuest} />
        </div>

        {/* Start Panel */}
        <StartPanel
          isGuest={isGuest}
          agentId={isGuest ? GUEST_MODE_CONFIG.DEFAULT_GUEST_AGENT : undefined}
        />
      </div>
    </div>
  );
}
