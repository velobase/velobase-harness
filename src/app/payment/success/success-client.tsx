'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { api } from '@/trpc/react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Check, Copy } from 'lucide-react'
import { track } from '@/analytics'
import {
  trackTwitterPurchase,
  getGoogleAdsConfig,
  isGoogleAdsEnabled,
  isPropellerEnabled,
  isTrafficJunkyEnabled,
  ADS_CONFIG,
} from '@/analytics/ads'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function waitForGtag({
  timeoutMs,
  intervalMs = 200,
}: {
  timeoutMs: number
  intervalMs?: number
}): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') return true
    await sleep(intervalMs)
  }
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

function fireGoogleAdsConversionPixel({
  measurementId,
  conversionLabel,
  transactionId,
  value,
  currency,
}: {
  measurementId: string
  conversionLabel: string
  transactionId: string
  value: number
  currency: string
}) {
  // Fallback when gtag isn't available (e.g. script load race). This may still be blocked by adblockers.
  const conversionId = measurementId.startsWith('AW-') ? measurementId.slice(3) : measurementId
  if (!conversionId) return
  const params = new URLSearchParams({
    label: conversionLabel,
    guid: 'ON',
    script: '0',
    value: String(value),
    currency_code: currency,
    transaction_id: transactionId,
  })
  const img = new Image()
  img.src = `https://www.googleadservices.com/pagead/conversion/${conversionId}/?${params.toString()}`
}

// LTV 乘数配置（统一 ×1，不做 LTV 调整）
// - 月付订阅：×1
// - 周付订阅：×1
// - 年付订阅：×1
// - 积分包：×1
const MONTHLY_SUBSCRIPTION_LTV_MULTIPLIER = 1
const WEEKLY_SUBSCRIPTION_LTV_MULTIPLIER = 1

type ProductSnapshotForConversion = {
  type?: string
  interval?: string | null
}

/**
 * 根据产品类型和周期计算 Google Ads 转化价值
 */
function calculateConversionValue(
  amount: number,
  productSnapshot?: ProductSnapshotForConversion | null
): number {
  const baseValue = amount / 100 // 分转元

  if (!productSnapshot) return baseValue

  const { type, interval } = productSnapshot

  // 月付订阅：×3
  if (type === 'SUBSCRIPTION' && interval === 'month') {
    return baseValue * MONTHLY_SUBSCRIPTION_LTV_MULTIPLIER
  }

  // 周付订阅：×1.5（Landing 包，取消率较高）
  if (type === 'SUBSCRIPTION' && interval === 'week') {
    return baseValue * WEEKLY_SUBSCRIPTION_LTV_MULTIPLIER
  }

  // 年付订阅、积分包、其他：×1
  return baseValue
}

