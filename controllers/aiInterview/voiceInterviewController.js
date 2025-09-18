import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { OpenAI } from "openai";
import Resume from "../../model/resumeModel.js";
import MCPSession from "../../model/mcpSessionModel.js";
import JobDescription from "../../model/JobDescriptionModel.js";

// const MCPSession = mongoose.model("MCPSession")
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// AI Interview Service
class AIInterviewService {
  static async generateInitialPrompt(jobDescription, resumeData) {
    const prompt = `You are conducting a professional voice interview. Create a single, cohesive greeting and first question for the candidate.

Job: ${jobDescription}
Candidate: ${resumeData.candidateName}

Create a warm, professional greeting that includes the first question. Make it flow naturally as one complete message. Do not use phrases like "Let's begin with our first question" - just flow directly into the question.

Example format: "Hello [Name], welcome to your AI voice interview for the [Position] role. I'm excited to learn more about you. To start, could you tell me about yourself and why you're interested in this position?"`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI API error:", error);
      return `Hello ${resumeData.candidateName}, welcome to your AI voice interview for this position. I'm excited to learn more about you. To start, could you tell me about yourself and why you're interested in this role?`;
    }
  }

  static async generateNextQuestion(
    userResponse,
    contextState,
    jobDescription,
    isNearingEnd
  ) {
    const questionsAsked = contextState.questionsAsked || [];
    const currentIndex = contextState.currentQuestionIndex || 0;

    const prompt = `You are an AI interviewer. Based on the candidate's response and interview context, generate the next appropriate question or conclude the interview.

Previous questions asked: ${questionsAsked.join(", ")}
Candidate's last response: "${userResponse}"
Current question index: ${currentIndex}
Job description: ${jobDescription}
Is nearing end: ${isNearingEnd}

${
  isNearingEnd
    ? "This should be one of the final questions or the conclusion. If concluding, thank them and mention next steps."
    : "Generate a relevant follow-up question based on their response and the job requirements."
}

Respond in JSON format:
{
  "response": "Your question or conclusion",
  "feedback": "Brief positive feedback on their answer",
  "is_question": true/false,
  "should_end_interview": true/false
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return {
        ...result,
        updated_context_state: {
          ...contextState,
          questionsAsked: [...questionsAsked, result.response],
          currentQuestionIndex: result.is_question
            ? currentIndex + 1
            : currentIndex,
        },
      };
    } catch (error) {
      console.error("Error generating next question:", error);
      return {
        response: isNearingEnd
          ? "Thank you for your responses. This concludes our interview. We'll be in touch soon regarding next steps."
          : "Can you tell me more about your experience with the key requirements for this role?",
        feedback: "Thank you for sharing that information.",
        is_question: !isNearingEnd,
        should_end_interview: isNearingEnd,
        updated_context_state: {
          ...contextState,
          currentQuestionIndex: currentIndex + (isNearingEnd ? 0 : 1),
        },
      };
    }
  }

  static async evaluateInterview(transcript, jobDescription, contextState) {
    const prompt = `Evaluate this voice interview transcript and provide a comprehensive assessment.

Job Description: ${jobDescription}
Interview Transcript: ${transcript}
Context: ${JSON.stringify(contextState)}

Provide evaluation in JSON format:
{
  "score": [number 1-10],
  "strengths": ["strength1", "strength2", "strength3"],
  "areas_for_improvement": ["area1", "area2"],
  "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
  "summary": "Brief overall assessment"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error("Error evaluating interview:", error);
      return {
        score: 7,
        strengths: [
          "Good communication",
          "Relevant experience",
          "Professional demeanor",
        ],
        areas_for_improvement: ["Could provide more specific examples"],
        recommendation: "Consider",
        summary: "Candidate showed good potential with room for growth.",
      };
    }
  }
}

