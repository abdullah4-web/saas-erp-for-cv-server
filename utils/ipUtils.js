// Normalize to IPv4 helper
function normalizeToIPv4(ip) {
  if (!ip) return 'unknown';

  // Remove IPv6 prefix if present (like "::ffff:192.168.1.1")
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }

  // If it's "::1" (localhost IPv6), map to 127.0.0.1
  if (ip === '::1') return '127.0.0.1';

  return ip;
}

module.exports = { normalizeToIPv4 };
