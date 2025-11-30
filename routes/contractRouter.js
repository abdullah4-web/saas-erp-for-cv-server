const express = require('express');
const Contract = require('../models/contractModel'); // Adjust path as needed
const User = require('../models/userModel'); // Adjust path as needed
const Deal = require('../models/dealModel'); // Adjust path as needed
const { isAuth } = require('../utils');
const ContractActivityLog = require('../models/ContractActivityLogModel');
const { getIO } = require('../socket');
const Notification = require('../models/notificationModel');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const File = require('../models/fileModel'); // Adjust path as needed
const multer = require('multer');
const ServiceCommission = require('../models/serviceCommissionModel');
const Lead = require('../models/leadModel');
const mongoose = require('mongoose');
const DealStage = require('../models/dealStageModel');
const DealActivityLog = require('../models/dealActivityLogModel');
const hasPermission = require('../hasPermission');
const router = express.Router();
const { v2: cloudinary } = require('cloudinary');

// === Cloudinary Config ===
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// === Multer Memory Storage ===
const storage = multer.memoryStorage();
const upload = multer({ storage }).array("files", 10);

// === Upload Helper ===
const uploadToCloudinary = async (buffer, folder, filename) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: filename.split(".")[0], // use filename without extension
                resource_type: "auto",
            },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(buffer);
    });
};

// === Upload Contract Files ===
router.post("/upload-files/:contractId", isAuth, async (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res
                .status(400)
                .json({ message: "Error uploading files", error: err });
        }

        try {
            const contractId = req.params.contractId;
            const userId = req.user._id;

            const contract = await Contract.findById(contractId);
            if (!contract) {
                return res.status(404).json({ message: "Contract not found" });
            }

            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ message: "No files uploaded" });
            }

            const fileDocs = [];
            const activityLogs = [];

            for (const file of req.files) {
                // === Upload to Cloudinary ===
                const uploaded = await uploadToCloudinary(
                    file.buffer,
                    "contracts/files",
                    file.originalname
                );

                // === Save File Document ===
                const newFile = new File({
                    added_by: userId,
                    file_name: file.originalname,
                    file_url: uploaded.secure_url,
                    public_id: uploaded.public_id,
                    created_at: new Date(),
                    updated_at: new Date(),
                });

                await newFile.save();
                fileDocs.push(newFile);

                // Push into contract.files
                contract.files.push(newFile._id);

                // === Activity Log ===
                const activityLog = new ContractActivityLog({
                    user_id: userId,
                    contract_id: contractId,
                    log_type: "File Uploaded",
                    remark: `File "${file.originalname}" was uploaded by ${req.user.name || req.user.email
                        }`,
                    created_at: new Date(),
                });

                await activityLog.save();
                activityLogs.push(activityLog);

                // push activity log reference into contract
                contract.contract_activity_logs.push(activityLog._id);
            }

            // save contract
            await contract.save();

            res.status(201).json({
                message:
                    "Files uploaded to Cloudinary, associated with contract, and activity logged successfully",
                files: fileDocs,
                activity_logs: activityLogs,
            });
        } catch (error) {
            console.error("Error uploading files:", error);
            res.status(500).json({ message: "Error uploading files", error });
        }
    });
});


router.delete('/revert-contract/:id', isAuth, async (req, res) => {
    try {
        const contractId = req.params.id;

        // Find the contract
        const contract = await Contract.findById(contractId);
        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        // Retrieve the associated lead ID and service commission ID
        const leadId = contract.lead_id;
        const serviceCommissionId = contract.service_commission_id;

        if (!leadId) {
            return res.status(400).json({ message: 'No associated lead ID found for this contract' });
        }

        // Delete the contract
        await Contract.findByIdAndDelete(contractId);

        // Update the lead's is_converted status to true
        await Lead.findByIdAndUpdate(
            leadId,
            { is_converted: true },
            { new: true }
        );

        // If there's an associated service commission, delete it
        if (serviceCommissionId) {
            await ServiceCommission.findByIdAndDelete(serviceCommissionId);
        }

        res.status(200).json({
            message: 'Contract reverted successfully, lead updated, and service commission deleted'
        });
    } catch (error) {
        console.error('Error reverting contract:', error);
        res.status(500).json({ message: 'Error reverting contract', error });
    }
});

