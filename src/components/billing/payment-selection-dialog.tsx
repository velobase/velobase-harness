'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/trpc/react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { CreditCard, Wallet, ChevronRight, ShieldCheck, Zap, Loader2, Receipt } from 'lucide-react'
import { usePaymentDialogStore, type PaymentMethod } from '@/stores/payment-dialog-store'

export function PaymentSelectionDialog() {
  const isMobile = useIsMobile()
  const router = useRouter()
  const { 
    isOpen, 
    closePaymentDialog, 
    productId, 
    amount, 
  } = usePaymentDialogStore()

  const [loadingMethod, setLoadingMethod] = React.useState<PaymentMethod | null>(null)

  const checkoutMutation = api.order.checkout.useMutation()

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!isOpen) {
      setLoadingMethod(null)
    }
  }, [isOpen])

  const handlePayment = async (method: PaymentMethod) => {
    if (loadingMethod || !productId) return
    setLoadingMethod(method)

    try {
      // Crypto: redirect to select-crypto page
      if (method === 'crypto') {
        closePaymentDialog()
        router.push(`/payment/select-crypto?productId=${productId}`)
        return
      }

      // Hosted card checkout
      if (method === 'stripe' || method === 'lemonsqueezy') {
        try {
          const result = await checkoutMutation.mutateAsync({
            productId,
            gateway: method === 'stripe' ? 'STRIPE' : 'LEMONSQUEEZY',
            successUrl: `${window.location.origin}/payment/success`,
            cancelUrl: window.location.href,
          })
          closePaymentDialog()
          if (result.status === 'OK' && result.url) {
            window.location.href = result.url
          }
        } catch {
          toast.error('Failed to start checkout. Please try again.')
          setLoadingMethod(null)
        }
        return
      }
    } catch (error) {
      console.error('Payment initialization error:', error)
      toast.error('Failed to start payment process. Please try again.')
      setLoadingMethod(null)
    }
  }

  const content = (
    <div className="grid gap-4 p-4 pb-8 sm:p-0 sm:pb-0">
      <PaymentOption
        icon={CreditCard}
        title="Credit Card"
        description="Pay securely with Stripe"
        badges={['Instant', 'Secure']}
        onClick={() => handlePayment('stripe')}
        loading={loadingMethod !== null}
        selectedLoading={loadingMethod === 'stripe'}
        recommended
      />

      <PaymentOption
        icon={Receipt}
        title="LemonSqueezy"
        description="Merchant of Record checkout"
        badges={['Taxes handled', 'Secure']}
        onClick={() => handlePayment('lemonsqueezy')}
        loading={loadingMethod !== null}
        selectedLoading={loadingMethod === 'lemonsqueezy'}
      />

      <PaymentOption
        icon={Wallet}
        title="Cryptocurrency"
        description="USDT, BTC, ETH, and more"
        badges={['No KYC', 'Web3']}
        onClick={() => handlePayment('crypto')}
        loading={loadingMethod !== null}
        selectedLoading={loadingMethod === 'crypto'}
      />

      <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground/60">
        <ShieldCheck className="h-3 w-3" />
        <span>Payments are secure and encrypted</span>
      </div>
    </div>
  )

  const title = "Select Payment Method"
  const description = amount 
    ? `Total to pay: $${amount.toFixed(2)}` 
    : 'Choose how you would like to pay'

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && closePaymentDialog()}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closePaymentDialog()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PaymentOptionProps {
  icon: React.ElementType
  title: string
  description: string
  badges?: string[]
  onClick: () => void
  recommended?: boolean
  loading?: boolean
  selectedLoading?: boolean
}

function PaymentOption({ 
  icon: Icon, 
  title, 
  description, 
  badges, 
  onClick, 
  recommended, 
  loading,
  selectedLoading 
}: PaymentOptionProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "group relative flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all",
        recommended 
          ? "border-primary/20 bg-primary/5 ring-1 ring-primary/10" 
          : "bg-card hover:bg-muted/40 hover:border-primary/40",
        loading && "opacity-50 pointer-events-none active:scale-100",
        !loading && "active:scale-[0.98]"
      )}
    >
      {recommended && (
        <div className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
          <Zap className="w-2.5 h-2.5 fill-current" />
          RECOMMENDED
        </div>
      )}

      <div className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
        recommended 
          ? "bg-primary/10 text-primary" 
          : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground group-hover:shadow-sm"
      )}>
        {selectedLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Icon className="h-6 w-6" />
        )}
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          <div className="flex gap-1">
            {badges?.map((badge) => (
              <span key={badge} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground group-hover:bg-background group-hover:text-foreground/80 transition-colors">
                {badge}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>
      </div>

      <ChevronRight className={cn(
        "h-4 w-4 text-muted-foreground/30 transition-transform",
        !loading && "group-hover:text-foreground/50 group-hover:translate-x-0.5"
      )} />
    </button>
  )
}
