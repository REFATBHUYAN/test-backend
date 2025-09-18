// This file would be on your backend server

import express from "express"
import axios from "axios"
import { Resume } from "../../models/Resume" // Adjust based on your actual model structure

const router = express.Router()

router.post("/api/calendly/send-invite", async (req, res) => {
  try {
    const { resumeIds, jobId, calendlyLink, company, jobTitle } = req.body

    if (!resumeIds || !resumeIds.length || !jobId || !calendlyLink) {
      return res.status(400).json({ error: "Missing required parameters" })
    }

    // Get candidate information
    const candidates = await Resume.find({ _id: { $in: resumeIds } })

    if (!candidates.length) {
      return res.status(404).json({ error: "No candidates found" })
    }

    let sentCount = 0
    const errors = []

    // Send email to each candidate with the Calendly link
    for (const candidate of candidates) {
      try {
        // Send email with Calendly link
        await axios.post(`${process.env.EMAIL_SERVICE_URL}/send-email`, {
          to: candidate.email,
          subject: `Interview Invitation for ${jobTitle} position at ${company}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Interview Invitation</h2>
              <p>Dear ${candidate.candidateName},</p>
              <p>Thank you for your interest in the ${jobTitle} position at ${company}.</p>
              <p>We would like to invite you to schedule an interview at your convenience using the link below:</p>
              <p><a href="${calendlyLink}" style="display: inline-block; background-color: #14b8a6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Schedule Interview</a></p>
              <p>If you have any questions, please don't hesitate to contact us.</p>
              <p>Best regards,<br>${company} Hiring Team</p>
            </div>
          `,
        })

        // Update candidate status
        await Resume.findByIdAndUpdate(candidate._id, {
          $set: {
            jobStatus: [...candidate.jobStatus, "Interview Scheduled"],
            lastUpdated: new Date(),
          },
        })

        sentCount++
      } catch (error) {
        console.error(`Error sending invite to ${candidate.email}:`, error)
        errors.push({ email: candidate.email, error: error.message })
      }
    }

    return res.status(200).json({
      success: true,
      sentCount,
      totalCount: candidates.length,
      errors: errors.length ? errors : null,
    })
  } catch (error) {
    console.error("Error sending Calendly invites:", error)
    return res.status(500).json({
      error: "Failed to send Calendly invites",
      details: error.message,
    })
  }
})

export default router
