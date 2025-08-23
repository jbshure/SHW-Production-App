require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const path = require('path');

const passport = require('./config/passport');
const puppeteer = require('puppeteer');
const webhookRoutes = require('./routes/webhooks');
const proofRoutes   = require('./routes/proofs');
const quoteRoutes   = require('./routes/quotes');
const apiRoutes     = require('./routes/api');
const artworkRoutes = require('./routes/artwork');
const authRoutes    = require('./routes/auth');
const paymentRoutes = require('./routes/payments');

// Initialize payment reminder service
const PaymentReminderService = require('./services/paymentReminderService');
const paymentReminderService = new PaymentReminderService();

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = process.env.APP_VERSION || '1.0.0';

app.set('trust proxy', true);

// Per-request CSP nonce
app.use((req, res, next) => {
  res.locals.cspNonce = Buffer.from(crypto.randomBytes(16)).toString('base64');
  next();
});

// Helmet with CSP (relaxed for product catalog)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com"
      ],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      styleSrc: [
        "'self'", 
        "'unsafe-inline'",
        "https:",
        "https://fonts.googleapis.com"
      ],
      styleSrcAttr: ["'unsafe-inline'"], // Allow inline styles
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "*.supabase.co", "*.airtable.com"],
      fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.disable('x-powered-by');

// CORS (env-driven)
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Add localhost origins for development
if (!allowedOrigins.length || process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3000');
  allowedOrigins.push('http://127.0.0.1:3000');
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Allow same-origin requests
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow localhost in development
    if (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: process.env.CORS_CREDENTIALS === 'true',
}));

// Global rate limit (light)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Parsers (keep limits sane)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static & views
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Routes
app.use('/auth', authRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/proof', proofRoutes);
app.use('/quote', quoteRoutes);
app.use('/api', apiRoutes);
app.use('/artwork', artworkRoutes);
app.use('/payments', paymentRoutes);

// Login page route
app.get('/login', (req, res) => {
  const error = req.query.error;
  res.render('login', { 
    cspNonce: res.locals.cspNonce,
    error: error
  });
});

// Health
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Art Proof Web App API',
    version: VERSION,
    endpoints: { health: '/health', webhooks: '/webhooks/*', proofs: '/proof/*', api: '/api/*' }
  });
});

// API endpoint to store test quotes
app.post('/api/store-quote', (req, res) => {
  try {
    const { quoteId, quoteData } = req.body;
    if (!quoteId || !quoteData) {
      return res.status(400).json({ error: 'Missing quoteId or quoteData' });
    }
    
    const quoteRoutes = require('./routes/quotes');
    quoteRoutes.storeQuoteData(quoteId, quoteData);
    
    res.json({ success: true, message: 'Quote stored successfully' });
  } catch (error) {
    console.error('Error storing quote:', error);
    res.status(500).json({ error: 'Failed to store quote' });
  }
});

// Test quote viewer route (for demonstration) - put after main quote routes
app.get('/test-quote/:quoteId', (req, res) => {
  const { quoteId } = req.params;
  res.redirect(`/quote-viewer.html?id=${quoteId}`);
});

// PDF Generation endpoint
app.post('/api/generate-pdf', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { htmlContent, filename } = req.body;
    
    if (!htmlContent) {
      return res.status(400).json({ error: 'HTML content is required' });
    }
    
    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set the HTML content
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
    });
    
    await browser.close();
    
    // Send PDF as response
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename || 'quote.pdf'}"`,
      'Content-Length': pdfBuffer.length
    });
    
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

// Competitor scraper routes
const competitorScraperRoutes = require('./competitor-scraper-api');
app.use(competitorScraperRoutes);

// Errors
app.use((error, req, res, next) => {
  console.error('Error:', { message: error.message, stack: error.stack });
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

// Start
app.listen(PORT, () => {
  console.log(`Art Proof Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  // Start payment reminder service in production
  if (process.env.NODE_ENV === 'production') {
    paymentReminderService.start();
  } else {
    console.log('Payment reminder service not started in development mode');
  }
});

module.exports = app;
