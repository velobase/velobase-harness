import type { Fulfiller, FulfillmentContext } from '../types'
import { settleGrant as grant } from '@/server/billing/services/grant'
import { getProduct } from '@/server/product/services/get'

export const creditsFulfiller: Fulfiller = {
  canHandle(product) {
    return product.type === 'CREDITS_PACKAGE'
  },
  getName() {
    return 'CreditsFulfiller'
  },
  async fulfill(ctx: FulfillmentContext) {
    const product = await getProduct({ productId: ctx.order.productId })
    const amount = product.creditsPackage?.creditsAmount
    if (!amount || amount <= 0) throw new Error('credits package not configured')

    const purchaseQuantity =
      typeof (ctx.order as unknown as { quantity?: number }).quantity === 'number' &&
      Number.isFinite((ctx.order as unknown as { quantity?: number }).quantity) &&
      (ctx.order as unknown as { quantity?: number }).quantity! >= 1
        ? Math.floor((ctx.order as unknown as { quantity?: number }).quantity!)
        : 1

    await grant({
      userId: ctx.order.userId,
      source: "order",
      amount: amount * purchaseQuantity,
      outerBizId: `order_${ctx.order.id}_credits`,
      businessType: 'ORDER',
      referenceId: ctx.order.id,
      description: `Purchase Credits`,
    })
  },
}


