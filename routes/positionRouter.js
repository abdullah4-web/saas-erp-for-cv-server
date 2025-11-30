const express = require('express');
const router = express.Router();
const Position = require('../models/positionModel');

// Create a new position
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    const existing = await Position.findOne({ name: name.trim() });
    if (existing) return res.status(400).json({ message: "Position already exists" });

    const newPosition = new Position({ name: name.trim() });
    await newPosition.save();

    res.status(201).json({ message: "Position created successfully", position: newPosition });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all positions
router.get('/', async (req, res) => {
  try {
    const positions = await Position.find().sort({ created_at: -1 });
    res.status(200).json(positions);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get single position by ID
router.get('/:id', async (req, res) => {
  try {
    const position = await Position.findById(req.params.id);
    if (!position) return res.status(404).json({ message: "Position not found" });

    res.status(200).json(position);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update a position
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const updated = await Position.findByIdAndUpdate(
      req.params.id,
      { name: name.trim() },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Position not found" });

    res.status(200).json({ message: "Position updated successfully", position: updated });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete a position
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Position.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Position not found" });

    res.status(200).json({ message: "Position deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
