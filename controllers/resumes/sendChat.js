import Resume from "../../model/resumeModel.js"
import nodemailer from "nodemailer"
import dotenv from "dotenv"
import { v2 as cloudinary } from "cloudinary"

dotenv.config()

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// Enhanced sendChat function with rich text support
export const sendChat = async (req, res) => {
  const {
    resumeId,
    candidateEmail,
    question,
    attachments = [],
    frontendURL,
    jobTitle,
    company,
    userId,
    isRichText = false,
  } = req.body

  console.log("=== SEND CHAT DEBUG ===")
  console.log("Resume ID:", resumeId)
  console.log("Question:", question)
  console.log("Is Rich Text:", isRichText)
  console.log("Received attachments:", JSON.stringify(attachments, null, 2))

  // Validate input
  if (!resumeId) {
    return res.status(400).json({ message: "Resume ID is required" })
  }

  if (!candidateEmail) {
    return res.status(400).json({ message: "Candidate email is required" })
  }

  // Clean and validate question content
  let cleanQuestion = ""
  if (question) {
    if (isRichText) {
      // For rich text, ensure it's valid HTML and not just empty tags
      const textContent = question.replace(/<[^>]*>/g, "").trim()
      if (textContent.length > 0) {
        cleanQuestion = question.trim()
      }
    } else {
      cleanQuestion = question.trim()
    }
  }

  // Don't save empty messages without attachments
  if (!cleanQuestion && attachments.length === 0) {
    return res.status(400).json({ message: "Message cannot be empty" })
  }

  try {
    const resume = await Resume.findById(resumeId)

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    console.log("Found resume:", resume.candidateName)

    // Initialize chat object if it doesn't exist
    if (!resume.chat) {
      console.log("Initializing new chat object")
      resume.chat = {
        questions: [],
        answers: [],
        attachments: [],
        answerAttachments: [],
        date: new Date(),
      }
    }

    // Ensure all arrays exist and are synchronized
    const currentLength = resume.chat.questions.length
    if (resume.chat.attachments.length < currentLength) {
      resume.chat.attachments = [
        ...resume.chat.attachments,
        ...Array(currentLength - resume.chat.attachments.length).fill([]),
      ]
    }
    if (resume.chat.answerAttachments.length < currentLength) {
      resume.chat.answerAttachments = [
        ...resume.chat.answerAttachments,
        ...Array(currentLength - resume.chat.answerAttachments.length).fill([]),
      ]
    }

    // Add the new question and attachments
    resume.chat.questions.push(cleanQuestion)
    resume.chat.answers.push("") // Empty answer initially
    resume.chat.attachments.push(attachments.length > 0 ? attachments : [])
    resume.chat.answerAttachments.push([])
    resume.chat.date = new Date()

    // Mark the chat field as modified
    resume.markModified("chat")

    // Save the resume
    const savedResume = await resume.save()

    console.log("Successfully saved resume")

    // Send email to candidate
    try {
      await sendEmailToCandidate(
        candidateEmail,
        cleanQuestion,
        attachments,
        frontendURL,
        resumeId,
        jobTitle,
        company,
        userId,
        isRichText,
      )
    } catch (emailError) {
      console.error("Error sending email:", emailError)
      // Don't fail the entire request if email fails
    }

    console.log("=== END SEND CHAT DEBUG ===")
    return res.status(200).json({
      message: "Chat saved and email sent successfully",
      success: true,
      data: {
        resumeId: savedResume._id,
        candidateName: savedResume.candidateName,
        questionIndex: savedResume.chat.questions.length - 1,
      },
    })
  } catch (error) {
    console.error("Error in sendChat:", error)
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      success: false,
    })
  }
}

