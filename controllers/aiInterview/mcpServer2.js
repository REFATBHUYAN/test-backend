// #!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { OpenAI } from "openai";
import Resume from "../../model/resumeModel.js";
import MCPSession from "../../model/mcpSessionModel.js";
import JobDescription from "../../model/JobDescriptionModel.js";
import connectDB from "../../db/index.js";
import Notification from '../../model/NotificationModal.js';
import { io } from '../../index.js';

// Environment configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Initialize services
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// AI Interview Service
class FastAIInterviewService {
  static async generateInitialPrompt(
    jobDescription,
    resumeData,
    interviewSettings = {}
  ) {
    const focusAreasText =
      interviewSettings.focusAreas?.length > 0
        ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
        : "";
    const styleText = interviewSettings.interviewStyle
      ? `Use a ${interviewSettings.interviewStyle} interview style. `
      : "";

    const prompt = `You are an AI interviewer conducting a ${
      interviewSettings.interviewDuration || 15
    }-minute voice interview.
${styleText}${focusAreasText}
Create a warm, professional greeting with the first question for ${
      resumeData.candidateName
    }.
Job: ${jobDescription}
Keep it concise and natural.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      });
      return response.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI API error:", error);
      return `Hello ${resumeData.candidateName}, welcome to your ${
        interviewSettings.interviewDuration || 15
      }-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`;
    }
  }

  static async generateNextQuestion(
    userResponse,
    contextState,
    jobDescription,
    questionCount,
    maxQuestions,
    interviewSettings = {}
  ) {
    const questionsAsked = contextState.questionsAsked || [];
    const currentIndex = contextState.currentQuestionIndex || 0;

    // Check if this is the last question
    const isLastQuestion = questionCount >= maxQuestions;

    const focusAreasText =
      interviewSettings.focusAreas?.length > 0
        ? `Focus areas: ${interviewSettings.focusAreas.join(", ")}. `
        : "";
    const styleText = interviewSettings.interviewStyle
      ? `Interview style: ${interviewSettings.interviewStyle}. `
      : "";

    const prompt = `
AI Interviewer. Generate the next question or conclusion based on the candidate's response: "${userResponse}"
Previous questions: ${questionsAsked.slice(-2).join(", ")}
Job description: ${jobDescription}
${focusAreasText}${styleText}
Question ${questionCount} of ${maxQuestions}
${
  isLastQuestion
    ? "This should be the final question or conclusion. If this is question " +
      maxQuestions +
      ", ask a final meaningful question. If this is beyond " +
      maxQuestions +
      ", provide a conclusion."
    : "Ask a relevant question focusing on the specified areas."
}

Return a JSON object:
{
  "response": "question or conclusion text",
  "feedback": "brief positive feedback",
  "is_question": ${!isLastQuestion || questionCount === maxQuestions},
  "should_end_interview": ${questionCount > maxQuestions}
}
    `.trim();

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI API timeout")), 6000)
      );

      const apiPromise = openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
      });

      const response = await Promise.race([apiPromise, timeoutPromise]);

      let result;
      try {
        result = JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        console.error("Error parsing OpenAI response:", parseError);
        throw new Error("Invalid JSON in OpenAI response");
      }

      if (
        !result.response ||
        typeof result.is_question !== "boolean" ||
        typeof result.should_end_interview !== "boolean"
      ) {
        throw new Error("Invalid response structure from OpenAI");
      }

      return {
        response: result.response,
        feedback: result.feedback || "Thank you for your response.",
        is_question: result.is_question,
        should_end_interview: result.should_end_interview,
        updated_context_state: {
          ...contextState,
          questionsAsked: [...questionsAsked, result.response],
          currentQuestionIndex: result.is_question
            ? currentIndex + 1
            : currentIndex,
          interviewSettings:
            contextState.interviewSettings || interviewSettings,
        },
      };
    } catch (error) {
      console.error("Error in generateNextQuestion:", error.message);

      // Fallback logic
      const shouldEnd = questionCount > maxQuestions;
      const isQuestion = questionCount <= maxQuestions;

      return {
        response: shouldEnd
          ? "Thank you for your responses. This concludes our interview."
          : questionCount === maxQuestions
          ? "As our final question, can you tell me why you believe you would be a great fit for this role?"
          : "Can you share an example of how you've applied your skills to solve a problem in this field?",
        feedback: "Thank you for sharing.",
        is_question: isQuestion,
        should_end_interview: shouldEnd,
        updated_context_state: {
          ...contextState,
          questionsAsked: [
            ...questionsAsked,
            shouldEnd
              ? "Interview concluded"
              : questionCount === maxQuestions
              ? "Final question asked"
              : "Follow-up question",
          ],
          currentQuestionIndex: shouldEnd ? currentIndex : currentIndex + 1,
          interviewSettings:
            contextState.interviewSettings || interviewSettings,
        },
      };
    }
  }

  static async evaluateInterview(transcript, jobDescription, contextState) {
    const prompt = `Evaluate interview transcript. Provide concise assessment.
Job: ${jobDescription}
Transcript: ${transcript}
JSON response:
{
  "score": [1-10],
  "strengths": ["strength1", "strength2", "strength3"],
  "areas_for_improvement": ["area1", "area2"],
  "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
  "summary": "Brief assessment"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.3,
        max_tokens: 400,
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

// MCP Server Implementation
const server = new Server(
  {
    name: "ai-interview-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "initialize_interview",
        description: "Initialize a new AI interview session",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string", description: "Job description ID" },
            resumeId: { type: "string", description: "Resume ID" },
            interviewSettings: {
              type: "object",
              description: "Interview settings",
            },
          },
          required: ["jobId", "resumeId", "interviewSettings"],
        },
      },
      {
        name: "process_response",
        description: "Process candidate response and generate next question",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Interview session ID" },
            userMessage: {
              type: "string",
              description: "Candidate's response",
            },
            contextState: {
              type: "object",
              description: "Current interview context",
            },
            questionCount: {
              type: "number",
              description: "Current question count",
            },
          },
          required: [
            "sessionId",
            "userMessage",
            "contextState",
            "questionCount",
          ],
        },
      },
      {
        name: "submit_interview",
        description: "Submit completed interview for evaluation",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "Interview session ID" },
            jobId: { type: "string", description: "Job ID" },
            resumeId: { type: "string", description: "Resume ID" },
            userId: { type: "string", description: "User ID" },
            email: { type: "string", description: "Candidate email" },
            interviewTranscript: {
              type: "array",
              description: "Complete interview transcript",
            },
            finalContextState: {
              type: "object",
              description: "Final interview context",
            },
          },
          required: ["sessionId", "jobId", "resumeId", "interviewTranscript"],
        },
      },
      // {
      //   name: "send_interview_link",
      //   description: "Send interview link via email",
      //   inputSchema: {
      //     type: "object",
      //     properties: {
      //       email: { type: "string", description: "Candidate email" },
      //       jobId: { type: "string", description: "Job ID" },
      //       resumeId: { type: "string", description: "Resume ID" },
      //       userId: { type: "string", description: "User ID" },
      //       resumeIds: {
      //         type: "array",
      //         description: "Multiple resume IDs for batch sending",
      //       },
      //       company: { type: "string", description: "Company name" },
      //       jobTitle: { type: "string", description: "Job title" },
      //       interviewSettings: {
      //         type: "object",
      //         description: "Interview configuration",
      //       },
      //     },
      //   },
      // },
    ],
  };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log(`Handling tool request: ${name}`, JSON.stringify(args, null, 2));
  try {
    switch (name) {
      case "initialize_interview":
        return await handleInitializeInterview(args);
      case "process_response":
        return await handleProcessResponse(args);
      case "submit_interview":
        return await handleSubmitInterview(args);
      // case "send_interview_link":
      //   return await handleSendInterviewLink(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Error in ${name}:`, error);
    throw new McpError(ErrorCode.InternalError, error.message);
  }
});

