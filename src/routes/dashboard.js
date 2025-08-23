const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Main dashboard - shows all available tools
router.get('/', requireAuth, (req, res) => {
  res.render('dashboard', {
    user: req.user,
    cspNonce: res.locals.cspNonce
  });
});

// Quote Builder route
router.get('/quote-builder', requireAuth, (req, res) => {
  res.render('quote-builder', {
    user: req.user,
    cspNonce: res.locals.cspNonce
  });
});

module.exports = router;