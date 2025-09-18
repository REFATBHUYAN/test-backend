// businessDevelopmentRoutes.js - Focused on Client Discovery
import express from "express";

import {
    startBusinessDevelopmentSearch,
    getBusinessDevSearchHistory,
    getBusinessDevSearchResults,
    deleteBusinessDevSearchHistoryItem,
} from "../controllers/aiInterview/businessDevelopmentAgentController.js"; // Assuming the controller file is renamed

const router = express.Router();

// ===================================
// Business Development Agent Routes
// ===================================
router.post("/search", startBusinessDevelopmentSearch);
router.get("/history/:userId", getBusinessDevSearchHistory);
router.get("/results/:searchId", getBusinessDevSearchResults);
router.delete("/history/:searchId", deleteBusinessDevSearchHistoryItem);

export default router;
