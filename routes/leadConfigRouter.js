const express = require('express');
const router = express.Router();
const LeadFetchConfig = require('../models/LeadFetchConfigModel');
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');

// Create a new configuration
// Expected fields in req.body:
// - name: String (optional)
// - formId: String (optional)
// - accessToken: String (optional)
// - created_by: ObjectId (optional)
// - pipeline_id: ObjectId (optional)
// - lead_type: ObjectId (optional)
// - source: ObjectId (optional)
// - product_stage: ObjectId (optional)
// - products: ObjectId (optional)
// - branch: ObjectId (optional)
router.post('/creat-lead-fetch-config', isAuth, hasPermission(['app_management']),async (req, res) => {
    try {
        const config = new LeadFetchConfig(req.body);
        await config.save();
        res.status(201).json(config);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Edit a configuration
router.put('/update-lead-fetch-config/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
    try {
        const config = await LeadFetchConfig.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!config) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        res.status(200).json(config);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete a configuration
router.delete('/delete-lead-fetch-config/:id', isAuth, hasPermission(['app_management']),async (req, res) => {
    try {
        const config = await LeadFetchConfig.findByIdAndDelete(req.params.id);
        if (!config) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        res.status(204).send(); 
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all configurations
router.get('/get-all-lead-fetch-config', isAuth, hasPermission(['app_management']),async (req, res) => {
    try {
        const configs = await LeadFetchConfig.find();
        res.status(200).json(configs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
