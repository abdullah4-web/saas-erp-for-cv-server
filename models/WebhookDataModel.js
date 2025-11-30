const mongoose = require('mongoose');
const { Schema } = mongoose;

const webhookDataSchema = new Schema({
  data: {
    type: Schema.Types.Mixed,  // This will allow you to store any structure of JSON
    required: true
  },
  receivedAt: {
    type: Date,
    default: Date.now  // Automatically store the time the data was received
  }
});

const WebhookData = mongoose.model('WebhookData', webhookDataSchema);
module.exports = WebhookData;
