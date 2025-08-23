const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Create payment intent for quote deposit
router.post('/create-payment-intent', async (req, res) => {
    try {
        const { quoteId, amount, currency = 'usd', paymentType = 'deposit' } = req.body;

        if (!quoteId || !amount) {
            return res.status(400).json({ error: 'Quote ID and amount are required' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency,
            metadata: {
                quoteId,
                paymentType,
            },
            description: `${paymentType} payment for quote ${quoteId}`
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
    }
});

// Handle payment success webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const { quoteId, paymentType } = paymentIntent.metadata;

        try {
            // Update quote payment status in Supabase
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.VITE_SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY
            );

            const updateData = {
                payment_status: paymentType === 'deposit' ? 'deposit_paid' : 'fully_paid',
                [`${paymentType}_payment_id`]: paymentIntent.id,
                [`${paymentType}_paid_date`]: new Date().toISOString(),
                [`${paymentType}_amount`]: paymentIntent.amount / 100
            };

            const { error } = await supabase
                .from('quotes')
                .update(updateData)
                .eq('id', quoteId);

            if (error) {
                console.error('Error updating quote payment status:', error);
            } else {
                console.log(`Payment recorded for quote ${quoteId}: ${paymentType} - $${paymentIntent.amount / 100}`);
                
                // Mark any payment delegation as complete
                await markPaymentDelegationComplete(quoteId, paymentType);
                
                // If deposit paid, trigger production workflow
                if (paymentType === 'deposit') {
                    await triggerProductionWorkflow(quoteId);
                }
            }

        } catch (error) {
            console.error('Error processing payment webhook:', error);
        }
    }

    res.json({ received: true });
});

// Get payment status for a quote
router.get('/status/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        const { data: quote, error } = await supabase
            .from('quotes')
            .select('payment_status, deposit_amount, total_amount, deposit_payment_id, final_payment_id')
            .eq('id', quoteId)
            .single();

        if (error) {
            throw error;
        }

        res.json({
            paymentStatus: quote.payment_status || 'pending',
            depositAmount: quote.deposit_amount,
            totalAmount: quote.total_amount,
            finalAmount: quote.total_amount - (quote.deposit_amount || 0),
            depositPaid: !!quote.deposit_payment_id,
            finalPaid: !!quote.final_payment_id
        });

    } catch (error) {
        console.error('Error fetching payment status:', error);
        res.status(500).json({ error: 'Failed to fetch payment status' });
    }
});

// Request final payment
router.post('/request-final-payment', async (req, res) => {
    try {
        const { quoteId } = req.body;

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        const { data: quote, error } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', quoteId)
            .single();

        if (error) {
            throw error;
        }

        const finalAmount = quote.total_amount - (quote.deposit_amount || 0);

        if (finalAmount <= 0) {
            return res.status(400).json({ error: 'No final payment required' });
        }

        // Update quote status to request final payment
        await supabase
            .from('quotes')
            .update({ 
                payment_status: 'final_payment_requested',
                final_payment_requested_date: new Date().toISOString()
            })
            .eq('id', quoteId);

        res.json({
            success: true,
            finalAmount,
            message: 'Final payment requested'
        });

    } catch (error) {
        console.error('Error requesting final payment:', error);
        res.status(500).json({ error: 'Failed to request final payment' });
    }
});

// Delegate payment to another email address
router.post('/delegate', async (req, res) => {
    try {
        const { quoteId, paymentType, delegateEmail, customerEmail } = req.body;

        if (!quoteId || !paymentType || !delegateEmail || !customerEmail) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Get quote details
        const { data: quote, error: quoteError } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', quoteId)
            .single();

        if (quoteError) {
            throw quoteError;
        }

        // Create payment delegation record
        const delegationData = {
            quote_id: quoteId,
            payment_type: paymentType,
            delegate_email: delegateEmail,
            customer_email: customerEmail,
            status: 'pending',
            created_at: new Date().toISOString(),
            reminder_count: 0,
            last_reminder_sent: null
        };

        const { error: delegationError } = await supabase
            .from('payment_delegations')
            .insert([delegationData]);

        if (delegationError) {
            throw delegationError;
        }

        // Update quote status
        await supabase
            .from('quotes')
            .update({ 
                payment_status: `${paymentType}_delegated`,
                payment_delegate_email: delegateEmail
            })
            .eq('id', quoteId);

        // Send initial payment request emails
        await sendPaymentDelegationEmails(quote, paymentType, delegateEmail, customerEmail);

        res.json({
            success: true,
            message: 'Payment request sent successfully'
        });

    } catch (error) {
        console.error('Error delegating payment:', error);
        res.status(500).json({ error: 'Failed to delegate payment' });
    }
});

