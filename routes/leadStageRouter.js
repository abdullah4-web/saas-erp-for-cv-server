const express = require('express');
const router = express.Router();
const LeadStage = require('../models/leadStageModel');

// Create a new lead stage
router.post('/create', async (req, res) => {
    try {
        const { name, pipeline_id, created_by, order } = req.body;

        if (!name || !pipeline_id || order === undefined) {
            return res.status(400).json({ message: 'Name, Pipeline ID, and Order are required fields.' });
        }

        const newLeadStage = new LeadStage({
            name,
            pipeline_id,
            created_by,
            order,
        });

        const savedLeadStage = await newLeadStage.save();
        res.status(201).json(savedLeadStage);
    } catch (error) {
        console.error('Error creating lead stage:', error);
        res.status(500).json({ message: 'Error creating lead stage.', error });
    }
});

// Get all lead stages
router.get('/get-all-leadstages', async (req, res) => {
    try {
        const leadStages = await LeadStage.find().populate('pipeline_id').sort({ order: 1 });
        res.status(200).json(leadStages);
    } catch (error) {
        console.error('Error fetching lead stages:', error);
        res.status(500).json({ message: 'Error fetching lead stages.', error });
    }
});

router.get('/pipeline/:pipelineId', async (req, res) => {
    try {
        const { pipelineId } = req.params;

        

        const leadStages = await LeadStage.find({ pipeline_id: pipelineId, delstatus: false })
                                          .populate('pipeline_id')
                                          .sort({ order: 1 });

        if (leadStages.length === 0) {
            return res.status(404).json({ message: 'No lead stages found for this pipeline.' });
        }

        res.status(200).json(leadStages);
    } catch (error) {
        console.error('Error fetching lead stages for the pipeline:', error);
        res.status(500).json({ message: 'Error fetching lead stages for the pipeline.', error });
    }
});


module.exports = router;
