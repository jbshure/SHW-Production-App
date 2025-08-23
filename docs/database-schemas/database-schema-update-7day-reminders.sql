-- Update Payment Delegations for 7-Day Reminder System
-- Run this SQL in your Supabase database to update the payment delegation system

-- Update payment_delegations table to include new status and sales notification tracking
ALTER TABLE payment_delegations 
DROP CONSTRAINT IF EXISTS payment_delegations_status_check;

ALTER TABLE payment_delegations 
ADD CONSTRAINT payment_delegations_status_check 
CHECK (status IN ('pending', 'completed', 'cancelled', 'needs_sales_followup'));

-- Add sales notification tracking
ALTER TABLE payment_delegations 
ADD COLUMN IF NOT EXISTS sales_notified_at TIMESTAMPTZ;

-- Add sales rep info to quotes table
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS sales_rep_name TEXT,
ADD COLUMN IF NOT EXISTS sales_rep_email TEXT;

-- Update existing quotes to populate sales rep email with default
UPDATE quotes SET sales_rep_email = 'sales@shureprint.com' WHERE sales_rep_email IS NULL;

-- Comments for new fields
COMMENT ON COLUMN payment_delegations.sales_notified_at IS 'Timestamp when sales rep was notified for manual follow-up';
COMMENT ON COLUMN quotes.sales_rep_name IS 'Name of the sales representative for this quote';
COMMENT ON COLUMN quotes.sales_rep_email IS 'Email address of the sales representative for this quote';

-- Create index for sales follow-up queries
CREATE INDEX IF NOT EXISTS idx_payment_delegations_sales_followup 
ON payment_delegations(status, sales_notified_at) 
WHERE status = 'needs_sales_followup';