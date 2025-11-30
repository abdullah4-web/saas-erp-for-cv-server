// routes/payroll.js

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Payroll = require('../models/payrollModel');
const Salary = require('../models/salaryModel');
const Attendance = require('../models/attendenceModel');
const Penalty = require('../models/penaltyModel');
const Leave = require('../models/leaveModel');
const User = require('../models/userModel');
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');
const advancePaymentModel = require('../models/advancePaymentModel');
const getPreviousMonthKey = () => {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}
router.post('/generate', isAuth, hasPermission(['generate_payroll']), async (req, res) => {
  try {
    const monthKey = getPreviousMonthKey();
    const totalWorkingDays = 30;
    const currentUser = req.user._id;

    const users = await User.find({ status: 'Active' }).select('_id name email department position');

    for (const user of users) {
      const userId = user._id;

      const salary = await Salary.findOne({ user: userId });
      if (!salary) {
        console.log(`No salary record found for user ${user.name} (${user._id})`);
        continue;
      }

      // Get all attendances for the month
      const attendances = await Attendance.find({
        user: userId,
        Date: {
          $gte: new Date(`${monthKey}-01`),
          $lt: new Date(`${monthKey}-31`)
        }
      });

      // Get absent days
      const absentAttendances = attendances.filter(a => a.check_in_status === 'absent');
      const absentDays = absentAttendances.length;

      // Get approved penalties
      const penalties = await Penalty.find({
        user: userId,
        month: monthKey,
        status: 'Approved'
      });

      const approvedAdvance = await advancePaymentModel.findOne({
        user: userId,
        month: monthKey,
        status: 'Approved'
      });
      let advanceDeduction = 0;
      let advancePaymentId = null;
      // Get approved leaves that overlap with the month
      const leaves = await Leave.find({
        user: userId,
        start_date: { $lte: new Date(`${monthKey}-31`) },
        end_date: { $gte: new Date(`${monthKey}-01`) },
        status: 'Approved'
      });

      const monthStart = new Date(`${monthKey}-01`);
      const monthEnd = new Date(`${monthKey}-31`);

      let fullPayLeaveDays = 0;
      let halfPayLeaveDays = 0;
      let unpaidLeaveDays = 0;

      // Calculate leave days based on pay option
      leaves.forEach(leave => {
        const start = new Date(Math.max(monthStart, new Date(leave.start_date)));
        const end = new Date(Math.min(monthEnd, new Date(leave.end_date)));
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (leave.pay_option === 'Full Pay') {
          fullPayLeaveDays += days;
        } else if (leave.pay_option === 'Half Pay') {
          halfPayLeaveDays += days;
        } else {
          unpaidLeaveDays += days;
        }
      });

      if (approvedAdvance) {
        advanceDeduction = approvedAdvance.amount;
        advancePaymentId = approvedAdvance._id;
      }

      const dailyRate = salary.totalSalary / totalWorkingDays;

      // Calculate deductions
      const absentDeduction = dailyRate * absentDays;
      const unpaidLeaveDeduction = dailyRate * unpaidLeaveDays;
      const halfPayLeaveDeduction = (dailyRate * halfPayLeaveDays) / 2; // Only deduct half for half-pay leaves

      const basicSalary = salary.basicSalary || 0;
      const totalPenalties = penalties.reduce((sum, p) => sum + p.amount, 0);

      // Total deductions include absent days, unpaid leaves, half of half-pay leaves, and penalties
      const totalDeductions = absentDeduction + unpaidLeaveDeduction + halfPayLeaveDeduction + totalPenalties + advanceDeduction;

      // Net payable is total salary minus all deductions
      const netPayable = parseFloat((salary.totalSalary - totalDeductions).toFixed(2));

      // Check if payroll already exists
      const existingPayroll = await Payroll.findOne({ user: userId, month: monthKey });
      if (existingPayroll) {
        console.log(`Payroll already exists for user ${user.name} (${user._id}) for ${monthKey}`);
        continue;
      }

      // Prepare payroll data
      const payrollData = {
        user: userId,
        month: monthKey,
        salaryReference: salary._id,
        basicSalary: basicSalary,
        totalBonuses: 0,
        totalDeductions: totalDeductions,
        advancePayment: advancePaymentId,
        advancePaymentDeducted: advanceDeduction,
        penalties: penalties.map(p => p._id),
        leaves: leaves.map(l => l._id),
        attendances: attendances.map(a => a._id),
        absences: absentAttendances.map(a => a._id),
        absences_amount: absentDeduction, // ✅ New field added
        netPayable: netPayable,
        status: 'Pending Approval',
        paymentMethod: undefined,
        paymentReference: undefined,
        paymentDate: undefined,
        createdBy: currentUser,
        processedBy: currentUser,
        processedAt: new Date(),
        notes: `Auto-generated payroll for ${monthKey}`
      };

      await Payroll.create(payrollData);
      console.log(`Payroll generated for ${user.name} (${user._id}) for ${monthKey}`);
    }

    res.status(200).json({
      success: true,
      message: `Payroll generation completed for ${monthKey}`,
      month: monthKey,
      usersProcessed: users.length
    });
  } catch (err) {
    console.error('Error generating payroll:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message
    });
  }
});
router.get('/user/:userId', isAuth, hasPermission(['view_payroll']), async (req, res) => {
  const userId = req.params.userId;

  try {
    const payrolls = await Payroll.find({ user: userId })
  .populate({
    path: 'user',
    populate: [
      {
        path: 'position',
        select: 'name'
      },
      {
        path: 'department',
        select: 'name'
      },
      {
        path: 'national',
        select: 'name'
      },
      {
        path: 'company',
        select: 'name'
      }
    ]
  })
      .populate('salaryReference')     // populate salary reference
      .populate('penalties')           // populate penalties
      .populate('leaves')              // populate leaves
      .populate('attendances')         // populate attendances
      .populate('createdBy', 'name email')   // populate createdBy
      .populate('approvedBy', 'name email')  // populate approvedBy
      .populate('processedBy', 'name email') // populate processedBy
      .exec();

    if (!payrolls.length) {
      return res.status(404).json({ message: 'No payroll records found for this user.' });
    }

    res.json(payrolls);
  } catch (err) {
    console.error('Error fetching payrolls:', err);
    res.status(500).json({ message: 'Server error while fetching payrolls.' });
  }
});
// GET all payrolls
router.get('/get-all-payrolls', isAuth, hasPermission(['unapproved_payroll']), async (req, res) => {
  try {
    const payrolls = await Payroll.find({ approved: false })
      .populate({
        path: 'user',
        match: { labour_card_status: 'Active' },
        select: 'name email department position'
      })
      .populate('salaryReference')
      .populate('penalties')
      .populate('leaves')
      .populate('attendances')
      .populate('advancePayment')
      .populate('absences')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('processedBy', 'name email');

    const filteredPayrolls = payrolls.filter(p => p.user); // Remove payrolls with no matched user

    res.status(200).json({
      success: true,
      count: filteredPayrolls.length,
      payrolls: filteredPayrolls
    });
  } catch (err) {
    console.error('Error fetching payrolls:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payrolls',
      error: err.message
    });
  }
});

