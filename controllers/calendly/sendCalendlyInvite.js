import nodemailer from "nodemailer";
import dotenv from "dotenv";
import Resume from "../../model/resumeModel.js";

dotenv.config();

export const sendCalendlyInvite = async (req, res) => {
  const { resumeIds, jobId, calendlyLink, company, jobTitle } = req.body;

  try {
    if (!resumeIds || !jobId || !calendlyLink || !company || !jobTitle) {
      return res.status(400).json({
        success: false,
        error: "Resume IDs, job ID, Calendly link, company, and job title are required",
      });
    }

    // Deduplicate resume IDs
    const uniqueResumeIds = [...new Set(resumeIds)];

    // Fetch resumes based on resume IDs and jobId
    const resumes = await Resume.find({ _id: { $in: uniqueResumeIds }, jobTitle: jobId });

    console.log(`Found ${resumes.length} resumes for ${uniqueResumeIds.length} unique resume IDs`);

    if (resumes.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No resumes found for the provided resume IDs and job ID",
      });
    }

    // Update all resumes to "Meet Link Sent" and append to jobStatus
    await Resume.updateMany(
      { _id: { $in: resumes.map((r) => r._id) } },
      {
        $set: { candidateStatus: "Meet Link Sent" },
        $addToSet: { jobStatus: "Meet Link Sent" },
      }
    );

    // Configure email service
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    let sentCount = 0;
    let failedEmails = [];

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
      };

      try {
        await transporter.sendMail(mailOptions);
        sentCount++;
        console.log(`Email sent to ${resume.email} for resume ID ${resume._id}`);
      } catch (error) {
        console.error(`Failed to send email to ${resume.email} for resume ID ${resume._id}:`, error.message);
        failedEmails.push(resume.email);
      }
    }

    res.status(200).json({
      success: true,
      sentCount,
      message: `Calendly invites sent successfully to ${sentCount} candidates.`,
      failedEmails,
    });
  } catch (error) {
    console.error("Error processing Calendly invite emails:", error);
    res.status(500).json({
      success: false,
      error: "Error processing Calendly invite emails",
    });
  }
};