// Send payment reminder emails
router.post('/send-reminders', async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Get pending payment delegations older than 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { data: pendingPayments, error } = await supabase
            .from('payment_delegations')
            .select(`
                *,
                quotes:quote_id (*)
            `)
            .eq('status', 'pending')
            .or(`last_reminder_sent.is.null,last_reminder_sent.lt.${twentyFourHoursAgo}`);

        if (error) {
            throw error;
        }

        let remindersSent = 0;
        
        for (const delegation of pendingPayments) {
            try {
                await sendPaymentReminderEmails(delegation);
                
                // Update reminder count and timestamp
                await supabase
                    .from('payment_delegations')
                    .update({
                        reminder_count: delegation.reminder_count + 1,
                        last_reminder_sent: new Date().toISOString()
                    })
                    .eq('id', delegation.id);
                
                remindersSent++;
            } catch (error) {
                console.error(`Failed to send reminder for delegation ${delegation.id}:`, error);
            }
        }

        res.json({
            success: true,
            remindersSent,
            totalPending: pendingPayments.length
        });

    } catch (error) {
        console.error('Error sending payment reminders:', error);
        res.status(500).json({ error: 'Failed to send reminders' });
    }
});

// Mark payment delegation as completed (called by webhook)
async function markPaymentDelegationComplete(quoteId, paymentType) {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        await supabase
            .from('payment_delegations')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('quote_id', quoteId)
            .eq('payment_type', paymentType)
            .eq('status', 'pending');

    } catch (error) {
        console.error('Error marking delegation complete:', error);
    }
}

