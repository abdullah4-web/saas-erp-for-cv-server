const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Phonebook = require('./models/phonebookModel'); // Adjust the path to your actual model

dotenv.config(); // Load .env for DB connection

const cleanupPhonebook = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Step 1: Get users with > 400 'Req to call' entries excluding BLOCKED
    const usersWithCounts = await Phonebook.aggregate([
      { $match: { calstatus: 'Req to call', status: { $ne: 'BLOCKED' } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $match: { count: { $gt: 400 } } }
    ]);

    for (const userData of usersWithCounts) {
      const userId = userData._id;

      // Step 2: Get IDs of entries to delete (skip the latest 400)
      const entriesToDelete = await Phonebook.find({
        user: userId,
        calstatus: 'Req to call',
        status: { $ne: 'BLOCKED' }
      })
        .sort({ createdAt: -1 })
        .skip(400)
        .select('_id');

      const idsToDelete = entriesToDelete.map(entry => entry._id);

      if (idsToDelete.length > 0) {
        // Step 3: Delete the extra entries
        await Phonebook.deleteMany({ _id: { $in: idsToDelete } });
        console.log(`🧹 User ${userId}: Deleted ${idsToDelete.length} extra 'Req to call' entries (excluding BLOCKED).`);
      }
    }

    console.log('✅ Cleanup complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error cleaning phonebook:', err);
    process.exit(1);
  }
};

cleanupPhonebook();
