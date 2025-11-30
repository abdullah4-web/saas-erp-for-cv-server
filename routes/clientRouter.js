// routes/clientRouter.js
const express = require('express');
const router = express.Router();
const Client = require('../models/clientModel'); // Adjust the path to your Client model
const contractModel = require('../models/contractModel');
const leadModel = require('../models/leadModel');

router.get('/get-clinets', async (req, res) => {
  try {
    const clients = await Client.find(); 
    res.status(200).json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ message: 'Error fetching clients' });
  }
});

router.get('/get-client/:e_id', async (req, res) => {
  const { e_id } = req.params;

  try {
    // Find client by e_id
    const client = await Client.findOne({ e_id });

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Fetch associated contracts
    const contracts = await contractModel.find({ client_id: client._id })
      .populate('lead_type pipeline_id source_id products branch contract_stage selected_users')
      .populate({
        path: 'contract_activity_logs',
        select: 'activity description timestamp', // Example: Include specific fields
      });

    // Fetch associated leads
    const leads = await leadModel.find({ client: client._id })
      .populate('created_by ref_user selected_users pipeline_id stage product_stage lead_type source products branch')
      .populate({
        path: 'activity_logs',
        select: 'activity description timestamp',
      })
      .populate({
        path: 'discussions',
        select: 'message user date',
      })
      .populate({
        path: 'files',
        select: 'file_name file_url uploaded_by',
      })
      .populate({
        path: 'labels',
        select: 'name color',
      })
      .populate({
        path: 'messages',
        select: 'content sender timestamp',
      });

    res.status(200).json({ client, contracts, leads });
  } catch (error) {
    console.error('Error fetching client, contracts, and leads:', error);
    res.status(500).json({ message: 'Error fetching client, contracts, and leads' });
  }
});


module.exports = router;
 