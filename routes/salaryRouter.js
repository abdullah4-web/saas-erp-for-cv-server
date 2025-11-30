const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const salaryModel = require('../models/salaryModel');
const SalaryActivityLog = require('../models/salaryActivityLog');
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');
const router = express.Router();

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'salaryfiles/'); // Make sure this folder exists
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and Word documents are allowed.'));
    }
  }
});

// Helper function to create activity log and update salary
const logSalaryActivity = async (salaryId, action, performedBy, details = null) => {
    try {
        // Create the activity log
        const activity = new SalaryActivityLog({
            salary: salaryId,
            action,
            performedBy,
            details
        });
        await activity.save();
        
        // Update the salary document with the new activity log reference
        await salaryModel.findByIdAndUpdate(
            salaryId,
            { $push: { salaryActivityLog: activity._id } },
            { new: true }
        );
        
        return activity;
    } catch (err) {
        console.error('Error logging salary activity:', err);
        return null;
    }
};

// Helper function to process uploaded files
const processUploadedFiles = (req) => {
    if (!req.files || req.files.length === 0) return [];
    
    return req.files.map(file => ({
        filename: file.originalname,
        url: `/salaryfiles/${file.filename}`,
        mimetype: file.mimetype,
        description: req.body[`fileDescription_${file.fieldname}`] || '',
        uploadedAt: new Date()
    }));
};

// POST /api/salary/create/:userId
router.post('/create/:userId', 
    isAuth, 
    hasPermission(['create_salary']), 
    upload.array('files', 5), // Allow up to 5 files
    async (req, res) => {
        try {
            const userId = req.params.userId;
            const {
                basicSalary,
                otherAllowances = 0,
                fromDate,
                toDate
            } = req.body;

            if (!fromDate) {
                return res.status(400).json({ message: "fromDate is required." });
            }

            const existing = await salaryModel.findOne({ user: userId });
            if (existing) {
                return res.status(400).json({ message: 'Salary already exists for this user.' });
            }

            const totalSalary = basicSalary + otherAllowances;
            const uploadedFiles = processUploadedFiles(req);

            const newSalary = new salaryModel({
                user: userId,
                basicSalary,
                otherAllowances,
                totalSalary,
                files: uploadedFiles,
                salaryHistory: [{
                    basicSalary,
                    otherAllowances,
                    totalSalary,
                    fromDate: new Date(fromDate),
                    toDate: toDate ? new Date(toDate) : null,
                }]
            });

            await newSalary.save();

            // Log the creation activity
            await logSalaryActivity(
                newSalary._id,
                'created',
                req.user._id,
                `Initial salary setup - Basic: ${basicSalary}, Allowances: ${otherAllowances}` +
                (uploadedFiles.length > 0 ? ` with ${uploadedFiles.length} files` : '')
            );

            res.status(201).json({ message: 'Salary created successfully', salary: newSalary });

        } catch (err) {
            console.error('Create Salary Error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File size exceeds 5MB limit' });
            }
            if (err.message.includes('Invalid file type')) {
                return res.status(400).json({ error: err.message });
            }
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
);

// PUT /api/salary/adjust/:userId
router.put('/adjust/:userId', 
    isAuth, 
    hasPermission(['adjust_salary']), 
    upload.array('files', 5),
    async (req, res) => {
        try {
            const userId = req.params.userId;
            const {
                basicSalary,
                otherAllowances = 0,
                fromDate,
                toDate,
                adjustmentReason
            } = req.body;

            if (!fromDate) {
                return res.status(400).json({ message: "fromDate is required." });
            }

            const salaryDoc = await salaryModel.findOne({ user: userId });
            if (!salaryDoc) {
                return res.status(404).json({ message: 'Salary record not found' });
            }

            // Convert to numbers to ensure arithmetic addition
            const basic = Number(basicSalary);
            const allowances = Number(otherAllowances);
            const total = basic + allowances;

            // Save previous values for activity log
            const previousValues = {
                basicSalary: salaryDoc.basicSalary,
                otherAllowances: salaryDoc.otherAllowances,
                totalSalary: salaryDoc.totalSalary
            };

            // Push current state to history
            salaryDoc.salaryHistory.push({
                basicSalary: previousValues.basicSalary,
                otherAllowances: previousValues.otherAllowances,
                totalSalary: previousValues.totalSalary,
                fromDate: salaryDoc.updatedAt,
                toDate: new Date(),
            });

            // Update salary
            salaryDoc.basicSalary = basic;
            salaryDoc.otherAllowances = allowances;
            salaryDoc.totalSalary = total;

            // Add new current range to history
            salaryDoc.salaryHistory.push({
                basicSalary: basic,
                otherAllowances: allowances,
                totalSalary: total,
                fromDate: new Date(fromDate),
                toDate: toDate ? new Date(toDate) : null,
            });

            // Process and add any uploaded files
            const uploadedFiles = processUploadedFiles(req);
            if (uploadedFiles.length > 0) {
                salaryDoc.files.push(...uploadedFiles);
            }

            await salaryDoc.save();

            // Log the adjustment activity
            await logSalaryActivity(
                salaryDoc._id,
                'adjusted',
                req.user._id,
                `Salary adjusted from Basic: ${previousValues.basicSalary}, Allowances: ${previousValues.otherAllowances} to Basic: ${basic}, Allowances: ${allowances}. ` +
                `Reason: ${adjustmentReason || 'Not specified'}` +
                (uploadedFiles.length > 0 ? ` with ${uploadedFiles.length} files` : '')
            );

            res.status(200).json({ message: 'Salary updated with history', salary: salaryDoc });

        } catch (err) {
            console.error('Adjust Salary Error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File size exceeds 5MB limit' });
            }
            if (err.message.includes('Invalid file type')) {
                return res.status(400).json({ error: err.message });
            }
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
);

