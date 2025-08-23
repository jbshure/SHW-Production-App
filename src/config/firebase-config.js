const functions = require('firebase-functions');

// Load environment variables if not in Firebase
if (!process.env.FUNCTIONS_EMULATOR && !process.env.FUNCTION_NAME) {
  require('dotenv').config();
}

// Firebase Functions environment configuration
// Use Firebase config in production, fallback to process.env for local development
function getConfig() {
  const isFirebase = process.env.FUNCTIONS_EMULATOR || process.env.FUNCTION_NAME;
  
  if (isFirebase) {
    const config = functions.config();
    return {
      GOOGLE_CLIENT_ID: config.google?.client_id,
      GOOGLE_CLIENT_SECRET: config.google?.client_secret,
      GOOGLE_CALLBACK_URL: config.google?.callback_url,
      SESSION_SECRET: config.session?.secret,
      API_KEY: config.api?.key,
      AUTHORIZED_DOMAINS: config.authorized?.domains || 'shureprint.com',
      AUTHORIZED_EMAILS: config.authorized?.emails || '',
      TRELLO_API_KEY: config.trello?.api_key,
      TRELLO_TOKEN: config.trello?.token,
      TRELLO_BOARD_ID: config.trello?.board_id,
      SMTP_HOST: config.smtp?.host,
      SMTP_PORT: config.smtp?.port,
      SMTP_USER: config.smtp?.user,
      SMTP_PASS: config.smtp?.pass,
      CORS_ORIGINS: config.cors?.origins || '',
      CORS_CREDENTIALS: config.cors?.credentials || 'true',
      NODE_ENV: 'production'
    };
  }
  
  // Return environment variables with defaults for deployment analysis
  return {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '500538228255-q6f7269re4j16avrhf33bfqa3fatrr0l.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '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',
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'https://shureprint-quote-builder.web.app/auth/google/callback',
    SESSION_SECRET: process.env.SESSION_SECRET || 'secure-session-secret-12345-change-in-production',
    AUTHORIZED_DOMAINS: process.env.AUTHORIZED_DOMAINS || 'shureprint.com',
    TRELLO_API_KEY: process.env.TRELLO_API_KEY || '090f0bca888cb7375b15682771aef83e',
    TRELLO_TOKEN: process.env.TRELLO_TOKEN || 'ATTA54bed3e34ae3930dae4c563e64512c33f37aa91bf610743449eea67c1c79fce540025E87',
    TRELLO_BOARD_ID: process.env.TRELLO_BOARD_ID || '686da04ff3f765a86406b2c0',
    ...process.env
  };
}

module.exports = { getConfig };