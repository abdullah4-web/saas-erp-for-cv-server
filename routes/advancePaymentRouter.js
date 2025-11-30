const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');
const User = require('../models/userModel');
const advancePaymentModel = require('../models/advancePaymentModel');

// POST /api/advance-payments/request
router.post('/request', isAuth, async (req, res) => {
    try {
        const { amount, month, reason } = req.body;

        if (!amount || isNaN(amount)) {
            return res.status(400).json({ success: false, error: 'Amount must be a valid number' });
        }

        const advance = new advancePaymentModel({
            user: req.user._id,
            amount: Number(amount),
            month,
            reason,
            createdBy: req.user._id,
            updatedBy: req.user._id
        });

        await advance.save();

        res.status(201).json({ success: true, data: advance });
    } catch (err) {
        console.error('Error requesting advance payment:', err);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});
// PUT /api/advance/approve/:id
router.put('/approve/:id', isAuth, hasPermission(['advance_approval']), async (req, res) => {
    try {
        const advance = await advancePaymentModel.findById(req.params.id);
        if (!advance) {
            return res.status(404).json({ success: false, error: 'Advance payment not found' });
        }

        const { status } = req.body;

        // Validate status
        const validStatuses = ['Approved', 'Rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status value. Must be Approved or Rejected.' });
        }

        // Only allow transition from 'Pending'
        if (advance.status !== 'Pending') {
            return res.status(400).json({ success: false, error: `Cannot ${status.toLowerCase()} an already ${advance.status.toLowerCase()} advance payment.` });
        }

        // Update fields
        advance.status = status;
        advance.approvedBy = req.user._id;
        advance.updatedBy = req.user._id;

        await advance.save();

        const populatedAdvance = await advancePaymentModel.findById(advance._id)
            .populate('user', 'name employee_id')
            .populate('approvedBy', 'name')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        res.status(200).json({ success: true, message: `Advance ${status.toLowerCase()} successfully.`, data: populatedAdvance });
    } catch (err) {
        console.error('Error approving advance:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
// PUT /api/advance/edit/:id
router.put('/edit/:id',  isAuth, hasPermission(['advance_management']), async (req, res) => {
    try {
        const advance = await advancePaymentModel.findById(req.params.id);

        if (!advance) {
            return res.status(404).json({ success: false, error: 'Advance payment not found' });
        }

        // Only editable if status is Pending
        if (advance.status !== 'Pending') {
            return res.status(400).json({ success: false, error: 'Only Pending advances can be edited' });
        }

        // Check permission: user is creator or has Accountant role
        const isCreator = advance.user.toString() === req.user._id.toString();
        const allowedRoles = ['Accountant', 'CEO'];
        const isAuthorizedRole = allowedRoles.includes(req.user.role) || allowedRoles.some(role => req.user.roles?.includes(role));

        if (!isCreator && !isAuthorizedRole) {
            return res.status(403).json({ success: false, error: 'Not authorized to edit this advance payment' });
        }

        // Allowed fields to update
        const { amount, reason, month } = req.body;

        if (amount !== undefined) advance.amount = amount;
        if (reason !== undefined) advance.reason = reason;
        if (month !== undefined) advance.month = month;

        advance.updatedBy = req.user._id;
        await advance.save();

        const updatedAdvance = await advancePaymentModel.findById(advance._id)
            .populate('user', 'name')
            .populate('updatedBy', 'name');

        res.status(200).json({ success: true, message: 'Advance payment updated successfully', data: updatedAdvance });
    } catch (err) {
        console.error('Error updating advance:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});
// POST /api/advance/create-by-accountant
router.post('/create-by-accountant',   isAuth, hasPermission(['advance_management']), async (req, res) => {
  try {
    const userRole = req.user.role;
    const hasRole = userRole === 'Accountant' || req.user.roles?.includes('Accountant');

    if (!hasRole) {
      return res.status(403).json({ success: false, error: 'Only accountants can create advance payments for other users' });
    }

    const { user, amount, month, reason } = req.body;

    if (!user || !amount || !month) {
      return res.status(400).json({ success: false, error: 'User, amount, and month are required' });
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({ success: false, error: 'Month must be in YYYY-MM format' });
    }

    const targetUser = await User.findById(user);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    const advance = new advancePaymentModel({
      user,
      amount,
      month,
      reason,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await advance.save();

    const populated = await advancePaymentModel.findById(advance._id).populate('user', 'name').populate('createdBy', 'name');

    res.status(201).json({ success: true, message: 'Advance payment created successfully', data: populated });
  } catch (err) {
    console.error('Error creating advance by accountant:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
// PUT /api/advance/mark-paid/:id
router.put('/mark-paid/:id',  isAuth, hasPermission(['pay_advance_payment']), async (req, res) => {
  try {
    const allowedRoles = ['Accountant', 'Finance'];
    const isAuthorized = allowedRoles.includes(req.user.role) || allowedRoles.some(role => req.user.roles?.includes(role));

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Only Accountant or Finance users can mark as paid' });
    }

    const advance = await advancePaymentModel.findById(req.params.id);
    if (!advance) {
      return res.status(404).json({ success: false, error: 'Advance payment not found' });
    }

    if (advance.status !== 'Approved') {
      return res.status(400).json({ success: false, error: 'Only approved advances can be marked as paid' });
    }

    if (advance.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, error: 'This advance has already been marked as paid' });
    }

    advance.paymentStatus = 'Paid';
    advance.paidDate = new Date();
    advance.paidBy = req.user._id;
    advance.updatedBy = req.user._id;

    await advance.save();

    const populated = await advancePaymentModel.findById(advance._id)
      .populate('user', 'name')
      .populate('paidBy', 'name')
      .populate('updatedBy', 'name');

    res.status(200).json({ success: true, message: 'Advance marked as paid successfully', data: populated });
  } catch (err) {
    console.error('Error marking advance as paid:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// GET /api/advance
router.get('/get-all-advance-payment', isAuth,  hasPermission(['view_advance_payment']), async (req, res) => {
  try {
    const advances = await advancePaymentModel.find({})
      .populate('user', 'name email')          // who requested
      .populate('approvedBy', 'name')          // who approved
      .populate('paidBy', 'name')              // who marked as paid
      .populate('createdBy', 'name')           // who created the record
      .populate('updatedBy', 'name')           // who last updated
      .sort({ createdAt: -1 });                // newest first

    res.status(200).json({ success: true, data: advances });
  } catch (err) {
    console.error('Error fetching advance payments:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
// GET /api/advance/my-requests
router.get('/my-requests', isAuth, async (req, res) => {
  try {
    const userId = req.user._id;

    const advances = await advancePaymentModel.find({ user: userId })
      .populate('approvedBy', 'name')
      .populate('paidBy', 'name')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: advances });
  } catch (err) {
    console.error('Error fetching user advance payments:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
/////
router.get('/get-pending-advance-payment', isAuth,  hasPermission(['view_advance_payment']), async (req, res) => {
  try {
    const advances = await advancePaymentModel.find({ status: 'Pending' })
      .populate('user', 'name email')          // who requested
      .populate('approvedBy', 'name')          // who approved
      .populate('paidBy', 'name')              // who marked as paid
      .populate('createdBy', 'name')           // who created the record
      .populate('updatedBy', 'name')           // who last updated
      .sort({ createdAt: -1 });                // newest first

    res.status(200).json({ success: true, data: advances });
  } catch (err) {
    console.error('Error fetching advance payments:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
module.exports = router;

