# Payment Integration Setup Guide

## Overview
The ShurePrint Quote Builder now includes integrated payment processing using Stripe. This allows you to collect deposits and final payments directly through the quote system.

## Features Added
- **Stripe Payment Processing**: Secure payment collection for deposits and final payments
- **Payment Status Tracking**: Real-time payment status updates in the quote management system
- **Automated Workflow**: Automatic progression from quote acceptance → payment → production
- **Payment UI**: Clean, professional payment checkout pages
- **Webhook Integration**: Real-time payment confirmation and status updates

## Setup Instructions

### 1. Stripe Account Setup
1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe Dashboard:
   - **Publishable Key** (starts with `pk_test_` or `pk_live_`)
   - **Secret Key** (starts with `sk_test_` or `sk_live_`)
3. Set up webhooks in Stripe Dashboard:
   - Endpoint URL: `https://yourdomain.com/payments/webhook`
   - Events to send: `payment_intent.succeeded`
   - Copy the webhook secret (starts with `whsec_`)

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your Stripe credentials:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
```

### 3. Database Schema Updates
Add these fields to your Supabase `quotes` table:

```sql
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_payment_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS final_payment_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS final_paid_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS final_payment_requested_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_date TIMESTAMPTZ;
```

### 4. Frontend Configuration
Add the Stripe publishable key to your frontend environment. In your client-side code, add:

```javascript
window.STRIPE_PUBLISHABLE_KEY = 'pk_test_your_stripe_publishable_key_here';
```

## Payment Flow

### 1. Quote Creation & Sending
- Create quote as normal
- Send to customer via email
- Quote status: `draft` → `sent`

### 2. Customer Acceptance
- Customer reviews and accepts quote
- Quote status: `sent` → `accepted`
- Payment status: `pending` → `payment_pending`

### 3. Deposit Collection
- **"Collect Deposit"** button appears in quote builder
- Click button to open payment checkout
- Customer pays deposit (default 50%)
- Payment status: `payment_pending` → `deposit_paid`
- Production workflow automatically triggered

### 4. Final Payment Collection
- When production is complete, click **"Collect Final Payment"**
- Customer pays remaining balance
- Payment status: `deposit_paid` → `fully_paid`
- Order marked as complete

## API Endpoints

### Payment Routes (`/payments/`)
- `POST /payments/create-payment-intent` - Create Stripe payment intent
- `POST /payments/webhook` - Stripe webhook handler (for payment confirmations)
- `GET /payments/status/:quoteId` - Get payment status for a quote
- `POST /payments/request-final-payment` - Request final payment from customer

## UI Components

### Quote Builder Buttons
- **💳 Collect Deposit** - Shows when quote accepted but deposit not paid
- **💳 Collect Final Payment** - Shows when deposit paid but final payment pending

### Payment Status Badges
- **💰 Pending** - No payment initiated
- **⏳ Payment Due** - Waiting for deposit payment
- **💵 Deposit Paid** - Deposit collected, final payment pending
- **💳 Final Due** - Final payment requested
- **✅ Paid** - Fully paid

### Payment Checkout Page
- Professional Stripe-powered checkout
- Real-time card validation
- Mobile-responsive design
- Secure payment processing

## Security Features
- **PCI Compliance**: Stripe handles all card data
- **Webhook Verification**: All webhooks verified with Stripe signatures
- **Environment Variables**: Sensitive keys stored securely
- **HTTPS Required**: All payment processing requires SSL

## Testing

### Test Mode
Use Stripe test cards for development:
- **Successful Payment**: `4242 4242 4242 4242`
- **Declined Payment**: `4000 0000 0000 0002`
- **Insufficient Funds**: `4000 0000 0000 9995`

### Production Deployment
1. Replace test keys with live keys in production environment
2. Set `NODE_ENV=production`
3. Ensure webhook endpoint is accessible via HTTPS
4. Test with small amounts before going live

## Monitoring & Analytics
- Payment success/failure rates tracked in Stripe Dashboard
- Quote payment status visible in quote management
- Production workflow automatically triggered on successful deposit

## Support
For payment-related issues:
1. Check Stripe Dashboard for payment details
2. Review server logs for webhook processing
3. Verify environment variables are correctly set
4. Ensure database schema is up to date

## Next Steps
1. Set up Stripe account and get API keys
2. Configure environment variables
3. Update database schema
4. Test payment flow with test cards
5. Configure production webhook endpoint
6. Go live with real payments

---
**Note**: Always test thoroughly in Stripe's test mode before processing real payments.