const express = require("express");
const Evaluation = require("../models/evaluationModel");
const { isAuth } = require("../utils");
const User = require("../models/userModel");


const router = express.Router();


// Approve Monthly Evaluation - Only CEO or MD can approve
router.put("/evaluate-approve/:id", isAuth, async (req, res) => {
    try {
      const userRole = req.user.role;
  
      if (userRole !== "CEO" && userRole !== "MD") {
        return res.status(403).json({ message: "Only CEO or MD can approve evaluations" });
      }
  
      const evaluation = await Evaluation.findById(req.params.id);
      if (!evaluation) {
        return res.status(404).json({ message: "Evaluation not found" });
      }
  
      evaluation.approved = true;
      await evaluation.save();
  
      res.status(200).json({ message: "Evaluation approved successfully", evaluation });
    } catch (error) {
      console.error("Error approving evaluation:", error);
      res.status(500).json({ message: "Error approving evaluation", error: error.message });
    }
  });
// Approve All Evaluations by Pipeline ID - Only CEO or MD can approve
router.put("/evaluate/approve-by-pipeline/:pipelineId", isAuth, async (req, res) => {
    try {
      const userRole = req.user.role;
  
      if (userRole !== "CEO" && userRole !== "MD") {
        return res.status(403).json({ message: "Only CEO or MD can approve evaluations" });
      }
  
      const { pipelineId } = req.params;
  
      // Find all users who belong to the specified pipelineId (pipeline is an array)
      const usersWithPipeline = await User.find({ pipeline: pipelineId });
  
      if (!usersWithPipeline || usersWithPipeline.length === 0) {
        return res.status(404).json({ message: "No users found with the specified pipeline ID" });
      }
  
      // Extract user IDs
      const userIds = usersWithPipeline.map(user => user._id);
  
      // Update all evaluations for these users to be approved
      const updatedEvaluations = await Evaluation.updateMany(
        { user: { $in: userIds } },
        { $set: { approved: true } }
      );
  
      res.status(200).json({
        message: `${updatedEvaluations.modifiedCount} evaluations approved successfully`,
        modifiedCount: updatedEvaluations.modifiedCount,
      });
    } catch (error) {
      console.error("Error approving evaluations by pipeline:", error);
      res.status(500).json({ message: "Error approving evaluations", error: error.message });
    }
  });
// Update Monthly Evaluation - Each Role Updates Their Own Field
router.put("/evaluate/:id", isAuth, async (req, res) => {
    try {
      const {
        commitment_attendance,
        professional_competence,
        efficiency_goal,
        commitment_policies,
      } = req.body;
  
      const userRole = req.user.role;
  
      const allowedFieldsByRole = {
        HR: ["commitment_attendance"],
        Accountant: ["efficiency_goal"],
        "Team Leader": ["commitment_policies"],
        HOM: ["professional_competence", "commitment_policies"],
        CEO: ["commitment_attendance","professional_competence","efficiency_goal","commitment_policies",],
        HOD: ["professional_competence","commitment_policies",],
        Manager: ["professional_competence","commitment_policies",],
        "Admin": ["commitment_attendance","professional_competence","efficiency_goal","commitment_policies",],
      };
  
      const evaluation = await Evaluation.findById(req.params.id);
      if (!evaluation) {
        return res.status(404).json({ message: "Evaluation not found" });
      }
  
      const updates = {
        commitment_attendance,
        professional_competence,
        efficiency_goal,
        commitment_policies,
      };
  
      const allowedFields = allowedFieldsByRole[userRole] || [];
      let updated = false;
  
      for (const field in updates) {
        if (updates[field] !== null) {
          if (allowedFields.includes(field)) {
            evaluation[field] = updates[field];
            updated = true;
          } else {
            return res.status(403).json({
              message: `You are not authorized to update field: ${field}`,
            });
          }
        }
      }
  
      if (!updated) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
  
      evaluation.total_score =
        (evaluation.commitment_attendance || 0) +
        (evaluation.professional_competence || 0) +
        (evaluation.efficiency_goal || 0) +
        (evaluation.commitment_policies || 0);
  
      await evaluation.save();
  
      res
        .status(200)
        .json({ message: "Evaluation updated successfully", evaluation });
    } catch (error) {
      console.error("Error updating evaluation:", error);
      res
        .status(500)
        .json({ message: "Error updating evaluation", error: error.message });
    }
  });
