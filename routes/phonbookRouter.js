const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Phonebook = require('../models/phonebookModel');
const User = require('../models/userModel');
const { isAuth, hasRole } = require('../utils');
const Comment = require('../models/commentModel');
const router = express.Router();
const upload = multer({ dest: 'uploads' });
const Client = require('../models/clientModel');
const mongoose = require('mongoose');
const moment = require('moment'); // For date manipulation
const csvParser = require("csv-parser");
const Lead = require('../models/leadModel');
const { default: axios } = require('axios');
router.get("/get-client-numbers", async (req, res) => {
    try {
        // Step 1: Get unique client IDs from leads
        const leads = await Lead.find().select('client');
        const clientIds = [...new Set(leads.map(lead => lead.client.toString()))];

        // Step 2: Find clients who are not BLOCKED
        const clients = await Client.find({
            _id: { $in: clientIds },
            dncr_status: { $ne: 'BLOCKED' }
        }).select('phone');

        // Step 3: Extract phone numbers
        const clientNumbers = clients.map(client => client.phone);

        // Step 4: Return the phone numbers
        res.json(clientNumbers);
    } catch (error) {
        console.error("Error fetching client phone numbers:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

router.get("/search-phonebook-for-hod", isAuth, async (req, res) => {
    try {
        const { number, pipeline, user, startDate, endDate, calstatus } = req.query;
        let filter = { visibility: req.user._id };

        // Helper to normalize phone number
        function normalizePhoneNumber(input) {
            if (!input) return null;
            let cleaned = input.replace(/\D/g, '');
            if (cleaned.startsWith('971')) return `\\+?${cleaned}`;
            if (cleaned.startsWith('0')) return `\\+?971${cleaned.slice(1)}`;
            return `\\+?${cleaned}`;
        }

        // Filter by number
        if (number) {
            const normalized = normalizePhoneNumber(number);
            filter.number = { $regex: `^${normalized}`, $options: 'i' };
        }

        if (pipeline) filter.pipeline = pipeline;
        if (user) filter.user = user;

        // Only apply calstatus if number is not being searched
        if (!number && calstatus) {
            filter.calstatus = calstatus;
        }

        // Filter by date range
        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        } else if (startDate) {
            filter.createdAt = { $gte: new Date(startDate) };
        } else if (endDate) {
            filter.createdAt = { $lte: new Date(endDate) };
        }

        const phonebookEntries = await Phonebook.find(filter)
            .populate("user", "name email")
            .populate("pipeline", "name")
            .sort({ createdAt: -1 })
            .select("number status createdAt updatedAt calstatus user visibility");

        const filteredEntries = phonebookEntries.filter(entry =>
            entry.status !== 'Waiting' && entry.status !== 'BLOCKED'
        );
        if (filteredEntries.length === 0) {
            return res.status(404).json({ message: "No entries found matching the provided criteria" });
        }

        res.json(filteredEntries);
    } catch (error) {
        console.error("Error searching phonebook:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});
router.delete('/delete-numbers', isAuth, async (req, res) => {
    try {
        const { phonebookIds } = req.body;
        const requestingUserId = req.user?._id;

        if (!requestingUserId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!Array.isArray(phonebookIds) || phonebookIds.length === 0) {
            return res.status(400).json({ message: 'An array of phonebook IDs is required' });
        }

        const deletedEntries = [];
        const failedDeletions = [];

        await Promise.all(phonebookIds.map(async (id) => {
            try {
                const phonebookEntry = await Phonebook.findById(id);

                if (!phonebookEntry) {
                    failedDeletions.push({ id, error: 'Phonebook entry not found' });
                    return;
                }

                if (!Array.isArray(phonebookEntry.visibility)) {
                    failedDeletions.push({ id, error: 'Invalid visibility data' });
                    return;
                }

                const hasPermission = phonebookEntry.visibility.some(
                    visId => visId?.toString() === requestingUserId.toString()
                );

                if (!hasPermission) {
                    failedDeletions.push({ id, error: 'Forbidden: You do not have permission' });
                    return;
                }

                await Phonebook.deleteOne({ _id: id });
                deletedEntries.push(id);
            } catch (err) {
                failedDeletions.push({ id, error: 'Error deleting entry', details: err.message });
            }
        }));

        if (deletedEntries.length === 0) {
            return res.status(400).json({
                message: 'No phonebook entries were deleted',
                failedDeletions
            });
        }

        res.status(200).json({
            message: 'Phonebook entries deleted successfully',
            deletedEntries,
            failedDeletions
        });
    } catch (error) {
        console.error('Error deleting phonebook entries:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
/*** Route to get all phone numbers from the phonebook.*/
router.get("/get-phonebook-numbers", isAuth, hasRole(['Admin', 'Developer',]), async (req, res) => {
    try {
        const phoneNumbers = await Phonebook.find({ status: { $ne: 'BLOCKED' } }).select('number -_id');
        res.json(phoneNumbers.map(entry => entry.number)); // Return only an array of numbers
    } catch (error) {
        console.error("Error fetching phonebook numbers:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});
router.put('/replace-users', isAuth, async (req, res) => {
    try {
        const { phonebookIds, userId } = req.body;
        const requestingUserId = req.user?._id;

        if (!requestingUserId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required in request body' });
        }

        if (!Array.isArray(phonebookIds) || phonebookIds.length === 0) {
            return res.status(400).json({ message: 'An array of phonebook IDs is required' });
        }

        const updatedEntries = [];
        const failedUpdates = [];

        await Promise.all(phonebookIds.map(async (id) => {
            try {
                const phonebookEntry = await Phonebook.findById(id);
                if (!phonebookEntry) {
                    failedUpdates.push({ id, error: 'Phonebook entry not found' });
                    return;
                }

                // Defensive: filter out nulls in visibility array
                phonebookEntry.visibility = (phonebookEntry.visibility || []).filter(Boolean);

                // Permission check
                const hasPermission = phonebookEntry.visibility.some(
                    visId => visId?.toString() === requestingUserId.toString()
                );
                if (!hasPermission) {
                    failedUpdates.push({ id, error: 'Forbidden: You do not have permission' });
                    return;
                }

                // Remove old user from visibility
                if (phonebookEntry.user) {
                    phonebookEntry.visibility = phonebookEntry.visibility.filter(
                        visId => visId?.toString() !== phonebookEntry.user.toString()
                    );
                }

                // Assign new user
                phonebookEntry.user = userId;

                // Add new user to visibility if not already present
                const alreadyVisible = phonebookEntry.visibility.some(
                    visId => visId?.toString() === userId.toString()
                );
                if (!alreadyVisible) {
                    phonebookEntry.visibility.push(userId);
                }

                // Overwrite calstatus to "Req to call"
                // phonebookEntry.calstatus = 'Req to call';

                await phonebookEntry.save();
                updatedEntries.push(phonebookEntry);
            } catch (err) {
                failedUpdates.push({ id, error: 'Error updating entry', details: err.message });
            }
        }));

        if (updatedEntries.length === 0) {
            return res.status(400).json({
                message: 'No phonebook entries were updated',
                failedUpdates
            });
        }

        res.status(200).json({
            message: 'User replaced and calstatus set to "Req to call" for authorized phonebook entries',
            updatedEntries,
            failedUpdates
        });
    } catch (error) {
        console.error('Error replacing user in phonebook entries:', error);
        res.status(500).json({ message: 'Error replacing user in phonebook entries' });
    }
});

router.get('/dashboard-report', isAuth, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user._id);
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Define date ranges based on `updatedAt`
        const today = moment().startOf('day').toDate();
        const startOfWeek = moment().startOf('isoWeek').toDate(); // ISO week starts on Monday
        const startOfMonth = moment().startOf('month').toDate();

        // Use aggregate pipeline to fetch, group, and populate data
        const report = await Phonebook.aggregate([
            {
                $match: {
                    visibility: { $in: [userId] }, // Match documents where visibility includes the user
                    status: 'UNBLOCKED', // Only include unblocked entries
                }
            },
            {
                $facet: {
                    daily: [
                        { $match: { updatedAt: { $gte: today } } }, // Filter by `updatedAt`
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'user',
                                foreignField: '_id',
                                as: 'userDetails'
                            }
                        },
                        { $unwind: '$userDetails' },
                        {
                            $group: {
                                _id: { user: '$userDetails.name', calstatus: '$calstatus' },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    weekly: [
                        { $match: { updatedAt: { $gte: startOfWeek } } },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'user',
                                foreignField: '_id',
                                as: 'userDetails'
                            }
                        },
                        { $unwind: '$userDetails' },
                        {
                            $group: {
                                _id: { user: '$userDetails.name', calstatus: '$calstatus' },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    monthly: [
                        { $match: { updatedAt: { $gte: startOfMonth } } },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'user',
                                foreignField: '_id',
                                as: 'userDetails'
                            }
                        },
                        { $unwind: '$userDetails' },
                        {
                            $group: {
                                _id: { user: '$userDetails.name', calstatus: '$calstatus' },
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            }
        ]);

        // Restructure the response to combine all the data by user
        const daily = report[0]?.daily || [];
        const weekly = report[0]?.weekly || [];
        const monthly = report[0]?.monthly || [];

        // Merge daily, weekly, and monthly data by user and calstatus
        const combinedReport = [];
        const users = [...new Set([...daily, ...weekly, ...monthly].map(item => item._id.user))];

        users.forEach(user => {
            const userReport = {
                user,
                daily: {},
                weekly: {},
                monthly: {}
            };

            daily.filter(item => item._id.user === user).forEach(item => {
                userReport.daily[item._id.calstatus] = item.count;
            });

            weekly.filter(item => item._id.user === user).forEach(item => {
                userReport.weekly[item._id.calstatus] = item.count;
            });

            monthly.filter(item => item._id.user === user).forEach(item => {
                userReport.monthly[item._id.calstatus] = item.count;
            });

            combinedReport.push(userReport);
        });

        res.status(200).json(combinedReport);
    } catch (error) {
        console.error('Error generating dashboard report:', error);
        res.status(500).json({ message: 'Error generating dashboard report' });
    }
});
router.get('/dashboard-report-user', isAuth, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user._id);
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Define date ranges based on `updatedAt`
        const today = moment().startOf('day').toDate();
        const startOfWeek = moment().startOf('isoWeek').toDate(); // ISO week starts on Monday
        const startOfMonth = moment().startOf('month').toDate();

        // Use aggregate pipeline to fetch, group, and populate data
        const report = await Phonebook.aggregate([
            {
                $match: {
                    user: userId, // Match documents where visibility includes the user
                    status: 'UNBLOCKED', // Only include unblocked entries
                }
            },
            {
                $facet: {
                    daily: [
                        { $match: { updatedAt: { $gte: today } } }, // Filter by `updatedAt`
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'user',
                                foreignField: '_id',
                                as: 'userDetails'
                            }
                        },
                        { $unwind: '$userDetails' },
                        {
                            $group: {
                                _id: { user: '$userDetails.name', calstatus: '$calstatus' },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    weekly: [
                        { $match: { updatedAt: { $gte: startOfWeek } } },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'user',
                                foreignField: '_id',
                                as: 'userDetails'
                            }
                        },
                        { $unwind: '$userDetails' },
                        {
                            $group: {
                                _id: { user: '$userDetails.name', calstatus: '$calstatus' },
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    monthly: [
                        { $match: { updatedAt: { $gte: startOfMonth } } },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'user',
                                foreignField: '_id',
                                as: 'userDetails'
                            }
                        },
                        { $unwind: '$userDetails' },
                        {
                            $group: {
                                _id: { user: '$userDetails.name', calstatus: '$calstatus' },
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            }
        ]);

        // Restructure the response to combine all the data by user
        const daily = report[0]?.daily || [];
        const weekly = report[0]?.weekly || [];
        const monthly = report[0]?.monthly || [];

        // Merge daily, weekly, and monthly data by user and calstatus
        const combinedReport = [];
        const users = [...new Set([...daily, ...weekly, ...monthly].map(item => item._id.user))];

        users.forEach(user => {
            const userReport = {
                user,
                daily: {},
                weekly: {},
                monthly: {}
            };

            daily.filter(item => item._id.user === user).forEach(item => {
                userReport.daily[item._id.calstatus] = item.count;
            });

            weekly.filter(item => item._id.user === user).forEach(item => {
                userReport.weekly[item._id.calstatus] = item.count;
            });

            monthly.filter(item => item._id.user === user).forEach(item => {
                userReport.monthly[item._id.calstatus] = item.count;
            });

            combinedReport.push(userReport);
        });

        res.status(200).json(combinedReport);
    } catch (error) {
        console.error('Error generating dashboard report:', error);
        res.status(500).json({ message: 'Error generating dashboard report' });
    }
});
router.post('/dashboard-report-user-specific', isAuth, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Define date ranges
        const today = moment().startOf('day').format('YYYY-MM-DD');
        const yesterday = moment().subtract(1, 'days').startOf('day').format('YYYY-MM-DD');
        const startOfWeek = moment().startOf('isoWeek').toDate();
        const startOfMonth = moment().startOf('month').toDate();

        // Define days of the week
        const weeklyDates = Array.from({ length: 7 }, (_, i) => {
            const date = moment().startOf('isoWeek').add(i, 'days');
            return { date: date.format('YYYY-MM-DD'), dayName: date.format('dddd') };
        });

        // Aggregate pipeline
        const report = await Phonebook.aggregate([
            {
                $match: {
                    user: userObjectId,
                    status: { $ne: 'BLOCKED' } // Exclude BLOCKED status
                }
            },
            {
                $group: {
                    _id: {
                        calstatus: "$calstatus",
                        day: {
                            $cond: {
                                if: { $eq: ["$calstatus", "Req to call"] },
                                then: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                                else: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } }
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Organize data
        const calstatuses = ['Req to call', 'Convert to Lead', 'No Answer', 'Not Interested', 'Follow Up', 'Offline'];
        const formatReport = (data, dateFilter) => {
            return calstatuses.reduce((acc, status) => {
                acc[status] = data.filter(item =>
                    item._id.calstatus === status &&
                    (!dateFilter || item._id.day === dateFilter)
                ).reduce((sum, cur) => sum + cur.count, 0);
                return acc;
            }, {});
        };

        const weeklyReportData = weeklyDates.map(({ date }) => formatReport(report, date));
        const weeklyTotal = calstatuses.reduce((acc, status) => {
            acc[status] = weeklyReportData.reduce((sum, dayReport) => sum + (dayReport[status] || 0), 0);
            return acc;
        }, {});

        const weeklyReport = weeklyDates.map(({ date, dayName }, index) => ({
            date,
            day: dayName,
            report: weeklyReportData[index]
        }));

        // Calculate total "Req to call"
        const totalReqToCall = report.filter(item => item._id.calstatus === "Req to call")
            .reduce((sum, cur) => sum + cur.count, 0);

        const response = {
            userId,
            today: formatReport(report, today),
            yesterday: formatReport(report, yesterday),
            weekly: {
                report: weeklyReport,
                total: weeklyTotal
            },
            monthly: formatReport(report, null),
            totalReqToCall
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Error generating user-specific dashboard report:', error);
        res.status(500).json({ message: 'Error generating dashboard report' });
    }
});
router.post('/dashboard-report-pipeline-specific', isAuth, async (req, res) => {
    try {
        const { pipeline } = req.user;
        if (!pipeline || pipeline.length === 0) {
            return res.status(400).json({ message: 'User does not have an associated pipeline' });
        }

        const pipelineObjectIds = pipeline.map(p => new mongoose.Types.ObjectId(p._id));

        // Fetch users associated with the given pipeline (pipeline is an array) and having role 'Sales'
        const users = await User.find({
            pipeline: { $in: pipelineObjectIds },
            role: 'Sales'
        })
            .select('_id name email') // Select basic fields from the user
            .populate('pipeline', 'name') // Populate the 'name' field for each item in the pipeline array
            .populate('products', 'name'); // Populate the 'name' field for each item in the product array

        if (users.length === 0) {
            return res.status(404).json({ message: 'No sales users found for this pipeline' });
        }

        // Aggregate pipeline report for each user separately
        const userReports = await Promise.all(users.map(async (user) => {
            const report = await Phonebook.aggregate([
                {
                    $match: {
                        user: user._id,
                        status: { $ne: 'BLOCKED' }
                    }
                },
                {
                    $group: {
                        _id: "$calstatus",
                        count: { $sum: 1 }
                    }
                }
            ]);

            const calstatuses = ['Req to call', 'Convert to Lead', 'No Answer', 'Not Interested', 'Follow Up', 'Offline'];
            const userReport = calstatuses.reduce((acc, status) => {
                acc[status] = report.find(item => item._id === status)?.count || 0;
                return acc;
            }, {});

            return {
                userId: user._id,
                name: user.name,
                email: user.email,
                pipeline: user.pipeline, // Include populated pipeline
                product: user.product, // Include populated product
                report: userReport
            };
        }));

        const response = {
            pipeline: pipeline,
            users: userReports
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Error generating pipeline-specific dashboard report:', error);
        res.status(500).json({ message: 'Error generating dashboard report' });
    }
});
router.post('/pipeline-report', isAuth, async (req, res) => {
    try {
        const { pipelineIds } = req.body;
        if (!pipelineIds || !Array.isArray(pipelineIds) || pipelineIds.length === 0) {
            return res.status(400).json({ message: 'Pipeline IDs are required' });
        }

        const pipelineObjectIds = pipelineIds.map(id => new mongoose.Types.ObjectId(id));

        // Define date ranges
        const today = moment().startOf('day').toDate();
        const yesterday = moment().subtract(1, 'days').startOf('day').toDate();
        const startOfWeek = moment().startOf('isoWeek').toDate();
        const startOfMonth = moment().startOf('month').toDate();

        // Weekly date mapping
        const weeklyDates = Array.from({ length: 7 }, (_, i) => {
            return {
                date: moment().startOf('isoWeek').add(i, 'days').format('YYYY-MM-DD'),
                dayName: moment().startOf('isoWeek').add(i, 'days').format('dddd')
            };
        });

        // Aggregate pipeline to count calstatus occurrences with date filters
        const report = await Phonebook.aggregate([
            {
                $match: {
                    pipeline: { $in: pipelineObjectIds },
                    status: { $ne: 'BLOCKED' } // Exclude BLOCKED status
                }
            },
            {
                $group: {
                    _id: {
                        calstatus: "$calstatus",
                        day: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Define calstatuses to ensure consistent structure
        const calstatuses = ['Req to call', 'Convert to Lead', 'No Answer', 'Not Interested', 'Follow Up', 'Offline'];

        const formatReport = (data, dateFilter) => {
            return calstatuses.reduce((acc, status) => {
                acc[status] = data.filter(item =>
                    item._id.calstatus === status && (!dateFilter || item._id.day === dateFilter)
                ).reduce((sum, cur) => sum + cur.count, 0);
                return acc;
            }, {});
        };

        const weeklyReportData = weeklyDates.map(({ date }) => formatReport(report, date));
        const weeklyTotal = calstatuses.reduce((acc, status) => {
            acc[status] = weeklyReportData.reduce((sum, dayReport) => sum + (dayReport[status] || 0), 0);
            return acc;
        }, {});

        const weeklyReport = weeklyDates.map(({ date, dayName }, index) => ({
            date,
            day: dayName,
            report: weeklyReportData[index]
        }));

        const response = {
            pipelineIds,
            today: formatReport(report, moment(today).format('YYYY-MM-DD')),
            yesterday: formatReport(report, moment(yesterday).format('YYYY-MM-DD')),
            weekly: {
                report: weeklyReport,
                total: weeklyTotal
            },
            monthly: formatReport(report, null)
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('Error generating pipeline-specific report:', error);
        res.status(500).json({ message: 'Error generating pipeline report' });
    }
});
router.put('/update-calstatus/:phonebookId', isAuth, async (req, res) => {
    try {
        const { calstatus } = req.body;
        const { phonebookId } = req.params;

        // Validate the calstatus value
        if (!['Req to call', 'Interested', 'Rejected', 'Convert to Lead', 'No Answer', 'Not Interested', 'Follow Up', 'Offline'].includes(calstatus)) {
            return res.status(400).json({ message: 'Invalid calstatus value' });
        }

        // Find and update the phonebook entry's calstatus
        const phonebookEntry = await Phonebook.findByIdAndUpdate(phonebookId, { calstatus }, { new: true });
        if (!phonebookEntry) {
            return res.status(404).json({ message: 'Phonebook entry not found' });
        }

        res.status(200).json({ message: 'Calstatus updated successfully!', phonebookEntry });
    } catch (error) {
        console.error('Error updating calstatus:', error);
        res.status(500).json({ message: 'Error updating calstatus' });
    }
});
router.post('/upload-csv', isAuth, upload.single('file'), async (req, res) => {
    const requserId = req.user._id;

    try {
        const { userId, pipelineId, visibilityUserId } = req.body;
        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const validPipelineId = pipelineId && pipelineId.trim() !== "" ? pipelineId : null;
        const filePath = path.join(__dirname, '../uploads', req.file.filename);
        const phonebookData = new Map();
        const incorrectNumbers = [];

        const readCSV = () => {
            return new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csvParser({ headers: false, skipLines: 0 }))
                    .on('data', (row) => {
                        let formattedNumber = row[0]?.trim();
                        if (formattedNumber) {
                            formattedNumber = formatPhoneNumber(formattedNumber);
                            if (formattedNumber) {
                                phonebookData.set(formattedNumber, 'Waiting');
                            } else {
                                incorrectNumbers.push(row[0]);
                            }
                        }
                    })
                    .on('end', () => resolve())
                    .on('error', (error) => reject(error));
            });
        };

        const formatPhoneNumber = (number) => {
            number = number.replace(/\s+/g, '');
            if (/^0\d{9}$/.test(number)) return `+971${number.substring(1)}`;
            if (/^971\d{9}$/.test(number)) return `+${number}`;
            if (/^\+\d{12}$/.test(number)) return number;
            return null;
        };

        await readCSV();
        const phoneNumbers = Array.from(phonebookData.keys());

        const existingClients = await Client.find({ phone: { $in: phoneNumbers } }).select('phone').lean();
        const clientPhones = new Set(existingClients.map(client => client.phone));

        const existingPhonebookEntries = await Phonebook.find({ number: { $in: phoneNumbers } }).select('number').lean();
        const existingPhoneNumbers = new Set(existingPhonebookEntries.map(entry => entry.number));

        const existsInClients = [...clientPhones];
        const insertedNumbers = [];
        const skippedNumbers = [];

        const newPhonebookEntries = phoneNumbers
            .filter(number => {
                if (clientPhones.has(number) || existingPhoneNumbers.has(number)) {
                    skippedNumbers.push(number);
                    return false;
                }
                insertedNumbers.push(number);
                return true;
            })
            .map(number => ({
                user: userId,
                pipeline: validPipelineId,
                uploaded_by: requserId,
                number,
                status: 'Waiting',
            }));

        // ✅ LIMIT CHECK: Count numbers with calstatus = "Req to call" for this userId
        const existingCount = await Phonebook.countDocuments({
            user: userId,
            calstatus: 'Req to call',
            status: { $ne: 'BLOCKED' } // Exclude BLOCKED status
        });

        const availableSlots = 500 - existingCount;

        if (availableSlots <= 0) {
            // Delete file
            fs.unlink(filePath, (err) => { if (err) console.error('Error deleting file:', err); });

            return res.status(400).json({
                message: `User already has 500 or more numbers with calstatus 'Req to call'. Upload denied.`,
                insertedNumbers: [],
                skippedNumbers,
                existsInClients,
                incorrectNumbers,
            });
        }

        // Limit the entries to insert based on remaining slots
        const entriesToInsert = newPhonebookEntries.slice(0, availableSlots);

        const pipelineUsers = await User.find({ pipeline: validPipelineId, role: { $in: ['HOD', 'Manager', 'HOM'] } }).lean();
        const allUsers = await User.find({ role: { $in: ['CEO', 'MD', 'Admin'] } }).lean();

        const visibilityUsers = new Set([
            userId,
            visibilityUserId,
            requserId,
            ...pipelineUsers.map(user => user._id.toString()),
            ...allUsers.map(user => user._id.toString()),
        ]);

        if (entriesToInsert.length > 0) {
            await Phonebook.insertMany(entriesToInsert.map(entry => ({
                ...entry,
                visibility: Array.from(visibilityUsers),
            })));
        }

        fs.unlink(filePath, (err) => { if (err) console.error('Error deleting file:', err); });

        res.status(200).json({
            message: `Phonebook processed. Inserted ${entriesToInsert.length} numbers.`,
            insertedNumbers: entriesToInsert.map(e => e.number),
            skippedNumbers,
            existsInClients,
            incorrectNumbers,
        });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ message: 'Error processing request' });
    }
});
// **Router for Admin to Update Phonebook Status**
router.post('/update-phonebook-status', isAuth, upload.single('file'), async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const filePath = path.join(__dirname, '../uploads', req.file.filename);
        const updateData = new Map();
        let updatedCount = 0;
        let updatedNumbers = [];

        const readCSV = () => {
            return new Promise((resolve, reject) => {
                const stream = fs.createReadStream(filePath)
                    .pipe(csvParser({ headers: false, skipLines: 0 }))
                    .on('data', (row) => {
                        const number = row[0]?.trim();
                        const status = row[1]?.trim();
                        if (number && status) {
                            updateData.set(number, status);
                        }
                    })
                    .on('end', () => resolve())
                    .on('error', (error) => reject(error));
            });
        };

        await readCSV();
        const phoneNumbers = Array.from(updateData.keys());
        const existingEntries = await Phonebook.find({ number: { $in: phoneNumbers } });

        for (const entry of existingEntries) {
            const newStatus = updateData.get(entry.number);
            if (entry.status !== newStatus) {
                entry.status = newStatus;
                await entry.save();
                updatedCount++;
                updatedNumbers.push(entry.number);
            }
        }

        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err);
        });

        res.status(200).json({ message: 'Phonebook statuses updated successfully!', updatedCount, updatedNumbers });
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ message: 'Error processing request' });
    }
});
router.post('/update-client-blocklist', isAuth, upload.single('file'), async (req, res) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const filePath = path.join(__dirname, '../uploads', req.file.filename);
        const updateData = new Map();
        const invalidRows = [];
        let updatedClients = [];
        let unchangedClients = [];
        let notFoundNumbers = [];

        // Step 1: Read CSV and collect valid phone/status
        const readCSV = () => {
            return new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csvParser({ headers: false, skipLines: 0 }))
                    .on('data', (row, index) => {
                        const number = row[0]?.trim();
                        const status = row[1]?.trim()?.toUpperCase();

                        if (number && ['BLOCKED', 'UNBLOCKED'].includes(status)) {
                            updateData.set(number, status);
                        } else {
                            invalidRows.push({ row, reason: 'Invalid number or status' });
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
        };

        await readCSV();

        const phoneNumbers = Array.from(updateData.keys());

        if (phoneNumbers.length === 0) {
            fs.unlink(filePath, () => { });
            return res.status(400).json({
                message: 'No valid phone numbers found in the file.',
                invalidRows
            });
        }

        const existingClients = await Client.find({ phone: { $in: phoneNumbers } });
        const foundPhoneSet = new Set(existingClients.map(c => c.phone));

        for (const number of phoneNumbers) {
            if (!foundPhoneSet.has(number)) {
                notFoundNumbers.push(number);
            }
        }

        for (const client of existingClients) {
            const newStatus = updateData.get(client.phone);
            const currentStatus = (client.dncr_status || '').trim().toUpperCase();

            if (currentStatus !== newStatus) {
                client.dncr_status = newStatus;
                await client.save();
                updatedClients.push({ phone: client.phone, newStatus });
            } else {
                unchangedClients.push({ phone: client.phone, status: currentStatus });
            }
        }

        // Delete uploaded file
        fs.unlink(filePath, () => { });

        // Final response
        res.status(200).json({
            message: 'Client DNCR update process completed.',
            updatedCount: updatedClients.length,
            unchangedCount: unchangedClients.length,
            notFoundCount: notFoundNumbers.length,
            invalidRowCount: invalidRows.length,
            updatedClients,
            unchangedClients,
            notFoundNumbers,
            invalidRows
        });

    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});
router.get('/get-all-waiting', isAuth, async (req, res) => {
    try {
        // Make sure req.user is populated by your authentication middleware
        const userId = req.user?._id; // Use optional chaining to avoid errors if req.user is undefined

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Query to find phonebook entries where calstatus is not 'Convert to Lead' and visibility includes req.user._id
        const phonebookEntries = await Phonebook.find({
            calstatus: { $ne: 'Convert to Lead' },
            status: 'Waiting',
            visibility: userId // Match documents where visibility array contains the userId
        })
            .populate('user', 'name')
            .populate('pipeline', 'name')
            .populate('visibility', 'name role')
            .populate('uploaded_by', 'name role')
            .populate({
                path: 'messages',
                populate: [
                    {
                        path: 'user',
                        select: 'name image', // Fetch only user name and image
                    },
                    // {
                    //     path: 'client',
                    //     select: 'name email', // Fetch only client name and email
                    // },
                    // {
                    //     path: 'lead',
                    //     select: 'lead_name status', // Fetch lead name and status
                    // },
                    // {
                    //     path: 'phonenumber',
                    //     select: 'number', // Fetch phone number from Phonebook
                    // }
                ]
            })


            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'name image', // Only fetch the name of the user who made the comment
                }
            });

        res.status(200).json(phonebookEntries);
    } catch (error) {
        console.error('Error fetching phonebook entries:', error);
        res.status(500).json({ message: 'Error fetching phonebook entries' });
    }
});
router.get('/get-all-phonebook', isAuth, async (req, res) => {
    try {
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const { calstatus } = req.query; // Use query parameters instead of body
        if (!calstatus) {
            return res.status(400).json({ message: 'calstatus is required' });
        }

        const query = {
            status: 'UNBLOCKED',
            visibility: userId,
            calstatus: calstatus // Only return entries with this calstatus
        };

        const phonebookEntries = await Phonebook.find(query)
            .populate('user', 'name')
            .populate('pipeline', 'name')
            .populate('visibility', 'name role')
            .populate('uploaded_by', 'name role')
            .populate({
                path: 'messages',
                populate: {
                    path: 'user',
                    select: 'name image'
                }
            })
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'name image'
                }
            });

        res.status(200).json(phonebookEntries);
    } catch (error) {
        console.error('Error fetching phonebook entries:', error);
        res.status(500).json({ message: 'Error fetching phonebook entries' });
    }
});
router.post('/add-comment', isAuth, async (req, res) => {
    try {
        const { phonebookId, comment } = req.body;

        // Validate required fields 
        if (!phonebookId || !comment) {
            return res.status(400).json({ message: 'Phonebook ID and comment are required' });
        }

        // Find the phonebook entry
        const phonebookEntry = await Phonebook.findById(phonebookId);
        if (!phonebookEntry) {
            return res.status(404).json({ message: 'Phonebook entry not found' });
        }

        // Create a new comment
        const newComment = new Comment({
            user: req.user._id,
            remarks: comment,
        });
        await newComment.save();

        // Add the comment to the phonebook entry's comments array
        phonebookEntry.comments.push(newComment._id);
        await phonebookEntry.save();

        res.status(200).json({ message: 'Comment added successfully!', comment: newComment });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ message: 'Error adding comment' });
    }
});
// New Route: Get all phonebook entries with status "BLOCKED"
router.get('/get-blocked-numbers', isAuth, async (req, res) => {
    try {

        const blockedEntries = await Phonebook.find({ status: 'BLOCKED' })
            .populate('user', 'name email')
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'name',
                }
            });

        res.status(200).json(blockedEntries);
    } catch (error) {
        console.error('Error fetching blocked phonebook entries:', error);
        res.status(500).json({ message: 'Error fetching blocked phonebook entries' });
    }
});
router.get('/get-leads-numbers', isAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const leadEntries = await Phonebook.find({ visibility: userId, calstatus: 'Convert to Lead' })
            .populate('user', 'name email')
            .populate('pipeline', 'name')
            .populate({
                path: 'lead_id',
                select: 'selected_users pipeline_id product_stage is_converted is_reject', // Selecting only selected_users field
                populate: {
                    path: 'selected_users pipeline_id product_stage', // Populating selected_users
                    select: 'name' // Selecting only the name field of selected_users
                }
            })
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'name',
                }
            });

        res.status(200).json(leadEntries);
    } catch (error) {
        console.error('Error fetching leads phonebook entries:', error);
        res.status(500).json({ message: 'Error fetching leads phonebook entries' });
    }
});
// router.post('/search-phonebook', isAuth, async (req, res) => {
//     try {
//         const userId = req.user?._id; // Ensure the user is authenticated
//         const { number } = req.body; // Get the number from the request body

//         // if (!userId) {
//         //     return res.status(401).json({ message: 'Unauthorized' });
//         // }

//         if (!number) {
//             return res.status(400).json({ message: 'Phone number is required' });
//         }

//         // Query to find phonebook entries where the phone number matches
//         // and calstatus is not 'Convert to Lead', status is 'UNBLOCKED', 
//         // and the visibility includes the userId
//         const phonebookEntries = await Phonebook.find({
//             phonenumber: number, // Searching by phone number
//             // calstatus: { $ne: 'Convert to Lead' },
//             // status: 'UNBLOCKED',
//             // visibility: userId // Ensure the user has access
//         })
//             .populate('user', 'name')
//             .populate('pipeline', 'name')
//             .populate('visibility', 'name role')
//             .populate('uploaded_by', 'name role')
//             .populate({
//                 path: 'messages',
//                 populate: {
//                     path: 'user',
//                     select: 'name image',
//                 }
//             })
//             .populate({
//                 path: 'comments',
//                 populate: {
//                     path: 'user',
//                     select: 'name image',
//                 }
//             });

//         res.status(200).json(phonebookEntries);
//     } catch (error) {
//         console.error('Error searching phonebook:', error);
//         res.status(500).json({ message: 'Error searching phonebook' });
//     }
// });
module.exports = router;