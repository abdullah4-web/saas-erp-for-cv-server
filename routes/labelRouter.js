const express = require('express');
const router = express.Router();
const Label = require('../models/labelModel'); // Adjust the path as per your folder structure
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');

// Get labels by pipeline_id (excluding soft-deleted labels)
router.get('/pipeline/:pipeline_id', isAuth, hasPermission(['lead_labels']), async (req, res) => {
    try {
        const { pipeline_id } = req.params;

        // Find labels with the given pipeline_id and delstatus false
        const labels = await Label.find({ pipeline_id, delstatus: false });

        if (!labels || labels.length === 0) {
            return res.status(404).json({ message: 'No labels found for this pipeline' });
        }

        res.status(200).json(labels);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create a new label
router.post('/create', isAuth, hasPermission(['label_management']), async (req, res) => {
    try {
        const { name, color, pipeline_id, created_by } = req.body;

        // Check if pipeline_id is provided
        if (!pipeline_id) {
            return res.status(400).json({ message: 'Pipeline ID is required' });
        }

        const newLabel = new Label({
            name,
            color,
            pipeline_id,
            created_by
        });

        // Save the new label to the database
        await newLabel.save();

        res.status(201).json({ message: 'Label created successfully', label: newLabel });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});


// Get all labels (excluding soft-deleted labels)
router.get('/all', async (req, res) => { 
    try {
        // Find labels with delstatus: false and populate the pipeline_id with the name field from Pipeline
        const labels = await Label.find({ delstatus: false }).populate({
            path: 'pipeline_id',
            select: 'name' // Only select the 'name' field from the populated Pipeline document
        });

        res.status(200).json(labels);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get a label by ID (if not soft-deleted)  0552573534  0552573534
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const label = await Label.findOne({ _id: id, delstatus: false });

        if (!label) {
            return res.status(404).json({ message: 'Label not found' });
        }

        res.status(200).json(label);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update a label by ID
router.put('/:id', isAuth, hasPermission(['label_management']), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, color, pipeline_id, created_by } = req.body;

        // Find and update the label
        const updatedLabel = await Label.findOneAndUpdate(
            { _id: id, delstatus: false },
            {
                name,
                color,
                pipeline_id,
                created_by,
                updated_at: Date.now(),
            },
            { new: true } // Return the updated document
        );

        if (!updatedLabel) {
            return res.status(404).json({ message: 'Label not found' });
        }

        res.status(200).json({ message: 'Label updated successfully', label: updatedLabel });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Soft delete a label by ID
router.delete('/:id', isAuth, hasPermission(['label_management']), async (req, res) => {
    try {
        const { id } = req.params;

        // Mark the label as soft deleted
        const deletedLabel = await Label.findByIdAndUpdate(id, { delstatus: true }, { new: true });

        if (!deletedLabel) {
            return res.status(404).json({ message: 'Label not found' });
        }

        res.status(200).json({ message: 'Label soft deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
