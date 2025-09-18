// This file would be on your backend server

import express from "express"
import axios from "axios"
import { User } from "../../models/User" // Adjust based on your actual model structure

const router = express.Router()

router.post("/api/calendly/disconnect", async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: "Missing user ID" })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (user.calendly && user.calendly.accessToken) {
      try {
        // Revoke the token with Calendly
        await axios.post(
          "https://auth.calendly.com/oauth/revoke",
          {
            client_id: process.env.CALENDLY_CLIENT_ID,
            client_secret: process.env.CALENDLY_CLIENT_SECRET,
            token: user.calendly.accessToken,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        )
      } catch (error) {
        console.error("Error revoking Calendly token:", error)
        // Continue even if revocation fails
      }
    }

    // Remove Calendly data from user
    await User.findByIdAndUpdate(userId, {
      $unset: { calendly: 1 },
    })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error("Error disconnecting Calendly:", error)
    return res.status(500).json({ error: "Server error" })
  }
})

export default router
