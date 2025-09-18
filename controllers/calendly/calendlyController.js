import express from "express"
import nodemailer from "nodemailer"
import axios from "axios"
import User from "../../model/User.js"
import Resume from "../../model/resumeModel.js"

const router = express.Router()

// OAuth callback
router.post("/oauth-callback", async (req, res) => {
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

// Check connection
router.post("/check-connection", async (req, res) => {
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

// Get event types
router.post("/event-types", async (req, res) => {
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
    let accessToken = user.calendly.accessToken
    if (needsTokenRefresh(user.calendly)) {
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

// Create new event type
router.post("/create-event", async (req, res) => {
  try {
    const { userId, eventName, eventDescription, eventDuration } = req.body

    if (!userId || !eventName || !eventDuration) {
      return res.status(400).json({ error: "Missing required parameters" })
    }

    const user = await User.findById(userId)

    if (!user || !user.calendly || !user.calendly.accessToken) {
      return res.status(400).json({ error: "User not connected to Calendly" })
    }

    // Check if token needs to be refreshed
    let accessToken = user.calendly.accessToken
    if (needsTokenRefresh(user.calendly)) {
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

    // Get the user's organization URI first
    const userDetailsResponse = await axios.get("https://api.calendly.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    const userDetails = userDetailsResponse.data.resource
    const currentUserUri = userDetails.uri

    // Get the organization URI
    const organizationResponse = await axios.get(
      `https://api.calendly.com/organizations/${userDetails.current_organization}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    const organizationUri = organizationResponse.data.resource.uri

    // Create new event type in Calendly using the correct endpoint
    const eventResponse = await axios.post(
      "https://api.calendly.com/event_types",
      {
        name: eventName,
        description: eventDescription || "",
        color: "#00a2ff",
        duration: Number.parseInt(eventDuration),
        kind: "solo",
        slug: null, // Let Calendly generate the slug
        active: true,
        secret: false,
        booking_method: "instant",
        profile: {
          type: "user",
          owner: currentUserUri,
        },
        custom_questions: [],
        scheduling_url: null,
        event_memberships: [
          {
            user: currentUserUri,
          },
        ],
        organization: organizationUri,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    const newEvent = eventResponse.data.resource

    return res.status(200).json({
      success: true,
      eventUrl: newEvent.scheduling_url,
    })
  } catch (error) {
    console.error("Error creating Calendly event type:", error.response?.data || error.message)

    // If we can't create the event through the API, create a mock event for testing
    // This is a fallback for development/testing only
    if (process.env.NODE_ENV !== "production") {
      const mockEventUrl = `https://calendly.com/${req.body.userId}/${req.body.eventName.toLowerCase().replace(/\s+/g, "-")}`
      console.log("Created mock event URL for testing:", mockEventUrl)

      return res.status(200).json({
        success: true,
        eventUrl: mockEventUrl,
        note: "This is a mock event URL for testing purposes only.",
      })
    }

    return res.status(500).json({
      error: "Failed to create Calendly event type",
      details: error.response?.data || error.message,
    })
  }
})

// Send invite
router.post("/send-invite", async (req, res) => {
  const { resumeIds, jobId, calendlyLink, company, jobTitle } = req.body

  try {
    if (!resumeIds || !jobId || !calendlyLink || !company || !jobTitle) {
      return res.status(400).json({
        success: false,
        error: "Resume IDs, job ID, Calendly link, company, and job title are required",
      })
    }

    // Deduplicate resume IDs
    const uniqueResumeIds = [...new Set(resumeIds)]

    // Fetch resumes based on resume IDs and jobId
    const resumes = await Resume.find({
      _id: { $in: uniqueResumeIds },
      jobTitle: jobId,
    })

    console.log(`Found ${resumes.length} resumes for ${uniqueResumeIds.length} unique resume IDs`)

    if (resumes.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No resumes found for the provided resume IDs and job ID",
      })
    }

    // Update all resumes to "Meet Link Sent" and append to jobStatus
    await Resume.updateMany(
      { _id: { $in: resumes.map((r) => r._id) } },
      {
        $set: { candidateStatus: "Meet Link Sent" },
        $addToSet: { jobStatus: "Meet Link Sent" },
      },
    )

    // Configure email service
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    let sentCount = 0
    const failedEmails = []

    // Iterate over resumes and send emails
    for (const resume of resumes) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: resume.email,
        subject: `Interview Invitation for ${jobTitle} with ${company} - by Bloomix`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">Interview Invitation</h2>
            <p>Dear ${resume?.candidateName || "Candidate"},</p>
            <p>Congratulations! You have been shortlisted for an interview for the ${jobTitle} position at ${company}. We are excited to discuss your qualifications and how you can contribute to our team.</p>
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Click the link below to schedule your interview using Calendly.</li>
              <li>Choose a convenient time slot for your interview.</li>
              <li>Confirm your appointment.</li>
            </ol>
            <p style="text-align: center;">
              <a href="${calendlyLink}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Schedule Interview</a>
            </p>
            <p>Please ensure you book your slot at your earliest convenience, as slots are limited.</p>
            <p>If you have any questions or need assistance, feel free to reply to this email.</p>
            <p>Kind regards,</p>
            <p>Bloomix</p>
            <p>on behalf of ${company}</p>
          </div>
        `,
      }

      try {
        await transporter.sendMail(mailOptions)
        sentCount++
        console.log(`Email sent to ${resume.email} for resume ID ${resume._id}`)
      } catch (error) {
        console.error(`Failed to send email to ${resume.email} for resume ID ${resume._id}:`, error.message)
        failedEmails.push(resume.email)
      }
    }

    res.status(200).json({
      success: true,
      sentCount,
      message: `Calendly invites sent successfully to ${sentCount} candidates.`,
      failedEmails,
    })
  } catch (error) {
    console.error("Error processing Calendly invite emails:", error)
    res.status(500).json({
      success: false,
      error: "Error processing Calendly invite emails",
    })
  }
})

// Disconnect
router.post("/disconnect", async (req, res) => {
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

// Helper function to check if token needs refresh
function needsTokenRefresh(calendly) {
  if (!calendly || !calendly.tokenCreatedAt || !calendly.expiresIn) {
    return true
  }

  const tokenCreatedAt = new Date(calendly.tokenCreatedAt)
  const expiresInMs = calendly.expiresIn * 1000
  const expirationTime = new Date(tokenCreatedAt.getTime() + expiresInMs)

  // Refresh if token expires in less than 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)

  return expirationTime < fiveMinutesFromNow
}

export default router
