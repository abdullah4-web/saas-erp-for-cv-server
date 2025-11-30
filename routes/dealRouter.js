// routes/dealRouter.js
const express = require('express');
const router = express.Router();
const Deal = require('../models/dealModel'); // Adjust the path to your Deal model
const { isAuth, hasRole } = require('../utils');
const DealStage = require('../models/dealStageModel');
const DealActivityLog = require('../models/dealActivityLogModel');
const Notification = require('../models/notificationModel');
const { getIO } = require('../socket');
const User = require('../models/userModel');
const path = require('path');
const hasPermission = require('../hasPermission');
const targetModel = require('../models/targetModel');
 const ServiceCommission = require("../models/serviceCommissionModel");


router.get('/get-deals-marketing', async (req, res) => {
  try {
    // Fetch deals where lead_type.name is "Marketing"
    const deals = await Deal.find()
      .populate({
        path: 'lead_type',
        match: { name: 'Marketing' }, // Match only lead types with name 'Marketing'
        select: 'name' // Only select the name field for lead_type
      })
      .populate('client_id', 'name email') // Populate client_id fields
      .populate('created_by', 'name email') // Populate created_by fields
      .populate('pipeline_id', 'name') // Populate pipeline_id fields
      .populate('deal_stage', 'name') // Populate deal_stage fields
      .populate('source_id', 'name') // Populate source_id fields
      .populate('products', 'name') // Populate products fields
      .populate({
        path: 'service_commission_id',
        populate: [
          { path: 'hodsale', select: 'name email' },
          { path: 'salemanager', select: 'name email' },
          { path: 'coordinator', select: 'name email' },
          { path: 'team_leader', select: 'name email' },
          { path: 'salesagent', select: 'name email' },
          { path: 'team_leader_one', select: 'name email' },
          { path: 'sale_agent_one', select: 'name email' },
          { path: 'salemanagerref', select: 'name email' },
          { path: 'agentref', select: 'name email' },
          { path: 'ts_hod', select: 'name email' },
          { path: 'ts_team_leader', select: 'name email' },
          { path: 'tsagent', select: 'name email' },
          { path: 'marketingmanager', select: 'name email' },
        ]
      })
      .populate('activity_logs') // Populate activity logs
      .exec();

    // Filter out deals where lead_type was not populated due to no match
    const filteredDeals = deals.filter(deal => deal.lead_type !== null);

    res.status(200).json(filteredDeals);
  } catch (error) {
    console.error('Error fetching Marketing deals:', error);
    res.status(500).json({ message: 'Error fetching Marketing deals', error });
  }
});
router.get('/rejected-deals', isAuth, hasPermission(['view_deal']), async (req, res) => {
  try {
    const userId = req.user._id;
    const userPipeline = req.user.pipeline || []; // Ensure pipeline is an array even if undefined

    // Build the query condition
    const query = { is_reject: true, selected_users: userId };

    // If userPipeline is not empty, add it to the query condition
    if (userPipeline.length > 0) {
      query.pipeline_id = { $in: userPipeline }; // Match pipelines in the user's pipeline array
    }

    // Fetch rejected deals
    const deals = await Deal.find(query)
      .populate({
        path: 'pipeline_id',
        select: 'name',
      })
      .populate({
        path: 'deal_stage',
        select: 'name',
      })
      .populate({
        path: 'products',
        select: 'name',
      })
      .populate({
        path: 'client_id',
        select: 'name email phone',
      })
      .populate({
        path: 'source_id',
        select: 'name',
      })
      .populate({
        path: 'branch',
        select: 'name',
      })
      .select(
        '_id pipeline_id deal_stage products client_id source_id reject_reason company_name branch'
      ); // Select necessary fields

    // Return 404 if no deals are found
    if (deals.length === 0) {
      return res.status(404).json({ message: 'No rejected deals found' });
    }

    // Map through deals to create a response object
    const dealDetails = deals.map((deal) => ({
      id: deal._id,
      pipelineName: deal.pipeline_id?.name || null,
      dealStage: deal.deal_stage?.name || null,
      productId: deal.products?._id || null,
      productName: deal.products?.name || null,
      clientName: deal.client_id?.name || null,
      clientEmail: deal.client_id?.email || null,
      phone: deal.client_id?.phone || null,
      sourceName: deal.source_id?.name || null,
      companyName: deal.company_name || null,
      rejectReason: deal.reject_reason || null,
      branchName: deal.branch?.name || null,
    }));

    // Send the response
    res.status(200).json({ dealDetails });
  } catch (error) {
    console.error('Error fetching rejected deals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// Reject deal router
router.put('/reject-deal/:id', isAuth, hasPermission(['reject_deal']), async (req, res) => {
  try {
    const { reject_reason } = req.body;

    // Validate reject_reason
    if (!reject_reason || reject_reason.trim().length === 0) {
      return res.status(400).json({ message: 'Please enter the rejection reason' });
    }

    // Find the deal
    const deal = await Deal.findById(req.params.id).populate('selected_users');
    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    // Update rejection fields
    deal.is_reject = true;
    deal.reject_reason = reject_reason;
    deal.updated_at = new Date();

    // Save the updated deal
    const updatedDeal = await deal.save();

    // Fetch the sender's details
    const sender = await User.findById(req.user._id);
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    // Create an activity log
    const activityLog = new DealActivityLog({
      user_id: sender._id,
      deal_id: deal._id,
      log_type: 'Deal Rejection',
      remark: `Deal rejected with reason: '${reject_reason}'`,
      created_at: Date.now(),
    });

    const savedActivityLog = await activityLog.save();

    // Push the activity log ID into the deal's activity_logs array
    deal.deal_activity_logs.push(savedActivityLog._id);
    await deal.save();

    // Notification and Socket.IO logic
    const io = getIO();

    // Filter users to notify based on roles (e.g., Manager, HOD, MD, CEO)
    const rolesToNotify = ['Manager', 'HOD', 'MD', 'CEO'];
    const usersToNotify = deal.selected_users.filter(user =>
      rolesToNotify.includes(user.role)
    );

    const notificationPromises = usersToNotify.map(async (user) => {
      // Create a notification
      const notification = new Notification({
        sender: sender._id,
        receiver: user._id,
        message: `${sender.name} rejected the deal with reason: '${reject_reason}'`,
        reference_id: deal._id,
        notification_type: 'Deal',
        created_at: Date.now(),
      });

      const savedNotification = await notification.save();

      // Emit the notification to the user's socket room
      io.to(`user_${user._id}`).emit('notification', {
        message: notification.message,
        referenceId: savedNotification.reference_id,
        notificationType: savedNotification.notification_type,
        notificationId: savedNotification._id,
        sender: {
          name: sender.name,
          image: sender.image,
        },
        createdAt: savedNotification.created_at,
      });

      return savedNotification;
    });

    // Wait for all notifications to be created and sent
    await Promise.all(notificationPromises);

    res.status(200).json({
      message: 'Deal rejected successfully',
      deal: updatedDeal,
      activity_log: savedActivityLog,
    });
  } catch (error) {
    console.error('Error rejecting deal:', error);
    res.status(500).json({ message: 'Error rejecting deal' });
  }
});
router.put('/restore-deal/:id', isAuth, hasPermission(['restore_deal']), async (req, res) => {
  try {
    // Find the rejected deal
    const deal = await Deal.findById(req.params.id).populate('selected_users');
    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    // Check if the deal was actually rejected
    if (!deal.is_reject) {
      return res.status(400).json({ message: 'This deal is not rejected' });
    }

    // Restore the deal
    deal.is_reject = false;
    deal.reject_reason = null;
    deal.updated_at = new Date();

    // Save the restored deal
    const updatedDeal = await deal.save();

    // Fetch the sender's details
    const sender = await User.findById(req.user._id);
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    // Create an activity log for restoring the deal
    const activityLog = new DealActivityLog({
      user_id: sender._id,
      deal_id: deal._id,
      log_type: 'Deal Restoration',
      remark: `Deal restored by ${sender.name}`,
      created_at: Date.now(),
    });

    const savedActivityLog = await activityLog.save();

    // Push the activity log ID into the deal's activity_logs array
    deal.deal_activity_logs.push(savedActivityLog._id);
    await deal.save();

    // Notification and Socket.IO logic
    const io = getIO();

    // Filter users to notify based on roles (e.g., Manager, HOD, MD, CEO)
    const rolesToNotify = ['Manager', 'HOD', 'MD', 'CEO'];
    const usersToNotify = deal.selected_users.filter(user =>
      rolesToNotify.includes(user.role)
    );

    const notificationPromises = usersToNotify.map(async (user) => {
      // Create a notification
      const notification = new Notification({
        sender: sender._id,
        receiver: user._id,
        message: `${sender.name} restored the deal.`,
        reference_id: deal._id,
        notification_type: 'Deal',
        created_at: Date.now(),
      });

      const savedNotification = await notification.save();

      // Emit the notification to the user's socket room
      io.to(`user_${user._id}`).emit('notification', {
        message: notification.message,
        referenceId: savedNotification.reference_id,
        notificationType: savedNotification.notification_type,
        notificationId: savedNotification._id,
        sender: {
          name: sender.name,
          image: sender.image,
        },
        createdAt: savedNotification.created_at,
      });

      return savedNotification;
    });

    // Wait for all notifications to be created and sent
    await Promise.all(notificationPromises);

    res.status(200).json({
      message: 'Deal restored successfully',
      deal: updatedDeal,
      activity_log: savedActivityLog,
    });
  } catch (error) {
    console.error('Error restoring deal:', error);
    res.status(500).json({ message: 'Error restoring deal' });
  }
});
// Route to get a single deal by ID
router.get('/get-single-deal/:id', isAuth, (req, res, next) => {
  // Modify hasPermission middleware to check for any of the permissions
  const permissions = ['view_deal'];
  if (permissions.some(permission => req.user.permissions.includes(permission))) {
    return next(); // If user has any of the required permissions, continue to the handler
  }
  return res.status(403).json({ message: 'Permission denied' });
}, async (req, res) => {
  const { id } = req.params;
  try {
    const deal = await Deal.findById(id)
      .populate('lead_type', 'name')
      .populate('client_id', 'name email phone e_id')
      .populate('created_by', 'name email')
      .populate('pipeline_id', 'name')
      .populate('deal_stage', 'name')
      .populate('source_id', 'name')
      .populate('products', 'name')
      .populate({
        path: 'selected_users',
        select: 'name image role',
        populate: {
          path: 'branch', // Assuming the field name for branch in selected_users is "branch"
          select: 'name ' // Replace with the fields you want from the branch
        }
      })
      .populate({
        path: 'lead_id',
        populate: {
          path: 'labels',
          select: 'name color',
        }
      })
  .populate({
        path: 'service_commission_id',
        populate: {
          path: 'commissions.user',
          select: 'name role department areas',
          populate: [
            { path: 'department', select: 'name' },
            { path: 'areas', select: 'name' }
          ]
        }
      })
      .populate({
        path: "deal_activity_logs",
        populate: {
            path: "user_id",
            select: "name image" // Only fetch name and image from the user model
        }
    })
      .populate({
        path: 'lead_id',
        populate: [
          { path: 'client', select: 'name' },
          { path: 'created_by', select: 'name' },
          { path: 'selected_users', select: 'name' },
          { path: 'pipeline_id', select: 'name' },
          { path: 'product_stage', select: 'name' },
          { path: 'lead_type', select: 'name' },
          { path: 'source', select: 'name' },
          { path: 'branch', select: 'name' },
          { path: 'files', select: 'file_path file_name' },
          {
            path: 'discussions',
            populate: { path: 'created_by', select: 'name image' }
          },
          {
            path: 'activity_logs',
            populate: { path: 'user_id', select: 'name image' }
          }
        ]
      })
      .populate({
        path: 'contract_id',
        populate: [
          {
            path: 'contract_activity_logs',
            populate: { path: 'user_id', select: 'name image' }
          }
        ]
      });

    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    res.status(200).json(deal);
  } catch (error) {
    console.error('Error fetching the deal:', error);
    res.status(500).json({ message: 'Error fetching the deal', error });
  }
});
router.get('/get-deals', isAuth, hasPermission(['view_deal']), async (req, res) => {

  try {
    // Ensure req.user exists and contains _id (e.g., middleware for authentication)
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user._id; // Get the user ID from the request
    const pipelineId = req.user.pipeline; // Get the pipeline ID from the user

    // Build the filter conditions dynamically based on the presence of pipelineId
    const matchFilter = (additionalFilters = {}) => {
      const filter = {
        selected_users: userId,
        is_converted: false,
        is_reject: false,
        ...additionalFilters,
      };
      // Include pipelineId filter if it's not an empty array
      if (pipelineId && pipelineId.length > 0) {
        filter.pipeline_id = { $in: pipelineId }; // Match any pipeline ID in the array
      }
      return filter;
    };

 

    // Fetch deals with the dynamic filter
    const deals = await Deal.find(matchFilter())
      .populate('client_id', 'name email')
      .populate('created_by', 'name email')
      .populate('pipeline_id', 'name')
      .populate('lead_type', 'name')
      .populate('deal_stage', 'name')
      .populate('source_id', 'name')
      .populate('products', 'name')
      .populate('service_commission_id')
      .populate('branch', 'name')
      .populate('selected_users', 'name role image') // Populate selected_users
      .populate({
        path: 'lead_id',
        select: 'labels company_Name',
        populate: {
          path: 'labels',
          select: 'name color',
        }
      })
      .populate({
        path: 'service_commission_id',
        // select: 'commission_rate commission_details', // Add fields as per requirement
      })
      .populate('deal_activity_logs');

    res.status(200).json(deals);
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ message: 'Error fetching deals' });
  }
});
router.get('/get-collected-deals', isAuth, async (req, res) => {
  try {
    // Fetch deals where deal_stage.name === 'Collected'
    const collectedDeals = await Deal.find()
      .populate({
        path: 'deal_stage',
        match: { name: 'Collected' }, // Filter deals where deal_stage name is 'Collected'
        select: 'name', // Optionally select only the name field
      })
      .populate('client_id', 'name email phone e_id')
      .populate('created_by', 'name email')
      .populate('pipeline_id', 'name')
      .populate('lead_type', 'name')
      .populate('source_id', 'name')
      .populate('products', 'name')
      .populate('branch', 'name')
      .populate('selected_users', 'name role image')
      .populate({
        path: 'lead_id',
        select: 'labels is_move is_transfer',
        populate: {
          path: 'labels', 
          select: 'name color',
        },
      })
     .populate({
        path: 'service_commission_id',
        populate: {
          path: 'commissions.user',
          select: 'name role department areas',
          populate: [
            { path: 'department', select: 'name' },
            { path: 'areas', select: 'name' }
          ]
        }
      })
      .populate('contract_id');

    // Filter out deals where deal_stage does not match
    const filteredDeals = collectedDeals.filter(deal => deal.deal_stage !== null);

    res.status(200).json(filteredDeals);
  } catch (error) {
    console.error('Error fetching collected deals:', error);
    res.status(500).json({ message: 'Error fetching collected deals' });
  }
});
// Update deal stage
router.put(
  "/update-deal-stage/:id",
  isAuth,
  hasPermission(["update_deal_stage"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { deal_stage } = req.body;

      // Validate input
      if (!deal_stage) {
        return res.status(400).json({ error: "Deal stage is required" });
      }

      // Find the deal and populate necessary fields
      const deal = await Deal.findById(id)
        .populate("deal_stage client_id selected_users service_commission_id pipeline_id");

      if (!deal) {
        return res.status(404).json({ error: "Deal not found" });
      }

      // Fetch the requested new stage from DB
      const newStage = await DealStage.findById(deal_stage);
      if (!newStage) {
        return res.status(404).json({ error: "Deal stage not found" });
      }

      const previousStageName = deal.deal_stage ? deal.deal_stage.name : "Unknown";

      // **Authorization check for moving to 'Collected'**
      if (newStage.name === "Collected") {
        const allowedRoles = ["CEO", "MD", "Accountant"];
        if (!allowedRoles.includes(req.user.role)) {
          return res.status(403).json({
            error: "You are not authorized to move the deal to 'Collected'",
          });
        }
      }

      // Prevent changing from Collected
      if (previousStageName === "Collected") {
        return res.status(400).json({
          error: "Cannot update the deal stage from 'Collected'",
        });
      }

      // Update deal stage
      deal.deal_stage = deal_stage;
      deal.updated_at = new Date();
      await deal.save();

      // Fetch updated deal
      const updatedDeal = await Deal.findById(id).populate("deal_stage");
      const newStageName = updatedDeal.deal_stage ? updatedDeal.deal_stage.name : "Unknown";

      // Fetch sender
      const sender = await User.findById(req.user._id);
      if (!sender) return res.status(404).json({ error: "Sender not found" });

      // Handle Pipeline & User Targets if stage is Collected
      if (newStageName === "Collected" && deal.service_commission_id) {
        const financeAmount = deal.service_commission_id.finance_amount;

        // Pipeline target
        if (deal.pipeline_id) {
          const pipelineTarget = await targetModel.findOne({
            assignedTo: deal.pipeline_id,
            assignedToModel: "Pipeline",
          });

          if (pipelineTarget) {
            pipelineTarget.achieved_finance_amount += financeAmount;

            pipelineTarget.status =
              pipelineTarget.achieved_finance_amount >= pipelineTarget.finance_amount
                ? "Completed"
                : "In Progress";

            await pipelineTarget.save();
          }
        }

        // User target
        const salesAgent = deal.service_commission_id.sales_agent;
        if (salesAgent) {
          const userTarget = await targetModel.findOne({
            assignedTo: salesAgent._id,
            assignedToModel: "User",
          });

          if (userTarget) {
            userTarget.achieved_finance_amount += financeAmount;

            userTarget.status =
              userTarget.achieved_finance_amount >= userTarget.finance_amount
                ? "Completed"
                : "In Progress";

            await userTarget.save();
          }
        }
      }

      // Activity log
      const activityLog = new DealActivityLog({
        user_id: sender._id,
        deal_id: deal._id,
        log_type: "Stage Update",
        remark: `Deal stage changed from '${previousStageName}' to '${newStageName}'`,
        created_at: Date.now(),
      });

      const savedActivityLog = await activityLog.save();

      // Push activity log to deal
      deal.deal_activity_logs.push(savedActivityLog._id);
      await deal.save();

      // Notifications via Socket.IO
      const io = getIO();
      const rolesToNotify = ["Manager", "HOD", "MD", "CEO"];
      const usersToNotify = deal.selected_users.filter((u) => rolesToNotify.includes(u.role));

      await Promise.all(
        usersToNotify.map(async (user) => {
          const notification = new Notification({
            sender: sender._id,
            receiver: user._id,
            message: `${sender.name} updated the deal stage from '${previousStageName}' to '${newStageName}'`,
            reference_id: deal._id,
            notification_type: "Deal",
            created_at: Date.now(),
          });

          const savedNotification = await notification.save();

          io.to(`user_${user._id}`).emit("notification", {
            message: notification.message,
            referenceId: savedNotification.reference_id,
            notificationType: savedNotification.notification_type,
            notificationId: savedNotification._id,
            sender: { name: sender.name, image: sender.image },
            createdAt: savedNotification.created_at,
          });

          return savedNotification;
        })
      );

      res.status(200).json({
        message: "Deal stage updated successfully",
        deal: updatedDeal,
        activity_log: savedActivityLog,
      });
    } catch (error) {
      console.error("Error updating deal stage:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Route to update is_report_generated_approved to true
router.put('/approve-report/:dealId', isAuth, hasRole('CEO'), async (req, res) => {
  try {
    const { dealId } = req.params;
    const deal = await Deal.findById(dealId);

    if (!deal) {
      return res.status(404).json({ message: 'Deal not found' });
    }

    // Update field
    deal.is_report_generated_approved = true;
    await deal.save();

    res.status(200).json({ message: 'Report approved successfully', deal });
  } catch (error) {
    console.error('Error approving report:', error);
    res.status(500).json({ message: 'Error approving report' });
  }
});
// PUT: Update Service Commission for a Deal
router.put("/update-service-commission/:id", isAuth,  async (req, res) => {
  try {
    const dealId = req.params.id;
    const { serviceCommissionData } = req.body;

    // 1️⃣ Find deal
    const deal = await Deal.findById(dealId);
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    // 2️⃣ Get or create service commission
    let serviceCommission;
    if (deal.service_commission_id) {
      serviceCommission = await ServiceCommission.findById(deal.service_commission_id);
      if (!serviceCommission) serviceCommission = new ServiceCommission();
    } else {
      serviceCommission = new ServiceCommission();
    }

    // 3️⃣ Update service commission fields
    if (serviceCommissionData) {
      const {
        finance_amount,
        bank_commission,
        customer_commission,
        with_vat_commission,
        without_vat_commission,
        commissions,
      } = serviceCommissionData;

      if (finance_amount !== undefined) serviceCommission.finance_amount = finance_amount;
      if (bank_commission !== undefined) serviceCommission.bank_commission = bank_commission;
      if (customer_commission !== undefined) serviceCommission.customer_commission = customer_commission;
      if (with_vat_commission !== undefined) serviceCommission.with_vat_commission = with_vat_commission;
      if (without_vat_commission !== undefined) serviceCommission.without_vat_commission = without_vat_commission;

      // 4️⃣ Update commission entries safely
      if (Array.isArray(commissions)) {
        for (const entry of commissions) {
          if (entry.action === "Add" || entry.action === "Update") {
            serviceCommission.addOrUpdateCommission(entry.user, entry.percentage, entry.amount);
          } else if (entry.action === "remove") {
            serviceCommission.removeCommission(entry.user);
          }
        }
      }
    }

    // 5️⃣ Save service commission
    await serviceCommission.save();

    // 6️⃣ Ensure deal links to service commission
    if (!deal.service_commission_id) {
      deal.service_commission_id = serviceCommission._id;
      await deal.save();
    }

    res.json({ success: true, serviceCommission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});


router.get('/get-all-deals', isAuth, async (req, res) => {
  try {
    // Fetch deals where deal_stage.name === 'Collected'
    const collectedDeals = await Deal.find({is_report_generated:false})
      .populate({
        path: 'deal_stage',
        select: 'name', // Optionally select only the name field
      })
      .populate('client_id', 'name email phone e_id')
      .populate('created_by', 'name email')
      .populate('pipeline_id', 'name')
      .populate('lead_type', 'name')
      .populate('source_id', 'name')
      .populate('products', 'name')
      .populate('branch', 'name')
      .populate('selected_users', 'name role image')
      .populate({
        path: 'lead_id',
        select: 'labels is_move is_transfer',
        populate: {
          path: 'labels', 
          select: 'name color',
        },
      })
     .populate({
        path: 'service_commission_id',
        populate: {
          path: 'commissions.user',
          select: 'name role department areas',
          populate: [
            { path: 'department', select: 'name' },
            { path: 'areas', select: 'name' }
          ]
        }
      })
      .populate('contract_id');

    // Filter out deals where deal_stage does not match
    const filteredDeals = collectedDeals.filter(deal => deal.deal_stage !== null);

    res.status(200).json(filteredDeals);
  } catch (error) {
    console.error('Error fetching collected deals:', error);
    res.status(500).json({ message: 'Error fetching collected deals' });
  }
});

// ✅ Force Deal Stage to "Collected"
router.put(
  "/update-deal-stage-collected/:id",
  isAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Find the deal and populate required fields
      const deal = await Deal.findById(id)
        .populate("deal_stage client_id selected_users service_commission_id");

      if (!deal) {
        return res.status(404).json({ error: "Deal not found" });
      }

      // Store the previous stage name for logging
      const previousStageName = deal.deal_stage ? deal.deal_stage.name : "Unknown";

      // If already Collected → block duplicate update
      if (previousStageName === "Collected") {
        return res.status(400).json({ message: "Deal is already in 'Collected' stage" });
      }

      // ✅ Find the "Collected" stage ObjectId from DealStage model
      const collectedStage = await DealStage.findOne({ name: "Collected" });
      if (!collectedStage) {
        return res.status(500).json({ error: "Collected stage not found in system" });
      }

      // Update the deal stage to "Collected"
      deal.deal_stage = collectedStage._id;
      deal.updated_at = new Date();
      await deal.save();

      // Re-fetch updated deal with new stage populated
      const updatedDeal = await Deal.findById(id).populate("deal_stage");
      const newStageName = updatedDeal.deal_stage ? updatedDeal.deal_stage.name : "Unknown";

      // Fetch sender details
      const sender = await User.findById(req.user._id);
      if (!sender) {
        return res.status(404).json({ error: "Sender not found" });
      }

      // ✅ Handle target update
      if (newStageName === "Collected" && deal.service_commission_id) {
        const financeAmount = deal.service_commission_id.finance_amount;

        // Update Pipeline Target
        if (deal.pipeline_id) {
          const pipelineTarget = await targetModel.findOne({
            assignedTo: deal.pipeline_id,
            assignedToModel: "Pipeline",
          });

          if (pipelineTarget) {
            pipelineTarget.achieved_finance_amount += financeAmount;

            if (pipelineTarget.achieved_finance_amount > 0) {
              pipelineTarget.status = "In Progress";
            }
            if (pipelineTarget.achieved_finance_amount >= pipelineTarget.finance_amount) {
              pipelineTarget.status = "Completed";
            }

            await pipelineTarget.save();
          }
        }

        // Update User Target
        if (deal.service_commission_id?.sales_agent) {
          const userTarget = await targetModel.findOne({
            assignedTo: deal.service_commission_id.sales_agent._id,
            assignedToModel: "User",
          });

          if (userTarget) {
            userTarget.achieved_finance_amount += financeAmount;

            if (userTarget.achieved_finance_amount > 0) {
              userTarget.status = "In Progress";
            }
            if (userTarget.achieved_finance_amount >= userTarget.finance_amount) {
              userTarget.status = "Completed";
            }

            await userTarget.save();
          }
        }
      }

      // ✅ Log activity
      const activityLog = new DealActivityLog({
        user_id: sender._id,
        deal_id: deal._id,
        log_type: "Stage Update",
        remark: `Deal stage changed from '${previousStageName}' to 'Collected'`,
        created_at: Date.now(),
      });

      const savedActivityLog = await activityLog.save();

      deal.deal_activity_logs.push(savedActivityLog._id);
      await deal.save();

      // ✅ Send notifications
      const io = getIO();
      const rolesToNotify = ["Manager", "HOD", "MD", "CEO"];
      const usersToNotify = deal.selected_users.filter((user) =>
        rolesToNotify.includes(user.role)
      );

      const notificationPromises = usersToNotify.map(async (user) => {
        const notification = new Notification({
          sender: sender._id,
          receiver: user._id,
          message: `${sender.name} updated the deal stage from '${previousStageName}' to 'Collected'`,
          reference_id: deal._id,
          notification_type: "Deal",
          created_at: Date.now(),
        });

        const savedNotification = await notification.save();

        io.to(`user_${user._id}`).emit("notification", {
          message: notification.message,
          referenceId: savedNotification.reference_id,
          notificationType: savedNotification.notification_type,
          notificationId: savedNotification._id,
          sender: { name: sender.name, image: sender.image },
          createdAt: savedNotification.created_at,
        });

        return savedNotification;
      });

      await Promise.all(notificationPromises);

      res.status(200).json({
        message: "Deal stage updated to 'Collected' successfully",
        deal: updatedDeal,
        activity_log: savedActivityLog,
      });
    } catch (error) {
      console.error("Error updating deal stage to Collected:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);


module.exports = router;
