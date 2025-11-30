const express = require('express');
const WebhookData = require('./models/WebhookDataModel');
const router = express.Router();
const axios = require('axios'); // For making HTTP requests
const mongoose = require('mongoose');
const Client = require('./models/clientModel');
const Lead = require('./models/leadModel');
const ProductStage = require('./models/leadModel');
// Use environment variables for sensitive information
const accessToken = 'EAAOOXlDeZC2YBO17Ab5STv55biUdJ1hzZBkHc7DYGNiYwUwwZCCPVu6zYAZAZAdzOWw6zluu3XaesHcRpDnZAJNQ9oRJSJqcn7ZAlEORK3ll2yMArIOh6DWLgu6XNHfAUSsFZC3EcVIetnazFGQKozv4vx3k9TRc9OSLyHSD9HeTVkpC2ynidIloIntRIR1DIIY9MmGqzCnPOknZAWwsZD'; // Use environment variable
const pageId = '143714195492214'; // Use environment variable
const bcrypt = require('bcrypt'); 
const User = require('./models/userModel');

// GET leads for Mortgage (Fetch and process leads from Facebook API)
router.get('/leads-for-mortgage', async (req, res) => {
    const { formId } = req.body;

    try {
        const leads = [];

        // Recursive function to fetch all leads
        const fetchLeads = async (url) => {
            const response = await axios.get(url);

            const leadsData = response.data.data;
            leads.push(...leadsData); // Add leads to the array

            // If there's a next page, fetch it recursively
            if (response.data.paging && response.data.paging.next) {
                await fetchLeads(response.data.paging.next);
            }
        };

        // Initial call to fetch the first page
        const initialUrl = `https://graph.facebook.com/v20.0/3971935923128649/leads?access_token=EAAOOXlDeZC2YBO5CLhZCqcofGgYJHSZAGRI8C46ZBSdgnS0wjKnvwQlbVi62L1lOn5KfszYGH4QE73dPK7FIuWblf0E1rhEPZAlLTvZBvomOKMn8uySFA3JosKksnxk6JFfuaCmJcZCDdcWavLySiKMrLgGtpHsJq9YokZAmlUknVe1NPqMonWuclBRSIWbdRIrjxi8fD6FH8xXwQ9rkyU9rlPcLevDfZB7480gZDZD`;
        await fetchLeads(initialUrl);

        // Process each lead
        for (const lead of leads) {
            let phoneNumber, fullName, email, description = "", whatsappNumber;

            // Extract field data
            lead.field_data.forEach(field => {
                if (field.values && field.values.length > 0) {
                    switch (field.name) {
                        case 'phone_number':
                            phoneNumber = field.values[0];
                            break;
                        case 'full_name':
                            fullName = field.values[0];
                            break;
                        case 'email':
                            email = field.values[0];
                            break;
                        case 'whatsapp_number':
                            whatsappNumber = field.values[0];
                            break;
                        default:
                            description += `• ${field.name}: ${field.values[0]}\n`;
                            break;
                    }
                }
            });

            // Ensure phoneNumber exists before continuing
            if (!phoneNumber) {
                console.log('No phone number found for lead:', lead.id);
                continue; // Skip this lead if phone number is missing
            }

            // Check if the client with the given phone number already exists
            const existingClient = await Client.findOne({ phone: phoneNumber });
            if (!existingClient) {
                // Validate WhatsApp number (only add it if it's a valid number)
                const w_phone = isValidPhoneNumber(whatsappNumber) ? whatsappNumber : phoneNumber;

                // Create new client if not found
                const newClient = new Client({
                    phone: phoneNumber,
                    name: fullName || '',
                    email: email || '',
                    password: await bcrypt.hash('123', 10), // Default password for the client
                    w_phone: w_phone, // Set the WhatsApp number or phone number
                });
                await newClient.save();

                // Get users with different roles (CEO, superadmin, MD, Marketing, Developer)
                const ceoUsers = await User.find({ role: 'CEO' }).select('_id');
                const superadminUsers = await User.find({ role: 'superadmin' }).select('_id');
                const mdUsers = await User.find({ role: 'MD' }).select('_id');
                const marketingUsers = await User.find({ role: 'Marketing' }).select('_id');
                const developerUsers = await User.find({ role: 'Developer' }).select('_id');

                // Combine all user IDs
                const allSelectedUserIds = [
                    ...ceoUsers.map(user => user._id.toString()),
                    ...superadminUsers.map(user => user._id.toString()),
                    ...mdUsers.map(user => user._id.toString()),
                    ...marketingUsers.map(user => user._id.toString()),  // Marketing users
                    ...developerUsers.map(user => user._id.toString())   // Developer users
                ];

                // Function to get unique user IDs
                const getUniqueUserIds = (userIds) => {
                    const uniqueUserMap = {};
                    userIds.forEach(id => {
                        if (!uniqueUserMap[id]) {
                            uniqueUserMap[id] = true;
                        }
                    });
                    return Object.keys(uniqueUserMap);
                };

                const uniqueUserIds = getUniqueUserIds(allSelectedUserIds);

                // Create a new lead
                const newLead = new Lead({
                    client: newClient._id,
                    created_by: new mongoose.Types.ObjectId('670f66e1f9ac6ff8a5005e9c'), // Assuming req.user contains the authenticated user
                    selected_users: uniqueUserIds,
                    pipeline_id: null,
                    lead_type: new mongoose.Types.ObjectId('670f66538845591ec1684071'),
                    source: new mongoose.Types.ObjectId('670f66538845591ec1684079'),
                    product_stage: null,
                    products: new mongoose.Types.ObjectId('670f66538845591ec16840ce'),
                    branch: null,
                    description: description.trim(),
                });
                await newLead.save();
            } else {
                console.log(`Lead with phone ${phoneNumber} already exists. Skipping.`);
            }
        }

        res.status(200).json({ message: 'Leads processed successfully' });
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ error: error.message });
    }
});



