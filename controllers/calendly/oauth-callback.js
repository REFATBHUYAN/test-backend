// This file would be on your backend server
// Example implementation for Node.js/Express

import express from "express"
import axios from "axios"
import { User } from "../../models/User" // Adjust based on your actual model structure

const router = express.Router()

router.post("/api/calendly/oauth-callback", async (req, res) => {
  try {
    const { code, userId } = req.body

    if (!code || !userId) {
      return res.status(400).json({ error: "Missing required parameters" })
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await axios.post(
      "https://auth.calendly.com/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: process.env.CALENDLY_CLIENT_ID,
        client_secret: process.env.CALENDLY_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.FRONTEND_URL}/calendly-callback`,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    )

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    // Get user information from Calendly
    const userResponse = await axios.get("https://api.calendly.com/users/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    const calendlyUser = userResponse.data.resource

    // Store the tokens and user info in your database
    await User.findByIdAndUpdate(userId, {
      calendly: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        tokenCreatedAt: new Date(),
        calendlyUri: calendlyUser.uri,
        calendlyEmail: calendlyUser.email,
        calendlyName: `${calendlyUser.name}`,
        scheduleUrl: calendlyUser.scheduling_url,
      },
    })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error("Calendly OAuth error:", error.response?.data || error.message)
    return res.status(500).json({
      error: "Failed to connect Calendly account",
      details: error.response?.data || error.message,
    })
  }
})

export default router
