const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/userModel");
const shiftsModel = require("../models/shiftsModel");

const router = express.Router();

// Assign shift to users based on area and type
const assignUsersToShift = async (shift) => {
    const users = await User.find({ area: shift.area, type: shift.type });
    const userIds = users.map(user => user._id);

    shift.assignedUsers = userIds;
    await shift.save();

    await User.updateMany(
        { _id: { $in: userIds } },
        { $addToSet: { shifts: shift._id } }
    );
};

// Remove shift from all users' `shifts` array
const removeShiftFromUsers = async (shiftId) => {
    await User.updateMany(
        { shifts: shiftId },
        { $pull: { shifts: shiftId } }
    );
};

// Create a new shift
router.post("/create-shift", async (req, res) => {
    try {
        const { name, schedule, startDate, endDate, area, type } = req.body;

        if (!name || !schedule || !startDate || !endDate || !area || !type) {
            return res.status(400).json({ message: "All fields are required!" });
        }

        const newShift = new shiftsModel({ name, schedule, startDate, endDate, area, type });
        await assignUsersToShift(newShift);

        res.status(201).json({
            message: "Shift created and users assigned successfully!",
            shift: newShift
        });
    } catch (error) {
        console.error("Error creating shift:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Update an existing shift
router.put("/update/:shiftId", async (req, res) => {
    try {
        const { shiftId } = req.params;
        const { name, schedule, startDate, endDate, area, type } = req.body;

        const shift = await shiftsModel.findById(shiftId);
        if (!shift) return res.status(404).json({ message: "Shift not found" });

        await removeShiftFromUsers(shiftId);

        if (name) shift.name = name;
        if (schedule) shift.schedule = schedule;
        if (startDate) shift.startDate = startDate;
        if (endDate) shift.endDate = endDate;
        if (area) shift.area = area;
        if (type) shift.type = type;

        await assignUsersToShift(shift);

        res.status(200).json({
            message: "Shift updated and users reassigned successfully!",
            shift
        });
    } catch (error) {
        console.error("Error updating shift:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Delete a shift
router.delete("/delete/:shiftId", async (req, res) => {
    try {
        const { shiftId } = req.params;

        const shift = await shiftsModel.findById(shiftId);
        if (!shift) return res.status(404).json({ message: "Shift not found" });

        await removeShiftFromUsers(shiftId);
        await shift.deleteOne();

        res.status(200).json({ message: "Shift deleted and removed from users successfully!" });
    } catch (error) {
        console.error("Error deleting shift:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Get all shifts with populated area and assigned users
router.get("/all", async (req, res) => {
    try {
        const shifts = await shiftsModel.find()
            .populate("area")

        res.status(200).json(shifts);
    } catch (error) {
        console.error("Error fetching shifts:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

module.exports = router;
