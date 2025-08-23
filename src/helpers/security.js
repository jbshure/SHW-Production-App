const crypto = require('crypto');

function safeEqual(a, b) {
  if (!a || !b) return false;
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

// Accept base64url 32-byte tokens (43/44 chars) or long hex tokens
function looksLikeToken(t) {
  return typeof t === 'string' && t.length >= 40 && t.length <= 128;
}

function mdEscape(s = '') {
  return String(s).replace(/([\\`*_{}\[\]()#+\-.!>~|])/g, '\\$1');
}

module.exports = { safeEqual, looksLikeToken, mdEscape };