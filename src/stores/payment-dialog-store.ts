import { create } from 'zustand'

export type PaymentMethod = 'stripe' | 'lemonsqueezy' | 'crypto'

interface PaymentDialogState {
  isOpen: boolean
  productId: string | null
  amount?: number
  currency?: string
  successUrl?: string
  cancelUrl?: string
  metadata?: Record<string, unknown>
  
  // Actions
  openPaymentDialog: (params: { 
    productId: string; 
    amount?: number;
    currency?: string;
    successUrl?: string; 
    cancelUrl?: string;
    metadata?: Record<string, unknown>
  }) => void
  closePaymentDialog: () => void
}

export const usePaymentDialogStore = create<PaymentDialogState>((set) => ({
  isOpen: false,
  productId: null,
  amount: undefined,
  currency: 'USD',
  successUrl: undefined,
  cancelUrl: undefined,
  metadata: undefined,

  openPaymentDialog: (params) => set({ 
    isOpen: true, 
    productId: params.productId,
    amount: params.amount,
    currency: params.currency ?? 'USD',
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    metadata: params.metadata
  }),

  closePaymentDialog: () => set({ 
    isOpen: false,
    // Keep data briefly to avoid layout shift during close animation if needed, 
    // or clear it. Clearing productId usually safer.
    productId: null,
    metadata: undefined
  }),
}))

