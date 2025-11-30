const express = require('express');
const Product = require('../models/productModel'); // Adjust the path as necessary
const Branch = require('../models/branchModel'); // Branch model
const { isAuth } = require('../utils');
const hasPermission = require('../hasPermission');
const router = express.Router();
const User = require('../models/userModel');
// Create a new product
const mongoose = require('mongoose');
// Create a new product
router.post('/create-new-product', isAuth, async (req, res) => {
  try {
    const { name, branches } = req.body; // branches: array of branch IDs (strings)

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    // Convert branch strings → ObjectIds
    let branchObjectIds = [];
    if (branches && branches.length > 0) {
      try {
        branchObjectIds = branches.map(id => new mongoose.Types.ObjectId(id));
      } catch (err) {
        return res.status(400).json({ message: 'Invalid branch ID format' });
      }

      // Validate branches exist in the same company and are not deleted
      const validBranches = await Branch.find({
        _id: { $in: branchObjectIds },
        company: req.user.company,
        delstatus: false // ✅ match your schema casing
      }).select('_id');

      if (validBranches.length !== branchObjectIds.length) {
        return res.status(400).json({ message: 'One or more branches are invalid for this company' });
      }

      branchObjectIds = validBranches.map(b => b._id);
    }

    // Create the product
    const newProduct = new Product({
      name,
      company: req.user.company,
      branches: branchObjectIds,
    });

    await newProduct.save();

    // Add this product to all Admin users of the same company
    await User.updateMany(
      { company: req.user.company, role: 'Admin' },
      { $addToSet: { products: newProduct._id } } // $addToSet avoids duplicates
    );

    res.status(201).json({ message: 'Product created successfully', product: newProduct });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all products for the authenticated user's company
router.get('/get-all-products', isAuth, async (req, res) => {
    try {
        const products = await Product.find({
            company: req.user.company,
            delStatus: false,
        }).populate('branches', 'name'); // populate branch names

        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// Get all products for admin (optional: can also filter by company if needed)
router.get('/get-all-products-admin', isAuth, async (req, res) => {
    try {
        const products = await Product.find({
            company: req.user.company,
            delStatus: false
        }).populate('branches', 'name');

        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// Get a single product by ID (only if belongs to user's company)
router.get('/:id', isAuth, async (req, res) => {
    try {
        const product = await Product.findOne({
            _id: req.params.id,
            company: req.user.company
        }).populate('branches', 'name');

        if (!product || product.delStatus) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// Update a product by ID (only if belongs to user's company)
router.put('/:id', isAuth, async (req, res) => {
    try {
        const { name, branches } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        // Validate branches
        let validBranches = [];
        if (branches && branches.length > 0) {
            validBranches = await Branch.find({
                _id: { $in: branches },
                company: req.user.company,
                delstatus: false
            }).select('_id');

            if (validBranches.length !== branches.length) {
                return res.status(400).json({ message: 'One or more branches are invalid for this company' });
            }
        }

        const updatedProduct = await Product.findOneAndUpdate(
            { _id: req.params.id, company: req.user.company },
            { 
                name, 
                branches: validBranches.map(b => b._id) 
            },
            { new: true, runValidators: true }
        ).populate('branches', 'name');

        if (!updatedProduct || updatedProduct.delStatus) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product updated successfully', product: updatedProduct });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// "Delete" a product by ID (only if belongs to user's company)
router.put('/delete-product/:id', isAuth, hasPermission(['app_management']), async (req, res) => {
    try {
        const updatedProduct = await Product.findOneAndUpdate(
            { _id: req.params.id, company: req.user.company },
            { delStatus: true },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product marked as deleted successfully', product: updatedProduct });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

module.exports = router;
