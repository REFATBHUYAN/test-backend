import { OpenAI } from "@langchain/openai"
import dotenv from "dotenv"
import Resume from "../../model/resumeModel.js"
import JobDescription from "../../model/JobDescriptionModel.js"
import AIInterviewResult from "../../model/aiInterviewResultModel.js"
import MCPSession from "../../model/mcpSessionModel.js"
import nodemailer from "nodemailer"
import Notification from "../../model/NotificationModal.js"
import { io } from "../../index.js"
import { v4 as uuidv4 } from "uuid"

dotenv.config()

/**
 * Initialize an MCP (Model Context Protocol) interview session
 * MCP maintains a persistent context state that evolves throughout the interview
 */
export const initializeMCPInterview = async (req, res) => {
  const { jobId, resumeId } = req.query

  if (!jobId) {
    return res.status(400).json({ message: "Please provide job ID." })
  }

  if (!resumeId) {
    return res.status(400).json({ message: "Please provide resume ID." })
  }

  try {
    // Get job and resume details
    const job = await JobDescription.findById(jobId)
    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    const resume = await Resume.findById(resumeId)
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    // Create AI model instance
    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0.2,
    })

    // Get interview parameters from query string or use defaults
    const queryParams = req.query
    const maxQuestions = Number.parseInt(queryParams.maxQuestions) || 8
    const interviewDuration = Number.parseInt(queryParams.interviewDuration) || 15
    const interviewStyle = queryParams.interviewStyle || "balanced"
    const focusAreas = queryParams.focusAreas ? queryParams.focusAreas.split(",") : ["technical", "experience"]
    const customInstructions = queryParams.customInstructions || ""

    // Generate a unique session ID for this MCP interview
    const sessionId = uuidv4()

    // Initialize the MCP context state
    const initialContextState = {
      jobDetails: {
        id: job._id,
        title: job.context,
        description: job.markdown_description,
      },
      candidateDetails: {
        id: resume._id,
        name: resume.candidateName,
        resume: resume,
      },
      interviewParameters: {
        maxQuestions,
        interviewDuration,
        interviewStyle,
        focusAreas,
        customInstructions,
      },
      interviewProgress: {
        currentQuestionCount: 0,
        questionsAsked: [],
        topicsDiscussed: [],
        candidateStrengths: [],
        candidateWeaknesses: [],
        followUpAreas: [],
      },
      interviewStrategy: {
        remainingMustAskTopics: [...focusAreas],
        adaptationLevel: 0, // 0-10 scale of how much to adapt based on candidate responses
        currentDepthLevel: 1, // 1-5 scale of how deep to go on current topic
      },
    }

    // Create MCP system prompt
    const mcpSystemPrompt = `
      You are an AI interviewer conducting a job interview using the Model Context Protocol (MCP).
      
      MCP is a protocol where you maintain a rich context state that evolves throughout the conversation.
      This allows you to conduct a more natural, adaptive interview that feels like a real human conversation.
      
      Job Description: ${job.markdown_description}
      
      Candidate Resume: ${JSON.stringify(resume)}
      
      Interview Parameters:
      - Maximum Questions: ${maxQuestions}
      - Interview Duration: Approximately ${interviewDuration} minutes
      - Interview Style: ${interviewStyle} (${interviewStyle === "conversational" ? "friendly and relaxed" : interviewStyle === "challenging" ? "probing and rigorous" : "professional but approachable"})
      - Focus Areas: ${focusAreas.join(", ")}
      ${customInstructions ? `- Custom Instructions: ${customInstructions}` : ""}
      
      MCP Guidelines:
      1. Start with a brief, professional greeting introducing yourself as an AI interviewer.
      2. Ask one question at a time and wait for the candidate's response.
      3. Follow up with relevant questions based on the candidate's previous answers.
      4. Focus on the specified areas while maintaining a natural conversation flow.
      5. Adapt your questions based on the candidate's background and experience.
      6. Avoid asking yes/no questions; prefer open-ended questions that reveal skills and experience.
      7. Keep your responses concise and professional.
      8. Use the context state to track the interview progress and adapt your strategy.
      
      For your first response, provide:
      1. A brief greeting introducing yourself
      2. Your first interview question that's relevant to the job and candidate's background
    `

    const response = await model.call(mcpSystemPrompt)

    // Split the response into greeting and first question
    const parts = response.split(/(?=\?)/)
    let initialGreeting, firstQuestion

    if (parts.length >= 2) {
      // If there's a clear question mark, split there
      initialGreeting = parts[0].trim()
      firstQuestion = parts.slice(1).join("").trim()
    } else {
      // Otherwise make a best guess at splitting
      const sentences = response.split(/(?<=\.|!)\s+/)
      if (sentences.length >= 2) {
        initialGreeting = sentences[0].trim()
        firstQuestion = sentences.slice(1).join(" ").trim()
      } else {
        // If all else fails, use the whole response as greeting and generate a generic first question
        initialGreeting = response.trim()
        firstQuestion = "Could you tell me about your background and experience relevant to this position?"
      }
    }

    // Update the context state with the first question
    initialContextState.interviewProgress.currentQuestionCount = 1
    initialContextState.interviewProgress.questionsAsked.push(firstQuestion)

    // Save the MCP session to the database
    const mcpSession = new MCPSession({
      sessionId,
      jobId,
      resumeId,
      contextState: initialContextState,
      messages: [
        {
          role: "system",
          content: mcpSystemPrompt,
        },
        {
          role: "assistant",
          content: initialGreeting + " " + firstQuestion,
        },
      ],
      createdAt: new Date(),
    })

    await mcpSession.save()

    // Return the interview initialization data
    return res.status(200).json({
      message: "MCP Interview initialized successfully",
      sessionId,
      initialGreeting,
      firstQuestion,
      jobDetails: {
        id: job._id,
        title: job.context,
      },
      candidateDetails: {
        id: resume._id,
        name: resume.candidateName,
      },
      maxQuestions,
      contextState: initialContextState,
    })
  } catch (error) {
    console.log("Error ->", error.message)
    return res.status(500).json({ error: error.message })
  }
}