// Enhanced bulk send function
export const sendBulkChat = async (req, res) => {
  const { resumeIds, question, attachments = [], frontendURL, jobTitle, company, userId, isRichText = false } = req.body

  console.log("=== SEND BULK CHAT DEBUG ===")
  console.log("Resume IDs:", resumeIds)
  console.log("Question:", question)
  console.log("Is Rich Text:", isRichText)
  console.log("Recipients count:", resumeIds?.length)

  // Validate input
  if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
    return res.status(400).json({ message: "At least one resume ID is required" })
  }

  // Clean and validate question content
  let cleanQuestion = ""
  if (question) {
    if (isRichText) {
      const textContent = question.replace(/<[^>]*>/g, "").trim()
      if (textContent.length > 0) {
        cleanQuestion = question.trim()
      }
    } else {
      cleanQuestion = question.trim()
    }
  }

  if (!cleanQuestion && attachments.length === 0) {
    return res.status(400).json({ message: "Message cannot be empty" })
  }

  const results = {
    success: [],
    failed: [],
    total: resumeIds.length,
  }

  try {
    // Process each resume
    for (const resumeId of resumeIds) {
      try {
        const resume = await Resume.findById(resumeId)

        if (!resume) {
          results.failed.push({
            resumeId,
            error: "Resume not found",
            candidateName: "Unknown",
          })
          continue
        }

        // Initialize chat object if it doesn't exist
        if (!resume.chat) {
          resume.chat = {
            questions: [],
            answers: [],
            attachments: [],
            answerAttachments: [],
            date: new Date(),
          }
        }

        // Ensure all arrays exist and are synchronized
        const currentLength = resume.chat.questions.length
        if (resume.chat.attachments.length < currentLength) {
          resume.chat.attachments = [
            ...resume.chat.attachments,
            ...Array(currentLength - resume.chat.attachments.length).fill([]),
          ]
        }
        if (resume.chat.answerAttachments.length < currentLength) {
          resume.chat.answerAttachments = [
            ...resume.chat.answerAttachments,
            ...Array(currentLength - resume.chat.answerAttachments.length).fill([]),
          ]
        }

        // Add the new question and attachments
        resume.chat.questions.push(cleanQuestion)
        resume.chat.answers.push("")
        resume.chat.attachments.push(attachments.length > 0 ? [...attachments] : [])
        resume.chat.answerAttachments.push([])
        resume.chat.date = new Date()

        // Mark the chat field as modified
        resume.markModified("chat")

        // Save the resume
        await resume.save()

        // Send email to candidate
        try {
          await sendEmailToCandidate(
            resume.email,
            cleanQuestion,
            attachments,
            frontendURL,
            resumeId,
            jobTitle,
            company,
            userId,
            isRichText,
          )
        } catch (emailError) {
          console.error(`Error sending email to ${resume.candidateName}:`, emailError)
          // Continue even if email fails
        }

        results.success.push({
          resumeId,
          candidateName: resume.candidateName,
          email: resume.email,
        })
      } catch (error) {
        console.error(`Error processing resume ${resumeId}:`, error)
        results.failed.push({
          resumeId,
          error: error.message,
          candidateName: "Unknown",
        })
      }
    }

    console.log("Bulk send results:", results)
    console.log("=== END SEND BULK CHAT DEBUG ===")

    return res.status(200).json({
      message: `Bulk message sent: ${results.success.length} successful, ${results.failed.length} failed`,
      success: true,
      results,
    })
  } catch (error) {
    console.error("Error in sendBulkChat:", error)
    return res.status(500).json({
      message: "Internal server error during bulk send",
      error: error.message,
      success: false,
      results,
    })
  }
}

// Enhanced getChatHistoryNew with rich text support
export const getChatHistoryNew = async (req, res) => {
  const { resumeId } = req.query

  try {
    console.log("=== GET CHAT HISTORY DEBUG ===")
    console.log("Resume ID:", resumeId)

    if (!resumeId) {
      return res.status(400).json({ message: "Resume ID is required" })
    }

    const resume = await Resume.findById(resumeId)

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    console.log("Found resume:", resume.candidateName)

    if (!resume.chat || !resume.chat.questions) {
      console.log("No chat data found")
      return res.status(200).json({ chatHistory: [] })
    }

    // Format chat history for frontend
    const chatHistory = []

    // Add questions and answers in chronological order
    for (let i = 0; i < resume.chat.questions.length; i++) {
      const questionText = resume.chat.questions[i] || ""
      const questionAttachments = resume.chat.attachments[i] || []

      // Add question if it has content
      if (questionText.trim() || questionAttachments.length > 0) {
        const questionItem = {
          type: "question",
          message: questionText,
          attachments: questionAttachments,
          index: i,
          timestamp: resume.chat.date || new Date(),
          isRichText: questionText.includes("<") && questionText.includes(">"),
        }
        chatHistory.push(questionItem)
      }

      // Add corresponding answer if it has content
      const answerText = resume.chat.answers[i] || ""
      const answerAttachments = resume.chat.answerAttachments[i] || []

      if (answerText.trim() || answerAttachments.length > 0) {
        const answerItem = {
          type: "answer",
          message: answerText,
          attachments: answerAttachments,
          index: i,
          timestamp: resume.chat.date || new Date(),
          isRichText: answerText.includes("<") && answerText.includes(">"),
        }
        chatHistory.push(answerItem)
      }
    }

    console.log("Final chat history length:", chatHistory.length)
    console.log("=== END GET CHAT HISTORY DEBUG ===")

    return res.status(200).json({
      chatHistory,
      success: true,
    })
  } catch (error) {
    console.error("Error in getChatHistory:", error)
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      success: false,
    })
  }
}

