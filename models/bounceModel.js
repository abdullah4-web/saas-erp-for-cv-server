const mongoose = require('mongoose');

if (mongoose.models.Bounce) {
  delete mongoose.models.Bounce;
}

const bounceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  month: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}$/, 'Use YYYY-MM format']
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const Bounce = mongoose.model('Bounce', bounceSchema);
module.exports = Bounce;
