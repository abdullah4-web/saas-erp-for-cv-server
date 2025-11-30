const express = require('express');
const router = express.Router();
const Branch = require('../models/branchModel');
const { isAuth } = require('../utils');

// Create a new branch
router.post('/create-branch', isAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Branch name is required' });
    }

    const newBranch = new Branch({
      name,
      delstatus: false,
      company: req.user.company, // Assign the authenticated user's company
    });

    await newBranch.save();
    res.status(201).json(newBranch);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ message: 'Error creating branch', error: error.message });
  }
});

// Get all active branches for the authenticated user's company
router.get('/get-branches', isAuth, async (req, res) => {
  try {
    const branches = await Branch.find({
      company: req.user.company,
      delstatus: false,
    });

    res.status(200).json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ message: 'Error fetching branches', error: error.message });
  }
});

// Update a branch by ID (only if it belongs to the user's company)
router.put('/update-branch/:id', isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Branch name is required' });
    }

    const updatedBranch = await Branch.findOneAndUpdate(
      { _id: id, company: req.user.company },
      { name },
      { new: true, runValidators: true }
    );

    if (!updatedBranch) {
      return res.status(404).json({ message: 'Branch not found for this company' });
    }

    res.status(200).json(updatedBranch);
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ message: 'Error updating branch', error: error.message });
  }
});

// Soft delete a branch by ID (only if it belongs to the user's company)
router.delete('/delete-branch/:id', isAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedBranch = await Branch.findOneAndUpdate(
      { _id: id, company: req.user.company },
      { delstatus: true },
      { new: true }
    );

    if (!deletedBranch) {
      return res.status(404).json({ message: 'Branch not found for this company' });
    }

    res.status(200).json({ message: 'Branch soft deleted successfully', branch: deletedBranch });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ message: 'Error deleting branch', error: error.message });
  }
});

module.exports = router;
