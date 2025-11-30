const express = require('express');
const router = express.Router();
const LeadRequest = require('../models/requestModel');
const { isAuth } = require('../utils');
const User = require('../models/userModel');
const Lead = require('../models/leadModel');
const Branch = require('../models/branchModel');
const Pipeline = require('../models/pipelineModel');
const ProductStage = require('../models/productStageModel');
const ActivityLog = require('../models/activityLogModel');
const Product = require('../models/productModel');
const mongoose = require('mongoose');
// Soft delete a lead request
router.put('/soft-delete/:id', isAuth, async (req, res) => {
    const requestId = req.params.id;
    const userId = req.user._id;

    try {
        const leadRequest = await LeadRequest.findById(requestId);

        if (!leadRequest) {
            return res.status(404).json({ message: 'Lead request not found.' });
        }

        if (leadRequest.sender.toString() !== userId.toString() && !leadRequest.receivers.includes(userId)) {
            return res.status(403).json({ message: 'You are not authorized to delete this request.' });
        }

        // Set delStatus to true for soft delete
        leadRequest.delStatus = true;
        await leadRequest.save();

        res.status(200).json({
            message: 'Lead request soft deleted successfully.',
            data: leadRequest,
        });
    } catch (error) {
        console.error('Error soft deleting lead request:', error);
        res.status(500).json({ message: 'Error soft deleting lead request.', error: error.message });
    }
});
// New route to update the 'read' status of a LeadRequest
router.put('/mark-read/:id', isAuth, async (req, res) => {
    const requestId = req.params.id;
    const userId = req.user._id;

    try {
        const leadRequest = await LeadRequest.findById(requestId);

        if (!leadRequest) {
            return res.status(404).json({ message: 'Lead request not found.' });
        }

        // Ensure the user is either the sender or one of the receivers
        if (leadRequest.sender.toString() !== userId.toString() && !leadRequest.receivers.includes(userId)) {
            return res.status(403).json({ message: 'You are not authorized to mark this request as read.' });
        }

        // Update the read status to true
        leadRequest.read = true;
        await leadRequest.save();

        res.status(200).json({
            message: 'Lead request marked as read successfully.',
            data: leadRequest,
        });
    } catch (error) {
        console.error('Error marking lead request as read:', error);
        res.status(500).json({ message: 'Error marking lead request as read.', error: error.message });
    }
});
// Create a new Lead Request
router.post('/create-request', isAuth, async (req, res) => {
    const { lead_id, message, branch, products, product_stage, pipeline_id, type, currentBranch, currentProduct, currentProductStage, currentPipeline } = req.body;
    const sender = req.user._id;

    if (!lead_id || !sender) {
        return res.status(400).json({ message: 'lead_id and sender are required.' });
    }

    try {
        // Find the lead by lead_id and populate branch and pipeline_id fields
        const lead = await Lead.findById(lead_id)
            .populate('selected_users', 'name email role')
            .populate('branch', '_id') // Populate branch to access _id
            .populate('pipeline_id', '_id'); // Populate pipeline_id to access _id

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found.' });
        }

        // Check if the type is 'Transfer' and the products are the same
        const areProductsSame = products.toString() === lead.products.toString(); // Convert to string for comparison

        if (type === 'Transfer' && areProductsSame) {
            return res.status(400).json({ message: 'Cannot transfer with same Products.' });
        }

        // Check if the type is 'Move' and validate branch or pipeline_id change
        const isBranchSame = branch === lead.branch._id.toString(); // Ensure comparison by _id
        const isPipelineSame = pipeline_id === lead.pipeline_id._id.toString(); // Ensure comparison by _id

        if (type === 'Move' && isBranchSame && isPipelineSame) {
            return res.status(400).json({ message: 'Change the branch or pipeline to create a move request.' });
        }

        // Filter selected_users based on role
        const eligibleReceivers = lead.selected_users
            .filter(user => user.role === 'HOD' || user.role === 'Manager')
            .map(user => user._id); // Map to get the IDs

        if (eligibleReceivers.length === 0) {
            return res.status(400).json({ message: 'No eligible receivers found for this lead.' });
        }

        // Create a new LeadRequest with eligible receivers
        const leadRequest = new LeadRequest({
            lead_id,
            sender,
            receivers: eligibleReceivers,
            message,
            branch,
            products,
            product_stage,
            pipeline_id,
            type,
            read: false,
            action: 'Pending',
            currentBranch,
            currentProduct,
            currentProductStage,
            currentPipeline
        });

        const savedRequest = await leadRequest.save();
        res.status(201).json({
            message: 'Lead Request created successfully.',
            data: savedRequest,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating Lead Request.', error: error.message });
    }
});
// Get all lead requests for the authenticated user, excluding soft-deleted requests
router.get('/my-requests', isAuth, async (req, res) => {
    const userId = req.user._id;

    try {
        const userRequests = await LeadRequest.find({
            $or: [
                { sender: userId },
                { receivers: userId }
            ],
            delStatus: false,
        })
            .populate('sender receivers', 'name email image')
            .populate({
                path: 'lead_id',
                select: 'client pipeline_id products product_stage branch',
                populate: [
                    { path: 'client', select: 'name' },
                    { path: 'pipeline_id', select: 'name' },
                    { path: 'products', select: 'name price' },
                    { path: 'product_stage', select: 'name' },
                    { path: 'branch', select: 'name' }
                ]
            })
            .populate('pipeline_id', 'name')
            .populate('product_stage', 'name')
            .populate('products', 'name')
            .populate('branch', 'name')
            .populate('currentPipeline', 'name')
            .populate('currentProductStage', 'name')
            .populate('currentProduct', 'name')
            .populate('currentBranch', 'name')
            .populate('actionChangedBy', 'name image');

        // if (!userRequests || userRequests.length === 0) {
        //     return res.status(404).json({ message: 'No lead requests found for this user.' });
        // }

        res.status(200).json({
            message: 'Lead requests retrieved successfully.',
            data: userRequests,
        });
    } catch (error) {
        console.error('Error fetching lead requests:', error);
        res.status(500).json({ message: 'Error fetching lead requests.', error: error.message });
    }
});
// Change Action of Lead Request and Track User
router.put('/change-action/:id', isAuth, async (req, res) => {
    const { action } = req.body;
    const validActions = ['Pending', 'Accept', 'Decline'];

    if (!validActions.includes(action)) {
        return res.status(400).json({ message: 'Invalid action provided.' });
    }

    try {
        const leadRequest = await LeadRequest.findById(req.params.id);

        if (!leadRequest) {
            return res.status(404).json({ message: 'Lead Request not found.' });
        }

        // Check if the user is allowed to change the action (either sender or receiver)
        if (!leadRequest.receivers.includes(req.user._id) && leadRequest.sender.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'You are not authorized to change the action for this request.' });
        }

        // Update the action and log the user who changed it
        leadRequest.action = action;
        leadRequest.actionChangedBy = req.user._id; // Track who changed the action
        await leadRequest.save();

        // If action is "Accept" and type is "Transfer", call the transfer lead logic
        if (action === 'Accept' && leadRequest.type === 'Transfer') {
            const { branch, products, product_stage, pipeline_id, lead_id, sender } = leadRequest;

            // Call the transfer lead logic with required parameters
            const transferResult = await transferLead(req.user, {
                branch,
                products,
                product_stage,
                pipeline_id,
                lead_id,
                sender: sender.toString() // Pass sender ID as well
            });

            if (!transferResult.success) {
                return res.status(500).json({ message: 'Lead transfer failed.', error: transferResult.error });
            }
        }

        // If action is "Accept" and type is "Move", call the move lead logic
        if (action === 'Accept' && leadRequest.type === 'Move') {
            const leadId = leadRequest.lead_id; // Assuming lead_id is stored in leadRequest
            const { pipeline_id, branch, product_stage, products } = leadRequest; // Assuming these fields are available in leadRequest

            // Ensure required fields are provided
            if (!pipeline_id || !branch || !product_stage) {
                return res.status(400).json({ message: 'Missing required fields for moving lead.' });
            }

            const branchId = new mongoose.Types.ObjectId(String(branch));
            const productStageId = new mongoose.Types.ObjectId(String(product_stage));
            const pipelineId = new mongoose.Types.ObjectId(String(pipeline_id));
            const productId = new mongoose.Types.ObjectId(String(products));
            // Check if the lead exists
            const lead = await Lead.findById(leadId);
            if (!lead) {
                return res.status(404).json({ message: 'Lead not found' });
            }

            // Validate product_stage
            const validProductStage = await ProductStage.findById(productStageId);
            if (!validProductStage) {
                return res.status(400).json({ message: 'Invalid product stage' });
            }

            // Initialize variables for tracking changes
            let changes = [];
            let updatedSelectedUsers = [];

            // Fetch names for old values
            const oldBranch = await Branch.findById(lead.branch).select('name');
            const oldPipeline = await Pipeline.findById(lead.pipeline_id).select('name');
            const oldProductStage = await ProductStage.findById(lead.product_stage).select('name');

            // Fetch names for new values
            const newBranch = await Branch.findById(branchId).select('name');
            const newPipeline = await Pipeline.findById(pipelineId).select('name');
            const newProductStage = await ProductStage.findById(productStageId).select('name');

            // Track changes in pipeline, branch, and product_stage
            if (String(lead.pipeline_id) !== String(pipelineId)) {
                changes.push(`Pipeline changed from ${oldPipeline.name} to ${newPipeline.name}`);
            }
            if (String(lead.branch) !== String(branchId)) {
                changes.push(`Branch changed from ${oldBranch.name} to ${newBranch.name}`);
            }
            if (String(lead.product_stage) !== String(productStageId)) {
                changes.push(`Product Stage changed from ${oldProductStage.name} to ${newProductStage.name}`);
            }

            // Fetch additional users based on the new pipeline and branch
            const ceoUsers = await User.find({ role: 'CEO' }).select('_id name');
            const superadminUsers = await User.find({ role: 'Admin' }).select('_id name');
            const mdUsers = await User.find({ role: 'MD' }).select('_id name');

            const hodUsers = await User.find({ role: 'HOD', products: productId }).select('_id name');
            const managerUsers = await User.find({
                role: 'Manager',
                pipeline: pipelineId,
                branch: branchId, // Filter managers by the new branch
            }).select('_id name');
            const homUsers = await User.find({ role: 'HOM', products: productId }).select('_id name');


            // Include created_by user from the lead
            const createdByUser = lead.created_by ? await User.findById(lead.created_by).select('_id name') : null;

            // Combine all selected user IDs while keeping previous selected users
            const allSelectedUsers = [
                req.user._id.toString(), // Include the currently authenticated user
                // createdByUser ? createdByUser._id.toString() : null, // Include the created_by user if it exists
                ...ceoUsers.map(user => user._id.toString()),
                ...superadminUsers.map(user => user._id.toString()),
                ...mdUsers.map(user => user._id.toString()),
                ...homUsers.map(user => user._id.toString()),
                ...hodUsers.map(user => user._id.toString()), // Include HOD without branch restriction
                ...managerUsers.map(user => user._id.toString()), // Manager filtered by branch
                ...updatedSelectedUsers.map(user => user.toString()), // Keep previous selected users
            ].filter(Boolean); // Filter out any null or undefined values

            // Filter out duplicate IDs and update the lead's selected_users
            updatedSelectedUsers = getUniqueUserIds(allSelectedUsers);
            lead.selected_users = updatedSelectedUsers;

            // Update the pipeline, branch, and product_stage
            lead.pipeline_id = pipelineId;
            lead.branch = branchId;
            lead.product_stage = productStageId;
            lead.is_move = true; // Mark lead as moved
            lead.ref_created_by = created_by?._id; // Assign ref_user directly from the single user
            // Save the updated lead
            const updatedLead = await lead.save();

            // Create an activity log entry
            const activityLog = new ActivityLog({
                user_id: req.user._id,
                log_type: 'Lead Movement',
                remark: changes.length ? `Lead moved: ${changes.join(', ')}` : 'Lead moved with no significant changes',
                created_at: Date.now(),
                updated_at: Date.now(),
            });
            await activityLog.save();

            // Push the activity log ID to the lead
            updatedLead.activity_logs.push(activityLog._id);
            await updatedLead.save();
        }

        res.status(200).json({
            message: `Action changed to '${action}' successfully.`,
            data: leadRequest
        });
    } catch (error) {
        console.error('Error changing action:', error);
        res.status(500).json({ message: 'Error changing action.', error: error.message });
    }
});
const getUniqueUserIds = (userIds) => {
    const uniqueUserMap = {};
    userIds.forEach(id => {
        if (id) {
            uniqueUserMap[id] = true;
        }
    });
    return Object.keys(uniqueUserMap);
};
const transferLead = async (user, { branch, products, product_stage, pipeline_id, lead_id }) => {
    try {
        if (!branch || !products || !product_stage || !pipeline_id || !lead_id) {
            return { success: false, error: 'Missing required fields' };
        }

        const branchId = new mongoose.Types.ObjectId(String(branch));
        const productStageId = new mongoose.Types.ObjectId(String(product_stage));
        const pipelineId = new mongoose.Types.ObjectId(String(pipeline_id));
        const productId = new mongoose.Types.ObjectId(String(products));

        // Check if the lead exists
        const lead = await Lead.findById(lead_id);
        if (!lead) {
            return { success: false, error: 'Lead not found' };
        }

        // Validate product_stage
        const validProductStage = await ProductStage.findById(productStageId);
        if (!validProductStage) {
            return { success: false, error: 'Invalid product stage' };
        }

        // Ensure the lead is not being transferred to the same product
        if (String(lead.products) === String(productId)) {
            return { success: false, error: 'Cannot transfer the lead to the same product. Please change the product.' };
        }

        // Fetch old values for change tracking
        const oldBranch = await Branch.findById(lead.branch).select('name');
        const oldPipeline = await Pipeline.findById(lead.pipeline_id).select('name');
        const oldProductStage = await ProductStage.findById(lead.product_stage).select('name');
        const oldProducts = lead.products;

        // Fetch new values for change tracking
        const newBranch = await Branch.findById(branchId).select('name');
        const newPipeline = await Pipeline.findById(pipelineId).select('name');
        const newProductStage = await ProductStage.findById(productStageId).select('name');

        // Track changes
        let changes = [];
        if (String(lead.pipeline_id) !== String(pipelineId)) {
            changes.push(`Pipeline changed from ${oldPipeline.name} to ${newPipeline.name}`);
        }
        if (String(lead.branch) !== String(branchId)) {
            changes.push(`Branch changed from ${oldBranch.name} to ${newBranch.name}`);
        }
        if (String(lead.product_stage) !== String(productStageId)) {
            changes.push(`Product Stage changed from ${oldProductStage.name} to ${newProductStage.name}`);
        }
        if (String(lead.products) !== String(productId)) {
            const oldProduct = oldProducts ? await Product.findById(oldProducts) : { name: 'None' };
            const newProduct = await Product.findById(productId);
            changes.push(`Product changed from ${oldProduct.name} to ${newProduct.name}`);
        }

        // Update the lead fields
        lead.pipeline_id = pipelineId;
        lead.branch = branchId;
        lead.product_stage = productStageId;
        lead.products = productId;
        lead.is_transfer = true;  // Mark lead as transferred

        // Find users to notify (CEO, MD, Superadmin, HOD, etc.)
        const ceoUsers = await User.find({ role: 'CEO' }).select('_id name');
        const superadminUsers = await User.find({ role: 'Admin' }).select('_id name');
        const mdUsers = await User.find({ role: 'MD' }).select('_id name');
        const hodUsers = await User.find({ role: 'HOD', products: productId }).select('_id name');
        const managerUsers = await User.find({
            role: 'Manager',
            pipeline: pipelineId,
            branch: branchId, // Filter managers by the new branch
        }).select('_id name');
        const homUsers = await User.find({ role: 'HOM', products: productId }).select('_id name');

        const previousPipelineHodUser = await User.findOne({
            role: 'HOD',
            pipeline: lead.pipeline_id,
        }).select('_id');

        // Get the original creator of the lead
        const createdByUserId = lead.created_by.toString();

        // Combine selected user IDs
        const newSelectedUserIds = [
            user._id.toString(),
            // createdByUserId,
            ...ceoUsers.map(user => user._id.toString()),
            ...superadminUsers.map(user => user._id.toString()),
            ...mdUsers.map(user => user._id.toString()),
            ...hodUsers.map(user => user._id.toString()),
            ...managerUsers.map(user => user._id.toString()),
            ...homUsers.map(user => user._id.toString())
        ];

        // Assign the first (and only) previous pipeline HOD as ref_user if available
        if (createdByUserId) {
            lead.ref_created_by = createdByUserId;  // Assign ref_user directly from the single user
        }

        // Remove previous pipeline HOD user from selected_users if it exists
        lead.selected_users = getUniqueUserIds(newSelectedUserIds.filter(id => id !== String(previousPipelineHodUser?._id)));

        // Save the updated lead
        await lead.save();

        // Log the lead transfer in the activity log
        const activityLog = new ActivityLog({
            user_id: user._id,
            log_type: 'Lead Transfer',
            remark: changes.length ? `Lead transferred: ${changes.join(', ')}` : 'Lead transferred with no significant changes',
            created_at: Date.now(),
            updated_at: Date.now()
        });
        await activityLog.save();

        // Add activity log reference to the lead
        lead.activity_logs.push(activityLog._id);
        await lead.save();

        return { success: true };
    } catch (error) {
        console.error('Error transferring lead:', error);
        return { success: false, error: 'Error transferring lead' };
    }
};

module.exports = router; 