/**
 * Process candidate response using MCP and generate next question
 * MCP updates the context state based on the candidate's response
 */
export const mcpInterviewResponse = async (req, res) => {
  const { sessionId, userMessage, contextState, questionCount } = req.body

  if (!sessionId || !userMessage || !contextState) {
    return res.status(400).json({ message: "Missing required parameters" })
  }

  try {
    // Retrieve the MCP session
    const mcpSession = await MCPSession.findOne({ sessionId })
    if (!mcpSession) {
      return res.status(404).json({ message: "MCP session not found" })
    }

    // Create AI model instance
    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0.2,
    })

    // Get the current context state
    const currentContextState = contextState

    // Determine if this should be the last question
    const maxQuestions = currentContextState.interviewParameters.maxQuestions || 8
    const isNearingEnd = questionCount >= maxQuestions - 1

    // Add the user message to the session history
    mcpSession.messages.push({
      role: "user",
      content: userMessage,
    })

    // Create the MCP prompt for the next response
    const mcpPrompt = `
      You are an AI interviewer conducting a job interview using the Model Context Protocol (MCP).
      
      Current MCP Context State:
      ${JSON.stringify(currentContextState, null, 2)}
      
      The candidate just responded: "${userMessage}"
      
      Instructions:
      1. Analyze the candidate's response
      2. Update the MCP context state based on this response
      3. Formulate a relevant follow-up question or concluding remark
      4. Keep your response concise and focused
      ${isNearingEnd ? "5. This is nearing the end of the interview. If appropriate, ask a concluding question." : ""}
      
      Your response should be in the following JSON format:
      {
        "response": "Your next question or remark to the candidate",
        "updatedContextState": {
          // The full updated context state with your changes
        },
        "isQuestion": true/false,
        "shouldEndInterview": true/false,
        "reasoning": "Brief explanation of your thought process (not shown to candidate)"
      }
    `

    // Generate AI response
    const aiResponseRaw = await model.call(mcpPrompt)

    // Parse the JSON response
    let aiResponseJson
    try {
      // Extract JSON from the response (in case the model includes extra text)
      const jsonMatch = aiResponseRaw.match(/\{[\s\S]*\}/)
      const jsonString = jsonMatch ? jsonMatch[0] : aiResponseRaw
      aiResponseJson = JSON.parse(jsonString)
    } catch (error) {
      console.error("Error parsing AI response JSON:", error)
      return res.status(500).json({ error: "Failed to parse AI response" })
    }

    // Extract the components from the parsed JSON
    const {
      response,
      updatedContextState,
      isQuestion = true,
      shouldEndInterview = false,
      reasoning = "",
    } = aiResponseJson

    // Add the AI response to the session history
    mcpSession.messages.push({
      role: "assistant",
      content: response,
    })

    // Update the session with the new context state
    mcpSession.contextState = updatedContextState || currentContextState
    await mcpSession.save()

    // Determine if this is the final question
    let closingMessage = null
    if (shouldEndInterview || questionCount >= maxQuestions - 1) {
      closingMessage =
        "Thank you for participating in this interview. Your responses have been recorded and will be reviewed by the hiring team. We'll be in touch soon with next steps."
    }

    // Return the AI response
    return res.status(200).json({
      response,
      updatedContextState,
      isQuestion,
      shouldEndInterview,
      closingMessage,
      reasoning, // This is for debugging and won't be shown to the candidate
    })
  } catch (error) {
    console.log("Error ->", error.message)
    return res.status(500).json({ error: error.message })
  }
}

