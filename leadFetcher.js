const axios = require('axios');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const LeadFetchConfig = require('./models/LeadFetchConfigModel');
const Lead = require('./models/leadModel');
const Client = require('./models/clientModel');
const User = require('./models/userModel');
const bcrypt = require('bcrypt');
const https = require('https');
const ActivityLog = require('./models/activityLogModel');
const leadDiscussionModel = require('./models/leadDiscussionModel');
const accountSid = '0';


async function sendEmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'joveramarketing@gmail.com',
      pass: 'uodm poqm xgcv mkeh' // Replace with secure email password
    }
  });
  const recipients = Array.isArray(to) ? to : [to];
  const mailOptions = {
    from: 'joveramarketing@gmail.com',
    to: recipients.join(', '), // Join multiple emails with comma
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', recipients);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}


// Helper function to get the date 24 hours ago
function get24HoursAgo() {
  const date = new Date();
  date.setHours(date.getHours() - 28);
  return date;
}

// Helper function to format phone number
function formatPhoneNumber(phoneNumber) {
  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, '');
  if (cleanedPhoneNumber.startsWith('971')) {
    return `+${cleanedPhoneNumber}`;
  }
  if (cleanedPhoneNumber.length === 10) {
    return `+971${cleanedPhoneNumber.slice(1)}`;
  }
  if (!cleanedPhoneNumber.startsWith('971')) {
    return `+971${cleanedPhoneNumber}`;
  }
  return `+${cleanedPhoneNumber}`;
}