router.get('/leads-for-bussiness', async (req, res) => {
  try {
      const response = await axios.get(
          `https://graph.facebook.com/v20.0/1247157399748890/leads?access_token=EAAOOXlDeZC2YBO17Ab5STv55biUdJ1hzZBkHc7DYGNiYwUwwZCCPVu6zYAZAZAdzOWw6zluu3XaesHcRpDnZAJNQ9oRJSJqcn7ZAlEORK3ll2yMArIOh6DWLgu6XNHfAUSsFZC3EcVIetnazFGQKozv4vx3k9TRc9OSLyHSD9HeTVkpC2ynidIloIntRIR1DIIY9MmGqzCnPOknZAWwsZD`
      );

      const leadsData = response.data.data;

      for (const lead of leadsData) {
          let phoneNumber, fullName, email, whatsappNumber, companyName, description = "";

          // Extract field data
          lead.field_data.forEach(field => {
              if (field.values && field.values.length > 0) {
                  switch (field.name) {
                      case 'phone_number':
                          phoneNumber = field.values[0];
                          break;
                      case 'full_name':
                          fullName = field.values[0];
                          break;
                      case 'email':
                          email = field.values[0];
                          break;
                      case 'whatsapp_number':
                          whatsappNumber = field.values[0];
                          break;
                      case 'company_name':
                          companyName = field.values[0]; // Extracting company name
                          break;
                      default:
                          description += `• ${field.name}: ${field.values[0]}`; // Bullet style description
                          break;
                  }
              }
          });

          // Ensure phoneNumber exists before continuing
          if (!phoneNumber) {
              console.log('No phone number found for lead:', lead.id);
              continue; // Skip this lead if phone number is missing
          }

          // Check if the client with the given phone number already exists
          const existingClient = await Client.findOne({ phone: phoneNumber });
          if (!existingClient) {
              // Create new client if not found
              const newClient = new Client({
                  phone: phoneNumber,
                  w_phone: whatsappNumber && !isNaN(whatsappNumber) ? whatsappNumber : undefined, // Save w_phone if valid
                  name: fullName || '',
                  email: email || '',
                  password: await bcrypt.hash('123', 10) // Default password for the client
              });
              await newClient.save();

              // Get selected_users (based on roles) for the lead
              const ceoUsers = await User.find({ role: 'CEO' }).select('_id');
              const superadminUsers = await User.find({ role: 'superadmin' }).select('_id');
              const mdUsers = await User.find({ role: 'MD' }).select('_id');
              const managerAndHodUsers = await User.find({
                  role: { $in: ['Manager', 'HOD'] },
                  pipeline: new mongoose.Types.ObjectId('66fbfab467408d01c35f0e7a'),
                  branch: new mongoose.Types.ObjectId('66fbfc798344a6302d979bd2')
              }).select('_id');

              const allSelectedUserIds = [
                  ...ceoUsers.map(user => user._id.toString()),
                  ...superadminUsers.map(user => user._id.toString()),
                  ...mdUsers.map(user => user._id.toString()),
                  ...managerAndHodUsers.map(user => user._id.toString())
              ];

              // Function to get unique user IDs
              const getUniqueUserIds = (userIds) => {
                  const uniqueUserMap = {};
                  userIds.forEach(id => {
                      if (!uniqueUserMap[id]) {
                          uniqueUserMap[id] = true;
                      }
                  });
                  return Object.keys(uniqueUserMap);
              };

              const uniqueUserIds = getUniqueUserIds(allSelectedUserIds); 

              // Create a new lead
              const newLead = new Lead({
                  client: newClient._id,
                  created_by: new mongoose.Types.ObjectId('66fbfab4aece6120f7af55f2'), // Assuming req.user contains the authenticated user
                  selected_users: uniqueUserIds,
                  pipeline_id: new mongoose.Types.ObjectId('66fbfab467408d01c35f0e7a'),
                  lead_type: new mongoose.Types.ObjectId('66fbfab467408d01c35f0e83'),
                  source: new mongoose.Types.ObjectId('66fbfab467408d01c35f0e8a'),
                  product_stage: new mongoose.Types.ObjectId('66fbfad067408d01c35fbddc'),
                  products: new mongoose.Types.ObjectId('66fbfab467408d01c35f0ede'),
                  branch: new mongoose.Types.ObjectId('66fbfc798344a6302d979bd2'),
                  description: description.trim(),
                  company_Name: companyName || '', // Insert company name
              });
              await newLead.save();
          } else {
              console.log(`Lead with phone ${phoneNumber} already exists. Skipping.`);
          }
      }

      res.status(200).json({ message: 'Leads processed successfully' });
  } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ error: error.message });
  }
});




module.exports = router;
