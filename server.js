// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');
const cron = require('node-cron');

// Load environment variables
dotenv.config();

// Socket
const { initializeSocket } = require('./socket');

// Middleware
const { rateLimiter, blockBlockedIPs, verifyFrontendOrigin, enforceTrustedOrigin } = require('./utils');
const logApiRequest = require('./middleware/logApiRequest');

// Routers
const leadRouter = require('./routes/leadRouter');
const dealRouter = require('./routes/dealRouter');
const clientRouter = require('./routes/clientRouter');
const userRouter = require('./routes/userRouter');
const pipelineRouter = require('./routes/pipelineRouter');
const branchRouter = require('./routes/branchRouter');
const leadstageRouter = require('./routes/leadStageRouter');
const sourceRouter = require('./routes/sourceRouter');
const productstageRouter = require('./routes/productStageRouter');
const productsRouter = require('./routes/productRouter');
const leadtypesRouter = require('./routes/leadTypeRouter');
const dealstagesRouter = require('./routes/dealStageRouter');
const contractRouter = require('./routes/contractRouter');
const whatsAppRouterFactory = require('./routes/whatsAppRouter'); // factory
const facebookRouter = require('./facebookWebhook'); // static router
const notificationRouter = require('./routes/notificationRouter');
const permissionsRouter = require('./routes/rolePermissionsRouter');
const rolesRouter = require('./routes/rolesRouter');
const rolePermissionsRouter = require('./routes/rolePermissionsRouter');
const commissionRouter = require('./routes/commissionRouter');
const phonebookRouter = require('./routes/phonbookRouter');
const phonebookwhatsupRouter = require('./routes/phonebookwhatsupRouter');
const labelRouter = require('./routes/labelRouter');
const requestRouter = require('./routes/requestRouter');
const leadConfigRouter = require('./routes/leadConfigRouter');
const contractStagesRouter = require('./routes/contractStageRouter');
const databaseRouter = require('./routes/databaseRouter');
const supportChatRouter = require('./routes/supportchatRouter');
const targetRouter = require('./routes/targetRouter');
const attendenceRouter = require('./routes/attendanceRouter');
const shiftRouter = require('./routes/shiftRouter');
const holiRouter = require('./routes/holidayRouter');
const departmentRouter = require('./routes/departmentRouter');
const areasRouter = require('./routes/areasRouter');
const evaluationRouter = require('./routes/evaluationRouter');
const companyRouter = require('./routes/companyRouter');
const leaveRouter = require('./routes/leaveRouter');
const positionRouter = require('./routes/positionRouter');
const countryRouter = require('./routes/countryRouter');
const salaryRouter = require('./routes/salaryRouter');
const penaltyRouter = require('./routes/penaltyRouter');
const bounceRouter = require('./routes/bounceRouter');
const payrollRouter = require('./routes/payrollRouter');
const advancePaymentRouter = require('./routes/advancePaymentRouter');
const activityLogsRouter = require('./routes/activityLogsRouter');
const companyRoutes = require('./routes/companyroutes');

const fetchAndStoreLeads = require('./leadFetcher');

const app = express();
const port = process.env.PORT || 8081;
const server = http.createServer(app);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Static folders
// app.use('/lead_files', express.static(path.join(__dirname, 'lead_files')));
// app.use('/images', express.static(path.join(__dirname, 'images')));
// app.use('/uploads', express.static(path.join(__dirname, './uploads')));
// app.use('/companyfiles', express.static(path.join(__dirname, './companyfiles')));
// app.use('/salaryfiles', express.static(path.join(__dirname, './salaryfiles')));
// app.use('/chat_files', express.static(path.join(__dirname, './chat_files')));

// Logging middleware
app.use(logApiRequest);

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Test route is working!' });
});

// Initialize Socket.IO
(async () => {
  const io = await initializeSocket(server);

  io.on('connection', (socket) => {
    console.log('A user connected');
    const userId = socket.handshake.query.userId;
    socket.join(`user_${userId}`);
    console.log(`User connected with ID: ${userId}`);

    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });

  // Routers
  app.use('/api/company', companyRoutes);
    app.use('/api/subcompany', companyRouter);
  app.use('/api/clients', clientRouter);
  app.use('/api/leads', leadRouter);
  app.use('/api/deals', dealRouter);
  app.use('/api/users', userRouter);
  app.use('/api/pipelines', pipelineRouter);
  app.use('/api/sources', sourceRouter);
  app.use('/api/branch', branchRouter);
  app.use('/api/leadstages', leadstageRouter);
  app.use('/api/productstages', productstageRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/leadtypes', leadtypesRouter);
  app.use('/api/deal-stages', dealstagesRouter);
  app.use('/api/contracts', contractRouter);
  app.use('/api/whatsup', whatsAppRouterFactory(io)); // factory router
  app.use('/api/facebook', facebookRouter); // static router
  app.use('/api/notifications', notificationRouter);
  app.use('/api/permissions', permissionsRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api', rolePermissionsRouter);
  app.use('/api/commission', commissionRouter);
  app.use('/api/twillo', phonebookwhatsupRouter);
  app.use('/api/labels', labelRouter);
  app.use('/api/request', requestRouter);
  app.use('/api/lead-config', leadConfigRouter);
  app.use('/api/contract-stages', contractStagesRouter);
  app.use('/api/database', databaseRouter);
  app.use('/api/phonebook', phonebookRouter);
  app.use('/api/supportchat', supportChatRouter);
  app.use('/api/targets', targetRouter);
  app.use('/api/attenedence', attendenceRouter);
  app.use('/api/shifts', shiftRouter);
  app.use('/api/holiday', holiRouter);
  app.use('/api/department', departmentRouter);
  app.use('/api/areas', areasRouter);
  app.use('/api/evaluation', evaluationRouter);
  app.use('/api/sub-company', companyRouter);
  app.use('/api/leaves', leaveRouter);
  app.use('/api/position', positionRouter);
  app.use('/api/country', countryRouter);
  app.use('/api/salary', salaryRouter);
  app.use('/api/penalty', penaltyRouter);
  app.use('/api/bounces', bounceRouter);
  app.use('/api/payroll', payrollRouter);
  app.use('/api/advance-payment', advancePaymentRouter);
  app.use('/api/activitylogs', activityLogsRouter);

  // Cron example
  // cron.schedule('30 09 * * *', fetchAndStoreLeads);

  // Production React build
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/build')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
    });
  }

  // Start server
  server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
})();