const initializeMCPInterview = async (req, res) => {
  const { jobId, resumeId } = req.query;

  if (!jobId || !resumeId) {
    return res.status(400).json({ message: "jobId and resumeId are required" });
  }

  try {
    // Verify job and resume exist
    // const JobDescription = mongoose.model("JobDescription")
    // const Resume = mongoose.model("CV_Summary")

    const job = await JobDescription.findById(jobId);
    const resume = await Resume.findById(resumeId);

    if (!job || !resume) {
      return res.status(404).json({ message: "Job or resume not found" });
    }

    // Create MCP session
    const sessionId = randomUUID();
    const contextState = {
      questionsAsked: [],
      currentQuestionIndex: 0,
      startTime: new Date().toISOString(),
    };

    // Save session to MongoDB
    const mcpSession = new MCPSession({
      sessionId,
      jobId,
      resumeId,
      contextState,
      createdAt: new Date(),
    });
    await mcpSession.save();

    // Initialize voiceInterviewResults
    await Resume.updateOne(
      { _id: resumeId },
      {
        $push: {
          voiceInterviewResults: {
            sessionId,
            jobId,
            createdAt: new Date(),
            interactions: [],
          },
        },
      },
      { upsert: true }
    );

    // Generate initial interview prompt
    const initialPrompt = await AIInterviewService.generateInitialPrompt(
      job.markdown_description || job.context,
      resume
    );

    const [initialGreeting, firstQuestion] = initialPrompt.split(
      "Let's begin with our first question: "
    );

    return res.status(200).json({
      sessionId,
      jobDetails: { title: job.context, description: job.markdown_description },
      candidateDetails: { name: resume.candidateName, email: resume.email },
      maxQuestions: 8,
      contextState,
      initialGreeting: initialGreeting + "Let's begin with our first question:",
      firstQuestion:
        firstQuestion ||
        "Tell me about yourself and why you're interested in this role.",
    });
  } catch (error) {
    console.error(`Error initializing MCP interview: ${error.message}`);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};

const mcpInterviewResponse = async (req, res) => {
  const { sessionId, userMessage, contextState, questionCount } = req.body;

  if (!sessionId || !userMessage || !contextState) {
    return res
      .status(400)
      .json({
        message: "sessionId, userMessage, and contextState are required",
      });
  }

  try {
    // Verify session
    const session = await MCPSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Get job description for context
    // const JobDescription = mongoose.model("JobDescription")
    const job = await JobDescription.findById(session.jobId);

    // Get last question
    const lastQuestion =
      contextState.questionsAsked[contextState.questionsAsked.length - 1] ||
      "Previous question";

    // Save interaction
    // const Resume = mongoose.model("CV_Summary")
    await Resume.updateOne(
      { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $push: {
          "voiceInterviewResults.$.interactions": {
            question: lastQuestion,
            candidateResponse: userMessage,
            feedback: "",
            timestamp: new Date(),
          },
        },
      }
    );

    // Generate next question
    const isNearingEnd = questionCount >= 7; // maxQuestions - 1
    const responseData = await AIInterviewService.generateNextQuestion(
      userMessage,
      contextState,
      job?.markdown_description || job?.context || "",
      isNearingEnd
    );

    // Update contextState
    const updatedContextState = responseData.updated_context_state;

    // Update session in MongoDB
    await MCPSession.updateOne(
      { sessionId },
      { contextState: updatedContextState }
    );

    // Prepare response
    const response = {
      response: responseData.response,
      feedback: responseData.feedback || "",
      updatedContextState,
      isQuestion: responseData.is_question,
      shouldEndInterview: responseData.should_end_interview || isNearingEnd,
      closingMessage: responseData.should_end_interview
        ? "Thank you for completing the interview. Your responses have been recorded and will be reviewed by our team."
        : "",
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error(`Error processing MCP interview response: ${error.message}`);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};

const submitMCPInterview = async (req, res) => {
  const {
    sessionId,
    jobId,
    resumeId,
    userId,
    email,
    interviewTranscript,
    finalContextState,
  } = req.body;

  if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
    return res
      .status(400)
      .json({ message: "All required fields must be provided" });
  }

  try {
    // Verify session
    const session = await MCPSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Get job description
    // const JobDescription = mongoose.model("JobDescription")
    const job = await JobDescription.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Evaluate interview
    const transcriptText = interviewTranscript
      .map(
        (msg) =>
          `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`
      )
      .join("\n");

    const evaluation = await AIInterviewService.evaluateInterview(
      transcriptText,
      job.markdown_description || job.context,
      finalContextState
    );

    // Update resume with evaluation
    // const Resume = mongoose.model("CV_Summary")
    await Resume.updateOne(
      { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $set: {
          "voiceInterviewResults.$.createdAt": new Date(),
          "voiceInterviewResults.$.score": evaluation.score,
          "voiceInterviewResults.$.recommendation": evaluation.recommendation,
          "voiceInterviewResults.$.evaluation": JSON.stringify(evaluation),
        },
      }
    );

    // Delete session
    await MCPSession.deleteOne({ sessionId });

    // Send email confirmation
    if (email) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Voice Interview Completion",
        text: `Dear Candidate,\n\nThank you for completing your voice interview for the position of ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nBloomix Team`,
      };

      try {
        await transporter.sendMail(mailOptions);
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        // Don't fail the entire request if email fails
      }
    }

    return res
      .status(200)
      .json({ message: "Interview submitted successfully", evaluation });
  } catch (error) {
    console.error(`Error submitting MCP interview: ${error.message}`);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};

const sendVoiceInterviewLink2 = async (req, res) => {
  const {
    email,
    jobId,
    resumeId,
    userId,
    resumeIds,
    link,
    company,
    jobTitle,
    interviewSettings,
  } = req.body;

  try {
    // const JobDescription = mongoose.model("JobDescription")

    if (resumeIds && Array.isArray(resumeIds)) {
      // Batch processing for multiple candidates
      // const Resume = mongoose.model("CV_Summary")
      const candidates = await Resume.find({ _id: { $in: resumeIds } });

      const emailPromises = candidates.map(async (candidate) => {
        const interviewLink = `${
          process.env.FRONTEND_URL
        }/voice-interview?jobId=${jobId}&resumeId=${
          candidate._id
        }&userId=${userId}&email=${encodeURIComponent(candidate.email)}`;

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: candidate.email,
          subject: `Voice Interview Invitation for ${jobTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Voice Interview Invitation</h2>
              <p>Dear ${candidate.candidateName},</p>
              <p>You have been invited to participate in a voice interview for the position of <strong>${jobTitle}</strong> at ${company}.</p>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3>Interview Details:</h3>
                <ul>
                  <li>Duration: Approximately ${
                    interviewSettings?.interviewDuration || 15
                  } minutes</li>
                  <li>Questions: ${
                    interviewSettings?.maxQuestions || 8
                  } questions</li>
                  <li>Style: ${
                    interviewSettings?.interviewStyle || "Professional"
                  }</li>
                </ul>
              </div>
              
              <p><strong>Important:</strong> Please ensure you have:</p>
              <ul>
                <li>A quiet environment</li>
                <li>Working microphone</li>
                <li>Stable internet connection</li>
                <li>Modern browser (Chrome, Firefox, Safari, or Edge)</li>
              </ul>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${interviewLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Start Voice Interview</a>
              </div>
              
              <p>Best regards,<br>${company} Team</p>
            </div>
          `,
        };

        return transporter.sendMail(mailOptions);
      });

      await Promise.all(emailPromises);
      return res
        .status(200)
        .json({
          message: `Interview links sent to ${candidates.length} candidates successfully`,
        });
    } else {
      // Single candidate
      if (!email || !jobId || !resumeId) {
        return res
          .status(400)
          .json({ message: "email, jobId, and resumeId are required" });
      }

      const job = await JobDescription.findById(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      const interviewLink = `${
        process.env.FRONTEND_URL
      }/voice-interview?jobId=${jobId}&resumeId=${resumeId}&userId=${userId}&email=${encodeURIComponent(
        email
      )}`;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Voice Interview Invitation for ${job.context}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Voice Interview Invitation</h2>
            <p>Dear Candidate,</p>
            <p>You have been invited to participate in a voice interview for the position of <strong>${job.context}</strong>.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${interviewLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Start Voice Interview</a>
            </div>
            
            <p>Best regards,<br>Bloomix Team</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      return res
        .status(200)
        .json({ message: "Interview link sent successfully" });
    }
  } catch (error) {
    console.error(`Error sending voice interview link: ${error.message}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const sendVoiceInterviewLink = async (req, res) => {
  const { resumeIds, link, company, jobTitle, interviewSettings } = req.body;

  if (!resumeIds || !link || !company) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  try {
    // Get all resumes
    const resumes = await Resume.find({ _id: { $in: resumeIds } });

    if (resumes.length === 0) {
      return res.status(404).json({ message: "No valid resumes found" });
    }

    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Send emails to each candidate
    const emailPromises = resumes.map(async (resume) => {
      // Create personalized link for each candidate
      const personalizedLink = `${link}&resumeId=${resume._id}`;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: resume.email,
        subject: `Voice AI Interview Invitation: ${jobTitle} at ${company}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">Voice AI Interview Invitation</h2>
            <p>Dear ${resume.candidateName},</p>
            <p>Thank you for your interest in the ${jobTitle} position at ${company}.</p>
            <p>As part of our selection process, we'd like to invite you to participate in a voice-based AI interview. This innovative approach allows you to showcase your skills and experience through a natural conversation with our AI interviewer.</p>
            <p><strong>Interview Details:</strong></p>
            <ul>
              <li><strong>Format:</strong> Voice-based AI Interview</li>
              <li><strong>Duration:</strong> Approximately ${
                interviewSettings?.interviewDuration || 15
              } minutes</li>
              <li><strong>Questions:</strong> ${
                interviewSettings?.maxQuestions || 8
              } questions related to your experience and the role</li>
            </ul>
            <p><strong>Technical Requirements:</strong></p>
            <ul>
              <li>A modern web browser (Chrome, Firefox, Edge, or Safari)</li>
              <li>A working microphone</li>
              <li>A quiet environment with minimal background noise</li>
            </ul>
            <p><strong>Instructions:</strong></p>
            <ol>
              <li>Click the link below to start your interview</li>
              <li>Allow microphone access when prompted</li>
              <li>The AI will speak questions aloud and listen to your verbal responses</li>
              <li>Speak clearly and at a normal pace</li>
              <li>The AI will ask follow-up questions based on your responses</li>
            </ol>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${personalizedLink}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Start Your Voice AI Interview</a>
            </p>
            <p>This link is unique to you and will expire in 7 days. Please complete the interview at your earliest convenience.</p>
            <p>If you have any questions or technical issues, please contact our support team.</p>
            <p>Best regards,</p>
            <p>The Recruitment Team<br>${company}</p>
          </div>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        return { success: true, email: resume.email };
      } catch (error) {
        console.error(`Error sending email to ${resume.email}:`, error);
        return { success: false, email: resume.email, error: error.message };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r) => r.success).length;

    // Update resume status for all candidates
    await Resume.updateMany(
      { _id: { $in: resumeIds } },
      { $set: { candidateStatus: "Voice AI Interview Scheduled" } }
    );

    return res.status(200).json({
      message: `Voice AI Interview links sent to ${successCount} out of ${resumeIds.length} candidates`,
      results,
    });
  } catch (error) {
    console.log("Error ->", error.message);
    return res.status(500).json({ error: error.message });
  }
};

export default {
  initializeMCPInterview,
  mcpInterviewResponse,
  submitMCPInterview,
  sendVoiceInterviewLink,
};

// import { OpenAI } from "@langchain/openai"
// import dotenv from "dotenv"
// import Resume from "../../model/resumeModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import AIInterviewResult from "../../model/aiInterviewResultModel.js"
// import MCPSession from "../../model/mcpSessionModel.js"
// import nodemailer from "nodemailer"
// import Notification from "../../model/NotificationModal.js"
// import { io } from "../../index.js"
// import { v4 as uuidv4 } from "uuid"

// dotenv.config()

// /**
//  * This controller extends the MCP Interview Controller with voice-specific functionality
//  * It uses the same MCP session model and approach, but adds voice-specific context and prompts
//  */

//  const initializeMCPInterview = async (req, res) => {
//   const { jobId, resumeId } = req.query

//   if (!jobId) {
//     return res.status(400).json({ message: "Please provide job ID." })
//   }

//   if (!resumeId) {
//     return res.status(400).json({ message: "Please provide resume ID." })
//   }

//   try {
//     // Get job and resume details
//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ message: "Job not found" })
//     }

//     const resume = await Resume.findById(resumeId)
//     if (!resume) {
//       return res.status(404).json({ message: "Resume not found" })
//     }

//     // Create AI model instance
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0.2,
//     })

//     // Get interview parameters from query string or use defaults
//     const queryParams = req.query
//     const maxQuestions = Number.parseInt(queryParams.maxQuestions) || 8
//     const interviewDuration = Number.parseInt(queryParams.interviewDuration) || 15
//     const interviewStyle = queryParams.interviewStyle || "balanced"
//     const voiceType = queryParams.voiceType || "professional"
//     const focusAreas = queryParams.focusAreas ? queryParams.focusAreas.split(",") : ["technical", "experience"]
//     const customInstructions = queryParams.customInstructions || ""

//     // Generate a unique session ID for this MCP interview
//     const sessionId = uuidv4()

//     // Initialize the MCP context state with voice-specific parameters
//     const initialContextState = {
//       jobDetails: {
//         id: job._id,
//         title: job.context,
//         description: job.markdown_description,
//       },
//       candidateDetails: {
//         id: resume._id,
//         name: resume.candidateName,
//         resume: resume,
//       },
//       interviewParameters: {
//         maxQuestions,
//         interviewDuration,
//         interviewStyle,
//         voiceType,
//         focusAreas,
//         customInstructions,
//       },
//       interviewProgress: {
//         currentQuestionCount: 0,
//         questionsAsked: [],
//         topicsDiscussed: [],
//         candidateStrengths: [],
//         candidateWeaknesses: [],
//         followUpAreas: [],
//       },
//       interviewStrategy: {
//         remainingMustAskTopics: [...focusAreas],
//         adaptationLevel: 0, // 0-10 scale of how much to adapt based on candidate responses
//         currentDepthLevel: 1, // 1-5 scale of how deep to go on current topic
//       },
//       voiceAttributes: {
//         speechPattern:
//           voiceType === "professional"
//             ? "clear, articulate, concise"
//             : voiceType === "friendly"
//               ? "warm, conversational, approachable"
//               : "encouraging, supportive, thoughtful",
//         pacing: "moderate with appropriate pauses",
//         sentenceLength: "short to medium sentences suitable for speech",
//         complexityLevel: "simple vocabulary optimized for speech recognition",
//       },
//     }

//     // Create MCP system prompt optimized for voice interaction
//     const mcpSystemPrompt = `
//       You are an AI interviewer conducting a spoken job interview using the Model Context Protocol (MCP).

//       MCP is a protocol where you maintain a rich context state that evolves throughout the conversation.
//       This allows you to conduct a more natural, adaptive interview that feels like a real human conversation.

//       Job Description: ${job.markdown_description}

//       Candidate Resume: ${JSON.stringify(resume)}

//       Voice Interview Parameters:
//       - Maximum Questions: ${maxQuestions}
//       - Interview Duration: Approximately ${interviewDuration} minutes
//       - Interview Style: ${interviewStyle} (${interviewStyle === "conversational" ? "friendly and relaxed" : interviewStyle === "challenging" ? "probing and rigorous" : "professional but approachable"})
//       - Voice Type: ${voiceType}
//       - Focus Areas: ${focusAreas.join(", ")}
//       ${customInstructions ? `- Custom Instructions: ${customInstructions}` : ""}

//       Voice Communication Guidelines:
//       1. Use ${initialContextState.voiceAttributes.speechPattern} speech patterns
//       2. Keep sentences ${initialContextState.voiceAttributes.sentenceLength}
//       3. Maintain ${initialContextState.voiceAttributes.pacing}
//       4. Use ${initialContextState.voiceAttributes.complexityLevel}
//       5. Make your questions clear and easy to understand when spoken aloud

//       MCP Guidelines:
//       1. Start with a brief, professional greeting introducing yourself as an AI interviewer
//       2. Ask one question at a time, with clear phrasing optimized for speech
//       3. Follow up with relevant questions based on the candidate's previous answers
//       4. Focus on the specified areas while maintaining a natural conversation flow
//       5. Adapt your questions based on the candidate's background and experience
//       6. Avoid asking yes/no questions; prefer open-ended questions that reveal skills and experience
//       7. Keep your responses concise and professional
//       8. Use the context state to track the interview progress and adapt your strategy

//       For your first response, provide:
//       1. A brief greeting introducing yourself
//       2. Your first interview question that's relevant to the job and candidate's background

//       Remember this is a voice interface, so optimize your responses for spoken language rather than written text.
//     `

//     const response = await model.call(mcpSystemPrompt)

//     // Split the response into greeting and first question
//     const parts = response.split(/(?=\?)/)
//     let initialGreeting, firstQuestion

//     if (parts.length >= 2) {
//       // If there's a clear question mark, split there
//       initialGreeting = parts[0].trim()
//       firstQuestion = parts.slice(1).join("").trim()
//     } else {
//       // Otherwise make a best guess at splitting
//       const sentences = response.split(/(?<=\.|!)\s+/)
//       if (sentences.length >= 2) {
//         initialGreeting = sentences[0].trim()
//         firstQuestion = sentences.slice(1).join(" ").trim()
//       } else {
//         // If all else fails, use the whole response as greeting and generate a generic first question
//         initialGreeting = response.trim()
//         firstQuestion = "Could you tell me about your background and experience relevant to this position?"
//       }
//     }

//     // Update the context state with the first question
//     initialContextState.interviewProgress.currentQuestionCount = 1
//     initialContextState.interviewProgress.questionsAsked.push(firstQuestion)

//     // Save the MCP session to the database
//     const mcpSession = new MCPSession({
//       sessionId,
//       jobId,
//       resumeId,
//       contextState: initialContextState,
//       messages: [
//         {
//           role: "system",
//           content: mcpSystemPrompt,
//         },
//         {
//           role: "assistant",
//           content: initialGreeting + " " + firstQuestion,
//         },
//       ],
//       createdAt: new Date(),
//     })

//     await mcpSession.save()

//     // Return the interview initialization data
//     return res.status(200).json({
//       message: "Voice MCP Interview initialized successfully",
//       sessionId,
//       initialGreeting,
//       firstQuestion,
//       jobDetails: {
//         id: job._id,
//         title: job.context,
//       },
//       candidateDetails: {
//         id: resume._id,
//         name: resume.candidateName,
//       },
//       maxQuestions,
//       contextState: initialContextState,
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }

