// routes/leadTypeRoutes.js
const express = require('express');
const router = express.Router();
const LeadType = require('../models/leadTypeModel');
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');

// ✅ Create a new LeadType
router.post('/', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const leadType = new LeadType({
      company: req.user.company,       // 🔹 company from logged-in user
      name: req.body.name,
      created_by: req.user._id         // 🔹 created_by = current user
    });

    await leadType.save();
    res.status(201).json(leadType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ✅ Get all LeadTypes (excluding soft-deleted ones, scoped to company)
router.get('/get-all-leadtypes', isAuth, async (req, res) => {
  try {
    const leadTypes = await LeadType.find({
      company: req.user.company,
      delstatus: false
    });
    res.json(leadTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Get a single LeadType by ID
router.get('/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const leadType = await LeadType.findOne({
      _id: req.params.id,
      company: req.user.company,
      delstatus: false
    });

    if (!leadType) {
      return res.status(404).json({ message: 'LeadType not found' });
    }
    res.json(leadType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Update a LeadType by ID
router.put('/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const leadType = await LeadType.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      {
        name: req.body.name,
        created_by: req.user._id
      },
      { new: true }
    );

    if (!leadType) {
      return res.status(404).json({ message: 'LeadType not found' });
    }
    res.json(leadType);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ✅ Soft delete a LeadType by ID
router.put('/delete/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const leadType = await LeadType.findOne({
      _id: req.params.id,
      company: req.user.company
    });

    if (!leadType) {
      return res.status(404).json({ message: 'LeadType not found' });
    }

    leadType.delstatus = true;
    await leadType.save();

    res.json({ message: 'LeadType soft deleted successfully', leadType });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