/**
 * Submit completed MCP interview
 * Uses the final context state for a more comprehensive evaluation
 */
export const submitMCPInterview = async (req, res) => {
  const { sessionId, jobId, resumeId, userId, email, interviewTranscript, finalContextState } = req.body

  if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
    return res.status(400).json({ message: "Missing required parameters" })
  }

  try {
    // Retrieve the MCP session
    const mcpSession = await MCPSession.findOne({ sessionId })
    if (!mcpSession) {
      return res.status(404).json({ message: "MCP session not found" })
    }

    // Get job and resume details
    const job = await JobDescription.findById(jobId)
    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    const resume = await Resume.findById(resumeId)
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    // Create AI model instance for evaluation
    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    })

    // Format transcript for evaluation
    const formattedTranscript = interviewTranscript
      .map((msg, index) => `${msg.type === "agent" ? "Interviewer" : "Candidate"}: ${msg.content}`)
      .join("\n\n")

    // Generate evaluation using MCP context
    const evaluationPrompt = `
      You are an expert HR evaluator. Review this job interview transcript and the MCP context state to provide:
      
      1. An overall score out of 10
      2. A brief summary of strengths (2-3 bullet points)
      3. A brief summary of areas for improvement (1-2 bullet points)
      4. A recommendation (Strongly Recommend / Recommend / Consider / Do Not Recommend)
      
      Job Description: ${job.markdown_description}
      
      Interview Transcript:
      ${formattedTranscript}
      
      MCP Context State (contains interview progress and insights):
      ${JSON.stringify(finalContextState, null, 2)}
      
      Format your response exactly as follows:
      Score: [number out of 10]
      Strengths:
      - [strength 1]
      - [strength 2]
      - [strength 3 if applicable]
      Areas for Improvement:
      - [area 1]
      - [area 2 if applicable]
      Recommendation: [Strongly Recommend / Recommend / Consider / Do Not Recommend]
    `

    const evaluation = await model.call(evaluationPrompt)

    // Parse evaluation results
    const scoreMatch = evaluation.match(/Score:\s*(\d+(?:\.\d+)?)/i)
    const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : 0

    const recommendationMatch = evaluation.match(
      /Recommendation:\s*(Strongly Recommend|Recommend|Consider|Do Not Recommend)/i,
    )
    const recommendation = recommendationMatch ? recommendationMatch[1] : "Consider"

    // Save interview results
    const aiInterviewResult = new AIInterviewResult({
      resumeId,
      jobId,
      sessionId,
      transcript: interviewTranscript,
      contextState: finalContextState,
      evaluation,
      score,
      recommendation,
    })

    await aiInterviewResult.save()

    // Update resume status
    if (resume) {
      resume.aiInterviewResults = resume.aiInterviewResults || []
      resume.aiInterviewResults.push({
        interviewId: aiInterviewResult._id,
        score,
        recommendation,
      })

      // Update candidate status
      resume.candidateStatus = "AI Interview Completed"
      await resume.save()
    }

    // Send notification email
    if (email) {
      // Configure Nodemailer
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      })

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `MCP AI Interview Completed: ${resume.candidateName} for ${job.context}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">MCP AI Interview Completed</h2>
            <p>Dear Hiring Manager,</p>
            <p>An AI interview using Model Context Protocol has been completed by a candidate for the ${job.context} position. Below are the details:</p>
            <p><strong>Interview Details:</strong></p>
            <ul>
              <li><strong>Job Title:</strong> ${job.context}</li>
              <li><strong>Candidate Name:</strong> ${resume.candidateName}</li>
              <li><strong>Overall Score:</strong> ${score}/10</li>
              <li><strong>Recommendation:</strong> ${recommendation}</li>
            </ul>
            <p>Please review the full interview transcript and evaluation in the system.</p>
            <p>Best regards,</p>
            <p>The Team</p>
          </div>
        `,
      }

      try {
        await transporter.sendMail(mailOptions)
        console.log("Notification email sent successfully!")
      } catch (error) {
        console.error("Error sending email:", error)
      }
    }

    // Create notification
    if (userId) {
      const newNotification = new Notification({
        message: `${resume?.candidateName} MCP AI Interview Completed`,
        recipientId: userId,
        resumeId: resumeId,
      })

      await newNotification.save()

      // Emit the new notification event
      io.emit("newNotification", newNotification)
    }

    // Mark the MCP session as completed
    mcpSession.isCompleted = true
    mcpSession.completedAt = new Date()
    await mcpSession.save()

    return res.status(200).json({
      message: "MCP Interview submitted and evaluated successfully!",
      score,
      recommendation,
    })
  } catch (error) {
    console.log("Error ->", error.message)
    return res.status(500).json({ error: error.message })
  }
}