// /**
//  * Process candidate voice response using MCP and generate next question
//  * Optimized to handle speech-to-text input and generate speech-friendly responses
//  */
//  const mcpInterviewResponse = async (req, res) => {
//   const { sessionId, userMessage, contextState, questionCount } = req.body

//   if (!sessionId || !userMessage || !contextState) {
//     return res.status(400).json({ message: "Missing required parameters" })
//   }

//   try {
//     // Retrieve the MCP session
//     const mcpSession = await MCPSession.findOne({ sessionId })
//     if (!mcpSession) {
//       return res.status(404).json({ message: "MCP session not found" })
//     }

//     // Create AI model instance
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0.2,
//     })

//     // Get the current context state
//     const currentContextState = contextState

//     // Determine if this should be the last question
//     const maxQuestions = currentContextState.interviewParameters.maxQuestions || 8
//     const isNearingEnd = questionCount >= maxQuestions - 1

//     // Add the user message to the session history
//     mcpSession.messages.push({
//       role: "user",
//       content: userMessage,
//     })

//     // Create the MCP prompt for the next response, optimized for voice
//     const mcpPrompt = `
//       You are an AI interviewer conducting a spoken job interview using the Model Context Protocol (MCP).

//       Current MCP Context State:
//       ${JSON.stringify(currentContextState, null, 2)}

