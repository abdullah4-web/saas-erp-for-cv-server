const express = require("express");
const axios = require("axios");
const Department = require("../models/departmentModel");

const router = express.Router();

// External API URLs
const AUTH_API_URL = "http://172.16.20.3:8081/jwt-api-token-auth/";
const EXTERNAL_API_URL = "http://172.16.20.3:8081/personnel/api/departments/";

// Credentials for authentication
const AUTH_CREDENTIALS = {
    username: "kamal",
    password: "Jovera@2022",
};

// Token cache to store and reuse the JWT token
let authToken = null;
let tokenExpiry = null;

// Function to fetch JWT token
const getAuthToken = async () => {
    try {
        const response = await axios.post(AUTH_API_URL, AUTH_CREDENTIALS);
        authToken = response.data.token;
        tokenExpiry = Date.now() + 3600 * 1000; // Assume token is valid for 1 hour
    } catch (error) {
        console.error("Error fetching auth token:", error);
        throw new Error("Failed to authenticate with external API");
    }
};

// Function to ensure we have a valid token
const ensureAuthToken = async () => {
    if (!authToken || Date.now() >= tokenExpiry) {
        await getAuthToken();
    }
};

// Function to fetch all departments with pagination
const fetchAllDepartments = async () => {
    let departments = [];
    let nextPage = EXTERNAL_API_URL;

    try {
        await ensureAuthToken();

        while (nextPage) {
            const response = await axios.get(nextPage, {
                headers: { Authorization: `JWT ${authToken}` },
            });

            departments = [...departments, ...response.data.data]; // Append new data
            nextPage = response.data.next || null; // Move to the next page
        }
    } catch (error) {
        console.error("Error fetching departments:", error);
        throw new Error("Failed to fetch departments from external API");
    }

    return departments;
};

// Create a new department
router.post("/create", async (req, res) => {
    try {
        const { name } = req.body;

        // Fetch all existing departments
        const departments = await fetchAllDepartments();

        // Find the highest dept_code and increment it
        const lastDeptCode = departments.reduce((max, dept) => {
            const deptCodeNum = parseInt(dept.dept_code, 10);
            return deptCodeNum > max ? deptCodeNum : max;
        }, 0);

        const newDeptCode = String(lastDeptCode + 1);

        // // Ensure we have a valid token
        // await ensureAuthToken();

        // // Send request to external API
        // const externalResponse = await axios.post(
        //     EXTERNAL_API_URL,
        //     { dept_code: newDeptCode, dept_name: name, parent_dept: null },
        //     { headers: { Authorization: `JWT ${authToken}` } }
        // );

        // // Extract bio_times_id from the response
        // const { id: bio_times_id } = externalResponse.data;

        // Save the department in our database
        const department = new Department({ name, code: newDeptCode, bio_times_id });
        await department.save();

        res.status(201).json({ message: "Department created successfully", department });
    } catch (error) {
        console.error("Error creating department:", error);
        res.status(500).json({ message: "Error creating department", error: error.message });
    }
});

// Get all departments
router.get("/all", async (req, res) => {
    try {
        const departments = await Department.find();
        res.status(200).json(departments);
    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ message: "Error fetching departments", error: error.message });
    }
});

// Get a department by ID
router.get("/:id", async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: "Department not found" });
        }
        res.status(200).json(department);
    } catch (error) {
        console.error("Error fetching department:", error);
        res.status(500).json({ message: "Error fetching department", error: error.message });
    }
});

// Update a department by ID
router.put("/update/:id", async (req, res) => {
    try {
        const { name, code } = req.body;

        // Find the existing department
        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: "Department not found" });
        }

        // Ensure we have a valid token
        await ensureAuthToken();

        // Send update request to external API
        await axios.put(
            `${EXTERNAL_API_URL}${department.bio_times_id}/`,
            { dept_code: code, dept_name: name, parent_dept: null },
            { headers: { Authorization: `JWT ${authToken}` } }
        );

        // Update the department in our database
        department.name = name;
        department.code = code;
        await department.save();

        res.status(200).json({ message: "Department updated successfully", department });
    } catch (error) {
        console.error("Error updating department:", error);
        res.status(500).json({ message: "Error updating department", error: error.message });
    }
});

// Delete a department by ID
router.delete("/delete/:id", async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);
        if (!department) {
            return res.status(404).json({ message: "Department not found" });
        }

        // Ensure we have a valid token
        await ensureAuthToken();

        // Send delete request to external API
        await axios.delete(`${EXTERNAL_API_URL}${department.bio_times_id}/`, {
            headers: { Authorization: `JWT ${authToken}` },
        });

        // Delete from our database
        await Department.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "Department deleted successfully" });
    } catch (error) {
        console.error("Error deleting department:", error);
        res.status(500).json({ message: "Error deleting department", error: error.message });
    }
});

module.exports = router;
