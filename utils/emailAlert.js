const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // or use your SMTP server
  auth: {
    user: process.env.ALERT_EMAIL,
    pass: process.env.ALERT_EMAIL_PASSWORD
  }
});

const sendAlertEmail = async ({ subject, text }) => {
  try {
    await transporter.sendMail({
      from: `"CRM Alert System" <${process.env.ALERT_EMAIL}>`,
      to: process.env.ALERT_RECEIVER_EMAIL, // admin email
      subject,
      text
    });
  } catch (error) {
    console.error('Failed to send alert email:', error);
  }
};

module.exports = sendAlertEmail;
