import { auth } from "@/server/auth";
import { ChatPanel, ChatHeader } from "@/components/ai-chat";
import { ConversationSidebar } from "@/components/conversation-sidebar";

/**
 * Conversation Page - Display a specific conversation
 * Route: /chat/[id]
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isGuest = !session;
  
  return (
    <div className="flex h-full md:h-screen w-full overflow-hidden">
      {/* Sidebar - Desktop only */}
      <ConversationSidebar className="hidden md:flex" isGuest={isGuest} />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Chat Header - Desktop only (mobile uses MobileShell header) */}
        <div className="hidden md:block">
          <ChatHeader conversationId={id} isGuest={isGuest} />
        </div>
        
        {/* Chat Panel */}
        <ChatPanel conversationId={id} isGuest={isGuest} />
      </div>
    </div>
  );
}

