import { TRPCError } from '@trpc/server'
import { getVelobase } from '../velobase'
import type { UnfreezeParams, UnfreezeOutput } from '../types'

export async function unfreeze(params: UnfreezeParams): Promise<UnfreezeOutput> {
  if (!params.businessId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'businessId is required' })

  const vb = getVelobase()

  const result = await vb.billing.unfreeze({
    transactionId: params.businessId,
  })

  return {
    totalAmount: result.unfrozenAmount,
    unfreezeDetails: result.unfreezeDetails.map((d: { accountId: string; creditType?: string; amount: number }) => ({
      freezeId: params.businessId,
      accountId: d.accountId,
      subAccountType: (d.creditType ?? 'DEFAULT') as UnfreezeOutput['unfreezeDetails'][number]['subAccountType'],
      amount: d.amount,
    })),
    unfrozenAt: result.unfrozenAt,
  }
}