//       The candidate just responded: "${userMessage}"

//       Voice Communication Instructions:
//       1. Use ${currentContextState.voiceAttributes.speechPattern} speech patterns
//       2. Keep sentences ${currentContextState.voiceAttributes.sentenceLength}
//       3. Maintain ${currentContextState.voiceAttributes.pacing}
//       4. Use ${currentContextState.voiceAttributes.complexityLevel}
//       5. Make your response sound natural when spoken aloud

//       Response Instructions:
//       1. Analyze the candidate's response
//       2. Update the MCP context state based on this response
//       3. Formulate a relevant follow-up question or concluding remark that flows naturally in speech
//       4. Keep your response concise and focused
//       5. Avoid complex sentence structures or language that would be difficult to follow when spoken
//       ${isNearingEnd ? "6. This is nearing the end of the interview. If appropriate, ask a concluding question." : ""}

//       Your response should be in the following JSON format:
//       {
//         "response": "Your next question or remark to the candidate (optimized for speech)",
//         "updatedContextState": {
//           // The full updated context state with your changes
//         },
//         "isQuestion": true/false,
//         "shouldEndInterview": true/false,
//         "reasoning": "Brief explanation of your thought process (not shown to candidate)"
//       }
//     `

//     // Generate AI response
//     const aiResponseRaw = await model.call(mcpPrompt)

