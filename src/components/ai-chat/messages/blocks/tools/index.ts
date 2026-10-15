export { getToolRenderer, registerToolRenderer, type ToolRenderer, type ToolPartData } from "@/components/ai-chat/messages/blocks/tools/registry";
// Business-specific renderers are intentionally not exported by default
// to keep the module lightweight and decoupled. Host apps can import them
// directly if needed, or register custom renderers via registerToolRenderer.

