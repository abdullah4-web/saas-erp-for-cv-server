const express = require("express");
const axios = require("axios");
const Area = require("../models/AreaModel");

const router = express.Router();

// External API URLs
const AUTH_API_URL = "http://172.16.20.3:8081/jwt-api-token-auth/";
const EXTERNAL_API_URL = "http://172.16.20.3:8081/personnel/api/areas/";

// Credentials for authentication
const AUTH_CREDENTIALS = {
    username: "kamal",
    password: "Jovera@2022",
};

// Token cache
let authToken = null;
let tokenExpiry = null;

// Function to fetch JWT token
const getAuthToken = async () => {
    try {
        const response = await axios.post(AUTH_API_URL, AUTH_CREDENTIALS);
        authToken = response.data.token;
        tokenExpiry = Date.now() + 3600 * 1000; // Assume token valid for 1 hour
    } catch (error) {
        console.error("Error fetching auth token:", error);
        throw new Error("Failed to authenticate with external API");
    }
};

// Function to ensure valid token
const ensureAuthToken = async () => {
    if (!authToken || Date.now() >= tokenExpiry) {
        await getAuthToken();
    }
};

// Function to fetch all areas from external API
const fetchAllAreas = async () => {
    let allAreas = [];
    let url = EXTERNAL_API_URL;

    try {
        await ensureAuthToken();

        while (url) {
            const response = await axios.get(url, {
                headers: { Authorization: `JWT ${authToken}` },
            });

            allAreas = [...allAreas, ...response.data.data];
            url = response.data.next; // Next page URL
        }
    } catch (error) {
        console.error("Error fetching areas from external API:", error);
        throw new Error("Failed to fetch areas");
    }

    return allAreas;
};

// ✅ GET all areas (Local DB + External API)
router.get("/all", async (req, res) => {
    try {
        const Areas = await Area.find();

        res.status(200).json( Areas );
    } catch (error) {
        console.error("Error fetching areas:", error);
        res.status(500).json({ message: "Error fetching areas", error: error.message });
    }
});

// ✅ CREATE a new area
router.post("/create", async (req, res) => {
    try {
        const { name } = req.body;

        // Fetch all areas to get the last area_code
        const areas = await fetchAllAreas();

        // Get last area_code and increment it
        let lastAreaCode = 0;
        if (areas.length > 0) {
            lastAreaCode = Math.max(...areas.map(a => parseInt(a.area_code, 10) || 0));
        }
        const newAreaCode = (lastAreaCode + 1).toString();

        // // Ensure valid token
        // await ensureAuthToken();

        // // Send request to external API
        // const externalResponse = await axios.post(
        //     EXTERNAL_API_URL,
        //     { area_code: newAreaCode, area_name: name, parent_area: null },
        //     { headers: { Authorization: `JWT ${authToken}` } }
        // );

        // // Extract bio_times_id from response
        // const { id: bio_times_id } = externalResponse.data;

        // // Save in MongoDB
        // const area = new Area({ name, code: newAreaCode, bio_times_id });
        // await area.save();

        res.status(201).json({ message: "Area created successfully", area });
    } catch (error) {
        console.error("Error creating area:", error);
        res.status(500).json({ message: "Error creating area", error: error.message });
    }
});

// ✅ UPDATE an area
router.put("/update/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code } = req.body;

        // Ensure valid token
        await ensureAuthToken();

        // Find area in MongoDB
        const area = await Area.findById(id);
        if (!area) return res.status(404).json({ message: "Area not found" });

        // // Update in external API
        // await axios.put(
        //     `${EXTERNAL_API_URL}${area.bio_times_id}/`,
        //     { area_code: code, area_name: name, parent_area: null },
        //     { headers: { Authorization: `JWT ${authToken}` } }
        // );

        // Update in local DB
        area.name = name;
        area.code = code;
        await area.save();

        res.status(200).json({ message: "Area updated successfully", area });
    } catch (error) {
        console.error("Error updating area:", error);
        res.status(500).json({ message: "Error updating area", error: error.message });
    }
});

// ✅ DELETE an area
router.delete("/delete/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Ensure valid token
        await ensureAuthToken();

        // Find area in MongoDB
        const area = await Area.findById(id);
        if (!area) return res.status(404).json({ message: "Area not found" });

        // // Delete from external API
        // await axios.delete(`${EXTERNAL_API_URL}${area.bio_times_id}/`, {
        //     headers: { Authorization: `JWT ${authToken}` },
        // });

        // Delete from MongoDB
        await Area.findByIdAndDelete(id);

        res.status(200).json({ message: "Area deleted successfully" });
    } catch (error) {
        console.error("Error deleting area:", error);
        res.status(500).json({ message: "Error deleting area", error: error.message });
    }
});

module.exports = router;