// Handler functions
export async function handleInitializeInterview({
  jobId,
  resumeId,
  interviewSettings = {},
}) {
  if (!jobId || !resumeId || !interviewSettings) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "jobId, resumeId, and interviewSettings are required"
    );
  }

  const job = await JobDescription.findById(jobId);
  const resume = await Resume.findById(resumeId);
  if (!job || !resume) {
    throw new McpError(ErrorCode.InvalidParams, "Job or resume not found");
  }

  const sessionId = randomUUID();
  const contextState = {
    questionsAsked: [],
    currentQuestionIndex: 0,
    startTime: new Date().toISOString(),
    interviewSettings,
  };

  const mcpSession = new MCPSession({
    sessionId,
    jobId,
    resumeId,
    contextState,
  });
  await mcpSession.save();

  await Resume.updateOne(
    { _id: resumeId },
    {
      $push: {
        voiceInterviewResults: {
          sessionId,
          jobId,
          createdAt: new Date(),
          interactions: [],
          interviewSettings,
        },
      },
    },
    { upsert: true }
  );

  const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
    job.markdown_description || job.context,
    resume,
    interviewSettings
  );

  const response = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sessionId,
          jobDetails: {
            title: job.context,
            description: job.markdown_description,
          },
          candidateDetails: { name: resume.candidateName, email: resume.email },
          maxQuestions: interviewSettings.maxQuestions || 5,
          contextState,
          initialPrompt,
          success: true,
        }),
      },
    ],
  };

  console.log(
    "Sending initialize response:",
    JSON.stringify(response, null, 2)
  );
  return response;
}