//     // Parse the JSON response
//     let aiResponseJson
//     try {
//       // Extract JSON from the response (in case the model includes extra text)
//       const jsonMatch = aiResponseRaw.match(/\{[\s\S]*\}/)
//       const jsonString = jsonMatch ? jsonMatch[0] : aiResponseRaw
//       aiResponseJson = JSON.parse(jsonString)
//     } catch (error) {
//       console.error("Error parsing AI response JSON:", error)
//       return res.status(500).json({ error: "Failed to parse AI response" })
//     }

//     // Extract the components from the parsed JSON
//     const {
//       response,
//       updatedContextState,
//       isQuestion = true,
//       shouldEndInterview = false,
//       reasoning = "",
//     } = aiResponseJson

//     // Add the AI response to the session history
//     mcpSession.messages.push({
//       role: "assistant",
//       content: response,
//     })

//     // Update the session with the new context state
//     mcpSession.contextState = updatedContextState || currentContextState
//     await mcpSession.save()

//     // Determine if this is the final question
//     let closingMessage = null
//     if (shouldEndInterview || questionCount >= maxQuestions - 1) {
//       closingMessage =
//         "Thank you for participating in this interview. Your responses have been recorded and will be reviewed by the hiring team. We'll be in touch soon with next steps."
//     }