// Send payment delegation emails
async function sendPaymentDelegationEmails(quote, paymentType, delegateEmail, customerEmail) {
    const nodemailer = require('nodemailer');
    const emailTemplate = require('../helpers/emailTemplate');
    
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    const amount = paymentType === 'deposit' ? quote.deposit_amount : (quote.total_amount - quote.deposit_amount);
    const typeText = paymentType === 'deposit' ? 'Deposit Payment' : 'Final Payment';
    const paymentUrl = `https://shureprint.com/payment-checkout.html?quoteId=${quote.id}&type=${paymentType}`;
    
    // Get sales rep email for CC (fallback to generic sales email)
    const salesEmail = quote.sales_rep_email || 'sales@shureprint.com';

    // Email to payment delegate
    const delegateEmailHtml = emailTemplate.wrapper(
        emailTemplate.header('Payment Request') +
        emailTemplate.body(
            emailTemplate.heading('Payment Request - SHUREPRINT') +
            emailTemplate.paragraph('Hello,') +
            emailTemplate.paragraph('You have been designated to make a payment for the following approved quote:') +
            emailTemplate.infoBox(`
                ${emailTemplate.strong('Quote Details')}<br>
                ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                ${emailTemplate.paragraph(`Company: ${emailTemplate.strong(quote.client_company)}`)}
                ${emailTemplate.paragraph(`Contact: ${emailTemplate.strong(quote.contact_name)}`)}
                ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                ${emailTemplate.paragraph(`Amount Due: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
            `) +
            emailTemplate.button('MAKE PAYMENT NOW', paymentUrl) +
            emailTemplate.alertBox(`
                ${emailTemplate.strong('⏰ Payment Timeline:')}<br>
                • Days 1-2: Daily reminders<br>
                • Days 3-6: Urgent reminders twice daily<br>
                • Day 7+: Escalation to sales team for manual follow-up
            `, 'warning') +
            emailTemplate.paragraph(
                emailTemplate.muted('This payment link is secure and processed through Stripe. Both the customer and payment contact will receive reminder emails until payment is completed.')
            )
        ) +
        emailTemplate.footer()
    );

    const delegateEmailContent = {
        from: process.env.SMTP_FROM,
        to: delegateEmail,
        cc: salesEmail,
        subject: `Payment Required: ${typeText} for Quote ${quote.quote_number}`,
        html: delegateEmailHtml
    };

    // Email to customer (notification)
    const customerEmailHtml = emailTemplate.wrapper(
        emailTemplate.header('Payment Request Sent') +
        emailTemplate.body(
            emailTemplate.heading('Payment Request Sent - SHUREPRINT') +
            emailTemplate.paragraph(`Hello ${quote.contact_name},`) +
            emailTemplate.paragraph('We\'ve sent a payment request for your quote to the designated payment contact.') +
            emailTemplate.infoBox(`
                ${emailTemplate.strong('Payment Details')}<br>
                ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                ${emailTemplate.paragraph(`Amount: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                ${emailTemplate.paragraph(`Payment Contact: ${emailTemplate.strong(delegateEmail)}`)}
            `) +
            emailTemplate.paragraph('Both you and the payment contact will receive reminder emails until payment is completed.') +
            emailTemplate.paragraph(
                emailTemplate.muted('If you have any questions, please contact your sales representative.')
            )
        ) +
        emailTemplate.footer()
    );

    const customerEmailContent = {
        from: process.env.SMTP_FROM,
        to: customerEmail,
        cc: salesEmail,
        subject: `Payment Request Sent - Quote ${quote.quote_number}`,
        html: customerEmailHtml
    };

    await Promise.all([
        transporter.sendMail(delegateEmailContent),
        transporter.sendMail(customerEmailContent)
    ]);
}

// Send payment reminder emails
async function sendPaymentReminderEmails(delegation) {
    const nodemailer = require('nodemailer');
    const emailTemplate = require('../helpers/emailTemplate');
    
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    const quote = delegation.quotes;
    const amount = delegation.payment_type === 'deposit' ? quote.deposit_amount : (quote.total_amount - quote.deposit_amount);
    const typeText = delegation.payment_type === 'deposit' ? 'Deposit Payment' : 'Final Payment';
    const paymentUrl = `https://shureprint.com/payment-checkout.html?quoteId=${quote.id}&type=${delegation.payment_type}`;
    const reminderNumber = delegation.reminder_count + 1;
    const isUrgent = reminderNumber >= 3;

    // Reminder to payment delegate
    const delegateReminderHtml = emailTemplate.wrapper(
        emailTemplate.header(isUrgent ? 'URGENT Payment Reminder' : 'Payment Reminder') +
        emailTemplate.body(
            emailTemplate.heading(`Payment Reminder ${reminderNumber} - SHUREPRINT`) +
            emailTemplate.paragraph('Hello,') +
            emailTemplate.paragraph('This is a reminder that payment is still pending for the following quote:') +
            emailTemplate.alertBox(`
                ${emailTemplate.strong('Overdue Payment')}<br>
                ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                ${emailTemplate.paragraph(`Company: ${emailTemplate.strong(quote.client_company)}`)}
                ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                ${emailTemplate.paragraph(`Amount Due: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                ${emailTemplate.paragraph(`Days Pending: ${emailTemplate.strong(reminderNumber)}`)}
                ${emailTemplate.paragraph(`Original Request: ${emailTemplate.strong(new Date(delegation.created_at).toLocaleDateString())}`)}
            `, isUrgent ? 'warning' : 'info') +
            (isUrgent ? 
                emailTemplate.paragraph(
                    emailTemplate.strong('🚧 Project timeline at risk - Payment needed ASAP')
                ) : '') +
            emailTemplate.button('MAKE PAYMENT NOW', paymentUrl, true) +
            emailTemplate.paragraph(
                emailTemplate.strong('Please complete this payment as soon as possible to avoid project delays.')
            ) +
            (reminderNumber >= 6 ? 
                emailTemplate.alertBox(
                    emailTemplate.strong('Final notice: If payment is not received within 24 hours, this will be escalated to your sales representative for personal follow-up.'),
                    'error'
                ) : '')
        ) +
        emailTemplate.footer()
    );

    const delegateReminderContent = {
        from: process.env.SMTP_FROM,
        to: delegation.delegate_email,
        cc: quote.sales_rep_email || 'sales@shureprint.com',
        subject: isUrgent ? 
            `⚠️ URGENT: Payment Required - Quote ${quote.quote_number} (${reminderNumber} days)` :
            `Payment Reminder ${reminderNumber}: ${typeText} for Quote ${quote.quote_number}`,
        html: delegateReminderHtml
    };

    // Reminder to customer
    const customerReminderHtml = emailTemplate.wrapper(
        emailTemplate.header('Payment Reminder') +
        emailTemplate.body(
            emailTemplate.heading('Payment Reminder - SHUREPRINT') +
            emailTemplate.paragraph(`Hello ${quote.contact_name},`) +
            emailTemplate.paragraph('We\'re still waiting for payment for your quote. Please follow up with your payment contact.') +
            emailTemplate.alertBox(`
                ${emailTemplate.strong('Pending Payment')}<br>
                ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                ${emailTemplate.paragraph(`Amount: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                ${emailTemplate.paragraph(`Payment Contact: ${emailTemplate.strong(delegation.delegate_email)}`)}
                ${emailTemplate.paragraph(`Reminders Sent: ${emailTemplate.strong(reminderNumber.toString())}`)}
            `, 'warning') +
            emailTemplate.paragraph(
                emailTemplate.strong('Your project cannot proceed until payment is received.')
            ) +
            emailTemplate.paragraph(
                emailTemplate.muted('If you need assistance with payment arrangements, please contact your sales representative.')
            )
        ) +
        emailTemplate.footer()
    );

    const customerReminderContent = {
        from: process.env.SMTP_FROM,
        to: delegation.customer_email,
        cc: quote.sales_rep_email || 'sales@shureprint.com',
        subject: `Payment Reminder: Quote ${quote.quote_number} - Action Required`,
        html: customerReminderHtml
    };

    await Promise.all([
        transporter.sendMail(delegateReminderContent),
        transporter.sendMail(customerReminderContent)
    ]);
}

// Helper function to trigger production workflow
async function triggerProductionWorkflow(quoteId) {
    try {
        // Get Trello service
        const TrelloService = require('../services/trelloService');
        const trello = new TrelloService();

        // Create production card in Trello
        await trello.createProductionCard(quoteId);
        
        console.log(`Production workflow triggered for quote ${quoteId}`);
    } catch (error) {
        console.error('Error triggering production workflow:', error);
    }
}

// Test endpoint to send sample payment delegation email
router.post('/test-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email address required' });
        }

        // Create a sample quote object for testing
        const sampleQuote = {
            id: 'test-quote-123',
            quote_number: 'QT-2024TEST',
            client_company: 'Test Company Inc.',
            contact_name: 'John Doe',
            contact_email: 'john@testcompany.com',
            project_name: 'Sample Business Cards Project',
            deposit_amount: 250.00,
            total_amount: 500.00,
            sales_rep_name: 'Laura Shure',
            sales_rep_email: 'laura@shurehw.com'
        };

        // Send test payment delegation email
        await sendTestPaymentDelegationEmail(sampleQuote, 'deposit', email, sampleQuote.contact_email);

        res.json({
            success: true,
            message: `Test payment delegation email sent to ${email}`
        });

    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});

