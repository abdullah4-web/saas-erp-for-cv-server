// routes/companyRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Company = require('../models/Company');
const User = require('../models/userModel');
const Product = require('../models/productModel');
const Branch = require('../models/branchModel');
const Pipeline = require('../models/pipelineModel');
const ProductStage = require('../models/productStageModel');
const { generateToken } = require('../utils');

// Cloudinary setup
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer memory storage (no temp files on disk)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ Helper: Cloudinary upload as Promise
const uploadToCloudinary = (fileBuffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

// Default Admin Permissions
const defaultAdminPermissions = [
  "create_user", "read_user", "update_user", "delete_user",
  "create_lead", "read_lead", "update_lead", "check_lead",
  "app_management", "file_upload", "file_delete", "file_download",
  "view_lead", "file_delete_from_deal", "file_download_from_deal",
  "file_upload_in_deal", "delete_user_from_deal", "add_user_in_deal",
  "reject_deal", "move_deal", "edit_deal", "create_deal",
  "delete_contract", "edit_contract", "read_contract",
  "file_upload_for_phonebook", "show_phonebook", "add_user",
  "convert_lead", "remove_user_lead", "add_user_lead", "transfer_lead",
  "reject_lead", "unassigned_lead", "move_lead", "update_product_stage",
  "lead_labels", "edit_lead", "label_management", "accountant_dashboards",
  "create_contract", "accountant_management", "view_contract", "view_deal",
  "reject_contract", "lead_dashboard", "update_deal_stage",
  "update_product_stage_contract", "view_deal_for_accountant", "add_labels",
  "restore_deal", "hr_management", "hr_dashboard", "department_management",
  "shift_management", "holiday_management", "attendance_management",
  "area_management", "leave_management", "delete_lead", "salary_management",
  "penalty_management", "bounce_management", "payroll_management",
  "payroll_approval", "unpaid_payroll", "generate_payroll", "view_payroll",
  "payroll_payment", "advance_management", "advance_approval",
  "advance_payment", "view_user", "resign_user", "pay_advance_payment",
  "view_advance_payment", "leave_final_approval", "edit_leave",
  "leave_history", "hr_management_no_lc", "crm_dashboard", "activity_report",
  "block_user", "reset_password", "restore_resigned_user", "generate_penalty",
  "view_penalty", "edit_penalty", "create_penalty", "approve_penalty",
  "create_salary", "adjust_salary", "edit_salary", "view_salary",
  "unapproved_payroll", "payroll_history", "hr_leave_approval",
  "hr_create_leave", "manager_leave_approval"
];

// Default Product Stages
const defaultProductStages = [
  { name: 'New Lead', order: 1 },
  { name: 'Contacted', order: 2 },
  { name: 'Qualified', order: 3 },
  { name: 'Proposal Sent', order: 4 },
  { name: 'Negotiation', order: 5 },
  { name: 'Won', order: 6 },
  { name: 'Lost', order: 7 }
];

// ✅ Register Company Route
const registerCompany = async (req, res) => {
  try {
    const {
      companyName,
      email,
      phone,
      adminName,
      adminEmail,
      adminPassword,
      primaryColor,
      secondaryColor,
      emailDomain
    } = req.body;

    let logoUrl = null;

    // ✅ Upload logo to Cloudinary (if provided)
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'company_logos');
      logoUrl = result.secure_url;
    }

    // ✅ Create company record
    const company = await Company.create({
      name: companyName,
      email,
      emailDomain,
      phone,
      logo: logoUrl,
      primaryColor: primaryColor || '#000000',
      secondaryColor: secondaryColor || '#ffffff'
    });

    // ✅ Create default branch, product, and pipeline
    const defaultBranch = await Branch.create({
      name: 'Main Branch',
      created_by: null,
      company: company._id
    });

    const defaultProduct = await Product.create({
      name: 'Bussiness Banking',
      status: 'Active',
      company: company._id,
      Branch: defaultBranch._id,
    });

    const defaultPipeline = await Pipeline.create({
      name: 'Bussiness Banking',
      product: defaultProduct._id,
      created_by: null,
      company: company._id
    });

    // ✅ Create default product stages
    await Promise.all(
      defaultProductStages.map(stage =>
        ProductStage.create({
          company: company._id,
          name: stage.name,
          product_id: defaultProduct._id,
          order: stage.order
        })
      )
    );

    // ✅ Create admin user linked to company, product, and branch
    const adminUser = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'Admin',
      image: logoUrl,
      permissions: defaultAdminPermissions,
      company: company._id,
      products: [defaultProduct._id],
      branch: [defaultBranch._id],
      pipeline: [defaultPipeline._id]
    });

    // ✅ Update created_by for branch and pipeline
    await Branch.findByIdAndUpdate(defaultBranch._id, { created_by: adminUser._id });
    await Pipeline.findByIdAndUpdate(defaultPipeline._id, { created_by: adminUser._id });

    // ✅ Generate JWT token
    const token = generateToken(adminUser);

    res.status(201).json({
      message: 'Company, Admin, default entities, and product stages created successfully',
      company,
      adminUser: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email
      },
      defaultProduct,
      defaultBranch,
      defaultPipeline,
      token
    });

  } catch (err) {
    console.error('Company registration error:', err);
    res.status(500).json({
      message: 'Failed to register company',
      error: err.message
    });
  }
};

// ✅ Route setup
router.post('/register', upload.single('logo'), registerCompany);

module.exports = router;
