// middleware/index.js
const jwt = require('jsonwebtoken');
const winston = require('winston');
const mongoose = require('mongoose');

const ApiLog = require('../server/models/apiLogModel');
const BlockedIP = require('./models/blockIpModel');
const sendAlertEmail = require('./utils/emailAlert');

// Tenant context (AsyncLocalStorage) helper — uses same pattern discussed earlier
const { runWithTenant } = require('./lib/tenantContext'); // make sure this file exists
const { normalizeToIPv4 } = require('./utils/ipUtils');

// Setup Winston logger (kept your config)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/api.log' }),
    new winston.transports.Console()
  ]
});

// Token generator - includes company id
const generateToken = (user) => {
  return jwt.sign({
    _id: user._id,
    name: user.name,
    pipeline: user.pipeline,
    branch: user.branch,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    products: user.products,
    phone: user.phone,
    department: user.department,
    company: user.company, // <-- important
    emp_code: user.emp_code,
    employee_id: user.employee_id,
    position: user.position,
    areas: user.areas
  }, process.env.JWT_SECRET, { expiresIn: '12h' });
};

// Frontend secret verification
const isFromFrontend = (req) => {
  const secret = req.headers['x-custom-secret'];
  return secret && secret === process.env.FRONTEND_SECRET;
};

// Helper to safely create ApiLog with company if available
async function safeCreateApiLog(doc) {
  try {
    await ApiLog.create(doc);
  } catch (err) {
    logger.error({ message: 'Failed to save ApiLog', error: err.message, stack: err.stack });
  }
}

// Main auth middleware (verifies token, attaches req.user and req.companyId, initializes tenant context)
const isAuth = async (req, res, next) => {
  const ipRaw =
    req.headers['x-forwarded-for']?.split(',').shift() ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown';

  const ipV4 = normalizeToIPv4(ipRaw);
  const localIp = req.socket?.localAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  // // 1️⃣ Blocked IP check
  // try {
  //   const blocked = await BlockedIP.findOne({ ip: ipRaw }).lean();
  //   if (blocked) {
  //     logger.warn({ message: 'Blocked IP attempted access', ip: ipRaw, userAgent });
  //     sendAlertEmail({
  //       subject: '🚨 Blocked IP Attempt',
  //       text: `Blocked IP ${ipRaw} attempted access.\nPath: ${req.originalUrl}\nUA: ${userAgent}`,
  //     }).catch(() => {});
  //     await safeCreateApiLog({
  //       user: null,
  //       ip: ipRaw,
  //       ipV4,
  //       localIp,
  //       method: req.method,
  //       endpoint: req.originalUrl,
  //       userAgent,
  //       statusCode: 403,
  //       responseTime: 0,
  //       errorMessage: 'Blocked IP',
  //     });
  //     return res.status(403).json({ message: 'Access Denied' });
  //   }
  // } catch (err) {
  //   logger.error({ message: 'Error checking BlockedIP', error: err.message });
  // }

  // // 2️⃣ Check frontend origin
  // if (!isFromFrontend(req)) {
  //   logger.warn({ message: 'Unauthorized origin attempt', ip: ipRaw, userAgent });
  //   try {
  //     await BlockedIP.updateOne(
  //       { ip: ipRaw },
  //       { $setOnInsert: { ip: ipRaw, reason: 'Unauthorized origin', createdAt: new Date() } },
  //       { upsert: true }
  //     );
  //   } catch (err) {
  //     logger.error({ message: 'Failed to upsert BlockedIP', error: err.message });
  //   }
  //   await safeCreateApiLog({
  //     user: null,
  //     ip: ipRaw,
  //     ipV4,
  //     localIp,
  //     method: req.method,
  //     endpoint: req.originalUrl,
  //     userAgent,
  //     statusCode: 403,
  //     responseTime: 0,
  //     errorMessage: 'Unauthorized Origin',
  //   });
  //   return res.status(403).json({ message: 'Unauthorized Origin - IP Blocked' });
  // }

  // 3️⃣ Token validation
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    logger.warn({ message: 'Missing token', ip: ipRaw, userAgent });
    await safeCreateApiLog({
      user: null,
      ip: ipRaw,
      ipV4,
      localIp,
      method: req.method,
      endpoint: req.originalUrl,
      userAgent,
      statusCode: 401,
      responseTime: 0,
      errorMessage: 'No Token',
    });
    return res.status(401).json({ message: 'No Token' });
  }

  try {
    const startTime = Date.now();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    req.companyId = decoded.company || decoded.companyId || null;

    if (!req.companyId) {
      logger.warn({ message: 'Token missing company ID', ip: ipRaw, userAgent });
      await safeCreateApiLog({
        user: decoded?.id || null,
        ip: ipRaw,
        ipV4,
        localIp,
        method: req.method,
        endpoint: req.originalUrl,
        userAgent,
        statusCode: 400,
        responseTime: Date.now() - startTime,
        errorMessage: 'Invalid tenant context',
      });
      return res.status(400).json({ message: 'Invalid tenant context' });
    }

    // 4️⃣ Patch Mongoose globally for tenant filtering
    const originalExec = mongoose.Query.prototype.exec;
    mongoose.Query.prototype.exec = function () {
      if (this.model.schema.paths.company && !this.options._companyId && req.companyId) {
        this.setOptions({ _companyId: req.companyId });
      }
      return originalExec.apply(this, arguments);
    };

    // 5️⃣ Proceed with tenant context
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      await safeCreateApiLog({
        user: decoded?.id || null,
        ip: ipRaw,
        ipV4,
        localIp,
        method: req.method,
        endpoint: req.originalUrl,
        userAgent,
        statusCode: res.statusCode,
        responseTime: duration,
      });
    });

    return runWithTenant(String(req.companyId), () => next());
  } catch (err) {
    logger.warn({ message: 'Invalid token', ip: ipRaw, userAgent, error: err.message });
    await safeCreateApiLog({
      user: null,
      ip: ipRaw,
      ipV4,
      localIp,
      method: req.method,
      endpoint: req.originalUrl,
      userAgent,
      statusCode: 401,
      responseTime: 0,
      errorMessage: err.message,
      stackTrace: err.stack,
    });
    return res.status(401).json({ message: 'Invalid Token' });
  }
};

