const mongoose = require('mongoose');
const Schema = mongoose.Schema;
// Define the Label schema
const LabelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    color: {
        type: String,
        // required: true,
    },
    pipeline_id: 
        // {type: String}
        { type: Schema.Types.ObjectId, ref: 'Pipeline',  }
        
    ,
    created_by: {
        type: String 
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_at: { 
        type: Date, 
        default: Date.now,
    },
    delstatus: { type: Boolean, default: false },

});

// Middleware to update 'updated_at' field before each save
LabelSchema.pre('save', function (next) {
    this.updated_at = Date.now();
    next();
});

// Create and export the Label model
const Label = mongoose.model('Label', LabelSchema);

module.exports = Label;
