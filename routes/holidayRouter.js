const express = require("express");
const moment = require("moment-timezone");
const Holiday = require("../models/holidayModel");
const Attendance = require("../models/attendenceModel"); // Adjust the path as necessary
const hasPermission = require("../hasPermission");
const { isAuth } = require("../utils");
const router = express.Router();

// Create a holiday with multiple dates
router.post("/create", isAuth, hasPermission(['attendance_management']),async (req, res) => {
    try {
      const { dates, name, description } = req.body;
  
      if (!Array.isArray(dates) || dates.length === 0) {
        return res.status(400).json({ message: "Dates must be an array and cannot be empty." });
      }
  
      // Save the holiday first
      const holiday = new Holiday({
        dates,
        name,
        description,
        timestamp: Math.floor(Date.now() / 1000),
      });
  
      await holiday.save();
  
      // Update attendance for each date
      const updatePromises = dates.map(async (date) => {
        const formattedDate = new Date(date);
  
        await Attendance.updateMany(
          { Date: formattedDate },
          {
            check_in_status: "holiday",
            check_out_status: "holiday",
          }
        );
      });
  
      await Promise.all(updatePromises);
  
      res.status(201).json({ message: "Holiday created and attendance updated successfully", holiday });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ message: "Error creating holiday", error: error.message });
    }
  });


// Get all holidays
router.get("/list", async (req, res) => {
    try {
        const holidays = await Holiday.find().sort({ "dates.0": 1, name: 1 });
        res.status(200).json({ holidays });
    } catch (error) {
        console.error("Error fetching holidays:", error);
        res.status(500).json({ message: "Error fetching holidays", error: error.message });
    }
});


// Delete a holiday by name
router.delete("/delete/:id", isAuth, hasPermission(['attendance_management']),async (req, res) => {
    try {
        const { id } = req.params;

        // Find and delete the holiday by ID
        const result = await Holiday.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({ message: "Holiday not found" });
        }

        res.status(200).json({ message: "Holiday deleted successfully" });
    } catch (error) {
        console.error("Error deleting holiday:", error);
        res.status(500).json({ message: "Error deleting holiday", error: error.message });
    }
});



// Update a holiday by ID
router.put("/update/:id", isAuth,  hasPermission(['attendance_management']),async (req, res) => {
    try {
        const { id } = req.params;
        const { dates, name, description } = req.body;

        // Find the holiday by ID
        let holiday = await Holiday.findById(id);
        if (!holiday) {
            return res.status(404).json({ message: "Holiday not found" });
        }

        // Check for duplicate holidays with the same name and dates
        if (name && dates) {
            const existingHoliday = await Holiday.findOne({ name, dates });
            if (existingHoliday && existingHoliday._id.toString() !== id) {
                return res.status(400).json({ message: "A holiday with the same name and dates already exists." });
            }
        }

        // Update holiday details
        if (name) holiday.name = name;
        if (description !== undefined) holiday.description = description;
        if (Array.isArray(dates) && dates.length > 0) {
            holiday.dates = dates;
        }

        // Save updated holiday
        await holiday.save();

        res.status(200).json({ message: "Holiday updated successfully", holiday });
    } catch (error) {
        console.error("Error updating holiday:", error);
        res.status(500).json({ message: "Error updating holiday", error: error.message });
    }
});

// Delete a specific date from a holiday (keeping other dates)
router.delete("/delete-date", isAuth , hasPermission(['attendance_management']),async (req, res) => {
    try {
        const { name, date } = req.body;
        const formattedDate = moment.tz(date, "YYYY-MM-DD", "Asia/Dubai").unix();

        const holiday = await Holiday.findOne({ name });

        if (!holiday) {
            return res.status(404).json({ message: "Holiday not found" });
        }

        holiday.dates = holiday.dates.filter(d => d !== formattedDate);

        if (holiday.dates.length === 0) {
            await holiday.deleteOne();
        } else {
            await holiday.save();
        }

        res.status(200).json({ message: "Date removed from holiday", holiday });
    } catch (error) {
        console.error("Error deleting holiday date:", error);
        res.status(500).json({ message: "Error deleting holiday date", error: error.message });
    }
});

module.exports = router;
