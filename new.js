const mongoose = require('mongoose');
const Lead = require('./models/leadModel');
const ActivityLog = require('./models/activityLogModel'); // Make sure you have the correct path to your ActivityLog model

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/13May2025', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const DEFAULT_REJECTED_BY = "67bb0cf67e856042f069a2a4";

async function updateRejectedLeads() {
  try {
    // Find all rejected leads
    const rejectedLeads = await Lead.find({ is_reject: true }).exec();

    console.log(`Found ${rejectedLeads.length} rejected leads to process`);

    let processedCount = 0;
    let updatedCount = 0;

    for (const lead of rejectedLeads) {
      processedCount++;
      
      // Skip if already has rejected_by
      if (lead.rejected_by) {
        console.log(`Lead ${lead._id} already has rejected_by, skipping...`);
        continue;
      }

      // Get all activity logs for this lead
      const activityLogs = await ActivityLog.find({ 
        _id: { $in: lead.activity_logs },
        log_type: "Reject Lead"
      })
      .sort({ created_at: -1 }) // Sort by date descending to get latest first
      .exec();

      let rejectedBy = DEFAULT_REJECTED_BY;

      if (activityLogs.length > 0) {
        // Get the latest Reject Lead activity
        const latestRejectActivity = activityLogs[0];
        rejectedBy = latestRejectActivity.user_id._id || latestRejectActivity.user_id;
        
        console.log(`Found Reject Lead activity for lead ${lead._id}, user_id: ${rejectedBy}`);
      } else {
        console.log(`No Reject Lead activity found for lead ${lead._id}, using default`);
      }

      // Update the lead
      lead.rejected_by = rejectedBy;
      await lead.save();
      updatedCount++;

      console.log(`Updated lead ${lead._id} with rejected_by: ${rejectedBy}`);
    }

    console.log(`Process completed. Processed ${processedCount} leads, updated ${updatedCount} leads.`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating rejected leads:', error);
    process.exit(1);
  }
}

updateRejectedLeads();