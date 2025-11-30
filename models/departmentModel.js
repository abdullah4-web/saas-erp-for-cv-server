const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Ensures department names are unique
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true, // Ensures department codes are unique
      trim: true, 
    },
    bio_times_id: {
      type: Number, // Changed to number
      required: false, // Can be optional if not always available
    },
  },
  { timestamps: true } // Automatically adds createdAt & updatedAt fields
);

const Department = mongoose.model("Department", departmentSchema);
module.exports = Department;
