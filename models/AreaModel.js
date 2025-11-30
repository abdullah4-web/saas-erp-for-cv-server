const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    bio_times_id: { type: Number, required: true }
});

module.exports = mongoose.model("Area", areaSchema);
