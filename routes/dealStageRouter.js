const express = require('express');
const router = express.Router();
const DealStage = require('../models/dealStageModel'); // Adjust the path to your model
const { isAuth } = require('../utils');


router.post('/create-deal-stage', isAuth, async (req, res) => {
    try {
        const { name, order } = req.body;

        // Validation (you can expand it as per your requirements)
        // if (!name || !order) {
        //     return res.status(400).json({ msg: 'Please provide all required fields' });
        // }

        // Create new DealStage
        const newDealStage = new DealStage({
            company: req.user.company, // Assign the authenticated user's company

            name,
            created_by: req.user._id, // Track who created it,
            order
        });

        const savedDealStage = await newDealStage.save();
        res.status(201).json(savedDealStage);
    } catch (error) {
        console.error('Error creating deal stage:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});


router.get('/get-all-deal-stages', isAuth, async (req, res) => {
    try {
        const dealStages = await DealStage.find({ delStatus: false });
        res.json(dealStages);
    } catch (error) {
        console.error('Error fetching deal stages:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});


router.get('/:id', isAuth, async (req, res) => {
    try {
        const dealStage = await DealStage.findById(req.params.id);
        if (!dealStage) {
            return res.status(404).json({ msg: 'Deal stage not found' });
        }
        res.json(dealStage);
    } catch (error) {
        console.error('Error fetching deal stage by ID:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});


router.put('/update-deal-stage/:id', isAuth, async (req, res) => {
    try {
        const { name, order } = req.body;

        let dealStage = await DealStage.findById(req.params.id);
        if (!dealStage) {
            return res.status(404).json({ msg: 'Deal stage not found' });
        }

        // Update fields if provided
        if (name) dealStage.name = name;
        if (order) dealStage.order = order;

        const updatedDealStage = await dealStage.save();
        res.json(updatedDealStage);
    } catch (error) {
        console.error('Error updating deal stage:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});


router.put('/delete/:id', isAuth, async (req, res) => {
    try {
        // Find the deal stage by ID
        const dealStage = await DealStage.findById(req.params.id);

        // Check if the deal stage exists
        if (!dealStage) {
            return res.status(404).json({ msg: 'Deal stage not found' });
        }

        // Soft delete by setting `delStatus` to true
        dealStage.delStatus = true;
        await dealStage.save();

        res.json({ msg: 'Deal stage soft deleted successfully' });
    } catch (error) {
        console.error('Error soft deleting deal stage:', error);
        res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
