const express = require('express');
const router = express.Router();
const Source = require('../models/sourceModel');
const { isAuth, hasRole, hasPermission } = require('../utils');

// Route to get sources by Lead Type ID
router.get('/:leadTypeId', async (req, res) => {
    try {
        const { leadTypeId } = req.params;

        const sources = await Source.find({ lead_type_id: leadTypeId })
            .populate('lead_type_id', 'name') 
            .exec();

        if (sources.length === 0) {
            return res.status(404).json({ message: 'No sources found for the given Lead Type ID' });
        }

        res.status(200).json(sources);
    } catch (error) {
        console.error('Error fetching sources by Lead Type ID:', error);
        res.status(500).json({ message: 'Error fetching sources' }); 
    }
});

// Route to get all sources
router.get('/get/get-sources', isAuth,    async (req, res) => {
    try {
        const sources = await Source.find({ delstatus: false})
            .populate('lead_type_id', 'name')
            .exec();
        res.status(200).json(sources);
    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({ message: 'Error fetching sources' });
    }
});

// Route to create a new source  
router.post(
  '/create-source',
  isAuth,
  hasPermission(['app_management']),
  async (req, res) => {
    try {
      const { name, lead_type_id, delstatus } = req.body;

      // Validate required fields
      if (!name || !lead_type_id) {
        return res
          .status(400)
          .json({ message: 'Name and Lead Type ID are required' });
      }

      // Create new source
      const newSource = new Source({
        company: req.user.company, // ✅ attach company
        name,
        lead_type_id,
        delstatus: delstatus || false, // default false
        created_by: req.user._id, // ✅ optional: track who created it
      });

      // Save the new source to the database
      await newSource.save();

      res.status(201).json(newSource);
    } catch (error) {
      console.error('Error creating source:', error);
      res.status(500).json({ message: 'Error creating source' });
    }
  }
);


// Route to update an existing source
router.put('/update-source/:sourceId',isAuth,  hasPermission(['app_management']), async (req, res) => {
    try {
        const { sourceId } = req.params;
        const { name, lead_type_id, delstatus } = req.body;

        // Validate required fields
        if (!name || !lead_type_id) {
            return res.status(400).json({ message: 'Name and Lead Type ID are required' });
        }

        // Update the source
        const updatedSource = await Source.findByIdAndUpdate(
            sourceId,
            { name, lead_type_id, delstatus }, // Update these fields
            { new: true } // Return the updated document
        );

        if (!updatedSource) {
            return res.status(404).json({ message: 'Source not found' });
        }

        res.status(200).json(updatedSource);
    } catch (error) {
        console.error('Error updating source:', error);
        res.status(500).json({ message: 'Error updating source' });
    }
});



// Route to soft delete a source
router.put('/soft-delete-source/:sourceId', isAuth,  hasPermission(['app_management']),  async (req, res) => {
    try {
        const { sourceId } = req.params;

        // Soft delete the source by setting delstatus to true
        const updatedSource = await Source.findByIdAndUpdate(
            sourceId,
            { delstatus: true }, // Set delstatus to true
            { new: true } // Return the updated document
        );

        if (!updatedSource) {
            return res.status(404).json({ message: 'Source not found' });
        }

        res.status(200).json({ message: 'Source soft deleted successfully', updatedSource });
    } catch (error) {
        console.error('Error soft deleting source:', error);
        res.status(500).json({ message: 'Error soft deleting source' });
    }
});

module.exports = router;