export async function handleProcessResponse({
  sessionId,
  userMessage,
  contextState,
  questionCount,
}) {
  if (!sessionId || !userMessage || !contextState) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "sessionId, userMessage, and contextState are required"
    );
  }

  console.log("Received /api/process params:", {
    sessionId,
    userMessage,
    questionCount,
  });

  const session = await MCPSession.findOne({ sessionId });
  if (!session) {
    throw new McpError(ErrorCode.NotFound, "Session not found");
  }

  const job = await JobDescription.findById(session.jobId);
  if (!job) {
    throw new McpError(ErrorCode.NotFound, "Job not found");
  }

  const resumeId = session.resumeId;
  const maxQuestions = contextState.interviewSettings?.maxQuestions || 5;

  const responseData = await FastAIInterviewService.generateNextQuestion(
    userMessage,
    contextState,
    job.markdown_description || job.context || "",
    questionCount,
    maxQuestions,
    contextState.interviewSettings || {}
  );

  const {
    response,
    feedback,
    is_question,
    should_end_interview,
    updated_context_state,
  } = responseData;

  await MCPSession.updateOne(
    { sessionId },
    { $set: { contextState: updated_context_state } }
  );

  // Log interaction before saving
  const interaction = {
    question: response,
    candidateResponse: userMessage,
    feedback,
    timestamp: new Date(),
  };
  console.log("Saving interaction:", JSON.stringify(interaction, null, 2));

  try {
    const updateResult = await Resume.updateOne(
      { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $push: {
          "voiceInterviewResults.$.interactions": interaction,
        },
      },
      { runValidators: true }
    );
    console.log("Resume update result:", JSON.stringify(updateResult, null, 2));
    if (updateResult.matchedCount === 0) {
      console.error("No matching Resume document found for update");
      throw new McpError(ErrorCode.NotFound, "Resume or session not found");
    }
    if (updateResult.modifiedCount === 0) {
      console.warn("Resume document matched but not modified");
    }
  } catch (error) {
    console.error("Error updating Resume interactions:", error.message);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to save interaction: ${error.message}`
    );
  }

  const responsePayload = {
    response,
    feedback,
    is_question,
    should_end_interview,
    updated_context_state,
    success: true,
  };

  console.log(
    "Returning /api/process response:",
    JSON.stringify(responsePayload, null, 2)
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(responsePayload),
      },
    ],
  };
}

export async function handleSubmitInterview({
  sessionId,
  jobId,
  resumeId,
  userId,
  email,
  interviewTranscript,
  finalContextState,
}) {
  if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "All required fields must be provided"
    );
  }

  const session = await MCPSession.findOne({ sessionId });
  if (!session) {
    throw new McpError(ErrorCode.NotFound, "Session not found");
  }

  const job = await JobDescription.findById(jobId);
  if (!job) {
    throw new McpError(ErrorCode.NotFound, "Job not found");
  }

  const transcriptText = interviewTranscript
    .map(
      (msg) =>
        `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`
    )
    .join("\n");

  const evaluation = await FastAIInterviewService.evaluateInterview(
    transcriptText,
    job.markdown_description || job.context,
    finalContextState
  );

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

  await MCPSession.deleteOne({ sessionId });

  if (email && EMAIL_USER && EMAIL_PASS) {
    try {
      const mailOptions = {
        from: EMAIL_USER,
        to: email,
        subject: "Voice Interview Completion",
        text: `Dear Candidate,\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
      };
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
    }
  }

  const resume = await Resume.findById(resumeId);

  // Create and emit notification
  const newNotification = new Notification({
    message: `${
      resume?.candidateName
    } AI Agent Interviewed`,
    recipientId: userId,
    resumeId,
  });
  await newNotification.save();
  io.emit("newNotification", newNotification);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          message: "Interview submitted successfully",
          evaluation,
          success: true,
        }),
      },
    ],
  };
}

// export async function handleSendInterviewLink({
//   email,
//   jobId,
//   resumeId,
//   userId,
//   resumeIds,
//   company,
//   jobTitle,
//   interviewSettings,
// }) {
//   try {
//     if (resumeIds && Array.isArray(resumeIds)) {
//       const candidates = await Resume.find({ _id: { $in: resumeIds } });
//       const emailPromises = candidates.map(async (candidate) => {
//         const interviewLink = `${FRONTEND_URL}/voice-interview?jobId=${jobId}&resumeId=${
//           candidate._id
//         }&userId=${userId}&email=${encodeURIComponent(
//           candidate.email
//         )}&maxQuestions=${
//           interviewSettings?.maxQuestions || 5
//         }&interviewDuration=${
//           interviewSettings?.interviewDuration || 15
//         }&interviewStyle=${
//           interviewSettings?.interviewStyle || "balanced"
//         }&voiceType=${
//           interviewSettings?.voiceType || "professional"
//         }&focusAreas=${encodeURIComponent(
//           interviewSettings?.focusAreas?.join(",") || ""
//         )}`;

//         const mailOptions = {
//           from: EMAIL_USER,
//           to: candidate.email,
//           subject: `Voice Interview Invitation for ${jobTitle}`,
//           html: `
//             <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//               <h2>Voice Interview Invitation</h2>
//               <p>Dear ${candidate.candidateName},</p>
//               <p>You have been invited to participate in a voice interview for <strong>${jobTitle}</strong> at ${company}.</p>
//               <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                 <h3>Interview Details:</h3>
//                 <ul>
//                   <li>Duration: ${
//                     interviewSettings?.interviewDuration || 15
//                   } minutes</li>
//                   <li>Questions: ${
//                     interviewSettings?.maxQuestions || 5
//                   } questions</li>
//                   <li>Style: ${
//                     interviewSettings?.interviewStyle || "Professional"
//                   }</li>
//                 </ul>
//               </div>
//               <div style="text-align: center; margin: 30px 0;">
//                 <a href="${interviewLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Start Voice Interview</a>
//               </div>
//               <p>Best regards,<br>${company} Team</p>
//             </div>
//           `,
//         };
//         return transporter.sendMail(mailOptions);
//       });

//       await Promise.all(emailPromises);

//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify({
//               message: `Interview links sent to ${candidates.length} candidates successfully`,
//               success: true,
//             }),
//           },
//         ],
//       };
//     } else {
//       if (!email || !jobId || !resumeId) {
//         throw new McpError(
//           ErrorCode.InvalidParams,
//           "email, jobId, and resumeId are required"
//         );
//       }

//       const job = await JobDescription.findById(jobId);
//       if (!job) {
//         throw new McpError(ErrorCode.InvalidParams, "Job not found");
//       }

