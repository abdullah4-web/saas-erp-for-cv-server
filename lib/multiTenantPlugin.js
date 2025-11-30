// lib/multiTenantPlugin.js
module.exports = function multiTenant(schema) {
  // Only apply company filter if schema has a `company` field
  schema.pre(/^find/, function (next) {
    if (this.model.schema.paths.company && this.options._companyId) {
      this.where({ company: this.options._companyId });
    }
    next();
  });

  schema.pre(/^count/, function (next) {
    if (this.model.schema.paths.company && this.options._companyId) {
      this.where({ company: this.options._companyId });
    }
    next();
  });

  schema.pre(/^aggregate/, function (next) {
    if (this.options._companyId) {
      this.pipeline().unshift({ $match: { company: this.options._companyId } });
    }
    next();
  });
};
