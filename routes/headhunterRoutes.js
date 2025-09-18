import express from "express"
import {
  startHeadhunterSearch,
  getSearchHistory,
  getSearchResults,
  // addCandidatesToWorkflow,
  deleteSearchHistoryItem,
  getCostEstimate,
  analyzeJobForPlatforms,
  stopSearch,
  processLinkedInDOM, // Unified endpoint for all DOM processing
  notifyManualExtraction,
} from "../controllers/aiInterview/headhunterController.js"
import { downloadResume, generateResume } from "../controllers/aiInterview/resume-generation-controller.js"
import { 
  initializeLinkedInAutomation,
  loginLinkedInAutomation,
  extractLinkedInProfileAutomation,
  closeLinkedInAutomation
} from '../controllers/aiInterview/linkedinAutomationController.js';

const router = express.Router()

// Start AI headhunter search
router.post("/search", startHeadhunterSearch)

// Stop ongoing search
router.post("/stop-search", stopSearch)

// Unified endpoint for processing LinkedIn DOM from the extension
router.post("/process-linkedin-dom", processLinkedInDOM)

// Test endpoint for extension
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Backend is reachable", timestamp: new Date().toISOString() })
})

// Get search history for a recruiter
router.get("/history/:recruiterId", getSearchHistory)

// Get the specific results for a past search
router.get("/results/:searchId", getSearchResults)

// Get cost estimate
router.get("/cost-estimate", getCostEstimate)

// Add selected candidates to workflow
// router.post("/add-to-workflow", addCandidatesToWorkflow)

// Delete search history item
router.delete("/history/:searchId", deleteSearchHistoryItem)

router.post("/manual-extraction-started", notifyManualExtraction)

// Generate Resume - Main endpoint
router.post("/generate-resume", generateResume)

// Download Resume - File download endpoint
router.get("/download-resume/:fileName", downloadResume)

// Analyze job for optimal platform selection
router.post("/analyze-job", analyzeJobForPlatforms);
// LinkedIn-specific routes


// Test routes for development
router.post('/linkedin-automation/init', initializeLinkedInAutomation);
router.post('/linkedin-automation/login', loginLinkedInAutomation);
router.post('/linkedin-automation/extract', extractLinkedInProfileAutomation);
router.post('/linkedin-automation/close', closeLinkedInAutomation);

export default router


// import express from "express"
// import {
//   startHeadhunterSearch,
//   getSearchHistory,
//   getSearchResults,
//   // addCandidatesToWorkflow,
//   deleteSearchHistoryItem,
//   getCostEstimate,
//   analyzeJobForPlatforms,
//   stopSearch,
//   processLinkedInDOM, // Unified endpoint for all DOM processing
//   notifyManualExtraction,
//   //  generateResume,
//   // downloadResume,
// } from "../controllers/aiInterview/headhunterController.js"
// import { downloadResume, generateResume } from "../controllers/aiInterview/resume-generation-controller.js"

// const router = express.Router()

// // Start AI headhunter search
// router.post("/search", startHeadhunterSearch)

// // Stop ongoing search
// router.post("/stop-search", stopSearch)

// // Unified endpoint for processing LinkedIn DOM from the extension
// router.post("/process-linkedin-dom", processLinkedInDOM)

// // Test endpoint for extension
// router.get("/test", (req, res) => {
//   res.json({ success: true, message: "Backend is reachable", timestamp: new Date().toISOString() })
// })

// // Get search history for a recruiter
// router.get("/history/:recruiterId", getSearchHistory)

// // Get the specific results for a past search
// router.get("/results/:searchId", getSearchResults)

// // Get cost estimate
// router.get("/cost-estimate", getCostEstimate)

// // Add selected candidates to workflow
// // router.post("/add-to-workflow", addCandidatesToWorkflow)

// // Delete search history item
// router.delete("/history/:searchId", deleteSearchHistoryItem)

// router.post("/manual-extraction-started", notifyManualExtraction)

// // Generate Resume - Main endpoint
// router.post("/generate-resume", generateResume)

// // Download Resume - File download endpoint
// router.get("/download-resume/:fileName", downloadResume)

// // Analyze job for optimal platform selection
// router.post("/analyze-job", analyzeJobForPlatforms);

// export default router