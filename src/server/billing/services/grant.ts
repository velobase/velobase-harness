import { TRPCError } from '@trpc/server'
import { getVelobase } from '../velobase'
import type { GrantParams, GrantOutput } from '../types'

export async function grant(params: GrantParams): Promise<GrantOutput> {
  if (!params.userId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'userId is required' })
  if (!params.outerBizId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'outerBizId is required' })
  if (params.amount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'amount must be greater than 0' })

  const vb = getVelobase()

  const result = await vb.customers.deposit({
    customerId: params.userId,
    amount: params.amount,
    creditType: params.subAccountType ?? 'DEFAULT',
    idempotencyKey: params.outerBizId,
    startsAt: params.startsAt?.toISOString(),
    expiresAt: params.expiresAt?.toISOString(),
    description: params.description ?? undefined,
  })

  return {
    accountId: result.accountId,
    totalAmount: result.totalAmount,
    addedAmount: result.addedAmount,
    recordId: result.recordId,
  }
}
