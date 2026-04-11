import Velobase from '@velobaseai/billing'
import { env } from '@/env'

let _instance: Velobase | null = null

export function getVelobase(): Velobase {
  if (!_instance) {
    const apiKey = env.VELOBASE_API_KEY
    if (!apiKey) throw new Error('VELOBASE_API_KEY is not configured')
    _instance = new Velobase({ apiKey })
  }
  return _instance
}
