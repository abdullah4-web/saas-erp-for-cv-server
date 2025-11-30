const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContractStageSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    order: {
        type: Number,
        required: true,
    },
    created_by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    delStatus: {
        type: Boolean,
        default: false, // Default is false, meaning the record is not deleted
    }
}, { 
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('ContractStage', ContractStageSchema);
