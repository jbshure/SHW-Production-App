const cron = require('node-cron');

class PaymentReminderService {
    constructor() {
        this.isRunning = false;
    }

    // Start the automated reminder service
    start() {
        if (this.isRunning) {
            console.log('Payment reminder service is already running');
            return;
        }

        // Run every day at 9 AM
        this.dailyJob = cron.schedule('0 9 * * *', () => {
            this.sendDailyReminders();
        }, {
            scheduled: false,
            timezone: "America/Los_Angeles"
        });

        // Run every 4 hours during business hours (8 AM - 8 PM)
        this.businessHoursJob = cron.schedule('0 8,12,16,20 * * *', () => {
            this.sendUrgentReminders();
        }, {
            scheduled: false,
            timezone: "America/Los_Angeles"
        });

        this.dailyJob.start();
        this.businessHoursJob.start();
        this.isRunning = true;

        console.log('Payment reminder service started - Daily reminders at 9 AM, urgent reminders every 4 hours');
    }

    // Stop the reminder service
    stop() {
        if (this.dailyJob) this.dailyJob.stop();
        if (this.businessHoursJob) this.businessHoursJob.stop();
        this.isRunning = false;
        console.log('Payment reminder service stopped');
    }

    // Send daily reminders for payments overdue by more than 24 hours (up to 7 days)
    async sendDailyReminders() {
        try {
            console.log('Running daily payment reminders...');
            
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.VITE_SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY
            );

            // Get pending payments that need reminders (less than 7 days old)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            
            // Get payments that need daily reminders (1-7 days old)
            const { data: reminderPayments, error: reminderError } = await supabase
                .from('payment_delegations')
                .select(`
                    *,
                    quotes:quote_id (*)
                `)
                .eq('status', 'pending')
                .or(`last_reminder_sent.is.null,last_reminder_sent.lt.${twentyFourHoursAgo}`)
                .gt('created_at', sevenDaysAgo); // Only payments less than 7 days old

            if (reminderError) throw reminderError;

            // Get payments that are 7+ days old and need sales rep notification
            const { data: salesFollowupPayments, error: salesError } = await supabase
                .from('payment_delegations')
                .select(`
                    *,
                    quotes:quote_id (*)
                `)
                .eq('status', 'pending')
                .lt('created_at', sevenDaysAgo); // Payments 7+ days old

            if (salesError) throw salesError;

            let remindersSent = 0;
            let salesNotificationsSent = 0;

            // Send regular reminders for payments under 7 days
            for (const delegation of reminderPayments) {
                try {
                    await this.sendPaymentReminderEmail(delegation);
                    
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

            // Handle payments that are 7+ days old - notify sales rep and stop automated reminders
            for (const delegation of salesFollowupPayments) {
                try {
                    await this.notifySalesRepForFollowup(delegation);
                    
                    // Update status to indicate sales follow-up needed
                    await supabase
                        .from('payment_delegations')
                        .update({
                            status: 'needs_sales_followup',
                            sales_notified_at: new Date().toISOString()
                        })
                        .eq('id', delegation.id);
                    
                    salesNotificationsSent++;
                } catch (error) {
                    console.error(`Failed to notify sales rep for delegation ${delegation.id}:`, error);
                }
            }

            console.log(`Daily reminders sent: ${remindersSent}, Sales notifications sent: ${salesNotificationsSent}`);

        } catch (error) {
            console.error('Error sending daily payment reminders:', error);
        }
    }

    // Send escalated reminders for payments 3-6 days old
    async sendUrgentReminders() {
        try {
            console.log('Checking for urgent payment reminders...');
            
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.VITE_SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY
            );

            // Get payments 3-6 days old (before sales takeover at 7 days)
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
            
            const { data: urgentPayments, error } = await supabase
                .from('payment_delegations')
                .select(`
                    *,
                    quotes:quote_id (*)
                `)
                .eq('status', 'pending')
                .lt('created_at', threeDaysAgo)
                .gt('created_at', sevenDaysAgo) // Only 3-6 days old
                .or(`last_reminder_sent.is.null,last_reminder_sent.lt.${twelveHoursAgo}`); // Send every 12 hours

            if (error) {
                throw error;
            }

            if (urgentPayments.length > 0) {
                console.log(`Found ${urgentPayments.length} urgent payment reminders to send`);
                
                for (const delegation of urgentPayments) {
                    await this.sendUrgentPaymentEmail(delegation);
                    
                    // Update last reminder sent
                    await supabase
                        .from('payment_delegations')
                        .update({
                            last_reminder_sent: new Date().toISOString()
                        })
                        .eq('id', delegation.id);
                }
            }

        } catch (error) {
            console.error('Error checking urgent payment reminders:', error);
        }
    }

