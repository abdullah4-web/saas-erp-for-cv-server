const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema({
    dates: {
        type: [String], // Store multiple dates as strings (e.g., "YYYY-MM-DD")
        required: true,
    },
    name: {
        type: String, // Name of the holiday (e.g., "Eid", "Christmas", etc.)
        required: true,
    },
    description: {
        type: String, // Optional holiday description
        default: "",
    },
    timestamp: {
        type: Number, // Store the record creation time as a Unix timestamp
        default: () => Math.floor(Date.now() / 1000),
    }
});

// Ensure no duplicate holiday names with the same set of dates
holidaySchema.index({ name: 1, dates: 1 }, { unique: true });

module.exports = mongoose.model("Holiday", holidaySchema);
