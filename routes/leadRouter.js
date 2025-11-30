const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Lead = require('../models/leadModel');
const { isAuth, hasRole } = require('../utils');
const Client = require('../models/clientModel');
const bcrypt = require('bcrypt');
const User = require('../models/userModel');
const ProductStage = require('../models/productStageModel');
const leadDiscussionModel = require('../models/leadDiscussionModel');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const File = require('../models/fileModel');
const serviceCommissionModel = require('../models/serviceCommissionModel');
const Contract = require('../models/contractModel');
const ActivityLog = require('../models/activityLogModel');
const LeadType = require('../models/leadTypeModel');
const Pipeline = require('../models/pipelineModel');
const Source = require('../models/sourceModel');
const Product = require('../models/productModel');
const Branch = require('../models/branchModel');
const Notification = require('../models/notificationModel');
const { getIO } = require('../socket');
const twilio = require('twilio');
const Phonebook = require('../models/phonebookModel.js')
const accountSid = 'AC9f10e22cf1b500ee219526db55a7c523';
const authToken = '7c92ad39a6fa0648fdd5d257dfd7deaa';
const client = twilio(accountSid, authToken);
const fromWhatsAppNumber = 'whatsapp:+14155238886';
const axios = require('axios');
const hasPermission = require('../hasPermission.js');
const contractStageModel = require('../models/contractStageModel.js');
const ContractActivityLog = require('../models/ContractActivityLogModel.js');
const DealActivityLog = require('../models/dealActivityLogModel.js');
const dealModel = require('../models/dealModel.js');
const ExcelJS = require('exceljs');
const cloudinary = require('cloudinary');
const whatsAppMessageModel = require('../models/whatsAppMessageModel.js');

// Cloudinary config
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


const storage = multer.memoryStorage();
const upload = multer({ storage }).array('files', 10); // Max 10 files