router.get('/rejected-contracts', isAuth, hasPermission(['view_contract']), async (req, res) => {
    try {
        const userId = req.user._id;
        const userPipeline = req.user.pipeline || [];

        // Build query for rejected contracts
        const query = { is_reject: true, selected_users: userId };
        if (userPipeline.length > 0) {
            query.pipeline_id = { $in: userPipeline };
        }

        // Fetch rejected contracts
        const contracts = await Contract.find(query)
            .populate({
                path: 'pipeline_id',
                select: 'name',
            })
            .populate({
                path: 'contract_stage',
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
                '_id pipeline_id contract_stage products client_id source_id reject_reason company_name branch'
            );

        if (contracts.length === 0) {
            return res.status(404).json({ message: 'No rejected contracts found' });
        }

        // Map contracts for response
        const contractDetails = contracts.map((contract) => ({
            id: contract._id,
            pipelineName: contract.pipeline_id?.name || null,
            contractStage: contract.contract_stage?.name || null,
            productId: contract.products?._id || null,
            productName: contract.products?.name || null,
            clientName: contract.client_id?.name || null,
            clientEmail: contract.client_id?.email || null,
            phone: contract.client_id?.phone || null,
            sourceName: contract.source_id?.name || null,
            companyName: contract.company_name || null,
            rejectReason: contract.reject_reason || null,
            branchName: contract.branch?.name || null,
        }));

        res.status(200).json({ contractDetails });
    } catch (error) {
        console.error('Error fetching rejected contracts:', error);
        res.status(500).json({ message: 'Server error', error });
    }
});
// Route to upload files for a contract and log activities

// Route to add a discussion to a contract and create an activity log
router.post('/add-discussion/:id', isAuth, async (req, res) => {
    try {
        const contractId = req.params.id;
        const { comment } = req.body;
        const userId = req.user._id; // Assuming the user ID is available in the request after authentication

        // Create a new discussion
        const newDiscussion = new ContractDiscussion({
            created_by: userId,
            comment: comment
        });

        // Save the discussion to the database
        const savedDiscussion = await newDiscussion.save();

        // Find the contract and update its discussions field
        const contract = await Contract.findByIdAndUpdate(
            contractId,
            { $push: { discussions: savedDiscussion._id } },
            { new: true }
        );

        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        // Create a new activity log entry
        const activityLog = new ContractActivityLog({
            user_id: userId,
            contract_id: contractId,
            log_type: 'Discussion Added',
            remark: `Added discussion with comment: "${comment}"`
        });

        // Save the activity log to the database
        const savedActivityLog = await activityLog.save();

        // Update the contract's activity logs with the new log
        await Contract.findByIdAndUpdate(
            contractId,
            { $push: { contract_activity_logs: savedActivityLog._id } }
        );

        res.status(200).json({
            message: 'Discussion added successfully and activity logged',
            discussion: savedDiscussion,
            contract,
            activityLog: savedActivityLog
        });
    } catch (error) {
        console.error('Error adding discussion and logging activity:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Route to reject a contract
router.put('/reject-contract/:id', isAuth, hasPermission(['reject_contract']), async (req, res) => {
    try {
        const contractId = req.params.id;
        const { reject_reason } = req.body;

        // Validate reject_reason 
        if (!reject_reason || typeof reject_reason !== 'string') {
            return res.status(400).json({ message: 'Please Enter Reject Reason' });
        }

        // Find the contract and update its is_reject status and reject_reason
        const contract = await Contract.findByIdAndUpdate(
            contractId,
            {
                is_reject: true,
                reject_reason: reject_reason.trim(),
            },
            { new: true } // To return the updated document
        );

        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        res.status(200).json({ message: 'Contract rejected successfully', contract });
    } catch (error) {
        console.error('Error rejecting contract:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put("/update-service-commission/:id", isAuth, async (req, res) => {
    try {
        const contractId = req.params.id;
        const { serviceCommissionData } = req.body;

        // 1️⃣ Find contract
        const contract = await Contract.findById(contractId);
        if (!contract) return res.status(404).json({ error: "Contract not found" });

        // 2️⃣ Get or create service commission
        let serviceCommission;
        if (contract.service_commission_id) {
            serviceCommission = await ServiceCommission.findById(contract.service_commission_id);
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

        // 6️⃣ Ensure contract links to service commission
        if (!contract.service_commission_id) {
            contract.service_commission_id = serviceCommission._id;
            await contract.save();
        }

        res.json({ success: true, serviceCommission });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// Get all contracts 
router.get('/get-all-contracts', isAuth, hasPermission(['view_contract']), async (req, res) => {

    try {
        const userId = req.user._id; // Get the user ID from the request
        const pipelineId = req.user.pipeline; // Get the pipeline ID from the user
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
        const contracts = await Contract.find(matchFilter())
            .populate('client_id', 'name')
            .populate('lead_type', 'name')
            .populate('pipeline_id', 'name')
            .populate('source_id', 'name')
            .populate('products', 'name')
            .populate('created_by', 'name')
            .populate('selected_users', 'name')
            .populate('contract_stage', 'name')
            .populate('branch', 'name')


        res.status(200).json(contracts);
    } catch (error) {
        console.error('Error fetching contracts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a single contract by ID
router.get('/single-contract/:id', isAuth, hasPermission(['view_contract']), async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id)
            .populate('client_id', 'name email e_id phone')
            .populate('lead_type', 'name company_Name')
            .populate('pipeline_id', 'name')
            .populate('source_id', 'name')
            .populate('products', 'name')
            .populate('created_by', 'name')
            .populate({
                path: 'selected_users',
                select: 'name image role',
                populate: {
                    path: 'branch',
                    select: 'name'
                }
            })
            // Populate service commission with nested user -> department -> areas
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
                path: 'contract_activity_logs',
                populate: { path: 'user_id', select: 'name image' }
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
            });

        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        if (contract.is_converted) {
            return res.status(400).json({ message: 'The contract has already been converted to a deal.' });
        }

        res.status(200).json(contract);
    } catch (error) {
        console.error('Error fetching contract:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



router.put('/update-stage/:id', isAuth, hasPermission(['update_product_stage_contract']), async (req, res) => {
    try {
        const { id } = req.params;
        const { contract_stage } = req.body;

        // Validate input
        if (!contract_stage) {
            return res.status(400).json({ error: 'Contract stage is required' });
        }

        // Find the contract and populate the contract_stage to get its name
        const contract = await Contract.findById(id).populate('contract_stage selected_users');
        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        // Store the previous stage name for logging
        const previousStageName = contract.contract_stage ? contract.contract_stage.name : 'Unknown';

        // Update the contract stage
        contract.contract_stage = contract_stage; // Assume contract_stage is passed as an ObjectId
        await contract.save();

        // Fetch the new stage name after updating
        const updatedContract = await Contract.findById(id).populate('contract_stage');
        const newStageName = updatedContract.contract_stage ? updatedContract.contract_stage.name : 'Unknown';

        // Fetch the sender's details
        const sender = await User.findById(req.user._id);
        if (!sender) {
            return res.status(404).json({ error: 'Sender not found' });
        }

        // Create a new activity log entry
        const activityLog = new ContractActivityLog({
            user_id: sender._id,
            contract_id: contract._id,
            log_type: 'Stage Update',
            remark: `Contract stage changed from '${previousStageName}' to '${newStageName}'`,
            created_at: Date.now(),
        });

        const savedActivityLog = await activityLog.save();

        // Push the activity log ID into the contract's activity logs array
        contract.contract_activity_logs.push(savedActivityLog._id);
        await contract.save();

        // Notification and Socket.IO logic
        const io = getIO();

        // Filter users with roles Manager, HOD, MD, or CEO
        const rolesToNotify = ['Manager', 'HOD', 'MD', 'CEO'];
        const usersToNotify = contract.selected_users.filter(user =>
            rolesToNotify.includes(user.role)
        );

        const notificationPromises = usersToNotify.map(async (user) => {
            // Create a new notification
            const notification = new Notification({
                sender: sender._id,
                receiver: user._id,
                message: `${sender.name} updated the contract stage from '${previousStageName}' to '${newStageName}'`,
                reference_id: contract._id,
                notification_type: 'Contract',
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
                    name: sender.name, // Sender's name
                    image: sender.image, // Sender's image
                },
                createdAt: savedNotification.created_at,
            });

            return savedNotification;
        });

        // Wait for all notifications to be created and sent
        await Promise.all(notificationPromises);

        res.status(200).json({
            message: 'Contract stage updated successfully',
            contract,
            activity_log: savedActivityLog
        });
    } catch (error) {
        console.error('Error updating contract stage:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// // Update a contract by ID
// router.put('/:id', async (req, res) => {
//     try {
//         const { 
//             is_transfer,
//             client_id,
//             lead_type,
//             pipeline_id,
//             source_id,
//             products,
//             contract_stage,
//             labels,
//             status,
//             created_by,
//             lead_id,
//             selected_users,
//             is_active,
//             date
//         } = req.body;

//         const updatedContract = await Contract.findByIdAndUpdate(
//             req.params.id,
//             {
//                 is_transfer,
//                 client_id,
//                 lead_type,
//                 pipeline_id,
//                 source_id,
//                 products,
//                 contract_stage,
//                 labels,
//                 status,
//                 created_by,
//                 lead_id,
//                 selected_users,
//                 is_active,
//                 date
//             },
//             { new: true }
//         );

//         if (!updatedContract) {
//             return res.status(404).json({ error: 'Contract not found' });
//         }

//         res.status(200).json(updatedContract);
//     } catch (error) {
//         console.error('Error updating contract:', error);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });
// Delete a contract by ID
router.delete('/:id', async (req, res) => {
    try {
        const deletedContract = await Contract.findByIdAndDelete(req.params.id);

        if (!deletedContract) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        res.status(200).json({ message: 'Contract deleted successfully' });
    } catch (error) {
        console.error('Error deleting contract:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Example route for handling Service Commissions
router.get('/:id/service-commission', async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id)
            .populate('service_commission_id');

        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }

        res.status(200).json(contract.service_commission_id);
    } catch (error) {
        console.error('Error fetching service commission:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/convert-to-deal/:contractId', isAuth, hasPermission(['create_deal']), async (req, res) => {
    try {
        const contractId = req.params.contractId;
        const userId = req.user._id;

        // Find the contract
        const contract = await Contract.findById(contractId)
            .populate('client_id')
            .populate('lead_type')
            .populate('pipeline_id')
            .populate('source_id')
            .populate('products')
            .populate('created_by')
            .populate('selected_users')
            .populate('service_commission_id');

        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        if (contract.is_converted === true) {
            return res.status(400).json({ message: 'Contract is already converted' });
        }
        // Retrieve the deal stage with order "1"
        const initialDealStage = await DealStage.findOne({ order: 0 });
        if (!initialDealStage) {
            return res.status(404).json({ error: 'Initial deal stage not found' });
        }

        // Create a new deal based on the contract
        const newDeal = new Deal({
            company: req.user.company, // Assign the authenticated user's company
            client_id: contract.client_id._id,
            lead_type: contract.lead_type._id,
            pipeline_id: contract.pipeline_id._id,
            source_id: contract.source_id._id,
            products: contract.products._id, // Handle multiple products
            deal_stage: initialDealStage._id,
            status: 'Active',
            created_by: userId,
            lead_id: contract.lead_id || null,
            contract_id: contract._id,
            selected_users: contract.selected_users.map(user => user._id),
            is_active: true,
            service_commission_id: contract.service_commission_id ? contract.service_commission_id._id : null,
            loan_type: contract.loan_type || '',
            building_type: contract.building_type || '',
            plot_no: contract.plot_no || '',
            sector: contract.sector || '',
            emirate: contract.emirate || '',
            date: new Date(),
            branch: contract.branch._id,
        });

        // Save the new deal
        await newDeal.save();

        // Create a deal activity log for the deal creation
        const dealActivityLog = new DealActivityLog({
            user_id: userId,
            deal_id: newDeal._id,
            log_type: 'Deal Created',
            remark: `Deal created from contract ${contract.client_id.name}`,
        });

        const savedDealActivityLog = await dealActivityLog.save();

        // Push the activity log ID into the deal's deal_activity_logs
        newDeal.deal_activity_logs = [savedDealActivityLog._id];
        await newDeal.save();

        // Update the contract to mark it as converted
        contract.is_converted = true;
        await contract.save();

        // Notification and Socket.IO logic
        const io = getIO();

        const sender = await User.findById(userId);
        if (!sender) {
            return res.status(404).json({ error: 'Sender not found' });
        }

        const rolesToNotify = ['Manager', 'HOD', 'MD', 'CEO'];
        const usersToNotify = contract.selected_users.filter(user =>
            rolesToNotify.includes(user.role)
        );

        const notificationPromises = usersToNotify.map(async (user) => {
            const notification = new Notification({
                sender: sender._id,
                receiver: user._id,
                message: `${sender.name} converted contract ${contract._id} to a deal.`,
                reference_id: newDeal._id,
                notification_type: 'Deal',
                created_at: Date.now(),
            });

            const savedNotification = await notification.save();

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

        await Promise.all(notificationPromises);

        // Return a success response
        res.status(201).json({
            message: 'Contract converted to deal successfully',
            deal: newDeal,
            activityLog: savedDealActivityLog,
            contract: {
                _id: contract._id,
                is_converted: contract.is_converted,
                is_transfer: contract.is_transfer,
            },
        });
    } catch (error) {
        console.error('Error converting contract to deal:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/add-user-to-contract/:contractId', isAuth, async (req, res) => {
    try {
        const { userId } = req.body;
        const contractId = req.params.contractId;

        // Find contract and populate necessary fields
        const contract = await Contract.findById(contractId)
            .populate('client_id selected_users');
        if (!contract) {
            return res.status(404).json({ message: 'Contract not found' });
        }

        // Check if req.user is already in selected_users
        const isAuthorized = contract.selected_users.some(user => user._id.toString() === req.user._id.toString());
        if (!isAuthorized) {
            return res.status(403).json({ message: 'You are not authorized to add users to this contract' });
        }

        // Check if user already exists in selected_users
        if (contract.selected_users.some(user => user._id.toString() === userId)) {
            return res.status(400).json({ message: 'User already added to selected users' });
        }

        // Fetch the new user info
        const newUser = await User.findById(userId);
        if (!newUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Add user to selected_users
        contract.selected_users.push(newUser);
        contract.updated_at = Date.now();
        const updatedContract = await contract.save();

        // Log activity for adding a user
        const activityLog = new ContractActivityLog({
            user_id: req.user._id,
            contract_id: updatedContract._id,
            log_type: 'Add User',
            remark: `User ${newUser.name} added to selected users`,
            created_at: Date.now(),
            updated_at: Date.now()
        });
        await activityLog.save();

        // Push activity log to contract
        updatedContract.contract_activity_logs.push(activityLog._id);
        await updatedContract.save();

        // Notification and Socket.IO logic
        const io = getIO(); // Initialize socket IO
        const notifications = [];

        // Get selected users to notify (excluding certain roles if needed)
        const usersToNotify = contract.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Super Admin', 'Admin'].includes(user.role)
        );

        // Fetch sender details
        const sender = await User.findById(req.user._id);

        // Send notifications
        for (const user of usersToNotify) {
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id,
                message: `User ${newUser.name} was added to the contract of ${contract.client_id.name}`,
                reference_id: updatedContract._id,
                notification_type: 'Contract',
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            // Emit notification via socket
            io.to(`user_${user._id}`).emit('notification', {
                message: newNotification.message,
                referenceId: savedNotification.reference_id,
                notificationType: savedNotification.notification_type,
                notificationId: savedNotification._id,
                sender: {
                    name: sender.name,
                    image: sender.image,
                },
                createdAt: savedNotification.created_at,
            });
        }

        res.status(200).json({
            message: 'User added to selected users successfully, notifications sent',
            contract: updatedContract,
            activity_log: activityLog,
            notifications,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});




module.exports = router;
