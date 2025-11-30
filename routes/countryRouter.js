const express = require('express');
const router = express.Router();
const Country = require('../models/countryModel');

// Create a new country
router.post('/create', async (req, res) => {
  try {
    const { name } = req.body;
    const existing = await Country.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Country already exists' });
    }

    const country = new Country({ name: name.trim() });
    await country.save();
    res.status(201).json({ message: 'Country created successfully', country });
  } catch (err) {
    res.status(500).json({ message: 'Error creating country', error: err.message });
  }
});

// Get all countries
router.get('/all', async (req, res) => {
  try {
    const countries = await Country.find().sort({ name: 1 });
    res.status(200).json(countries);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching countries', error: err.message });
  }
});

// Get single country by ID
router.get('/:id', async (req, res) => {
  try {
    const country = await Country.findById(req.params.id);
    if (!country) return res.status(404).json({ message: 'Country not found' });
    res.status(200).json(country);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching country', error: err.message });
  }
});

// Update country by ID
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const updated = await Country.findByIdAndUpdate(
      req.params.id,
      { name: name.trim() },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Country not found' });
    res.status(200).json({ message: 'Country updated successfully', country: updated });
  } catch (err) {
    res.status(500).json({ message: 'Error updating country', error: err.message });
  }
});

// Delete country by ID
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Country.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Country not found' });
    res.status(200).json({ message: 'Country deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting country', error: err.message });
  }
});

module.exports = router;
