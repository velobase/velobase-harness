// AI Chat Module - Components

// Chat components
export { ChatHeader } from "@/components/ai-chat/chat/chat-header";
export { ChatPanel } from "@/components/ai-chat/chat/chat-panel";
export { ScrollableMessageList } from "@/components/ai-chat/chat/scrollable-message-list";
export { MessageListSkeleton } from "@/components/ai-chat/chat/message-list-skeleton";
export { ErrorMessage } from "@/components/ai-chat/chat/error-message";
export { ChatInput, type AttachmentData } from "@/components/ai-chat/chat/chat-input";
export { WelcomeView } from "@/components/ai-chat/chat/welcome-view";
export { EmptyConversationView } from "@/components/ai-chat/chat/empty-conversation-view";
export { AttachmentPreview } from "@/components/ai-chat/chat/attachment-preview";
export { CircularProgress } from "@/components/ai-chat/chat/circular-progress";
export { StartPanel } from "@/components/ai-chat/chat/start-panel";

// Message components
export { UserMessage } from "@/components/ai-chat/messages/user-message";
export { AssistantMessage } from "@/components/ai-chat/messages/assistant-message";

// Message blocks
export { TextBlock } from "@/components/ai-chat/messages/blocks/TextBlock";
export { ToolBlock } from "@/components/ai-chat/messages/blocks/ToolBlock";
export { ReasoningBlock } from "@/components/ai-chat/messages/blocks/ReasoningBlock";

// Tool renderer registry
export { registerToolRenderer, getToolRenderer } from "@/components/ai-chat/messages/blocks/tools/registry";