//       const interviewLink = `${FRONTEND_URL}/voice-interview?jobId=${jobId}&resumeId=${resumeId}&userId=${userId}&email=${encodeURIComponent(
//         email
//       )}&maxQuestions=${
//         interviewSettings?.maxQuestions || 5
//       }&interviewDuration=${
//         interviewSettings?.interviewDuration || 15
//       }&interviewStyle=${
//         interviewSettings?.interviewStyle || "balanced"
//       }&voiceType=${
//         interviewSettings?.voiceType || "professional"
//       }&focusAreas=${encodeURIComponent(
//         interviewSettings?.focusAreas?.join(",") || ""
//       )}`;

//       const mailOptions = {
//         from: EMAIL_USER,
//         to: email,
//         subject: `Voice Interview Invitation for ${job.context}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//             <h2>Voice Interview Invitation</h2>
//             <p>Dear Candidate,</p>
//             <p>You have been invited to participate in a voice interview for <strong>${job.context}</strong>.</p>
//             <div style="text-align: center; margin: 30px 0;">
//               <a href="${interviewLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Start Voice Interview</a>
//             </div>
//             <p>Best regards,<br>AI Interview Team</p>
//           </div>
//         `,
//       };

//       await transporter.sendMail(mailOptions);

//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify({
//               message: "Interview link sent successfully",
//               success: true,
//             }),
//           },
//         ],
//       };
//     }
//   } catch (error) {
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// Start server
async function main() {
  await connectDB();

  // Override stdout to suppress non-JSON logs but allow JSON-RPC responses
  const originalStdoutWrite = process.stdout.write;
  process.stdout.write = (data, encoding, callback) => {
    const strData = data.toString();
    try {
      const parsed = JSON.parse(strData);
      if (parsed.jsonrpc === "2.0" || parsed.result || parsed.error) {
        // Valid JSON-RPC response, allow it
        return originalStdoutWrite.call(
          process.stdout,
          data,
          encoding,
          callback
        );
      }
    } catch (e) {
      // Non-JSON or invalid JSON, suppress to stderr
      console.error("Suppressed non-JSON stdout:", strData);
      return true;
    }
    // Non-JSON-RPC JSON, suppress to stderr
    console.error("Suppressed non-JSON stdout:", strData);
    return true;
  };

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Interview MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

// // #!/usr/bin/env node
// import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import {
//   CallToolRequestSchema,
//   ListToolsRequestSchema,
//   McpError,
//   ErrorCode,
// } from "@modelcontextprotocol/sdk/types.js";
// // import { Server } from "@modelcontextprotocol/server/index.js";
// // import { StdioServerTransport } from "@modelcontextprotocol/server-sdk/server/stdio.js";
// // import {
// //   CallToolRequestSchema,
// //   ListToolsRequestSchema,
// //   McpError,
// //   ErrorCode,
// // } from "@modelcontextprotocol/server-sdk/types.js";
// import mongoose from "mongoose";
// import { randomUUID } from "node:crypto";
// import nodemailer from "nodemailer";
// import { OpenAI } from "openai";
// import Resume from "../../model/resumeModel.js";
// import MCPSession from "../../model/mcpSessionModel.js";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import connectDB from "../../db/index.js";

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const EMAIL_USER = process.env.EMAIL_USER;
// const EMAIL_PASS = process.env.EMAIL_PASS;
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// // Initialize services
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: EMAIL_USER,
//     pass: EMAIL_PASS,
//   },
// });

// // AI Interview Service
// class FastAIInterviewService {
//   static async generateInitialPrompt(jobDescription, resumeData, interviewSettings = {}) {
//     const focusAreasText = interviewSettings.focusAreas?.length > 0
//       ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
//       : "";
//     const styleText = interviewSettings.interviewStyle
//       ? `Use a ${interviewSettings.interviewStyle} interview style. `
//       : "";

//     const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute voice interview.
// ${styleText}${focusAreasText}
// Create a warm, professional greeting with the first question for ${resumeData.candidateName}.
// Job: ${jobDescription}
// Keep it concise and natural.`;

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.7,
//         max_tokens: 150,
//       });
//       return response.choices[0].message.content;
//     } catch (error) {
//       console.error("OpenAI API error:", error);
//       return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`;
//     }
//   }

//   static async generateNextQuestion(
//     userResponse,
//     contextState,
//     jobDescription,
//     isNearingEnd,
//     interviewSettings = {}
//   ) {
//     const questionsAsked = contextState.questionsAsked || [];
//     const currentIndex = contextState.currentQuestionIndex || 0;
//     const maxQuestions = contextState.interviewSettings?.maxQuestions || interviewSettings.maxQuestions || 8;

//     const focusAreasText = interviewSettings.focusAreas?.length > 0
//       ? `Focus areas: ${interviewSettings.focusAreas.join(", ")}. `
//       : "";
//     const styleText = interviewSettings.interviewStyle
//       ? `Interview style: ${interviewSettings.interviewStyle}. `
//       : "";

//     const prompt = `
// AI Interviewer. Generate the next question or conclusion based on the candidate's response: "${userResponse}"
// Previous questions: ${questionsAsked.slice(-2).join(", ")}
// Job description: ${jobDescription}
// ${focusAreasText}${styleText}
// Question ${currentIndex + 1} of ${maxQuestions}
// ${isNearingEnd ? "This is the final question or conclusion." : "Ask a relevant question focusing on the specified areas."}

// Return a JSON object:
// {
//   "response": "question or conclusion text",
//   "feedback": "brief positive feedback",
//   "is_question": true,
//   "should_end_interview": false
// }
//     `.trim();

//     try {
//       const timeoutPromise = new Promise((_, reject) =>
//         setTimeout(() => reject(new Error("OpenAI API timeout")), 6000)
//       );

//       const apiPromise = openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.7,
//         max_tokens: 200,
//       });

//       const response = await Promise.race([apiPromise, timeoutPromise]);

//       let result;
//       try {
//         result = JSON.parse(response.choices[0].message.content);
//       } catch (parseError) {
//         console.error("Error parsing OpenAI response:", parseError);
//         throw new Error("Invalid JSON in OpenAI response");
//       }

//       if (!result.response || typeof result.is_question !== "boolean" || typeof result.should_end_interview !== "boolean") {
//         throw new Error("Invalid response structure from OpenAI");
//       }

//       return {
//         response: result.response,
//         feedback: result.feedback || "Thank you for your response.",
//         is_question: result.is_question,
//         should_end_interview: result.should_end_interview,
//         updated_context_state: {
//           ...contextState,
//           questionsAsked: [...questionsAsked, result.response],
//           currentQuestionIndex: result.is_question ? currentIndex + 1 : currentIndex,
//           interviewSettings: contextState.interviewSettings || interviewSettings,
//         },
//       };
//     } catch (error) {
//       console.error("Error in generateNextQuestion:", error.message);
//       return {
//         response: isNearingEnd
//           ? "Thank you for your responses. This concludes our interview."
//           : "Can you share an example of how you’ve applied your skills to solve a problem in this field?",
//         feedback: "Thank you for sharing.",
//         is_question: !isNearingEnd,
//         should_end_interview: isNearingEnd,
//         updated_context_state: {
//           ...contextState,
//           questionsAsked: [
//             ...questionsAsked,
//             isNearingEnd ? "Interview concluded" : "Can you share an example of how you’ve applied your skills to solve a problem in this field?",
//           ],
//           currentQuestionIndex: isNearingEnd ? currentIndex : currentIndex + 1,
//           interviewSettings: contextState.interviewSettings || interviewSettings,
//         },
//       };
//     }
//   }

//   static async evaluateInterview(transcript, jobDescription, contextState) {
//     const prompt = `Evaluate interview transcript. Provide concise assessment.
// Job: ${jobDescription}
// Transcript: ${transcript}
// JSON response:
// {
//   "score": [1-10],
//   "strengths": ["strength1", "strength2", "strength3"],
//   "areas_for_improvement": ["area1", "area2"],
//   "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
//   "summary": "Brief assessment"
// }`;

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.3,
//         max_tokens: 400,
//       });
//       return JSON.parse(response.choices[0].message.content);
//     } catch (error) {
//       console.error("Error evaluating interview:", error);
//       return {
//         score: 7,
//         strengths: ["Good communication", "Relevant experience", "Professional demeanor"],
//         areas_for_improvement: ["Could provide more specific examples"],
//         recommendation: "Consider",
//         summary: "Candidate showed good potential with room for growth.",
//       };
//     }
//   }
// }

// // MCP Server Implementation
// const server = new Server(
//   {
//     name: "ai-interview-server",
//     version: "1.0.0",
//   },
//   {
//     capabilities: {
//       tools: {},
//     },
//   }
// );

// // Tool definitions
// server.setRequestHandler(ListToolsRequestSchema, async () => {
//   return {
//     tools: [
//       {
//         name: "initialize_interview",
//         description: "Initialize a new AI interview session",
//         inputSchema: {
//           type: "object",
//           properties: {
//             jobId: { type: "string", description: "Job description ID" },
//             resumeId: { type: "string", description: "Resume ID" },
//             interviewSettings: { type: "object", description: "Interview settings" },
//           },
//           required: ["jobId", "resumeId", "interviewSettings"],
//         },
//       },
//       {
//         name: "process_response",
//         description: "Process candidate response and generate next question",
//         inputSchema: {
//           type: "object",
//           properties: {
//             sessionId: { type: "string", description: "Interview session ID" },
//             userMessage: { type: "string", description: "Candidate's response" },
//             contextState: { type: "object", description: "Current interview context" },
//             questionCount: { type: "number", description: "Current question count" },
//           },
//           required: ["sessionId", "userMessage", "contextState", "questionCount"],
//         },
//       },
//       {
//         name: "submit_interview",
//         description: "Submit completed interview for evaluation",
//         inputSchema: {
//           type: "object",
//           properties: {
//             sessionId: { type: "string", description: "Interview session ID" },
//             jobId: { type: "string", description: "Job ID" },
//             resumeId: { type: "string", description: "Resume ID" },
//             userId: { type: "string", description: "User ID" },
//             email: { type: "string", description: "Candidate email" },
//             interviewTranscript: { type: "array", description: "Complete interview transcript" },
//             finalContextState: { type: "object", description: "Final interview context" },
//           },
//           required: ["sessionId", "jobId", "resumeId", "interviewTranscript"],
//         },
//       },
//       {
//         name: "send_interview_link",
//         description: "Send interview link via email",
//         inputSchema: {
//           type: "object",
//           properties: {
//             email: { type: "string", description: "Candidate email" },
//             jobId: { type: "string", description: "Job ID" },
//             resumeId: { type: "string", description: "Resume ID" },
//             userId: { type: "string", description: "User ID" },
//             resumeIds: { type: "array", description: "Multiple resume IDs for batch sending" },
//             company: { type: "string", description: "Company name" },
//             jobTitle: { type: "string", description: "Job title" },
//             interviewSettings: { type: "object", description: "Interview configuration" },
//           },
//         },
//       },
//     ],
//   };
// });

// // Tool handlers
// server.setRequestHandler(CallToolRequestSchema, async (request) => {
//   const { name, arguments: args } = request.params;
//   console.log(`Handling tool request: ${name}`, JSON.stringify(args, null, 2));
//   try {
//     switch (name) {
//       case "initialize_interview":
//         return await handleInitializeInterview(args);
//       case "process_response":
//         return await handleProcessResponse(args);
//       case "submit_interview":
//         return await handleSubmitInterview(args);
//       case "send_interview_link":
//         return await handleSendInterviewLink(args);
//       default:
//         throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
//     }
//   } catch (error) {
//     console.error(`Error in ${name}:`, error);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// });

// // Handler functions
// export async function handleInitializeInterview({ jobId, resumeId, interviewSettings = {} }) {
//   if (!jobId || !resumeId || !interviewSettings) {
//     throw new McpError(ErrorCode.InvalidParams, "jobId, resumeId, and interviewSettings are required");
//   }

//   const job = await JobDescription.findById(jobId);
//   const resume = await Resume.findById(resumeId);
//   if (!job || !resume) {
//     throw new McpError(ErrorCode.InvalidParams, "Job or resume not found");
//   }

//   const sessionId = randomUUID();
//   const contextState = {
//     questionsAsked: [],
//     currentQuestionIndex: 0,
//     startTime: new Date().toISOString(),
//     interviewSettings,
//   };

//   const mcpSession = new MCPSession({
//     sessionId,
//     jobId,
//     resumeId,
//     contextState,
//   });
//   await mcpSession.save();

//   await Resume.updateOne(
//     { _id: resumeId },
//     {
//       $push: {
//         voiceInterviewResults: {
//           sessionId,
//           jobId,
//           createdAt: new Date(),
//           interactions: [],
//           interviewSettings,
//         },
//       },
//     },
//     { upsert: true }
//   );

//   const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
//     job.markdown_description || job.context,
//     resume,
//     interviewSettings
//   );

//   const response = {
//     content: [
//       {
//         type: "text",
//         text: JSON.stringify({
//           sessionId,
//           jobDetails: { title: job.context, description: job.markdown_description },
//           candidateDetails: { name: resume.candidateName, email: resume.email },
//           maxQuestions: interviewSettings.maxQuestions || 8,
//           contextState,
//           initialPrompt,
//           success: true,
//         }),
//       },
//     ],
//   };

//   console.log("Sending initialize response:", JSON.stringify(response, null, 2));
//   return response;
// }

// export async function handleProcessResponse2({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required");
//   }

//   console.log("Received /api/process params:", { sessionId, userMessage, questionCount });

//   const session = await MCPSession.findOne({ sessionId });
//   if (!session) {
//     throw new McpError(ErrorCode.NotFound, "Session not found");
//   }

//   const job = await JobDescription.findById(session.jobId);
//   if (!job) {
//     throw new McpError(ErrorCode.NotFound, "Job not found");
//   }

//   const resumeId = session.resumeId;
//   const maxQuestions = contextState.interviewSettings?.maxQuestions || 8;
//   const isNearingEnd = questionCount >= maxQuestions - 1;

//   const responseData = await FastAIInterviewService.generateNextQuestion(
//     userMessage,
//     contextState,
//     job?.markdown_description || job?.context || "",
//     isNearingEnd,
//     contextState.interviewSettings || {}
//   );

//   const { response, feedback, is_question, should_end_interview, updated_context_state } = responseData;

//   await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } });

//   await Resume.updateOne(
//     { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//     {
//       $push: {
//         "voiceInterviewResults.$.interactions": {
//           user: userMessage,
//           ai: response,
//           feedback: feedback,
//           createdAt: new Date(),
//         },
//       },
//     }
//   );

//   const responsePayload = {
//     response,
//     feedback,
//     is_question,
//     should_end_interview,
//     updated_context_state,
//     success: true,
//   };

//   console.log("Returning /api/process response:", JSON.stringify(responsePayload, null, 2));

//   return {
//     content: [
//       {
//         type: "text",
//         text: JSON.stringify(responsePayload),
//       },
//     ],
//   };
// }
// export async function handleProcessResponse({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required");
//   }

//   console.log("Received /api/process params:", { sessionId, userMessage, questionCount });

//   const session = await MCPSession.findOne({ sessionId });
//   if (!session) {
//     throw new McpError(ErrorCode.NotFound, "Session not found");
//   }

//   const job = await JobDescription.findById(session.jobId);
//   if (!job) {
//     throw new McpError(ErrorCode.NotFound, "Job not found");
//   }

//   const resumeId = session.resumeId;
//   const maxQuestions = contextState.interviewSettings?.maxQuestions || 5;
//   const isNearingEnd = questionCount === maxQuestions;

//   const responseData = await FastAIInterviewService.generateNextQuestion(
//     userMessage,
//     contextState,
//     job.markdown_description || job.context || "",
//     isNearingEnd,
//     contextState.interviewSettings || {}
//   );

//   const { response, feedback, is_question, should_end_interview, updated_context_state } = responseData;

//   await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } });

//   // Log interaction before saving
//   const interaction = {
//     question: response,
//     candidateResponse: userMessage,
//     feedback,
//     timestamp: new Date(),
//   };
//   console.log("Saving interaction:", JSON.stringify(interaction, null, 2));

//   try {
//     const updateResult = await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $push: {
//           "voiceInterviewResults.$.interactions": interaction,
//         },
//       },
//       { runValidators: true } // Enforce schema validation
//     );
//     console.log("Resume update result:", JSON.stringify(updateResult, null, 2));
//     if (updateResult.matchedCount === 0) {
//       console.error("No matching Resume document found for update");
//       throw new McpError(ErrorCode.NotFound, "Resume or session not found");
//     }
//     if (updateResult.modifiedCount === 0) {
//       console.warn("Resume document matched but not modified");
//     }
//   } catch (error) {
//     console.error("Error updating Resume interactions:", error.message);
//     throw new McpError(ErrorCode.InternalError, `Failed to save interaction: ${error.message}`);
//   }

//   const responsePayload = {
//     response,
//     feedback,
//     is_question,
//     should_end_interview,
//     updated_context_state,
//     success: true,
//   };

//   console.log("Returning /api/process response:", JSON.stringify(responsePayload, null, 2));

//   return {
//     content: [
//       {
//         type: "text",
//         text: JSON.stringify(responsePayload),
//       },
//     ],
//   };
// }
// // Only the changed function; replace in the previous mcpServer.js
// // export async function handleProcessResponse2({ sessionId, userMessage, contextState, questionCount }) {
// //   if (!sessionId || !userMessage || !contextState) {
// //     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required");
// //   }

// //   console.log("Received /api/process params:", { sessionId, userMessage, questionCount });

// //   const session = await MCPSession.findOne({ sessionId });
// //   if (!session) {
// //     throw new McpError(ErrorCode.NotFound, "Session not found");
// //   }

// //   const job = await JobDescription.findById(session.jobId);
// //   if (!job) {
// //     throw new McpError(ErrorCode.NotFound, "Job not found");
// //   }

// //   const resumeId = session.resumeId;
// //   const maxQuestions = contextState.interviewSettings?.maxQuestions || 8;
// //   const isNearingEnd = questionCount === maxQuestions; // Changed from >= maxQuestions - 1

// //   const responseData = await FastAIInterviewService.generateNextQuestion(
// //     userMessage,
// //     contextState,
// //     job?.markdown_description || job?.context || "",
// //     isNearingEnd,
// //     contextState.interviewSettings || {}
// //   );

// //   const { response, feedback, is_question, should_end_interview, updated_context_state } = responseData;

// //   await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } });

// //   await Resume.updateOne(
// //     { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
// //     {
// //       $push: {
// //         "voiceInterviewResults.$.interactions": {
// //           user: userMessage,
// //           ai: response,
// //           feedback: feedback,
// //           createdAt: new Date(),
// //         },
// //       },
// //     }
// //   );

// //   const responsePayload = {
// //     response,
// //     feedback,
// //     is_question,
// //     should_end_interview,
// //     updated_context_state,
// //     success: true,
// //   };

// //   console.log("Returning /api/process response:", JSON.stringify(responsePayload, null, 2));

// //   return {
// //     content: [
// //       {
// //         type: "text",
// //         text: JSON.stringify(responsePayload),
// //       },
// //     ],
// //   };
// // }

// export async function handleSubmitInterview({
//   sessionId,
//   jobId,
//   resumeId,
//   userId,
//   email,
//   interviewTranscript,
//   finalContextState,
// }) {
//   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//     throw new McpError(ErrorCode.InvalidParams, "All required fields must be provided");
//   }

//   const session = await MCPSession.findOne({ sessionId });
//   if (!session) {
//     throw new McpError(ErrorCode.NotFound, "Session not found");
//   }

//   const job = await JobDescription.findById(jobId);
//   if (!job) {
//     throw new McpError(ErrorCode.NotFound, "Job not found");
//   }

//   const transcriptText = interviewTranscript
//     .map((msg) => `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`)
//     .join("\n");

//   const evaluation = await FastAIInterviewService.evaluateInterview(
//     transcriptText,
//     job.markdown_description || job.context,
//     finalContextState
//   );

//   await Resume.updateOne(
//     { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//     {
//       $set: {
//         "voiceInterviewResults.$.createdAt": new Date(),
//         "voiceInterviewResults.$.score": evaluation.score,
//         "voiceInterviewResults.$.recommendation": evaluation.recommendation,
//         "voiceInterviewResults.$.evaluation": JSON.stringify(evaluation),
//       },
//     }
//   );

//   await MCPSession.deleteOne({ sessionId });

//   if (email && EMAIL_USER && EMAIL_PASS) {
//     try {
//       const mailOptions = {
//         from: EMAIL_USER,
//         to: email,
//         subject: "Voice Interview Completion",
//         text: `Dear Candidate,\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
//       };
//       await transporter.sendMail(mailOptions);
//     } catch (emailError) {
//       console.error("Email sending failed:", emailError);
//     }
//   }

//   return {
//     content: [
//       {
//         type: "text",
//         text: JSON.stringify({
//           message: "Interview submitted successfully",
//           evaluation,
//           success: true,
//         }),
//       },
//     ],
//   };
// }

// export async function handleSendInterviewLink({
//   email,
//   jobId,
//   resumeId,
//   userId,
//   resumeIds,
//   company,
//   jobTitle,
//   interviewSettings,
// }) {
//   try {
//     if (resumeIds && Array.isArray(resumeIds)) {
//       const candidates = await Resume.find({ _id: { $in: resumeIds } });
//       const emailPromises = candidates.map(async (candidate) => {
//         const interviewLink = `${FRONTEND_URL}/voice-interview?jobId=${jobId}&resumeId=${candidate._id}&userId=${userId}&email=${encodeURIComponent(
//           candidate.email
//         )}&maxQuestions=${interviewSettings?.maxQuestions || 8}&interviewDuration=${
//           interviewSettings?.interviewDuration || 15
//         }&interviewStyle=${interviewSettings?.interviewStyle || "balanced"}&voiceType=${
//           interviewSettings?.voiceType || "professional"
//         }&focusAreas=${encodeURIComponent(interviewSettings?.focusAreas?.join(",") || "")}`;

//         const mailOptions = {
//           from: EMAIL_USER,
//           to: candidate.email,
//           subject: `Voice Interview Invitation for ${jobTitle}`,
//           html: `
//             <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//               <h2>Voice Interview Invitation</h2>
//               <p>Dear ${candidate.candidateName},</p>
//               <p>You have been invited to participate in a voice interview for <strong>${jobTitle}</strong> at ${company}.</p>
//               <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                 <h3>Interview Details:</h3>
//                 <ul>
//                   <li>Duration: ${interviewSettings?.interviewDuration || 15} minutes</li>
//                   <li>Questions: ${interviewSettings?.maxQuestions || 8} questions</li>
//                   <li>Style: ${interviewSettings?.interviewStyle || "Professional"}</li>
//                 </ul>
//               </div>
//               <div style="text-align: center; margin: 30px 0;">
//                 <a href="${interviewLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Start Voice Interview</a>
//               </div>
//               <p>Best regards,<br>${company} Team</p>
//             </div>
//           `,
//         };
//         return transporter.sendMail(mailOptions);
//       });

//       await Promise.all(emailPromises);

//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify({
//               message: `Interview links sent to ${candidates.length} candidates successfully`,
//               success: true,
//             }),
//           },
//         ],
//       };
//     } else {
//       if (!email || !jobId || !resumeId) {
//         throw new McpError(ErrorCode.InvalidParams, "email, jobId, and resumeId are required");
//       }

//       const job = await JobDescription.findById(jobId);
//       if (!job) {
//         throw new McpError(ErrorCode.InvalidParams, "Job not found");
//       }

//       const interviewLink = `${FRONTEND_URL}/voice-interview?jobId=${jobId}&resumeId=${resumeId}&userId=${userId}&email=${encodeURIComponent(
//         email
//       )}&maxQuestions=${interviewSettings?.maxQuestions || 8}&interviewDuration=${
//         interviewSettings?.interviewDuration || 15
//       }&interviewStyle=${interviewSettings?.interviewStyle || "balanced"}&voiceType=${
//         interviewSettings?.voiceType || "professional"
//       }&focusAreas=${encodeURIComponent(interviewSettings?.focusAreas?.join(",") || "")}`;

//       const mailOptions = {
//         from: EMAIL_USER,
//         to: email,
//         subject: `Voice Interview Invitation for ${job.context}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//             <h2>Voice Interview Invitation</h2>
//             <p>Dear Candidate,</p>
//             <p>You have been invited to participate in a voice interview for <strong>${job.context}</strong>.</p>
//             <div style="text-align: center; margin: 30px 0;">
//               <a href="${interviewLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Start Voice Interview</a>
//             </div>
//             <p>Best regards,<br>AI Interview Team</p>
//           </div>
//         `,
//       };

//       await transporter.sendMail(mailOptions);

//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify({
//               message: "Interview link sent successfully",
//               success: true,
//             }),
//           },
//         ],
//       };
//     }
//   } catch (error) {
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// // Start server
// async function main() {
//   await connectDB();

//   // Override stdout to suppress non-JSON logs but allow JSON-RPC responses
//   const originalStdoutWrite = process.stdout.write;
//   process.stdout.write = (data, encoding, callback) => {
//     const strData = data.toString();
//     try {
//       const parsed = JSON.parse(strData);
//       if (parsed.jsonrpc === "2.0" || parsed.result || parsed.error) {
//         // Valid JSON-RPC response, allow it
//         return originalStdoutWrite.call(process.stdout, data, encoding, callback);
//       }
//     } catch (e) {
//       // Non-JSON or invalid JSON, suppress to stderr
//       console.error("Suppressed non-JSON stdout:", strData);
//       return true;
//     }
//     // Non-JSON-RPC JSON, suppress to stderr
//     console.error("Suppressed non-JSON stdout:", strData);
//     return true;
//   };

//   const transport = new StdioServerTransport();
//   // transport.on("data", (data) => {
//   //   console.error("StdioServerTransport data:", data.toString());
//   // });
//   // transport.on("error", (error) => {
//   //   console.error("StdioServerTransport error:", error);
//   // });

//   await server.connect(transport);
//   console.error("AI Interview MCP Server running on stdio");
// }

// main();

// main().catch((error) => {
//   console.error("Server error:", error);
//   process.exit(1);
// });
