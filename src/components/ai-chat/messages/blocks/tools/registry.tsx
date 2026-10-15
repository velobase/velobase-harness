"use client";

import type { ComponentType } from "react";

/**
 * Tool Renderer Props based on Vercel AI SDK part types
 * 
 * @see https://sdk.vercel.ai/docs/ai-sdk-ui/tool-calling
 */
export interface ToolPartData {
  toolCallId: string;
  toolName: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  error?: string;
}

/**
 * Custom tool renderer component
 * Takes full control of tool rendering (no generic card wrapper)
 */
export type ToolRenderer = ComponentType<{ data: ToolPartData }>;

/**
 * Tool renderer registry
 * 
 * Maps tool names to custom renderers
 */
const registry: Record<string, ToolRenderer> = {};

/**
 * Get custom renderer for a tool
 * 
 * @param toolName - Name of the tool (from part.type === 'tool-{toolName}')
 * @returns Custom renderer or undefined if not registered
 */
export function getToolRenderer(toolName?: string): ToolRenderer | undefined {
  if (!toolName) return undefined;
  return registry[toolName];
}

/**
 * Register a custom tool renderer
 * 
 * @param toolName - Name of the tool
 * @param renderer - Custom renderer component
 */
export function registerToolRenderer(toolName: string, renderer: ToolRenderer): void {
  registry[toolName] = renderer;
}