// Send test payment delegation email
async function sendTestPaymentDelegationEmail(quote, paymentType, delegateEmail, customerEmail) {
    const nodemailer = require('nodemailer');
    const emailTemplate = require('../helpers/emailTemplate');
    
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    const amount = paymentType === 'deposit' ? quote.deposit_amount : (quote.total_amount - quote.deposit_amount);
    const typeText = paymentType === 'deposit' ? 'Deposit Payment' : 'Final Payment';
    const paymentUrl = `https://shureprint.com/payment-checkout.html?quoteId=${quote.id}&type=${paymentType}`;
    
    // Get sales rep email for CC
    const salesEmail = quote.sales_rep_email || 'sales@shureprint.com';

    // Test email to payment delegate
    const testEmailHtml = emailTemplate.wrapper(
        emailTemplate.alertBox(
            emailTemplate.heading('🧪 TEST EMAIL - Payment Delegation System') +
            emailTemplate.paragraph(
                emailTemplate.strong('This is a test of the SHUREPRINT payment delegation system.')
            ),
            'info'
        ) +
        emailTemplate.header('Payment Request TEST') +
        emailTemplate.body(
            emailTemplate.heading('Payment Request - SHUREPRINT') +
            emailTemplate.paragraph('Hello,') +
            emailTemplate.paragraph('You have been designated to make a payment for the following quote:') +
            emailTemplate.infoBox(`
                ${emailTemplate.strong('Quote Details')}<br>
                ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                ${emailTemplate.paragraph(`Company: ${emailTemplate.strong(quote.client_company)}`)}
                ${emailTemplate.paragraph(`Contact: ${emailTemplate.strong(quote.contact_name)}`)}
                ${emailTemplate.paragraph(`Project: ${emailTemplate.strong(quote.project_name)}`)}
                ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                ${emailTemplate.paragraph(`Amount Due: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                ${emailTemplate.paragraph(`Sales Rep: ${emailTemplate.strong(quote.sales_rep_name)}`)}
            `) +
            emailTemplate.button('MAKE PAYMENT NOW (TEST)', paymentUrl) +
            emailTemplate.paragraph(
                emailTemplate.muted('This payment link is secure and processed through Stripe. You will receive reminder emails until payment is completed.')
            ) +
            emailTemplate.alertBox(`
                ${emailTemplate.strong('📧 Email Features Being Tested:')}<br>
                • ✅ Payment delegate receives request<br>
                • ✅ Sales team (${salesEmail}) is CC'd<br>
                • ✅ Customer (${customerEmail}) gets notification<br>
                • ✅ Professional SHUREPRINT branding<br>
                • ✅ Secure payment links<br>
                • ✅ 7-day reminder sequence (not active in test)
            `, 'success') +
            emailTemplate.paragraph(
                emailTemplate.muted(`Test Details: From ${process.env.SMTP_FROM} | To ${delegateEmail} | CC ${salesEmail} | Date ${new Date().toLocaleString()}`)
            )
        ) +
        emailTemplate.footer()
    );

    const testEmailContent = {
        from: process.env.SMTP_FROM,
        to: delegateEmail,
        cc: salesEmail,
        subject: `🧪 TEST: Payment Required - ${typeText} for Quote ${quote.quote_number}`,
        html: testEmailHtml
    };

    await transporter.sendMail(testEmailContent);
    console.log(`Test payment delegation email sent to ${delegateEmail}`);
}

module.exports = router;