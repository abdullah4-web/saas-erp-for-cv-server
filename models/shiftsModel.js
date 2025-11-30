const mongoose = require("mongoose");

const shiftSchema = new mongoose.Schema({
    name: { type: String, required: true },

    schedule: {
        Monday: { startTime: String, endTime: String, breakTime: String },
        Tuesday: { startTime: String, endTime: String, breakTime: String },
        Wednesday: { startTime: String, endTime: String, breakTime: String },
        Thursday: { startTime: String, endTime: String, breakTime: String },
        Friday: { startTime: String, endTime: String, breakTime: String },
        Saturday: { startTime: String, endTime: String, breakTime: String },
        Sunday: { startTime: String, endTime: String, breakTime: String }
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: "Area", required: true },
    type: { type: String, required: true },


}, { timestamps: true });

module.exports = mongoose.model("Shift", shiftSchema);