//     // Return the AI response
//     return res.status(200).json({
//       response,
//       updatedContextState,
//       isQuestion,
//       shouldEndInterview,
//       closingMessage,
//       reasoning, // This is for debugging and won't be shown to the candidate
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }

// /**
//  * Submit completed voice MCP interview
//  * Uses the final context state for a more comprehensive evaluation
//  */
//  const submitMCPInterview = async (req, res) => {
//   const { sessionId, jobId, resumeId, userId, email, interviewTranscript, finalContextState } = req.body

//   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//     return res.status(400).json({ message: "Missing required parameters" })
//   }

//   try {
//     // Retrieve the MCP session
//     const mcpSession = await MCPSession.findOne({ sessionId })
//     if (!mcpSession) {
//       return res.status(404).json({ message: "MCP session not found" })
//     }

//     // Get job and resume details
//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ message: "Job not found" })
//     }

//     const resume = await Resume.findById(resumeId)
//     if (!resume) {
//       return res.status(404).json({ message: "Resume not found" })
//     }

//     // Create AI model instance for evaluation
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     // Format transcript for evaluation
//     const formattedTranscript = interviewTranscript
//       .map((msg, index) => `${msg.type === "agent" ? "Interviewer" : "Candidate"}: ${msg.content}`)
//       .join("\n\n")

