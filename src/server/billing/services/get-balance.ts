import { TRPCError } from '@trpc/server'
import { getVelobase } from '../velobase'
import { VelobaseNotFoundError } from '@velobaseai/billing'
import type { GetBalanceParams, GetBalanceOutput, AccountSummary } from '../types'

export async function getBalance(params: GetBalanceParams): Promise<GetBalanceOutput> {
  if (!params.userId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'userId is required' })

  const vb = getVelobase()

  try {
    const customer = await vb.customers.get(params.userId)

    const summaries: AccountSummary[] = customer.accounts
      .filter((a: { available: number }) => a.available > 0)
      .map((a: { accountType: string; creditType: string; total: number; used: number; frozen: number; available: number; startsAt: string | null; expiresAt: string | null }) => ({
        accountType: (a.accountType ?? 'CREDIT') as AccountSummary['accountType'],
        subAccountType: (a.creditType ?? 'DEFAULT') as AccountSummary['subAccountType'],
        total: a.total,
        used: a.used,
        frozen: a.frozen,
        available: a.available,
        startsAt: a.startsAt ? new Date(a.startsAt) : null,
        expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
      }))

    return {
      totalSummary: {
        total: customer.balance.total,
        used: customer.balance.used,
        frozen: customer.balance.frozen,
        available: customer.balance.available,
      },
      accounts: summaries,
    }
  } catch (err) {
    if (err instanceof VelobaseNotFoundError) {
      return {
        totalSummary: { total: 0, used: 0, frozen: 0, available: 0 },
        accounts: [],
      }
    }
    throw err
  }
}
