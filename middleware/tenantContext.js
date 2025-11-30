// /middleware/tenantContext.js
const { runWithTenant } = require('../lib/tenantContext');

// Assumes req.user.company is set by auth middleware
module.exports = function tenantContext() {
  return function (req, res, next) {
    const companyId =
      req.user?.company?.toString() ||
      req.headers['x-company-id'] || // fallback for service-to-service calls
      null;

    return runWithTenant(companyId, () => next());
  };
};
