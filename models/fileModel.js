const mongoose = require('mongoose');
const { Schema } = mongoose; 

const fileSchema = new Schema({ 
  added_by: { type: Schema.Types.ObjectId, ref: 'User' }, 
  file_name: { type: String, required: true },
  file_path: { type: String, required: true },
  created_at: { type: Date, required: true },
  updated_at: { type: Date, required: true },
  delstatus: { type: Boolean, default: false },
});

const File = mongoose.model('File', fileSchema);

module.exports = File;
