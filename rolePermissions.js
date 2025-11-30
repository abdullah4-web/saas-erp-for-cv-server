const fs = require('fs');
const path = require('path');

// Path to the JSON file storing role permissions
const rolePermissionsPath = path.join(__dirname, './rolePermissions.json');

// Load rolePermissions from the JSON file
let rolePermissions = {};

// If the JSON file exists, load its contents into memory
if (fs.existsSync(rolePermissionsPath)) {
  rolePermissions = JSON.parse(fs.readFileSync(rolePermissionsPath, 'utf-8'));
} else {
  // Default role permissions if file does not exist
  rolePermissions = {
    "Admin": [
      "create_user",
      "read_user",
      "update_user",
      "delete_user",
      "create_lead",
      "read_lead",
      "update_lead",
      "delete_lead",
      "check_lead",
      "crm_dashboard"
    ]
  };
  fs.writeFileSync(rolePermissionsPath, JSON.stringify(rolePermissions, null, 2));
}

// Function to assign permissions to a role
const assignPermissionsToRole = (role) => {
  return rolePermissions[role] || [];
};

// Function to create a new role
const createRole = (roleName, permissionsArray) => {
  // Update the rolePermissions object in memory
  rolePermissions[roleName] = permissionsArray;

  // Persist the updated rolePermissions object to the JSON file
  fs.writeFileSync(rolePermissionsPath, JSON.stringify(rolePermissions, null, 2));
};

module.exports = { assignPermissionsToRole, rolePermissions, createRole };
