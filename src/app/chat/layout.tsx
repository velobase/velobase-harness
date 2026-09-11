import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/server/features/state";
import { ChatRenderers } from "@/modules/ai-chat/components/chat/chat-renderers";
export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isFeatureEnabled("ai-chat"))) notFound();
  return <ChatRenderers>{children}</ChatRenderers>;
}
