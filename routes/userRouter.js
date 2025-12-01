// routes/userRouter.js
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const User = require('../models/userModel'); // Adjust the path to your User model
const { generateToken, isAuth, hasRole, auditLogger, isFromFrontend } = require('../utils');
const Pipeline = require('../models/pipelineModel'); // Adjust the path as needed
const mongoose = require('mongoose'); const path = require('path');
const fs = require('fs');
const rolePermissions = require('../rolePermissions.json');
const Branch = require('../models/branchModel');
const Session = require('../models/sessionModel');
const hasPermission = require('../hasPermission');
const { notifyLogout } = require('../socket');
const leadModel = require('../models/leadModel');
const Product = require('../models/productModel'); // Adjust path as necessary
const permissionsData = require('../rolePermissions.json');
const permissions = require('../rolePermissions.json');
const shiftsModel = require('../models/shiftsModel');
const AreaModel = require('../models/AreaModel');
const { default: axios } = require('axios');
const Department = require('../models/departmentModel');
const Country = require('../models/countryModel');
const BlockedIP = require('../models/blockIpModel'); // Adjust the path as necessary
const cloudinary = require('cloudinary').v2;
// POST route to create a new user
const AUTH_API_URL = "http://172.16.20.3:8081/jwt-api-token-auth/";
const EMPLOYEE_API_URL = "http://172.16.20.3:8081/personnel/api/employees/";
const AUTH_CREDENTIALS = {
  username: "kamal",
  password: "Jovera@2022",
};
let authToken = null;
let tokenExpiry = null;
const getAuthToken = async () => {
  try {
    const response = await axios.post(AUTH_API_URL, AUTH_CREDENTIALS);
    authToken = response.data.token;
    tokenExpiry = Date.now() + 3600 * 1000;
  } catch (error) {
    console.error("Error fetching auth token:", error.message);
    throw new Error("Authentication failed");
  }
};
const ensureAuthToken = async () => {
  if (!authToken || Date.now() >= tokenExpiry) {
    await getAuthToken();
  }
};
const multer = require('multer');
const crypto = require('crypto');
const positionModel = require('../models/positionModel');
const Company = require('../models/compnayModel');
const leaveModel = require('../models/leaveModel');
// === Cloudinary Config ===
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer memory storage (buffer upload to Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// File filter to allow only certain file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'), false);
  }
};

// === Utility: Upload buffer to Cloudinary ===
const uploadToCloudinary = async (fileBuffer, folder, originalname) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder, public_id: path.parse(originalname).name },
        (err, result) => {
          if (err) reject(err);
          else resolve(result.secure_url);
        }
      )
      .end(fileBuffer);
  });
};


// Improved generateNewEmpCode function
const generateNewEmpCode = async () => {
  try {
    // Get the employee with the highest emp_code (as string, sorted numerically)
    const lastEmp = await User.findOne({
      emp_code: { $exists: true, $ne: null }
    }).sort({ emp_code: -1 }).collation({ locale: "en_US", numericOrdering: true });

    let newCode = 1001;

    if (lastEmp && lastEmp.emp_code) {
      const lastCodeNum = parseInt(lastEmp.emp_code);
      if (!isNaN(lastCodeNum)) {
        newCode = lastCodeNum + 1;
      }
    }

    return newCode.toString();
  } catch (error) {
    console.error("Error generating employee code from DB:", error.message);
    throw new Error("Failed to generate employee code");
  }
};
const parseToObjectIdArray = (value) => {
  try {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return Array.isArray(value) ? value : [value];
  }
};
const loginAttempts = {}; // Track failed login attempts per IP
const MAX_FAILED_ATTEMPTS = 5;


// === helper: safely parse JSON or CSV strings to array ===
const parseIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // fallback: comma separated string
      return value.split(",").map((v) => v.trim());
    }
  }
  return [];
};