    // Send regular payment reminder email (days 1-6)
    async sendPaymentReminderEmail(delegation) {
        try {
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
            const daysOverdue = Math.floor((Date.now() - new Date(delegation.created_at)) / (1000 * 60 * 60 * 24));
            
            // Get sales rep email for CC (fallback to generic sales email)
            const salesEmail = quote.sales_rep_email || 'sales@shureprint.com';

            // Regular reminder to payment delegate
            const delegateReminderHtml = emailTemplate.wrapper(
                emailTemplate.header(`Payment Reminder ${reminderNumber}`) +
                emailTemplate.body(
                    emailTemplate.heading(`Payment Reminder ${reminderNumber} - SHUREPRINT`) +
                    emailTemplate.paragraph('Hello,') +
                    emailTemplate.paragraph('This is a reminder that payment is still pending for the following quote:') +
                    emailTemplate.alertBox(`
                        ${emailTemplate.strong('Payment Due')}<br>
                        ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                        ${emailTemplate.paragraph(`Company: ${emailTemplate.strong(quote.client_company)}`)}
                        ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                        ${emailTemplate.paragraph(`Amount Due: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                        ${emailTemplate.paragraph(`Days Since Request: ${emailTemplate.strong(daysOverdue.toString())}`)}
                    `, 'warning') +
                    emailTemplate.button('MAKE PAYMENT NOW', paymentUrl) +
                    emailTemplate.paragraph('Please complete this payment to keep the project on schedule.') +
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
                cc: salesEmail,
                subject: `Payment Reminder ${reminderNumber}: ${typeText} for Quote ${quote.quote_number}`,
                html: delegateReminderHtml
            };

            // Gentle reminder to customer
            const customerReminderHtml = emailTemplate.wrapper(
                emailTemplate.header('Payment Reminder') +
                emailTemplate.body(
                    emailTemplate.heading('Payment Reminder - SHUREPRINT') +
                    emailTemplate.paragraph(`Hello ${quote.contact_name},`) +
                    emailTemplate.paragraph('We\'re still waiting for payment for your quote. Please follow up with your payment contact.') +
                    emailTemplate.infoBox(`
                        ${emailTemplate.strong('Payment Status')}<br>
                        ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                        ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                        ${emailTemplate.paragraph(`Amount: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                        ${emailTemplate.paragraph(`Payment Contact: ${emailTemplate.strong(delegation.delegate_email)}`)}
                        ${emailTemplate.paragraph(`Days Since Request: ${emailTemplate.strong(daysOverdue.toString())}`)}
                    `) +
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
                cc: salesEmail,
                subject: `Payment Reminder: Quote ${quote.quote_number}`,
                html: customerReminderHtml
            };

            await Promise.all([
                transporter.sendMail(delegateReminderContent),
                transporter.sendMail(customerReminderContent)
            ]);

        } catch (error) {
            console.error('Error sending payment reminder email:', error);
        }
    }

    // Send urgent payment reminder email (days 3-6)
    async sendUrgentPaymentEmail(delegation) {
        try {
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
            const daysOverdue = Math.floor((Date.now() - new Date(delegation.created_at)) / (1000 * 60 * 60 * 24));
            
            // Get sales rep email for CC (fallback to generic sales email)
            const salesEmail = quote.sales_rep_email || 'sales@shureprint.com';

            // Urgent reminder to delegate
            const urgentEmailHtml = emailTemplate.wrapper(
                emailTemplate.alertBox(
                    emailTemplate.heading('⚠️ URGENT PAYMENT REQUIRED') +
                    emailTemplate.paragraph(
                        emailTemplate.strong(`This payment has been pending for ${daysOverdue} days.`)
                    ),
                    'warning'
                ) +
                emailTemplate.header('URGENT Payment Required') +
                emailTemplate.body(
                    emailTemplate.alertBox(`
                        ${emailTemplate.strong('Urgent Payment Details')}<br>
                        ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                        ${emailTemplate.paragraph(`Company: ${emailTemplate.strong(quote.client_company)}`)}
                        ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                        ${emailTemplate.paragraph(`Amount Due: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                        ${emailTemplate.paragraph(`Days Pending: ${emailTemplate.strong(daysOverdue.toString())}`)}
                    `, 'error') +
                    emailTemplate.paragraph(
                        emailTemplate.strong('🚧 Project timeline at risk - Payment needed ASAP')
                    ) +
                    emailTemplate.button('MAKE PAYMENT NOW', paymentUrl, true) +
                    emailTemplate.paragraph(
                        emailTemplate.strong('Please prioritize this payment to avoid project delays.')
                    ) +
                    emailTemplate.alertBox(
                        emailTemplate.muted('If payment is not received by day 7, this will be escalated to your sales representative.'),
                        'warning'
                    )
                ) +
                emailTemplate.footer()
            );

            const urgentEmailContent = {
                from: process.env.SMTP_FROM,
                to: delegation.delegate_email,
                cc: [delegation.customer_email, salesEmail],
                subject: `⚠️ URGENT: Payment Required - Quote ${quote.quote_number} (${daysOverdue} days)`,
                html: urgentEmailHtml
            };

            await transporter.sendMail(urgentEmailContent);
            console.log(`Urgent payment reminder sent for quote ${quote.quote_number}`);

        } catch (error) {
            console.error('Error sending urgent payment email:', error);
        }
    }

    // Notify sales rep when payment is 7+ days overdue
    async notifySalesRepForFollowup(delegation) {
        try {
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
            const daysOverdue = Math.floor((Date.now() - new Date(delegation.created_at)) / (1000 * 60 * 60 * 24));
            
            // Get sales rep email from quote or use default
            const salesRepEmail = quote.sales_rep_email || quote.contact_email || process.env.SMTP_FROM;

            // Sales rep notification
            const salesNotificationHtml = emailTemplate.wrapper(
                emailTemplate.header('Sales Follow-up Required') +
                emailTemplate.body(
                    emailTemplate.heading('🔔 Sales Follow-up Required') +
                    emailTemplate.paragraph(
                        emailTemplate.strong('Automated payment reminders have been exhausted. Manual sales intervention needed.')
                    ) +
                    emailTemplate.alertBox(`
                        ${emailTemplate.strong('Payment Details')}<br>
                        ${emailTemplate.paragraph(`Quote Number: ${emailTemplate.strong(quote.quote_number)}`)}
                        ${emailTemplate.paragraph(`Company: ${emailTemplate.strong(quote.client_company)}`)}
                        ${emailTemplate.paragraph(`Contact: ${emailTemplate.strong(quote.contact_name + ' (' + quote.contact_email + ')')}`)}
                        ${emailTemplate.paragraph(`Payment Type: ${emailTemplate.strong(typeText)}`)}
                        ${emailTemplate.paragraph(`Amount Due: ${emailTemplate.strong('$' + amount?.toFixed(2))}`)}
                        ${emailTemplate.paragraph(`Payment Contact: ${emailTemplate.strong(delegation.delegate_email)}`)}
                        ${emailTemplate.paragraph(`Days Overdue: ${emailTemplate.strong(daysOverdue.toString())}`)}
                        ${emailTemplate.paragraph(`Reminders Sent: ${emailTemplate.strong(delegation.reminder_count.toString())}`)}
                        ${emailTemplate.paragraph(`First Requested: ${emailTemplate.strong(new Date(delegation.created_at).toLocaleDateString())}`)}
                    `, 'error') +
                    emailTemplate.heading('Recommended Actions:') +
                    emailTemplate.paragraph(`
                        • 📞 Call the customer directly to discuss payment status<br>
                        • 📧 Send personal follow-up email to both customer and payment contact<br>
                        • 🤝 Consider payment plan or alternative arrangements<br>
                        • ⚖️ Evaluate project hold or cancellation if necessary
                    `) +
                    emailTemplate.alertBox(`
                        ${emailTemplate.strong('⚠️ Project Status:')} ON HOLD until payment received<br>
                        ${emailTemplate.strong('Next Action:')} Sales rep personal outreach required
                    `, 'warning') +
                    emailTemplate.paragraph(
                        emailTemplate.muted('Automated reminders have been stopped for this payment. Manual follow-up is now required.')
                    ) +
                    emailTemplate.button('View Admin Dashboard', 'https://shureprint.com/admin', false)
                ) +
                emailTemplate.footer()
            );

            const salesRepNotification = {
                from: process.env.SMTP_FROM,
                to: salesRepEmail,
                subject: `🔔 Sales Follow-up Required: Payment Overdue ${daysOverdue} Days - Quote ${quote.quote_number}`,
                html: salesNotificationHtml
            };

            await transporter.sendMail(salesRepNotification);
            console.log(`Sales rep notified for overdue payment: Quote ${quote.quote_number}`);

        } catch (error) {
            console.error('Error notifying sales rep:', error);
        }
    }

    // Manual trigger for testing
    async sendRemindersNow() {
        console.log('Manually triggering payment reminders...');
        await this.sendDailyReminders();
    }

    // Get reminder statistics
    async getReminderStats() {
        try {
            const { createClient } = require('@supabase/supabase-js');
            const supabase = createClient(
                process.env.VITE_SUPABASE_URL,
                process.env.SUPABASE_SERVICE_KEY
            );

            const { data: stats, error } = await supabase
                .from('payment_delegations')
                .select('status, reminder_count, created_at')
                .eq('status', 'pending');

            if (error) throw error;

            const now = Date.now();
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
            const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

            return {
                totalPending: stats.length,
                overdueToday: stats.filter(s => new Date(s.created_at) < oneDayAgo).length,
                overdue3Days: stats.filter(s => new Date(s.created_at) < threeDaysAgo).length,
                overdue1Week: stats.filter(s => new Date(s.created_at) < oneWeekAgo).length,
                totalReminders: stats.reduce((sum, s) => sum + s.reminder_count, 0)
            };

        } catch (error) {
            console.error('Error getting reminder stats:', error);
            return null;
        }
    }
}

module.exports = PaymentReminderService;