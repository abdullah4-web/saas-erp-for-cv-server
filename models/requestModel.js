const mongoose = require('mongoose');

const leadRequestSchema = new mongoose.Schema({
    lead_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Lead', 
        required: true 
    },
    sender: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    receivers: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    }],
    message : {
        type: String
    },
    type: { 
        type: String, 
    },
    action: { 
        type: String, 
        enum: ['Pending', 'Accept', 'Decline'], 
        default: 'Pending',
    },
    actionChangedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
    },
    pipeline_id: { 
        type: mongoose.Schema.Types.ObjectId,  
        ref: 'Pipeline', 
    },
    product_stage: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'ProductStage', 
    },
    products: {  
        type: mongoose.Schema.Types.ObjectId,  
        ref: 'Product' 
    },
    branch: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Branch', 
    },
    
    read: {
        type: Boolean,
        default: false,
    },

    delStatus: { 
        type: Boolean,
        default: false, 
    },

    currentPipeline: { 
        type: mongoose.Schema.Types.ObjectId,  
        ref: 'Pipeline', 
    },
    currentProductStage: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'ProductStage', 
    },
    currentProduct: {  
        type: mongoose.Schema.Types.ObjectId,  
        ref: 'Product' 
    },
    currentBranch: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Branch', 
    },
});

// Create a model from the schema
const LeadRequest = mongoose.model('LeadRequest', leadRequestSchema);

module.exports = LeadRequest;
