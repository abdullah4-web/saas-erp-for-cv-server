const logger = require('../logger/index');
const ApiLog = require('../models/ApiLog');
const ErrorLog = require('../models/errorLog');
const sendAlertEmail = require('../utils/emailAlert');
const { normalizeToIPv4 } = require('../utils/ipUtils');

const logApiRequest = async (req, res, next) => {
  const publicIpRaw =
    (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
    (req.socket && req.socket.remoteAddress) ||
    (req.connection && req.connection.remoteAddress) ||
    'unknown';
  const publicIp = normalizeToIPv4(publicIpRaw);

  const localIpRaw = (req.socket && req.socket.localAddress) || 'unknown';
  const localIp = normalizeToIPv4(localIpRaw);

  const startTime = Date.now();

  res.on('finish', async () => {
    const duration = Date.now() - startTime;

    const baseLog = {
      user: req.user ? req.user._id : null,
      ip: publicIpRaw,    // original public/raw IP
      ipV4: publicIp,     // normalized IPv4 public IP
      localIp,            // local LAN IP
      method: req.method,
      endpoint: req.originalUrl,
      userAgent: req.headers['user-agent'],
      statusCode: res.statusCode,
      responseTime: duration
    };

    if (res.statusCode >= 500 && res.locals.error) {
      const errorLog = {
        ...baseLog,
        errorMessage: res.locals.error.message,
        stackTrace: res.locals.error.stack
      };

      logger.error({ message: 'API Error', ...errorLog });
      await ErrorLog.create(errorLog);

      await sendAlertEmail({
        subject: `🚨 API Error at ${req.originalUrl}`,
        htmlContent: `
          <h3>🚨 API Error</h3>
          <p><strong>Public IP:</strong> ${publicIp}</p>
          <p><strong>Local IP:</strong> ${localIp}</p>
          <p><strong>Method:</strong> ${req.method}</p>
          <p><strong>Endpoint:</strong> ${req.originalUrl}</p>
          <p><strong>Status:</strong> ${res.statusCode}</p>
          <p><strong>Error:</strong> ${res.locals.error ? res.locals.error.message : 'Unknown'}</p>
          <pre style="background:#f5f5f5;padding:10px;border:1px solid #ccc;">
${res.locals.error ? res.locals.error.stack : 'No stack trace available'}
          </pre>
        `
      });
    } else {
      logger.info({ message: 'API Hit', ...baseLog });
      await ApiLog.create(baseLog);
    }
  });

  next();
};

module.exports = logApiRequest;
