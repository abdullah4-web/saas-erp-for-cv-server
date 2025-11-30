const express = require('express');
const router = express.Router();
const User = require('../models/userModel');
const { assignPermissionsToRole, createRole, rolePermissions } = require('../rolePermissions');
const hasPermission = require('../hasPermission');
const permissions = require('../permissions');
const fs = require('fs');
const path = require('path');
const { isAuth } = require('../utils');
const { getIO, notifyPermissionChange } = require('../socket'); // Import socket functions

// Get all available permissions
router.get('/', (req, res) => { 
  res.json(Object.values(permissions));
});

// Create a new role
router.post('/create-role', async (req, res) => {
  const { roleName, permissionsArray } = req.body;

  if (!roleName || !Array.isArray(permissionsArray)) {
    return res.status(400).json({ message: 'Role name and permissions are required.' });
  }

  // Create the role and assign permissions
  createRole(roleName, permissionsArray);

  res.status(201).json({ message: `Role "${roleName}" created successfully`, permissions: permissionsArray });
});

// Update role permissions
router.post('/update-role-permissions', async (req, res) => {
  const { role, newPermissions } = req.body;

  // Update rolePermissions object in memory
  rolePermissions[role] = newPermissions;

  // Write updated rolePermissions to file
  updateRolePermissionsFile();

  // Find all users with the affected role in the database
  const affectedUsers = await User.find({ role });

  // Update permissions for affected users
  const updatedPermissions = assignPermissionsToRole(role);
  await User.updateMany(
    { role },
    { $set: { permissions: updatedPermissions } }
  );

  // Notify each affected user of the permission change
  affectedUsers.forEach(user => {
    notifyPermissionChange(user._id); // Notify each user with the updated role
  });

  res.status(200).json({ message: 'Role permissions updated successfully' });
});

// Delete a role
router.delete('/delete-role', async (req, res) => {
  const { roleName } = req.body;

  if (!roleName || !rolePermissions[roleName]) {
    return res.status(404).json({ message: 'Role not found.' });
  }

  // Remove the role from rolePermissions object
  delete rolePermissions[roleName];

  // Write updated rolePermissions to file
  updateRolePermissionsFile();

  // Optionally, remove the role from users in the database
  const affectedUsers = await User.updateMany(
    { role: roleName },
    { $unset: { role: 1, permissions: 1 } }
  );

  // Notify each affected user of the role deletion
  affectedUsers.forEach(user => {
    notifyPermissionChange(user._id); // Notify each user affected by the role deletion
  });

  res.status(200).json({ message: `Role "${roleName}" deleted successfully` });
});

// Helper function to update the rolePermissions file
const updateRolePermissionsFile = () => {
  const rolePermissionsPath = path.join(__dirname, '../rolePermissions.json');
  fs.writeFileSync(rolePermissionsPath, JSON.stringify(rolePermissions, null, 2));
};

module.exports = router;
