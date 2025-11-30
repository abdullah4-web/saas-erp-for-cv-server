// CommonJS
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function runWithTenant(companyId, fn) {
  return als.run({ companyId }, fn);
}

function getTenantId() {
  return als.getStore()?.companyId || null;
}

module.exports = { runWithTenant, getTenantId };