//     // Generate evaluation using MCP context
//     const evaluationPrompt = `
//       You are an expert HR evaluator. Review this voice job interview transcript and the MCP context state to provide:

//       1. An overall score out of 10
//       2. A brief summary of strengths (2-3 bullet points)
//       3. A brief summary of areas for improvement (1-2 bullet points)
//       4. A recommendation (Strongly Recommend / Recommend / Consider / Do Not Recommend)

//       Job Description: ${job.markdown_description}

//       Voice Interview Transcript:
//       ${formattedTranscript}

//       MCP Context State (contains interview progress and insights):
//       ${JSON.stringify(finalContextState, null, 2)}

//       Note: This was a voice interview, so the candidate's responses may contain speech recognition errors or verbal fillers.
//       Focus on the substance of their answers rather than perfect articulation.

//       Format your response exactly as follows:
//       Score: [number out of 10]
//       Strengths:
//       - [strength 1]
//       - [strength 2]
//       - [strength 3 if applicable]
//       Areas for Improvement:
//       - [area 1]
//       - [area 2 if applicable]
//       Recommendation: [Strongly Recommend / Recommend / Consider / Do Not Recommend]
//     `

//     const evaluation = await model.call(evaluationPrompt)

//     // Parse evaluation results
//     const scoreMatch = evaluation.match(/Score:\s*(\d+(?:\.\d+)?)/i)
//     const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : 0

//     const recommendationMatch = evaluation.match(
//       /Recommendation:\s*(Strongly Recommend|Recommend|Consider|Do Not Recommend)/i,
//     )
//     const recommendation = recommendationMatch ? recommendationMatch[1] : "Consider"

//     // Save interview results
//     const aiInterviewResult = new AIInterviewResult({
//       resumeId,
//       jobId,
//       sessionId,
//       transcript: interviewTranscript,
//       contextState: finalContextState,
//       evaluation,
//       score,
//       recommendation,
//       interviewType: "voice", // Mark this as a voice interview
//     })

//     await aiInterviewResult.save()

//     // Update resume status
//     if (resume) {
//       resume.aiInterviewResults = resume.aiInterviewResults || []
//       resume.aiInterviewResults.push({
//         interviewId: aiInterviewResult._id,
//         score,
//         recommendation,
//         interviewType: "voice",
//       })

//       // Update candidate status
//       resume.candidateStatus = "Voice AI Interview Completed"
//       await resume.save()
//     }

//     // Send notification email
//     if (email) {
//       // Configure Nodemailer
//       const transporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//           user: process.env.EMAIL_USER,
//           pass: process.env.EMAIL_PASS,
//         },
//       })

//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: email,
//         subject: `Voice AI Interview Completed: ${resume.candidateName} for ${job.context}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//             <h2 style="text-align: center; color: #4CAF50;">Voice AI Interview Completed</h2>
//             <p>Dear Hiring Manager,</p>
//             <p>A voice-based AI interview using Model Context Protocol has been completed by a candidate for the ${job.context} position. Below are the details:</p>
//             <p><strong>Interview Details:</strong></p>
//             <ul>
//               <li><strong>Job Title:</strong> ${job.context}</li>
//               <li><strong>Candidate Name:</strong> ${resume.candidateName}</li>
//               <li><strong>Overall Score:</strong> ${score}/10</li>
//               <li><strong>Recommendation:</strong> ${recommendation}</li>
//               <li><strong>Interview Type:</strong> Voice AI Interview</li>
//             </ul>
//             <p>Please review the full interview transcript and evaluation in the system.</p>
//             <p>Best regards,</p>
//             <p>The Team</p>
//           </div>
//         `,
//       }

