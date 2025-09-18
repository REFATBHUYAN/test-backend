// This file would be on your backend server

import express from "express"
import { User } from "../../models/User" // Adjust based on your actual model structure

const router = express.Router()

router.post("/api/calendly/check-connection", async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: "Missing user ID" })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const isConnected = !!(user.calendly && user.calendly.accessToken)

    return res.status(200).json({
      connected: isConnected,
      defaultLink: isConnected ? user.calendly.scheduleUrl : null,
    })
  } catch (error) {
    console.error("Error checking Calendly connection:", error)
    return res.status(500).json({ error: "Server error" })
  }
})

export default router