// Role-based access control (accepts array of allowed roles)
const hasRole = (roles) => {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      return next();
    }
    logger.warn({
      message: 'Unauthorized role access',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
      user: req.user || null
    });
    return res.status(401).send({ message: 'Unauthorized' });
  };
};

// Permission-based access control
// Permission-based access control
const hasPermission = (permissions) => {
  return (req, res, next) => {
    if (req.user && Array.isArray(req.user.permissions)) {
      // If permissions is a string → check directly
      if (typeof permissions === 'string' && req.user.permissions.includes(permissions)) {
        return next();
      }

      // If permissions is an array → check if any match
      if (Array.isArray(permissions) && permissions.some(p => req.user.permissions.includes(p))) {
        return next();
      }
    }

    logger.warn({
      message: 'Permission denied',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
      user: req.user || null,
      requiredPermissions: permissions
    });

    return res.status(403).send({ message: 'Permission Denied' });
  };
};


// Rate limiter (company-aware: key = company:ip). Simple in-memory implementation preserved, but namespaced per company
const rateLimit = {};
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100;

const rateLimiter = async (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown';
  const companyId = req.companyId || 'global';
  const now = Date.now();
  const key = `${companyId}:${ip}`;

  if (!rateLimit[key]) rateLimit[key] = [];

  // Keep only requests within the time window
  rateLimit[key] = rateLimit[key].filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (rateLimit[key].length >= MAX_REQUESTS) {
    logger.warn({ message: 'Rate limit exceeded', ip, company: companyId });

    // Auto-block repeat abusers (attempt best-effort)
    try {
      await BlockedIP.updateOne(
        { ip },
        { $setOnInsert: { ip, reason: `Rate limit exceeded (${companyId})`, createdAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      logger.error({ message: 'Error blocking abusive IP', error: err.message });
    }

    // send alert email with company context
    try {
      await sendAlertEmail({
        subject: '⚠️ Rate Limit Exceeded',
        text: `IP: ${ip}\nCompany: ${companyId}\nPath: ${req.originalUrl}\nUser-Agent: ${req.headers['user-agent'] || 'unknown'}`
      });
    } catch (err) {
      logger.error({ message: 'Failed to send rate-limit alert email', error: err.message });
    }

    return res.status(429).json({ message: 'Too many requests. Your IP has been blocked.' });
  }

  // Record the new request
  rateLimit[key].push(now);
  next();
};

// Audit logger (adds company if available)
const auditLogger = (req, res, next) => {
  const logEntry = {
    user: req.user ? { _id: req.user._id, email: req.user.email } : null,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    method: req.method,
    path: req.originalUrl,
    company: req.companyId || null,
    timestamp: new Date()
  };
  logger.info(logEntry);
  next();
};

// logRequest - saves ApiLog with status code and company context
const logRequest = async (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const method = req.method;
  const url = req.originalUrl;
  const company = req.companyId || null;

  res.on('finish', async () => {
    const statusCode = res.statusCode;
    try {
      await ApiLog.create({ ip, userAgent, method, url, statusCode, company, timestamp: new Date() });
    } catch (err) {
      logger.error({ message: 'Failed to save API log', error: err.message });
    }
  });

  next();
};

// blockBlockedIPs with tenant-aware alert (keeps blocking global but notifies with company info if present)
const blockBlockedIPs = async (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown';
  try {
    const blocked = await BlockedIP.findOne({ ip }).lean();
    if (blocked) {
      logger.warn({ message: 'Blocked IP attempted access', ip });
      await sendAlertEmail({
        subject: '🚨 Blocked IP Access Attempt',
        text: `IP: ${ip} tried to access your API\nPath: ${req.originalUrl}\nCompany: ${req.companyId || 'N/A'}`
      }).catch(() => {});
      return res.status(403).send({ message: 'Access Denied Due IP Blocked' });
    }
  } catch (err) {
    logger.error({ message: 'Error checking BlockedIP', error: err.message });
    // continue to avoid false positives due to DB error
  }
  next();
};

// Skip lists used by verifyFrontendOrigin
const skipPaths = [
  '/api/users/login',
  '/api/users/forgot-password',
  '/path/to/intlTelInput.js',
  '/path/to/intlTelInput.css',
];

const skipExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp'];

// verifyFrontendOrigin - preserves your behavior but includes company when alerting
const verifyFrontendOrigin = async (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const path = req.path;

  if (skipPaths.includes(path)) return next();
  if (skipExtensions.some(ext => path.endsWith(ext))) return next();

  const secret = req.headers['x-custom-secret'];
  if (secret && secret === process.env.FRONTEND_SECRET) return next();

  // Block & alert
  try {
    await BlockedIP.updateOne(
      { ip },
      {
        $setOnInsert: {
          ip,
          reason: 'Unauthorized origin (global block)',
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (err) {
    logger.error({ message: 'Error blocking IP due to origin', error: err.message });
  }

  logger.warn({ message: 'Unauthorized origin - IP Blocked globally', ip, userAgent });
  await sendAlertEmail({
    subject: '🚨 Unauthorized Origin Blocked',
    text: `IP: ${ip}\nPath: ${req.originalUrl}\nCompany: ${req.companyId || 'N/A'}\nUser-Agent: ${userAgent}`
  }).catch(() => {});

  return res.status(403).json({ message: 'Unauthorized Origin - IP Blocked' });
};

// enforceTrustedOrigin - preserves original checks, allows frontend secret override
const enforceTrustedOrigin = (req, res, next) => {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const trusted = process.env.TRUSTED_ORIGIN || 'http://localhost:3000';

  if (isFromFrontend(req)) return next();

  if (origin && origin !== trusted) {
    logger.warn({ message: 'Untrusted origin', origin, ip: req.ip });
    return res.status(403).json({ message: 'Untrusted origin' });
  }

  if (referer && !referer.startsWith(trusted)) {
    logger.warn({ message: 'Untrusted referer', referer, ip: req.ip });
    return res.status(403).json({ message: 'Untrusted referer' });
  }

  next();
};

module.exports = {
  generateToken,
  isAuth,
  hasRole,
  hasPermission,
  rateLimiter,
  isFromFrontend,
  auditLogger,
  logRequest,
  blockBlockedIPs,
  verifyFrontendOrigin,
  enforceTrustedOrigin,
  logger // export logger in case other modules import this file previously
};