// Enhanced email function with rich text support
const sendEmailToCandidate = async (
  email,
  question,
  attachments,
  frontendURL,
  resumeId,
  jobTitle,
  company,
  userId,
  isRichText = false,
) => {
  let attachmentsHtml = ""
  if (attachments && attachments.length > 0) {
    attachmentsHtml = `
      <div style="margin-top: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 5px;">
        <p><strong>Attachments:</strong></p>
        <ul style="padding-left: 20px;">
          ${attachments
            .map(
              (attachment) => `
            <li>
              <a href="${attachment.url}" target="_blank" style="color: #4CAF50; text-decoration: underline;">
                ${attachment.name || attachment.originalname || "Download attachment"}
              </a>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `
  }

  // Format question content for email
  let questionHtml = ""
  if (question && question.trim()) {
    if (isRichText) {
      questionHtml = `<div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">${question}</div>`
    } else {
      questionHtml = `<p><strong>Question:</strong> ${question}</p>`
    }
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Message from ${company} for Query on position of ${jobTitle} - by Bloomix`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
        <h2 style="text-align: center; color: #4CAF50;">Message from Hiring Manager</h2>
        <p>Dear Candidate,</p>
        <p>You have a new query from the recruiter regarding your application for the position of ${jobTitle}.</p>
        ${questionHtml}
        ${attachmentsHtml}
        <p><strong>Instructions:</strong></p>
        <ol>
          <li>Click the link below to answer the question:</li>
          <li>Answer the question and click on the send button.</li>
        </ol>
        <p style="text-align: center;">
          <a href="${frontendURL}/chatReply?resumeId=${resumeId}&userId=${userId}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Chat</a>
        </p>
        <p>Kind regards,</p>
        <p>${company} on behalf of Bloomix</p>
      </div>
    `,
  }

  return transporter.sendMail(mailOptions)
}

// Add this to your existing controller file

export const submitChatAnswer = async (req, res) => {
  const { resumeId, answer, attachments = [], userId, isRichText = false } = req.body

  console.log("=== SUBMIT ANSWER DEBUG ===")
  console.log("Resume ID:", resumeId)
  console.log("Answer:", answer)
  console.log("Is Rich Text:", isRichText)
  console.log("Answer attachments:", JSON.stringify(attachments, null, 2))

  // Validate input
  if (!resumeId) {
    return res.status(400).json({ message: "Resume ID is required" })
  }

  // Clean and validate answer content
  let cleanAnswer = ""
  if (answer) {
    if (isRichText) {
      // For rich text, ensure it's valid HTML and not just empty tags
      const textContent = answer.replace(/<[^>]*>/g, "").trim()
      if (textContent.length > 0) {
        cleanAnswer = answer.trim()
      }
    } else {
      cleanAnswer = answer.trim()
    }
  }

  if (!cleanAnswer && attachments.length === 0) {
    return res.status(400).json({ message: "Answer cannot be empty" })
  }

  try {
    const resume = await Resume.findById(resumeId)

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    if (!resume.chat || !resume.chat.questions || resume.chat.questions.length === 0) {
      return res.status(400).json({ message: "No questions found for this resume" })
    }

    console.log("Current chat before answer:")
    console.log("Questions:", resume.chat.questions.length)
    console.log("Answers:", resume.chat.answers.length)
    console.log("Current answers:", resume.chat.answers)

    let lastUnansweredIndex = -1
    for (let i = 0; i < resume.chat.questions.length; i++) {
      if (!resume.chat.answers[i] || resume.chat.answers[i].trim() === "") {
        lastUnansweredIndex = i
        break
      }
    }

    if (lastUnansweredIndex === -1) {
      lastUnansweredIndex = resume.chat.questions.length - 1
    }

    console.log("Updating answer at index:", lastUnansweredIndex)

    resume.chat.answers[lastUnansweredIndex] = cleanAnswer

    if (!resume.chat.answerAttachments) {
      resume.chat.answerAttachments = []
    }

    while (resume.chat.answerAttachments.length <= lastUnansweredIndex) {
      resume.chat.answerAttachments.push([])
    }

    resume.chat.answerAttachments[lastUnansweredIndex] = attachments.length > 0 ? attachments : []

    console.log("Before saving answer:")
    console.log("Answer attachments array:", JSON.stringify(resume.chat.answerAttachments, null, 2))

    resume.chat.date = new Date()
    resume.markModified("chat")

    const savedResume = await resume.save()
    console.log("Answer saved successfully")
    console.log("Saved answer attachments:", JSON.stringify(savedResume.chat.answerAttachments, null, 2))

    const verifyResume = await Resume.findById(resumeId)
    console.log(
      "Verification - Answer attachments in DB:",
      JSON.stringify(verifyResume.chat.answerAttachments, null, 2),
    )

    if (userId) {
      try {
        await sendAnswerNotificationToRecruiter(
          process.env.EMAIL_USER,
          resume.candidateName,
          cleanAnswer,
          attachments,
          resume.companyName,
          isRichText,
        )
      } catch (emailError) {
        console.error("Error sending notification email:", emailError)
      }
    }

    console.log("=== END SUBMIT ANSWER DEBUG ===")
    return res.status(200).json({
      message: "Answer submitted successfully",
      success: true,
      data: {
        answerIndex: lastUnansweredIndex,
        attachmentsSaved: attachments.length,
        isRichText,
      },
    })
  } catch (error) {
    console.error("Error in submitChatAnswer:", error)
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      success: false,
    })
  }
}