export function PaymentSuccessClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const paymentId = searchParams?.get('paymentId') ?? ''
  const orderId = searchParams?.get('orderId') ?? ''
  const nextParam = searchParams?.get('next') ?? ''

  const targetUrl = useMemo(() => {
    return nextParam?.startsWith('/') ? nextParam : '/'
  }, [nextParam])

  // 给 gtag 更充足的时间（全站 afterInteractive 加载），降低漏报
  const [autoRedirectIn, setAutoRedirectIn] = useState(6)

  const hasQueryParams = (paymentId && paymentId.length > 0) || (orderId && orderId.length > 0)

  const { data: payment, refetch, isFetching } = api.order.getPayment.useQuery(
    { paymentId },
    { enabled: !!paymentId }
  )

  const confirmPayment = api.order.confirmPayment.useMutation()
  const confirmAttemptRef = useRef(0)
  const isConfirmingRef = useRef(false)

  // Active confirmation (handles webhook delays for Stripe/Airwallex/NowPayments)
  useEffect(() => {
    if (!paymentId) return
    if (!payment || payment.status !== 'PENDING') return

    // Reset attempt counter when payment changes
    confirmAttemptRef.current = 0

    // Initial delays: 2.5s, 9s, 20s, then every 20s thereafter
    const initialDelays = [2500, 9000, 20000] // ms
    const recurringDelay = 20000 // 20s
    let cancelled = false

    const runConfirm = async () => {
      while (!cancelled) {
        const delay = confirmAttemptRef.current < initialDelays.length 
          ? (initialDelays[confirmAttemptRef.current] ?? 2500)
          : recurringDelay
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        if (cancelled || isConfirmingRef.current) continue

        isConfirmingRef.current = true
        try {
          await confirmPayment.mutateAsync({ paymentId })
          await refetch()
        } catch {
          // ignore errors, will retry
        } finally {
          isConfirmingRef.current = false
        }
        
        confirmAttemptRef.current++
      }
    }

    void runConfirm()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, payment?.id, payment?.status])

  // Polling
  useEffect(() => {
    if (!paymentId) return
    if (payment && payment.status !== 'PENDING') return

    const i = setInterval(() => {
      void refetch()
    }, 2000)
    return () => clearInterval(i)
  }, [paymentId, payment?.status, payment, refetch])

  // Track conversion when payment succeeds (with enhanced conversions)
  const conversionTracked = useRef(false)
  useEffect(() => {
    if (payment?.status !== 'SUCCEEDED') return
    if (conversionTracked.current) return

    const runTracking = async () => {
      if (conversionTracked.current) return
      conversionTracked.current = true

      const userEmail = session?.user?.email?.toLowerCase().trim()

      // 从 order.productSnapshot 获取产品类型信息
      const productSnapshot = payment.order?.productSnapshot as ProductSnapshotForConversion | null

      // 计算转化价值（含 LTV 调整）
      const conversionValue = calculateConversionValue(payment.amount, productSnapshot)
      const actualValue = payment.amount / 100

      // Skip Queue 专用埋点：识别来源于 Skip Queue 的订单并上报转化
      try {
        const extra = payment.extra as unknown
        const metadata =
          extra &&
          typeof extra === 'object' &&
          'metadata' in (extra as Record<string, unknown>)
            ? ((extra as { metadata?: Record<string, unknown> }).metadata ?? undefined)
            : undefined

        const isSkipQueue = metadata?.source === 'skip_queue'

        if (isSkipQueue) {
          track('skip_queue_checkout_success', {
            order_id: orderId || paymentId,
            payment_id: payment.id,
            product_id: payment.order?.productId,
            product_type: productSnapshot?.type,
            product_interval: productSnapshot?.interval,
            amount: payment.amount / 100,
            currency: payment.currency ?? 'USD',
            queue_position: metadata.queue_position,
            estimated_wait: metadata.estimated_wait,
          })
        }
      } catch {
        // no-op: 埋点失败不影响用户体验
      }

      // Google Ads conversion
      if (isGoogleAdsEnabled()) {
        try {
          const gAdsConfig = getGoogleAdsConfig()
          const txId = orderId || paymentId
          const currency = payment.currency ?? 'USD'

          const gtagReady = await waitForGtag({ timeoutMs: 8000 })
          if (gtagReady && typeof window !== 'undefined' && typeof window.gtag === 'function') {
            const sendTo = `${gAdsConfig.measurementId}/${gAdsConfig.conversionLabel}`

            await new Promise<void>((resolve) => {
              let done = false
              const finish = () => {
                if (done) return
                done = true
                resolve()
              }
              window.gtag!('event', 'conversion', {
                send_to: sendTo,
                transaction_id: txId,
                value: conversionValue,
                currency,
                transport_type: 'beacon',
                event_callback: finish,
                event_timeout: 2000,
              })
              setTimeout(finish, 2200)
            })
          } else {
            fireGoogleAdsConversionPixel({
              measurementId: gAdsConfig.measurementId,
              conversionLabel: gAdsConfig.conversionLabel,
              transactionId: txId,
              value: conversionValue,
              currency,
            })
          }
        } catch {
          // no-op
        }
      }

      // Twitter conversion (使用实付金额，不做 LTV 调整)
      trackTwitterPurchase({
        orderId: orderId || paymentId,
        value: actualValue,
        currency: payment.currency ?? 'USD',
        email: userEmail,
      })

      // PropellerAds conversion
      if (isPropellerEnabled()) {
        const propellerVisitorIdRaw = document.cookie
          .split('; ')
          .find(row => row.startsWith('propeller_visitor_id='))
          ?.split('=')[1]
        const propellerVisitorId = propellerVisitorIdRaw ? decodeURIComponent(propellerVisitorIdRaw) : undefined

        if (propellerVisitorId) {
          const payout = actualValue.toFixed(2)
          const img = new Image()
          img.src = `http://ad.propellerads.com/conversion.php?aid=${ADS_CONFIG.propeller.aid}&tid=${ADS_CONFIG.propeller.tid}&visitor_id=${propellerVisitorId}&payout=${payout}`
        }
      }

      // TrafficJunky conversion
      if (isTrafficJunkyEnabled()) {
        const payout = actualValue.toFixed(2)
        const cb = Date.now()
        const cti = payment.id || orderId || paymentId
        const ctd = payment.order?.productId ?? 'subscription'

        const img = new Image()
        img.src = `https://ads.trafficjunky.net/ct?a=${ADS_CONFIG.trafficJunky.accountId}&member_id=${ADS_CONFIG.trafficJunky.memberId}&cb=${cb}&cti=${cti}&ctv=${payout}&ctd=${ctd}`
      }
    }

    void runTracking()
  }, [payment?.status, payment?.amount, payment?.currency, payment?.order?.productSnapshot, payment?.id, payment?.order?.productId, payment?.extra, session?.user?.email, orderId, paymentId])

  // Countdown tick when succeeded
  useEffect(() => {
    if (payment?.status !== 'SUCCEEDED') return
    if (autoRedirectIn <= 0) return
    const timeout = setTimeout(() => {
      setAutoRedirectIn((s) => s - 1)
    }, 1000)
    return () => clearTimeout(timeout)
  }, [payment?.status, autoRedirectIn])

  // Navigate after countdown completes
  useEffect(() => {
    if (payment?.status !== 'SUCCEEDED') return
    if (autoRedirectIn > 0) return
    void router.replace(targetUrl)
  }, [payment?.status, autoRedirectIn, router, targetUrl])

  const title = useMemo(() => {
    if (!hasQueryParams) return 'Payment status unavailable'
    if (!payment) return 'Processing your payment...'
    switch (payment.status) {
      case 'PENDING':
        return 'Processing your payment...'
      case 'SUCCEEDED':
        return 'Payment succeeded!'
      case 'FAILED':
        return 'Payment failed'
      case 'EXPIRED':
        return 'Payment expired'
      case 'REFUNDED':
        return 'Payment refunded'
      default:
        return 'Processing your payment...'
    }
  }, [hasQueryParams, payment])

  const description = useMemo(() => {
    if (!hasQueryParams) return 'Missing payment parameters. You can return to the homepage or pricing to continue.'
    if (!payment) return 'Please wait while we confirm your payment status.'
    if (payment.status === 'SUCCEEDED') {
      return 'Your plan is now active. Redirecting shortly...'
    }
    if (payment.status === 'PENDING') {
      return 'This may take a few seconds. Do not close this page.'
    }
    return 'You can retry from pricing page or contact support.'
  }, [hasQueryParams, payment])

  const [copiedKey, setCopiedKey] = useState<'payment' | 'order' | null>(null)
  const handleCopy = async (text: string, key: 'payment' | 'order') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      // noop
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        <div className="mt-8 rounded-lg border p-6 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm text-muted-foreground">Payment ID</span>
              <div className="truncate font-mono text-sm">{paymentId || '-'}</div>
            </div>
            {paymentId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(paymentId, 'payment')}
                className="shrink-0"
              >
                {copiedKey === 'payment' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm text-muted-foreground">Order ID</span>
              <div className="truncate font-mono text-sm">{orderId || '-'}</div>
            </div>
            {orderId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(orderId, 'order')}
                className="shrink-0"
              >
                {copiedKey === 'order' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="text-sm font-medium">{hasQueryParams ? (payment?.status ?? (isFetching ? 'Checking...' : '-')) : '-'}</span>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          {!hasQueryParams ? (
            <>
              <Link href="/"><Button>Go to Home</Button></Link>
              <Link href="/account/billing"><Button variant="secondary">Back to Billing</Button></Link>
            </>
          ) : payment?.status === 'SUCCEEDED' ? (
            <Button onClick={() => router.replace(targetUrl)}>Continue ({autoRedirectIn})</Button>
          ) : payment?.status && payment.status !== 'PENDING' ? (
            <Link href="/account/billing"><Button variant="secondary">Back to Billing</Button></Link>
          ) : (
            <>
              <Button disabled>Processing...</Button>
              <Link href="/"><Button variant="secondary">Go to Home</Button></Link>
            </>
          )}
        </div>
      </div>
    </main>
  )
}


