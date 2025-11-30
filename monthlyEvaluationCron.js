const mongoose = require("mongoose");
const Evaluation = require("./models/evaluationModel");
const User = require("./models/userModel");

// Replace with your actual MongoDB URI
const MONGODB_URI = "mongodb://localhost:27017/3Apr2025";

const createMonthlyEvaluations = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const salesUsers = await User.find({ role: "Sales" });

    // Get the previous month
    const now = new Date();
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const previousMonth = previousMonthDate.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    for (const user of salesUsers) {
      const existing = await Evaluation.findOne({ user: user._id, month: previousMonth });
      if (!existing) {
        await Evaluation.create({
          user: user._id,
          month: previousMonth,
          commitment_attendance: 0,
          professional_competence: 0,
          efficiency_goal: 0,
          commitment_policies: 0,
          total_score: 0,
        });
      }
    }

    console.log(`✅ Monthly evaluations created for ${previousMonth}`);
  } catch (error) {
    console.error("❌ Error creating monthly evaluations:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
};

createMonthlyEvaluations();
