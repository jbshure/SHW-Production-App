const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Import Firebase-compatible config
let config;
try {
  const { getConfig } = require('./firebase-config');
  config = getConfig();
} catch (error) {
  // Fallback to process.env if firebase-config is not available
  config = process.env;
}

// Configure Google OAuth strategy
passport.use(new GoogleStrategy({
  clientID: config.GOOGLE_CLIENT_ID,
  clientSecret: config.GOOGLE_CLIENT_SECRET,
  callbackURL: config.GOOGLE_CALLBACK_URL || "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
  // Check if user email is authorized
  const userEmail = profile.emails[0].value;
  const authorizedDomains = (config.AUTHORIZED_DOMAINS || 'shureprint.com').split(',');
  const authorizedEmails = (config.AUTHORIZED_EMAILS || '').split(',').filter(Boolean);
  
  const isAuthorized = authorizedDomains.some(domain => userEmail.endsWith(`@${domain.trim()}`)) ||
                      authorizedEmails.includes(userEmail);
  
  if (!isAuthorized) {
    return done(null, false, { message: 'Unauthorized email domain' });
  }
  
  // User is authorized
  const user = {
    id: profile.id,
    email: userEmail,
    name: profile.displayName,
    picture: profile.photos[0]?.value
  };
  
  return done(null, user);
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;