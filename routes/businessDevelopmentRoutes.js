
import express from "express"
import {
  startBusinessDevelopmentSearch,
  stopBusinessSearch,
  getBusinessSearchHistory,
  getBusinessProspects,
  updateProspectStatus,
  deleteBusinessProspect,
  getSearchStatistics
} from "../controllers/aiInterview/businessDevelopmentController.js"

const router = express.Router()

// Search routes
router.post("/search", startBusinessDevelopmentSearch)
router.post("/stop-search", stopBusinessSearch)

// History routes
router.get("/history/:userId", getBusinessSearchHistory)

// Prospect routes
router.get("/prospects/:userId", getBusinessProspects)
router.put("/prospect/:prospectId", updateProspectStatus)
router.delete("/prospect/:prospectId", deleteBusinessProspect)
router.get("/statistics/:userId", getSearchStatistics); //new 

export default router
