const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const router = express.Router();

// Endpoint to get all databases
router.get('/get-databases', async (req, res) => {
  try {
    const admin = mongoose.connection.db.admin();
    const databases = await admin.listDatabases();
    res.json(databases.databases);  // Send list of databases
  } catch (err) {
    console.error('Error fetching databases:', err);
    res.status(500).send('Failed to fetch databases');
  }
});

// Endpoint to trigger the database dump
router.get('/dump-database', (req, res) => {
  const { dbName, outputDir } = req.query; // Get database name and output directory from query params
  
  if (!dbName || !outputDir) {
    return res.status(400).send('Missing required parameters: dbName or outputDir');
  }

  // Ensure the directory exists, or create it
  const dumpPath = path.join(outputDir, dbName);
  fs.mkdirSync(dumpPath, { recursive: true });

  // Execute the mongodump command with dynamic database name and output directory
  exec(`mongodump --db ${dbName} --out ${dumpPath}`, (err, stdout, stderr) => {
    if (err) {
      console.error('Error dumping database:', err);
      return res.status(500).send('Failed to dump the database.');
    }
    console.log('Database dump completed:', stdout);
    res.send('Database dump completed successfully.');
  });
});

module.exports = router;
