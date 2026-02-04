const crypto = require('node:crypto');

function extensionIdFromKey(base64Key) {
  const raw = Buffer.from(base64Key, 'base64');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const first32 = hash.slice(0, 32);
  return first32.replace(/[0-9a-f]/g, (ch) => {
    const val = parseInt(ch, 16);
    return String.fromCharCode('a'.charCodeAt(0) + val);
  });
}

module.exports = { extensionIdFromKey };
