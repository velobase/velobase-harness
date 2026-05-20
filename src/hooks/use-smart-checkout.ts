'use client'

import { api } from '@/trpc/react'
import { toast } from 'sonner'
import { SALES_PAUSED } from '@/config/decommission'

interface CheckoutParams {
  productId: string
  successUrl?: string
  cancelUrl?: string
  gateway?: 'STRIPE' | 'LEMONSQUEEZY'
}

type CheckoutResult =
  | { status: 'REDIRECTING' }
  | { status: 'ERROR'; message: string }

/**
 * Checkout hook — uses backend gateway resolution by default.
 *
 * Crypto payments are handled by separate UI entry points
 * (e.g. "pay with crypto" links on pricing page) that navigate
 * directly to /payment/select-crypto?productId=xxx.
 */
export function useSmartCheckout() {
  const checkoutMutation = api.order.checkout.useMutation()

  const startCheckout = async (params: CheckoutParams): Promise<CheckoutResult> => {
    if (SALES_PAUSED) {
      toast.error('Purchases are temporarily unavailable.')
      return { status: 'ERROR', message: 'Sales temporarily paused' }
    }

    const { productId, successUrl, cancelUrl, gateway } = params

    try {
      const result = await checkoutMutation.mutateAsync({
        productId,
        gateway,
        successUrl: successUrl ?? `${window.location.origin}/payment/success`,
        cancelUrl: cancelUrl ?? window.location.href,
      })

      if (result.status === 'OK' && result.url) {
        window.location.href = result.url
        return { status: 'REDIRECTING' }
      }

      const errMsg = result.status === 'CONFLICT' ? result.message : 'No payment URL returned'
      toast.error(errMsg)
      return { status: 'ERROR', message: errMsg }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Checkout failed'
      toast.error(msg)
      return { status: 'ERROR', message: msg }
    }
  }

  return {
    startCheckout,
    isLoading: checkoutMutation.isPending,
  }
}
