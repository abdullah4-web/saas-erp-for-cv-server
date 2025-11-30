const express = require('express');
const Pipeline = require('../models/pipelineModel');
const SubPipeline = require('../models/subpipelineModel');
const router = express.Router();

// Route to create a new subpipeline
router.post('/create-subpipeline', async (req, res) => {
  try {
    const { name, pipeline } = req.body;

    // Check if the associated pipeline exists
    const pipelineExists = await Pipeline.findById(pipeline);
    if (!pipelineExists) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    // Create a new SubPipeline
    const newSubPipeline = new SubPipeline({
      name,
      pipeline,
    });

    await newSubPipeline.save();

    res.status(201).json(newSubPipeline);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create subpipeline', details: error.message });
  }
});

// Route to get all subpipelines with their associated pipelines
router.get('/get-subpipelines', async (req, res) => {
  try {
    // Populate the associated pipeline details
    const subPipelines = await SubPipeline.find().populate('pipeline');

    res.status(200).json(subPipelines);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get subpipelines', details: error.message });
  }
});

// Route to update an existing subpipeline
router.put('/update-subpipeline/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, pipeline } = req.body;
  
      // Check if the associated pipeline exists
      if (pipeline) {
        const pipelineExists = await Pipeline.findById(pipeline);
        if (!pipelineExists) {
          return res.status(404).json({ error: 'Pipeline not found' });
        }
      }
  
      // Find the subpipeline by ID and update it
      const updatedSubPipeline = await SubPipeline.findByIdAndUpdate(
        id,
        { name, pipeline, updated_at: Date.now() }, // Update fields and set updated_at
        { new: true } // Return the updated document
      );
  
      if (!updatedSubPipeline) {
        return res.status(404).json({ error: 'SubPipeline not found' });
      }
  
      res.status(200).json(updatedSubPipeline);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update subpipeline', details: error.message });
    }
  });

module.exports = router;