async function fetchAndStoreLeads() {
  try {
    const configs = await LeadFetchConfig.find();
    const since = get24HoursAgo();
    const agent = new https.Agent({ rejectUnauthorized: false });

    for (const config of configs) {
      const emailRecipients = config.notificationEmails || ['abdullahjovera@gmail.com'];
      let totalLeadsInserted = 0, totalLeadsSkipped = 0, totalLeadsRestored = 0, totalLeadsNotified = 0, totalLeadsConverted = 0;
      const insertedLeads = [], skippedLeads = [], restoredLeads = [], notifiedLeads = [], convertedLeads = [];
      const leads = [];
      const MAX_LEADS = 100; // Limit to 100 leads
      const fetchLeads = async (url) => {
        const response = await axios.get(url, {
          httpsAgent: agent,
          timeout: 450000  // Set timeout to 60 seconds (or a value that fits your need)
        });
        leads.push(...response.data.data);
        if (response.data.paging?.next) {
          await fetchLeads(response.data.paging.next);
        }
      };

      await fetchLeads(`https://graph.facebook.com/v20.0/${config.formId}/leads?access_token=${config.accessToken}&limit=${MAX_LEADS}`);
      const recentLeads = leads.filter(lead => new Date(lead.created_time) >= since);

      const generalUsers = await User.find({
        role: { $in: ['CEO', 'Admin', 'MD', 'Marketing', 'Developer'] }
      }).select('_id');
      const generalUserIds = generalUsers.map(user => user._id.toString());

      for (const lead of recentLeads) {
        let leadData = { description: '' };

        lead.field_data.forEach(field => {
          if (field.values?.length) {
            const fieldValue = field.values.join(', ');
            switch (field.name) {
              case 'phone_number': leadData.phoneNumber = fieldValue; break;
              case 'company_name': leadData.company_name = fieldValue; break;
              case 'full_name': leadData.fullName = fieldValue; break;
              case 'full name': leadData.full_Name = fieldValue; break;
              case 'email': leadData.email = fieldValue; break;
              case 'whatsapp_number': leadData.whatsappNumber = fieldValue; break;
              default: leadData.description += `• ${field.name.replace(/_/g, ' ')}: ${fieldValue}\n`;
            }
          }
        });

        leadData.phoneNumber = formatPhoneNumber(leadData.phoneNumber);
        leadData.whatsappNumber = formatPhoneNumber(leadData.whatsappNumber || leadData.phoneNumber);
        let existingClient = await Client.findOne({ phone: leadData.phoneNumber });

        if (!existingClient) {
          existingClient = new Client({
            phone: leadData.phoneNumber,
            name: leadData.fullName || leadData.full_Name || '',
            email: leadData.email || '',
            password: await bcrypt.hash('123', 10),
            w_phone: leadData.whatsappNumber || leadData.phoneNumber
          });
          await existingClient.save();
        }

        let existingLead = await Lead.findOne({ client: existingClient._id });

        if (!existingLead) {
          const newLead = new Lead({
            client: existingClient._id,
            company_Name: leadData.company_name || '',
            created_by: '67bb0cf67e856042f069a2a4',
            selected_users: [...generalUserIds],
            pipeline_id: config.pipeline_id || null,
            lead_type: config.lead_type,
            source: config.source,
            product_stage: config.product_stage || null,
            products: config.products,
            branch: config.branch || null,
            description: leadData.description.trim(),
            created_at: new Date(lead.created_time)
          });
          const savedLead = await newLead.save();

          const activityLog = new ActivityLog({
            user_id: '67bb0cf67e856042f069a2a4',
            log_type: 'Lead Created',
            remark: `New lead created: ${leadData.fullName} - ${leadData.phoneNumber}`,
            created_at: new Date(lead.created_time),
            updated_at: new Date(lead.created_time),
          });
          await activityLog.save();
          savedLead.activity_logs.push(activityLog._id);
          await savedLead.save();

          totalLeadsInserted++;
          insertedLeads.push({ name: leadData.fullName, phone: leadData.phoneNumber });

          // Send WhatsApp/SMS Content after Lead is Created
          // try {
          //   await axios.post('http://172.16.20.13:8080/api/whatsup/send-welcome-content', {
          //     leadId: savedLead._id,
          //     userId: '67bb0cf67e856042f069a2a4',
          //   });
          // } catch (smsError) {
          //   console.error('Error sending WhatsApp message:', smsError);
          // }

        } else if (!existingLead.is_reject) {
          existingLead.notify_user = true;
          existingLead.updated_at = new Date(); // Update lead's updated_at

          // Create the discussion comment
          const discussion = await leadDiscussionModel.create({
            created_by: '67bb0cf67e856042f069a2a4',
            comment: "User Have Applied for the Service Again",
          });

          // Push discussion ID into the lead's discussions array
          existingLead.discussions.push(discussion._id);
          await existingLead.save(); // Save all lead changes

          totalLeadsNotified++;
          notifiedLeads.push({ name: leadData.fullName, phone: leadData.phoneNumber });


          // Send WhatsApp/SMS Content after Lead is Notified
          // try {
          //   await axios.post('http://172.16.20.13:8080/api/whatsup/send-welcome-content', {
          //     leadId: existingLead._id,
          //     userId: '67bb0cf67e856042f069a2a4',
          //   });
          // } catch (smsError) {
          //   console.error('Error sending WhatsApp message:', smsError);
          // }
        } else {
          existingLead.is_reject = false;
          existingLead.selected_users = [...generalUserIds];
          existingLead.pipeline_id = config.pipeline_id || null;
          existingLead.lead_type = config.lead_type;
          existingLead.source = config.source;
          existingLead.product_stage = config.product_stage || null;
          existingLead.products = config.products;
          existingLead.branch = config.branch || null;
          existingLead.description = leadData.description.trim();
          existingLead.created_at = new Date(lead.created_time);
          await existingLead.save();

          const activityLog = new ActivityLog({
            user_id: '67bb0cf67e856042f069a2a4',
            log_type: 'Lead Restored',
            remark: `Lead restored: ${leadData.fullName} - ${leadData.phoneNumber}`,
            created_at: new Date(lead.created_time),
            updated_at: new Date(lead.created_time),
          });
          await activityLog.save();
          existingLead.activity_logs.push(activityLog._id);
          await existingLead.save();

          totalLeadsRestored++;
          restoredLeads.push({ name: leadData.fullName, phone: leadData.phoneNumber });

          // Send WhatsApp/SMS Content after Lead is Restored
          // try {
          //   await axios.post('http://172.16.20.13:8080/api/whatsup/send-welcome-content', {
          //     leadId: existingLead._id,
          //     userId: '67bb0cf67e856042f069a2a4',
          //   });
          // } catch (smsError) {
          //   console.error('Error sending WhatsApp message:', smsError);
          // }
        }
      }

      // **Email Report Generation**
      let emailBody = `
       <table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); padding: 30px;">
        <tr>
          <td style="text-align: center;">
            <h1 style="color: #333333; margin-bottom: 5px;">📊 Daily Marketing Report</h1>
            <h3 style="color: #555555; margin-top: 0;">Lead Fetch Report - ${config.name}</h3>
          </td>
        </tr>
        <tr>
          <td>
            <hr style="border: none; border-top: 1px solid #dddddd; margin: 20px 0;" />
            <p style="font-size: 16px; color: #333333;"><strong>Total Leads Inserted:</strong> ${totalLeadsInserted}</p>
            <p style="font-size: 16px; color: #333333;"><strong>Total Leads Restored:</strong> ${totalLeadsRestored}</p>
            <p style="font-size: 16px; color: #333333;"><strong>Total Leads Existing:</strong> ${totalLeadsNotified}</p>
            <p style="font-size: 16px; color: #333333;"><strong>Total Leads Converted (Skipped):</strong> ${totalLeadsConverted}</p>
            <hr style="border: none; border-top: 1px solid #dddddd; margin: 20px 0;" />
            <p style="text-align: center; font-size: 12px; color: #999999;">Report generated automatically. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
      `;

      // if (insertedLeads.length) {
      //   emailBody += `<h4>Inserted Leads:</h4><ul>`;
      //   insertedLeads.forEach(lead => {
      //     emailBody += `<li>${lead.name} - ${lead.phone}</li>`;
      //   });
      //   emailBody += `</ul>`;
      // }

      // if (restoredLeads.length) {
      //   emailBody += `<h4>Restored Leads:</h4><ul>`;
      //   restoredLeads.forEach(lead => {
      //     emailBody += `<li>${lead.name} - ${lead.phone}</li>`;
      //   });
      //   emailBody += `</ul>`;
      // }

      // if (notifiedLeads.length) {
      //   emailBody += `<h4>Notified Leads:</h4><ul>`;
      //   notifiedLeads.forEach(lead => {
      //     emailBody += `<li>${lead.name} - ${lead.phone}</li>`;
      //   });
      //   emailBody += `</ul>`;
      // }

      // Send email report after processing leads
      await sendEmail({
        to: emailRecipients,
        subject: "Daily Lead Fetch Report",
        html: emailBody
      });

    }
  } catch (error) {
    console.error('Error fetching leads:', error);
  }
}


module.exports = fetchAndStoreLeads;