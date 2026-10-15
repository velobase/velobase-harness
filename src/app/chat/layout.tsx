import { notFound } from "next/navigation";
import { requireIncludedFeature } from "@/server/features/state";
import { ChatRenderers } from "@/components/ai-chat/chat/chat-renderers";
export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    requireIncludedFeature("ai-chat");
  } catch {
    notFound();
  }
  return <ChatRenderers>{children}</ChatRenderers>;
}
