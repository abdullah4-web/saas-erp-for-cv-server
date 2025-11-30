const express = require("express");
const axios = require("axios");
const Attendance = require("../models/attendenceModel");
const moment = require("moment-timezone");
const User = require("../models/userModel");
const router = express.Router();
const mongoose = require('mongoose');
const holidayModel = require("../models/holidayModel");
const shiftsModel = require("../models/shiftsModel");
const leaveModel = require("../models/leaveModel");
const { isAuth } = require("../utils");
const hasPermission = require("../hasPermission");
const AUTH_URL = "http://172.16.20.3:8081/jwt-api-token-auth/";
const ATTENDANCE_URL = "http://172.16.20.3:8081/iclock/api/transactions/";
const CREDENTIALS = { username: "kamal", password: "Jovera@2022" };
// Helper function to get date ranges
const getDateRange = (type) => {
    const now = new Date();
    let start, end;

    switch (type) {
        case "today":
            start = new Date(now.setHours(0, 0, 0, 0));
            end = new Date(now.setHours(23, 59, 59, 999));
            break;
        case "yesterday":
            start = new Date(now.setDate(now.getDate() - 1));
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setHours(23, 59, 59, 999);
            break;
        case "this_week":
            start = new Date(now.setDate(now.getDate() - now.getDay()));
            start.setHours(0, 0, 0, 0);
            end = new Date();
            break;
        case "this_month":
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
        default:
            start = null;
            end = null;
    }
    return { start, end };
};
// ✅ Simple time-based check-in/out logic
function assignSimpleCheckStatus(punchTime) {
    const time = moment(punchTime, 'YYYY-MM-DD HH:mm:ss');

    // If punch is 13:00 (1 PM) or later → check-out
    if (time.hour() >= 13) {
        return 'check-out';
    } else {
        return 'check-in';
    }
}
router.post('/process-single', async (req, res) => {
    try {
        const records = await Attendance.find({ process_status: false }).populate('user');
        const grouped = {};

        records.forEach(record => {
            const dateKey = new Date(record.Date).toISOString().split('T')[0];
            const userId = record.user._id.toString();
            const key = `${userId}_${dateKey}`;

            if (!grouped[key]) {
                grouped[key] = {
                    user: record.user,
                    date: dateKey,
                    check_in_time: null,
                    check_out_time: null,
                    check_in_status: 'Missing Check-in',
                    check_out_status: 'Missing Check-out',
                    raw_ids: []
                };
            }

            grouped[key].raw_ids.push(record._id);

            if (record.status === 'check-in') {
                grouped[key].check_in_time = record.punch_time;
                grouped[key].check_in_status = record.checkstatus || 'check-in';
            } else if (record.status === 'check-out') {
                grouped[key].check_out_time = record.punch_time;
                grouped[key].check_out_status = record.checkstatus || 'check-out';
            }
        });

        const processedData = Object.values(grouped);

        for (const entry of processedData) {
            const user = entry.user;
            const shift = user?.shifts?.length > 0 ? user.shifts[0] : null;

            // Set check-out status based on check-in status
            if (entry.check_in_status === 'absent') {
                entry.check_out_status = 'absent';
            } else if (entry.check_in_status === 'weekend') {
                entry.check_out_status = 'weekend';
            } else if (entry.check_in_status === 'holiday') {
                entry.check_out_status = 'holiday';
            } else if (entry.check_in_status === 'leave') {
                entry.check_out_status = 'leave';
            }

            await Attendance.create({
                user: user._id,
                shift: shift,
                Date: entry.date,
                check_in_time: entry.check_in_time,
                check_out_time: entry.check_out_time,
                check_in_status: entry.check_in_status,
                check_out_status: entry.check_out_status,
                process_status: true,
            });

            await Attendance.deleteMany({ _id: { $in: entry.raw_ids } });
        }

        res.status(201).json({ message: 'Attendance processed successfully', total: processedData.length });
    } catch (error) {
        console.error('Error processing attendance:', error);
        res.status(500).json({ error: 'Failed to process attendance' });
    }
});
// ✅ Route: Process all attendances with simple logic
router.put("/process-all", async (req, res) => {
    try {
        const attendances = await Attendance.find({ process_status: false }).lean(); // Fetch all attendances

        const updatePromises = attendances.map(async (att) => {
            const status = assignSimpleCheckStatus(att.punch_time);

            return Attendance.findByIdAndUpdate(att._id, { status }, { new: true });
        });

        const updatedAttendances = await Promise.all(updatePromises);

        res.status(200).json({
            message: `Processed ${updatedAttendances.length} attendances using simple time logic.`,
            updated: updatedAttendances
        });
    } catch (error) {
        console.error("Error processing attendances:", error);
        res.status(500).json({ error: "Failed to process attendances" });
    }
}); 
// Update attendance by ID
router.put('/update-attendance/:attendanceId', isAuth, hasPermission(['attendance_management']), async (req, res) => {
    const { attendanceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(attendanceId)) {
        return res.status(400).json({ error: "Invalid attendance ID format" });
    }

    try {
        // Fetch attendance with shift details
        const attendance = await Attendance.findById(attendanceId).populate('shift');

        if (!attendance) {
            return res.status(404).json({ error: "Attendance record not found" });
        }

        // Apply incoming changes
        const { check_in_time, check_out_time } = { ...attendance.toObject(), ...req.body };

        // Determine the weekday
        const date = new Date(attendance.Date);
        const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });

        const schedule = attendance.shift?.schedule?.[weekday];

        let check_in_status = 'Missing Check-in';
        let check_out_status = 'Missing Check-out';

        if (schedule) {
            // Parse shift times
            const shiftStart = moment(`${moment(date).format('YYYY-MM-DD')} ${schedule.startTime}`, 'YYYY-MM-DD HH:mm');
            const shiftEnd = moment(`${moment(date).format('YYYY-MM-DD')} ${schedule.endTime}`, 'YYYY-MM-DD HH:mm');

            if (check_in_time) {
                const actualIn = moment(check_in_time);
                const diffInSeconds = actualIn.diff(shiftStart, 'seconds');
                check_in_status = diffInSeconds > 659 ? 'Late' : 'Present'; // 10 min 59 sec
            }

            if (check_out_time) {
                const actualOut = moment(check_out_time);
                const diffOutSeconds = shiftEnd.diff(actualOut, 'seconds');
                check_out_status = diffOutSeconds > 1800 ? 'Early-checkout' : 'check-out'; // 30 minutes = 1800 seconds
            }
        }

        // Update the attendance document
        const updatedAttendance = await Attendance.findByIdAndUpdate(
            attendanceId,
            {
                $set: {
                    ...req.body,
                    check_in_status,
                    check_out_status,
                }
            },
            { new: true, runValidators: true }
        );

        res.status(200).json(updatedAttendance);
    } catch (error) {
        console.error("Error updating attendance:", error);
        res.status(500).json({ error: "Server error", details: error.message });
    }
});
router.put('/update-multiple-attendances', isAuth, hasPermission(['attendance_management']), async (req, res) => {
    const { attendanceIds, check_in_time, check_out_time } = req.body;

    if (!Array.isArray(attendanceIds) || attendanceIds.length === 0) {
        return res.status(400).json({ error: "attendanceIds must be a non-empty array" });
    }

    const invalidIds = attendanceIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
        return res.status(400).json({ error: "One or more invalid attendance ID(s)", invalidIds });
    }

    try {
        const attendances = await Attendance.find({ _id: { $in: attendanceIds } }).populate('shift');
        if (attendances.length === 0) {
            return res.status(404).json({ error: "No attendance records found for provided IDs" });
        }

        const updates = attendances.map(async (attendance) => {
            const date = new Date(attendance.Date);
            const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
            const schedule = attendance.shift?.schedule?.[weekday];

            let check_in_status = 'Missing Check-in';
            let check_out_status = 'Missing Check-out';

            if (schedule) {
                const shiftStart = moment(`${moment(date).format('YYYY-MM-DD')} ${schedule.startTime}`, 'YYYY-MM-DD HH:mm');
                const shiftEnd = moment(`${moment(date).format('YYYY-MM-DD')} ${schedule.endTime}`, 'YYYY-MM-DD HH:mm');

                if (check_in_time) {
                    const actualIn = moment(check_in_time);
                    const diffInSeconds = actualIn.diff(shiftStart, 'seconds');
                    check_in_status = diffInSeconds > 659 ? 'Late' : 'Present'; // 10 min 59 sec = 659 seconds
                }

                if (check_out_time) {
                    const actualOut = moment(check_out_time);
                    const diffOutSeconds = shiftEnd.diff(actualOut, 'seconds');
                    check_out_status = diffOutSeconds > 1800 ? 'Early-checkout' : 'check-out'; // 30 min = 1800 seconds
                }
            }

            return Attendance.findByIdAndUpdate(
                attendance._id,
                {
                    $set: {
                        check_in_time,
                        check_out_time,
                        check_in_status,
                        check_out_status,
                    }
                },
                { new: true, runValidators: true }
            );
        });

        const updatedAttendances = await Promise.all(updates);

        res.status(200).json({ message: "Attendances updated successfully", data: updatedAttendances });
    } catch (error) {
        console.error("Error updating multiple attendance records:", error);
        res.status(500).json({ error: "Server error", details: error.message });
    }
});
router.put('/update-multiple-attendance-status', isAuth, hasPermission(['attendance_management']), async (req, res) => {
    const { attendanceIds, check_in_status, check_out_status } = req.body;

    if (!Array.isArray(attendanceIds) || attendanceIds.length === 0) {
        return res.status(400).json({ error: "attendanceIds must be a non-empty array" });
    }

    const invalidIds = attendanceIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
        return res.status(400).json({ error: "One or more invalid attendance ID(s)", invalidIds });
    }

    try {
        const attendances = await Attendance.find({ _id: { $in: attendanceIds } });

        if (attendances.length === 0) {
            return res.status(404).json({ error: "No attendance records found for provided IDs" });
        }

        const updates = attendances.map(attendance => {
            return Attendance.findByIdAndUpdate(
                attendance._id,
                {
                    $set: {
                        ...(check_in_status && { check_in_status }),
                        ...(check_out_status && { check_out_status })
                    }
                },
                { new: true, runValidators: true }
            );
        });

        const updatedAttendances = await Promise.all(updates);

        res.status(200).json({ message: "Statuses updated successfully", data: updatedAttendances });
    } catch (error) {
        console.error("Error updating multiple attendance statuses:", error);
        res.status(500).json({ error: "Server error", details: error.message });
    }
});
router.get('/process-attendance', async (req, res) => {
    try {
        const timeZone = "Asia/Dubai";
        const startDate = req.query.startDate || moment().tz(timeZone).startOf('month').format('YYYY-MM-DD');
        const endDate = req.query.endDate || moment().tz(timeZone).format('YYYY-MM-DD');

        // Get all raw punch data within the date range
        const rawAttendance = await Attendance.find({
            Date: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            },
            process_status: false

        }).sort({
            user: 1,
            Date: 1,
            punch_time: 1
        });

        // Group punches by user and date
        const groupedAttendance = {};
        rawAttendance.forEach(record => {
            const userDateKey = `${record.user}_${moment(record.Date).format('YYYY-MM-DD')}`;

            if (!groupedAttendance[userDateKey]) {
                groupedAttendance[userDateKey] = {
                    user: record.user,
                    date: record.Date,
                    punches: []
                };
            }

            groupedAttendance[userDateKey].punches.push(record);
        });

        // Process each user's daily punches
        const processedRecords = [];
        const recordsToDelete = [];

        for (const key in groupedAttendance) {
            const { user, date, punches } = groupedAttendance[key];

            // Sort punches by time
            punches.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

            // Create check-in record (first punch of the day)
            const checkInRecord = {
                ...punches[0].toObject(),
                status: 'check-in',
            };
            delete checkInRecord._id;

            processedRecords.push(checkInRecord);

            // If more than one punch exists, create a check-out record (last punch of the day)
            if (punches.length > 1) {
                const checkOutRecord = {
                    ...punches[punches.length - 1].toObject(),
                    status: 'check-out',
                };
                delete checkOutRecord._id;
                processedRecords.push(checkOutRecord);
            }

            // Mark all original punches for deletion
            punches.forEach(punch => {
                recordsToDelete.push(punch._id);
            });
        }

        // Perform operations without transaction (for standalone MongoDB)
        if (recordsToDelete.length > 0) {
            await Attendance.deleteMany({
                _id: { $in: recordsToDelete }
            });
        }

        if (processedRecords.length > 0) {
            await Attendance.insertMany(processedRecords);
        }

        res.status(200).json({
            message: 'Attendance processing completed',
            punchesDeleted: recordsToDelete.length,
            recordsCreated: processedRecords.length,
        });

    } catch (error) {
        console.error('Error processing attendance:', error);
        res.status(500).json({
            message: 'Error processing attendance',
            error: error.message
        });
    }
});
router.get("/attendance-summary-by-user/:userId?", async (req, res) => {
    try {
        const { userId } = req.params;
        const populateOptions = [
            {
                path: "user",
                select: "name department areas",
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            }
        ];

        const query = userId ? { user: userId } : {};

        // Fetch all attendance records
        const records = await Attendance.find(query).populate(populateOptions);

        // Group by month
        const groupedByMonth = {};

        records.forEach(record => {
            const monthKey = moment(record.Date).format("YYYY-MM"); // e.g. "2024-04"
            if (!groupedByMonth[monthKey]) {
                groupedByMonth[monthKey] = [];
            }
            groupedByMonth[monthKey].push(record);
        });

        // Convert to structured summary
        const summary = Object.entries(groupedByMonth).map(([month, recs]) => ({
            month,
            count: recs.length,
            records: recs
        }));

        res.status(200).json({
            summary
        });
    } catch (error) {
        console.error("Error fetching attendance summary:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});
router.get("/attendance-summary", async (req, res) => {
    try {
        const populateOptions = [
            {
                path: "user",
                match: { labour_card_status: "Active" },
                select: "name department areas shift",
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            }
        ];

        const allTime = (await Attendance.find().populate(populateOptions)).filter(a => a.user !== null);

        const { start: todayStart, end: todayEnd } = getDateRange("today");
        const today = (await Attendance.find({ Date: { $gte: todayStart, $lte: todayEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        const { start: yesterdayStart, end: yesterdayEnd } = getDateRange("yesterday");
        const yesterday = (await Attendance.find({ Date: { $gte: yesterdayStart, $lte: yesterdayEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        const { start: weekStart, end: weekEnd } = getDateRange("this_week");
        const thisWeek = (await Attendance.find({ Date: { $gte: weekStart, $lte: weekEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        const { start: monthStart, end: monthEnd } = getDateRange("this_month");
        const thisMonth = (await Attendance.find({ Date: { $gte: monthStart, $lte: monthEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        res.status(200).json({
            allTime: { count: allTime.length, records: allTime },
            // today: { count: today.length, records: today },
            yesterday: { count: yesterday.length, records: yesterday },
            thisWeek: { count: thisWeek.length, records: thisWeek },
            thisMonth: { count: thisMonth.length, records: thisMonth },
        });
    } catch (error) {
        console.error("Error fetching attendance summary:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

router.get("/attendance-summary-with-no-lb", async (req, res) => {
    try {
        const populateOptions = [
            {
                path: "user",
                match: { labour_card_status: "Unactive" },
                select: "name department areas shift",
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            }
        ];

        const allTime = (await Attendance.find().populate(populateOptions)).filter(a => a.user !== null);

        const { start: todayStart, end: todayEnd } = getDateRange("today");
        const today = (await Attendance.find({ Date: { $gte: todayStart, $lte: todayEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        const { start: yesterdayStart, end: yesterdayEnd } = getDateRange("yesterday");
        const yesterday = (await Attendance.find({ Date: { $gte: yesterdayStart, $lte: yesterdayEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        const { start: weekStart, end: weekEnd } = getDateRange("this_week");
        const thisWeek = (await Attendance.find({ Date: { $gte: weekStart, $lte: weekEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        const { start: monthStart, end: monthEnd } = getDateRange("this_month");
        const thisMonth = (await Attendance.find({ Date: { $gte: monthStart, $lte: monthEnd } })
            .populate(populateOptions)).filter(a => a.user !== null);

        res.status(200).json({
            allTime: { count: allTime.length, records: allTime },
            // today: { count: today.length, records: today },
            yesterday: { count: yesterday.length, records: yesterday },
            thisWeek: { count: thisWeek.length, records: thisWeek },
            thisMonth: { count: thisMonth.length, records: thisMonth },
        });
    } catch (error) {
        console.error("Error fetching attendance summary:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});




router.get("/missing-checks", async (req, res) => {
    try {
        const populateOptions = [
            {
                path: "user",
                select: "name department areas labour_card_status", // include labour_card_status
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            }
        ];

        const missingCheckInsOrOuts = await Attendance.find({
            $or: [
                { check_in_status: "Missing Check-in" },
                { check_out_status: "Missing Check-out" }
            ]
        }).populate(populateOptions);

        // Filter out records where user.labour_card_status !== 'Active'
        const filteredRecords = missingCheckInsOrOuts.filter(record =>
            record.user && record.user.labour_card_status === "Active"
        );

        res.status(200).json({
            count: filteredRecords.length,
            records: filteredRecords
        });
    } catch (error) {
        console.error("Error fetching missing check-in/check-out records:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

router.get("/missing-checks-with-no-lb", async (req, res) => {
    try {
        const populateOptions = [
            {
                path: "user",
                select: "name department areas labour_card_status", // include labour_card_status
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            }
        ];

        const missingCheckInsOrOuts = await Attendance.find({
            $or: [
                { check_in_status: "Missing Check-in" },
                { check_out_status: "Missing Check-out" }
            ]
        }).populate(populateOptions);

        // Filter out records where user.labour_card_status !== 'Active'
        const filteredRecords = missingCheckInsOrOuts.filter(record =>
            record.user && record.user.labour_card_status === "Unactive"
        );

        res.status(200).json({
            count: filteredRecords.length,
            records: filteredRecords
        });
    } catch (error) {
        console.error("Error fetching missing check-in/check-out records:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});



router.get("/absent-summary", async (req, res) => {
    try {
      const populateOptions = [
        {
          path: "user",
          select: "name department areas emp_code",
          match: { labour_card_status: "Active" },
          populate: [
            {
              path: "department",
              select: "name",
            },
            {
              path: "areas",
              select: "name",
            },
          ],
        },
      ];
  
      // Helper to filter out attendance with null users
      const filterValidUsers = (records) => records.filter(record => record.user !== null);
  
      const allTimeRaw = await Attendance.find({ check_in_status: "absent" }).populate(populateOptions);
      const allTime = filterValidUsers(allTimeRaw);
  
      const { start: todayStart, end: todayEnd } = getDateRange("today");
      const todayRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: todayStart, $lte: todayEnd },
      }).populate(populateOptions);
      const today = filterValidUsers(todayRaw);
  
      const { start: yesterdayStart, end: yesterdayEnd } = getDateRange("yesterday");
      const yesterdayRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: yesterdayStart, $lte: yesterdayEnd },
      }).populate(populateOptions);
      const yesterday = filterValidUsers(yesterdayRaw);
  
      const { start: weekStart, end: weekEnd } = getDateRange("this_week");
      const thisWeekRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: weekStart, $lte: weekEnd },
      }).populate(populateOptions);
      const thisWeek = filterValidUsers(thisWeekRaw);
  
      const { start: monthStart, end: monthEnd } = getDateRange("this_month");
      const thisMonthRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: monthStart, $lte: monthEnd },
      }).populate(populateOptions);
      const thisMonth = filterValidUsers(thisMonthRaw);
  
      res.status(200).json({
        allTime: { count: allTime.length, records: allTime },
        today: { count: today.length, records: today },
        yesterday: { count: yesterday.length, records: yesterday },
        thisWeek: { count: thisWeek.length, records: thisWeek },
        thisMonth: { count: thisMonth.length, records: thisMonth },
      });
    } catch (error) {
      console.error("Error fetching absent attendance summary:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });

  router.get("/absent-summary-with-no-lb", async (req, res) => {
    try {
      const populateOptions = [
        {
          path: "user",
          select: "name department areas emp_code",
          match: { labour_card_status: "Unactive" },
          populate: [
            {
              path: "department",
              select: "name",
            },
            {
              path: "areas",
              select: "name",
            },
          ],
        },
      ];
  
      // Helper to filter out attendance with null users
      const filterValidUsers = (records) => records.filter(record => record.user !== null);
  
      const allTimeRaw = await Attendance.find({ check_in_status: "absent" }).populate(populateOptions);
      const allTime = filterValidUsers(allTimeRaw);
  
      const { start: todayStart, end: todayEnd } = getDateRange("today");
      const todayRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: todayStart, $lte: todayEnd },
      }).populate(populateOptions);
      const today = filterValidUsers(todayRaw);
  
      const { start: yesterdayStart, end: yesterdayEnd } = getDateRange("yesterday");
      const yesterdayRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: yesterdayStart, $lte: yesterdayEnd },
      }).populate(populateOptions);
      const yesterday = filterValidUsers(yesterdayRaw);
  
      const { start: weekStart, end: weekEnd } = getDateRange("this_week");
      const thisWeekRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: weekStart, $lte: weekEnd },
      }).populate(populateOptions);
      const thisWeek = filterValidUsers(thisWeekRaw);
  
      const { start: monthStart, end: monthEnd } = getDateRange("this_month");
      const thisMonthRaw = await Attendance.find({
        check_in_status: "absent",
        Date: { $gte: monthStart, $lte: monthEnd },
      }).populate(populateOptions);
      const thisMonth = filterValidUsers(thisMonthRaw);
  
      res.status(200).json({
        allTime: { count: allTime.length, records: allTime },
        today: { count: today.length, records: today },
        yesterday: { count: yesterday.length, records: yesterday },
        thisWeek: { count: thisWeek.length, records: thisWeek },
        thisMonth: { count: thisMonth.length, records: thisMonth },
      });
    } catch (error) {
      console.error("Error fetching absent attendance summary:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
router.get("/late-summary", async (req, res) => {
    try {
        const populateOptions = [
            {
                path: "user",
                match: { labour_card_status: "Active" }, 
                select: "name department areas",
                populate: [
                    {
                        path: "department",
                        select: "name",
                    },
                    {
                        path: "areas",
                        select: "name",
                    }
                ]
            }
        ];

        const allTime = (await Attendance.find({ check_in_status: "Late" })
            .populate(populateOptions)).filter(a => a.user !== null);

        const { start: todayStart, end: todayEnd } = getDateRange("today");
        const today = (await Attendance.find({
            check_in_status: "Late",
            Date: { $gte: todayStart, $lte: todayEnd }
        }).populate(populateOptions)).filter(a => a.user !== null);

        const { start: yesterdayStart, end: yesterdayEnd } = getDateRange("yesterday");
        const yesterday = (await Attendance.find({
            check_in_status: "Late",
            Date: { $gte: yesterdayStart, $lte: yesterdayEnd }
        }).populate(populateOptions)).filter(a => a.user !== null);

        const { start: weekStart, end: weekEnd } = getDateRange("this_week");
        const thisWeek = (await Attendance.find({
            check_in_status: "Late",
            Date: { $gte: weekStart, $lte: weekEnd }
        }).populate(populateOptions)).filter(a => a.user !== null);

        const { start: monthStart, end: monthEnd } = getDateRange("this_month");
        const thisMonth = (await Attendance.find({
            check_in_status: "Late",
            Date: { $gte: monthStart, $lte: monthEnd }
        }).populate(populateOptions)).filter(a => a.user !== null);

        res.status(200).json({
            allTime: { count: allTime.length, records: allTime },
            // today: { count: today.length, records: today },
            yesterday: { count: yesterday.length, records: yesterday },
            thisWeek: { count: thisWeek.length, records: thisWeek },
            thisMonth: { count: thisMonth.length, records: thisMonth },
        });
    } catch (error) {
        console.error("Error fetching late summary:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Function to get authentication token
const getAuthToken = async () => {
    try {
        const response = await axios.post(AUTH_URL, CREDENTIALS);
        return response.data.token;
    } catch (error) {
        console.error("Error fetching authentication token:", error);
        throw new Error("Failed to retrieve authentication token");
    }
};

router.get("/sync-bulk", async (req, res) => {
    try {
        const token = await getAuthToken();
        const timeZone = "Asia/Dubai";
        const bulkStartDate = "2025-04-01"; // Start date for bulk data retrieval

        const now = moment().tz(timeZone);
        const currentTime = now.format("HH:mm:ss");
        const date = now.format("YYYY-MM-DD");

        const start_time = moment.tz(bulkStartDate, timeZone).startOf("day").format("YYYY-MM-DD HH:mm:ss");
        const end_time = now.endOf("day").format(`YYYY-MM-DD ${currentTime}`);

        let apiUrl = `${ATTENDANCE_URL}?start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}`;
        console.log("API URL:", apiUrl);

        let totalRecordsSynced = 0;
        let attendanceRecords = [];

        // 1️⃣ PRE-FETCH EXISTING DATA FOR DEDUPLICATION
        const existingPunches = new Set();
        const existingAttendance = await Attendance.find({
            Date: {
                $gte: new Date(bulkStartDate),
                $lte: new Date(date)
            }
        }).select('transaction_id user Date').lean();

        // Create a map to track user-date combinations that have punches
        const userDateHasPunches = new Map();

        existingAttendance.forEach(record => {
            existingPunches.add(record.transaction_id);

            // Track if user has any punches for this date
            const dateKey = moment(record.Date).format('YYYY-MM-DD');
            const userDateKey = `${record.user}_${dateKey}`;

            // Only mark as having punches if it's an actual punch record (not holiday/weekend/absent)
            if (record.transaction_id.startsWith('PUNCH-')) {
                userDateHasPunches.set(userDateKey, true);
            }
        });

        // 2️⃣ PROCESS ALL ATTENDANCE PUNCHES FROM API
        while (apiUrl) {
            const response = await axios.get(apiUrl, {
                headers: { Authorization: `JWT ${token}` }
            });

            const punchData = response.data;
            if (!punchData || !Array.isArray(punchData.data) || punchData.data.length === 0) break;

            for (const punch of punchData.data) {
                const transaction_id = `PUNCH-${punch.id}`;

                // Skip if we already have this punch
                if (existingPunches.has(transaction_id)) continue;

                const punchTime = moment.tz(punch.punch_time, "YYYY-MM-DD HH:mm:ss", timeZone);
                const punchDate = punchTime.format("YYYY-MM-DD");
                const punchDay = punchTime.format("dddd");

                // Find user and their shifts
                const user = await User.findOne({ emp_code: punch.emp_code }).populate("shifts");
                if (!user) continue;

                // Track that this user has a punch for this date
                const userDateKey = `${user._id}_${punchDate}`;
                userDateHasPunches.set(userDateKey, true);

                // Determine shift for this punch
                let shift = null;
                let isWeekend = false;

                if (user.shifts && user.shifts.length > 0) {
                    for (const userShift of user.shifts) {
                        const shiftTimings = userShift.schedule[punchDay];
                        if (!shiftTimings) continue;

                        if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                            isWeekend = true;
                            break;
                        }

                        shift = userShift;
                        break;
                    }
                }

                // Store the punch record
                attendanceRecords.push({
                    transaction_id,
                    user: user._id,
                    emp_id: punch.emp,
                    emp_code: punch.emp_code,
                    first_name: punch.first_name,
                    last_name: punch.last_name,
                    department: punch.department,
                    position: punch.position,
                    punch_time: punch.punch_time,
                    verify_type: punch.verify_type_display,
                    terminal_alias: punch.terminal_alias,
                    upload_time: punch.upload_time,
                    status: 'punch',
                    shift: shift ? shift._id : null,
                    Date: punchDate,
                    isWeekend: isWeekend
                });

                // Batch insert every 100 records to avoid memory issues
                if (attendanceRecords.length >= 100) {
                    await Attendance.insertMany(attendanceRecords);
                    totalRecordsSynced += attendanceRecords.length;
                    attendanceRecords = []; // Reset the array
                }
            }

            apiUrl = punchData.next || null;
        }

        // 3️⃣ HANDLE WEEKEND, HOLIDAY, AND ABSENT ATTENDANCE
        const allUsers = await User.find({ resigned: false , delstatus:false}).populate("shifts").populate("department");
        const datesToProcess = getDatesBetween(new Date(bulkStartDate), new Date(date));

        // Pre-fetch all holidays for the date range
        const holidays = await holidayModel.find({
            dates: { $in: datesToProcess }
        });

        // Create a map of dates to holiday names
        const holidayMap = new Map();
        holidays.forEach(holiday => {
            holiday.dates.forEach(date => {
                holidayMap.set(date, holiday.name);
            });
        });

        for (const processDate of datesToProcess) {
            const dateStr = moment(processDate).format('YYYY-MM-DD');
            const processDay = moment.tz(processDate, timeZone).format("dddd");
            const isHoliday = holidayMap.has(dateStr);

            for (const user of allUsers) {
                const userDateKey = `${user._id}_${dateStr}`;

                // Skip if user has punches for this date
                if (userDateHasPunches.has(userDateKey)) {
                    continue;
                }

                // Skip if we already have a holiday/weekend/absent record for this user+date
                if (existingPunches.has(`HOLIDAY-${user._id}-${dateStr}`) ||
                    existingPunches.has(`WEEKEND-${user._id}-${dateStr}`) ||
                    existingPunches.has(`ABSENT-${user._id}-${dateStr}`)) {
                    continue;
                }

                // ❌ Skip users with no shift assigned (empty array or undefined)
                if (!user.shifts || user.shifts.length === 0) {
                    continue;
                }

                let hasWeekendShift = false;
                let hasWorkingShift = false;

                // Check user's shifts for this day
                for (const shift of user.shifts) {
                    const shiftTimings = shift.schedule[processDay];

                    if (!shiftTimings) continue;

                    if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                        hasWeekendShift = true;
                    } else {
                        hasWorkingShift = true;
                    }
                }

                // If it's a holiday
                if (isHoliday) {
                    attendanceRecords.push({
                        transaction_id: `HOLIDAY-${user._id}-${dateStr}`,
                        user: user._id,
                        emp_id: user.emp_id,
                        emp_code: user.emp_code,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        department: user.department.name,
                        position: user.position,
                        punch_time: null,
                        verify_type: null,
                        terminal_alias: null,
                        upload_time: null,
                        checkstatus: "holiday",
                        holidayName: holidayMap.get(dateStr),
                        shift: null,
                        Date: dateStr
                    });
                }
                // If it's a weekend day according to shift schedule
                else if (hasWeekendShift) {
                    attendanceRecords.push({
                        transaction_id: `WEEKEND-${user._id}-${dateStr}`,
                        user: user._id,
                        emp_id: user.emp_id,
                        emp_code: user.emp_code,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        department: user.department.name,
                        position: user.position,
                        punch_time: null,
                        verify_type: null,
                        terminal_alias: null,
                        upload_time: null,
                        checkstatus: "weekend",
                        shift: null,
                        Date: dateStr
                    });
                }
                // If it's a working day but no attendance found
                else if (hasWorkingShift) {
                    attendanceRecords.push({
                        transaction_id: `ABSENT-${user._id}-${dateStr}`,
                        user: user._id,
                        emp_id: user.emp_id,
                        emp_code: user.emp_code,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        department: user.department.name,
                        position: user.position,
                        punch_time: null,
                        verify_type: null,
                        terminal_alias: null,
                        upload_time: null,
                        checkstatus: "absent",
                        shift: null,
                        Date: dateStr
                    });
                }

                // Batch insert every 100 records to avoid memory issues
                if (attendanceRecords.length >= 100) {
                    await Attendance.insertMany(attendanceRecords);
                    totalRecordsSynced += attendanceRecords.length;
                    attendanceRecords = []; // Reset the array
                }
            }

        }

        // 4️⃣ INSERT ANY REMAINING ATTENDANCE RECORDS
        if (attendanceRecords.length > 0) {
            await Attendance.insertMany(attendanceRecords);
            totalRecordsSynced += attendanceRecords.length;
        }

        res.status(200).json({
            message: `Attendance data from ${bulkStartDate} to ${date} synced successfully`,
            count: totalRecordsSynced
        });
    } catch (error) {
        console.error("Error syncing attendance data:", error);
        res.status(500).json({ message: "Error syncing attendance data", error: error.message });
    }
});
router.get("/sync-today-now", async (req, res) => {
    try {
        const token = await getAuthToken();
        const timeZone = "Asia/Dubai";

        const now = moment().tz(timeZone);
        const currentTime = now.format("HH:mm:ss");
        const date = now.format("YYYY-MM-DD");
        const dateObj = new Date(date); // For leave date comparison

        const start_time = now.startOf("day").format("YYYY-MM-DD HH:mm:ss");
        const end_time = now.endOf("day").format(`YYYY-MM-DD ${currentTime}`);

        let apiUrl = `${ATTENDANCE_URL}?start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}`;
        console.log("API URL:", apiUrl);

        let totalRecordsSynced = 0;
        let attendanceRecords = [];

        // 1️⃣ PRE-FETCH EXISTING DATA FOR DEDUPLICATION
        const existingPunches = new Set();
        const existingAttendance = await Attendance.find({
            Date: date
        }).select('transaction_id user Date').lean();

        // Create a map to track user-date combinations that have punches
        const userDateHasPunches = new Map();

        existingAttendance.forEach(record => {
            existingPunches.add(record.transaction_id);

            // Track if user has any punches for this date
            const userDateKey = `${record.user}_${date}`;

            // Only mark as having punches if it's an actual punch record (not holiday/weekend/absent/leave)
            if (record.transaction_id.startsWith('PUNCH-')) {
                userDateHasPunches.set(userDateKey, true);
            }
        });

        // 2️⃣ PROCESS TODAY'S ATTENDANCE PUNCHES FROM API
        while (apiUrl) {
            const response = await axios.get(apiUrl, {
                headers: { Authorization: `JWT ${token}` }
            });

            const punchData = response.data;
            if (!punchData || !Array.isArray(punchData.data) || punchData.data.length === 0) break;

            for (const punch of punchData.data) {
                const transaction_id = `PUNCH-${punch.id}`;

                // Skip if we already have this punch
                if (existingPunches.has(transaction_id)) continue;

                const punchTime = moment.tz(punch.punch_time, "YYYY-MM-DD HH:mm:ss", timeZone);
                const punchDate = punchTime.format("YYYY-MM-DD");
                const punchDay = punchTime.format("dddd");

                // Find user and their shifts
                const user = await User.findOne({ emp_code: punch.emp_code }).populate("shifts");
                if (!user) continue;

                // Track that this user has a punch for this date
                const userDateKey = `${user._id}_${punchDate}`;
                userDateHasPunches.set(userDateKey, true);

                // Determine shift for this punch
                let shift = null;
                let isWeekend = false;

                if (user.shifts && user.shifts.length > 0) {
                    for (const userShift of user.shifts) {
                        const shiftTimings = userShift.schedule[punchDay];
                        if (!shiftTimings) continue;

                        if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                            isWeekend = true;
                            break;
                        }

                        shift = userShift;
                        break;
                    }
                }

                // Store the punch record
                attendanceRecords.push({
                    transaction_id,
                    user: user._id,
                    emp_id: punch.emp,
                    emp_code: punch.emp_code,
                    first_name: punch.first_name,
                    last_name: punch.last_name,
                    department: punch.department,
                    position: punch.position,
                    punch_time: punch.punch_time,
                    verify_type: punch.verify_type_display,
                    terminal_alias: punch.terminal_alias,
                    upload_time: punch.upload_time,
                    status: 'punch',
                    shift: shift ? shift._id : null,
                    Date: punchDate,
                    isWeekend: isWeekend
                });

                // Batch insert every 100 records to avoid memory issues
                if (attendanceRecords.length >= 100) {
                    await Attendance.insertMany(attendanceRecords);
                    totalRecordsSynced += attendanceRecords.length;
                    attendanceRecords = []; // Reset the array
                }
            }

            apiUrl = punchData.next || null;
        }

        // 3️⃣ HANDLE TODAY'S WEEKEND, HOLIDAY, LEAVE, AND ABSENT ATTENDANCE
        const allUsers = await User.find().populate("shifts").populate("department");

        // Check if today is a holiday
        const isHoliday = await holidayModel.findOne({ dates: date });
        const todayDay = moment.tz(date, timeZone).format("dddd");

        // Pre-fetch all approved leaves for today to minimize DB queries
        const todayLeaves = await leaveModel.find({
            status: "Approved",
            start_date: { $lte: dateObj },
            end_date: { $gte: dateObj }
        }).lean();

        // Create a map of users on leave today for quick lookup
        const usersOnLeave = new Map();
        todayLeaves.forEach(leave => {
            usersOnLeave.set(leave.user.toString(), leave);
        });

        for (const user of allUsers) {
            const userDateKey = `${user._id}_${date}`;

            // Skip if user has punches for today
            if (userDateHasPunches.has(userDateKey)) {
                continue;
            }

            // Skip if we already have a holiday/weekend/leave/absent record for this user today
            if (existingPunches.has(`HOLIDAY-${user._id}-${date}`) ||
                existingPunches.has(`WEEKEND-${user._id}-${date}`) ||
                existingPunches.has(`LEAVE-${user._id}-${date}`) ||
                existingPunches.has(`ABSENT-${user._id}-${date}`)) {
                continue;
            }

            // Skip users with no shift assigned (empty array or undefined)
            if (!user.shifts || user.shifts.length === 0) {
                continue;
            }

            let hasWeekendShift = false;
            let hasWorkingShift = false;

            // Check user's shifts for today
            for (const shift of user.shifts) {
                const shiftTimings = shift.schedule[todayDay];

                if (!shiftTimings) continue;

                if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                    hasWeekendShift = true;
                } else {
                    hasWorkingShift = true;
                }
            }

            // Check if user is on approved leave
            const userLeave = usersOnLeave.get(user._id.toString());
            if (userLeave) {
                attendanceRecords.push({
                    transaction_id: `LEAVE-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "leave",
                    leave_type: userLeave.leave_type,
                    leave_reason: userLeave.reason,
                    shift: null,
                    Date: date
                });
            }
            // If today is a holiday
            else if (isHoliday) {
                attendanceRecords.push({
                    transaction_id: `HOLIDAY-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "holiday",
                    holidayName: isHoliday.name,
                    shift: null,
                    Date: date
                });
            }
            // If today is a weekend day according to shift schedule
            else if (hasWeekendShift) {
                attendanceRecords.push({
                    transaction_id: `WEEKEND-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "weekend",
                    shift: null,
                    Date: date
                });
            }
            // If today is a working day but no attendance found
            else if (hasWorkingShift) {
                attendanceRecords.push({
                    transaction_id: `ABSENT-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "absent",
                    shift: null,
                    Date: date
                });
            }

            // Batch insert every 100 records to avoid memory issues
            if (attendanceRecords.length >= 100) {
                await Attendance.insertMany(attendanceRecords);
                totalRecordsSynced += attendanceRecords.length;
                attendanceRecords = []; // Reset the array
            }
        }

        // 4️⃣ INSERT ANY REMAINING ATTENDANCE RECORDS
        if (attendanceRecords.length > 0) {
            await Attendance.insertMany(attendanceRecords);
            totalRecordsSynced += attendanceRecords.length;
        }

        res.status(200).json({
            message: `Today's (${date}) attendance data synced successfully`,
            count: totalRecordsSynced
        });
    } catch (error) {
        console.error("Error syncing today's attendance data:", error);
        res.status(500).json({ message: "Error syncing today's attendance data", error: error.message });
    }
});

router.get("/sync-yesterday", async (req, res) => {
    try {
        const token = await getAuthToken();
        const timeZone = "Asia/Dubai";

        // Get yesterday's date range
        const yesterday = moment().tz(timeZone).subtract(1, 'day');
        const date = yesterday.format("YYYY-MM-DD");
        const dateObj = new Date(date); // For leave date comparison

        // Full day range for yesterday (00:00:00 to 23:59:59)
        const start_time = yesterday.startOf("day").format("YYYY-MM-DD HH:mm:ss");
        const end_time = yesterday.endOf("day").format("YYYY-MM-DD HH:mm:ss");

        let apiUrl = `${ATTENDANCE_URL}?start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}`;
        console.log("API URL:", apiUrl);

        let totalRecordsSynced = 0;
        let attendanceRecords = [];

        // 1️⃣ PRE-FETCH EXISTING DATA FOR DEDUPLICATION
        const existingPunches = new Set();
        const existingAttendance = await Attendance.find({
            Date: date
        }).select('transaction_id user Date').lean();

        // Create a map to track user-date combinations that have punches
        const userDateHasPunches = new Map();

        existingAttendance.forEach(record => {
            existingPunches.add(record.transaction_id);

            // Track if user has any punches for this date
            const userDateKey = `${record.user}_${date}`;

            // Only mark as having punches if it's an actual punch record (not holiday/weekend/absent/leave)
            if (record.transaction_id.startsWith('PUNCH-')) {
                userDateHasPunches.set(userDateKey, true);
            }
        });

        // 2️⃣ PROCESS YESTERDAY'S ATTENDANCE PUNCHES FROM API
        while (apiUrl) {
            const response = await axios.get(apiUrl, {
                headers: { Authorization: `JWT ${token}` }
            });

            const punchData = response.data;
            if (!punchData || !Array.isArray(punchData.data) || punchData.data.length === 0) break;

            for (const punch of punchData.data) {
                const transaction_id = `PUNCH-${punch.id}`;

                // Skip if we already have this punch
                if (existingPunches.has(transaction_id)) continue;

                const punchTime = moment.tz(punch.punch_time, "YYYY-MM-DD HH:mm:ss", timeZone);
                const punchDate = punchTime.format("YYYY-MM-DD");
                const punchDay = punchTime.format("dddd");

                // Find user and their shifts
                const user = await User.findOne({ emp_code: punch.emp_code }).populate("shifts");
                if (!user) continue;

                // Track that this user has a punch for this date
                const userDateKey = `${user._id}_${punchDate}`;
                userDateHasPunches.set(userDateKey, true);

                // Determine shift for this punch
                let shift = null;
                let isWeekend = false;

                if (user.shifts && user.shifts.length > 0) {
                    for (const userShift of user.shifts) {
                        const shiftTimings = userShift.schedule[punchDay];
                        if (!shiftTimings) continue;

                        if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                            isWeekend = true;
                            break;
                        }

                        shift = userShift;
                        break;
                    }
                }

                // Store the punch record
                attendanceRecords.push({
                    transaction_id,
                    user: user._id,
                    emp_id: punch.emp,
                    emp_code: punch.emp_code,
                    first_name: punch.first_name,
                    last_name: punch.last_name,
                    department: punch.department,
                    position: punch.position,
                    punch_time: punch.punch_time,
                    verify_type: punch.verify_type_display,
                    terminal_alias: punch.terminal_alias,
                    upload_time: punch.upload_time,
                    status: 'punch',
                    shift: shift ? shift._id : null,
                    Date: punchDate,
                    isWeekend: isWeekend
                });

                // Batch insert every 100 records to avoid memory issues
                if (attendanceRecords.length >= 100) {
                    await Attendance.insertMany(attendanceRecords);
                    totalRecordsSynced += attendanceRecords.length;
                    attendanceRecords = []; // Reset the array
                }
            }

            apiUrl = punchData.next || null;
        }

        // 3️⃣ HANDLE YESTERDAY'S WEEKEND, HOLIDAY, LEAVE, AND ABSENT ATTENDANCE
        const allUsers = await User.find({ resigned: false , status : 'Active' , delstatus: false }).populate("shifts").populate("department");

        // Check if yesterday was a holiday
        const isHoliday = await holidayModel.findOne({ dates: date });
        const yesterdayDay = yesterday.format("dddd");

        // Pre-fetch all approved leaves for yesterday to minimize DB queries
        const yesterdayLeaves = await leaveModel.find({
            status: "Approved",
            start_date: { $lte: dateObj },
            end_date: { $gte: dateObj }
        }).lean();

        // Create a map of users on leave yesterday for quick lookup
        const usersOnLeave = new Map();
        yesterdayLeaves.forEach(leave => {
            usersOnLeave.set(leave.user.toString(), leave);
        });

        for (const user of allUsers) {
            const userDateKey = `${user._id}_${date}`;

            // Skip if user has punches for yesterday
            if (userDateHasPunches.has(userDateKey)) {
                continue;
            }

            // Skip if we already have a holiday/weekend/leave/absent record for this user yesterday
            if (existingPunches.has(`HOLIDAY-${user._id}-${date}`) ||
                existingPunches.has(`WEEKEND-${user._id}-${date}`) ||
                existingPunches.has(`LEAVE-${user._id}-${date}`) ||
                existingPunches.has(`ABSENT-${user._id}-${date}`)) {
                continue;
            }

            // Skip users with no shift assigned (empty array or undefined)
            if (!user.shifts || user.shifts.length === 0) {
                continue;
            }

            let hasWeekendShift = false;
            let hasWorkingShift = false;

            // Check user's shifts for yesterday
            for (const shift of user.shifts) {
                const shiftTimings = shift.schedule[yesterdayDay];

                if (!shiftTimings) continue;

                if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                    hasWeekendShift = true;
                } else {
                    hasWorkingShift = true;
                }
            }

            // Check if user was on approved leave yesterday
            const userLeave = usersOnLeave.get(user._id.toString());
            if (userLeave) {
                attendanceRecords.push({
                    transaction_id: `LEAVE-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "leave",
                    leave_type: userLeave.leave_type,
                    leave_reason: userLeave.reason,
                    shift: null,
                    Date: date
                });
            }
            // If yesterday was a holiday
            else if (isHoliday) {
                attendanceRecords.push({
                    transaction_id: `HOLIDAY-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "holiday",
                    holidayName: isHoliday.name,
                    shift: null,
                    Date: date
                });
            }
            // If yesterday was a weekend day according to shift schedule
            else if (hasWeekendShift) {
                attendanceRecords.push({
                    transaction_id: `WEEKEND-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "weekend",
                    shift: null,
                    Date: date
                });
            }
            // If yesterday was a working day but no attendance found
            else if (hasWorkingShift) {
                attendanceRecords.push({
                    transaction_id: `ABSENT-${user._id}-${date}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "absent",
                    shift: null,
                    Date: date
                });
            }

            // Batch insert every 100 records to avoid memory issues
            if (attendanceRecords.length >= 100) {
                await Attendance.insertMany(attendanceRecords);
                totalRecordsSynced += attendanceRecords.length;
                attendanceRecords = []; // Reset the array
            }
        }

        // 4️⃣ INSERT ANY REMAINING ATTENDANCE RECORDS
        if (attendanceRecords.length > 0) {
            await Attendance.insertMany(attendanceRecords);
            totalRecordsSynced += attendanceRecords.length;
        }

        res.status(200).json({
            message: `Yesterday's (${date}) attendance data synced successfully`,
            count: totalRecordsSynced
        });
    } catch (error) {
        console.error("Error syncing yesterday's attendance data:", error);
        res.status(500).json({ message: "Error syncing yesterday's attendance data", error: error.message });
    }
});

const EMPLOYEE_API_URL = "http://172.16.20.3:8081/personnel/api/employees/";
const WORK_START_TIME = "10:00:00"; 
const WORK_END_TIME = "17:00:00"; 

const LATE_THRESHOLD = 15; 

router.get("/sync-live-attendance", async (req, res) => {
    try {
        // Commented out the actual API integration code
        /*
        const token = await getAuthToken();
        const timeZone = "Asia/Dubai";
        const now = moment().tz(timeZone);
        const currentDate = now.format("YYYY-MM-DD");

        // Time range for attendance data
        const start_time = now.startOf("day").format("YYYY-MM-DD HH:mm:ss");
        const end_time = now.endOf("day").format("YYYY-MM-DD HH:mm:ss");

        // Fetch all employees with pagination
        let allEmployees = [];
        let employeeApiUrl = `${EMPLOYEE_API_URL}?limit=100`; // Adjust based on your API
        while (employeeApiUrl) {
            const response = await axios.get(employeeApiUrl, {
                headers: { Authorization: `JWT ${token}` }
            });
            const employeeData = response.data;
            allEmployees = allEmployees.concat(employeeData.data || []);
            employeeApiUrl = employeeData.next || null;
        }

        // Create employee map for quick lookup
        const empMap = allEmployees.reduce((map, emp) => {
            map[emp.emp_code] = emp;
            return map;
        }, {});

        // Fetch all attendance data with pagination
        let allPunchData = [];
        let attendanceApiUrl = `${ATTENDANCE_URL}?start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}`;
        while (attendanceApiUrl) {
            const response = await axios.get(attendanceApiUrl, {
                headers: { Authorization: `JWT ${token}` }
            });
            const punchData = response.data;
            allPunchData = allPunchData.concat(punchData.data || []);
            attendanceApiUrl = punchData.next || null;
        }

        // Group punches by employee code
        const punchesByEmployee = allPunchData.reduce((groups, punch) => {
            if (!groups[punch.emp_code]) {
                groups[punch.emp_code] = [];
            }
            groups[punch.emp_code].push(punch);
            return groups;
        }, {});

        // Process attendance status for each employee
        const result = {
            present: [],
            late: [],
            absent: [],
            summary: {
                total_employees: allEmployees.length,
                present: 0,
                late: 0,
                absent: 0,
                synced_at: now.format("YYYY-MM-DD HH:mm:ss")
            }
        };

        allEmployees.forEach(employee => {
            const empCode = employee.emp_code;
            const punches = punchesByEmployee[empCode] || [];
            const employeeResponse = {
                id: employee.id,
                emp: employee.id, // Assuming same as id
                emp_code: employee.emp_code,
                first_name: employee.first_name,
                last_name: employee.last_name,
                department: employee.department?.dept_name || "Unknown",
                position: employee.position || "Unknown",
                // Employee details from employee API
                employee_details: {
                    nickname: employee.nickname,
                    format_name: employee.format_name,
                    photo: employee.photo,
                    full_name: employee.full_name,
                    hire_date: employee.hire_date,
                    gender: employee.gender,
                    contact_info: {
                        mobile: employee.mobile,
                        email: employee.email,
                        address: employee.address
                    },
                    department: employee.department,
                    attemployee: employee.attemployee,
                    areas: employee.area
                }
            };

            if (punches.length === 0) {
                // Absent employee
                result.absent.push({
                    ...employeeResponse,
                    punch_time: null,
                    punch_state: null,
                    punch_state_display: "Absent",
                    verify_type: null,
                    verify_type_display: null,
                    attendance_status: "absent",
                    late_minutes: null
                });
                result.summary.absent++;
                return;
            }

            // Process punches for present employees
            punches.sort((a, b) => moment(a.punch_time).diff(moment(b.punch_time)));
            const firstPunch = punches[0];
            const firstPunchTime = moment(firstPunch.punch_time).tz(timeZone);
            const workStartTime = moment(`${currentDate} ${WORK_START_TIME}`).tz(timeZone);
            const lateMinutes = firstPunchTime.diff(workStartTime, 'minutes');

            // Create attendance record for each punch
            punches.forEach(punch => {
                const attendanceRecord = {
                    ...employeeResponse,
                    id: punch.id,
                    punch_time: punch.punch_time,
                    punch_state: punch.punch_state,
                    punch_state_display: punch.punch_state_display,
                    verify_type: punch.verify_type,
                    verify_type_display: punch.verify_type_display,
                    work_code: punch.work_code,
                    gps_location: punch.gps_location,
                    area_alias: punch.area_alias,
                    terminal_sn: punch.terminal_sn,
                    temperature: punch.temperature,
                    is_mask: punch.is_mask,
                    terminal_alias: punch.terminal_alias,
                    upload_time: punch.upload_time,
                    attendance_status: "present",
                    late_minutes: lateMinutes > 0 ? lateMinutes : 0
                };

                if (punch === firstPunch && lateMinutes > LATE_THRESHOLD) {
                    attendanceRecord.attendance_status = "late";
                    attendanceRecord.late_minutes = lateMinutes;
                    result.late.push(attendanceRecord);
                    result.summary.late++;
                } else if (punch === firstPunch) {
                    result.present.push(attendanceRecord);
                    result.summary.present++;
                }
            });
        });
        */

        // Return dummy data instead of actual API response
        const dummyData = {
            success: true,
            message: "Attendance data synced successfully",
            data: {
                "present": [
                    {
                        "id": 175670,
                        "emp": 371,
                        "emp_code": "1013",
                        "first_name": "Chaimaa faiz",
                        "last_name": null,
                        "department": "Mortgage Loan",
                        "position": {
                            "id": 5,
                            "position_code": "4",
                            "position_name": "Executive"
                        },
                        "employee_details": {
                            "nickname": "",
                            "format_name": "1013 Chaimaa faiz",
                            "photo": "",
                            "full_name": "Chaimaa faiz ",
                            "hire_date": "2025-04-09",
                            "gender": "F",
                            "contact_info": {
                                "mobile": "",
                                "email": null,
                                "address": ""
                            },
                            "department": {
                                "id": 4,
                                "dept_code": "4",
                                "dept_name": "Mortgage Loan"
                            },
                            "attemployee": {
                                "id": 369,
                                "enable_attendance": true,
                                "enable_overtime": true,
                                "enable_holiday": true,
                                "enable_schedule": true
                            },
                            "areas": [
                                {
                                    "id": 3,
                                    "area_code": "3",
                                    "area_name": "Ajman"
                                }
                            ]
                        },
                        "punch_time": "2025-09-12 09:36:32",
                        "punch_state": "255",
                        "punch_state_display": "Unknown",
                        "verify_type": 1,
                        "verify_type_display": "Fingerprint",
                        "work_code": "0",
                        "gps_location": null,
                        "area_alias": "Ajman",
                        "terminal_sn": "ZHM2241200049",
                        "temperature": 0,
                        "is_mask": "No",
                        "terminal_alias": "Ajman",
                        "upload_time": "2025-09-12 09:36:34",
                        "attendance_status": "present",
                        "late_minutes": 0
                    },
                    {
                        "id": 175662,
                        "emp": 372,
                        "emp_code": "1014",
                        "first_name": "Hazel reyes orani bataan",
                        "last_name": null,
                        "department": "Admin",
                        "position": {
                            "id": 5,
                            "position_code": "4",
                            "position_name": "Executive"
                        },
                        "employee_details": {
                            "nickname": "",
                            "format_name": "1014 Hazel reyes orani bataan",
                            "photo": "",
                            "full_name": "Hazel reyes orani bataan ",
                            "hire_date": "2025-04-09",
                            "gender": "F",
                            "contact_info": {
                                "mobile": "",
                                "email": null,
                                "address": ""
                            },
                            "department": {
                                "id": 6,
                                "dept_code": "6",
                                "dept_name": "Admin"
                            },
                            "attemployee": {
                                "id": 370,
                                "enable_attendance": true,
                                "enable_overtime": true,
                                "enable_holiday": true,
                                "enable_schedule": true
                            },
                            "areas": [
                                {
                                    "id": 3,
                                    "area_code": "3",
                                    "area_name": "Ajman"
                                }
                            ]
                        },
                        "punch_time": "2025-09-12 09:21:53",
                        "punch_state": "255",
                        "punch_state_display": "Unknown",
                        "verify_type": 1,
                        "verify_type_display": "Fingerprint",
                        "work_code": "0",
                        "gps_location": null,
                        "area_alias": "Ajman",
                        "terminal_sn": "ZHM2241200049",
                        "temperature": 0,
                        "is_mask": "No",
                        "terminal_alias": "Ajman",
                        "upload_time": "2025-09-12 09:21:55",
                        "attendance_status": "present",
                        "late_minutes": 0
                    },
                    // Add more present employees as needed
                ],
                "late": [
                    {
                        "id": 175704,
                        "emp": 374,
                        "emp_code": "1016",
                        "first_name": "Remon samy nazeer sdary",
                        "last_name": null,
                        "department": "Accounts",
                        "position": "Unknown",
                        "employee_details": {
                            "nickname": "",
                            "format_name": "1016 Remon samy nazeer sdary",
                            "photo": "/auth_files/photo/1016.jpg",
                            "full_name": "Remon samy nazeer sdary ",
                            "hire_date": "2025-04-18",
                            "gender": "M",
                            "contact_info": {
                                "mobile": "0552661635",
                                "email": "remon.sns.aj@jovera.ae",
                                "address": ""
                            },
                            "department": {
                                "id": 8,
                                "dept_code": "8",
                                "dept_name": "Accounts"
                            },
                            "attemployee": {
                                "id": 372,
                                "enable_attendance": true,
                                "enable_overtime": true,
                                "enable_holiday": true,
                                "enable_schedule": true
                            },
                            "areas": [
                                {
                                    "id": 4,
                                    "area_code": "4",
                                    "area_name": "Abudhabi"
                                }
                            ]
                        },
                        "punch_time": "2025-09-12 10:10:46",
                        "punch_state": "0",
                        "punch_state_display": "Check In",
                        "verify_type": 15,
                        "verify_type_display": "Face",
                        "work_code": "0",
                        "gps_location": null,
                        "area_alias": "Abudhabi",
                        "terminal_sn": "CN4E243260103",
                        "temperature": 0,
                        "is_mask": "No",
                        "terminal_alias": "Abudhabi",
                        "upload_time": "2025-09-12 10:10:47",
                        "attendance_status": "late",
                        "late_minutes": 10
                    }
                ],
                "absent": [
                    {
                        "id": 999999,
                        "emp": 999,
                        "emp_code": "9999",
                        "first_name": "John",
                        "last_name": "Doe",
                        "department": "HR",
                        "position": "Manager",
                        "employee_details": {
                            "nickname": "Johnny",
                            "format_name": "9999 John Doe",
                            "photo": "/auth_files/photo/9999.jpg",
                            "full_name": "John Doe",
                            "hire_date": "2024-01-15",
                            "gender": "M",
                            "contact_info": {
                                "mobile": "0551234567",
                                "email": "john.doe@company.com",
                                "address": "Dubai"
                            },
                            "department": {
                                "id": 7,
                                "dept_code": "7",
                                "dept_name": "HR"
                            },
                            "attemployee": {
                                "id": 999,
                                "enable_attendance": true,
                                "enable_overtime": true,
                                "enable_holiday": true,
                                "enable_schedule": true
                            },
                            "areas": [
                                {
                                    "id": 1,
                                    "area_code": "1",
                                    "area_name": "Dubai"
                                }
                            ]
                        },
                        "punch_time": null,
                        "punch_state": null,
                        "punch_state_display": "Absent",
                        "verify_type": null,
                        "verify_type_display": null,
                        "work_code": null,
                        "gps_location": null,
                        "area_alias": null,
                        "terminal_sn": null,
                        "temperature": null,
                        "is_mask": null,
                        "terminal_alias": null,
                        "upload_time": null,
                        "attendance_status": "absent",
                        "late_minutes": null
                    }
                ],
                "summary": {
                    "total_employees": 15,
                    "present": 14,
                    "late": 1,
                    "absent": 1,
                    "synced_at": "2025-09-12 11:27:49"
                }
            },
            token: "dummy_token_12345",
            meta: {
                time_zone: "Asia/Dubai",
                work_start_time: "09:00:00",
                late_threshold_minutes: 5
            }
        };

        res.status(200).json(dummyData);

    } catch (error) {
        console.error("Error syncing attendance data:", error);
        res.status(500).json({
            success: false,
            message: "Failed to sync attendance data",
            error: {
                message: error.message,
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            }
        });
    }
});


// Helper function to get all dates between two dates
function getDatesBetween(startDate, endDate) {
    const dates = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        dates.push(moment(currentDate).format("YYYY-MM-DD"));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}
// Helper function to get all dates between two dates
function getDatesBetween(startDate, endDate) {
    const dates = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        dates.push(moment(currentDate).format("YYYY-MM-DD"));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}
// Generate Checkstatus
router.get("/generate", async (req, res) => {
    try {
        const attendanceRecords = await Attendance.find({ process_status: false }).populate("shift");
        let totalRecordsUpdated = 0;

        for (const attendance of attendanceRecords) {
            const shift = attendance.shift;
            if (!shift || !shift.schedule) continue;

            const punchTime = moment.tz(attendance.punch_time, "YYYY-MM-DD HH:mm:ss", "Asia/Dubai");
            const dayOfWeek = punchTime.format("dddd");
            const daySchedule = shift.schedule[dayOfWeek];

            if (!daySchedule || daySchedule.startTime === "00:00" || daySchedule.endTime === "00:00") {
                continue;
            }

            const shiftStartTime = moment.tz(`${punchTime.format("YYYY-MM-DD")} ${daySchedule.startTime}`, "YYYY-MM-DD HH:mm", "Asia/Dubai");
            const shiftEndTime = moment.tz(`${punchTime.format("YYYY-MM-DD")} ${daySchedule.endTime}`, "YYYY-MM-DD HH:mm", "Asia/Dubai");

            if (attendance.status === "check-in") {
                if (punchTime.isBefore(shiftStartTime)) {
                    attendance.checkstatus = "Present";
                } else if (punchTime.isAfter(shiftStartTime.clone().add(10, "minutes").add(59, "seconds"))) {
                    attendance.checkstatus = "Late";
                } else {
                    attendance.checkstatus = "Present";
                }
            }

            if (attendance.status === "check-out") {
                if (punchTime.isBefore(shiftEndTime.clone().subtract(30, "minutes"))) {
                    attendance.checkstatus = "Early Check Out";
                } else if (punchTime.isSameOrAfter(shiftEndTime.clone().subtract(29, "minutes"))) {
                    attendance.checkstatus = "check-out";
                }
            }

            await attendance.save();
            totalRecordsUpdated++;
        }

        res.status(200).json({
            message: `${totalRecordsUpdated} attendance records updated successfully`,
        });
    } catch (error) {
        console.error("Error generating checkstatus:", error);
        res.status(500).json({ message: "Error generating checkstatus", error: error.message });
    }
});
// Route to fetch attendance by user (ensure user ID is valid)
router.get("/user/:userId", async (req, res) => {
    const { userId } = req.params;

    // Validate ObjectId format before querying
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: "Invalid user ID format" });
    }

    try {
        const userAttendance = await Attendance.find({ user: userId });
        res.status(200).json(userAttendance);
    } catch (error) {
        console.error("Error fetching user attendance:", error);
        res.status(500).json({ error: "Server error", details: error.message });
    }
});
router.get("/sync-today", async (req, res) => {
    try {
        const token = await getAuthToken();
        const timeZone = "Asia/Dubai";

        const now = moment().tz(timeZone);
        const currentTime = now.format("HH:mm:ss");
        const todayDate = now.format("YYYY-MM-DD");

        const start_time = now.startOf("day").format("YYYY-MM-DD 00:00:00");
        const end_time = now.endOf("day").format(`YYYY-MM-DD ${currentTime}`);

        let apiUrl = `${ATTENDANCE_URL}?start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}`;
        console.log("API URL:", apiUrl);

        let totalRecordsSynced = 0;
        let attendanceRecords = [];

        // 1️⃣ PRE-FETCH EXISTING DATA FOR DEDUPLICATION (TODAY ONLY)
        const existingPunches = new Set();
        const existingAttendance = await Attendance.find({
            Date: new Date(todayDate)
        }).select('transaction_id user Date').lean();

        // Create a map to track user-date combinations that have punches
        const userDateHasPunches = new Map();

        existingAttendance.forEach(record => {
            existingPunches.add(record.transaction_id);

            // Track if user has any punches for today
            const userDateKey = `${record.user}_${todayDate}`;

            // Only mark as having punches if it's an actual punch record (not holiday/weekend/absent)
            if (record.transaction_id.startsWith('PUNCH-')) {
                userDateHasPunches.set(userDateKey, true);
            }
        });

        // 2️⃣ PROCESS TODAY'S ATTENDANCE PUNCHES FROM API
        while (apiUrl) {
            const response = await axios.get(apiUrl, {
                headers: { Authorization: `JWT ${token}` }
            });

            const punchData = response.data;
            if (!punchData || !Array.isArray(punchData.data) || punchData.data.length === 0) break;

            for (const punch of punchData.data) {
                const transaction_id = `PUNCH-${punch.id}`;

                // Skip if we already have this punch
                if (existingPunches.has(transaction_id)) continue;

                const punchTime = moment.tz(punch.punch_time, "YYYY-MM-DD HH:mm:ss", timeZone);
                const punchDay = punchTime.format("dddd");

                // Find user and their shifts
                const user = await User.findOne({ emp_code: punch.emp_code }).populate("shifts");
                if (!user) continue;

                // Track that this user has a punch for today
                const userDateKey = `${user._id}_${todayDate}`;
                userDateHasPunches.set(userDateKey, true);

                // Determine shift for this punch
                let shift = null;
                let isWeekend = false;

                if (user.shifts && user.shifts.length > 0) {
                    for (const userShift of user.shifts) {
                        const shiftTimings = userShift.schedule[punchDay];
                        if (!shiftTimings) continue;

                        if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                            isWeekend = true;
                            break;
                        }

                        shift = userShift;
                        break;
                    }
                }

                // Store the punch record
                attendanceRecords.push({
                    transaction_id,
                    user: user._id,
                    emp_id: punch.emp,
                    emp_code: punch.emp_code,
                    first_name: punch.first_name,
                    last_name: punch.last_name,
                    department: punch.department,
                    position: punch.position,
                    punch_time: punch.punch_time,
                    verify_type: punch.verify_type_display,
                    terminal_alias: punch.terminal_alias,
                    upload_time: punch.upload_time,
                    status: 'punch',
                    shift: shift ? shift._id : null,
                    Date: todayDate,
                    isWeekend: isWeekend
                });

                // Batch insert every 100 records to avoid memory issues
                if (attendanceRecords.length >= 100) {
                    await Attendance.insertMany(attendanceRecords);
                    totalRecordsSynced += attendanceRecords.length;
                    attendanceRecords = []; // Reset the array
                }
            }

            apiUrl = punchData.next || null;
        }

        // 3️⃣ HANDLE WEEKEND, HOLIDAY, AND ABSENT ATTENDANCE FOR TODAY
        const allUsers = await User.find().populate("shifts");
        const todayDay = now.format("dddd");
        const isHoliday = await holidayModel.findOne({ dates: todayDate });

        for (const user of allUsers) {
            const userDateKey = `${user._id}_${todayDate}`;

            // Skip if user has punches for today
            if (userDateHasPunches.has(userDateKey)) {
                continue;
            }

            // Skip if we already have a holiday/weekend/absent record for this user today
            if (existingPunches.has(`HOLIDAY-${user._id}-${todayDate}`) ||
                existingPunches.has(`WEEKEND-${user._id}-${todayDate}`) ||
                existingPunches.has(`ABSENT-${user._id}-${todayDate}`)) {
                continue;
            }

            let hasWeekendShift = false;
            let hasWorkingShift = false;

            // Check user's shifts for today
            if (user.shifts && user.shifts.length > 0) {
                for (const shift of user.shifts) {
                    const shiftTimings = shift.schedule[todayDay];

                    if (!shiftTimings) continue;

                    if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                        hasWeekendShift = true;
                    } else {
                        hasWorkingShift = true;
                    }
                }
            }

            // If today is a holiday
            if (isHoliday) {
                attendanceRecords.push({
                    transaction_id: `HOLIDAY-${user._id}-${todayDate}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "holiday",
                    status: 'punch',
                    holidayName: isHoliday.name,
                    shift: null,
                    Date: todayDate
                });
            }
            // If today is a weekend day according to shift schedule
            else if (hasWeekendShift) {
                attendanceRecords.push({
                    transaction_id: `WEEKEND-${user._id}-${todayDate}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    status: 'punch',
                    checkstatus: "weekend",
                    shift: null,
                    Date: todayDate
                });
            }
            // If today is a working day but no attendance found
            else if (hasWorkingShift) {
                attendanceRecords.push({
                    transaction_id: `ABSENT-${user._id}-${todayDate}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department.name,
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    status: 'punch',
                    checkstatus: "absent",
                    shift: null,
                    Date: todayDate
                });
            }

            // Batch insert every 100 records to avoid memory issues
            if (attendanceRecords.length >= 100) {
                await Attendance.insertMany(attendanceRecords);
                totalRecordsSynced += attendanceRecords.length;
                attendanceRecords = []; // Reset the array
            }
        }

        // 4️⃣ INSERT ANY REMAINING ATTENDANCE RECORDS
        if (attendanceRecords.length > 0) {
            await Attendance.insertMany(attendanceRecords);
            totalRecordsSynced += attendanceRecords.length;
        }

        res.status(200).json({
            message: `Today's attendance data (${todayDate}) synced successfully`,
            count: totalRecordsSynced
        });
    } catch (error) {
        console.error("Error syncing today's attendance data:", error);
        res.status(500).json({ message: "Error syncing today's attendance data", error: error.message });
    }
});
router.get("/my-attendence", isAuth , async (req, res) => {
    try {
        const userId = req.user._id; // Get user ID from the request
        const populateOptions = [
            {
                path: "user",
                select: "name department areas",
                populate: [
                    { path: "department", select: "name" },
                    { path: "areas", select: "name" }
                ]
            }
        ];

        const query = userId ? { user: userId } : {};

        // Fetch all attendance records
        const records = await Attendance.find(query).populate(populateOptions);

        // Group by month
        const groupedByMonth = {};

        records.forEach(record => {
            const monthKey = moment(record.Date).format("YYYY-MM"); // e.g. "2024-04"
            if (!groupedByMonth[monthKey]) {
                groupedByMonth[monthKey] = [];
            }
            groupedByMonth[monthKey].push(record);
        });

        // Convert to structured summary
        const summary = Object.entries(groupedByMonth).map(([month, recs]) => ({
            month,
            count: recs.length,
            records: recs
        }));

        res.status(200).json({
            summary
        });
    } catch (error) {
        console.error("Error fetching attendance summary:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

router.post("/sync-user", async (req, res) => {
    
    try {
        const { emp_code } = req.body;
        
        if (!emp_code) {
            return res.status(400).json({ message: "emp_code is required in the request body" });
        }

        const token = await getAuthToken();
        const timeZone = "Asia/Dubai";
        const bulkStartDate = "2025-05-01";

        const now = moment().tz(timeZone);
        const currentTime = now.format("HH:mm:ss");
        const date = now.format("YYYY-MM-DD");

        const start_time = moment.tz(bulkStartDate, timeZone).startOf("day").format("YYYY-MM-DD HH:mm:ss");
        const end_time = now.endOf("day").format(`YYYY-MM-DD ${currentTime}`);

        // Build API URL with emp_code filter
        let apiUrl = `${ATTENDANCE_URL}?start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}&emp_code=${emp_code}`;
        console.log("API URL:", apiUrl);

        let totalRecordsSynced = 0;
        let attendanceRecords = [];

        // 1️⃣ PRE-FETCH EXISTING DATA FOR DEDUPLICATION
        const user = await User.findOne({ emp_code }).populate("shifts");
        if (!user) {
            return res.status(404).json({ message: "User not found with the provided emp_code" });
        }

        const existingPunches = new Set();
        const existingAttendance = await Attendance.find({
            user: user._id,
            Date: {
                $gte: new Date(bulkStartDate),
                $lte: new Date(date)
            }
        }).select('transaction_id Date').lean();

        // Create a map to track dates that have punches
        const dateHasPunches = new Set();

        existingAttendance.forEach(record => {
            existingPunches.add(record.transaction_id);
            
            // Track dates that have punches
            const dateKey = moment(record.Date).format('YYYY-MM-DD');
            if (record.transaction_id.startsWith('PUNCH-')) {
                dateHasPunches.add(dateKey);
            }
        });

        // 2️⃣ PROCESS USER ATTENDANCE PUNCHES FROM API
        while (apiUrl) {
            const response = await axios.get(apiUrl, {
                headers: { Authorization: `JWT ${token}` }
            });

            const punchData = response.data;
            if (!punchData || !Array.isArray(punchData.data) || punchData.data.length === 0) break;

            for (const punch of punchData.data) {
                const transaction_id = `PUNCH-${punch.id}`;

                // Skip if we already have this punch
                if (existingPunches.has(transaction_id)) continue;

                const punchTime = moment.tz(punch.punch_time, "YYYY-MM-DD HH:mm:ss", timeZone);
                const punchDate = punchTime.format("YYYY-MM-DD");
                const punchDay = punchTime.format("dddd");

                // Track that this date has a punch
                dateHasPunches.add(punchDate);

                // Determine shift for this punch
                let shift = null;
                let isWeekend = false;

                if (user.shifts && user.shifts.length > 0) {
                    for (const userShift of user.shifts) {
                        const shiftTimings = userShift.schedule[punchDay];
                        if (!shiftTimings) continue;

                        if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                            isWeekend = true;
                            break;
                        }

                        shift = userShift;
                        break;
                    }
                }

                // Store the punch record
                attendanceRecords.push({
                    transaction_id,
                    user: user._id,
                    emp_id: punch.emp,
                    emp_code: punch.emp_code,
                    first_name: punch.first_name,
                    last_name: punch.last_name,
                    department: punch.department,
                    position: punch.position,
                    punch_time: punch.punch_time,
                    verify_type: punch.verify_type_display,
                    terminal_alias: punch.terminal_alias,
                    upload_time: punch.upload_time,
                    status: 'punch',
                    shift: shift ? shift._id : null,
                    Date: punchDate,
                    isWeekend: isWeekend
                });

                // Batch insert every 100 records to avoid memory issues
                if (attendanceRecords.length >= 100) {
                    await Attendance.insertMany(attendanceRecords);
                    totalRecordsSynced += attendanceRecords.length;
                    attendanceRecords = []; // Reset the array
                }
            }

            apiUrl = punchData.next || null;
        }

        // 3️⃣ HANDLE WEEKEND, HOLIDAY, AND ABSENT ATTENDANCE
        const datesToProcess = getDatesBetween(new Date(bulkStartDate), new Date(date));

        // Pre-fetch all holidays for the date range
        const holidays = await holidayModel.find({
            dates: { $in: datesToProcess }
        });

        // Create a map of dates to holiday names
        const holidayMap = new Map();
        holidays.forEach(holiday => {
            holiday.dates.forEach(date => {
                holidayMap.set(date, holiday.name);
            });
        });

        for (const processDate of datesToProcess) {
            const dateStr = moment(processDate).format('YYYY-MM-DD');
            const processDay = moment.tz(processDate, timeZone).format("dddd");
            const isHoliday = holidayMap.has(dateStr);

            // Skip if user has punches for this date
            if (dateHasPunches.has(dateStr)) {
                continue;
            }

            // Skip if we already have a holiday/weekend/absent record for this user+date
            if (existingPunches.has(`HOLIDAY-${user._id}-${dateStr}`) ||
                existingPunches.has(`WEEKEND-${user._id}-${dateStr}`) ||
                existingPunches.has(`ABSENT-${user._id}-${dateStr}`)) {
                continue;
            }

            // Skip if user has no shift assigned
            if (!user.shifts || user.shifts.length === 0) {
                continue;
            }

            let hasWeekendShift = false;
            let hasWorkingShift = false;

            // Check user's shifts for this day
            for (const shift of user.shifts) {
                const shiftTimings = shift.schedule[processDay];

                if (!shiftTimings) continue;

                if (shiftTimings.startTime === "00:00" && shiftTimings.endTime === "00:00") {
                    hasWeekendShift = true;
                } else {
                    hasWorkingShift = true;
                }
            }

            // If it's a holiday
            if (isHoliday) {
                attendanceRecords.push({
                    transaction_id: `HOLIDAY-${user._id}-${dateStr}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department?.name || '',
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "holiday",
                    holidayName: holidayMap.get(dateStr),
                    shift: null,
                    Date: dateStr
                });
            }
            // If it's a weekend day according to shift schedule
            else if (hasWeekendShift) {
                attendanceRecords.push({
                    transaction_id: `WEEKEND-${user._id}-${dateStr}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department?.name || '',
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "weekend",
                    shift: null,
                    Date: dateStr
                });
            }
            // If it's a working day but no attendance found
            else if (hasWorkingShift) {
                attendanceRecords.push({
                    transaction_id: `ABSENT-${user._id}-${dateStr}`,
                    user: user._id,
                    emp_id: user.emp_id,
                    emp_code: user.emp_code,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department?.name || '',
                    position: user.position,
                    punch_time: null,
                    verify_type: null,
                    terminal_alias: null,
                    upload_time: null,
                    checkstatus: "absent",
                    shift: null,
                    Date: dateStr
                });
            }

            // Batch insert every 100 records to avoid memory issues
            if (attendanceRecords.length >= 100) {
                await Attendance.insertMany(attendanceRecords);
                totalRecordsSynced += attendanceRecords.length;
                attendanceRecords = []; // Reset the array
            }
        }

        // 4️⃣ INSERT ANY REMAINING ATTENDANCE RECORDS
        if (attendanceRecords.length > 0) {
            await Attendance.insertMany(attendanceRecords);
            totalRecordsSynced += attendanceRecords.length;
        }

        res.status(200).json({
            message: `Attendance data for user ${emp_code} from ${bulkStartDate} to ${date} synced successfully`,
            count: totalRecordsSynced
        });
    } catch (error) {
        console.error("Error syncing user attendance data:", error);
        res.status(500).json({ message: "Error syncing user attendance data", error: error.message });
    }
});

module.exports = router;
