const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../models/attendenceModel');
const Salary = require('../models/salaryModel');
const Penalty = require('../models/penaltyModel');
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');
const router = express.Router();

const getMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

router.post('/generate-penalties', isAuth, hasPermission(['generate_penalty']), async (req, res) => {
  try {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = getMonthKey(prevMonth);

    const startOfMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
    const endOfMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0, 23, 59, 59, 999);

  //  // Step 1: Check if any user has 'Missing Check-in' or 'Missing Check-out'
  //   const countMissing = await Attendance.countDocuments({
  //     Date: { $gte: startOfMonth, $lte: endOfMonth },
  //     $or: [
  //       { check_in_status: 'Missing Check-in' },
  //       { check_out_status: 'Missing Check-out' },
  //     ],
  //   });

  //   if (countMissing > 0) {
  //     return res.status(400).json({
  //       message: 'Penalties not generated because some users have missing check-in or check-out records.',
  //       penaltiesCreated: 0,
  //       reason: 'Attendance incomplete for at least one user.',
  //     });
  //   }

    // Step 2: Get 'Late' check-ins grouped by user and collect dates & punch times
    const lateAttendances = await Attendance.aggregate([
      {
        $match: {
          check_in_status: 'Late',
          Date: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: '$user',
          lateCount: { $sum: 1 },
          lateDetails: {
            $push: { date: '$Date', punchTime: '$check_in_time' },
          },
        },
      },
    ]);

    let penaltiesCreated = 0;

    for (const record of lateAttendances) {
      const userId = record._id.toString();
      const lateCount = record.lateCount;
      const lateDetails = record.lateDetails;

      const fullPenaltyDays = Math.floor(lateCount / 3);
      if (fullPenaltyDays < 1) continue;

      const existingPenalty = await Penalty.findOne({ user: userId, month: prevMonthKey, category: 'Attendance' });
      if (existingPenalty) continue;

      const salary = await Salary.findOne({ user: userId });
      if (!salary || !salary.totalSalary) continue;

      const perDaySalary = salary.totalSalary / 26;
      const penaltyAmount = parseFloat((perDaySalary * fullPenaltyDays).toFixed(2));

      // Format the late dates and punch times for the reason
      const lateDatesList = lateDetails
        .map(item => {
          const date = new Date(item.date);
          const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
          return `${formattedDate} (${item.punchTime || 'N/A'})`;
        })
        .join(', ');

      const reason = `${lateCount} late check-ins = ${fullPenaltyDays} day(s) penalty. Dates: ${lateDatesList}`;

      await Penalty.create({
        user: userId,
        category: 'Attendance',
        reason,
        month: prevMonthKey,
        amount: penaltyAmount,
        status: 'Pending',
        createdBy: req.user._id, // Assuming req.user contains the authenticated user
      });

      penaltiesCreated++;
    }

    res.status(200).json({
      message: 'Penalties for previous month calculated successfully.',
      penaltiesCreated,
    });
  } catch (err) {
    console.error('Generate Penalties Error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
// ✅ New route to get all penalties and populate user name
router.get('/get-penalties', isAuth, hasPermission(['view_penalty']), async (req, res) => {
  try {
    const penalties = await Penalty.find()
      .populate({
        path: 'user',
        select: 'name labour_card_status',
        match: { labour_card_status: 'Active' }
      })
      .sort({ month: -1 });

    // Filter out penalties where user didn't match (i.e. user is null)
    const filteredPenalties = penalties.filter(p => p.user);

    res.status(200).json(filteredPenalties);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch penalties.' });
  }
});

// POST /api/penalty/create
router.post('/create', isAuth, hasPermission(['create_penalty']), async (req, res) => {
  try {
      const {
          user,
          category,
          reason,
          month,
          amount,
          status       // optional, will default to 'Pending' if not provided
      } = req.body;

      // Basic validation
      if (!user || !category || !month || !amount) {
          return res.status(400).json({ message: 'user, category, month, and amount are required.' });
      }

      const penalty = new Penalty({
          user,
          category,
          reason,
          month,
          amount,
          status,
          createdBy: req.user._id, 
      });

      await penalty.save();

      res.status(201).json({ message: 'Penalty created successfully', penalty });

  } catch (err) {
      console.error('Create Penalty Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});
// Route to approve or reject a penalty
router.put('/change-status', isAuth, hasPermission(['approve_penalty']), async (req, res) => {
  try {
    const { penaltyIds, status } = req.body;
    const userId = req.user._id;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Only "Approved" or "Rejected" allowed.' });
    }
    if (!Array.isArray(penaltyIds) || penaltyIds.length === 0) {
      return res.status(400).json({ message: 'penaltyIds must be a non-empty array' });
    }
    if (req.user.role !== 'CEO' && req.user.role !== 'MD') {
      return res.status(403).json({ message: 'Permission denied' });
    }

    const results = {
      updated: [],
      skipped: [],
      notFound: [],
      errors: []
    };

    // Process penalties in parallel
    await Promise.all(
      penaltyIds.map(async (penaltyId) => {
        try {
          const penalty = await Penalty.findById(penaltyId);
          if (!penalty) {
            results.notFound.push(penaltyId);
            return;
          }

          if (penalty.status === status) {
            results.skipped.push(penaltyId);
            return;
          }

          penalty.status = status;
          penalty.approvedBy = userId;

          await penalty.save();
          results.updated.push(penaltyId);
        } catch (err) {
          results.errors.push({ penaltyId, error: err.message });
        }
      })
    );

    res.status(200).json({
      message: `Bulk status update completed`,
      results
    });

  } catch (error) {
    console.error('Error updating penalties in bulk:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/edit/:id', isAuth, hasPermission(['edit_penalty']),  async (req, res) => {
  try {
    const penaltyId = req.params.id;
    const userRole = req.user.role;

    // Only CEO or HR can edit
    if (userRole !== 'CEO' && userRole !== 'HR') {
      return res.status(403).json({ message: 'Permission denied' });
    }

    const { category, reason, month, amount } = req.body;

    const penalty = await Penalty.findById(penaltyId);
    if (!penalty) {
      return res.status(404).json({ message: 'Penalty not found' });
    }

    // Update fields if provided
    if (category) penalty.category = category;
    if (reason) penalty.reason = reason;
    if (month) penalty.month = month;
    if (amount !== undefined) penalty.amount = amount;

    await penalty.save();

    res.status(200).json({ message: 'Penalty updated successfully', penalty });
  } catch (error) {
    console.error('Error editing penalty:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
