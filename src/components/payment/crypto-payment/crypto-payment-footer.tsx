'use client'

import { ShieldCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { SUPPORT_EMAIL } from '@/config/brand'

interface CryptoPaymentFooterProps {
  isWaiting: boolean
  isPartiallyPaid: boolean
  isInProgress: boolean
}

export function CryptoPaymentFooter({
  isWaiting,
  isPartiallyPaid,
  isInProgress,
}: CryptoPaymentFooterProps) {
  return (
    <footer className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-xl border-t border-border/40 pb-safe pt-3 px-6 shrink-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="max-w-md mx-auto w-full flex flex-col items-center gap-3 pb-2"
      >
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          <ShieldCheck className="w-3 h-3" />
          <span>
            {isWaiting
              ? isPartiallyPaid
                ? 'Funds detected but insufficient. Please top up.'
                : 'Send the exact amount to start processing.'
              : isInProgress
                ? 'Processing on blockchain. Safe to close if needed.'
                : 'Waiting for update...'}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground/60">
          <span>Need help?</span>
          <span className="font-medium text-muted-foreground">{SUPPORT_EMAIL}</span>
        </div>

        <div className="text-[11px] text-muted-foreground/70 text-center leading-snug">
          Powered by{' '}
          <a
            href="https://nowpayments.io"
            target="_blank"
            rel="noreferrer"
            className="text-foreground/80 underline underline-offset-2 hover:text-foreground"
          >
            NOWPayments
          </a>
          . We will never ask for your seed phrase or private keys.
        </div>
      </motion.div>
    </footer>
  )
}
