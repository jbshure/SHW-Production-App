-- Payment Delegations Table
-- Run this SQL in your Supabase database to add payment delegation support

-- Create payment_delegations table
CREATE TABLE IF NOT EXISTS payment_delegations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit', 'final')),
    delegate_email TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    reminder_count INTEGER DEFAULT 0,
    last_reminder_sent TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(quote_id, payment_type)
);

-- Add additional columns to quotes table for payment delegation
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_delegate_email TEXT;

-- Create index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_payment_delegations_status_reminder 
ON payment_delegations(status, last_reminder_sent) 
WHERE status = 'pending';

-- Create index for quote lookups
CREATE INDEX IF NOT EXISTS idx_payment_delegations_quote_id 
ON payment_delegations(quote_id);

-- Add Row Level Security (RLS) policies if needed
-- ALTER TABLE payment_delegations ENABLE ROW LEVEL SECURITY;

-- Example policy (adjust based on your auth requirements):
-- CREATE POLICY "Allow service role full access" ON payment_delegations
-- FOR ALL USING (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE payment_delegations IS 'Tracks payment requests delegated to third parties with reminder functionality';
COMMENT ON COLUMN payment_delegations.quote_id IS 'Reference to the quote requiring payment';
COMMENT ON COLUMN payment_delegations.payment_type IS 'Type of payment: deposit or final';
COMMENT ON COLUMN payment_delegations.delegate_email IS 'Email address of person responsible for payment';
COMMENT ON COLUMN payment_delegations.customer_email IS 'Email address of original customer (for notifications)';
COMMENT ON COLUMN payment_delegations.reminder_count IS 'Number of reminder emails sent';
COMMENT ON COLUMN payment_delegations.last_reminder_sent IS 'Timestamp of last reminder email sent';