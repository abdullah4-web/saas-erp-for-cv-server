const mongoose = require('mongoose');

const phonebookSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        pipeline: {  
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Pipeline',
            // required: true
        },
        lead_id: { 
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Lead',
            required: false
        },
        uploaded_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }, 
        number: {
            type: String,
            required: true
        },
        status: {
            type: String,
            default: 'Waiting' 
        },
        calstatus: {
            type: String,
            enum: ['Req to call',  'Convert to Lead','No Answer', 'Not Interested', 'Follow Up', 'Offline'], 
            default: 'Req to call' 
        },
        messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppMessage' }],
        comments: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Comment',
        }],
        visibility: [{ 
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          }]
    },
    {
        timestamps: true,
    }
);

const Phonebook = mongoose.model('Phonebook', phonebookSchema);
module.exports = Phonebook;