//       try {
//         await transporter.sendMail(mailOptions)
//         console.log("Notification email sent successfully!")
//       } catch (error) {
//         console.error("Error sending email:", error)
//       }
//     }

//     // Create notification
//     if (userId) {
//       const newNotification = new Notification({
//         message: `${resume?.candidateName} Voice AI Interview Completed`,
//         recipientId: userId,
//         resumeId: resumeId,
//       })

//       await newNotification.save()

//       // Emit the new notification event
//       io.emit("newNotification", newNotification)
//     }

//     // Mark the MCP session as completed
//     mcpSession.isCompleted = true
//     mcpSession.completedAt = new Date()
//     await mcpSession.save()

//     return res.status(200).json({
//       message: "Voice AI Interview submitted and evaluated successfully!",
//       score,
//       recommendation,
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }

// /**
//  * Send voice AI interview links to candidates
//  */
//  const sendVoiceInterviewLink = async (req, res) => {
//   const { resumeIds, link, company, jobTitle, interviewSettings } = req.body

//   if (!resumeIds || !link || !company) {
//     return res.status(400).json({ message: "Missing required parameters" })
//   }

//   try {
//     // Get all resumes
//     const resumes = await Resume.find({ _id: { $in: resumeIds } })

//     if (resumes.length === 0) {
//       return res.status(404).json({ message: "No valid resumes found" })
//     }

//     // Configure Nodemailer
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     })

//     // Send emails to each candidate
//     const emailPromises = resumes.map(async (resume) => {
//       // Create personalized link for each candidate
//       const personalizedLink = `${link}&resumeId=${resume._id}`

//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: resume.email,
//         subject: `Voice AI Interview Invitation: ${jobTitle} at ${company}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//             <h2 style="text-align: center; color: #4CAF50;">Voice AI Interview Invitation</h2>
//             <p>Dear ${resume.candidateName},</p>
//             <p>Thank you for your interest in the ${jobTitle} position at ${company}.</p>
//             <p>As part of our selection process, we'd like to invite you to participate in a voice-based AI interview. This innovative approach allows you to showcase your skills and experience through a natural conversation with our AI interviewer.</p>
//             <p><strong>Interview Details:</strong></p>
//             <ul>
//               <li><strong>Format:</strong> Voice-based AI Interview</li>
//               <li><strong>Duration:</strong> Approximately ${interviewSettings?.interviewDuration || 15} minutes</li>
//               <li><strong>Questions:</strong> ${interviewSettings?.maxQuestions || 8} questions related to your experience and the role</li>
//             </ul>
//             <p><strong>Technical Requirements:</strong></p>
//             <ul>
//               <li>A modern web browser (Chrome, Firefox, Edge, or Safari)</li>
//               <li>A working microphone</li>
//               <li>A quiet environment with minimal background noise</li>
//             </ul>
//             <p><strong>Instructions:</strong></p>
//             <ol>
//               <li>Click the link below to start your interview</li>
//               <li>Allow microphone access when prompted</li>
//               <li>The AI will speak questions aloud and listen to your verbal responses</li>
//               <li>Speak clearly and at a normal pace</li>
//               <li>The AI will ask follow-up questions based on your responses</li>
//             </ol>
//             <p style="text-align: center; margin: 30px 0;">
//               <a href="${personalizedLink}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Start Your Voice AI Interview</a>
//             </p>
//             <p>This link is unique to you and will expire in 7 days. Please complete the interview at your earliest convenience.</p>
//             <p>If you have any questions or technical issues, please contact our support team.</p>
//             <p>Best regards,</p>
//             <p>The Recruitment Team<br>${company}</p>
//           </div>
//         `,
//       }

//       try {
//         await transporter.sendMail(mailOptions)
//         return { success: true, email: resume.email }
//       } catch (error) {
//         console.error(`Error sending email to ${resume.email}:`, error)
//         return { success: false, email: resume.email, error: error.message }
//       }
//     })

//     const results = await Promise.all(emailPromises)
//     const successCount = results.filter((r) => r.success).length

//     // Update resume status for all candidates
//     await Resume.updateMany({ _id: { $in: resumeIds } }, { $set: { candidateStatus: "Voice AI Interview Scheduled" } })

//     return res.status(200).json({
//       message: `Voice AI Interview links sent to ${successCount} out of ${resumeIds.length} candidates`,
//       results,
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }

// const voiceInterviewController = {
//     sendVoiceInterviewLink,
//     submitMCPInterview,
//     mcpInterviewResponse,
//     initializeMCPInterview
// }

// export default voiceInterviewController;
