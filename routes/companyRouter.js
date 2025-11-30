const express = require('express');
const router = express.Router();
const SubCompany = require('../models/compnayModel');
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { isAuth } = require('../utils');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper function to upload file to Cloudinary
const uploadToCloudinary = (file, folder = 'subcompanies') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    
    stream.end(file.buffer);
  });
};

// Create a new sub-company
router.post(
  '/', 
  isAuth,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'files', maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      // Check if files were uploaded
      if (!req.files) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const {
        name,
        licenseType,
        licenseCategory,
        economicLicenseNumber,
        unifiedRegistrationNo,
        establishmentDate,
        issuanceDate,
        expireDate,
        tradeName,
        address,
        status = 'Active',
      } = req.body;

      if (!name) return res.status(400).json({ error: 'Name is required' });

      let logo = null;
      // Check if logo file exists in the request
      if (req.files && req.files['logo'] && req.files['logo'][0]) {
        const file = req.files['logo'][0];
        try {
          const result = await uploadToCloudinary(file, 'subcompanies/logos');
          logo = {
            filename: file.originalname,
            url: result.secure_url,
            mimetype: file.mimetype,
            uploadedAt: new Date(),
          };
        } catch (error) {
          console.error('Error uploading logo:', error);
          return res.status(500).json({ error: 'Failed to upload logo' });
        }
      }

      let files = [];
      // Check if additional files exist in the request
      if (req.files && req.files['files'] && req.files['files'].length > 0) {
        try {
          for (const file of req.files['files']) {
            const result = await uploadToCloudinary(file, 'subcompanies/files');
            files.push({
              filename: file.originalname,
              url: result.secure_url,
              mimetype: file.mimetype,
              uploadedAt: new Date(),
            });
          }
        } catch (error) {
          console.error('Error uploading files:', error);
          return res.status(500).json({ error: 'Failed to upload files' });
        }
      }

      const subCompany = new SubCompany({
        company: req.user.company, // Assign the authenticated user's company
        name,
        licenseType,
        licenseCategory,
        economicLicenseNumber,
        unifiedRegistrationNo,
        establishmentDate: establishmentDate ? new Date(establishmentDate) : null,
        issuanceDate: issuanceDate ? new Date(issuanceDate) : null,
        expireDate: expireDate ? new Date(expireDate) : null,
        tradeName,
        address,
        logo,
        files,
        status,
      });

      await subCompany.save();
      res.status(201).json(subCompany);
    } catch (error) {
      console.error('Error creating sub-company:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get all sub-companies
router.get('/', isAuth, async (req, res) => {
  try {
    // Only get sub-companies for the authenticated user's company
    const subCompanies = await SubCompany.find({ 
      company: req.user.company,
      delStatus: false 
    })
    .populate('company')
    .sort({ createdAt: -1 });
    
    res.json(subCompanies);
  } catch (error) {
    console.error('Error fetching sub-companies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a sub-company by ID
router.get('/:id', isAuth, async (req, res) => {
  try {
    const subCompany = await SubCompany.findOne({
      _id: req.params.id,
      company: req.user.company,
      delStatus: false
    }).populate('company');
    
    if (!subCompany) {
      return res.status(404).json({ error: 'Sub-company not found' });
    }
    
    res.json(subCompany);
  } catch (error) {
    console.error('Error fetching sub-company:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a sub-company by ID
router.put(
  '/:id',
  isAuth,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'files', maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const {
        name,
        licenseType,
        licenseCategory,
        economicLicenseNumber,
        unifiedRegistrationNo,
        establishmentDate,
        issuanceDate,
        expireDate,
        tradeName,
        address,
        status,
      } = req.body;

      // Find the existing sub-company
      const existingSubCompany = await SubCompany.findOne({
        _id: req.params.id,
        company: req.user.company,
        delStatus: false
      });
      
      if (!existingSubCompany) {
        return res.status(404).json({ error: 'Sub-company not found' });
      }

      const updateData = {
        name,
        licenseType,
        licenseCategory,
        economicLicenseNumber,
        unifiedRegistrationNo,
        establishmentDate: establishmentDate ? new Date(establishmentDate) : existingSubCompany.establishmentDate,
        issuanceDate: issuanceDate ? new Date(issuanceDate) : existingSubCompany.issuanceDate,
        expireDate: expireDate ? new Date(expireDate) : existingSubCompany.expireDate,
        tradeName,
        address,
        status,
      };

      // Handle logo upload if provided
      if (req.files && req.files['logo'] && req.files['logo'][0]) {
        const file = req.files['logo'][0];
        try {
          const result = await uploadToCloudinary(file, 'subcompanies/logos');
          updateData.logo = {
            filename: file.originalname,
            url: result.secure_url,
            mimetype: file.mimetype,
            uploadedAt: new Date(),
          };
        } catch (error) {
          console.error('Error uploading logo:', error);
          return res.status(500).json({ error: 'Failed to upload logo' });
        }
      }

      // Handle additional files if provided
      if (req.files && req.files['files'] && req.files['files'].length > 0) {
        updateData.$push = { files: [] };
        try {
          for (const file of req.files['files']) {
            const result = await uploadToCloudinary(file, 'subcompanies/files');
            updateData.$push.files.push({
              filename: file.originalname,
              url: result.secure_url,
              mimetype: file.mimetype,
              uploadedAt: new Date(),
            });
          }
        } catch (error) {
          console.error('Error uploading files:', error);
          return res.status(500).json({ error: 'Failed to upload files' });
        }
      }

      const subCompany = await SubCompany.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      res.json(subCompany);
    } catch (error) {
      console.error('Error updating sub-company:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Soft delete a sub-company by ID
router.delete('/:id', isAuth, async (req, res) => {
  try {
    const subCompany = await SubCompany.findOneAndUpdate(
      {
        _id: req.params.id,
        company: req.user.company,
        delStatus: false
      },
      { delStatus: true },
      { new: true }
    );
    
    if (!subCompany) {
      return res.status(404).json({ error: 'Sub-company not found' });
    }
    
    res.json({ message: 'Sub-company deleted successfully' });
  } catch (error) {
    console.error('Error deleting sub-company:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;