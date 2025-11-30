const ActivityLog = require("../models/activityLogModel");
const express = require("express");
const Lead = require("../models/leadModel");
const User = require("../models/userModel");
const router = express.Router();



router.get("/logs", async (req, res) => {
  try {
    const now = new Date();

    const ranges = {
      yesterday: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      },
      today: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      },
      thisWeek: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay())),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() + 7))
      },
      thisMonth: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      }
    };

    const results = await Promise.all(
      Object.entries(ranges).map(async ([period, range]) => {
        const logs = await ActivityLog.find({
          created_at: { $gte: range.start, $lt: range.end }
        })
          .populate("user_id", "name")
          .populate({
            path: "lead_id",
            populate: { path: "client", select: "name phone" }
          });

        return { period, data: processLogs(logs) };
      })
    );

    // Transform results into final format
    const response = {};
    results.forEach(({ period, data }) => {
      response[period] = {
        "Lead Created": data["Lead Created"].count,
        "Lead Created_logs": data["Lead Created"].logs,
        "Lead Update": data["Lead Update"].count,
        "Lead Update_logs": data["Lead Update"].logs,
        "Reject Lead": data["Reject Lead"].count,
        "Reject Lead_logs": data["Reject Lead"].logs
      };
    });

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// Grouped log types
const LOG_CATEGORIES = {
  "Lead Created": [
    "Create Lead", "Lead Created", "Lead Restoration"
  ],
  "Lead Update": [
    "Update Lead", "Update Sources", "Upload File", "file_upload",
    "Add Product", "Add User", "Add Users",
    "Discussion Added", "File Deleted", "File Uploaded",
    "Lead Conversion", "Lead Movement", "Lead Transfer",
    "Move", "Move Lead", "Product Stage Update"
  ],
  "Reject Lead": [
    "Reject Lead"
  ]
};

// Helper to map log type to category
const getLogCategory = (logType) => {
  for (const [category, types] of Object.entries(LOG_CATEGORIES)) {
    if (types.includes(logType)) return category;
  }
  return null;
};

// Process logs into categories
const processLogs = (logs) => {
  const result = {
    "Lead Created": { count: 0, logs: [] },
    "Lead Update": { count: 0, logs: [] },
    "Reject Lead": { count: 0, logs: [] }
  };

  logs.forEach(log => {
    const category = getLogCategory(log.log_type);
    if (!category) return;

    const userName = log.user_id?.name === "Admin" ? "System" : log.user_id?.name;

    result[category].count++;
    result[category].logs.push({
      id: log._id,
      logType: log.log_type,
      userId: log.user_id?._id || null,
      userName: userName || null,
      leadId: log.lead_id?._id || null,
      clientName: log.lead_id?.client?.name || null,
      clientPhone: log.lead_id?.client?.phone || null,
      productStage: log.lead_id?.product_stage?.name || null,
      selectedUsers: Array.isArray(log.lead_id?.selected_users)
        ? log.lead_id.selected_users.map(u => u?.name).filter(Boolean)
        : [],
      action: log.remark || null,
      createdAt: log.created_at
    });
  });

  return result;
};

// GET /logs/user/:userId
router.get("/logs/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const now = new Date();

    // Validate user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const ranges = {
      yesterday: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      },
      today: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      },
      thisWeek: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay())),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() + 7))
      },
      thisMonth: {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      }
    };

    const results = await Promise.all(
      Object.entries(ranges).map(async ([period, range]) => {
        const logs = await ActivityLog.find({
          created_at: { $gte: range.start, $lt: range.end },
          user_id: userId
        })
          .populate("user_id", "name")
          .populate({
            path: "lead_id",
            populate: [
              { path: "client", select: "name phone" },
              { path: "product_stage", select: "name" },
              { path: "selected_users", select: "name" }
            ]
          });

        return { period, data: processLogs(logs) };
      })
    );

    // Build response
    const response = {
      userId,
      userName: user.name === "Admin" ? "System" : user.name,
      activity: {}
    };

    results.forEach(({ period, data }) => {
      response.activity[period] = {
        "Lead Created": data["Lead Created"].count,
        "Lead Created_logs": data["Lead Created"].logs,
        "Lead Update": data["Lead Update"].count,
        "Lead Update_logs": data["Lead Update"].logs,
        "Reject Lead": data["Reject Lead"].count,
        "Reject Lead_logs": data["Reject Lead"].logs
      };
    });

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching user logs:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;