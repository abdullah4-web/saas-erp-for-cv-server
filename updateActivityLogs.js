// scripts/updateActivityLogs.js

const mongoose = require('mongoose');
const Lead = require('./models/leadModel');
const ActivityLog = require('./models/activityLogModel');

const MONGODB_URI = 'mongodb://localhost:27017/newdemo'; // 🔁 replace with your DB

async function updateActivityLogs() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    const leads = await Lead.find().select('_id activity_logs');

    let updatedCount = 0;

    for (const lead of leads) {
      const { _id: leadId, activity_logs } = lead;

      for (const logId of activity_logs) {
        const updated = await ActivityLog.updateOne(
          { _id: logId },
          { $set: { lead_id: leadId } }
        );

        if (updated.modifiedCount > 0) updatedCount++;
      }
    }

    console.log(`✅ Successfully updated ${updatedCount} activity logs with lead_id`);
  } catch (err) {
    console.error('❌ Error updating activity logs:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

updateActivityLogs();
