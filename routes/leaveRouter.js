const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Leave = require("../models/leaveModel");
const { isAuth } = require("../utils");
const User = require("../models/userModel");
const Attendance = require("../models/attendenceModel");
const Department = require("../models/departmentModel");
const hasPermission = require("../hasPermission");

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // make sure this folder exists
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${uuidv4()}-${Date.now()}${ext}`;
        cb(null, uniqueName);
    },
});
const upload = multer({ storage });
// --------------------------------------------
// Create a new leave request
// --------------------------------------------
router.post("/create", isAuth, upload.array("files"), async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const emp_id = user.employee_id;
        const emp_code = user.emp_code;
        const { leave_type, start_date, end_date, reason, pay_option, duration } = req.body;

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        // Check for overlapping leave request
        const overlappingLeave = await Leave.findOne({
            user: userId,
            $or: [
                {
                    start_date: { $lte: endDate },
                    end_date: { $gte: startDate }
                }
            ]
        });

        if (overlappingLeave) {
            return res.status(400).json({
                error: "You have already applied for leave during this date range"
            });
        }

        const files = req.files?.map((file) => ({
            filename: file.originalname,
            url: `/uploads/${file.filename}`,
            mimetype: file.mimetype,
        }));

        // Auto-approve if the user is HOD, Manager, or HOM
        const autoApproveRoles = ["HOD", "Manager", "HOM", "Multi MG", "Accountant"];
        const managerApprovalStatus = autoApproveRoles.includes(user.role) ? "Approved" : "Pending";

        const leave = new Leave({
            user: userId,
            employee_id: emp_id,
            emp_code: emp_code,
            leave_type,
            pay_option,
            start_date: startDate,
            end_date: endDate,
            reason,
            duration,
            files,
            manager_approval_status: managerApprovalStatus
        });

        await leave.save();
        res.status(201).json({ message: "Leave request created", leave });
    } catch (err) {
        console.error("Error creating leave:", err);
        res.status(500).json({ error: "Failed to create leave request" });
    }
});
///--------------------------------------------
/// HR Create a new leave request
///--------------------------------------------
// HR creates leave for any user
router.post("/hr-create", isAuth, hasPermission(['hr_create_leave']), upload.array("files"), async (req, res) => {
    try {
        const { userId, leave_type, start_date, end_date, reason, pay_option, duration } = req.body;

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: "Target user not found" });
        }

        const emp_id = targetUser.employee_id;
        const emp_code = targetUser.emp_code;

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        // Check for overlapping leave
        const overlappingLeave = await Leave.findOne({
            user: userId,
            $or: [
                {
                    start_date: { $lte: endDate },
                    end_date: { $gte: startDate }
                }
            ]
        });

        if (overlappingLeave) {
            return res.status(400).json({
                error: "This user already has leave during this date range"
            });
        }

        const files = req.files?.map((file) => ({
            filename: file.originalname,
            url: `/uploads/${file.filename}`,
            mimetype: file.mimetype,
        }));

        // Auto-approve for certain roles
        const autoApproveRoles = ["HOD", "Manager", "HOM", "Multi MG", "Accountant"];
        const managerApprovalStatus = autoApproveRoles.includes(targetUser.role) ? "Approved" : "Pending";

        const leave = new Leave({
            user: userId,
            employee_id: emp_id,
            emp_code: emp_code,
            leave_type,
            pay_option,
            start_date: startDate,
            end_date: endDate,
            reason,
            duration,
            files,
            manager_approval_status: managerApprovalStatus,
            hr_approval_status: "Approved", // Since HR is creating, mark as approved
            hr_approved_by: req.user._id,
        });

        await leave.save();

        res.status(201).json({ message: "Leave request created by HR", leave });
    } catch (err) {
        console.error("Error creating leave by HR:", err);
        res.status(500).json({ error: "Failed to create leave request" });
    }
});
////---------------------------------------------
// Edit a leave request
///--------------------------------------------
router.put("/edit/:leaveId", isAuth, hasPermission(['edit_leave']), async (req, res) => {
    try {
        const requester = await User.findById(req.user._id);
        const { leaveId } = req.params;
        const {
            leave_type,
            start_date,
            end_date,
            duration,
            pay_option,

            reason,
            userId, // Optional: only used by CEO/HR to change the owner
        } = req.body;

        const files = req.files?.map((file) => ({
            filename: file.originalname,
            url: `/uploads/${file.filename}`,
            mimetype: file.mimetype,
        }));

        const leave = await Leave.findById(leaveId);
        if (!leave) {
            return res.status(404).json({ error: "Leave request not found" });
        }

        // 🔒 Only allow edits if status is still pending
        if (leave.status !== "Pending") {
            return res.status(400).json({ error: "Only pending leave requests can be edited" });
        }

        const isCEO = requester.role === "CEO" || requester.role === "MD" || requester.role === "HR";
        const isOwner = leave.user.toString() === requester._id.toString();

        // 🔒 Check permission: only CEO/HR or owner can edit
        if (!isCEO && !isOwner) {
            return res.status(403).json({ error: "You are not authorized to edit this leave request" });
        }

        // ✅ Update fields
        if (leave_type) leave.leave_type = leave_type;
        if (start_date) leave.start_date = start_date;
        if (end_date) leave.end_date = end_date;
        if (duration) leave.duration = duration;
        if (pay_option) leave.pay_option = pay_option;
        if (reason) leave.reason = reason;
        if (files && files.length) leave.files = files;

        // 🔁 Allow CEO/HR to update the leave's user
        if (isCEO && userId && userId !== leave.user.toString()) {
            const targetUser = await User.findById(userId);
            if (!targetUser) return res.status(404).json({ error: "Target user not found" });
            leave.user = targetUser._id;
            leave.employee_id = targetUser.employee_id;
            leave.emp_code = targetUser.emp_code;
        }

        await leave.save();
        res.status(200).json({ message: "Leave request updated successfully", leave });

    } catch (err) {
        console.error("Error updating leave:", err);
        res.status(500).json({ error: "Failed to update leave request" });
    }
});
// --------------------------------------------
// Get all leave requests
// --------------------------------------------
router.get("/",  isAuth , hasPermission(['hr_leave_approval']), async (req, res) => {
    try {
        let leaves = await Leave.find()
            .populate({
                path: "user",
                match: { labour_card_status: "Active" },
                select: "name emp_code employee_id department hire_date",
                populate: {
                    path: "department",
                    select: "name"
                }
            })
            .populate({
                path: "approved_by",
                select: "name image"
            })
            .populate({
                path: "hr_approved_by",
                select: "name image"
            })
            .populate({
                path: "manager_approved_by",
                select: "name image"
            })
            .sort({ createdAt: -1 });

        // Filter out records where user is null due to failed match
        leaves = leaves.filter(leave => leave.user !== null);

        res.status(200).json(leaves);
    } catch (err) {
        console.error("Error fetching leaves:", err);
        res.status(500).json({ error: "Failed to fetch leave records" });
    }
});

router.get("/get-ceo-leave-list", isAuth,  hasPermission(['leave_final_approval']), async (req, res) => {
    try {

        // Fetch pending leave requests for those users
        let leaves = await Leave.find({
            status: "Pending",
            manager_approval_status: "Approved",
            hr_approval_status: "Approved"
        })
            .populate({
                path: "user",
                select: "name emp_code employee_id department areas hire_date",
                match: { labour_card_status: 'Active' },
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            })
            .populate({ path: "approved_by", select: "name" })
            .sort({ createdAt: -1 });

        // Filter out records where user is null due to failed match
        leaves = leaves.filter(leave => leave.user !== null);

        res.status(200).json(leaves);
    } catch (err) {
        console.error("Error fetching leaves:", err);
        res.status(500).json({ error: "Failed to fetch leave records" });
    }
});


router.get("/get-managers-leave-list", isAuth,  hasPermission(['manager_leave_approval']), async (req, res) => {
    try {
        let userIds = [];

        if (req.user.role === "Multi MG") {
            // Find departments named HR or Admin
            const departments = await Department.find({ name: { $in: ["HR", "Admin"] } }).select("_id");
            const departmentIds = departments.map(d => d._id);

            // Fetch users in those departments
            const users = await User.find({
                department: { $in: departmentIds },
                labour_card_status: 'Active'
            }).select('_id');
            userIds = users.map(u => u._id);

        } else {
            // Normal manager flow: filter by department and matching areas
            const departmentId = req.user.department;
            const userAreaIds = req.user.areas?.map(area => area) || [];

            const usersWithMatchingCriteria = await User.find({
                department: departmentId,
                areas: { $elemMatch: { $in: userAreaIds } }
            }).select("_id");

            userIds = usersWithMatchingCriteria.map(u => u._id);
        }

        // Fetch pending leave requests for those users
        let leaves = await Leave.find({
            user: { $in: userIds },
            manager_approval_status: "Pending",
            hr_approval_status: "Approved"
        })
            .populate({
                path: "user",
                select: "name emp_code employee_id department areas hire_date",
                match: { labour_card_status: 'Active' },
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            })
            .populate({ path: "approved_by", select: "name" })
            .sort({ createdAt: -1 });

        // Filter out records where user is null due to failed match
        leaves = leaves.filter(leave => leave.user !== null);

        res.status(200).json(leaves);
    } catch (err) {
        console.error("Error fetching leaves:", err);
        res.status(500).json({ error: "Failed to fetch leave records" });
    }
});
// -------------------------------------------- 
// Approve or reject a leave request
// --------------------------------------------
router.put("/action/:id", isAuth, hasPermission(['leave_final_approval']), async (req, res) => {
    try {
        const approved_by = req.user._id;
        const { status } = req.body;
        const { id } = req.params;

        if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        // Update the leave status
        const updatedLeave = await Leave.findByIdAndUpdate(
            id,
            {
                status,
                approved_by,
                approved: status === "Approved",
                approved_date: status === "Approved" ? new Date() : null
            },
            { new: true }
        );

        if (!updatedLeave) {
            return res.status(404).json({ error: "Leave not found" });
        }

        // If approved, update attendance
        if (status === "Approved") {
            await Attendance.updateMany(
                {
                    user: updatedLeave.user,
                    Date: { $gte: new Date(updatedLeave.start_date), $lte: new Date(updatedLeave.end_date) }
                },
                {
                    $set: {
                        checkstatus: "leave",
                        check_in_status: "leave",
                        check_out_status: "leave"
                    }
                }
            );
        }

        res.status(200).json({ message: "Status updated", leave: updatedLeave });
    } catch (err) {
        console.error("Error updating leave status:", err);
        res.status(500).json({ error: "Failed to update leave status" });
    }
});
router.put("/manager-approval/:id", isAuth, hasPermission(['manager_leave_approval']), async (req, res) => {
    try {
        const { manager_approval_status } = req.body;
        const { id } = req.params;

        if (!["Approved", "Rejected"].includes(manager_approval_status)) {
            return res.status(400).json({ error: "Invalid manager approval status" });
        }

        const leave = await Leave.findById(id);
        if (!leave) {
            return res.status(404).json({ error: "Leave not found" });
        }

        // Update manager approval fields
        leave.manager_approval_status = manager_approval_status;
        leave.manager_approved_by = req.user._id; // Assuming req.user contains the manager's ID
        if (manager_approval_status === "Rejected") {
            leave.status = "Rejected";
        }
        const updatedLeave = await leave.save();

        res.status(200).json({ message: "Manager approval status updated", leave: updatedLeave });
    } catch (err) {
        console.error("Error updating manager approval status:", err);
        res.status(500).json({ error: "Failed to update manager approval status" });
    }
});
// --------------------------------------------
// Delete a leave request
// --------------------------------------------
router.delete("/delete/:id", isAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        // Find the leave request
        const leave = await Leave.findById(id);

        if (!leave) {
            return res.status(404).json({ error: "Leave request not found" });
        }

        // Check if the leave belongs to the logged-in user
        if (leave.user.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Unauthorized: You can only delete your own leave" });
        }

        // Delete the leave
        await Leave.findByIdAndDelete(id);
        res.status(200).json({ message: "Leave request deleted successfully" });

    } catch (err) {
        console.error("Error deleting leave:", err);
        res.status(500).json({ error: "Failed to delete leave request" });
    }
});
/// --------------------------------------------
// Get a leave request by ID
// --------------------------------------------
router.get("/my-leaves", isAuth, async (req, res) => {
    try {
        const userId = req.user._id;

        const userLeaves = await Leave.find({ user: userId })
            .populate({
                path: "user",
                select: "name emp_code employee_id department hire_date",
                populate: {
                    path: "department",
                    select: "name"
                }
            })
            .sort({ createdAt: -1 });

        res.status(200).json(userLeaves);
    } catch (err) {
        console.error("Error fetching user's leaves:", err);
        res.status(500).json({ error: "Failed to fetch your leave records" });
    }
});
/// --------------------------------------------
// Get Approved Leaves
// --------------------------------------------
router.get("/my-approved-leaves", isAuth, async (req, res) => {
    try {
        const userId = req.user._id;

        const userLeaves = await Leave.find({ user: userId, status: "Approved" })
            .populate({
                path: "user",
                select: "name emp_code employee_id department hire_date",
                populate: {
                    path: "department",
                    select: "name"
                }
            })
            .sort({ createdAt: -1 });

        res.status(200).json(userLeaves);
    } catch (err) {
        console.error("Error fetching user's leaves:", err);
        res.status(500).json({ error: "Failed to fetch your leave records" });
    }
});
/// -------------------------------------------
// Get Approved Leaves 
// -------------------------------------------
router.get("/get-approved-list", isAuth, hasPermission(['leave_history']) ,async (req, res) => {
    try {
        const leaves = await Leave.find({ status: "Approved" })
            .populate({
                path: "user",
                select: "name emp_code employee_id department",
                match: { labour_card_status: 'Active' },
                populate: {
                    path: "department",
                    select: "name"  // Select fields from department
                }
            })
            .populate({
                path: "approved_by",
                select: "name"
            })
            .sort({ createdAt: -1 });

        res.status(200).json(leaves);
    } catch (err) {
        console.error("Error fetching leaves:", err);
        res.status(500).json({ error: "Failed to fetch leave records" });
    }
});
// --------------------------------------------
// Get a leave request by ID
// --------------------------------------------
router.get("/single-users/:id", isAuth, async (req, res) => {
    try {
        const leaves = await Leave.find({ user: req.params.id })
            .populate({
                path: "user",
                select: "name emp_code employee_id department",
                populate: {
                    path: "department",
                    select: "name"
                }
            })
            .populate({
                path: "approved_by",
                select: "name"
            })
            .sort({ createdAt: -1 });

        res.status(200).json(leaves);
    } catch (err) {
        console.error("Error fetching leaves:", err);
        res.status(500).json({ error: "Failed to fetch leave records" });
    }
});
/// --------------------------------------------
// Hr Approval 
// --------------------------------------------
// HR approves or rejects leave
router.put("/hr-approve/:id", isAuth, hasPermission(['hr_leave_approval']), async (req, res) => {
    const { hr_approval_status } = req.body; // expect "Approved" or "Rejected"
    const leaveId = req.params.id;

    if (!["Approved", "Rejected"].includes(hr_approval_status)) {
        return res.status(400).json({ message: "Invalid approval status" });
    }


    try {
        const leave = await Leave.findById(leaveId);
        if (!leave) {
            return res.status(404).json({ message: "Leave not found" });
        }

        leave.hr_approval_status = hr_approval_status;
        leave.hr_approved_by = req.user._id;
        if (hr_approval_status === "Rejected") {
            leave.status = "Rejected";
        }

        await leave.save();

        res.json({ message: "HR approval updated", leave });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
