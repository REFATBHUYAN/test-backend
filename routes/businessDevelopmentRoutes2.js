import express from "express"
import {
  startBusinessDevelopmentSearch,
  stopBusinessDevelopmentSearch,
  processBusinessLinkedInDOM,
  getBusinessSearchHistory,
  getBusinessSearchResults,
  deleteBusinessSearchHistory,
  getBusinessSearchCostEstimate,
  getBusinessLeads,
  updateBusinessLead,
} from "../controllers/aiInterview/businessDevelopmentController2.js"

const router = express.Router()

// Search operations
router.post("/search", startBusinessDevelopmentSearch)
router.post("/stop-search", stopBusinessDevelopmentSearch)
router.get("/cost-estimate", getBusinessSearchCostEstimate)

// LinkedIn processing
router.post("/process-linkedin-dom", processBusinessLinkedInDOM)

// Search history
router.get("/history/:userId", getBusinessSearchHistory)
router.get("/results/:searchId", getBusinessSearchResults)
router.delete("/history/:searchId", deleteBusinessSearchHistory)

// Business leads management
router.get("/leads", getBusinessLeads)
router.put("/leads/:leadId", updateBusinessLead)

export default router