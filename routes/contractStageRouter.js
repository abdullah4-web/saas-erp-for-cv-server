const express = require('express');
const router = express.Router();
const ContractStage = require('../models/contractStageModel'); // Adjust the path as necessary
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');

// Create a new contract stage
router.post('/create-contract-stage', isAuth, hasPermission(['app_management']), async (req, res) => {
    try { 
        const { name, order, } = req.body;
        const created_by = req.user._id
        const newStage = new ContractStage({
            name,
            order,
            created_by
        }); 

        await newStage.save();
        res.status(201).json({ message: 'Contract stage created successfully', newStage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create contract stage' });
    }
});

// Get all active contract stages
router.get('/get-all-contract-stages', async (req, res) => {
    try {
        const stages = await ContractStage.find({ delStatus: false })
            .populate('created_by', 'name'); // Populate with creator's name
        
        res.status(200).json(stages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to retrieve contract stages' });
    }
});

// Update a contract stage by ID
router.put('/update-contract-stages/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, order } = req.body;

        const updatedStage = await ContractStage.findByIdAndUpdate(
            id,
            { name, order },
            { new: true }
        );

        if (!updatedStage) {
            return res.status(404).json({ message: 'Contract stage not found' });
        }

        res.status(200).json({ message: 'Contract stage updated successfully', updatedStage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to update contract stage' });
    }
});

// Soft delete a contract stage by ID
router.delete('/delete/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
    try {
        const { id } = req.params;

        const deletedStage = await ContractStage.findByIdAndUpdate(
            id,
            { delStatus: true },
            { new: true }
        );

        if (!deletedStage) {
            return res.status(404).json({ message: 'Contract stage not found' });
        }

        res.status(200).json({ message: 'Contract stage soft deleted successfully', deletedStage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete contract stage' });
    }
});

module.exports = router;