// Enhanced email notification function
const sendAnswerNotificationToRecruiter = async (
  email,
  candidateName,
  answer,
  attachments,
  company,
  isRichText = false,
) => {
  let attachmentsHtml = ""
  if (attachments && attachments.length > 0) {
    attachmentsHtml = `
      <div style="margin-top: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 5px;">
        <p><strong>Attachments:</strong></p>
        <ul style="padding-left: 20px;">
          ${attachments
            .map(
              (attachment) => `
            <li>
              <a href="${attachment.url}" target="_blank" style="color: #4CAF50; text-decoration: underline;">
                ${attachment.name || attachment.originalname || "Download attachment"}
              </a>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `
  }

  // Format answer content for email
  let answerHtml = ""
  if (answer && answer.trim()) {
    if (isRichText) {
      answerHtml = `<div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">${answer}</div>`
    } else {
      answerHtml = `
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p style="margin: 0; white-space: pre-wrap;">${answer}</p>
        </div>
      `
    }
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `New Response from ${candidateName} - Bloomix Chat`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
        <h2 style="text-align: center; color: #4CAF50;">New Candidate Response</h2>
        <p>Hello,</p>
        <p>Candidate <strong>${candidateName}</strong> has responded to your message:</p>
        ${answerHtml}
        ${attachmentsHtml}
        <p>You can view the full conversation in your Bloomix dashboard.</p>
        <p>Kind regards,</p>
        <p>Bloomix on behalf of ${company}</p>
      </div>
    `,
  }

  return transporter.sendMail(mailOptions)
}

// Keep existing functions unchanged
export const uploadChatAttachment = async (req, res) => {
  // ... existing code remains the same
}










// import Resume from "../../model/resumeModel.js";
// import nodemailer from "nodemailer";
// import dotenv from "dotenv";

// dotenv.config();

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// export const sendChat = async (req, res) => {
//   const { resumeId, candidateEmail, question, frontendURL, jobTitle, company, userId } = req.body;

//   try {
//     // Fetch the resume by ID
//     const resume = await Resume.findById(resumeId);

//     if (!resume) {
//       return res.status(404).json({ message: "Resume not found" });
//     }

//     // Push the question to the chat
//     resume.chat.questions.push(question);
//     resume.chat.answers.push(""); // Empty answer initially
//     await resume.save();

//     // Send email with the question
//     await sendEmailToCandidate(candidateEmail, question, frontendURL, resumeId, jobTitle, company, userId);

//     return res.status(200).json({ message: "Chat saved and email sent" });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// const sendEmailToCandidate = async (email, question, frontendURL, resumeId, jobTitle, company, userId) => {
//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: email,
//     subject: `Message from ${company} for Query on position of ${jobTitle} - by Bloomix`,
//     html: `
//       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//         <h2 style="text-align: center; color: #4CAF50;">Message from Hiring Manager</h2>
//         <p>Dear Candidate,</p>
//         <p>You have a new query from the recruiter regarding your application for the position of ${jobTitle}.</p>
//         <p><strong>Question:</strong> ${question}</p>
//         <p><strong>Instructions:</strong></p>
//         <ol>
//           <li>Click the link below to answer the question:</li>
//           <li>Answer the question and click on the send button.</li>
//         </ol>
//         <p style="text-align: center;">
//           <a href="${frontendURL}/chatReply?resumeId=${resumeId}&userId=${userId}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Chat</a>
//         </p>
//         <p>Kind regards,</p>
//         <p>${company} on behalf of Bloomix</p>
//       </div>
//     `,
//   };

//   return transporter.sendMail(mailOptions);
// };