// 2️⃣ Get Evaluations For Users With Matching Pipeline
router.get("/get-evaluations", isAuth, async (req, res) => {
    try {
      const pipelineIds = req.user.pipeline.map(p => p._id);
  
      // Get previous month in "Month Year" format (e.g., "March 2025")
      const now = new Date();
      const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = previousMonthDate.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
  
      // Find users that share at least one pipeline with the current user
      const usersWithMatchingPipeline = await User.find({
        pipeline: { $in: pipelineIds },
      }).select("_id");
  
      const userIds = usersWithMatchingPipeline.map(u => u._id);
  
      const evaluations = await Evaluation.find({
        user: { $in: userIds },
        month: previousMonth,
        approved: false,
      })
        .populate({
          path: "user",
          select: "name role pipeline image",
          populate: {
            path: "pipeline",
            select: "name", // Get pipeline names
          },
        })
        .sort({ month: -1 });
  
      res.status(200).json(evaluations);
    } catch (error) {
      console.error("Error fetching evaluations:", error);
      res.status(500).json({ message: "Error fetching evaluations", error: error.message });
    }
  }); 
  router.get("/get-my-evaluation", isAuth, async (req, res) => {
    try {
      const userId = req.user._id;
  
      // Get previous month in "Month Year" format
      const now = new Date();
      const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = previousMonthDate.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
  
      const evaluation = await Evaluation.findOne({
        user: userId,
        month: previousMonth,
        approved: true,
      }).populate({
        path: "user",
        select: "name role pipeline",
        populate: {
          path: "pipeline",
          select: "name",
        },
      });
  
      if (!evaluation) {
        return res.status(404).json({
          message: `No approved evaluation found for ${previousMonth}`,
        });
      }
  
      res.status(200).json(evaluation);
    } catch (error) {
      console.error("Error fetching user evaluation:", error);
      res.status(500).json({
        message: "Error fetching user evaluation",
        error: error.message,
      });
    }
  });
  router.get("/top-and-worst-evaluations", isAuth, async (req, res) => {
    try {
      // Calculate previous month
      const now = new Date();
      const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = previousMonthDate.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
  
      // Common query conditions
      const baseQuery = {
        month: previousMonth,
        approved: true,
      };
  
      // Top 5 performers
      const top5 = await Evaluation.find(baseQuery)
        .sort({ total_score: -1 })
        .limit(5)
        .populate({
          path: "user",
          select: "name role pipeline image",
          populate: {
            path: "pipeline",
            select: "name",
          },
        });
  
      // Worst 5 performers
      const worst5 = await Evaluation.find(baseQuery)
        .sort({ total_score: 1 })
        .limit(5)
        .populate({
          path: "user",
          select: "name role pipeline image",
          populate: {
            path: "pipeline",
            select: "name",
          },
        });
  
      res.status(200).json({
        month: previousMonth,
        top5,
        worst5,
      });
    } catch (error) {
      console.error("Error fetching top/worst evaluations:", error);
      res.status(500).json({
        message: "Error fetching top/worst evaluations",
        error: error.message,
      });
    }
  });
  
  router.get("/get-all-evaluations-by-month", isAuth, async (req, res) => {
    try {
      const pipelineIds = req.user.pipeline.map(p => p._id);
  
      // Find users with matching pipelines
      const usersWithMatchingPipeline = await User.find({
        pipeline: { $in: pipelineIds },
      }).select("_id");
  
      const userIds = usersWithMatchingPipeline.map(u => u._id);
  
      // Find all unapproved evaluations for those users
      const evaluations = await Evaluation.find({
        user: { $in: userIds },
        approved: false,
      })
        .populate({
          path: "user",
          select: "name role pipeline image",
          populate: {
            path: "pipeline",
            select: "name",
          },
        })
        .sort({ month: -1 });
  
      // Group evaluations by month
      const evaluationsByMonth = {};
      for (const evaluation of evaluations) {
        const month = evaluation.month;
        if (!evaluationsByMonth[month]) {
          evaluationsByMonth[month] = [];
        }
        evaluationsByMonth[month].push(evaluation);
      }
  
      res.status(200).json(evaluationsByMonth);
    } catch (error) {
      console.error("Error fetching evaluations:", error);
      res.status(500).json({ message: "Error fetching evaluations", error: error.message });
    }
  });
  



module.exports = router;
