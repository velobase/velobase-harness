import type { PaymentAdapter } from "./types";

const adapters = new Map<string, PaymentAdapter>();

export function registerAdapter(name: string, adapter: PaymentAdapter) {
  adapters.set(name.toUpperCase(), adapter);
}

export function hasAdapter(name: string): boolean {
  return adapters.has(name.toUpperCase());
}

export function getAdapter(name: string): PaymentAdapter {
  const a = adapters.get(name.toUpperCase());
  if (!a) throw new Error(`Payment adapter not found: ${name}`);
  return a;
}
