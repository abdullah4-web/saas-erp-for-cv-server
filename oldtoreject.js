const mongoose = require('mongoose');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Lead = require('./models/leadModel');
const clientModel = require('./models/clientModel');
const MONGODB_URI = 'mongodb://localhost:27017/joveraDB';

// Email sending function
async function sendEmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'abdullahjovera@gmail.com',
      pass: 'vqez xhgo arfv yymm'
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from: 'abdullahjovera@gmail.com',
    to,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('📧 Email sent successfully!');
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
}

const updateOldLeads = async (monthsAgo = 12) => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    const monthsBackDate = new Date();
    monthsBackDate.setMonth(monthsBackDate.getMonth() - monthsAgo);

    const initialRejectedCount = await Lead.countDocuments({ is_reject: true });
    console.log(`📌 Initial rejected leads: ${initialRejectedCount}`);

    const eligibleLeads = await Lead.find({
      updated_at: { $lt: monthsBackDate },
      is_reject: false,
    }).select('_id client').populate('client', 'name');

    console.log(`📌 Eligible leads to reject (older than ${monthsAgo} months): ${eligibleLeads.length}`);

    let rejectedInfo = [];
    let rejectedCount = 0;

    if (eligibleLeads.length > 0) {
      const leadIds = eligibleLeads.map(lead => lead._id);
      rejectedInfo = eligibleLeads.map(lead => ({
        id: lead._id.toString(),
        clientName: lead.client?.name || 'Unknown'
      }));

      const result = await Lead.updateMany(
        { _id: { $in: leadIds } },
        { $set: { is_reject: true } }
      );

      rejectedCount = result.modifiedCount || result.nModified;
      console.log(`✅ Rejected ${rejectedCount} leads.`);
    } else {
      console.log('ℹ️ No leads to update or reject.');
    }

    const finalRejectedCount = await Lead.countDocuments({ is_reject: true });
    console.log(`📌 Total rejected leads after update: ${finalRejectedCount}`);

    // Build the email content regardless of updates
    const htmlList = rejectedInfo.length > 0
      ? rejectedInfo.map(item => `<li><strong>ID:</strong> ${item.id} | <strong>Client:</strong> ${item.clientName}</li>`).join('')
      : `<li>No leads were rejected today.</li>`;

    const emailHtml = `
      <h2>🗂 Rejected Leads Report</h2>
      <p>This is your daily update for leads not updated in the last ${monthsAgo} months.</p>
      <ul>${htmlList}</ul>
      <p>Total leads rejected today: <strong>${rejectedCount}</strong></p>
      <p>Total leads rejected overall: <strong>${finalRejectedCount}</strong></p>
    `;

    await sendEmail({
      to: 'abdullahjovera@gmail.com',
      subject: 'Daily Lead Rejection Report (12 Months)',
      html: emailHtml
    });

  } catch (error) {
    console.error('❌ Error updating leads:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run daily at 11:54 AM
cron.schedule('40 17 * * *', () => {
  console.log('🕛 Running daily lead cleanup job...');
  updateOldLeads(12);
});