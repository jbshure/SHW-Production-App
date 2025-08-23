const { safeEqual } = require('../helpers/security');

function authenticateAPI(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apikey;
  const expected = process.env.API_KEY;
  
  if (!expected || !apiKey || !safeEqual(apiKey, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  return next();
}

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Store the original URL for redirect after login
  req.session.returnTo = req.originalUrl;
  
  // For API requests, return JSON
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Authentication required', loginUrl: '/auth/google' });
  }
  
  // For page requests, redirect to login
  res.redirect('/login');
}

function requireAuthOrAPI(req, res, next) {
  // First try Google OAuth
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Fallback to API key for backward compatibility
  const apiKey = req.headers['x-api-key'] || req.query.apikey;
  const expected = process.env.API_KEY;
  
  if (expected && apiKey && safeEqual(apiKey, expected)) {
    return next();
  }
  
  // Neither auth method worked
  req.session.returnTo = req.originalUrl;
  
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Authentication required', loginUrl: '/auth/google' });
  }
  
  res.redirect('/login');
}

module.exports = { authenticateAPI, requireAuth, requireAuthOrAPI };