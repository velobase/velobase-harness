-- Restore LemonSqueezy as an optional payment gateway preference.
ALTER TYPE "UserPaymentGatewayPreference" ADD VALUE IF NOT EXISTS 'LEMONSQUEEZY';
