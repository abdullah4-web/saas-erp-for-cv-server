const mongoose = require('mongoose');
const Client = require('./models/clientModel'); // Assuming Client model is in 'models/Client.js'
const Lead = require('./models/leadModel'); // Assuming Lead model is in 'models/Lead.js'

mongoose.connect('mongodb://localhost:27017/joveraDB', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Database connected');
    deleteClientsWithNoLeads();
  })
  .catch(err => {
    console.error('Error connecting to the database:', err);
  });

async function deleteClientsWithNoLeads() {
  let deletedCount = 0; // Initialize the counter for deleted clients
  try {
    // Find all clients
    const clients = await Client.find();

    for (let client of clients) {
      // Check if the client has any associated leads
      const lead = await Lead.findOne({ client: client._id });

      // If no lead is found, delete the client
      if (!lead) {
        console.log(`Deleting client: ${client.name} (ID: ${client._id})`);
        await Client.deleteOne({ _id: client._id });
        deletedCount++; // Increment the deleted counter
        console.log(`Client deleted: ${client.name} (ID: ${client._id})`);
      }
    }
    console.log(`Deletion process completed. Total clients deleted: ${deletedCount}`);
  } catch (error) {
    console.error('Error during deletion process:', error);
  } finally {
    // Close the database connection
    mongoose.connection.close();
  }
}