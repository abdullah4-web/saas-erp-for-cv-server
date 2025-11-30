const mongoose = require("mongoose");
const fs = require("fs");
const csvParser = require("csv-parser");
const Client = require("./models/clientModel");
const Lead = require("./models/leadModel");

const MONGO_URI = "mongodb://localhost:27017/joveraDB";
const CSV_FILE_PATH = "./phonebook.csv";
const OUTPUT_FILE = "./updated_leads.json";

// Function to read CSV and parse phone numbers with statuses
async function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const blocklist = new Map();
    fs.createReadStream(filePath)
      .pipe(csvParser({ headers: false, separator: "," }))
      .on("data", (row) => {
        const phone = row["0"]?.trim();
        const status = row["1"]?.trim().toUpperCase();
        if (phone && status) {
          blocklist.set(phone, status);
        } else {
          console.warn("Skipping invalid row:", row);
        }
      })
      .on("end", () => resolve(blocklist))
      .on("error", (error) => reject(error));
  });
}

async function updateBlockedLeads() {
  let updatedLeadIds = [];
  let updatedCount = 0;

  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Read the blocklist from CSV
    const blocklist = await readCSV(CSV_FILE_PATH);
    console.log(`CSV Data Loaded. ${blocklist.size} records found.`);

    // Fetch clients whose phone numbers exist in the blocklist
    const clients = await Client.find({ phone: { $in: [...blocklist.keys()] } }).lean();

    for (const client of clients) {
      const phoneStatus = blocklist.get(client.phone);

      console.log(`Checking Client Phone: ${client.phone} - Status: ${phoneStatus}`);

      if (phoneStatus === "BLOCKED") {
        // Update leads in bulk for better performance
        const result = await Lead.updateMany(
          { client: client._id },
          { $set: { is_blocklist_number: true } }
        );

        // Fetch the updated lead IDs
        const leadIds = await Lead.find({ client: client._id, is_blocklist_number: true })
          .select("_id")
          .lean();
        
        updatedLeadIds.push(...leadIds.map((lead) => lead._id));
        updatedCount += result.modifiedCount;

        console.log(`  Updated ${result.modifiedCount} leads for client ${client._id}`);
      }
    }

    console.log(`Total Leads Updated: ${updatedCount}`);

    // Save only lead IDs to the file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updatedLeadIds, null, 2));
    console.log(`Updated lead IDs saved to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error("Error updating leads:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run the update process
updateBlockedLeads();