/////////////////////////////////////
//////// Marketing Lead /////////////
/////////////////////////////////////
router.get('/get-marketing-leads', async (req, res) => {
    try {
        const marketingLeadType = await LeadType.findOne({ name: 'Marketing' });
        if (!marketingLeadType) {
            return res.status(404).json({ message: 'Marketing lead type not found' });
        }

        // Fetch products
        const Bproducts = await Product.findOne({ name: "Business Banking" });
        const Mproducts = await Product.findOne({ name: "Mortgage Loan" });

        // Fetch all relevant leads
        const leads = await Lead.find({
            lead_type: marketingLeadType._id,
            products: { $in: [Bproducts._id, Mproducts._id] },
            pipeline_id: null,
            branch: null
        }).populate([
            {
                path: 'products',
                populate: { path: 'pipeline_id', select: 'name' } // Populate pipeline_id inside products
            },
            { path: 'client' }
        ]);

        // Separate leads based on the product name
        const businessBankingLeads = leads.filter(lead =>
            lead.products && lead.products.name === "Business Banking"
        );

        const mortgageLoanLeads = leads.filter(lead =>
            lead.products && lead.products.name === "Mortgage Loan"
        );

        // Send response with leads separated
        res.json({
            businessBankingLeads,
            mortgageLoanLeads
        });

    } catch (error) {
        console.error('Error fetching marketing leads:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
router.get('/export-leads', async (req, res) => {
    try {
        const productId = new mongoose.Types.ObjectId("67bb0cf6e9d3544ec59e8069");
        const branchId = new mongoose.Types.ObjectId("67bb0ee2b424dd60da421fe2");
        const productStageId = new mongoose.Types.ObjectId("67bb0cf7e9d3544ec59e8980");

        const leads = await Lead.find({
            products: productId,
            is_reject: true,
        }).populate('client', 'phone name dncr_status');

        // Create workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Leads Report');

        // Add headers
        worksheet.columns = [
            { header: 'Client Name', key: 'name', width: 30 },
            { header: 'Phone Number', key: 'phone', width: 20 },
            { header: 'DNCR Status', key: 'dncr_status', width: 20 }
        ];

        // Add rows
        leads.forEach(lead => {
            worksheet.addRow({
                name: lead.client?.name || '',
                phone: lead.client?.phone || '',
                dncr_status: lead.client?.dncr_status || ''
            });
        });

        // Set the path to save the file
        const timestamp = Date.now();
        const fileName = `leads_report_${timestamp}.xlsx`;
        const filePath = path.join(__dirname, '../exports', fileName);

        // Save the file to disk
        await workbook.xlsx.writeFile(filePath);

        res.json({ message: '✅ File saved successfully', filePath });
    } catch (error) {
        console.error('❌ Error exporting leads:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

router.get('/lead-for-marketing', isAuth, async (req, res) => {
    try {
        const marketingLeadType = await LeadType.findOne({ name: 'Marketing' });
        if (!marketingLeadType) {
            return res.status(404).json({ message: 'Lead type "Marketing" not found' });
        }

        const mortgageProduct = await Product.findOne({ name: 'Mortgage Loan', status: 'Active', delStatus: false });
        const businessBankingProduct = await Product.findOne({ name: 'Business Banking', status: 'Active', delStatus: false });

        if (!mortgageProduct || !businessBankingProduct) {
            return res.status(404).json({ message: 'Required products not found' });
        }


        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const endOfDay = new Date(now.setHours(23, 59, 59, 999));
        const startOfYesterday = new Date(now.setDate(now.getDate() - 1));
        startOfYesterday.setHours(0, 0, 0, 0);
        const endOfYesterday = new Date(startOfYesterday);
        endOfYesterday.setHours(23, 59, 59, 999);
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const findLeads = async (filter) => {
            return await Lead.find(filter)
                .populate({ path: 'client', select: 'name phone' })
                .populate({ path: 'source', select: 'name' })
                .populate({ path: 'products', select: 'name' })
                .populate({ path: 'product_stage', select: 'name' })
                .populate({ path: 'pipeline_id', select: 'name' });
        };

        const marketingLeads = await findLeads({ lead_type: marketingLeadType._id, is_reject: false, is_converted: false });
        const todayLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay } });
        const yesterdayLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfYesterday, $lte: endOfYesterday } });
        const weeklyLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfWeek } });
        const monthlyLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfMonth } });




        const mortgageLeads = await findLeads({ lead_type: marketingLeadType._id, products: mortgageProduct._id });
        const mortgagetodayLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay } });
        const mortgageyesterdayLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfYesterday, $lte: endOfYesterday } });
        const mortgageweeklyLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfWeek } });
        const mortgagemonthlyLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfMonth } });




        const businessBankingLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay }, products: businessBankingProduct._id });
        const businessBankingtodayLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay }, products: businessBankingProduct._id });
        const businessBankingyesterdayLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfYesterday, $lte: endOfYesterday }, products: businessBankingProduct._id });
        const businessBankingeweeklyLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfWeek }, products: businessBankingProduct._id });
        const businessBankingmonthlyLeads = await findLeads({ lead_type: marketingLeadType._id, created_at: { $gte: startOfMonth }, products: businessBankingProduct._id });



        const totalRejectedLeads = await findLeads({ lead_type: marketingLeadType._id, is_reject: true });
        const yesterdayRejectedLeads = await findLeads({ lead_type: marketingLeadType._id, updated_at: { $gte: startOfYesterday, $lte: endOfYesterday } });
        const weeklyRejectedLeads = await findLeads({ lead_type: marketingLeadType._id, updated_at: { $gte: startOfWeek } });
        const monthlyRejectedLeads = await findLeads({ lead_type: marketingLeadType._id, updated_at: { $gte: startOfMonth } });

        const todayRejectedLeads = await findLeads({ lead_type: marketingLeadType._id, is_reject: true, updated_at: { $gte: startOfDay, $lte: endOfDay } });

        const totalNotifiedLeads = await findLeads({ lead_type: marketingLeadType._id, notify_user: true });

        const formatLeads = (leads) => leads.map(lead => ({
            _id: lead._id,
            clientName: lead.client?.name || "N/A",
            clientphone: lead.client?.phone || "N/A",
            products: lead.products.name,
            pipeline: lead.pipeline_id?.name || "N/A",
            product_stage: lead.product_stage?.name || "N/A",
            source: lead.source?.name || "N/A",
            created_at: lead.created_at,
            updated_at: lead.updated_at
        }));


        const findDeals = async (filter) => {
            return await dealModel.find({ delstatus: false, lead_type: marketingLeadType._id })
                .populate({ path: 'client_id', select: 'name' })
                .populate({ path: 'lead_id', select: '_id' })
                .populate({ path: 'products', select: 'name' })
                .populate({ path: 'deal_stage', select: 'name' })
                .populate({ path: 'created_by', select: 'name' });
        };




        const marketingDeals = await findDeals({ lead_type: marketingLeadType._id, is_reject: false, is_converted: false });
        const todayDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay } });
        const yesterdayDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfYesterday, $lte: endOfYesterday } });
        const weeklyDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfWeek } });
        const monthlyDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfMonth } });




        const mortgageDeals = await findDeals({ lead_type: marketingLeadType._id, products: mortgageProduct._id });
        const mortgagetodayDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay }, products: mortgageProduct._id });
        const mortgageyesterdayDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfYesterday, $lte: endOfYesterday }, products: mortgageProduct._id });
        const mortgageweeklyDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfWeek }, products: mortgageProduct._id });
        const mortgagemonthlyDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfMonth }, products: mortgageProduct._id });




        const businessBankingDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay }, products: businessBankingProduct._id });
        const businessBankingtodayDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfDay, $lte: endOfDay }, products: businessBankingProduct._id });
        const businessBankingyesterdayDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfYesterday, $lte: endOfYesterday }, products: businessBankingProduct._id });
        const businessBankingeweeklyDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfWeek }, products: businessBankingProduct._id });
        const businessBankingmonthlyDeals = await findDeals({ lead_type: marketingLeadType._id, created_at: { $gte: startOfMonth }, products: businessBankingProduct._id });



        const totalRejectedDeals = await findDeals({ lead_type: marketingLeadType._id, is_reject: true });
        const yesterdayRejectedDeals = await findDeals({ lead_type: marketingLeadType._id, updated_at: { $gte: startOfYesterday, $lte: endOfYesterday } });
        const weeklyRejectedDeals = await findDeals({ lead_type: marketingLeadType._id, updated_at: { $gte: startOfWeek } });
        const monthlyRejectedDeals = await findDeals({ lead_type: marketingLeadType._id, updated_at: { $gte: startOfMonth } });

        const todayRejectedDeals = await findDeals({ lead_type: marketingLeadType._id, is_reject: true, updated_at: { $gte: startOfDay, $lte: endOfDay } });

        const formatDeals = (deals) => deals.map(deal => ({
            _id: deal._id,
            clientName: deal.client_id?.name || "N/A",
            leadId: deal.lead_id?._id || "N/A",
            products: deal.products.name,
            deal_stage: deal.deal_stage?.name || "N/A",
            created_by: deal.created_by?.name || "N/A",
            created_at: deal.created_at,
            updated_at: deal.updated_at
        }));

        res.status(200).json({
            message: 'Lead counts fetched successfully',
            counts: {
                marketingLeads: { count: marketingLeads.length, leads: formatLeads(marketingLeads) },
                todayLeads: { count: todayLeads.length, leads: formatLeads(todayLeads) },
                yesterdayLeads: { count: yesterdayLeads.length, leads: formatLeads(yesterdayLeads) },
                weeklyLeads: { count: weeklyLeads.length, leads: formatLeads(weeklyLeads) },
                weeklyLeads: { count: weeklyLeads.length, leads: formatLeads(weeklyLeads) },
                monthlyLeads: { count: monthlyLeads.length, leads: formatLeads(monthlyLeads) },

                mortgageLeads: { count: mortgageLeads.length, leads: formatLeads(mortgageLeads) },
                mortgagetodayLeads: { count: mortgagetodayLeads.length, leads: formatLeads(mortgagetodayLeads) },
                mortgageyesterdayLeads: { count: mortgageyesterdayLeads.length, leads: formatLeads(mortgageyesterdayLeads) },
                mortgageweeklyLeads: { count: mortgageweeklyLeads.length, leads: formatLeads(mortgageweeklyLeads) },
                mortgagemonthlyLeads: { count: mortgagemonthlyLeads.length, leads: formatLeads(mortgagemonthlyLeads) },

                businessBankingLeads: { count: businessBankingLeads.length, leads: formatLeads(businessBankingLeads) },
                businessBankingtodayLeads: { count: businessBankingtodayLeads.length, leads: formatLeads(businessBankingtodayLeads) },
                businessBankingyesterdayLeads: { count: businessBankingyesterdayLeads.length, leads: formatLeads(businessBankingyesterdayLeads) },
                businessBankingeweeklyLeads: { count: businessBankingeweeklyLeads.length, leads: formatLeads(businessBankingeweeklyLeads) },
                businessBankingmonthlyLeads: { count: businessBankingmonthlyLeads.length, leads: formatLeads(businessBankingmonthlyLeads) },

                totalRejectedLeads: { count: totalRejectedLeads.length, leads: formatLeads(totalRejectedLeads) },
                yesterdayRejectedLeads: { count: yesterdayRejectedLeads.length, leads: formatLeads(yesterdayRejectedLeads) },
                weeklyRejectedLeads: { count: weeklyRejectedLeads.length, leads: formatLeads(weeklyRejectedLeads) },
                monthlyRejectedLeads: { count: monthlyRejectedLeads.length, leads: formatLeads(monthlyRejectedLeads) },
                todayRejectedLeads: { count: todayRejectedLeads.length, leads: formatLeads(todayRejectedLeads) },
                totalNotifiedLeads: { count: totalNotifiedLeads.length, leads: formatLeads(totalNotifiedLeads) },


                marketingDeals: { count: marketingDeals.length, deals: formatDeals(marketingDeals) },
                yesterdayDeals: { count: yesterdayDeals.length, deals: formatDeals(yesterdayDeals) },
                weeklyDeals: { count: weeklyDeals.length, deals: formatDeals(weeklyDeals) },
                monthlyDeals: { count: monthlyDeals.length, deals: formatDeals(monthlyDeals) },
                monthlyDeals: { count: monthlyDeals.length, deals: formatDeals(monthlyDeals) },
                mortgageDeals: { count: mortgageDeals.length, deals: formatDeals(mortgageDeals) },
                mortgagetodayDeals: { count: mortgagetodayDeals.length, deals: formatDeals(mortgagetodayDeals) },
                mortgageyesterdayDeals: { count: mortgageyesterdayDeals.length, deals: formatDeals(mortgageyesterdayDeals) },
                mortgageweeklyDeals: { count: mortgageweeklyDeals.length, deals: formatDeals(mortgageweeklyDeals) },
                mortgagemonthlyDeals: { count: mortgagemonthlyDeals.length, deals: formatDeals(mortgagemonthlyDeals) },
                businessBankingDeals: { count: businessBankingDeals.length, deals: formatDeals(businessBankingDeals) },
                businessBankingtodayDeals: { count: businessBankingtodayDeals.length, deals: formatDeals(businessBankingtodayDeals) },
                businessBankingyesterdayDeals: { count: businessBankingyesterdayDeals.length, deals: formatDeals(businessBankingyesterdayDeals) },
                businessBankingeweeklyDeals: { count: businessBankingeweeklyDeals.length, deals: formatDeals(businessBankingeweeklyDeals) },
                businessBankingmonthlyDeals: { count: businessBankingmonthlyDeals.length, deals: formatDeals(businessBankingmonthlyDeals) },
                totalRejectedDeals: { count: totalRejectedDeals.length, deals: formatDeals(totalRejectedDeals) },
                yesterdayRejectedDeals: { count: yesterdayRejectedDeals.length, deals: formatDeals(yesterdayRejectedDeals) },
                weeklyRejectedDeals: { count: weeklyRejectedDeals.length, deals: formatDeals(weeklyRejectedDeals) },
                monthlyRejectedDeals: { count: monthlyRejectedDeals.length, deals: formatDeals(monthlyRejectedDeals) },


                todayDeals: { count: todayDeals.length, deals: formatDeals(todayDeals) },
                todayRejectedDeals: { count: todayRejectedDeals.length, deals: formatDeals(todayRejectedDeals) }
            },
        });
    } catch (error) {
        console.error('Error fetching lead counts:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
router.put('/notify/:leadId', isAuth, async (req, res) => {
    const { leadId } = req.params;

    try {
        const lead = await Lead.findById(leadId).populate('selected_users client updated_at');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        lead.notify_user = false;
        lead.updated_at = Date.now();
        await lead.save();

        const io = getIO(); // Initialize socket IO
        const notifications = [];

        // Filter out users who shouldn't receive notifications
        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        // Send notifications
        for (const user of usersToNotify) {
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id, // Sender's ID from auth middleware
                message: `The ${lead.client.name} has submitted a form in the Facebook campaign.`,
                reference_id: lead._id,
                notification_type: 'Lead', // Polymorphic reference to Lead
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            // Use req.user for sender details if available
            const sender = req.user || await User.findById(req.user._id);

            // Emit notification to the correct user room via WebSockets
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

        res.status(200).json({ message: 'User notified successfully' });

    } catch (error) {
        console.error('Error updating notify:', error);
        const errorMessage = error.response?.data?.message || 'Server error';
        res.status(500).json({ message: errorMessage });
    }
});
// GET leads for CEO with specific criteria (lead type: Marketing, product: Mortgage Loan, and no pipeline)
router.get('/ceo-lead', isAuth, async (req, res) => {
    try {
        // Fetch the "Mortgage Loan" product
        const mortgageLoanProduct = await Product.findOne({ name: 'Mortgage Loan' })
            .populate({ path: 'pipeline_id', select: 'name' });

        if (!mortgageLoanProduct) {
            return res.status(404).json({ message: 'Product "Mortgage Loan" not found' });
        }

        // Find the pipeline with the name "CEO"
        const ceoPipeline = await Pipeline.findOne({ name: 'CEO' });
        if (!ceoPipeline) {
            return res.status(404).json({ message: 'Pipeline "CEO" not found' });
        }

        // Fetch leads with the specific criteria
        const leads = await Lead.find({
            products: mortgageLoanProduct._id,
            pipeline_id: ceoPipeline._id,
            is_reject: false,
        })
            .populate('pipeline_id', 'name')
            .populate('lead_type', 'name')
            .populate({
                path: 'source',
                populate: { path: 'lead_type_id', select: 'name created_by' },
            })
            .populate('created_by', 'name email')
            .populate('client', 'name email phone')
            .populate({
                path: 'activity_logs',
                populate: { path: 'user_id', select: 'name email' },
            })

            .populate({
                path: 'product_stage',
                populate: { path: 'product_id', select: 'name' },
            })
            .populate({
                path: 'products',
                populate: { path: 'pipeline_id', select: 'name' },
            })
            .lean(); // Convert to plain JS objects for better performance

        // Format leads for the response
        const formattedLeads = leads.map(lead => ({
            _id: lead._id,
            client: lead.client ? {
                _id: lead.client._id,
                name: lead.client.name,
                phone: lead.client.phone,
            } : null,
            created_by: lead.created_by ? {
                _id: lead.created_by._id,
                name: lead.created_by.name,
                email: lead.created_by.email,
            } : null,
            selected_users: Array.isArray(lead.selected_users) ? lead.selected_users.map(user => ({
                _id: user?._id || null,
                name: user?.name || '',
                role: user?.role || '',
            })) : [],
            pipeline_id: lead.pipeline_id ? {
                _id: lead.pipeline_id._id,
                name: lead.pipeline_id.name,
            } : null,
            lead_type: lead.lead_type ? {
                _id: lead.lead_type._id,
                name: lead.lead_type.name,
            } : null,
            source: lead.source ? {
                _id: lead.source._id,
                name: lead.source.name,
            } : null,
            products: Array.isArray(lead.products) ? lead.products.map(product => ({
                _id: product?._id || null,
                name: product?.name || '',
                pipeline_id: Array.isArray(product?.pipeline_id) ? product.pipeline_id.map(pipe => ({
                    _id: pipe?._id || null,
                    name: pipe?.name || '',
                })) : []
            })) : lead.products ? {
                _id: lead.products?._id || null,
                name: lead.products?.name || '',
                pipeline_id: Array.isArray(lead.products?.pipeline_id) ? lead.products.pipeline_id.map(pipe => ({
                    _id: pipe?._id || null,
                    name: pipe?.name || '',
                })) : []
            } : null,
            company_Name: lead.company_Name || '',
            activity_logs: Array.isArray(lead.activity_logs) ? lead.activity_logs.map(log => log._id) : [],
            discussions: lead.discussions || [],
            files: lead.files || [],
            labels: lead.labels || [],
            is_active: lead.is_active,
            is_converted: lead.is_converted,
            is_reject: lead.is_reject,
            is_transfer: lead.is_transfer,
            is_blocklist_number: lead.is_blocklist_number,
            delstatus: lead.delstatus,
            messages: lead.messages || [],
            description: lead.description || '',
            phonebookcomments: lead.phonebookcomments || [],
            date: lead.date,
            created_at: lead.created_at,
            updated_at: lead.updated_at,
            __v: lead.__v,
            branch: lead.branch ? {
                _id: lead.branch._id,
                name: lead.branch.name,
                timestamp: lead.branch.timestamp,
                delstatus: lead.branch.delstatus,
                __v: lead.branch.__v,
            } : null,
            product_stage: lead.product_stage ? {
                _id: lead.product_stage._id,
                name: lead.product_stage.name,
            } : null,
        }));

        res.status(200).json({
            message: 'CEO leads fetched successfully',
            leads: formattedLeads,
        });
    } catch (error) {
        console.error('Error fetching CEO leads:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
router.get('/get-leads/:productId/branch/:branchId', isAuth, hasPermission(['view_lead']), async (req, res) => {
    try {
        const { productId, branchId } = req.params; // Get productId and branchId from URL params
        const userId = req.user._id; // Authenticated user's ID from isAuth middleware
        const userPipeline = req.user.pipeline; // User's pipeline array from JWT token

        // Validate if the product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Validate if the branch exists
        const branch = await Branch.findById(branchId);
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Build query filters dynamically
        const leadFilters = {
            products: productId,
            branch: branchId,
            selected_users: userId,
            is_converted: false,
            is_reject: false,
        };

        // If userPipeline is not empty, filter leads by pipeline IDs
        if (userPipeline && userPipeline.length > 0) {
            leadFilters.pipeline_id = { $in: userPipeline };
        }

        // Fetch leads with the dynamic filters
        const leads = await Lead.find(leadFilters)
            .populate('pipeline_id', 'name')
            .populate('lead_type', 'name')
            .populate({
                path: 'discussions',
                select: 'comment created_at',
                populate: {
                    path: 'created_by',
                    select: 'name',
                },
            })
            .populate({
                path: 'source',
                populate: {
                    path: 'lead_type_id',
                    select: 'name created_by',
                },
            })
            .populate('created_by', 'name email')
            .populate('client', 'name email phone block_list_number dncr_status')
            .populate({
                path: 'selected_users',
                match: { role: { $nin: ['HOD', 'CEO', 'MD', 'Admin', 'Developer', 'Marketing'] } },
                select: 'name role image',
            })
            .populate({
                path: 'activity_logs',
                populate: {
                    path: 'user_id',
                    select: 'name email',
                },
            })

            .populate({
                path: 'transfer_from.pipeline',
                select: 'name',
            })
            .populate({
                path: 'transfer_from.branch',
                select: 'name',
            })
            .populate({
                path: 'transfer_from.product_stage',
                select: 'name',
            })
            .populate({
                path: 'transfer_from.products',
                select: 'name',
            })
            .populate({
                path: 'product_stage',
                populate: {
                    path: 'product_id',
                    select: 'name',
                },
            })
            .populate({
                path: 'labels',
                select: 'name color',
            })
            .populate('products', 'name')
            .populate({
                path: 'messages',
                match: { read: false },
                select: 'read message_body',
            });

        res.status(200).json(leads);
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
router.get('/search-leads', isAuth, async (req, res) => {
    try {
        const {
            userId, // Filter by userId
            pipeline, // Filter by pipeline
            created_at_start,
            created_at_end,
            lead_type, // Filter by lead type
            source, // Filter by source
            client, // Filter by client
            products, // Filter by products
            branch, // Filter by branch
        } = req.query;

        const user = req.user; // Authenticated user from isAuth middleware
        const authenticatedUserId = user._id;

        // Initialize the query object
        const query = {
            is_converted: false,
            is_reject: false,
            selected_users: authenticatedUserId, // Ensure lead's selected_users includes the authenticated user
        };

        // Filter by userId if provided
        if (userId) {
            query.selected_users = new mongoose.Types.ObjectId(String(userId));
        }

        // Filter by pipeline if provided or restrict by the user's pipeline array
        if (pipeline) {
            query.pipeline_id = new mongoose.Types.ObjectId(String(pipeline));
        }

        // Filter by lead type
        if (lead_type) {
            query.lead_type = new mongoose.Types.ObjectId(String(lead_type));
        }

        // Filter by source
        if (source) {
            query.source = new mongoose.Types.ObjectId(String(source));
        }

        // Filter by client
        if (client) {
            query.client = new mongoose.Types.ObjectId(String(client));
        }

        // Filter by branch
        if (branch) {
            query.branch = new mongoose.Types.ObjectId(String(branch));
        }

        // Date range filtering for created_at
        if (created_at_start || created_at_end) {
            const createdAtFilter = {};
            if (created_at_start) createdAtFilter.$gte = new Date(created_at_start);
            if (created_at_end) createdAtFilter.$lte = new Date(created_at_end);
            query.created_at = createdAtFilter;
        }

        // Filter by products
        if (products) {
            query.products = {
                $in: products.split(',').map(id => new mongoose.Types.ObjectId(String(id))),
            };
        }

        // Fetch total leads matching the query
        const totalLeads = await Lead.countDocuments(query);



        // Fetch leads with population
        const leads = await Lead.find(query)

            .populate('branch', 'name') // Populate branch
            .populate('pipeline_id', 'name') // Populate pipeline
            .populate('lead_type', 'name') // Populate lead type
            .populate({
                path: 'discussions',
                select: 'comment created_at',
                populate: {
                    path: 'created_by',
                    select: 'name image',
                },
            })
            .populate({
                path: 'source',
                populate: {
                    path: 'lead_type_id',
                    select: 'name ',
                },
            })
            .populate('created_by', 'name email') // Populate created_by
            .populate('client', 'name email phone block_list_number dncr_status') // Populate client
            .populate('selected_users', 'name role image') // Populate selected_users
            .populate({
                path: 'activity_logs',
                populate: {
                    path: 'user_id',
                    select: 'name email',
                },
            })
            .populate({
                path: 'files',
                select: 'file_name file_path created_at updated_at',
            })

            .populate({
                path: 'transfer_from.pipeline',
                select: 'name',
            })
            .populate({
                path: 'transfer_from.branch',
                select: 'name',
            })
            .populate({
                path: 'transfer_from.product_stage',
                select: 'name',
            })
            .populate({
                path: 'transfer_from.products',
                select: 'name',
            })
            .populate({
                path: 'product_stage',
                populate: {
                    path: 'product_id',
                    select: 'name',
                },
            })
            .populate({
                path: 'labels',
                select: 'name color',
            })
            .populate('products', 'name')
            .populate({
                path: 'messages',
                match: { read: false },
                select: 'read message_body',
            });

        // Format file paths in leads
        leads.forEach(lead => {
            if (lead.files) {
                lead.files.forEach(file => {
                    file.file_path = `${file.file_path}`;
                });
            }
        });

        // Respond with leads and total count
        res.status(200).json({
            leads,
            total: totalLeads,
        });
    } catch (error) {
        console.error('Error searching leads:', error);
        res.status(500).json({ message: 'Error searching leads', error: error.message });
    }
});
router.post('/create-lead', isAuth, hasPermission(['create_lead']), async (req, res) => {
    try {
        // Destructure and validate input
        const {
            clientPhone,
            clientw_phone,
            clientName,
            clientEmail,
            cliente_id,
            company_Name,
            product_stage,
            lead_type,
            pipeline,
            products,
            source,
            description,
            branch,
            thirdpartyname
        } = req.body;

        if (!products) {
            return res.status(400).json({ message: 'Product is required' });
        }

        const productId = new mongoose.Types.ObjectId(String(products));
        const branchId = new mongoose.Types.ObjectId(String(branch));
        const productStageId = new mongoose.Types.ObjectId(String(product_stage));
        const pipelineId = pipeline ? new mongoose.Types.ObjectId(String(pipeline)) : null;

        // Validate product stage
        const validProductStage = await ProductStage.findById(productStageId);
        if (!validProductStage) {
            return res.status(400).json({ message: 'Invalid product stage' });
        }

        // Check for existing client with same phone or emirates ID
        let existingClient = null;
        if (clientPhone) {
            existingClient = await Client.findOne({ phone: clientPhone });
        }

        if (!existingClient && cliente_id) {
            existingClient = await Client.findOne({ e_id: cliente_id });
        }

        // If client exists, check for duplicate lead with same product
        if (existingClient) {
            const existingLead = await Lead.findOne({
                client: existingClient._id,
                products: productId
            });

            if (existingLead) {
                return res.status(400).json({
                    message: 'Lead already exists for this client with the same product'
                });
            }
        }

        // Handle third party user
        let thirdPartyUserId = null;
        if (thirdpartyname) {
            if (mongoose.Types.ObjectId.isValid(thirdpartyname)) {
                const existingUser = await User.findById(thirdpartyname);
                if (!existingUser) {
                    return res.status(404).json({ message: 'Third Party user not found' });
                }
                thirdPartyUserId = existingUser._id;
            } else if (typeof thirdpartyname === 'string') {
                let thirdPartyUser = await User.findOne({
                    role: 'Third Party',
                    name: thirdpartyname
                });

                if (!thirdPartyUser) {
                    thirdPartyUser = new User({
                        name: thirdpartyname,
                        role: 'Third Party',
                        email: `${thirdpartyname.replace(/\s+/g, '')}thirdparty@jovera.ae`
                    });
                    await thirdPartyUser.save();
                }
                thirdPartyUserId = thirdPartyUser._id;
            }
        }

        // Check phonebook for blocked numbers
        const phonebookEntry = await Phonebook.findOne({ number: clientPhone }).populate('comments');
        let leadTypeId, sourceId;

        if (phonebookEntry) {
            leadTypeId = new mongoose.Types.ObjectId('67bb0cf6e9d3544ec59e8029');
            sourceId = new mongoose.Types.ObjectId('67bb0cf6e9d3544ec59e8044');
            req.body.dncr_status = phonebookEntry.status === "BLOCKED" ? "BLOCKED" : "UNBLOCKED";
        } else {
            leadTypeId = new mongoose.Types.ObjectId(String(lead_type));
            sourceId = new mongoose.Types.ObjectId(String(source));
        }

        // Validate lead type
        const validLeadType = await LeadType.findById(leadTypeId);
        if (!validLeadType) {
            return res.status(400).json({ message: 'Invalid lead type' });
        }

        // Create client if doesn't exist
        let client = existingClient;
        if (!client) {
            const defaultPassword = '123';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            client = new Client({
                phone: clientPhone,
                w_phone: clientw_phone,
                e_id: cliente_id,
                name: clientName || '',
                email: clientEmail || '',
                password: hashedPassword,
                dncr_status: req.body.dncr_status || 'Waiting',
            });
            await client.save();
        }

        // Get users to be assigned to the lead
        const initialSelectedUsers = Array.isArray(req.body.selected_users)
            ? req.body.selected_users
            : [];
        const initialUserIds = initialSelectedUsers.map(id => id.toString());

        let allSelectedUserIds = [...initialUserIds, req.user._id.toString()];

        // Get users by roles
        const getUsersByRole = async (role, additionalFilters = {}) => {
            return await User.find({ role, ...additionalFilters }).select('_id name');
        };

        const [
            ceoUsers,
            superadminUsers,
            mdUsers,
            managerUsers,
            hodUsers,
            homUsers
        ] = await Promise.all([
            getUsersByRole('CEO'),
            getUsersByRole('Admin'),
            getUsersByRole('MD'),
            getUsersByRole('Manager', {
                branch: branchId,
                pipeline: pipelineId
            }),
            getUsersByRole('HOD', { products: productId }),
            getUsersByRole('HOM', { products: productId })
        ]);

        allSelectedUserIds = [
            ...allSelectedUserIds,
            ...ceoUsers.map(user => user._id.toString()),
            ...superadminUsers.map(user => user._id.toString()),
            ...mdUsers.map(user => user._id.toString()),
            ...hodUsers.map(user => user._id.toString()),
            ...homUsers.map(user => user._id.toString()),
            ...managerUsers.map(user => user._id.toString()),
        ];

        // Add marketing and developer users for marketing leads
        if (validLeadType.name === 'Marketing') {
            const [marketingUsers, developerUsers] = await Promise.all([
                getUsersByRole('Marketing'),
                getUsersByRole('Developer')
            ]);
            allSelectedUserIds.push(
                ...marketingUsers.map(user => user._id.toString()),
                ...developerUsers.map(user => user._id.toString())
            );
        }

        // Create unique user IDs list
        const uniqueUserIds = [...new Set(allSelectedUserIds)];

        // Create new lead
        const newLead = new Lead({
            company: req.user.company,   // 🔹 Added
            client: client._id,
            clientName: clientName || client.name,
            product_stage: productStageId,
            lead_type: leadTypeId,
            pipeline_id: pipelineId,
            source: sourceId,
            products: productId,
            description,
            branch: branchId,
            selected_users: uniqueUserIds,
            company_Name,
            created_by: req.user._id,
            is_blocklist_number: req.body.is_blocklist_number || false,
            phonebookcomments: phonebookEntry
                ? phonebookEntry.comments.map(comment => comment._id)
                : [],
            thirdpartyname: thirdPartyUserId
        });

        const savedLead = await newLead.save();

        // Update phonebook entry if exists
        if (phonebookEntry) {
            phonebookEntry.calstatus = 'Convert to Lead';
            phonebookEntry.lead_id = savedLead._id;
            await phonebookEntry.save();
        }

        // Create activity log
        const activityLog = new ActivityLog({
            lead_id: savedLead._id,
            log_type: 'Lead Created',
            remark: `New lead created for product ${validProductStage.name} by ${req.user.name}`,
            user_id: req.user._id,
            created_at: new Date()
        });
        await activityLog.save();

        // Update lead with activity log
        savedLead.activity_logs.push(activityLog._id);
        await savedLead.save();

        return res.status(201).json({
            message: 'Lead created successfully',
            lead: savedLead
        });
    } catch (error) {
        console.error('Error creating lead:', error);
        return res.status(500).json({
            message: 'Error creating lead',
            error: error.message
        });
    }
});
router.post('/create-lead-for-phone-book', isAuth, hasPermission(['create_lead']), async (req, res) => {
    try {
        let {
            clientPhone,
            clientw_phone, // WhatsApp phone
            clientName,
            clientEmail,
            cliente_id,
            company_Name,
            pipeline,
            products,
            description,
            branch,
        } = req.body;
        clientw_phone = (clientw_phone || clientPhone); // Default WhatsApp to clientPhone if not provided
        if (!clientPhone) {
            console.error('clientPhone is undefined or empty!', clientPhone);
            return res.status(400).json({ message: 'clientPhone is required' });
        }
        // Validate and find product stage
        const productId = new mongoose.Types.ObjectId(String(products));
        const productStage = await ProductStage.findOne({
            product_id: productId,
            delstatus: false
        }).sort({ order: 1 });


        const productStageId = productStage?._id || null;
        const branchId = new mongoose.Types.ObjectId(String(branch));
        const pipelineId = new mongoose.Types.ObjectId(String(pipeline));
        // Check for existing client with same phone or emirates ID
        let existingClient = null;
        if (clientPhone) {
            existingClient = await Client.findOne({ phone: clientPhone });
        }

        if (!existingClient && cliente_id) {
            existingClient = await Client.findOne({ e_id: cliente_id });
        }

        // If client exists, check for duplicate lead with same product
        if (existingClient) {
            const existingLead = await Lead.findOne({
                client: existingClient._id,
                products: productId
            });

            if (existingLead) {
                return res.status(400).json({
                    message: 'Lead already exists for this client with the same product'
                });
            }
        }


        // Determine LeadType and Source based on req.user.role
        let leadTypeRecord, sourceRecord;

        if (['TS Agent', 'TS Team Leader'].includes(req.user.role)) {
            leadTypeRecord = await LeadType.findOne({ name: 'Tele Sales' });
            sourceRecord = await Source.findOne({ name: 'Phone' });
        } else if (['Marketing'].includes(req.user.role)) {
            leadTypeRecord = await LeadType.findOne({ name: 'Marketing' });
            sourceRecord = await Source.findOne({ name: 'Advertising' });
        } else if (['Sales', 'Team Leader', 'Manager', 'HOD', 'HOM'].includes(req.user.role)) {
            leadTypeRecord = await LeadType.findOne({ name: 'Others' });
            sourceRecord = await Source.findOne({ name: 'Sales' });
        } else {
            return res.status(400).json({ message: 'Role not recognized for this operation' });
        }

        if (!leadTypeRecord || !sourceRecord) {
            return res.status(400).json({ message: 'Required LeadType or Source not found' });
        }


        const leadTypeId = leadTypeRecord._id;
        const sourceId = sourceRecord._id;

        // Create client if doesn't exist
        let client = existingClient;
        if (!client) {
            const defaultPassword = '123';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            client = new Client({
                phone: clientPhone,
                w_phone: clientw_phone,
                e_id: cliente_id,
                name: clientName || '',
                email: clientEmail || '',
                password: hashedPassword,
                dncr_status: req.body.dncr_status || 'Waiting',
            });
            await client.save();
        }

        // Base query
        const queryConditions = [
            { role: 'CEO' },
            { role: 'Admin' },
            { role: 'MD' },
            { role: 'HOD', products: productId },
            { role: 'HOM', products: productId },
            { role: 'Manager', branch: branchId, pipeline: pipelineId },
            // { role: 'Team Leader', branch: branchId, pipeline: pipelineId }
        ];

        // If the requester is Marketing, include all users with role Marketing
        if (req.user.role === 'Marketing') {
            queryConditions.push({ role: 'Marketing' });
        }

        const additionalUsers = await User.find({
            $or: queryConditions
        }).select('_id');


        const allSelectedUserIds = new Set([
            ...(Array.isArray(req.body.selected_users) ? req.body.selected_users.map(id => id.toString()) : []),
            req.user._id.toString(),
            ...additionalUsers.map(user => user._id.toString())
        ]);
        const phonebookEntry = await Phonebook.findOne({ number: clientPhone }).populate('comments');
        // Create a new lead
        const newLead = new Lead({
            company: req.user.company,   // 🔹 Added
            created_by: req.user._id,
            client: client._id,
            clientName,
            product_stage: productStageId,
            lead_type: leadTypeId,
            pipeline_id: pipelineId || null,
            source: sourceId,
            products: productId,
            description,
            branch: branchId,
            selected_users: [...allSelectedUserIds],
            company_Name,
            created_by: req.user._id,
            phonebookcomments: phonebookEntry ? phonebookEntry.comments.map(comment => comment._id) : [], // Ensure you're pushing Comment _ids
        });

        const savedLead = await newLead.save();

        // Update Phonebook with lead_id
        if (phonebookEntry) {
            phonebookEntry.lead_id = savedLead._id;
            await phonebookEntry.save();
        }

        // Send SMS to client
        // try {
        //     await axios.post('http://172.16.20.13:8080/api/whatsup/send-welcome-content', {
        //         leadId: savedLead._id,
        //         userId: req.user._id
        //     });
        // } catch (smsError) {
        //     console.error('Error sending SMS:', smsError);
        // }

        // Log activity for lead creation
        const activityLog = new ActivityLog({
            lead_id: savedLead._id,
            log_type: 'Lead Created',
            remark: `Lead created by ${req.user.name || req.user.email} for client ${client.name || client.phone}`,
            user_id: req.user._id,
            created_at: new Date()
        });
        await activityLog.save();

        savedLead.activity_logs.push(activityLog._id);
        await savedLead.save();

        return res.status(201).json(savedLead);
    } catch (error) {
        console.error('Error creating lead:', error);
        return res.status(500).json({ message: 'Error creating lead', error: error.message });
    }
});
// Helper function to validate and convert strings to ObjectIds
const convertToObjectId = id => {
    if (id && mongoose.isValidObjectId(id)) {
        return new mongoose.Types.ObjectId(String(id));
    } else {
        return null;
    }
};
// New route to get leads based on products and filter by unassigned Sales users 
router.get('/unassigned-leads/:productId', isAuth, hasPermission(['unassigned_lead']), async (req, res) => {
    try {
        const { productId } = req.params; // Extract productId from route params
        const UserId = req.user._id;
        // Validate productId
        const productObjectId = convertToObjectId(productId);
        if (!productObjectId) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        // Fetch all leads with the specific product and filter unassigned Sales and Team Leaders
        const unassignedLeads = await Lead.find({ products: productObjectId, is_reject: false, selected_users: UserId, is_converted: false })
            .populate('pipeline_id', 'name') // Populate pipeline name
            .populate('product_stage', 'name') // Populate product stage
            .populate('lead_type', 'name') // Populate lead type
            .populate('source', 'name') // Populate source
            .populate('products', 'name') // Populate products
            .populate('branch') // Populate branch
            .populate('client', 'name phone') // Populate client
            .populate('created_by', 'name email') // Populate the creator's name and email
            .populate({
                path: 'selected_users',
                select: 'name role image',
                model: 'User',
            });

        const leadsWithoutSalesOrTeamLeaders = unassignedLeads.filter(lead => {
            const hasTeamLeader = lead.selected_users.some(user => user.role === 'Team Leader');
            return !hasTeamLeader;
        });

        if (leadsWithoutSalesOrTeamLeaders.length === 0) {
            return res.status(404).json({ message: 'No unassigned leads found for the selected product' });
        }

        res.status(200).json({
            message: 'Unassigned leads fetched successfully',
            leads: leadsWithoutSalesOrTeamLeaders
        });
    } catch (error) {
        console.error('Error fetching unassigned leads:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.get('/unassigned-leads-for-team-leader/:productId', isAuth, hasPermission(['unassigned_lead']), async (req, res) => {
    try {
        const { productId } = req.params; // Extract productId from route params
        const UserId = req.user._id;
        // Validate productId
        const productObjectId = convertToObjectId(productId);
        if (!productObjectId) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        // Fetch all leads with the specific product and filter unassigned Sales and Team Leaders
        const unassignedLeads = await Lead.find({ products: productObjectId, is_reject: false, selected_users: UserId, is_converted: false })
            .populate('pipeline_id', 'name') // Populate pipeline name
            .populate('product_stage', 'name') // Populate product stage
            .populate('lead_type', 'name') // Populate lead type
            .populate('source', 'name') // Populate source
            .populate('products', 'name') // Populate products
            .populate('branch') // Populate branch
            .populate('client', 'name phone') // Populate client
            .populate('created_by', 'name email') // Populate the creator's name and email
            .populate({
                path: 'selected_users',
                select: 'name role image',
                model: 'User',
            });

        // Filter leads where none of the selected users have the roles "Sales" or "Team Leader"
        const leadsWithoutSalesOrTeamLeaders = unassignedLeads.filter(lead => {
            const relevantUsers = lead.selected_users.filter(
                user => user.role === 'Sales'
            );
            return relevantUsers.length === 0; // Only return leads with no "Sales" or "Team Leader" users
        });

        if (leadsWithoutSalesOrTeamLeaders.length === 0) {
            return res.status(404).json({ message: 'No unassigned leads found for the selected product' });
        }

        res.status(200).json({
            message: 'Unassigned leads fetched successfully',
            leads: leadsWithoutSalesOrTeamLeaders
        });
    } catch (error) {
        console.error('Error fetching unassigned leads:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.put('/edit-labels/:leadId', isAuth, hasPermission(['lead_labels']), async (req, res) => {
    try {
        const { leadId } = req.params;
        const { labels } = req.body; // Expecting an array of label IDs or an empty array

        // Validate leadId and convert to ObjectId
        const leadObjectId = convertToObjectId(leadId);
        if (!leadObjectId) {
            return res.status(400).json({ message: 'Invalid lead ID' });
        }

        // If labels is undefined or not an array, default to an empty array (clear labels)
        const labelArray = Array.isArray(labels) ? labels : [];

        // Ensure all labels are valid ObjectIds
        const validLabelIds = labelArray.map(label => convertToObjectId(label)).filter(id => id !== null);

        // Update the lead by setting the labels field to the new validLabelIds array (empty if none provided)
        const updatedLead = await Lead.findByIdAndUpdate(
            leadObjectId,
            { $set: { labels: validLabelIds } }, // Set the labels field to the new array or empty array
            { new: true }
        ).populate('labels', 'name'); // Assuming Label has a 'name' field

        if (!updatedLead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        res.status(200).json({ message: 'Labels updated successfully', lead: updatedLead });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
// Route to get all leads that are not rejected (is_reject: false)
router.get('/rejected-leads', isAuth, async (req, res) => {
    try {
        const userId = req?.user?._id;
        const userPipeline = req?.user?.pipeline || []; // Ensure pipeline is an array even if undefined

        // Build the query condition
        const query = { is_reject: true, selected_users: userId };

        // If userPipeline is not empty, add it to the query condition
        if (userPipeline.length > 0) {
            query.pipeline_id = { $in: userPipeline }; // Match pipelines in the user's pipeline array
        }

        const leads = await Lead.find(query)
            .sort({ updated_at: -1 }) // ✅ Sort leads by updated_at descending
            .populate({
                path: 'pipeline_id',
                select: 'name'
            })
            .populate({
                path: 'product_stage',
                select: 'name'
            })
            .populate({
                path: 'lead_type',
                select: 'name'
            })
            .populate({
                path: 'products',
                select: 'name'
            })
            .populate({
                path: 'client',
                select: 'name phone'
            })
            .populate({
                path: 'branch',
                select: 'name'
            })
            .populate({ path: 'rejected_by', select: 'name' }) // ✅ populate rejected_by
            .select('_id pipeline_id products product_stage client branch reject_reason company_Name lead_type updated_at rejected_by'); // Ensure company_Name is selected

        if (leads.length === 0) {
            return res.status(404).json({ message: 'No rejected leads found' });
        }

        // Map through leads to create an array of detailed lead objects
        const leadDetails = leads.map(lead => ({
            id: lead?._id,
            pipelineName: lead?.pipeline_id?.name || null,
            productStage: lead?.product_stage?.name || null,
            productId: lead?.products?._id || null,
            productName: lead?.products?.name || null,
            clientName: lead?.client?.name || null,
            branchName: lead?.branch?.name || null,
            companyName: lead?.company_Name || null, // Ensure company_Name is mapped here
            reject_reason: lead?.reject_reason || null,
            phone: lead.client?.phone || null,
            leadType: lead?.lead_type?.name || null,
            updated_at: lead?.updated_at || null,
            rejectedBy: lead?.rejected_by?.name || null, // ✅ include rejected by name
        }));

        res.status(200).json({ leadDetails });
    } catch (error) {
        console.error('Error fetching rejected leads:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.post('/check-client-phone', isAuth, async (req, res) => {
    try {
        const { clientPhone } = req.body;

        // Find client by phone number
        const client = await Client.findOne({ phone: clientPhone });

        if (client) {
            // Common population fields for deal and contract
            const commonPopulateFields = [
                { path: 'products', select: 'name' },
                { path: 'pipeline_id', select: 'name' },
                { path: 'branch', select: 'name' }
            ];

            // Check for deal first
            const deal = await dealModel.findOne({ client_id: client._id, is_reject: false })
                .populate(commonPopulateFields)
                .populate({ path: 'deal_stage', select: 'name' });

            if (deal) {
                return res.status(200).json({
                    details: {
                        type: 'deal',
                        dealId: deal._id,
                        dealStage: deal.deal_stage?.name || 'N/A',
                        productName: deal.products?.name || 'N/A',
                        pipelineName: deal.pipeline_id?.name || 'N/A',
                        branchName: deal.branch?.name || 'N/A',
                        clientDetails: {
                            name: client.name || 'N/A',
                            email: client.email || 'N/A',
                            phone: client.phone || 'N/A',
                            address: client.address || 'N/A'
                        }
                    }
                });
            }

            // If no deal found, check for contract
            const contract = await Contract.findOne({ client_id: client._id })
                .populate(commonPopulateFields)
                .populate({ path: 'contract_stage', select: 'name' });

            if (contract) {
                return res.status(200).json({
                    details: {
                        type: 'contract',
                        contractId: contract._id,
                        isConverted: contract.is_converted,
                        contractStage: contract.contract_stage?.name || 'N/A',
                        productName: contract.products?.name || 'N/A',
                        pipelineName: contract.pipeline_id?.name || 'N/A',
                        branchName: contract.branch?.name || 'N/A',
                        clientDetails: {
                            name: client.name || 'N/A',
                            email: client.email || 'N/A',
                            phone: client.phone || 'N/A',
                            address: client.address || 'N/A'
                        }
                    }
                });
            }

            // If no deal or contract, fetch leads
            const leads = await Lead.find({ client: client._id })
                .populate('pipeline_id product_stage products client lead_type source selected_users activity_logs files branch stage discussions messages');

            const leadDetails = leads.map((lead) => ({
                id: lead._id,
                client: lead.client,
                createdBy: lead.created_by,
                selectedUsers: lead.selected_users,
                pipeline: lead.pipeline_id,
                productStage: lead.product_stage,
                products: lead.products,
                leadType: lead.lead_type,
                source: lead.source,
                notes: lead.notes || '',
                companyName: lead.company_Name || '',
                description: lead.description || '',
                activityLogs: lead.activity_logs,
                files: lead.files,
                labels: lead.labels || [],
                branch: lead.branch,
                order: lead.order || '',
                thirdPartyName: lead.thirdpartyname || '',
                dealStage: lead.deal_stage || '',
                isActive: lead.is_active,
                isConverted: lead.is_converted,
                isRejected: lead.is_reject,
                isTransferred: lead.is_transfer,
                date: lead.date,
                messages: lead.messages,
                createdAt: lead.created_at,
                updatedAt: lead.updated_at
            }));

            return res.status(200).json({ leadDetails, phonebookEntry: null });
        } else {
            // If client not found, check in the phone book
            const phonebookEntry = await Phonebook.findOne({ number: clientPhone })
                .populate('user', 'name email')
                .populate('pipeline')
                .populate('uploaded_by', 'name')
                .populate('comments')
                .populate('visibility', 'name email');

            if (phonebookEntry) {
                return res.status(200).json({ leadDetails: [], phonebookEntry });
            } else {
                return res.status(404).json({ message: 'Client and phone book entry not found' });
            }
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.post('/check-client-phone-search', isAuth, async (req, res) => {
    try {
        const { clientPhone } = req.body;

        // Find client by phone
        const client = await Client.findOne({ phone: clientPhone });
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Find all leads associated with the client, populating all necessary fields
        const leads = await Lead.find({ client: client._id })
            .populate({
                path: 'pipeline_id', // Populate the pipeline_id field with full details
            })
            .populate({
                path: 'product_stage', // Populate the product_stage field with full details
            })
            .populate({
                path: 'products', // Populate the products field with full details
            })
            .populate({
                path: 'client', // Populate client details
            })
            .populate({
                path: 'lead_type', // Populate lead_type field with full details
            })
            .populate({
                path: 'source', // Populate source field with full details
            })
            .populate({
                path: 'selected_users', // Populate selected users with their full details
                select: 'name email', // Only return relevant user details
            })
            .populate({
                path: 'activity_logs', // Populate activity logs related to the lead
            })
            .populate({
                path: 'files', // Populate any files related to the lead
            })
            .populate({
                path: 'branch', // Populate branch details
            })

            .populate({
                path: 'discussions', // Populate discussions related to the lead
            })
            .populate({
                path: 'messages', // Populate messages related to the lead
            });

        if (leads.length === 0) {
            return res.status(404).json({ message: 'No leads found for this client' });
        }

        // Return full lead data, including populated fields
        const leadDetails = leads.map(lead => ({
            id: lead._id,
            client: lead.client, // Include full client details
            createdBy: lead.created_by, // Include details of the creator
            selectedUsers: lead.selected_users, // Include details of selected users
            pipeline: lead.pipeline_id, // Full pipeline details
            productStage: lead.product_stage, // Full product stage details
            products: lead.products, // Full products details
            leadType: lead.lead_type, // Full lead type details
            source: lead.source, // Full source details
            notes: lead.notes || '', // Notes (if any)
            companyName: lead.company_Name || '', // Company name (if any)
            description: lead.description || '', // Description (if any)
            activityLogs: lead.activity_logs, // Full activity log details
            files: lead.files, // Full file details
            labels: lead.labels || [], // Labels (if any)
            branch: lead.branch, // Full branch details
            order: lead.order || '', // Order details (if any)
            thirdPartyName: lead.thirdpartyname || '', // Third-party name (if any)
            dealStage: lead.deal_stage || '', // Deal stage (if any)
            isActive: lead.is_active, // Lead active status
            isConverted: lead.is_converted, // Lead converted status
            isRejected: lead.is_reject, // Lead rejected status
            isTransferred: lead.is_transfer, // Lead transfer status
            date: lead.date, // Lead date
            messages: lead.messages, // WhatsApp messages related to the lead
            createdAt: lead.created_at, // Created timestamp
            updatedAt: lead.updated_at, // Updated timestamp
        }));

        res.status(200).json(leadDetails); // Send an array of detailed lead objects
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.put('/reject-lead/:leadId', isAuth, hasPermission(['reject_lead']), async (req, res) => {
    try {
        const { leadId } = req.params;
        const { reject_reason } = req.body;

        // Validate leadId and convert to ObjectId
        const leadObjectId = convertToObjectId(leadId);
        if (!leadObjectId) {
            return res.status(400).json({ message: 'Invalid lead ID' });
        }

        // Ensure reject_reason is provided
        if (!reject_reason || typeof reject_reason !== 'string') {
            return res.status(400).json({ message: 'Please Enter Reject Reason' });
        }

        // Find the lead and update is_reject to true and add reject_reason
        const lead = await Lead.findById(leadObjectId).populate('client selected_users');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Update the lead status
        lead.is_reject = true;
        lead.reject_reason = reject_reason;
        lead.rejected_by = req.user._id; // Set the user who rejected the lead
        lead.updated_at = Date.now();
        const updatedLead = await lead.save();

        // Log activity for rejecting a lead
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: updatedLead._id,
            log_type: 'Reject Lead',
            remark: `Lead rejected with reason: ${reject_reason}`,
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        await activityLog.save();

        // Push activity log to lead
        updatedLead.activity_logs.push(activityLog._id);
        await updatedLead.save();

        // Notification and Socket.IO logic
        const io = getIO(); // Initialize socket IO
        const notifications = [];

        // Get the list of selected users (users who need to be notified)
        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        // Fetch the sender's details (name and image)
        const sender = await User.findById(req.user._id);

        // Send notification to each selected user
        for (const notifiedUser of usersToNotify) {
            // Create and save the notification using the polymorphic reference
            const newNotification = new Notification({
                receiver: notifiedUser._id,
                sender: req.user._id, // Save the sender's user ID
                message: `Lead for ${lead.client.name} has been rejected: ${reject_reason}`,
                reference_id: updatedLead._id,
                notification_type: 'Lead', // Polymorphic reference to Lead
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            // Emit notification to the correct user room via WebSockets
            io.to(`user_${notifiedUser._id}`).emit('notification', {

                message: newNotification.message,
                referenceId: savedNotification.reference_id,
                notificationType: savedNotification.notification_type,
                notificationId: savedNotification._id,
                sender: {
                    name: sender.name, // Sender's name
                    image: sender.image, // Sender's image
                },
                createdAt: savedNotification.created_at,
            });
        }

        res.status(200).json({
            message: 'Lead marked as rejected, activity log saved, and notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.put('/restore-reject-lead/:leadId', isAuth, async (req, res) => {
    try {
        const { leadId } = req.params;
        const { branch, pipeline_id, products, product_stage } = req.body;

        // Helper function to validate ObjectId
        const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

        // Validate leadId
        if (!isValidObjectId(leadId)) {
            return res.status(400).json({ message: 'Invalid lead ID' });
        }

        // Validate required fields
        if (!isValidObjectId(branch) || !isValidObjectId(pipeline_id) || !isValidObjectId(products) || !isValidObjectId(product_stage)) {
            return res.status(400).json({ message: 'Invalid ObjectId for branch, pipeline, products, or product_stage' });
        }

        // Find the lead
        const lead = await Lead.findById(leadId).populate('client selected_users');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Restore the lead and update required fields
        lead.is_reject = false;
        lead.reject_reason = ''; // Reset reject reason
        lead.branch = branch;
        lead.pipeline_id = pipeline_id;
        lead.products = products; // Single object reference
        lead.product_stage = product_stage;
        lead.updated_at = Date.now();

        const updatedLead = await lead.save();

        // Log activity for restoring the lead
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: updatedLead._id,
            log_type: 'Lead Restored',
            remark: `Lead restored from rejection with updated product stage.`,
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        await activityLog.save();

        // Push activity log to lead
        updatedLead.activity_logs.push(activityLog._id);
        lead.updated_at = Date.now();
        await updatedLead.save();

        // Initialize Socket.IO and notifications
        const io = getIO();
        const notifications = [];

        // Get the list of selected users excluding certain roles
        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        // Fetch sender details
        const sender = await User.findById(req.user._id);

        // Send notifications
        for (const notifiedUser of usersToNotify) {
            const newNotification = new Notification({
                receiver: notifiedUser._id,
                sender: req.user._id,
                message: `Lead for ${lead.client.name} has been restored from rejection with updated product stage.`,
                reference_id: updatedLead._id,
                notification_type: 'Lead',
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            // Emit notification via WebSockets
            io.to(`user_${notifiedUser._id}`).emit('notification', {
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
            message: 'Lead restored, fields updated, activity log saved, and notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
// Remove user from selected users in a lead
router.put('/remove-user-from-lead/:leadId', isAuth, hasPermission(['remove_user_lead']), async (req, res) => {
    try {
        const { userId } = req.body;
        const leadId = req.params.leadId;

        const lead = await Lead.findById(leadId)
            .populate('client selected_users');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Filter out any invalid/null entries in selected_users
        lead.selected_users = lead.selected_users.filter(user => user);

        // Check if the user exists in selected_users
        if (!lead.selected_users.some(user => user._id.toString() === userId)) {
            return res.status(400).json({ message: 'User not found in selected users' });
        }

        // Fetch the user information to get the name
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Remove user from selected_users
        lead.selected_users = lead.selected_users.filter(user => user._id.toString() !== userId);
        lead.updated_at = Date.now();
        const updatedLead = await lead.save();

        // Log activity for removing a user
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: updatedLead._id,
            log_type: 'Remove User',
            remark: `User ${user.name} removed from selected users`, // Store user name in remark
            created_at: Date.now(),
            updated_at: Date.now()
        });
        await activityLog.save();

        // Push activity log to lead
        updatedLead.activity_logs.push(activityLog._id);
        await updatedLead.save();

        // Notification and Socket.IO logic
        const io = getIO(); // Initialize socket IO
        const notifications = [];

        // Get the list of selected users (users who need to be notified)
        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        // Fetch the sender's details (name and image)
        const sender = await User.findById(req.user._id);

        // Send notification to each selected user
        for (const notifiedUser of usersToNotify) {

            // Create and save the notification using the polymorphic reference
            const newNotification = new Notification({
                receiver: notifiedUser._id,
                sender: req.user._id, // Save the sender's user ID
                message: `User ${user.name} was removed from the lead ${lead.client.name}`,
                reference_id: updatedLead._id,
                notification_type: 'Lead', // Polymorphic reference to Lead
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            // Emit notification to the correct user room via WebSockets
            io.to(`user_${notifiedUser._id}`).emit('notification', {
                message: newNotification.message,
                referenceId: savedNotification.reference_id,
                notificationType: savedNotification.notification_type,
                notificationId: savedNotification._id,
                sender: {
                    name: sender.name, // Sender's name
                    image: sender.image, // Sender's image
                },
                createdAt: savedNotification.created_at,
            });
        }

        res.status(200).json({
            message: 'User removed from selected users successfully, notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.post('/convert-lead-to-contract/:leadId', isAuth, hasPermission(['convert_lead']), async (req, res) => {
    try {
        const { leadId } = req.params;
        const {
            finance_amount,
            bank_commission,
            customer_commission,
            with_vat_commission,
            without_vat_commission,
            commissions, // Array of commission objects from request body
            loan_type,
            building_type,
            plot_no,
            sector,
            emirate
        } = req.body;

        // Find the lead
        const lead = await Lead.findById(leadId)
            .populate('client')
            .populate('products');

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        if (lead.is_converted) {
            return res.status(400).json({ message: 'Lead is already converted to the Contract' });
        }

        const productIds = lead.products._id;

        // Create a new ServiceCommission with commissions array
        const newServiceCommission = new serviceCommissionModel({
            contract_id: null, // Temporary, updated after creating the contract
            finance_amount,
            bank_commission,
            customer_commission,
            with_vat_commission,
            without_vat_commission,
            commissions: commissions || [],
            delstatus: false,
        });
        await newServiceCommission.save();

        // Find initial contract stage
        const contractStage = await contractStageModel.findOne({ order: 0 });

        // 🔹 Fetch all accountants
        const accountants = await User.find({ role: "Accountant" }).select("_id");

        // Merge lead.selected_users + accountants, avoiding duplicates
        const allSelectedUsers = [
            ...new Set([
                ...lead.selected_users.map(u => u.toString()),
                ...accountants.map(u => u._id.toString())
            ])
        ];

        // Prepare and save the contract
        const newContract = new Contract({
            company: req.user.company,

            client_id: lead.client._id,
            lead_type: lead.lead_type,
            pipeline_id: lead.pipeline_id,
            source_id: lead.source,
            products: productIds,
            contract_stage: contractStage._id,
            status: 'Active',
            is_transfer: false,
            labels: lead.labels,
            branch: lead.branch._id,
            created_by: req.user._id,
            lead_id: lead._id,
            selected_users: allSelectedUsers, // ✅ includes accountants
            service_commission_id: newServiceCommission._id,
            loan_type,
            building_type,
            plot_no,
            sector,
            emirate,
            date: new Date(),
        });

        await newContract.save();

        // Update the ServiceCommission with the contract ID
        newServiceCommission.contract_id = newContract._id;
        await newServiceCommission.save();

        // Mark lead as converted
        lead.is_converted = true;
        await lead.save();

        // Add activity log
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: lead._id,
            log_type: 'Lead Conversion',
            remark: `Lead converted to contract. Contract ID: ${newContract._id}. Service Commission ID: ${newServiceCommission._id}.`,
            created_at: new Date(),
            updated_at: new Date()
        });
        await activityLog.save();

        // Update lead with activity log
        lead.activity_logs.push(activityLog._id);
        await lead.save();

        res.status(201).json({
            message: 'Contract created and lead converted successfully',
            contract: newContract,
            service_commission: newServiceCommission
        });
    } catch (error) {
        console.error('Error converting lead to contract:', error);
        res.status(500).json({ message: 'Failed to convert lead to contract', error: error.message });
    }
});

// Route to handle multiple file uploads and link to the lead
router.post('/upload-files/:leadId', isAuth, hasPermission(['file_upload']), (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: 'Error uploading files', error: err });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        try {
            const { leadId } = req.params;
            const lead = await Lead.findById(leadId);
            if (!lead) {
                return res.status(404).json({ message: 'Lead not found' });
            }

            const fileDocs = [];
            const activityLogPromises = [];

            for (const file of req.files) {
                // Upload file buffer to Cloudinary
                const uploadResult = await cloudinary.v2.uploader.upload_stream(
                    { resource_type: 'auto', folder: 'lead_files' },
                    async (error, result) => {
                        if (error) throw error;
                        return result;
                    }
                );

                // Upload via stream
                const stream = cloudinary.v2.uploader.upload_stream(
                    { resource_type: 'auto', folder: 'lead_files' },
                    async (error, result) => {
                        if (error) throw error;

                        // Save file document in DB
                        const newFile = new File({
                            file_name: file.originalname,
                            file_path: result.secure_url,
                            created_at: new Date(),
                            updated_at: new Date(),
                        });
                        await newFile.save();
                        fileDocs.push(newFile);

                        // Attach file reference to lead
                        lead.files.push(newFile._id);
                        lead.updated_at = Date.now();
                        await lead.save();

                        // Activity log
                        const logRemark = `File ${file.originalname} was uploaded by ${req.user.name || req.user.email}`;
                        if (!lead.is_converted) {
                            const activityLog = new ActivityLog({
                                log_type: 'File Uploaded',
                                remark: logRemark,
                                user_id: req.user._id,
                                created_at: new Date(),
                            });
                            activityLogPromises.push(activityLog.save());
                            lead.activity_logs.push(activityLog._id);
                        } else {
                            const contract = await Contract.findOne({ lead_id: leadId });
                            if (!contract) return res.status(404).json({ message: 'Associated contract not found' });

                            if (contract.is_converted) {
                                const deal = await dealModel.findOne({ lead_id: leadId });
                                if (!deal) return res.status(404).json({ message: 'Associated deal not found' });

                                const dealActivityLog = new DealActivityLog({
                                    user_id: req.user._id,
                                    deal_id: deal._id,
                                    log_type: 'File Uploaded',
                                    remark: logRemark,
                                    created_at: new Date(),
                                });
                                activityLogPromises.push(dealActivityLog.save());
                                deal.deal_activity_logs.push(dealActivityLog._id);
                                await deal.save();
                            } else {
                                const contractActivityLog = new ContractActivityLog({
                                    user_id: req.user._id,
                                    contract_id: contract._id,
                                    log_type: 'File Uploaded',
                                    remark: logRemark,
                                    created_at: new Date(),
                                });
                                activityLogPromises.push(contractActivityLog.save());
                                contract.contract_activity_logs.push(contractActivityLog._id);
                                await contract.save();
                            }
                        }
                    }
                );

                // Pipe buffer to Cloudinary upload stream
                stream.end(file.buffer);
            }

            await Promise.all([lead.save(), ...activityLogPromises]);

            res.status(201).json({
                message: 'Files uploaded to Cloudinary and activity logged successfully',
                files: fileDocs,
            });
        } catch (error) {
            console.error('Error uploading files:', error);
            res.status(500).json({ message: 'Error uploading files', error });
        }
    });
});

// Delete file endpoint
router.delete('/delete-file/:leadId/:fileId', isAuth, async (req, res) => {
    try {
        const { leadId, fileId } = req.params;

        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const file = await File.findById(fileId);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Remove file from lead's files array
        lead.files = lead.files.filter(id => id.toString() !== fileId);

        // Log the file deletion in activity logs
        const activityLog = new ActivityLog({
            log_type: 'File Deleted',
            lead_id: lead._id,
            remark: `File ${file.file_name} was deleted by ${req.user.name || req.user.email}`,
            user_id: req.user._id,
            created_at: new Date()
        });
        await activityLog.save();

        lead.activity_logs.push(activityLog._id);
        lead.updated_at = Date.now();
        await lead.save();

        // Delete the file document from the database
        await File.findByIdAndDelete(fileId);

        // Construct the file path for deletion
        const filePath = path.join(__dirname, `../${file.file_path}`);

        // Check if the file exists before attempting to delete
        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting file from filesystem:', err);
                }
            });
        } else {
            console.error('File does not exist in filesystem:', filePath);
        }

        await lead.save();

        res.status(200).json({ message: 'File deleted and activity logged successfully' });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ message: 'Error deleting file' });
    }
});
/// Add Discussion in the lead Model  
router.post('/add-discussion/:leadId', isAuth, async (req, res) => {
    try {
        const { leadId } = req.params;
        const { comment } = req.body;

        // Validate comment input
        if (!comment) {
            return res.status(400).json({ message: 'Comment is required' });
        }

        // Find the lead by ID
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Create a new discussion
        const newDiscussion = new leadDiscussionModel({
            created_by: req.user._id,
            comment,
        });

        await newDiscussion.save();
        lead.discussions.push(newDiscussion._id);
        lead.updated_at = Date.now();
        await lead.save();

        // Handle the activity log creation
        let activityLog;

        if (!lead.is_converted) {
            // Case 1: Lead Not Converted - Log a standard lead activity log
            activityLog = new ActivityLog({
                log_type: 'Discussion Added',
                lead_id: lead._id,
                remark: `Discussion added by ${req.user.name || req.user.email}: "${comment}"`,
                user_id: req.user._id,
                created_at: new Date(),
            });

            await activityLog.save();
            lead.activity_logs.push(activityLog._id);
            lead.updated_at = Date.now();
            await lead.save();
        } else {
            // Lead is converted, check the contract
            const contract = await Contract.findOne({ lead_id: leadId });
            if (!contract) {
                return res.status(404).json({ message: 'Associated contract not found' });
            }

            if (contract.is_converted) {
                // Case 3: Lead and Contract Converted - Log a Deal Activity Log
                const deal = await dealModel.findOne({ lead_id: leadId });
                if (!deal) {
                    return res.status(404).json({ message: 'Associated deal not found' });
                }

                activityLog = new DealActivityLog({
                    user_id: req.user._id,
                    deal_id: deal._id,
                    log_type: 'Discussion Added',
                    remark: `Discussion added for converted deal: "${comment}"`,
                    created_at: new Date(),
                });

                await activityLog.save();
                deal.deal_activity_logs.push(activityLog._id);
                await deal.save();
            } else {
                // Case 2: Lead Converted but Contract Not Converted - Log a Contract Activity Log
                activityLog = new ContractActivityLog({
                    user_id: req.user._id,
                    contract_id: contract._id,
                    log_type: 'Discussion Added',
                    remark: `Discussion added for converted lead: "${comment}"`,
                    created_at: new Date(),
                });

                await activityLog.save();
                contract.contract_activity_logs.push(activityLog._id);
                await contract.save();
            }
        }

        return res.status(201).json({
            message: 'Discussion added successfully',
            discussion: newDiscussion,
            activity_log: activityLog,
        });
    } catch (error) {
        console.error('Error adding discussion:', error);
        res.status(500).json({ message: 'Error adding discussion' });
    }
});
/// Transfer Lead 
router.put('/transfer-lead/:id', isAuth, hasPermission(['transfer_lead']), async (req, res) => {
    try {
        const leadId = req.params.id;
        const { pipeline, branch, products } = req.body;

        if (!pipeline || !branch || !products) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const branchId = new mongoose.Types.ObjectId(String(branch));
        const pipelineId = new mongoose.Types.ObjectId(String(pipeline));
        const productId = new mongoose.Types.ObjectId(String(products));

        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const firstProductStage = await ProductStage.findOne({ product_id: products, order: 1, delstatus: false });
        if (!firstProductStage) {
            return res.status(500).json({ message: 'No product stage found with order 1' });
        }
        const productStageId = firstProductStage._id;

        if (String(lead.products) === String(productId)) {
            return res.status(403).json({ message: 'Cannot transfer the lead in the same product; please change product' });
        }

        const [oldBranch, oldPipeline, oldProductStage, newBranch, newPipeline] = await Promise.all([
            Branch.findById(lead.branch).select('name'),
            Pipeline.findById(lead.pipeline_id).select('_id name'),
            ProductStage.findById(lead.product_stage).select('name'),
            Branch.findById(branchId).select('name'),
            Pipeline.findById(pipelineId).select('name'),
        ]);

        let changes = [];
        if (String(lead.pipeline_id) !== String(pipelineId)) {
            changes.push(`Pipeline changed from ${oldPipeline.name} to ${newPipeline.name}`);
        }
        if (String(lead.branch) !== String(branchId)) {
            changes.push(`Branch changed from ${oldBranch.name} to ${newBranch.name}`);
        }
        if (String(lead.product_stage) !== String(productStageId)) {
            changes.push(`Product Stage changed from ${oldProductStage.name} to ${firstProductStage.name}`);
        }
        if (String(lead.products) !== String(productId)) {
            const [oldProduct, newProduct] = await Promise.all([
                lead.products ? Product.findById(lead.products) : { name: 'None' },
                Product.findById(productId),
            ]);
            changes.push(`Product changed from ${oldProduct.name} to ${newProduct.name}`);
        }

        lead.transfer_from = {
            pipeline: lead.pipeline_id,
            branch: lead.branch,
            product_stage: lead.product_stage,
            products: lead.products,
        };

        lead.products = productId;

        const [ceoUsers, superadminUsers, mdUsers, hodUsers, homUsers, managerUsers] = await Promise.all([
            User.find({ role: 'CEO' }).select('_id name'),
            User.find({ role: 'Admin' }).select('_id name'),
            User.find({ role: 'MD' }).select('_id name'),
            User.find({ role: 'HOD', products: productId }).select('_id name'),
            User.find({ role: 'HOM', products: productId }).select('_id name'),
            User.find({ pipeline: pipelineId, role: 'Manager', branch: branchId }).select('_id name'),
        ]);

        lead.ref_created_by = lead.created_by;

        const newSelectedUserIds = [
            ...ceoUsers.map(user => user._id.toString()),
            ...superadminUsers.map(user => user._id.toString()),
            ...mdUsers.map(user => user._id.toString()),
            ...hodUsers.map(user => user._id.toString()),
            ...homUsers.map(user => user._id.toString()),
            ...managerUsers.map(user => user._id.toString()),
        ];

        lead.selected_users = getUniqueUserIds(newSelectedUserIds);
        lead.pipeline_id = pipelineId;
        lead.branch = branchId;
        lead.product_stage = productStageId; // **Set dynamically fetched product stage**
        lead.is_transfer = true;
        lead.updated_at = Date.now();
        const updatedLead = await lead.save();

        const activityLog = new ActivityLog({
            user_id: req.user._id,
            log_type: 'Lead Transfer',
            remark: changes.length ? `Lead transferred: ${changes.join(', ')}` : 'Lead transferred with no significant changes',
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        await activityLog.save();

        updatedLead.activity_logs.push(activityLog._id);
        await updatedLead.save();

        // Notification and Socket.IO logic
        const io = getIO();
        const notifications = [];

        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        for (const user of usersToNotify) {
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id,
                message: `Lead transferred: ${changes.length ? changes.join(', ') : 'No significant changes'}`,
                reference_id: lead._id,
                notification_type: 'Lead',
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            const sender = await User.findById(req.user._id);

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
            message: 'Lead transferred successfully, notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error('Error transferring lead:', error);
        res.status(500).json({ message: 'Error transferring lead' });
    }
});

router.put('/add-user-to-lead/:leadId', isAuth, hasPermission(['add_user_lead']), async (req, res) => {
    try {
        const { userId } = req.body;
        const leadId = req.params.leadId;

        const lead = await Lead.findById(leadId)
            .populate('client selected_users');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }
        // Check if the req.user._id is in selected_users
        const isAuthorized = lead.selected_users.some(user => user._id.toString() === req.user._id.toString());
        if (!isAuthorized) {
            return res.status(403).json({ message: 'You are not authorized to add users to this lead' });
        }

        // Check if the user already exists in selected_users
        if (lead.selected_users.some(user => user._id.toString() === userId)) {
            return res.status(400).json({ message: 'User already added to selected users' });
        }

        // Fetch the user information to get the name
        const newUser = await User.findById(userId);
        if (!newUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Add user to selected_users
        lead.selected_users.push(newUser);
        lead.updated_at = Date.now();
        const updatedLead = await lead.save();

        // Log activity for adding a user
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: updatedLead._id,
            log_type: 'Add User',
            remark: `User ${newUser.name} added to selected users`, // Store user name in remark
            created_at: Date.now(),
            updated_at: Date.now()
        });
        await activityLog.save();

        // Push activity log to lead
        updatedLead.activity_logs.push(activityLog._id);
        await updatedLead.save();

        // Notification and Socket.IO logic
        const io = getIO(); // Initialize socket IO
        const notifications = [];

        // Get the list of selected users (users who need to be notified)
        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        // Fetch the sender's details (name and image)
        const sender = await User.findById(req.user._id);

        // Send notification to each selected user
        for (const user of usersToNotify) {
            // Create and save the notification using the polymorphic reference
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id, // Save the sender's user ID
                message: `User ${newUser.name} was added to the lead ${lead.client.name}`,
                reference_id: updatedLead._id,
                notification_type: 'Lead', // Polymorphic reference to Lead
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            // Emit notification to the correct user room via WebSockets
            io.to(`user_${user._id}`).emit('notification', {
                message: newNotification.message,
                referenceId: savedNotification.reference_id,
                notificationType: savedNotification.notification_type,
                notificationId: savedNotification._id,
                sender: {
                    name: sender.name, // Sender's name
                    image: sender.image, // Sender's image
                },
                createdAt: savedNotification.created_at,
            });
        }

        res.status(200).json({
            message: 'User added to selected users successfully, notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/move-unassign-for-teamleader/:leadId', isAuth, hasPermission(['add_user_lead']), async (req, res) => {
    try {
        const { userIds, product_stage } = req.body;
        const leadId = req.params.leadId;

        const lead = await Lead.findById(leadId).populate('client selected_users');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const newUsers = await User.find({ _id: { $in: userIds } });
        if (newUsers.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        const addedUsers = [];
        newUsers.forEach(user => {
            if (!lead.selected_users.some(selected => selected._id.toString() === user._id.toString())) {
                lead.selected_users.push(user);
                addedUsers.push(user.name);
            }
        });

        if (product_stage) {
            lead.product_stage = product_stage;
        }
        const updatedLead = await lead.save();

        const activityLog = new ActivityLog({
            user_id: req.user._id,
            log_type: 'Move Lead',
            remark: `Lead updated with new users and product stage: ${product_stage || 'No Change'}`,
            created_at: Date.now(),
            updated_at: Date.now()
        });
        await activityLog.save();

        updatedLead.activity_logs.push(activityLog._id);

        await updatedLead.save();

        const io = getIO();
        const usersToNotify = lead.selected_users.filter(user => !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role));
        const sender = await User.findById(req.user._id);

        const notifications = [];
        for (const user of usersToNotify) {
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id,
                message: `Lead updated with new users and product stage: ${product_stage || 'No Change'}`,
                reference_id: updatedLead._id,
                notification_type: 'Lead',
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

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
            message: 'Users added, product stage updated, and notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
// Add multiple users to selected_users and update branch
router.put('/add-multiple-users-to-lead/:leadId', isAuth, hasPermission(['add_user_lead']), async (req, res) => {
    try {
        const { userIds } = req.body;
        const leadId = req.params.leadId;

        const lead = await Lead.findById(leadId).populate('client selected_users updated_at');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const newUsers = await User.find({ _id: { $in: userIds } });
        if (newUsers.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        const addedUsers = [];
        newUsers.forEach(user => {
            if (!lead.selected_users.some(selected => selected._id.toString() === user._id.toString())) {
                lead.selected_users.push(user);
                addedUsers.push(user.name);
            }
        });

        const updatedLead = await lead.save();

        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: updatedLead._id,
            log_type: 'Move Lead',
            remark: `Move Lead from Unassigned `,
            created_at: Date.now(),
            updated_at: Date.now()
        });
        await activityLog.save();

        updatedLead.activity_logs.push(activityLog._id);
        await updatedLead.save();

        const io = getIO();
        const usersToNotify = lead.selected_users.filter(user => !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role));
        const sender = await User.findById(req.user._id);

        const notifications = [];
        for (const user of usersToNotify) {
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id,
                message: `Move Lead from Unassigned`,
                reference_id: updatedLead._id,
                notification_type: 'Lead',
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

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
            message: 'Users added to selected users, branch updated successfully, and notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
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
// New route to move lead (Update pipeline, branch, product_stage)
router.put('/move-lead/:id', isAuth, hasPermission(['move_lead']), async (req, res) => {
    try {
        const leadId = req.params.id;
        const { pipeline, branch, product } = req.body;

        if (!pipeline || !branch || !product) {
            return res.status(400).json({ message: 'Missing required fields: pipeline, branch, or product' });
        }

        const lead = await Lead.findById(leadId).populate('products');
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        if (String(lead.pipeline_id) === String(pipeline)) {
            return res.status(400).json({ message: 'Lead cannot be moved to the same pipeline' });
        }

        const productId = new mongoose.Types.ObjectId(product);

        const firstProductStage = await ProductStage.findOne({
            product_id: productId,
            order: 0,
            delstatus: false
        });
        if (!firstProductStage) return res.status(400).json({ message: 'No valid initial product stage found' });

        const branchId = new mongoose.Types.ObjectId(branch);
        const pipelineId = new mongoose.Types.ObjectId(pipeline);
        const productStageId = firstProductStage._id;

        const [oldBranch, oldPipeline, oldProductStage, newBranch, newPipeline, newProductStage] = await Promise.all([
            Branch.findById(lead.branch).select('name'),
            Pipeline.findById(lead.pipeline_id).select('name'),
            ProductStage.findById(lead.product_stage).select('name'),
            Branch.findById(branchId).select('name'),
            Pipeline.findById(pipelineId).select('name'),
            ProductStage.findById(productStageId).select('name')
        ]);

        const changes = [];
        if (String(lead.pipeline_id) !== String(pipelineId)) changes.push(`Pipeline changed from ${oldPipeline?.name} to ${newPipeline?.name}`);
        if (String(lead.branch) !== String(branchId)) changes.push(`Branch changed from ${oldBranch?.name} to ${newBranch?.name}`);
        if (String(lead.product_stage) !== String(productStageId)) changes.push(`Product Stage changed from ${oldProductStage?.name} to ${newProductStage?.name}`);
        if (String(lead.products._id) !== String(productId)) changes.push(`Product changed from ${lead.products.name} to ${newProductStage?.name}`);

        // Fetch users
        const [ceoUsers, superadminUsers, mdUsers, hodUsers, homUsers, managerUsers] = await Promise.all([
            User.find({ role: 'CEO' }).select('_id'),
            User.find({ role: 'Admin' }).select('_id'),
            User.find({ role: 'MD' }).select('_id'),
            User.find({ role: 'HOD', products: productId }).select('_id'),
            User.find({ role: 'HOM', products: productId }).select('_id'),
            User.find({ pipeline: pipelineId, role: 'Manager', branch: branchId }).select('_id')
        ]);

        const finalSelectedUsers = [...new Set([
            ...ceoUsers, ...superadminUsers, ...mdUsers, ...hodUsers, ...homUsers, ...managerUsers
        ].map(u => u._id.toString()))];

        // Update lead
        lead.selected_users = finalSelectedUsers;
        lead.pipeline_id = pipelineId;
        lead.branch = branchId;
        lead.product_stage = productStageId;
        lead.products = productId; // set product from req.body
        lead.is_move = true;
        lead.ref_created_by = lead.created_by;
        lead.updated_at = Date.now();
        await lead.save();

        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: lead._id,
            log_type: 'Lead Movement',
            remark: changes.length ? `Lead moved: ${changes.join(', ')}` : 'Lead moved with no significant changes',
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        await activityLog.save();

        lead.activity_logs.push(activityLog._id);
        await lead.save();

        // Send notifications
        const io = getIO();
        const sender = await User.findById(req.user._id).select('name image');

        const notifications = await Promise.all(finalSelectedUsers.map(async userId => {
            const newNotification = new Notification({
                receiver: userId,
                sender: req.user._id,
                message: `Lead has been moved. Changes: ${changes.join(', ')}`,
                reference_id: lead._id,
                notification_type: 'Lead',
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();

            io.to(`user_${userId}`).emit('notification', {
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

            return savedNotification;
        }));

        res.status(200).json({
            message: 'Lead moved successfully, notifications sent',
            lead,
            activity_log: activityLog,
            notifications,
        });

    } catch (error) {
        console.error('Error moving lead:', error);
        res.status(500).json({ message: 'Error moving lead' });
    }
});

router.put('/move-lead-ceo/:id', isAuth, async (req, res) => {
    try {
        const leadId = req.params.id;
        const { pipeline, branch, teamleader } = req.body;
        // Ensure required fields are provided
        if (!pipeline || !branch || !teamleader) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Check if the lead exists
        const lead = await Lead.findById(leadId);
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }
        const productId = lead.products._id;
        if (!productId) {
            return res.status(400).json({ message: 'Product information is missing in the lead' });
        }

        const branchId = new mongoose.Types.ObjectId(String(branch));
        const pipelineId = new mongoose.Types.ObjectId(String(pipeline));
        const newBranch = await Branch.findById(branchId).select('name');
        const newPipeline = await Pipeline.findById(pipelineId).select('name');
        const ceoUsers = await User.find({ role: 'CEO' }).select('_id name');
        const superadminUsers = await User.find({ role: 'Admin' }).select('_id name');
        const marketingUsers = await User.find({ role: 'Marketing' }).select('_id name');
        const DevelopersUsers = await User.find({ role: 'Developer' }).select('_id name');
        const mdUsers = await User.find({ role: 'MD' }).select('_id name');
        const hodUsers = await User.find({ role: 'HOD', products: productId }).select('_id name'); // HOD with product filter
        const homUsers = await User.find({ role: 'HOM', products: productId }).select('_id name'); // HOM with product filter
        const managerUsers = await User.find({
            pipeline: pipelineId,
            role: 'Manager',
            branch: branchId, // Filter managers by the new branch
        }).select('_id name');

        const createdByUser = lead.created_by ? await User.findById(lead.created_by).select('_id name') : null;
        const teamleaderIds = teamleader.map(id => id.toString());
        const allSelectedUsers = [
            req.user._id.toString(), // Include the currently authenticated user
            createdByUser ? createdByUser._id.toString() : null, // Include the created_by user if it exists
            ...ceoUsers.map(user => user._id.toString()),
            ...teamleaderIds,
            ...marketingUsers.map(user => user._id.toString()),
            ...DevelopersUsers.map(user => user._id.toString()),
            ...superadminUsers.map(user => user._id.toString()),
            ...mdUsers.map(user => user._id.toString()),
            ...hodUsers.map(user => user._id.toString()), // Include HOD with product filter
            ...homUsers.map(user => user._id.toString()), // Include HOM with product filter
            ...managerUsers.map(user => user._id.toString()), // Manager filtered by branch
        ].filter(Boolean); // Filter out any null or undefined values

        lead.selected_users = allSelectedUsers;

        // Update the pipeline, branch, and product_stage
        lead.pipeline_id = pipelineId;
        lead.branch = branchId;
        lead.updated_at = Date.now();
        // Save the updated lead
        const updatedLead = await lead.save();

        // Create an activity log entry
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            log_type: 'Lead Movement',
            remark: `Lead has been moved from Marketing Team`,
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        await activityLog.save();

        // Push the activity log ID to the lead
        updatedLead.activity_logs.push(activityLog._id);
        await updatedLead.save();

        const io = getIO(); // Initialize socket IO
        const notifications = [];

        // Filter out users with roles that should not receive notifications
        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin', 'Marketing'].includes(user.role)
        );

        // Send notification to each selected user
        for (const user of usersToNotify) {
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id, // Save the sender's user ID
                message: `Lead has been moved from Marketing Team `,
                reference_id: lead._id,
                notification_type: 'Lead', // Polymorphic reference to Lead
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            const sender = await User.findById(req.user._id).select('name image');

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
            message: 'Lead moved successfully, notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error('Error moving lead:', error);
        res.status(500).json({ message: 'Error moving lead' });
    }
});
router.get('/single-lead/:id', isAuth, hasPermission(['view_lead']), async (req, res) => {
    try {
        const { id } = req.params;

        // Validate the ID format
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid lead ID format' });
        }

        // Step 1: Fetch the lead with necessary fields for authorization and "is_converted" check
        const leadForAuthCheck = await Lead.findById(id).select('selected_users is_converted');
        if (!leadForAuthCheck) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Check if the lead is converted
        if (leadForAuthCheck.is_converted) {
            return res.status(403).json({ message: 'This lead has been converted and cannot be accessed.' });
        }

        // Ensure `selected_users` is an array and not empty
        if (!Array.isArray(leadForAuthCheck.selected_users) || leadForAuthCheck.selected_users.length === 0) {
            return res.status(403).json({ message: 'You are not authorized to view this lead' });
        }

        // Ensure the user session is valid
        // if (!req.user || !req.user._id) {
        //     return res.status(403).json({ message: 'Invalid user session. Authorization failed' });
        // }

        // Step 2: Check if the user is authorized
        const isAuthorized = leadForAuthCheck.selected_users.some(userId => userId.equals(req.user._id));
        if (!isAuthorized) {
            return res.status(403).json({ message: 'You are not authorized to view this lead' });
        }

        // Step 3: Fetch the full lead details
        const lead = await Lead.findById(id)
            .populate({
                path: 'client',
                select: 'name email phone w_phone e_id block_list_number dncr_status'
            })
            .populate({
                path: 'created_by',
                select: 'name role'
            })
            .populate({
                path: 'selected_users',
                match: { role: { $nin: ['CEO', 'MD', 'Developer', 'Marketing'] } },
                select: 'name role image branch',
                populate: {
                    path: 'branch',
                    select: 'name'
                }
            })
            .populate('pipeline_id', 'name')
            .populate('thirdpartyname', 'name')
            .populate('product_stage', 'name')
            .populate('lead_type', 'name')
            .populate('source', 'name')
            .populate('products', 'name')
            .populate('branch', 'name')
            .populate('labels', 'name color')
            .populate({
                path: 'phonebookcomments',
                populate: {
                    path: 'user',
                    select: 'name image'
                },
                select: 'remarks createdAt'
            })
            .populate({
                path: 'messages',
                populate: [
                    { path: 'client', select: 'name' },
                    { path: 'user', select: 'name' }
                ]
            })
            .populate({
                path: 'discussions',
                populate: { path: 'created_by', select: 'name image' }
            })
            .populate({
                path: 'files',
            })
            .populate({
                path: 'transfer_from.pipeline',
                select: 'name'
            })
            .populate({
                path: 'transfer_from.branch',
                select: 'name'
            })
            .populate({
                path: 'transfer_from.product_stage',
                select: 'name'
            })
            .populate({
                path: 'transfer_from.products',
                select: 'name'
            })
            .populate({
                path: 'ref_created_by',
                select: 'name role'
            })
            .populate({
                path: 'ref_other_user',
                select: 'name role'
            })
            // .populate({
            //     path: 'ref_manager',
            //     select: 'name role'
            // })
            .populate({
                path: 'activity_logs',
                populate: {
                    path: 'user_id',
                    select: 'name image'
                }
            });

        if (!lead) {
            return res.status(404).json({ message: 'Lead details not found after population' });
        }

        res.status(200).json(lead);
    } catch (error) {
        console.error('Error fetching lead:', error.message, error.stack);

        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid data type in query' });
        }

        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
// Update product_stage of a lead
router.put('/update-product-stage/:leadId', isAuth, hasPermission(['update_product_stage']), async (req, res) => {
    const { leadId } = req.params;
    const { newProductStageId } = req.body;

    if (!newProductStageId) {
        return res.status(400).json({ message: 'New product stage ID is required' });
    }

    try {
        const newProductStage = await ProductStage.findById(newProductStageId);
        if (!newProductStage) {
            return res.status(404).json({ message: 'Product stage not found' });
        }

        const lead = await Lead.findById(leadId).populate('product_stage selected_users client');
        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Check if the user is authorized
        if (!lead.selected_users.some(user => user._id.equals(req.user._id))) {
            return res.status(403).json({ message: 'You are not authorized to update this lead' });
        }

        const previousStageName = lead?.product_stage?.name; // Store the previous stage name

        // Check if the product stage is already at the desired value
        if (previousStageName === newProductStage.name) {
            return res.status(200).json({ message: 'Product stage is already at the desired value', lead });
        }

        // Create an activity log for the update
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: lead._id,
            log_type: 'Product Stage Update',
            remark: `Product Stage of ${lead.client.name} has been changed from ${previousStageName} to ${newProductStage.name}`,
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        const savedActivityLog = await activityLog.save();

        // Update the lead with the new product stage and log
        lead.product_stage = newProductStage._id;
        lead.updated_at = Date.now();
        lead.activity_logs.push(savedActivityLog._id);
        await lead.save();

        const io = getIO(); // Initialize socket IO
        const notifications = [];

        // Filter out users with roles that should not receive notifications
        const usersToNotify = lead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        // Send notification to each selected user
        for (const user of usersToNotify) {
            // Create and save the notification using the polymorphic reference
            const newNotification = new Notification({
                receiver: user._id,
                sender: req.user._id, // Save the sender's user ID
                message: `Product Stage of ${lead.client.name} has been changed from ${previousStageName} to ${newProductStage.name}`,
                reference_id: lead._id,
                notification_type: 'Lead', // Polymorphic reference to Lead
                created_at: Date.now(),
            });

            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            // Fetch the sender's details (name and image)
            const sender = await User.findById(req.user._id);

            // Emit notification to the correct user room via WebSockets
            io.to(`user_${user._id}`).emit('notification', {
                message: newNotification.message,
                referenceId: savedNotification.reference_id, // Send the lead's ID
                notificationType: savedNotification.notification_type, // Send the polymorphic type
                notificationId: savedNotification._id, // Send the notification ID
                sender: {
                    name: sender.name, // Sender's name
                    image: sender.image, // Sender's image
                },
                createdAt: savedNotification.created_at,
            });
        }

        // Respond with success
        res.status(200).json({
            message: 'Product stage updated successfully, notifications sent',
            lead,
            activity_log: savedActivityLog,
            notifications,
        });
    } catch (error) {
        console.error('Error updating product stage:', error);
        res.status(500).json({ message: 'Server error', error });
    }
});
router.put('/restore-lead/:id', isAuth, async (req, res) => {
    try {
        const { description, branch, product_stage, products, pipeline_id } = req.body;
        const leadId = req.params.id;

        // Convert to ObjectIds where necessary
        const branchId = new mongoose.Types.ObjectId(String(branch));
        const productStageId = new mongoose.Types.ObjectId(String(product_stage));
        const productId = new mongoose.Types.ObjectId(String(products));
        const pipelineId = new mongoose.Types.ObjectId(String(pipeline_id));

        // Check for product_stage validity
        const validProductStage = await ProductStage.findById(productStageId);
        if (!validProductStage) {
            return res.status(400).json({ message: 'Invalid product stage' });
        }

        // Find the lead by ID to get previous values
        const lead = await Lead.findById(leadId)
            .populate('branch', 'name')
            .populate('product_stage', 'name')
            .populate('products', 'name')
            .populate('pipeline_id', 'name')
            .exec();

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Prepare previous values for logging and comparison
        const previousProductId = lead.products?.toString();
        const previousPipelineId = lead.pipeline_id?.toString();

        let updatedSelectedUsers = [];

        // Check if products or pipeline_id have changed
        if (previousProductId !== productId.toString() || previousPipelineId !== pipelineId.toString()) {
            // Fetch additional users based on the new pipeline and branch
            const ceoUsers = await User.find({ role: 'CEO' }).select('_id name');
            const superadminUsers = await User.find({ role: 'Admin' }).select('_id name');
            const mdUsers = await User.find({ role: 'MD' }).select('_id name');
            const hodUsers = await User.find({ role: 'HOD', products: productId }).select('_id name'); // HOD with product filter
            const homUsers = await User.find({ role: 'HOM', products: productId }).select('_id name'); // HOM with product filter
            const managerUsers = await User.find({
                pipeline: pipelineId,
                role: 'Manager',
                branch: branchId // Filter managers by the new branch
            }).select('_id name');

            // Include created_by user from the lead
            const createdByUser = lead.created_by
                ? await User.findById(lead.created_by).select('_id name')
                : null;

            // Combine all selected user IDs while keeping previous selected users
            const allSelectedUsers = [
                req.user._id.toString(), // Include the currently authenticated user
                createdByUser ? createdByUser._id.toString() : null, // Include the created_by user if it exists
                ...ceoUsers.map(user => user._id.toString()),
                ...superadminUsers.map(user => user._id.toString()),
                ...mdUsers.map(user => user._id.toString()),
                ...hodUsers.map(user => user._id.toString()), // Include HOD with product filter
                ...homUsers.map(user => user._id.toString()), // Include HOM with product filter
                ...managerUsers.map(user => user._id.toString()), // Manager filtered by branch
                ...updatedSelectedUsers.map(user => user.toString()) // Keep previous selected users
            ].filter(Boolean); // Filter out any null or undefined values

            // Filter out duplicate IDs and update the lead's selected_users
            updatedSelectedUsers = [...new Set(allSelectedUsers)];
        }

        // Prepare previous values for logging
        const previousBranchName = lead.branch?.name || 'N/A';
        const previousProductStageName = (await ProductStage.findById(lead.product_stage)).name || 'N/A';
        const previousProductName = (await Product.findById(lead.products)).name || 'N/A';
        const previousPipelineName = (await Pipeline.findById(lead.pipeline_id)).name || 'N/A';

        // Update the lead with new values
        const updatedLead = await Lead.findByIdAndUpdate(
            leadId,
            {
                is_reject: false,
                description,
                branch: branchId,
                product_stage: productStageId,
                products: productId,
                pipeline_id: pipelineId,
                selected_users: updatedSelectedUsers
            },
            { new: true }
        ).exec();

        if (!updatedLead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Fetch new values for logging
        const newBranchName = (await Branch.findById(branchId)).name;
        const newProductStageName = (await ProductStage.findById(productStageId)).name;
        const newProductName = (await Product.findById(productId)).name;
        const newPipelineName = (await Pipeline.findById(pipelineId)).name;

        // Log the restoration activity with previous and new values
        const activityLog = new ActivityLog({
            user_id: req.user._id,
            lead_id: updatedLead._id,
            log_type: 'Lead Restored',
            remark: `Lead restored. Previous - Branch: ${previousBranchName}, Product Stage: ${previousProductStageName}, Product: ${previousProductName}, Pipeline: ${previousPipelineName}. New - Branch: ${newBranchName}, Product Stage: ${newProductStageName}, Product: ${newProductName}, Pipeline: ${newPipelineName}.`,
            created_at: Date.now(),
            updated_at: Date.now()
        });
        await activityLog.save();

        // Add the activity log ID to the lead's activity logs
        updatedLead.activity_logs.push(activityLog._id);
        updatedLead.updated_at = Date.now();
        await updatedLead.save();

        res.status(200).json(updatedLead);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.put('/edit-lead/:id', isAuth, hasPermission(['edit_lead']), async (req, res) => {
    try {
        const {
            clientName,
            clientEmail,
            cliente_id,
            company_Name,
            description,
            thirdpartyname,
        } = req.body;

        const UserId = req.user._id;
        const leadId = req.params.id;

        const lead = await Lead.findById(leadId)
            .populate('selected_users', 'name')
            .populate('client', 'name')
            .populate('products', 'name')
            .exec();

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Check if cliente_id is provided and different from existing
        if (cliente_id && cliente_id !== lead.client.e_id) {
            // Find if any client exists with this cliente_id
            const existingClient = await Client.findOne({ e_id: cliente_id });

            if (existingClient) {
                // Check if a lead already exists with this client and same product
                const existingLead = await Lead.findOne({
                    client: existingClient._id,
                    products: lead.products // use new product if provided, otherwise existing
                });

                if (existingLead && existingLead._id.toString() !== leadId) {
                    return res.status(400).json({
                        message: 'Lead already exists for this client with the same product',
                        existingLeadId: existingLead._id
                    });
                }
            }
        }

        let client = lead.client;
        let clientUpdated = false;

        // If cliente_id is provided and different from existing, update client
        if (cliente_id && client.e_id !== cliente_id) {
            // Find or create client with this cliente_id
            let existingClient = await Client.findOne({ e_id: cliente_id });

            if (existingClient) {
                // Use existing client
                client = existingClient;
                clientUpdated = true;
            } else {
                // Update current client with new cliente_id
                client.e_id = cliente_id;
                clientUpdated = true;
            }
        }

        // Update other client fields if changed
        if (clientName && client.name !== clientName) {
            client.name = clientName;
            clientUpdated = true;
        }
        if (clientEmail && client.email !== clientEmail) {
            client.email = clientEmail;
            clientUpdated = true;
        }

        if (clientUpdated) {
            await client.save();
        }

        // Prepare updates for the lead
        const updates = {
            client: client._id,
            updated_by: req.user._id,
            company_Name,
            description,
            thirdpartyname: thirdpartyname ? new mongoose.Types.ObjectId(String(thirdpartyname)) : null,
        };

        // Update the lead
        const updatedLead = await Lead.findByIdAndUpdate(leadId, updates, { new: true })
            .populate('selected_users', 'name')
            .populate('client', 'name email e_id')
            .populate('products', 'name')
            .exec();

        if (!updatedLead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Capture the previous and new states for activity log
        const previousState = {
            clientName: lead.client.name,
            clientEmail: lead.client.email,
            cliente_id: lead.client.e_id,
            company_Name: lead.company_Name,
            description: lead.description,
            product: lead.products?.name
        };

        const newState = {
            clientName: updatedLead.client.name,
            clientEmail: updatedLead.client.email,
            cliente_id: updatedLead.client.e_id,
            company_Name: updatedLead.company_Name,
            description: updatedLead.description,
            product: updatedLead.products?.name
        };

        // Prepare the changes for activity log and notification
        const changes = [];
        const notificationChanges = [];

        const checkAndPushChange = (key, prev, current) => {
            if (current !== undefined && current !== null && current !== prev) {
                const changeString = `${key} changed from ${prev || 'null'} to ${current || 'undefined'}`;
                changes.push(changeString);
                notificationChanges.push(changeString);
            }
        };

        checkAndPushChange('clientName', previousState.clientName, newState.clientName);
        checkAndPushChange('clientEmail', previousState.clientEmail, newState.clientEmail);
        checkAndPushChange('cliente_id', previousState.cliente_id, newState.cliente_id);
        checkAndPushChange('company_Name', previousState.company_Name, newState.company_Name);
        checkAndPushChange('description', previousState.description, newState.description);
        checkAndPushChange('products', previousState.product, newState.product);

        // Create activity log only if there are changes
        let activityLog = null;
        if (changes.length > 0) {
            activityLog = new ActivityLog({
                user_id: req.user._id,
                Lead_id: updatedLead._id,
                log_type: 'Lead Update',
                remark: `Lead updated: ${changes.join(', ')}`,
                created_at: Date.now(),
                updated_at: Date.now()
            });
            await activityLog.save();
        }

        // Push activity log ID to lead if available
        if (activityLog) {
            updatedLead.activity_logs.push(activityLog._id);
            await updatedLead.save();
        }

        // Emit notifications for affected users
        const io = getIO();
        const notifications = [];
        const usersToNotify = updatedLead.selected_users.filter(user =>
            !['CEO', 'MD', 'Developer', 'Admin'].includes(user.role)
        );

        for (const notifiedUser of usersToNotify) {
            const newNotification = new Notification({
                sender: UserId,
                receiver: notifiedUser._id,
                message: `Lead ${updatedLead.client.name} was updated. ${notificationChanges.length ? notificationChanges.join(', ') : 'No changes'}`,
                reference_id: updatedLead._id,
                notification_type: 'Lead',
                created_at: Date.now(),
            });

            await newNotification.populate('sender', 'name image');
            const savedNotification = await newNotification.save();
            notifications.push(savedNotification);

            io.to(`user_${notifiedUser._id}`).emit('notification', {
                sender: {
                    name: newNotification.sender.name,
                    image: newNotification.sender.image,
                },
                message: newNotification.message,
                referenceId: savedNotification.reference_id,
                notificationType: savedNotification.notification_type,
                notificationId: savedNotification._id,
                createdAt: savedNotification.created_at,
            });
        }

        res.status(200).json({
            message: 'Lead updated successfully, notifications sent',
            lead: updatedLead,
            activity_log: activityLog,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
///
router.post('/webhook/create-lead', async (req, res) => {
    try {
        let {
            phone,
            name,
            email,
            product,
            details,
        } = req.body;

        if (!product) {
            return res.status(400).json({ message: 'Missing required fields: product' });
        }

        // Helper function to format phone numbers
        const formatPhoneNumber = (phone) => {
            if (!phone) return null;
            const cleanedPhone = phone.replace(/\s+/g, '');
            return cleanedPhone.startsWith('+971') ? cleanedPhone : `+971${cleanedPhone}`;
        };

        const clientPhone = formatPhoneNumber(phone);
        const clientw_phone = formatPhoneNumber(phone || phone);
        let productId;
        let pipelineId;
        let productStageId;

        // Find product, pipeline, and product stage based on loan type
        if (product === 'Business Loan') {
            const businessBanking = await Product.findOne({ name: 'Business Banking' });
            const businessPipeline = await Pipeline.findOne({ name: 'Business Banking' });
            const stageOne = await ProductStage.findOne({ order: 1 });

            productId = businessBanking._id;
            pipelineId = businessPipeline._id;
            productStageId = stageOne._id;
        } else if (product === 'Personal Loan') {
            const personalLoan = await Product.findOne({ name: 'Personal Loan' });
            const personalPipeline = await Pipeline.findOne({ name: 'Personal Loan' });
            const stageOne = await ProductStage.findOne({ order: 1 });

            if (!personalLoan || !personalPipeline || !stageOne) {
                return res.status(400).json({ message: 'Required product, pipeline, or stage not found for Personal Loan' });
            }

            productId = personalLoan._id;
            pipelineId = personalPipeline._id;
            productStageId = stageOne._id;
        } else if (product === 'Mortgage') {
            const mortgageLoan = await Product.findOne({ name: 'Mortgage Loan' });
            productId = mortgageLoan._id;
        } else {
            return res.status(400).json({ message: 'Invalid product type' });
        }

        // Check if client exists
        let client = await Client.findOne({ phone: clientPhone });
        if (!client) {
            const defaultPassword = '123';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);

            client = new Client({
                phone: clientPhone,
                w_phone: clientw_phone,
                name: name || '',
                email: email || '',
                password: hashedPassword,
            });
            await client.save();
        }

        // Find lead type and source
        const leadType = await LeadType.findOne({ name: 'Marketing' });
        const source = await Source.findOne({ name: 'Website' });

        if (!leadType || !source) {
            return res.status(400).json({ message: 'Required lead type or source not found' });
        }

        // Create the lead
        const newLead = new Lead({
            client: client._id,
            product_stage: productStageId,
            pipeline_id: pipelineId || null,
            products: productId,
            details,
            lead_type: leadType._id, // Assign lead type
            source: source._id,     // Assign source
            company_Name: '',       // Default value, if applicable
            created_by: null,       // Update as needed
        });

        const savedLead = await newLead.save();

        // Log activity
        const activityLog = new ActivityLog({
            lead_id: savedLead._id,
            log_type: 'Lead Created',
            remark: `Lead created via webhook for client ${client.name || client.phone}`,
            created_at: new Date(),
        });
        await activityLog.save();
        savedLead.activity_logs.push(activityLog._id);
        await savedLead.save();

        // Response
        res.status(201).json(savedLead);
    } catch (error) {
        console.error('Error creating lead via webhook:', error);
        res.status(500).json({ message: 'Error creating lead', error: error.message });
    }
});
const moment = require('moment');
const { pipeline } = require('stream');
const clientModel = require('../models/clientModel');
////////
router.get('/leads-dashboard/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        // Create ObjectId explicitly using 'new'
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Find the user and populate their products
        const user = await User.findById(userObjectId).populate('products');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get all the products linked to the user
        const userProducts = user.products;

        // Get all the product stages for the user's products
        const productStages = await ProductStage.find({
            product_id: { $in: userProducts },
            delstatus: false // Only include non-deleted stages
        });

        // Initialize an array to hold the stages grouped by product
        const productStagesGrouped = userProducts.map(product => {
            return {
                product: product.name,
                stages: productStages.filter(stage => stage.product_id.toString() === product._id.toString())
            };
        });

        // For each stage, count the leads
        const leadsByStage = [];

        for (const productGroup of productStagesGrouped) {
            for (const stage of productGroup.stages) {
                const leadsCount = await Lead.countDocuments({
                    product_stage: stage._id,
                    is_reject: false, // Exclude rejected leads
                    selected_users: userObjectId,
                    is_converted: false // Exclude converted leads
                });

                leadsByStage.push({
                    product: productGroup.product,
                    stage: stage.name,
                    leadsCount
                });
            }

            // Check if there are any stages with 0 leads
            const allStageNames = productGroup.stages.map(stage => stage.name);
            const existingStageNames = leadsByStage.filter(lead => lead.product === productGroup.product)
                .map(lead => lead.stage);
            const missingStages = allStageNames.filter(stageName => !existingStageNames.includes(stageName));

            missingStages.forEach(missingStage => {
                leadsByStage.push({
                    product: productGroup.product,
                    stage: missingStage,
                    leadsCount: 0
                });
            });
        }

        // Get the total leads, including rejected leads
        const totalLeads = await Lead.countDocuments({
            selected_users: userObjectId,
            is_reject: false,// Exclude rejected leads,
            is_converted: false
        });

        // Get total rejected leads count for the user
        const totalRejectedLeads = await Lead.countDocuments({
            selected_users: userObjectId,
            is_reject: true
        });

        // Get the start and end of today's date
        const startOfDay = moment().startOf('day').toDate();
        const endOfDay = moment().endOf('day').toDate();

        // Get leads updated today
        const updatedTodayLeads = await Lead.countDocuments({
            selected_users: userObjectId,
            updated_at: { $gte: startOfDay, $lte: endOfDay }
        });

        // Get leads created today
        const createdTodayLeads = await Lead.countDocuments({
            created_by: userObjectId,
            created_at: { $gte: startOfDay, $lte: endOfDay }
        });

        res.json({
            totalLeads,
            totalRejectedLeads,
            leadsByStage,
            updatedTodayLeads, // Add the count of leads updated today
            createdTodayLeads // Add the count of leads created today
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});
// DELETE multiple leads and associated clients
router.delete('/delete-multiple', isAuth, hasPermission(['delete_lead']), async (req, res) => {
    try {
        const { leadIds } = req.body;

        if (!Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ message: 'leadIds array is required in the request body' });
        }

        // Find leads to get associated client IDs
        const leads = await Lead.find({ _id: { $in: leadIds } });

        if (!leads.length) {
            return res.status(404).json({ message: 'No leads found with the provided IDs' });
        }

        const clientIds = leads
            .map(lead => lead.client)
            .filter(clientId => clientId); // Remove undefined/null

        // Delete leads
        await Lead.deleteMany({ _id: { $in: leadIds } });

        // Delete associated clients
        if (clientIds.length > 0) {
            await Client.deleteMany({ _id: { $in: clientIds } });
        }

        res.status(200).json({
            message: 'Leads and associated clients deleted successfully',
            deletedLeads: leadIds,
            deletedClients: clientIds
        });
    } catch (error) {
        console.error('Error deleting leads and clients:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
