// This file would be on your backend server

import express from "express"
import axios from "axios"
import { User } from "../../models/User" // Adjust based on your actual model structure

const router = express.Router()

router.post("/api/calendly/event-types", async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: "Missing user ID" })
    }

    const user = await User.findById(userId)

    if (!user || !user.calendly || !user.calendly.accessToken) {
      return res.status(400).json({ error: "User not connected to Calendly" })
    }

    // Check if token needs to be refreshed
    const tokenCreatedAt = new Date(user.calendly.tokenCreatedAt)
    const expiresIn = user.calendly.expiresIn
    const now = new Date()
    const tokenExpiresAt = new Date(tokenCreatedAt.getTime() + expiresIn * 1000)

    let accessToken = user.calendly.accessToken

    // If token is expired or about to expire, refresh it
    if (tokenExpiresAt <= now || tokenExpiresAt - now < 300000) {
      // 5 minutes buffer
      const refreshResponse = await axios.post(
        "https://auth.calendly.com/oauth/token",
        {
          grant_type: "refresh_token",
          client_id: process.env.CALENDLY_CLIENT_ID,
          client_secret: process.env.CALENDLY_CLIENT_SECRET,
          refresh_token: user.calendly.refreshToken,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )

      const { access_token, refresh_token, expires_in } = refreshResponse.data

      // Update tokens in database
      await User.findByIdAndUpdate(userId, {
        "calendly.accessToken": access_token,
        "calendly.refreshToken": refresh_token,
        "calendly.expiresIn": expires_in,
        "calendly.tokenCreatedAt": new Date(),
      })

      accessToken = access_token
    }

    // Get user's event types from Calendly
    const eventTypesResponse = await axios.get(
      `https://api.calendly.com/event_types?user=${user.calendly.calendlyUri}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    const eventTypes = eventTypesResponse.data.collection

    return res.status(200).json({
      success: true,
      eventTypes,
    })
  } catch (error) {
    console.error("Error fetching Calendly event types:", error.response?.data || error.message)
    return res.status(500).json({
      error: "Failed to fetch Calendly event types",
      details: error.response?.data || error.message,
    })
  }
})

export default router
