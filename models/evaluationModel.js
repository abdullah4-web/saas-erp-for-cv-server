const mongoose = require("mongoose");

const evaluationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true }, // e.g., "July 2024"
    commitment_attendance: { type: Number, required: true }, // Added by HR (20%)
    professional_competence: { type: Number, required: true }, // Added by Team Leader (20%)
    efficiency_goal: { type: Number, required: true }, // From Deals Module (40%)
    commitment_policies: { type: Number, required: true }, // Added by Manager (20%)
    total_score: { type: Number, default: 0 }, // Auto-calculated
    approved: { type: Boolean, default: false }, // New field
  },
  {
    timestamps: true,
  }
);

evaluationSchema.pre("save", function (next) {
  this.total_score =
    this.commitment_attendance  +
    this.professional_competence  +
    this.efficiency_goal  +
    this.commitment_policies ;
  next();
});

const Evaluation = mongoose.model("Evaluation", evaluationSchema);
module.exports = Evaluation;
