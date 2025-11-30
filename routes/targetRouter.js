const express = require("express");
const mongoose = require("mongoose");
const { isAuth } = require("../utils");
const targetModel = require("../models/targetModel");
const cron = require("node-cron");
const router = express.Router();


router.get("/user-targets", isAuth, async (req, res) => {
    try {
        const userId = req.user._id;  // Extract user ID from the authenticated user

        // Find targets where assignedTo is the userId and assignedToModel is "User"
        const targets = await targetModel
            .find({ 
                assignedTo: userId, 
                assignedToModel: "User",
                is_renewed: false  // Optionally filter for non-renewed targets
            })
            .populate({ path: "assignedBy", select: "name" })   // Get assignedBy name
            .populate({ path: "assignedTo", select: "name" })   // Get assignedTo name
            .populate({ path: "pipeline", select: "name" });    // Get pipeline name

        res.status(200).json(targets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.get("/pipeline-targets", isAuth, async (req, res) => {
    try {
        // Extract pipeline IDs from req.user.pipeline
        const pipelineIds = req.user.pipeline.map(p => p._id);

        // Find targets where assignedTo matches pipeline IDs, assignedToModel is "Pipeline", and is_renewed is false
        const targets = await targetModel
            .find({ 
                assignedTo: { $in: pipelineIds }, 
                assignedToModel: "Pipeline",
                is_renewed: false  // Filter for targets that are not renewed
            })
            .populate({ path: "assignedBy", select: "name" })   // Get assignedBy name
            .populate({ path: "assignedTo", select: "name" })   // Get assignedTo name
            .populate({ path: "pipeline", select: "name" });    // Get pipeline name

        res.status(200).json(targets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new target 
router.post("/create-target", isAuth, async (req, res) => {
    try {
        const { role, _id: assignedBy } = req.user;
        const {
            assignedTo,
            pipeline,
            finance_amount,
            startDate,
            endDate,
            duration,
        } = req.body;

        const assignedToModel = role === "CEO" ? "Pipeline" : "User";

        const target = new targetModel({
            assignedBy,
            assignedTo,
            assignedToModel,
            pipeline,
            finance_amount,
            duration,
            startDate,
            endDate,
        });

        await target.save();
        res.status(201).json(target);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all targets
router.get("/get-all-target", isAuth, async (req, res) => {
    try {
        let query = {};

        if (["CEO", "MD"].includes(req.user.role)) {
            query.assignedToModel = "Pipeline";
        } else if (["Manager", "HOD","HOM"].includes(req.user.role)) {
            query.assignedToModel = "User";
            query.pipeline = { $in: req.user.pipeline };
        }

        const targets = await targetModel
            .find(query)
            .populate({ path: "assignedBy", select: "name" })
            .populate({ path: "assignedTo", select: "name" })
            .populate({ path: "pipeline", select: "name" });

        res.status(200).json(targets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Get a specific target by ID
router.get("/:id", isAuth, async (req, res) => {
    try {
        const target = await targetModel.findById(req.params.id).populate("assignedBy assignedTo pipeline");
        if (!target) return res.status(404).json({ message: "Target not found" });
        res.status(200).json(target);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update a target
router.put("/edit-target/:id", isAuth, async (req, res) => {
    try {
        const target = await targetModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!target) return res.status(404).json({ message: "Target not found" });
        res.status(200).json(target);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete a target
router.delete("/delete-target/:id", isAuth, async (req, res) => {
    try {
        const target = await targetModel.findByIdAndDelete(req.params.id);
        if (!target) return res.status(404).json({ message: "Target not found" });
        res.status(200).json({ message: "Target deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Function to calculate new start and end dates based on duration
const getNextDurationDates = (prevEndDate, duration) => {
    const newStartDate = new Date(prevEndDate);
    newStartDate.setDate(newStartDate.getDate() + 1); // Start from the next day

    let newEndDate = new Date(newStartDate);

    switch (duration) {
        case "3months":
            newEndDate.setMonth(newEndDate.getMonth() + 3);
            break;
        case "4months":
            newEndDate.setMonth(newEndDate.getMonth() + 4);
            break;
        case "6months":
            newEndDate.setMonth(newEndDate.getMonth() + 6);
            break;
        case "1year":
            newEndDate.setFullYear(newEndDate.getFullYear() + 1);
            break;
        default:
            throw new Error("Invalid duration");
    }

    return { newStartDate, newEndDate };
};


// **Scheduled Job to Create New Targets**
cron.schedule("43 16 * * *", async () => {
    console.log("Checking for expired targets...");
    try {
        const now = new Date();

        // Find all expired targets where is_renewed is false
        const expiredTargets = await targetModel.find({
            endDate: { $lte: now },
            is_renewed: false
        });

        for (const target of expiredTargets) {
            const { newStartDate, newEndDate } = getNextDurationDates(target.endDate, target.duration);

            // Create a new target with the same details but new dates
            const newTarget = new targetModel({
                assignedBy: target.assignedBy,
                assignedTo: target.assignedTo,
                assignedToModel: target.assignedToModel,
                pipeline: target.pipeline,
                finance_amount: target.finance_amount,
                duration: target.duration,
                startDate: newStartDate,
                endDate: newEndDate,
                is_renewed: false  // New target should be initially false
            });

            await newTarget.save();

            // Update the previous target to mark it as renewed
            await targetModel.findByIdAndUpdate(target._id, { is_renewed: true });

            console.log(`New target created for ${target.assignedTo} with startDate: ${newStartDate}`);
        }
    } catch (error) {
        console.error("Error processing expired targets:", error);
    }
});






module.exports = router;
