import { TRPCError } from '@trpc/server'
import { getVelobase } from '../velobase'
import type { ConsumeParams, ConsumeOutput } from '../types'

export async function consume(params: ConsumeParams): Promise<ConsumeOutput> {
  if (!params.businessId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'businessId is required' })

  const vb = getVelobase()

  const result = await vb.billing.consume({
    transactionId: params.businessId,
    actualAmount: params.actualAmount,
  })

  return {
    totalAmount: result.consumedAmount,
    returnedAmount: result.returnedAmount > 0 ? result.returnedAmount : undefined,
    consumeDetails: result.consumeDetails.map((d: { accountId: string; creditType?: string; amount: number }) => ({
      freezeId: params.businessId,
      accountId: d.accountId,
      subAccountType: (d.creditType ?? 'DEFAULT') as ConsumeOutput['consumeDetails'][number]['subAccountType'],
      amount: d.amount,
    })),
    consumedAt: result.consumedAt,
  }
}
