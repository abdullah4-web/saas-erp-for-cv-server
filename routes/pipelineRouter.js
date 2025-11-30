const express = require('express');
const Pipeline = require('../models/pipelineModel');
const Product = require('../models/productModel'); // Product model
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission'); 
const router = express.Router();

// GET all pipelines for the authenticated user's company
router.get('/get-pipelines', isAuth, async (req, res) => {
  try {
    const pipelines = await Pipeline.find({
      company: req.user.company,
      delstatus: false
    }).populate('product', 'name'); // populate product name

    res.status(200).json(pipelines);
  } catch (error) {
    console.error('Error fetching pipelines:', error);
    res.status(500).json({ message: 'Server error. Unable to fetch pipelines.' });
  }
});

// CREATE a new pipeline
router.post('/create-pipeline', isAuth, hasPermission(['app_management']), async (req, res) => { 
  try {
    const { name, product } = req.body;

    if (!name || !product) {
      return res.status(400).json({ message: 'Pipeline name and product are required.' });
    }

    // Validate that the product belongs to the user's company
    const validProduct = await Product.findOne({ _id: product, company: req.user.company, delStatus: false });
    if (!validProduct) {
      return res.status(400).json({ message: 'Invalid product for this company.' });
    }

    const newPipeline = new Pipeline({
      name,
      product: validProduct._id,
      company: req.user.company,
      created_by: req.user._id
    });

    const savedPipeline = await newPipeline.save();
    res.status(201).json(savedPipeline);
  } catch (error) {
    console.error('Error adding pipeline:', error);
    res.status(500).json({ message: 'Server error. Unable to add pipeline.' });
  }
});

// UPDATE a pipeline by ID
router.put('/update-pipeline/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, product, delstatus } = req.body;

    const pipeline = await Pipeline.findOne({ _id: id, company: req.user.company });
    if (!pipeline) {
      return res.status(404).json({ message: 'Pipeline not found.' });
    }

    if (name) pipeline.name = name;

    // Update product if provided
    if (product) {
      const validProduct = await Product.findOne({ _id: product, company: req.user.company, delStatus: false });
      if (!validProduct) {
        return res.status(400).json({ message: 'Invalid product for this company.' });
      }
      pipeline.product = validProduct._id;
    }

    if (typeof delstatus !== 'undefined') pipeline.delstatus = delstatus;

    await pipeline.save();
    const updatedPipeline = await Pipeline.findById(id).populate('product', 'name');

    res.status(200).json(updatedPipeline);
  } catch (error) {
    console.error('Error updating pipeline:', error);
    res.status(500).json({ message: 'Server error. Unable to update pipeline.' });
  }
});

// SOFT DELETE a pipeline
router.put('/delete-pipeline/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
  try {
    const { id } = req.params;

    const pipeline = await Pipeline.findOne({ _id: id, company: req.user.company });
    if (!pipeline) {
      return res.status(404).json({ message: 'Pipeline not found.' });
    }

    pipeline.delstatus = true;
    await pipeline.save();

    res.status(200).json({ message: 'Pipeline soft deleted successfully', pipeline });
  } catch (error) {
    console.error('Error deleting pipeline:', error);
    res.status(500).json({ message: 'Server error. Unable to delete pipeline.' });
  }
});

module.exports = router;