router.post(
  "/create-user",
  upload.fields([
    { name: "passport_file", maxCount: 1 },
    { name: "emirates_id_file", maxCount: 1 },
    { name: "labour_card_file", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  isAuth,
  auditLogger,
  hasPermission(["create_user"]),
  async (req, res) => {
    try {
      await ensureAuthToken();

      const {
        email,
        password,
        role,
        phone,
        department,
        areas,
        branch,
        type,
        pipeline,
        company,
        products,
        shifts,
        permissions,
        hire_date,
        first_name,
        last_name,
        employee_id,
        gender,
        city,
        position,
        emergency_contact_name,
        emergency_contact_number,
        emergency_contact_relation,
        national,
        address,
        passport_number,
        passport_expiry,
        emirates_id_number,
        emirates_id_expiry,
        labour_card_number,
        labour_card_expiry,
      } = req.body;

      const name = `${first_name || ""} ${last_name || ""}`.trim();
      if (!name || !email || !role) {
        return res
          .status(400)
          .json({ message: "Missing required fields: name, email, or role" });
      }

      // if (!company) {
      //   return res.status(400).json({ message: "Company is required" });
      // }

      // === Check duplicate email ===
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // === Upload Files to Cloudinary ===
      const files = req.files;
      const passport_file = files?.passport_file
        ? await uploadToCloudinary(
          files.passport_file[0].buffer,
          "users/passports",
          files.passport_file[0].originalname
        )
        : null;

      const emirates_id_file = files?.emirates_id_file
        ? await uploadToCloudinary(
          files.emirates_id_file[0].buffer,
          "users/emirates",
          files.emirates_id_file[0].originalname
        )
        : null;

      const labour_card_file = files?.labour_card_file
        ? await uploadToCloudinary(
          files.labour_card_file[0].buffer,
          "users/labour_cards",
          files.labour_card_file[0].originalname
        )
        : null;

      const image = files?.image
        ? await uploadToCloudinary(
          files.image[0].buffer,
          "users/profile",
          files.image[0].originalname
        )
        : null;

      // === Generate emp_code & password ===
      const newEmpCode = await generateNewEmpCode();
      const hashedPassword = await bcrypt.hash(password, 10);
      const rolePermissions = permissionsData[role] || [];
      const resolvedPermissions =
        permissions?.length > 0 ? permissions : rolePermissions;

      // === Handle department & areas (optional) ===
      let departmentId = null;
      let areaIds = [];
      let departmentBioId = null;
      let areaBioIds = [];

      if (department) {
        departmentId = mongoose.Types.ObjectId.isValid(department)
          ? department
          : (await Department.findOne({ name: department }))?._id;
      }

      const parsedAreas = parseIds(areas);
      if (parsedAreas.length > 0) {
        const areaDocs = await AreaModel.find({ _id: { $in: parsedAreas } });
        areaIds = areaDocs.map((a) => a._id);
        areaBioIds = areaDocs.map((a) => a.bio_times_id);
      }

      // === External Biotime API Sync (only if dept/areas exist) ===
      let bio_times_id = null;
      if (departmentId && areaIds.length > 0) {
        const departmentDoc = await Department.findById(departmentId);
        departmentBioId = departmentDoc?.bio_times_id;

        const payload = {
          emp_code: newEmpCode,
          department: departmentBioId,
          area: areaBioIds,
          hire_date: hire_date || new Date().toISOString().split("T")[0],
          first_name,
          last_name,
          gender,
          mobile: phone,
          national,
          address,
          email,
        };

        const createEmpRes = await axios.post(EMPLOYEE_API_URL, payload, {
          headers: { Authorization: `JWT ${authToken}` },
        });
        bio_times_id = createEmpRes.data.id;
      }

      // === Assign shifts if not provided ===
      let assignedShifts = parseIds(shifts);
      if (!assignedShifts.length) {
        const matchedShifts = await shiftsModel.find({
          type,
          ...(areaIds.length > 0 ? { area: { $in: areaIds } } : {}),
        });
        assignedShifts = matchedShifts.map((shift) => shift._id);
      }

      // === Parse pipeline, branch, products ===
      const parsedPipeline = parseIds(pipeline);
      const parsedBranch = parseIds(branch);
      const parsedProducts = parseIds(products);

      // === Create user ===
      const newUser = new User({
        company: req.user.company,
        name,
        email,
        password: hashedPassword,
        role,
        phone,
        department: departmentId,
        areas: areaIds,
        branch: parsedBranch,
        type,
        pipeline: parsedPipeline,
        employee_id,
        products: parsedProducts,
        permissions: resolvedPermissions,
        emp_code: newEmpCode,
        bio_times_id,
        hire_date,
        first_name,
        last_name,
        gender,
        city,
        position,
        emergency_contact_name,
        emergency_contact_number,
        emergency_contact_relation,
        national,
        address,
        image,
        shifts: assignedShifts,
        passport_number,
        passport_file,
        passport_expiry,
        emirates_id_number,
        emirates_id_file,
        emirates_id_expiry,
        labour_card_number,
        labour_card_file,
        labour_card_expiry,
      });

      const savedUser = await newUser.save();
      res.status(201).json({ message: "User created", user: savedUser });
    } catch (err) {
      console.error("Error creating user:", err.response?.data || err.message);
      res.status(500).json({
        error: err.response?.data || err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  }
);

router.put("/update-user/:id", 
  isAuth, 
  auditLogger, 
  hasPermission(['update_user']), 
  upload.fields([
    { name: 'passport_files', maxCount: 10 },
    { name: 'emirates_id_files', maxCount: 10 },
    { name: 'labour_card_files', maxCount: 10 },
    { name: 'noc_letter_files', maxCount: 10 },
    { name: 'contract_files', maxCount: 10 },
    { name: 'image', maxCount: 1 }
  ]), 
  async (req, res) => {
    try {
      const userId = req.params.id;
      const existingUser = await User.findById(userId);
      if (!existingUser) return res.status(404).json({ message: "User not found" });

      const uploadedFiles = req.files || {};
      const processedFiles = {};

      // Process uploaded files and upload to Cloudinary
      for (const [field, files] of Object.entries(uploadedFiles)) {
        if (field === 'image') {
          // Single file upload (profile image)
          const file = files[0];
          const cloudinaryUrl = await uploadToCloudinary(
            file.buffer, 
            'users/images', 
            file.originalname
          );
          processedFiles[field] = cloudinaryUrl;
        } else {
          // Multiple files upload
          processedFiles[field] = [];
          for (const file of files) {
            const cloudinaryUrl = await uploadToCloudinary(
              file.buffer, 
              `users/${field}`, 
              file.originalname
            );
            processedFiles[field].push(cloudinaryUrl);
          }
        }
      }

      // Merge with existing files if needed
      const files = {
        passport_files: processedFiles.passport_files || existingUser.passport_files,
        emirates_id_files: processedFiles.emirates_id_files || existingUser.emirates_id_files,
        contract_files: processedFiles.contract_files || existingUser.contract_files,
        labour_card_files: processedFiles.labour_card_files || existingUser.labour_card_files,
        noc_letter_files: processedFiles.noc_letter_files || existingUser.noc_letter_files,
        image: processedFiles.image || existingUser.image
      };

      const {
        email, emp_code, bio_times_id, password, role, phone, department, areas, branch, employee_id, labour_card_status,
        type, pipeline, products, hire_date, first_name, last_name, gender, national, address, status,
        contract_start_date, contract_end_date,
        passport_number, passport_expiry, emirates_id_number, emirates_id_expiry, shifts,
        city, position, emergency_contact_name, emergency_contact_number, emergency_contact_relation,
        labour_card_number, labour_card_expiry, permissions
      } = req.body;

      const name = `${first_name} ${last_name}`.trim();

      if (email !== existingUser.email) {
        const emailExists = await User.findOne({ email });
        if (emailExists) {
          return res.status(400).json({ message: "Email already registered" });
        }
      }

      let hashedPassword = existingUser.password;
      if (password) {
        const saltRounds = 10;
        hashedPassword = await bcrypt.hash(password, saltRounds);
      }
      
      const rolePermissions = permissionsData[role] || existingUser.permissions || [];
      const resolvedPermissions = permissions?.length ? permissions : rolePermissions;

      // Helper function to safely resolve IDs
      const resolveIds = async (items, Model) => {
        if (!items || items === 'null' || items === 'undefined') return [];
        const array = Array.isArray(items) ? items : [items];
        const validIds = await Promise.all(array.map(async (item) => {
          if (item === 'null' || item === 'undefined') return null;
          if (mongoose.Types.ObjectId.isValid(item)) return item;
          const foundItem = await Model.findOne({ name: item });
          return foundItem?._id || null;
        }));
        return validIds.filter(Boolean);
      };

      // Safely resolve department
      let departmentId = null;
      if (department && department !== 'null' && department !== 'undefined') {
        if (mongoose.Types.ObjectId.isValid(department)) {
          departmentId = department;
        } else {
          const foundDepartment = await Department.findOne({ name: department });
          if (foundDepartment) departmentId = foundDepartment._id;
        }
      }

      // Safely resolve areas
      let areaIds = null;
      if (areas) {
        if (mongoose.Types.ObjectId.isValid(areas)) {
          areaIds = [areas];
        } else if (Array.isArray(areas)) {
          const resolvedAreaIds = [];
          for (const area of areas) {
            if (mongoose.Types.ObjectId.isValid(area)) {
              resolvedAreaIds.push(area);
            } else {
              const foundArea = await AreaModel.findOne({ name: area });
              if (foundArea) resolvedAreaIds.push(foundArea._id);
            }
          }
          areaIds = resolvedAreaIds.length > 0 ? resolvedAreaIds : null;
        }
      }

      let assignedShifts = existingUser.shifts;
      if (shifts && shifts !== 'null' && shifts !== 'undefined') {
        assignedShifts = await resolveIds(shifts, shiftsModel);
        if (!assignedShifts.length) {
          const matchedShifts = await shiftsModel.find({
            type: type || existingUser.type,
            area: { $in: areaIds }
          });
          assignedShifts = matchedShifts.map(shift => shift._id);
        }
      }

      // If non-null type and areas are provided, override and remove previous shifts
      if (
        req.body.type && req.body.type !== 'null' && req.body.type !== 'undefined' &&
        req.body.areas && req.body.areas !== 'null' && req.body.areas !== 'undefined'
      ) {
        const matchedShifts = await shiftsModel.find({
          type: req.body.type,
          area: { $in: areaIds }
        });
        assignedShifts = matchedShifts.map(shift => shift._id);
      }

      let countryId = existingUser.national;
      if (national && national !== 'null' && national !== 'undefined') {
        if (mongoose.Types.ObjectId.isValid(national)) {
          countryId = national;
        } else {
          const foundCountry = await Country.findOne({ name: national });
          if (foundCountry) countryId = foundCountry._id;
        }
      }

      // Safely resolve position
      let positionId = existingUser.position;
      if (position && position !== 'null' && position !== 'undefined') {
        if (mongoose.Types.ObjectId.isValid(position)) {
          positionId = position;
        } else {
          const foundPosition = await positionModel.findOne({ name: position });
          if (foundPosition) positionId = foundPosition._id;
        }
      }

      const updateData = {
        name,
        emp_code: emp_code || existingUser.emp_code,
        bio_times_id: bio_times_id || existingUser.bio_times_id,
        email,
        password: hashedPassword,
        role,
        employee_id: employee_id || existingUser.employee_id,
        contract_start_date: contract_start_date || existingUser.contract_start_date,
        contract_end_date: contract_end_date || existingUser.contract_end_date,
        status: status || existingUser.status,
        labour_card_status: labour_card_status || existingUser.labour_card_status,
        phone: phone || existingUser.phone,
        department: departmentId || existingUser.department,
        areas: areaIds || existingUser.areas,
        branch: branch || existingUser.branch,
        image: files.image,
        city: city || existingUser.city,
        emergency_contact_name: emergency_contact_name || existingUser.emergency_contact_name,
        emergency_contact_number: emergency_contact_number || existingUser.emergency_contact_number,
        emergency_contact_relation: emergency_contact_relation || existingUser.emergency_contact_relation,
        type: type || existingUser.type,
        pipeline: pipeline || existingUser.pipeline,
        products: products || existingUser.products,
        shifts: assignedShifts,
        permissions: resolvedPermissions,
        hire_date: hire_date || existingUser.hire_date,
        first_name: first_name || existingUser.first_name,
        last_name: last_name || existingUser.last_name,
        gender: gender || existingUser.gender,
        national: countryId,
        position: positionId,
        address: address || existingUser.address,
        passport_number: passport_number || existingUser.passport_number,
        passport_expiry: passport_expiry || existingUser.passport_expiry,
        emirates_id_number: emirates_id_number || existingUser.emirates_id_number,
        emirates_id_expiry: emirates_id_expiry || existingUser.emirates_id_expiry,
        labour_card_number: labour_card_number || existingUser.labour_card_number,
        labour_card_expiry: labour_card_expiry || existingUser.labour_card_expiry,
        passport_files: files.passport_files,
        emirates_id_files: files.emirates_id_files,
        labour_card_files: files.labour_card_files,
        noc_letter_files: files.noc_letter_files,
        contract_files: files.contract_files,
      };

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        runValidators: true
      });

      res.status(200).json({ message: "User updated successfully", user: updatedUser });

    } catch (err) {
      console.error("Error updating user:", err);
      res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  });
router.put("/delete-user-files/:id", isAuth, hasPermission(['delete_user']), async (req, res) => {
  try {
    await ensureAuthToken();
    const userId = req.params.id;
    const existingUser = await User.findById(userId);
    if (!existingUser) return res.status(404).json({ message: "User not found" });

    const filesToDelete = req.body;

    if (!filesToDelete || typeof filesToDelete !== 'object') {
      return res.status(400).json({ message: "Request body must be an object with field names as keys and arrays of filenames as values" });
    }

    const updateData = {};
    const fieldsToProcess = ['passport_files', 'emirates_id_files', 'labour_card_files', 'noc_letter_files', 'contract_files'];

    // Process each field that needs files deleted
    fieldsToProcess.forEach(field => {
      if (filesToDelete[field] && Array.isArray(filesToDelete[field])) {
        // Filter out the files to be deleted
        const remainingFiles = existingUser[field]?.filter(file =>
          !filesToDelete[field].includes(file)
        ) || [];

        // Update the field in the updateData
        updateData[field] = remainingFiles;

        // Delete the files from filesystem
        filesToDelete[field].forEach(filename => {
          try {
            fs.unlinkSync(path.join('images', filename));
          } catch (err) {
            // console.warn(`Couldn't delete file ${filename}:`, err.message);
          }
        });
      }
    });

    // Update the user document
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    res.status(200).json({
      message: "Files deleted successfully",
      updatedFields: updateData
    });

  } catch (err) {
    console.error("Error deleting user files:", err);
    res.status(500).json({
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});
router.put("/resign/:id", isAuth, hasPermission(['resign_user']), upload.single("resignation_file"), async (req, res) => {
  try {
    await ensureAuthToken();
    const { resignation_date, resignation_reason, resignation_type } = req.body;
    const userId = req.params.id;

    // Fetch user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Handle file upload
    const file = req.file ? req.file.filename : null;
    if (file && user.resignation_file) {
      try {
        fs.unlinkSync(path.join("images", user.resignation_file));
      } catch (err) {
        console.warn("Old resignation file not removed:", err.message);
      }
    }

    // Map resignation_type to number
    const resignTypeMap = {
      "Quit": 1,
      "Terminated": 2,
      "Resigned": 3,
      "Transfer": 4,
      "Retain Job without Salary": 5
    };

    const resign_type = resignTypeMap[resignation_type] || 0;

    // Update user in DB
    user.resignation_date = resignation_date;
    user.resignation_reason = resignation_reason;
    user.resignation_type = resignation_type;
    user.resigned = true;
    if (file) user.resignation_file = file;

    await user.save();

    // Hit external API
    // const payload = {
    //   employee: user.bio_times_id, // get from user
    //   disableatt: true,
    //   resign_type,
    //   resign_date: resignation_date,
    //   reason: resignation_reason
    // };

    // await axios.post("http://172.16.20.3:8081/personnel/api/resigns/", payload, {
    //   headers: { Authorization: `JWT ${authToken}` },
    // });

    res.status(200).json({ message: "Resignation submitted and synced", user });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
router.post('/create-user-third-party', upload.single('image'), isAuth, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Missing required fields: name, email' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const image = req.file ? req.file.filename : null;

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      image,
      role: 'Third Party',
      phone,
    });

    await newUser.save();

    // Sending response in an array
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
}
);
router.get('/get-users-by-department', async (req, res) => {
  try {
    const allowedDepartmentNames = ['IT', 'HR', 'Admin', 'Accounts'];

    // Step 1: Find allowed departments by their names
    const allowedDepartments = await Department.find({ name: { $in: allowedDepartmentNames } }).select('_id');

    const allowedDepartmentIds = allowedDepartments.map(dep => dep._id);

    // Step 2: Find users whose department field matches the found department IDs
    const users = await User.find({
      delstatus: false,
      eligible_commission: true,
      department: { $in: allowedDepartmentIds }
    })
      .select('-password') // Exclude the password field
      .populate('branch name') // Populate related fields
      .populate('department', 'name') // Populate department name
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    // Add prefix to user's image URL if exists
    users.forEach(user => {
      if (user.image) {
        user.image = `${imagePrefix}${user.image}`;
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users by department:', error);
    res.status(500).json({ message: 'Error fetching users by department' });
  }
});
router.get('/get-users-non-operational', async (req, res) => {
  try {
    const users = await User.find({ delstatus: false, role: 'None Operational' }).populate('products')
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users with UnActive products:', error);
    res.status(500).json({ message: 'Error fetching users with UnActive products' });
  }
});
// router.patch('/resign-user/:id', async (req, res) => {
//   try {
//     const userId = req.params.id;
//     const { replacementUserId } = req.body; // Replacement user ID

//     // Find the user who is resigning
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     // Mark the user as resigned
//     user.resigned = true;
//     await user.save();

//     if (replacementUserId) {
//       // Validate the replacement user
//       const replacementUser = await User.findById(replacementUserId);
//       if (!replacementUser) {
//         return res.status(404).json({ message: 'Replacement user not found' });
//       }

//       // Replace the resigned user with the replacement user in all leads
//       const result = await leadModel.updateMany(
//         { selected_users: userId },
//         { $set: { 'selected_users.$': replacementUserId } } // Directly replace the matched user in the array
//       );

//       if (result.modifiedCount > 0) {
//         return res.status(200).json({
//           message: 'User marked as resigned and replaced in selected users in leads.',
//           resignedUser: userId,
//           replacementUser: replacementUserId,
//         });
//       } else {
//         return res.status(400).json({
//           message: 'No leads were updated. Please check if the user is part of selected users in any lead.',
//         });
//       }
//     } else {
//       // Remove the resigned user from the selected_users array in all leads
//       const result = await leadModel.updateMany(
//         { selected_users: userId },
//         { $pull: { selected_users: userId } }
//       );

//       if (result.modifiedCount > 0) {
//         return res.status(200).json({
//           message: 'User marked as resigned and removed from selected users in leads.',
//           resignedUser: userId,
//         });
//       } else {
//         return res.status(400).json({
//           message: 'No leads were updated. Please check if the user is part of selected users in any lead.',
//         });
//       }
//     }
//   } catch (error) {
//     console.error('Error marking user as resigned:', error);
//     res.status(500).json({ message: 'Error marking user as resigned' });
//   }
// });
router.patch('/block-user/:id', isAuth, hasPermission(['block_user']), async (req, res) => {
  try {
    const { block } = req.body; // block should be true to block and false to unblock
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isBlocked = block;
    await user.save();

    res.status(200).json({ message: `User has been ${block ? 'blocked' : 'unblocked'}` });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ message: 'Error blocking user' });
  }
});
router.post('/logout', isAuth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Mark all active sessions for this user as inactive by setting logoutTime
    await Session.updateMany(
      { user: userId, logoutTime: null },
      { logoutTime: new Date() }
    );

    // Notify the user if real-time updates are supported
    notifyLogout(userId);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ message: 'Error logging out' });
  }
});
// Logout another user by marking their sessions as inactive
router.post('/logout-user/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Mark all active sessions for this user as inactive
    await Session.updateMany(
      { user: userId, logoutTime: null },
      { logoutTime: new Date() }
    );

    // Notify the user of the forced logout
    notifyLogout(userId);

    res.status(200).json({ message: 'User has been logged out successfully.' });
  } catch (error) {
    console.error('Error logging out user:', error);
    res.status(500).json({ message: 'Error logging out user' });
  }
});
// Get active sessions (with filtering out inactive ones)
router.get('/active-sessions', isAuth, async (req, res) => {
  try {
    const activeSessions = await Session.find({ logoutTime: null })
      .populate('user', 'name email role');
    res.status(200).json(activeSessions);
  } catch (error) {
    console.error('Error retrieving active sessions:', error);
    res.status(500).json({ message: 'Error retrieving active sessions' });
  }
});
router.get('/permissions', isAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('permissions');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return only the user's permissions
    const permissions = user.permissions || [];
    res.status(200).json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Error fetching permissions' });
  }
});
// Refresh token
router.post('/refresh-token', isAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newToken = generateToken(user);
    res.status(200).json({ token: newToken });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ message: 'Error refreshing token' });
  }
});
router.get('/get-users-by-branch/:branchId/:productId', async (req, res) => {
  try {
    const { branchId, productId } = req.params; // Get branchId and productId from the URL parameters

    if (!branchId) {
      return res.status(400).json({ message: 'Branch ID is required.' });
    }
    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required.' });
    }

    // Construct the query based on branch, role, and product
    const query = {
      branch: branchId,
      role: { $in: ['Sales', 'Team Leader'] },
      products: productId
    };


    // Find users by branch, role "Sales", and product filter
    const users = await User.find(query)
      .select('-password')  // Exclude the password field
      .populate('branch')    // Populate the branch field
      .populate('products')  // Populate the product field
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    // Add the image prefix to the user image if it exists
    users.forEach(user => {
      if (user.image) {
        user.image = `${imagePrefix}${user.image}`;
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users by branch and product:', error);
    res.status(500).json({ message: 'Error fetching users by branch and product' });
  }
});
router.get('/get-users-by-product/:productId', async (req, res) => {
  try {
    // Get the productId from the URL parameters
    const productId = req.params.productId;
    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required.' });
    }

    // Fetch users who have the specified product
    const users = await User.find({ products: productId })
      .select('-password') // Exclude the password field
      .populate('products') // Populate the products field
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    // Add the image prefix to the user image if it exists
    users.forEach(user => {
      if (user.image) {
        user.image = `${imagePrefix}${user.image}`;
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users by product:', error);
    res.status(500).json({ message: 'Error fetching users by product' });
  }
});
// GET route to fetch all users based on pipeline 
router.get('/get-users-by-pipeline', isAuth, async (req, res) => {
  try {
    // Check if the pipeline exists in req.user
    if (!req.user || !req.user.pipeline || !Array.isArray(req.user.pipeline)) {
      return res.status(400).json({ message: 'Pipeline is required and should be an array.' });
    }

    const pipelines = req.user.pipeline;

    // Build the query object using $in to match any of the pipelines
    const users = await User.find({ pipeline: { $in: pipelines } })
      .select('-password') // Exclude the password field
      .populate('pipeline') // Populate the pipeline field
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    // Add the image prefix to the user image if it exists
    users.forEach(user => {
      if (user.image) {
        user.image = `${imagePrefix}${user.image}`;
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users by pipeline:', error);
    res.status(500).json({ message: 'Error fetching users by pipeline' });
  }
});
// GET route to fetch all users
router.get('/get-users', async (req, res) => {
  try {
    const query = {
      delstatus: false,
      resigned: false,
    };

    const users = await User.find(query)
      .select('-password')
      .populate({ path: 'branch', select: 'name' })
      .populate({ path: 'areas', select: 'name' })
      .populate({ path: 'department', select: 'name' })
      .populate({ path: 'company', select: 'name' })
      .populate('products')
      .populate('shifts')
      .populate({ path: 'position', select: 'name' })
      .populate({ path: 'national', select: 'name' })
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    const usersWithImages = users.map(user => {
      if (user.image) {
        return { ...user.toObject(), image: `${imagePrefix}${user.image}` };
      }
      return user;
    });

    res.status(200).json(usersWithImages);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users', error });
  }
});
 
router.get('/get-employyes', async (req, res) => {
  try {

    // Build the query object
    const query = {
      delstatus: false,
      status: 'Active',
      resigned: false, // Only include users who are not resigned
    };



    const users = await User.find(query)
      .select('-password')
      .populate('pipeline')
      .populate('branch name')
      .populate('areas name')
      .populate('department name')
      .populate('company name')
      .populate('products')
      .populate('shifts')
      .populate('position name')
      .populate('national name')
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    users.forEach(user => {
      if (user.image) {
        user.image = `${imagePrefix}${user.image}`;
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});
// GET /api/users/:id - Get a single user by ID
router.get('/single-users/:id', isAuth, hasPermission(['view_user']), async (req, res) => {
  try {
    const userId = req.params.id;

    // Populate fields if needed (e.g., branch, company, etc.)
    const user = await User.findById(userId)
      .select('-password')
      .populate('pipeline')
      .populate('branch')
      .populate('department')
      .populate('company')
      .populate('products')
      .populate('shifts')
      .populate('national')
      .populate('position')
      .populate('areas');

    if (!user) return res.status(404).json({ message: 'User not found' });

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    // Fix: Directly modify the single user object, no loop needed
    if (user.image) {
      user.image = `${imagePrefix}${user.image}`;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
router.put('/update-profile',
  upload.single('image'),
  isAuth,

  async (req, res) => {
    try {
      const {
        name,
        phone,
      } = req.body;
      const id = req.user._id;
      // Find user by ID
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Handle image update
      const image = req.file ? req.file.filename : user.image;


      // Update user fields
      user.name = name || user.name;

      user.phone = phone || user.phone;
      user.image = image;

      // Save updated user
      await user.save();

      res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
  }
);
// POST route for user login
// POST route for user login
// =================== LOGIN ROUTE ===================
router.post('/login', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user with populated references
    const user = await User.findOne({ email: email })
      .populate('pipeline', 'name')
      .populate('products', 'name')
      .populate('branch', 'name')
      .populate('company', 'name')
      .populate('department', 'name')
      .populate('areas', 'name')
      .populate('national', 'name')
      .populate('position', 'name');

    // if (!user || user.isBlocked) {
    //   return res.status(401).json({ message: 'User Has Been Blocked ' });
    // }

    // Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await incrementFailedLogin(ip);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (loginAttempts[ip]) delete loginAttempts[ip];

    // Generate JWT token
    const token = generateToken(user);

    // Create session
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const session = new Session({
      user: user._id,
      token,
      loginTime: new Date(),
      ipAddress,
    });
    await session.save();

    // Respond with user details
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      pipeline: user.pipeline,
      branch: user.branch,
      role: user.role,
      image: user.image,
      company: user.company,
      department: user.department,
      areas: user.areas,
      shifts: user.shifts,
      national: user.national,
      emp_code: user.emp_code,
      employee_id: user.employee_id,
      phone: user.phone,
      city: user.city,
      emergency_contact_name: user.emergency_contact_name,
      emergency_contact_number: user.emergency_contact_number,
      emergency_contact_relation: user.emergency_contact_relation,
      address: user.address,
      passport_number: user.passport_number,
      passport_expiry: user.passport_expiry,
      emirates_id_number: user.emirates_id_number,
      emirates_id_expiry: user.emirates_id_expiry,
      labour_card_number: user.labour_card_number,
      labour_card_expiry: user.labour_card_expiry,
      gender: user.gender,
      passport_files: user.passport_files,
      emirates_id_files: user.emirates_id_files,
      labour_card_files: user.labour_card_files,
      noc_letter_files: user.noc_letter_files,
      position: user.position,
      permissions: user.permissions,
      products: user.products,
      target: user.target,
      hire_date: user.hire_date,
      token,
      sessionId: session._id,
      ipAddress,
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// =================== RESET PASSWORD ROUTE ===================
router.put('/reset-password/:id', isAuth, hasPermission(['reset_password']), async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (password) {
      // If you already hash in pre-save hook, just assign plain password
      user.password = password; 
      // OR, if no hook: uncomment below
      // const saltRounds = 10;
      // user.password = await bcrypt.hash(password, saltRounds);
    }

    await user.save();
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Error updating password' });
  }
});



// Failed login tracking and auto-blocking logic
async function incrementFailedLogin(ip) {
  if (!loginAttempts[ip]) {
    loginAttempts[ip] = { count: 1, firstAttempt: Date.now() };
  } else {
    loginAttempts[ip].count += 1;
  }

  if (loginAttempts[ip].count > MAX_FAILED_ATTEMPTS) {
    await BlockedIP.updateOne(
      { ip },
      {
        $set: {
          ip,
          reason: 'Exceeded maximum failed login attempts'
        }
      },
      { upsert: true }
    );

    console.warn(`Blocked IP ${ip} due to too many failed login attempts`);
  }
}
/// delete User
router.put('/delete-user/:id', isAuth, hasPermission(['delete_user']), async (req, res) => {
  try {
    const { id } = req.params;

    // Find the user by ID
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Set delstatus to true
    user.delstatus = true;

    // Save the updated user
    await user.save();

    // Respond with the updated user
    res.status(200).json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});
/// Reset Password

router.put('/change-password', isAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Ensure both current and new passwords are provided
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }

    // Get the authenticated user's ID from the middleware
    const userId = req.user._id;

    // Find the user by their ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify the current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash and set the new password
    const saltRounds = 10;
    user.password = await bcrypt.hash(newPassword, saltRounds);

    // Save the updated user
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});
router.get('/get-developers', async (req, res) => {
  try {


    const developers = await User.find({ delstatus: false, role: 'Developer' })
      .select('-password') // Exclude the password field
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    developers.forEach(developer => {
      if (developer.image) {
        developer.image = `${imagePrefix}${developer.image}`;
      }
    });

    res.status(200).json(developers);
  } catch (error) {
    console.error('Error fetching developers:', error);
    res.status(500).json({ message: 'Error fetching developers' });
  }
});
router.get('/get-resigned-users', async (req, res) => {
  try {
    const { pipelineId } = req.query;

    // Build the query object
    const query = {
      labour_card_status: 'Active',
      resigned: true, // Only include users who are not resigned
    };

    if (pipelineId) {
      query.pipeline = pipelineId;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('pipeline')
      .populate('branch name')
      .populate('products')
      .populate('shifts')
      .populate('position name')
      .populate('department name')
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    users.forEach(user => {
      if (user.image) {
        user.image = `${imagePrefix}${user.image}`;
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching resigned users:', error);
    res.status(500).json({ message: 'Error fetching resigned users' });
  }
});
router.get('/get-resigned-users-for-admin', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const { pipelineId } = req.query;

    // Build the query object
    const query = {
      resigned: true, // Only include users who are not resigned
    };

    if (pipelineId) {
      query.pipeline = pipelineId;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('pipeline')
      .populate('branch name')
      .populate('products')
      .populate('shifts')
      .populate('position name')
      .populate('department name')
      .exec();

    const imagePrefix = 'http://172.16.20.13:8080/images/';

    users.forEach(user => {
      if (user.image) {
        user.image = `${imagePrefix}${user.image}`;
      }
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching resigned users:', error);
    res.status(500).json({ message: 'Error fetching resigned users' });
  }
});
// PUT /api/users/restore/:id
router.put("/restore-resigned-user/:id", isAuth, hasPermission(['restore_resigned_user']), async (req, res) => {
  try {
    await ensureAuthToken();
    const userId = req.params.id;

    // Fetch the user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Optionally remove resignation file
    if (user.resignation_file) {
      try {
        fs.unlinkSync(path.join("images", user.resignation_file));
      } catch (err) {
        console.warn("Resignation file not removed:", err.message);
      }
    }

    // Reset resignation-related fields
    user.resignation_date = null;
    user.resignation_reason = null;
    user.resignation_type = null;
    user.resignation_file = null;
    user.resigned = false;

    await user.save();

    // Send reinstatement request
    if (user.bio_times_id) {
      try {
        // First, fetch the resignation ID by bio_times_id
        const resignLookupRes = await axios.get(
          `http://172.16.20.3:8081/personnel/api/resigns/?employee=${user.bio_times_id}`,
          {
            headers: {
              Authorization: `JWT ${authToken}`,
            },
          }
        );

        const resignationId = resignLookupRes?.data?.data?.[0]?.id;

        if (!resignationId) {
          return res.status(400).json({
            message: "Unable to retrieve resignation ID from external API",
            data: resignLookupRes?.data,
          });
        }

        // Now send the reinstatement request using the resignation ID
        const reinstatementRes = await axios.post(
          "http://172.16.20.3:8081/personnel/api/resigns/reinstatement/",
          { resigns: [resignationId] },
          {
            headers: {
              Authorization: `JWT ${authToken}`,
            },
          }
        );

        console.log("Reinstatement API response:", reinstatementRes.data);
      } catch (apiErr) {
        if (apiErr.response) {
          console.error("External API Error:", {
            status: apiErr.response.status,
            data: apiErr.response.data,
          });
          return res.status(500).json({
            message: "Failed during external API interaction",
            error: apiErr.response.data,
          });
        } else if (apiErr.request) {
          console.error("No response from external API:", apiErr.request);
          return res.status(500).json({ message: "No response from external API" });
        } else {
          console.error("Error calling external API:", apiErr.message);
          return res.status(500).json({ message: apiErr.message });
        }
      }
    }

    res.status(200).json({ message: "User resignation restored", user });
  } catch (error) {
    console.error("Error restoring user:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
module.exports = router;