router.get('/get-unpaid-payrolls', isAuth, hasPermission(['unpaid_payroll']), async (req, res) => {
  try {
    const payrolls = await Payroll.find({ paid: false })
      .populate({
        path: 'user',
        match: { labour_card_status: 'Active' },
        select: 'name email department position'
      })
      .populate('salaryReference')
      .populate('penalties')
      .populate('leaves')
      .populate('attendances')
      .populate('absences')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('processedBy', 'name email');

    const filteredPayrolls = payrolls.filter(p => p.user);

    res.status(200).json({
      success: true,
      count: filteredPayrolls.length,
      payrolls: filteredPayrolls
    });
  } catch (err) {
    console.error('Error fetching payrolls:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payrolls',
      error: err.message
    });
  }
});

router.put('/approve-payrolls', isAuth, hasPermission(['payroll_approval']), async (req, res) => {
  try {
    const { payrollIds } = req.body;
    const approverId = req.user._id;

    if (!Array.isArray(payrollIds) || payrollIds.length === 0) {
      return res.status(400).json({ error: 'payrollIds must be a non-empty array.' });
    }

    const validIds = payrollIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid payroll IDs provided.' });
    }

    const result = await Payroll.updateMany(
      { _id: { $in: validIds } },
      {
        $set: {
          approved: true,
          approvedBy: approverId,
          approvedAt: new Date(),
          status: 'Approved'
        }
      }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} payroll(s) approved successfully.`,
      updatedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Error approving payrolls:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});
// Mark multiple payrolls as paid
router.put('/mark-paid', isAuth, hasPermission(['payroll_payment']), async (req, res) => {
  try {
    const { payrollIds, paymentMethod, paymentReference } = req.body;
    const paidBy = req.user._id;

    if (!Array.isArray(payrollIds) || payrollIds.length === 0) {
      return res.status(400).json({ error: 'payrollIds must be a non-empty array.' });
    }

    const validIds = payrollIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid payroll IDs provided.' });
    }

    const payrolls = await Payroll.find({ _id: { $in: validIds } });

    const notApproved = [];
    const updatedPayrolls = [];

    for (const payroll of payrolls) {
      if (!payroll.approved) {
        notApproved.push(payroll._id);
        continue;
      }

      payroll.status = 'Paid';
      payroll.paymentMethod = paymentMethod || payroll.paymentMethod;
      payroll.paymentReference = paymentReference || payroll.paymentReference;
      payroll.paidBy = paidBy;
      payroll.paid = true;
      payroll.paymentDate = new Date();
      payroll.paidAt = new Date();

      await payroll.save();
      updatedPayrolls.push(payroll._id);
    }

    res.status(200).json({
      success: true,
      message: `${updatedPayrolls.length} payroll(s) marked as paid.`,
      updatedPayrolls,
      notApproved
    });
  } catch (err) {
    console.error('Error marking payrolls as paid:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});
// // GET /api/payroll/:id - Get single payroll by ID
router.get('/single-payroll/:id', isAuth, hasPermission(['view_payroll']), async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id)
      .populate('user', 'name email employee_id')
      .populate('salaryReference')
      .populate('penalties')
      .populate('leaves')
      .populate('attendances')
      .populate('absences')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('processedBy', 'name')
      .populate('paidBy', 'name');

    if (!payroll) {
      return res.status(404).json({ message: 'Payroll not found' });
    }

    res.json(payroll);
  } catch (error) {
    console.error('Error fetching payroll:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// Inline reusable logic
const markPayrollAsPaidInline = async (payroll, paymentMethod, paidBy) => {
  if (!payroll.approved) {
    return { success: false, reason: 'Not approved' };
  }

  let paymentReference = payroll.paymentReference;

  // Auto-generate paymentReference if not provided
  if (!paymentReference) {
    const lastPaidPayroll = await Payroll.findOne({
      paymentReference: { $regex: /^JG-\d{6}$/ },
    })
      .sort({ createdAt: -1 })
      .select('paymentReference');

    let nextNumber = 1;

    if (lastPaidPayroll?.paymentReference) {
      const match = lastPaidPayroll.paymentReference.match(/^JG-(\d{6})$/);
      if (match) {
        const lastNumber = parseInt(match[1], 10);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }
    }

    paymentReference = `JG-${String(nextNumber).padStart(6, '0')}`;
  }

  payroll.status = 'Paid';
  payroll.paymentMethod = paymentMethod || payroll.paymentMethod;
  payroll.paymentReference = paymentReference;
  payroll.paidBy = paidBy;
  payroll.paid = true;
  payroll.paymentDate = new Date();
  payroll.paidAt = new Date();

  await payroll.save();
  return { success: true, id: payroll._id, paymentReference };
};
router.put('/mark-paid/:id', isAuth, hasPermission(['payroll_payment']), async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body;
    const paidBy = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid payroll ID.' });
    }

    const payroll = await Payroll.findById(id);
    if (!payroll) {
      return res.status(404).json({ error: 'Payroll not found.' });
    }

    const result = await markPayrollAsPaidInline(payroll, paymentMethod, paidBy);

    if (!result.success) {
      return res.status(400).json({ error: result.reason || 'Payroll is not approved yet.' });
    }

    res.status(200).json({
      success: true,
      message: 'Payroll marked as paid.',
      payrollId: result.id,
      paymentReference: result.paymentReference,
    });
  } catch (err) {
    console.error('Error marking single payroll as paid:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});
// Route: Get paid payrolls grouped by month
router.get('/paid-by-month', isAuth, hasPermission(['payroll_history']), async (req, res) => {
  try {
    const payrolls = await Payroll.aggregate([
      {
        $match: {
          paid: true,
          status: 'Paid'
        }
      },
      // Join with 'users' for main user
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$userDetails' },

      // Filter only those with labour_card_status: 'Active'
      {
        $match: {
          'userDetails.labour_card_status': 'Active'
        }
      },

      // Join with 'companies'
      {
        $lookup: {
          from: 'companies',
          localField: 'userDetails.company',
          foreignField: '_id',
          as: 'companyDetails'
        }
      },
      { $unwind: { path: '$companyDetails', preserveNullAndEmptyArrays: true } },

      // Join with 'users' for createdBy
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'createdByDetails'
        }
      },
      { $unwind: { path: '$createdByDetails', preserveNullAndEmptyArrays: true } },

      // Join with 'users' for approvedBy
      {
        $lookup: {
          from: 'users',
          localField: 'approvedBy',
          foreignField: '_id',
          as: 'approvedByDetails'
        }
      },
      { $unwind: { path: '$approvedByDetails', preserveNullAndEmptyArrays: true } },

      // Join with 'salaries' using salaryReference
      {
        $lookup: {
          from: 'salaries',
          localField: 'salaryReference',
          foreignField: '_id',
          as: 'salaryDetails'
        }
      },
      { $unwind: { path: '$salaryDetails', preserveNullAndEmptyArrays: true } },

      // Lookup bonuses (Bounce)
      {
        $lookup: {
          from: 'bounces',
          let: { bonusIds: '$bonuses' },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$bonusIds'] } } },
            { $project: { amount: 1, description: 1, createdAt: 1 } }
          ],
          as: 'bonusDetails'
        }
      },

      {
        $lookup: {
          from: 'advancepayments',
          localField: 'advancePayment',
          foreignField: '_id',
          as: 'advancePaymentDetails'
        }
      },
      {
        $unwind: { path: '$advancePaymentDetails', preserveNullAndEmptyArrays: true }
      },

      // Lookup penalties
      {
        $lookup: {
          from: 'penalties',
          let: { penaltyIds: '$penalties' },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$penaltyIds'] } } },
            { $project: { amount: 1, reason: 1, createdAt: 1 } }
          ],
          as: 'penaltyDetails'
        }
      },

      // Group by month
      {
        $group: {
          _id: '$month',
          payrolls: {
            $push: {
              _id: '$_id',
              netPayable: '$netPayable',
              paidAt: '$paidAt',
              approvedAt: '$approvedAt',
              paymentMethod: '$paymentMethod',
              paymentReference: '$paymentReference',
              basicSalary: '$basicSalary',
              otherAllowances: '$otherAllowances',
              totalBonuses: '$totalBonuses',
              absences_amount: '$absences_amount',
              totalDeductions: '$totalDeductions',
              createdAt: '$createdAt',
              salary: {
                basicSalary: '$salaryDetails.basicSalary',
                otherAllowances: '$salaryDetails.otherAllowances',
                totalSalary: '$salaryDetails.totalSalary'
              },
              advancePayment: {
                _id: '$advancePaymentDetails._id',
                amount: '$advancePaymentDetails.amount',
                status: '$advancePaymentDetails.status',
                month: '$advancePaymentDetails.month'
              },

              bonuses: '$bonusDetails',
              penalties: '$penaltyDetails',
              user: {
                _id: '$userDetails._id',
                name: '$userDetails.name',
                email: '$userDetails.email',
                labour_card_status: '$userDetails.labour_card_status',
                company: {
                  name: '$companyDetails.name'
                }
              },
              createdBy: {
                _id: '$createdByDetails._id',
                name: '$createdByDetails.name'
              },
              approvedBy: {
                _id: '$approvedByDetails._id',
                name: '$approvedByDetails.name'
              }
            }
          },
          count: { $sum: 1 },
          netPayable: { $sum: '$netPayable' }
        }
      },
      {
        $sort: { _id: -1 } // latest month first
      }
    ]);

    res.status(200).json({ success: true, data: payrolls });
  } catch (error) {
    console.error('Error fetching payrolls:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
module.exports = router;
