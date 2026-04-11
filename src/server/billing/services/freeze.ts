import { TRPCError } from '@trpc/server'
import { getVelobase } from '../velobase'
import type { FreezeParams, FreezeOutput } from '../types'

export async function freeze(params: FreezeParams): Promise<FreezeOutput> {
  if (!params.userId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'userId is required' })
  if (!params.businessId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'businessId is required' })
  if (params.amount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'amount must be greater than 0' })

  const vb = getVelobase()

  const result = await vb.billing.freeze({
    customerId: params.userId,
    amount: params.amount,
    transactionId: params.businessId,
    businessType: mapBusinessType(params.businessType),
    description: params.description ?? undefined,
  })

  return {
    totalAmount: result.frozenAmount,
    freezeDetails: result.freezeDetails.map((d: { accountId: string; creditType?: string; amount: number }) => ({
      freezeId: params.businessId,
      accountId: d.accountId,
      accountType: params.accountType,
      subAccountType: (d.creditType ?? 'DEFAULT') as FreezeOutput['freezeDetails'][number]['subAccountType'],
      amount: d.amount,
    })),
    isIdempotentReplay: result.isIdempotentReplay,
  }
}

function mapBusinessType(bt?: string): 'TASK' | 'ORDER' | 'MEMBERSHIP' | 'SUBSCRIPTION' | 'FREE_TRIAL' | 'ADMIN_GRANT' | undefined {
  const valid = ['TASK', 'ORDER', 'MEMBERSHIP', 'SUBSCRIPTION', 'FREE_TRIAL', 'ADMIN_GRANT'] as const
  if (!bt || !valid.includes(bt as typeof valid[number])) return undefined
  return bt as typeof valid[number]
}
