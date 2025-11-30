const mongoose = require("mongoose");

const targetSchema = new mongoose.Schema(
    {
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, refPath: "assignedToModel", required: true }, 
        assignedToModel: { type: String, enum: ["User", "Pipeline"], required: true }, 
        pipeline: { type: mongoose.Schema.Types.ObjectId, ref: "Pipeline", required: true }, 
        duration: { type: String, required: true },
        finance_amount: { type: Number, required: true }, 
        achieved_finance_amount: { type: Number, default: 0 }, 
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        status: { type: String, enum: ["Pending", "In Progress", "Completed"], default: "Pending" },
        is_renewed: { type: Boolean, default: false },
    },
    { timestamps: true } 
);

module.exports = mongoose.model("Target", targetSchema);
 