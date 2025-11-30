const express = require('express');
const Bounce = require('../models/bounceModel');
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');
const Payroll = require('../models/payrollModel');
const router = express.Router();

// POST /api/bounces - Create a new bounce
// POST /api/bounces - Create a new bounce
router.post('/', isAuth, hasPermission(['bounce_management']), async (req, res) => {
  try {
    let { user, amount, month, description } = req.body;

    // 🔒 Ensure amount is a Number
    amount = Number(amount);
    if (isNaN(amount)) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid number.'
      });
    }

    // Step 1: Find payroll for the user and month
    const payroll = await Payroll.findOne({ user, month });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        error: 'Payroll not found for the given user and month.'
      });
    }

    // ✅ Step 2: Prevent adding bounce if payroll is already paid
    if (payroll.paid) {
      return res.status(400).json({
        success: false,
        error: 'Cannot create bounce because payroll is already approved and paid.'
      });
    }

    // Step 3: Create the bounce
    const bounce = new Bounce({
      user,
      amount,
      month,
      description,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    await bounce.save();

    // Step 4: Initialize numerical fields if undefined
    payroll.totalBonuses = Number(payroll.totalBonuses) || 0;
    payroll.netPayable = Number(payroll.netPayable) || 0;

    // ✅ Correct calculation using numeric addition
    payroll.bonuses.push(bounce._id);
    payroll.totalBonuses += amount;
    payroll.netPayable += amount;

    await payroll.save();

    res.status(201).json({
      success: true,
      data: bounce,
      updatedPayroll: {
        id: payroll._id,
        totalBonuses: payroll.totalBonuses,
        netPayable: payroll.netPayable
      }
    });
  } catch (err) {
    console.error('Error creating bounce:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Bounce already exists for this user and month.'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});
// GET /api/bounces - Get all bounces with pagination
router.get('/', isAuth, hasPermission(['bounce_management']), async (req, res) => {
    try {
        const { page = 1, limit = 10, user, month } = req.query;
        
        const query = {};
        if (user) query.user = user;
        if (month) query.month = new Date(month);

        const bounces = await Bounce.find(query)
            .populate('user', 'name email employee_id')
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ month: -1, createdAt: -1 })
            .exec();

        const count = await Bounce.countDocuments(query);

        res.status(200).json({
            success: true,
            data: bounces,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
});
// GET /api/bounces/:id - Get single bounce
router.get('/single-bonuse/:id', isAuth, hasPermission(['bounce_management']), async (req, res) => {
    try {
        const bounce = await Bounce.findById(req.params.id)
            .populate('user', 'name email employee_id department')
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        if (!bounce) {
            return res.status(404).json({
                success: false,
                error: 'Bounce not found'
            });
        }

        res.status(200).json({
            success: true,
            data: bounce
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
});
// DELETE /api/bounces/:id - Delete bounce
router.delete('/delete-bounse/:id', isAuth, hasPermission(['bounce_management']), async (req, res) => {
    try {
        const bounce = await Bounce.findByIdAndDelete(req.params.id);

        if (!bounce) {
            return res.status(404).json({
                success: false,
                error: 'Bounce not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Server Error'
        });
    }
});

module.exports = router;