// PUT /api/salary/correct/:userId (no history)
router.put('/correct/:userId', isAuth, 
    hasPermission(['edit_salary']), 
    upload.array('files', 5),
    async (req, res) => {
        try {
            const userId = req.params.userId;
            const userRole = req.user.role;
            const {
                basicSalary,
                otherAllowances = 0,
                correctionReason
            } = req.body;

            const salaryDoc = await salaryModel.findOne({ user: userId });
            if (!salaryDoc) {
                return res.status(404).json({ message: 'Salary not found for this user.' });
            }
            if (userRole !== 'Admin') {
                return res.status(403).json({ message: 'Permission denied' });
            }


            // Save previous values for activity log
            const previousValues = {
                basicSalary: salaryDoc.basicSalary,
                otherAllowances: salaryDoc.otherAllowances,
                totalSalary: salaryDoc.totalSalary
            };

            // Update salary
            salaryDoc.basicSalary = basicSalary;
            salaryDoc.otherAllowances = otherAllowances;
            salaryDoc.totalSalary = basicSalary + otherAllowances;

            // Process and add any uploaded files
            const uploadedFiles = processUploadedFiles(req);
            if (uploadedFiles.length > 0) {
                salaryDoc.files.push(...uploadedFiles);
            }

            await salaryDoc.save();

            // Log the correction activity
            await logSalaryActivity(
                salaryDoc._id,
                'updated',
                req.user._id,
                `Salary corrected from Basic: ${previousValues.basicSalary}, Allowances: ${previousValues.otherAllowances} to Basic: ${basicSalary}, Allowances: ${otherAllowances}. ` +
                `Reason: ${correctionReason || 'Not specified'}` +
                (uploadedFiles.length > 0 ? ` with ${uploadedFiles.length} files` : '')
            );

            res.status(200).json({ message: 'Salary corrected successfully', salary: salaryDoc });
        } catch (err) {
            console.error('Error correcting salary:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File size exceeds 5MB limit' });
            }
            if (err.message.includes('Invalid file type')) {
                return res.status(400).json({ error: err.message });
            }
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
);

// DELETE /api/salary/delete-file/:userId/:fileId - Delete salary document
// router.delete('/delete-file/:userId/:fileId', 
//     isAuth, 
//     hasPermission(['salary_management']), 
//     async (req, res) => {
//         try {
//             const { userId, fileId } = req.params;

//             const salaryDoc = await salaryModel.findOne({ user: userId });
//             if (!salaryDoc) {
//                 return res.status(404).json({ message: 'Salary record not found' });
//             }

//             const fileIndex = salaryDoc.files.findIndex(file => file._id.toString() === fileId);
//             if (fileIndex === -1) {
//                 return res.status(404).json({ message: 'File not found' });
//             }

//             const deletedFile = salaryDoc.files[fileIndex];
//             salaryDoc.files.splice(fileIndex, 1);
//             await salaryDoc.save();

//             // Log the file deletion activity
//             await logSalaryActivity(
//                 salaryDoc._id,
//                 'file_deleted',
//                 req.user._id,
//                 `Deleted file: ${deletedFile.filename}`
//             );

//             res.status(200).json({ 
//                 message: 'File deleted successfully', 
//                 deletedFile,
//                 salary: salaryDoc
//             });

//         } catch (err) {
//             console.error('File Delete Error:', err);
//             res.status(500).json({ error: 'Internal Server Error' });
//         }
//     }
// // );

// GET /api/salary/all — Get all salaries with populated data
router.get('/all', isAuth, hasPermission(['view_salary']), async (req, res) => {
  try {
    const salaries = await salaryModel.find()
      .populate({
        path: 'user',
        match: { labour_card_status: 'Active' }, // ✅ Filter users
        select: 'employee_id department areas name image',
        populate: [
          { path: 'department', select: 'name' },
          { path: 'areas', select: 'name' }
        ]
      })
      .populate({
        path: 'salaryActivityLog',
        select: 'action performedBy performedAt details',
        populate: {
          path: 'performedBy',
          select: 'name email'
        }
      });

    // ✅ Filter out salary entries where user is null
    const filteredSalaries = salaries.filter(s => s.user);

    res.status(200).json(filteredSalaries);
  } catch (err) {
    console.error('Error fetching all salaries:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// GET /api/salary/:userId — Get salary by user ID with populated data
router.get('/single-user/:userId', isAuth, hasPermission(['view_salary']), async (req, res) => {
    try {
        const userId = req.params.userId;
        const salary = await salaryModel.findOne({ user: userId })
            .populate({
                path: 'user',
                select: 'employee_id department areas name image',
                populate: [
                    { path: 'department', select: 'name' },
                    { path: 'areas', select: 'name' }
                ]
            })
            .populate({
                path: 'salaryActivityLog',
                select: 'action performedBy performedAt details',
                populate: {
                    path: 'performedBy',
                    select: 'name email'
                }
            })
            .populate('salaryHistory');

        if (!salary) {
            return res.status(404).json({ message: 'Salary not found for this user.' });
        }

        res.status(200).json(salary);
    } catch (err) {
        console.error('Error fetching salary by user:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;