import express from "express"
import { initializeInterview, processResponse, submitInterview } from "../controllers/aiInterview/aiInterviewController.js"

const router = express.Router()

// Middleware to attach io to request
const attachIO = (io) => (req, res, next) => {
  req.io = io
  next()
}

// Routes
router.post("/initialize", initializeInterview)
router.post("/process", processResponse)
router.post("/submit", submitInterview)

export default router
export { attachIO }
