import { randomUUID } from "crypto"
import nodemailer from "nodemailer"
import { OpenAI } from "openai"
import Resume from "../../model/resumeModel.js"
import MCPSession from "../../model/mcpSessionModel.js"
import JobDescription from "../../model/JobDescriptionModel.js"
import Notification from "../../model/NotificationModal.js"

// Environment configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const EMAIL_USER = process.env.EMAIL_USER
const EMAIL_PASS = process.env.EMAIL_PASS

// Initialize services
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
})

// AI Interview Service - Let AI naturally determine everything
class FastAIInterviewService {
  static async generateInitialPrompt(jobDescription, resumeData, interviewSettings = {}) {
    const focusAreasText =
      interviewSettings.focusAreas?.length > 0
        ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
        : ""

    const styleText = interviewSettings.interviewStyle
      ? `Use a ${interviewSettings.interviewStyle} interview style. `
      : ""

    const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute voice interview.

${styleText}${focusAreasText}

Create a warm, professional greeting with the first question for ${resumeData.candidateName}.

Job Description: ${jobDescription}
Candidate Background: ${resumeData.skills || "General background"}

Requirements:
- Keep it concise and natural for voice interaction
- Start with a general introduction question
- Be encouraging and professional
- Maximum 2-3 sentences

Generate a welcoming opening question that gets the candidate talking about themselves.`

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      })

      return response.choices[0].message.content.trim()
    } catch (error) {
      console.error("Error generating initial prompt:", error.message)
      return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`
    }
  }

  static async generateFeedbackAndNextQuestion(
    userResponse,
    contextState,
    jobDescription,
    questionCount,
    maxQuestions,
    interviewSettings = {},
    resumeData = {},
  ) {
    const questionsAsked = contextState.questionsAsked || []

    if (questionCount >= maxQuestions) {
      return {
        response:
          "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
        feedback: "Thank you for participating in the interview.",
        is_question: false,
        should_end_interview: true,
        updated_context_state: {
          ...contextState,
          questionsAsked: [...questionsAsked, "Interview concluded"],
        },
      }
    }

    // Let AI naturally determine everything - no manual detection
    const prompt = `You are an AI interviewer conducting a professional interview. Based on the job description and candidate's response, generate the next appropriate question.

Job Description: ${jobDescription}
Candidate: ${resumeData.candidateName} - ${resumeData.skills || "General background"}
Previous response: "${userResponse}"
Previous questions: ${questionsAsked.slice(-2).join(", ")}
Question ${questionCount} of ${maxQuestions}

IMPORTANT INSTRUCTIONS:
1. Analyze the job description to understand if this is a technical role (software development, programming, engineering) or non-technical role (UI/UX design, marketing, HR, sales, Law etc.)

2. For TECHNICAL roles (programming/development):
   - Ask coding/technical questions with code snippets for questions 2 and 4
   - Include substantial code examples that need analysis, debugging, or improvement
   - Focus on algorithms, data structures, system design, debugging

3. For NON-TECHNICAL roles (UI/UX, marketing, design, business, etc.):
   - Ask role-specific questions about processes, experience, portfolio, strategies
   - NO code snippets or programming questions
   - Focus on design thinking, user experience, business processes, creativity

4. Generate brief, encouraging feedback for their previous response (1-2 sentences)

5. Create follow-up questions that build on their experience and the job requirements

Return ONLY valid JSON:
{
  "feedback": "brief positive feedback for previous response",
  "response": "your next question",
  "is_question": true,
  "should_end_interview": false,
  "technical_question": true/false,
  "question_metadata": {
    "question_text": "question without code",
    "code_snippet": "substantial code example (only for technical roles)",
    "language": "programming language (only for technical)",
    "spoken_text": "shorter version for voice",
    "question_type": "debugging/coding/design/strategy/experience"
  }
}

For technical questions, ensure code_snippet is substantial (100+ characters) and realistic.
For non-technical questions, omit code_snippet entirely.`

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.8,
        max_tokens: 1200,
      })

      const content = response.choices[0].message.content.trim()

      // Clean and parse JSON response
      let cleanContent = content
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.replace(/^```json\s*/, "").replace(/\s*```$/, "")
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/^```\s*/, "").replace(/\s*```$/, "")
      }

      const result = JSON.parse(cleanContent)

      // Validate response
      if (!result.response || !result.feedback) {
        throw new Error("Invalid AI response format")
      }

      return {
        response: result.response,
        feedback: result.feedback,
        is_question: result.is_question !== false,
        should_end_interview: result.should_end_interview || false,
        technical_question: result.technical_question || false,
        question_metadata: result.question_metadata || null,
        updated_context_state: {
          ...contextState,
          questionsAsked: [...questionsAsked, result.response],
          currentQuestionIndex: (contextState.currentQuestionIndex || 0) + 1,
          interviewSettings: contextState.interviewSettings || interviewSettings,
        },
      }
    } catch (error) {
      console.error("Error generating next question:", error.message)

      // Simple fallback without technical detection
      return {
        response: "Can you share a specific example of a challenge you've faced in your work and how you overcame it?",
        feedback: "Thank you for sharing that insight.",
        is_question: true,
        should_end_interview: false,
        technical_question: false,
        question_metadata: null,
        updated_context_state: {
          ...contextState,
          questionsAsked: [
            ...questionsAsked,
            "Can you share a specific example of a challenge you've faced in your work and how you overcame it?",
          ],
          currentQuestionIndex: (contextState.currentQuestionIndex || 0) + 1,
          interviewSettings: contextState.interviewSettings || interviewSettings,
        },
      }
    }
  }

  static async evaluateInterview(transcript, jobDescription, contextState, submissionData = {}) {
    const tabSwitchPenalty =
      submissionData.tabSwitchCount > 0
        ? `Note: Candidate switched tabs ${submissionData.tabSwitchCount} time(s) during interview. `
        : ""

    const submissionContext =
      submissionData.submissionReason === "disqualified_tab_switch"
        ? "CANDIDATE WAS DISQUALIFIED due to tab switching during interview. "
        : submissionData.submissionReason === "tab_switch"
          ? "Interview was auto-submitted due to tab switching. "
          : ""

    const disqualificationNote = submissionData.isDisqualified
      ? "DISQUALIFICATION: This candidate violated interview integrity policy by switching tabs. "
      : ""

    const prompt = `Evaluate this interview transcript and provide a comprehensive assessment.

Job: ${jobDescription}
Transcript: ${transcript}
${disqualificationNote}${tabSwitchPenalty}${submissionContext}

Provide evaluation in JSON format:
{
  "score": [1-10 integer],
  "strengths": ["strength1", "strength2", "strength3"],
  "areas_for_improvement": ["area1", "area2"],
  "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
  "summary": "Brief assessment paragraph",
  "tab_switch_impact": "assessment of tab switching impact if applicable",
  "disqualification_reason": "reason for disqualification if applicable"
}

Consider:
- Quality and depth of responses
- Relevant experience and skills
- Communication clarity
- Problem-solving approach
- Technical knowledge (if applicable)
- Interview integrity violations`

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      })

      return JSON.parse(response.choices[0].message.content.trim())
    } catch (error) {
      console.error("Error evaluating interview:", error.message)
      return {
        score: submissionData.isDisqualified ? 1 : submissionData.tabSwitchCount > 1 ? 3 : 7,
        strengths: submissionData.isDisqualified ? [] : ["Participated in interview process"],
        areas_for_improvement: submissionData.isDisqualified
          ? ["Must maintain interview integrity", "Follow interview guidelines"]
          : submissionData.tabSwitchCount > 0
            ? ["Could provide more specific examples", "Maintain focus during interview"]
            : ["Could provide more specific examples"],
        recommendation: submissionData.isDisqualified
          ? "Do Not Recommend - Disqualified"
          : submissionData.tabSwitchCount > 1
            ? "Do Not Recommend"
            : "Consider",
        summary: submissionData.isDisqualified
          ? "Candidate was disqualified due to tab switching, violating interview integrity policy."
          : submissionData.tabSwitchCount > 0
            ? "Candidate showed potential but had focus issues during interview."
            : "Candidate showed good potential with room for growth.",
        tab_switch_impact:
          submissionData.tabSwitchCount > 0
            ? `Tab switching detected ${submissionData.tabSwitchCount} times${submissionData.isDisqualified ? ", resulting in disqualification" : ", indicating potential attention issues"}.`
            : null,
        disqualification_reason: submissionData.isDisqualified ? "Tab switching during interview" : null,
      }
    }
  }
}

// Controller functions
export const initializeInterview = async (req, res) => {
  try {
    const { jobId, resumeId, interviewSettings = {} } = req.body

    if (!jobId || !resumeId || !interviewSettings) {
      return res.status(400).json({
        error: "Missing required fields: jobId, resumeId, or interviewSettings",
        success: false,
      })
    }

    console.log("Initialize request:", { jobId, resumeId, interviewSettings })

    const [job, resume] = await Promise.all([
      JobDescription.findById(jobId).maxTimeMS(10000),
      Resume.findById(resumeId).maxTimeMS(10000),
    ])

    if (!job || !resume) {
      return res.status(404).json({
        error: "Job or resume not found",
        success: false,
      })
    }

    const sessionId = randomUUID()
    const contextState = {
      questionsAsked: [],
      currentQuestionIndex: 0,
      startTime: new Date().toISOString(),
      interviewSettings,
      resumeData: resume,
    }

    const mcpSession = new MCPSession({
      sessionId,
      jobId,
      resumeId,
      contextState,
    })

    await mcpSession.save()

    const voiceInterviewResult = {
      sessionId,
      jobId,
      createdAt: new Date(),
      interactions: [],
      interviewSettings,
      tabSwitchCount: 0,
      submissionReason: "pending",
    }

    await Resume.updateOne(
      { _id: resumeId },
      { $push: { voiceInterviewResults: voiceInterviewResult } },
      { upsert: true },
    )

    const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
      job.markdown_description || job.context,
      resume,
      interviewSettings,
    )

    const initialInteraction = {
      question: initialPrompt,
      candidateResponse: "",
      feedback: "",
      timestamp: new Date(),
    }

    await Resume.updateOne(
      { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
      { $push: { "voiceInterviewResults.$.interactions": initialInteraction } },
    )

    // Emit to socket if available
    if (req.io) {
      req.io.emit("interview_initialized", {
        sessionId,
        status: "initialized",
      })
    }

    res.json({
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
    })
  } catch (error) {
    console.error("Initialize interview error:", error.message)
    res.status(500).json({
      error: error.message,
      success: false,
    })
  }
}

export const processResponse = async (req, res) => {
  try {
    const { sessionId, userMessage, contextState, questionCount } = req.body

    if (!sessionId || !userMessage || !contextState || questionCount === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        success: false,
      })
    }

    console.log("Process request:", { sessionId, userMessage, questionCount })

    const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000)
    if (!session) {
      return res.status(404).json({
        error: "Session not found",
        success: false,
      })
    }

    const [job, resume] = await Promise.all([
      JobDescription.findById(session.jobId).maxTimeMS(10000),
      Resume.findById(session.resumeId).maxTimeMS(10000),
    ])

    if (!job || !resume) {
      return res.status(404).json({
        error: "Job or resume not found",
        success: false,
      })
    }

    const maxQuestions = contextState.interviewSettings?.maxQuestions || 5

    const responseData = await FastAIInterviewService.generateFeedbackAndNextQuestion(
      userMessage,
      contextState,
      job.markdown_description || job.context || "",
      questionCount,
      maxQuestions,
      contextState.interviewSettings || {},
      resume,
    )

    const {
      response,
      feedback,
      is_question,
      should_end_interview,
      updated_context_state,
      technical_question,
      question_metadata,
    } = responseData

    // Update the session context state
    await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } })

    // Update the candidate response and feedback for the current interaction
    await Resume.updateOne(
      { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $set: {
          "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage,
          "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
        },
      },
      { arrayFilters: [{ "elem.candidateResponse": "" }] },
    )

    // Add new interaction if it's a question and not the end of the interview
    if (is_question && !should_end_interview) {
      const newInteraction = {
        question: response,
        candidateResponse: "",
        feedback: "",
        timestamp: new Date(),
        technical_question: technical_question || false,
        question_metadata: question_metadata || null,
      }

      await Resume.updateOne(
        { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
        { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
      )
    }

    // Emit to socket if available
    if (req.io) {
      req.io.emit("question_processed", {
        sessionId,
        questionCount,
        technical_question: technical_question || false,
      })
    }

    res.json({
      response,
      feedback,
      is_question,
      should_end_interview,
      updated_context_state,
      technical_question: technical_question || false,
      question_metadata: question_metadata || null,
      success: true,
    })
  } catch (error) {
    console.error("Process response error:", error.message)
    res.status(500).json({
      error: error.message,
      success: false,
    })
  }
}

export const submitInterview = async (req, res) => {
  try {
    const {
      sessionId,
      jobId,
      resumeId,
      userId,
      email,
      interviewTranscript,
      finalContextState,
      tabSwitchCount = 0,
      submissionReason = "normal_completion",
      isDisqualified = false,
    } = req.body

    if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
      return res.status(400).json({
        error: "All required fields must be provided",
        success: false,
      })
    }

    const session = await MCPSession.findOne({ sessionId })
    const job = await JobDescription.findById(jobId)
    const resume = await Resume.findById(resumeId)

    if (!job || !resume) {
      return res.status(404).json({
        error: "Job or resume not found",
        success: false,
      })
    }

    const transcriptText = interviewTranscript
      .map(
        (msg) =>
          `${msg.type === "user" ? "Candidate" : msg.type === "system" ? "System" : "Interviewer"}: ${msg.content}`,
      )
      .join("\n")

    const submissionData = {
      tabSwitchCount,
      submissionReason,
      isDisqualified,
    }

    const evaluation = await FastAIInterviewService.evaluateInterview(
      transcriptText,
      job.markdown_description || job.context,
      finalContextState,
      submissionData,
    )

    // Override evaluation for disqualified candidates
    if (isDisqualified) {
      evaluation.score = 1
      evaluation.recommendation = "Do Not Recommend - Disqualified"
      evaluation.summary =
        "Candidate was disqualified due to tab switching during the interview, violating interview integrity policy."
      evaluation.disqualification_reason = "Tab switching detected during interview"
    }

    await Resume.updateOne(
      { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $set: {
          "voiceInterviewResults.$.createdAt": new Date(),
          "voiceInterviewResults.$.score": evaluation.score,
          "voiceInterviewResults.$.recommendation": evaluation.recommendation,
          "voiceInterviewResults.$.evaluation": JSON.stringify(evaluation),
          "voiceInterviewResults.$.tabSwitchCount": tabSwitchCount,
          "voiceInterviewResults.$.submissionReason": submissionReason,
          "voiceInterviewResults.$.isDisqualified": isDisqualified,
        },
      },
    )

    if (session) {
      await MCPSession.deleteOne({ sessionId })
    }

    // Send email notification
    if (resume.email && EMAIL_USER && EMAIL_PASS) {
      try {
        const subject = isDisqualified ? "Interview Disqualification Notice" : "Voice Interview Completion"
        const emailContent = isDisqualified
          ? `Dear ${resume.candidateName || "Candidate"},\n\nWe regret to inform you that you have been disqualified from the interview for ${job.context} due to tab switching during the session, which violates our interview integrity policy.\n\nYour session has been terminated and submitted for review.\n\nBest regards,\nAI Interview Team`
          : `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.${tabSwitchCount > 0 ? `\n\nNote: ${tabSwitchCount} tab switch${tabSwitchCount > 1 ? "es were" : " was"} detected during the interview.` : ""}\n\nBest regards,\nAI Interview Team`

        const mailOptions = {
          from: EMAIL_USER,
          to: resume.email,
          subject: subject,
          text: emailContent,
        }

        await transporter.sendMail(mailOptions)
      } catch (emailError) {
        console.error("Email sending failed:", emailError.message)
      }
    }

    // Create notification
    if (userId) {
      const notificationMessage = isDisqualified
        ? `${resume?.candidateName || "Candidate"} DISQUALIFIED - Tab switching detected during interview`
        : tabSwitchCount > 0
          ? `${resume?.candidateName || "Candidate"} Voice Interview Completed (${tabSwitchCount} tab switches detected)`
          : `${resume?.candidateName || "Candidate"} Voice Interview Completed`

      const newNotification = new Notification({
        message: notificationMessage,
        recipientId: userId,
        resumeId,
      })

      await newNotification.save()
    }

    // Emit to socket if available
    if (req.io) {
      req.io.emit("interview_completed", {
        sessionId,
        evaluation,
        status: isDisqualified ? "disqualified" : "completed",
        tabSwitchCount,
        submissionReason,
        isDisqualified,
      })
    }

    res.json({
      message: isDisqualified ? "Interview terminated due to policy violation" : "Interview submitted successfully",
      evaluation,
      tabSwitchCount,
      submissionReason,
      isDisqualified,
      success: true,
    })
  } catch (error) {
    console.error("Submit interview error:", error.message)
    res.status(500).json({
      error: error.message,
      success: false,
    })
  }
}



// ------ working with interview cencel code plust add technical question for ui ux ---------------------
// "use client"
// import { randomUUID } from "crypto"
// import nodemailer from "nodemailer"
// import { OpenAI } from "openai"
// import Resume from "../../model/resumeModel.js"
// import MCPSession from "../../model/mcpSessionModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Notification from "../../model/NotificationModal.js"

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY
// const EMAIL_USER = process.env.EMAIL_USER
// const EMAIL_PASS = process.env.EMAIL_PASS

// // Initialize services
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: EMAIL_USER,
//     pass: EMAIL_PASS,
//   },
// })

// // AI Interview Service
// class FastAIInterviewService {
//   static detectTechnicalRole(jobDescription) {
//     const technicalKeywords = [
//       "software",
//       "developer",
//       "engineer",
//       "programming",
//       "coding",
//       "technical",
//       "architect",
//       "qa",
//       "testing",
//       "devops",
//       "data",
//       "machine learning",
//       "ai",
//       "blockchain",
//       "cloud",
//       "security",
//       "mobile",
//       "web",
//       "api",
//       "database",
//       "system",
//       "network",
//       "infrastructure",
//       "automation",
//       "javascript",
//       "python",
//       "java",
//       "react",
//       "node",
//       "frontend",
//       "backend",
//       "fullstack",
//       "angular",
//       "vue",
//       "typescript",
//       "mongodb",
//       "sql",
//       "nosql",
//       "aws",
//       "docker",
//     ]
//     const description = jobDescription.toLowerCase()
//     return technicalKeywords.some((keyword) => description.includes(keyword))
//   }

//   static detectProgrammingLanguage(jobDescription) {
//     const languages = {
//       javascript: ["javascript", "js", "react", "node", "vue", "angular", "typescript", "express", "nextjs"],
//       python: ["python", "django", "flask", "pandas", "numpy", "fastapi", "pytorch", "tensorflow"],
//       java: ["java", "spring", "hibernate", "maven", "gradle"],
//       csharp: ["c#", "csharp", ".net", "asp.net", "blazor"],
//       php: ["php", "laravel", "symfony", "wordpress"],
//       ruby: ["ruby", "rails", "sinatra"],
//       go: ["golang", "go", "gin", "fiber"],
//       rust: ["rust", "actix", "rocket"],
//       cpp: ["c++", "cpp", "qt"],
//       sql: ["sql", "mysql", "postgresql", "database", "mongodb", "redis"],
//     }

//     const description = jobDescription.toLowerCase()
//     for (const [lang, keywords] of Object.entries(languages)) {
//       if (keywords.some((keyword) => description.includes(keyword))) {
//         return lang
//       }
//     }
//     return "javascript"
//   }

//   static generateAdvancedCodeSnippet(language, questionType, difficulty) {
//     const advancedSnippets = {
//       javascript: {
//         intermediate: {
//           debugging: `// React Hook Issue - What's wrong here?
// function useCounter(initialValue = 0) {
//   const [count, setCount] = useState(initialValue);
  
//   const increment = () => {
//     setCount(count + 1);
//     setCount(count + 1); // Double increment?
//   };
  
//   const reset = useCallback(() => {
//     setCount(initialValue);
//   }, []);
  
//   return { count, increment, reset };
// }`,
//           coding: `// Implement a custom React hook for debounced search
// function useDebounce(value, delay) {
//   // Your implementation here
//   // Should return debounced value
// }

// // Usage example:
// function SearchComponent() {
//   const [searchTerm, setSearchTerm] = useState('');
//   const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
//   // Effect for API call should go here
// }`,
//           system_design: `// Design a React Context for theme management
// const ThemeContext = createContext();

// export function ThemeProvider({ children }) {
//   // Implement theme state management
//   // Support: light/dark modes, custom colors
//   // Persist theme preference
// }

// export function useTheme() {
//   // Return theme utilities
// }`,
//         },
//         advanced: {
//           coding: `// Implement a React hook for infinite scrolling
// function useInfiniteScroll(fetchMore, hasMore) {
//   // Your implementation here
//   // Should handle:
//   // - Intersection Observer
//   // - Loading states
//   // - Error handling
//   // - Cleanup
// }

// // Usage:
// function PostsList() {
//   const { data, loading, error } = useInfiniteScroll(
//     fetchPosts, 
//     hasMorePosts
//   );
// }`,
//           performance: `// Optimize this React component
// function ExpensiveList({ items, onItemClick }) {
//   return (
//     <div>
//       {items.map(item => (
//         <div key={item.id} onClick={() => onItemClick(item)}>
//           <ExpensiveComponent data={item} />
//           {item.children?.map(child => (
//             <NestedComponent key={child.id} data={child} />
//           ))}
//         </div>
//       ))}
//     </div>
//   );
// }`,
//         },
//       },
//       python: {
//         intermediate: {
//           debugging: `# What's wrong with this async code?
// import asyncio
// import aiohttp

// async def fetch_data(urls):
//     results = []
//     for url in urls:
//         async with aiohttp.ClientSession() as session:
//             async with session.get(url) as response:
//                 data = await response.json()
//                 results.append(data)
//     return results

// # How would you optimize this?`,
//           coding: `# Implement a decorator for caching function results
// def memoize(func):
//     # Your implementation here
//     # Should handle:
//     # - Different argument types
//     # - Cache size limits
//     # - TTL (time to live)
//     pass

// @memoize
// def expensive_calculation(n):
//     # Simulate expensive operation
//     return sum(i**2 for i in range(n))`,
//         },
//         advanced: {
//           system_design: `# Design a distributed task queue system
// class TaskQueue:
//     def __init__(self, redis_url, workers=4):
//         # Initialize Redis connection
//         # Set up worker processes
//         pass
    
//     def enqueue(self, task_func, *args, **kwargs):
//         # Add task to queue with priority
//         pass
    
//     def process_tasks(self):
//         # Worker process implementation
//         # Handle failures, retries, dead letter queue
//         pass`,
//         },
//       },
//     }

//     const langSnippets = advancedSnippets[language] || advancedSnippets.javascript
//     const difficultySnippets = langSnippets[difficulty] || langSnippets.intermediate
//     const typeSnippets = difficultySnippets[questionType] || Object.values(difficultySnippets)[0]

//     return typeSnippets || `// Advanced ${language} ${questionType} challenge`
//   }

//   static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
//     const detectedLanguage = this.detectProgrammingLanguage(jobDescription)
//     const difficulty = questionNumber <= 2 ? "intermediate" : "advanced"

//     const prompt = `You are a senior technical interviewer. Generate a challenging technical question that tests real-world problem-solving skills.

// Job Description: ${jobDescription}
// Candidate: ${resumeData.candidateName} - ${resumeData.skills || "General technical background"}
// Previous Questions: ${previousQuestions.join("; ")}
// Question #${questionNumber} - Difficulty: ${difficulty}
// Primary Language: ${detectedLanguage}

// Create a question that:
// 1. Tests practical, real-world scenarios (not basic syntax)
// 2. Requires problem-solving and critical thinking
// 3. Includes a code snippet with subtle issues or optimization opportunities
// 4. Is appropriate for a ${difficulty} level developer
// 5. Focuses on: performance, scalability, best practices, or architecture

// Return JSON:
// {
//   "question_text": "Challenging question without code (what to analyze/implement)",
//   "code_snippet": "Complex, realistic code example with issues or optimization needs",
//   "language": "${detectedLanguage}",
//   "expected_topics": ["specific technical concepts"],
//   "difficulty": "${difficulty}",
//   "question_type": "debugging|optimization|architecture|implementation",
//   "follow_up_questions": ["What would you improve?", "How would you scale this?"]
// }

// Make the code snippet realistic and challenging - not basic examples.`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.9,
//         max_tokens: 800,
//       })

//       const content = response.choices[0].message.content.trim()

//       // Replace the existing JSON parsing section with this improved version
//       try {
//         // Clean the response to handle markdown code blocks
//         let cleanContent = content.trim()
//         // Remove markdown code block markers if present
//         if (cleanContent.startsWith("```json")) {
//           cleanContent = cleanContent.replace(/^```json\s*/, "").replace(/\s*```$/, "")
//         } else if (cleanContent.startsWith("```")) {
//           cleanContent = cleanContent.replace(/^```\s*/, "").replace(/\s*```$/, "")
//         }

//         const technicalQuestion = JSON.parse(cleanContent)

//         if (!technicalQuestion.question_text) {
//           throw new Error("Invalid question format")
//         }

//         let codeSnippet = technicalQuestion.code_snippet || ""
//         if (!codeSnippet.trim()) {
//           const questionType = technicalQuestion.question_type || "coding"
//           codeSnippet = this.generateAdvancedCodeSnippet(detectedLanguage, questionType, difficulty)
//         }

//         // Create shorter spoken version for better UX
//         const spokenText =
//           technicalQuestion.question_text.length > 150
//             ? technicalQuestion.question_text.substring(0, 150) + "... Please analyze the code shown on screen."
//             : technicalQuestion.question_text

//         return {
//           question_text: technicalQuestion.question_text,
//           code_snippet: codeSnippet,
//           language: technicalQuestion.language || detectedLanguage,
//           expected_topics: technicalQuestion.expected_topics || [],
//           difficulty: difficulty,
//           question_type: technicalQuestion.question_type || "coding",
//           follow_up_questions: technicalQuestion.follow_up_questions || [],
//           spoken_text: spokenText, // Add shorter version for speech
//         }
//       } catch (parseError) {
//         console.error("Parse error in technical question:", parseError.message)
//         // Continue with fallback without showing error to user
//       }

//       const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "debugging", difficulty)
//       return {
//         question_text:
//           "Analyze this code for potential issues, performance problems, and suggest improvements. What would you change and why?",
//         code_snippet: fallbackCode,
//         language: detectedLanguage,
//         expected_topics: ["code-review", "performance", "best-practices", "architecture"],
//         difficulty: difficulty,
//         question_type: "debugging",
//         follow_up_questions: ["How would you test this?", "What about scalability?"],
//       }
//     } catch (error) {
//       console.error("Error generating technical question:", error.message)
//       const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "coding", difficulty)
//       return {
//         question_text:
//           "Review this code implementation. What are the potential issues and how would you improve it for production use?",
//         code_snippet: fallbackCode,
//         language: detectedLanguage,
//         expected_topics: ["problem-solving", "production-readiness"],
//         difficulty: difficulty,
//         question_type: "coding",
//         follow_up_questions: ["What about error handling?", "How would you monitor this?"],
//       }
//     }
//   }

//   static async generateInitialPrompt(jobDescription, resumeData, interviewSettings = {}) {
//     const focusAreasText =
//       interviewSettings.focusAreas?.length > 0
//         ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
//         : ""
//     const styleText = interviewSettings.interviewStyle
//       ? `Use a ${interviewSettings.interviewStyle} interview style. `
//       : ""

//     const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute voice interview.
// ${styleText}${focusAreasText}
// Create a warm, professional greeting with the first question for ${resumeData.candidateName}.
// Job: ${jobDescription}
// Keep it concise and natural. Start with a general introduction question.`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.7,
//         max_tokens: 150,
//       })
//       return response.choices[0].message.content
//     } catch (error) {
//       return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`
//     }
//   }

//   static async generateNextQuestion(
//     userResponse,
//     contextState,
//     jobDescription,
//     questionCount,
//     maxQuestions,
//     interviewSettings = {},
//     resumeData = {},
//   ) {
//     const questionsAsked = contextState.questionsAsked || []
//     const currentIndex = contextState.currentQuestionIndex || 0

//     if (questionCount >= maxQuestions) {
//       return {
//         response:
//           "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
//         feedback: "Thank you for participating in the interview.",
//         is_question: false,
//         should_end_interview: true,
//         updated_context_state: {
//           ...contextState,
//           questionsAsked: [...questionsAsked, "Interview concluded"],
//           currentQuestionIndex: currentIndex,
//           interviewSettings: contextState.interviewSettings || interviewSettings,
//         },
//       }
//     }

//     const isTechnicalRole = this.detectTechnicalRole(jobDescription)
//     let shouldAskTechnical = isTechnicalRole && (questionCount === 2 || questionCount === 4)
//     let nextQuestion

//     if (shouldAskTechnical) {
//       try {
//         const technicalQuestion = await this.generateTechnicalQuestion(
//           jobDescription,
//           resumeData,
//           questionsAsked,
//           questionCount,
//         )

//         let fullQuestionText = technicalQuestion.question_text
//         if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
//           fullQuestionText += " Please analyze the code I've shared and walk me through your thought process."
//         }

//         nextQuestion = {
//           response: fullQuestionText,
//           feedback: `Excellent! Now let's dive into a technical challenge.`,
//           is_question: true,
//           should_end_interview: false,
//           technical_question: true,
//           question_metadata: {
//             ...technicalQuestion,
//             spoken_text: technicalQuestion.spoken_text,
//             display_text: fullQuestionText,
//           },
//         }
//       } catch (error) {
//         console.error("Error generating technical question:", error.message)
//         shouldAskTechnical = false
//       }
//     }

//     if (!shouldAskTechnical) {
//       const prompt = `AI Interviewer. Generate the next question based on the candidate's response: "${userResponse}"

// Previous questions: ${questionsAsked.slice(-2).join(", ")}
// Job description: ${jobDescription}
// Question ${questionCount} of ${maxQuestions}

// Return a JSON object:
// {
//   "response": "question text",
//   "feedback": "brief positive feedback",
//   "is_question": true,
//   "should_end_interview": false
// }`

//       try {
//         const response = await openai.chat.completions.create({
//           model: "gpt-4o-mini",
//           messages: [{ role: "system", content: prompt }],
//           temperature: 0.7,
//           max_tokens: 250,
//         })

//         const result = JSON.parse(response.choices[0].message.content)
//         nextQuestion = {
//           response: result.response,
//           feedback: result.feedback || "Thank you for your response.",
//           is_question: result.is_question,
//           should_end_interview: result.should_end_interview,
//         }
//       } catch (error) {
//         nextQuestion = {
//           response: "Can you share an example of how you've applied your skills to solve a problem in this field?",
//           feedback: "Thank you for sharing.",
//           is_question: true,
//           should_end_interview: false,
//         }
//       }
//     }

//     return {
//       ...nextQuestion,
//       updated_context_state: {
//         ...contextState,
//         questionsAsked: [...questionsAsked, nextQuestion.response],
//         currentQuestionIndex: nextQuestion.is_question ? currentIndex + 1 : currentIndex,
//         interviewSettings: contextState.interviewSettings || interviewSettings,
//       },
//     }
//   }

//   static async evaluateInterview(transcript, jobDescription, contextState, submissionData = {}) {
//     const tabSwitchPenalty =
//       submissionData.tabSwitchCount > 0
//         ? `Note: Candidate switched tabs ${submissionData.tabSwitchCount} time(s) during interview. `
//         : ""

//     const submissionContext =
//       submissionData.submissionReason === "disqualified_tab_switch"
//         ? "CANDIDATE WAS DISQUALIFIED due to tab switching during interview. "
//         : submissionData.submissionReason === "tab_switch"
//           ? "Interview was auto-submitted due to tab switching. "
//           : ""

//     const disqualificationNote = submissionData.isDisqualified
//       ? "DISQUALIFICATION: This candidate violated interview integrity policy by switching tabs. "
//       : ""

//     const prompt = `Evaluate interview transcript. Provide concise assessment.

// Job: ${jobDescription}
// Transcript: ${transcript}
// ${disqualificationNote}${tabSwitchPenalty}${submissionContext}

// JSON response:
// {
//   "score": [1-10],
//   "strengths": ["strength1", "strength2", "strength3"],
//   "areas_for_improvement": ["area1", "area2"],
//   "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
//   "summary": "Brief assessment",
//   "tab_switch_impact": "assessment of tab switching impact if applicable",
//   "disqualification_reason": "reason for disqualification if applicable"
// }`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.3,
//         max_tokens: 400,
//       })
//       return JSON.parse(response.choices[0].message.content)
//     } catch (error) {
//       return {
//         score: submissionData.isDisqualified ? 1 : submissionData.tabSwitchCount > 2 ? 3 : 7,
//         strengths: submissionData.isDisqualified ? [] : ["Participated in interview process"],
//         areas_for_improvement: submissionData.isDisqualified
//           ? ["Must maintain interview integrity", "Follow interview guidelines"]
//           : submissionData.tabSwitchCount > 0
//             ? ["Could provide more specific examples", "Maintain focus during interview"]
//             : ["Could provide more specific examples"],
//         recommendation: submissionData.isDisqualified
//           ? "Do Not Recommend - Disqualified"
//           : submissionData.tabSwitchCount > 2
//             ? "Do Not Recommend"
//             : "Consider",
//         summary: submissionData.isDisqualified
//           ? "Candidate was disqualified due to tab switching, violating interview integrity policy."
//           : submissionData.tabSwitchCount > 0
//             ? "Candidate showed potential but had focus issues during interview."
//             : "Candidate showed good potential with room for growth.",
//         tab_switch_impact:
//           submissionData.tabSwitchCount > 0
//             ? `Tab switching detected ${submissionData.tabSwitchCount} times${submissionData.isDisqualified ? ", resulting in disqualification" : ", indicating potential attention issues"}.`
//             : null,
//         disqualification_reason: submissionData.isDisqualified ? "Tab switching during interview" : null,
//       }
//     }
//   }
// }

// // Controller functions
// export const initializeInterview = async (req, res) => {
//   try {
//     const { jobId, resumeId, interviewSettings = {} } = req.body

//     if (!jobId || !resumeId || !interviewSettings) {
//       return res.status(400).json({
//         error: "Missing required fields: jobId, resumeId, or interviewSettings",
//         success: false,
//       })
//     }

//     console.log("Initialize request:", { jobId, resumeId, interviewSettings })

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(10000),
//       Resume.findById(resumeId).maxTimeMS(10000),
//     ])

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const sessionId = randomUUID()
//     const contextState = {
//       questionsAsked: [],
//       currentQuestionIndex: 0,
//       startTime: new Date().toISOString(),
//       interviewSettings,
//       resumeData: resume,
//     }

//     const mcpSession = new MCPSession({
//       sessionId,
//       jobId,
//       resumeId,
//       contextState,
//     })

//     await mcpSession.save()

//     const voiceInterviewResult = {
//       sessionId,
//       jobId,
//       createdAt: new Date(),
//       interactions: [],
//       interviewSettings,
//       tabSwitchCount: 0,
//       submissionReason: "pending",
//     }

//     await Resume.updateOne(
//       { _id: resumeId },
//       { $push: { voiceInterviewResults: voiceInterviewResult } },
//       { upsert: true },
//     )

//     const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
//       job.markdown_description || job.context,
//       resume,
//       interviewSettings,
//     )

//     const initialInteraction = {
//       question: initialPrompt,
//       candidateResponse: "",
//       feedback: "",
//       timestamp: new Date(),
//     }

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       { $push: { "voiceInterviewResults.$.interactions": initialInteraction } },
//     )

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("interview_initialized", {
//         sessionId,
//         status: "initialized",
//       })
//     }

//     res.json({
//       sessionId,
//       jobDetails: {
//         title: job.context,
//         description: job.markdown_description,
//       },
//       candidateDetails: { name: resume.candidateName, email: resume.email },
//       maxQuestions: interviewSettings.maxQuestions || 5,
//       contextState,
//       initialPrompt,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Initialize interview error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }

// export const processResponse = async (req, res) => {
//   try {
//     const { sessionId, userMessage, contextState, questionCount } = req.body

//     if (!sessionId || !userMessage || !contextState || questionCount === undefined) {
//       return res.status(400).json({
//         error: "Missing required fields",
//         success: false,
//       })
//     }

//     console.log("Process request:", { sessionId, userMessage, questionCount })

//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000)
//     if (!session) {
//       return res.status(404).json({
//         error: "Session not found",
//         success: false,
//       })
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(10000),
//       Resume.findById(session.resumeId).maxTimeMS(10000),
//     ])

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5

//     const responseData = await FastAIInterviewService.generateNextQuestion(
//       userMessage,
//       contextState,
//       job.markdown_description || job.context || "",
//       questionCount,
//       maxQuestions,
//       contextState.interviewSettings || {},
//       resume,
//     )

//     const {
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       technical_question,
//       question_metadata,
//     } = responseData

//     // Update the session context state
//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } })

//     // Update the candidate response and feedback for the current interaction
//     await Resume.updateOne(
//       { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage,
//           "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
//         },
//       },
//       { arrayFilters: [{ "elem.candidateResponse": "" }] },
//     )

//     // Add new interaction if it's a question and not the end of the interview
//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: technical_question || false,
//         question_metadata: question_metadata || null,
//       }

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
//       )
//     }

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("question_processed", {
//         sessionId,
//         questionCount,
//         technical_question: technical_question || false,
//       })
//     }

//     res.json({
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       technical_question: technical_question || false,
//       question_metadata: question_metadata || null,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Process response error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }

// export const submitInterview = async (req, res) => {
//   try {
//     const {
//       sessionId,
//       jobId,
//       resumeId,
//       userId,
//       email,
//       interviewTranscript,
//       finalContextState,
//       tabSwitchCount = 0,
//       submissionReason = "normal_completion",
//       isDisqualified = false,
//     } = req.body

//     if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//       return res.status(400).json({
//         error: "All required fields must be provided",
//         success: false,
//       })
//     }

//     const session = await MCPSession.findOne({ sessionId })
//     const job = await JobDescription.findById(jobId)
//     const resume = await Resume.findById(resumeId)

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const transcriptText = interviewTranscript
//       .map(
//         (msg) =>
//           `${msg.type === "user" ? "Candidate" : msg.type === "system" ? "System" : "Interviewer"}: ${msg.content}`,
//       )
//       .join("\n")

//     const submissionData = {
//       tabSwitchCount,
//       submissionReason,
//       isDisqualified,
//     }

//     const evaluation = await FastAIInterviewService.evaluateInterview(
//       transcriptText,
//       job.markdown_description || job.context,
//       finalContextState,
//       submissionData,
//     )

//     // Override evaluation for disqualified candidates
//     if (isDisqualified) {
//       evaluation.score = 1
//       evaluation.recommendation = "Do Not Recommend - Disqualified"
//       evaluation.summary =
//         "Candidate was disqualified due to tab switching during the interview, violating interview integrity policy."
//       evaluation.disqualification_reason = "Tab switching detected during interview"
//     }

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.createdAt": new Date(),
//           "voiceInterviewResults.$.score": evaluation.score,
//           "voiceInterviewResults.$.recommendation": evaluation.recommendation,
//           "voiceInterviewResults.$.evaluation": JSON.stringify(evaluation),
//           "voiceInterviewResults.$.tabSwitchCount": tabSwitchCount,
//           "voiceInterviewResults.$.submissionReason": submissionReason,
//           "voiceInterviewResults.$.isDisqualified": isDisqualified,
//         },
//       },
//     )

//     if (session) {
//       await MCPSession.deleteOne({ sessionId })
//     }

//     // Send email notification
//     if (resume.email && EMAIL_USER && EMAIL_PASS) {
//       try {
//         const subject = isDisqualified ? "Interview Disqualification Notice" : "Voice Interview Completion"

//         const emailContent = isDisqualified
//           ? `Dear ${resume.candidateName || "Candidate"},\n\nWe regret to inform you that you have been disqualified from the interview for ${job.context} due to tab switching during the session, which violates our interview integrity policy.\n\nYour session has been terminated and submitted for review.\n\nBest regards,\nAI Interview Team`
//           : `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.${tabSwitchCount > 0 ? `\n\nNote: ${tabSwitchCount} tab switch${tabSwitchCount > 1 ? "es were" : " was"} detected during the interview.` : ""}\n\nBest regards,\nAI Interview Team`

//         const mailOptions = {
//           from: EMAIL_USER,
//           to: resume.email,
//           subject: subject,
//           text: emailContent,
//         }
//         await transporter.sendMail(mailOptions)
//       } catch (emailError) {
//         console.error("Email sending failed:", emailError.message)
//       }
//     }

//     // Create notification
//     if (userId) {
//       const notificationMessage = isDisqualified
//         ? `${resume?.candidateName || "Candidate"} DISQUALIFIED - Tab switching detected during interview`
//         : tabSwitchCount > 0
//           ? `${resume?.candidateName || "Candidate"} Voice Interview Completed (${tabSwitchCount} tab switches detected)`
//           : `${resume?.candidateName || "Candidate"} Voice Interview Completed`

//       const newNotification = new Notification({
//         message: notificationMessage,
//         recipientId: userId,
//         resumeId,
//       })
//       await newNotification.save()
//     }

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("interview_completed", {
//         sessionId,
//         evaluation,
//         status: isDisqualified ? "disqualified" : "completed",
//         tabSwitchCount,
//         submissionReason,
//         isDisqualified,
//       })
//     }

//     res.json({
//       message: isDisqualified ? "Interview terminated due to policy violation" : "Interview submitted successfully",
//       evaluation,
//       tabSwitchCount,
//       submissionReason,
//       isDisqualified,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Submit interview error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }


// -----------------my be working ----------------------
// "use client"

// import { randomUUID } from "crypto"
// import nodemailer from "nodemailer"
// import { OpenAI } from "openai"
// import Resume from "../../model/resumeModel.js"
// import MCPSession from "../../model/mcpSessionModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Notification from "../../model/NotificationModal.js"

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY
// const EMAIL_USER = process.env.EMAIL_USER
// const EMAIL_PASS = process.env.EMAIL_PASS

// // Initialize services
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: EMAIL_USER,
//     pass: EMAIL_PASS,
//   },
// })

// // AI Interview Service
// class FastAIInterviewService {
//   static detectTechnicalRole(jobDescription) {
//     const technicalKeywords = [
//       "software",
//       "developer",
//       "engineer",
//       "programming",
//       "coding",
//       "technical",
//       "architect",
//       "qa",
//       "testing",
//       "devops",
//       "data",
//       "machine learning",
//       "ai",
//       "blockchain",
//       "cloud",
//       "security",
//       "mobile",
//       "web",
//       "api",
//       "database",
//       "system",
//       "network",
//       "infrastructure",
//       "automation",
//       "javascript",
//       "python",
//       "java",
//       "react",
//       "node",
//       "frontend",
//       "backend",
//       "fullstack",
//       "angular",
//       "vue",
//       "typescript",
//       "mongodb",
//       "sql",
//       "nosql",
//       "aws",
//       "docker",
//     ]
//     const description = jobDescription.toLowerCase()
//     return technicalKeywords.some((keyword) => description.includes(keyword))
//   }

//   static detectProgrammingLanguage(jobDescription) {
//     const languages = {
//       javascript: ["javascript", "js", "react", "node", "vue", "angular", "typescript", "express", "nextjs"],
//       python: ["python", "django", "flask", "pandas", "numpy", "fastapi", "pytorch", "tensorflow"],
//       java: ["java", "spring", "hibernate", "maven", "gradle"],
//       csharp: ["c#", "csharp", ".net", "asp.net", "blazor"],
//       php: ["php", "laravel", "symfony", "wordpress"],
//       ruby: ["ruby", "rails", "sinatra"],
//       go: ["golang", "go", "gin", "fiber"],
//       rust: ["rust", "actix", "rocket"],
//       cpp: ["c++", "cpp", "qt"],
//       sql: ["sql", "mysql", "postgresql", "database", "mongodb", "redis"],
//     }
//     const description = jobDescription.toLowerCase()
//     for (const [lang, keywords] of Object.entries(languages)) {
//       if (keywords.some((keyword) => description.includes(keyword))) {
//         return lang
//       }
//     }
//     return "javascript"
//   }

//   static generateAdvancedCodeSnippet(language, questionType, difficulty) {
//     const advancedSnippets = {
//       javascript: {
//         intermediate: {
//           debugging: `// React Hook Issue - What's wrong here?
// function useCounter(initialValue = 0) {
//   const [count, setCount] = useState(initialValue);
  
//   const increment = () => {
//     setCount(count + 1);
//     setCount(count + 1); // Double increment?
//   };
  
//   const reset = useCallback(() => {
//     setCount(initialValue);
//   }, []);
  
//   return { count, increment, reset };
// }`,
//           coding: `// Implement a custom React hook for debounced search
// function useDebounce(value, delay) {
//   // Your implementation here
//   // Should return debounced value
// }

// // Usage example:
// function SearchComponent() {
//   const [searchTerm, setSearchTerm] = useState('');
//   const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
//   // Effect for API call should go here
// }`,
//           system_design: `// Design a React Context for theme management
// const ThemeContext = createContext();

// export function ThemeProvider({ children }) {
//   // Implement theme state management
//   // Support: light/dark modes, custom colors
//   // Persist theme preference
// }

// export function useTheme() {
//   // Return theme utilities
// }`,
//         },
//         advanced: {
//           coding: `// Implement a React hook for infinite scrolling
// function useInfiniteScroll(fetchMore, hasMore) {
//   // Your implementation here
//   // Should handle:
//   // - Intersection Observer
//   // - Loading states
//   // - Error handling
//   // - Cleanup
// }

// // Usage:
// function PostsList() {
//   const { data, loading, error } = useInfiniteScroll(
//     fetchPosts, 
//     hasMorePosts
//   );
// }`,
//           performance: `// Optimize this React component
// function ExpensiveList({ items, onItemClick }) {
//   return (
//     <div>
//       {items.map(item => (
//         <div key={item.id} onClick={() => onItemClick(item)}>
//           <ExpensiveComponent data={item} />
//           {item.children?.map(child => (
//             <NestedComponent key={child.id} data={child} />
//           ))}
//         </div>
//       ))}
//     </div>
//   );
// }`,
//         },
//       },
//       python: {
//         intermediate: {
//           debugging: `# What's wrong with this async code?
// import asyncio
// import aiohttp

// async def fetch_data(urls):
//     results = []
//     for url in urls:
//         async with aiohttp.ClientSession() as session:
//             async with session.get(url) as response:
//                 data = await response.json()
//                 results.append(data)
//     return results

// # How would you optimize this?`,
//           coding: `# Implement a decorator for caching function results
// def memoize(func):
//     # Your implementation here
//     # Should handle:
//     # - Different argument types
//     # - Cache size limits
//     # - TTL (time to live)
//     pass

// @memoize
// def expensive_calculation(n):
//     # Simulate expensive operation
//     return sum(i**2 for i in range(n))`,
//         },
//         advanced: {
//           system_design: `# Design a distributed task queue system
// class TaskQueue:
//     def __init__(self, redis_url, workers=4):
//         # Initialize Redis connection
//         # Set up worker processes
//         pass
    
//     def enqueue(self, task_func, *args, **kwargs):
//         # Add task to queue with priority
//         pass
    
//     def process_tasks(self):
//         # Worker process implementation
//         # Handle failures, retries, dead letter queue
//         pass`,
//         },
//       },
//     }

//     const langSnippets = advancedSnippets[language] || advancedSnippets.javascript
//     const difficultySnippets = langSnippets[difficulty] || langSnippets.intermediate
//     const typeSnippets = difficultySnippets[questionType] || Object.values(difficultySnippets)[0]
//     return typeSnippets || `// Advanced ${language} ${questionType} challenge`
//   }

//   static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
//     const detectedLanguage = this.detectProgrammingLanguage(jobDescription)
//     const difficulty = questionNumber <= 2 ? "intermediate" : "advanced"

//     const prompt = `You are a senior technical interviewer. Generate a challenging technical question that tests real-world problem-solving skills.

// Job Description: ${jobDescription}
// Candidate: ${resumeData.candidateName} - ${resumeData.skills || "General technical background"}
// Previous Questions: ${previousQuestions.join("; ")}
// Question #${questionNumber} - Difficulty: ${difficulty}
// Primary Language: ${detectedLanguage}

// Create a question that:
// 1. Tests practical, real-world scenarios (not basic syntax)
// 2. Requires problem-solving and critical thinking
// 3. Includes a code snippet with subtle issues or optimization opportunities
// 4. Is appropriate for a ${difficulty} level developer
// 5. Focuses on: performance, scalability, best practices, or architecture

// Return JSON:
// {
//   "question_text": "Challenging question without code (what to analyze/implement)",
//   "code_snippet": "Complex, realistic code example with issues or optimization needs",
//   "language": "${detectedLanguage}",
//   "expected_topics": ["specific technical concepts"],
//   "difficulty": "${difficulty}",
//   "question_type": "debugging|optimization|architecture|implementation",
//   "follow_up_questions": ["What would you improve?", "How would you scale this?"]
// }

// Make the code snippet realistic and challenging - not basic examples.`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.9,
//         max_tokens: 800,
//       })

//       const content = response.choices[0].message.content.trim()

//       // Replace the existing JSON parsing section with this improved version
//       try {
//         // Clean the response to handle markdown code blocks
//         let cleanContent = content.trim()

//         // Remove markdown code block markers if present
//         if (cleanContent.startsWith("```json")) {
//           cleanContent = cleanContent.replace(/^```json\s*/, "").replace(/\s*```$/, "")
//         } else if (cleanContent.startsWith("```")) {
//           cleanContent = cleanContent.replace(/^```\s*/, "").replace(/\s*```$/, "")
//         }

//         const technicalQuestion = JSON.parse(cleanContent)
//         if (!technicalQuestion.question_text) {
//           throw new Error("Invalid question format")
//         }

//         let codeSnippet = technicalQuestion.code_snippet || ""
//         if (!codeSnippet.trim()) {
//           const questionType = technicalQuestion.question_type || "coding"
//           codeSnippet = this.generateAdvancedCodeSnippet(detectedLanguage, questionType, difficulty)
//         }

//         // Create shorter spoken version for better UX
//         const spokenText =
//           technicalQuestion.question_text.length > 150
//             ? technicalQuestion.question_text.substring(0, 150) + "... Please analyze the code shown on screen."
//             : technicalQuestion.question_text

//         return {
//           question_text: technicalQuestion.question_text,
//           code_snippet: codeSnippet,
//           language: technicalQuestion.language || detectedLanguage,
//           expected_topics: technicalQuestion.expected_topics || [],
//           difficulty: difficulty,
//           question_type: technicalQuestion.question_type || "coding",
//           follow_up_questions: technicalQuestion.follow_up_questions || [],
//           spoken_text: spokenText, // Add shorter version for speech
//         }
//       } catch (parseError) {
//         console.error("Parse error in technical question:", parseError.message)
//         // Continue with fallback without showing error to user
//       }

//       const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "debugging", difficulty)
//       return {
//         question_text:
//           "Analyze this code for potential issues, performance problems, and suggest improvements. What would you change and why?",
//         code_snippet: fallbackCode,
//         language: detectedLanguage,
//         expected_topics: ["code-review", "performance", "best-practices", "architecture"],
//         difficulty: difficulty,
//         question_type: "debugging",
//         follow_up_questions: ["How would you test this?", "What about scalability?"],
//       }
//     } catch (error) {
//       console.error("Error generating technical question:", error.message)
//       const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "coding", difficulty)
//       return {
//         question_text:
//           "Review this code implementation. What are the potential issues and how would you improve it for production use?",
//         code_snippet: fallbackCode,
//         language: detectedLanguage,
//         expected_topics: ["problem-solving", "production-readiness"],
//         difficulty: difficulty,
//         question_type: "coding",
//         follow_up_questions: ["What about error handling?", "How would you monitor this?"],
//       }
//     }
//   }

//   static async generateInitialPrompt(jobDescription, resumeData, interviewSettings = {}) {
//     const focusAreasText =
//       interviewSettings.focusAreas?.length > 0
//         ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
//         : ""
//     const styleText = interviewSettings.interviewStyle
//       ? `Use a ${interviewSettings.interviewStyle} interview style. `
//       : ""

//     const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute voice interview.
// ${styleText}${focusAreasText}
// Create a warm, professional greeting with the first question for ${resumeData.candidateName}.
// Job: ${jobDescription}
// Keep it concise and natural. Start with a general introduction question.`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.7,
//         max_tokens: 150,
//       })
//       return response.choices[0].message.content
//     } catch (error) {
//       return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`
//     }
//   }

//   static async generateNextQuestion(
//     userResponse,
//     contextState,
//     jobDescription,
//     questionCount,
//     maxQuestions,
//     interviewSettings = {},
//     resumeData = {},
//   ) {
//     const questionsAsked = contextState.questionsAsked || []
//     const currentIndex = contextState.currentQuestionIndex || 0

//     if (questionCount >= maxQuestions) {
//       return {
//         response:
//           "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
//         feedback: "Thank you for participating in the interview.",
//         is_question: false,
//         should_end_interview: true,
//         updated_context_state: {
//           ...contextState,
//           questionsAsked: [...questionsAsked, "Interview concluded"],
//           currentQuestionIndex: currentIndex,
//           interviewSettings: contextState.interviewSettings || interviewSettings,
//         },
//       }
//     }

//     const isTechnicalRole = this.detectTechnicalRole(jobDescription)
//     let shouldAskTechnical = isTechnicalRole && (questionCount === 2 || questionCount === 4)
//     let nextQuestion

//     if (shouldAskTechnical) {
//       try {
//         const technicalQuestion = await this.generateTechnicalQuestion(
//           jobDescription,
//           resumeData,
//           questionsAsked,
//           questionCount,
//         )

//         let fullQuestionText = technicalQuestion.question_text
//         if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
//           fullQuestionText += " Please analyze the code I've shared and walk me through your thought process."
//         }

//         nextQuestion = {
//           response: fullQuestionText,
//           feedback: `Excellent! Now let's dive into a technical challenge.`,
//           is_question: true,
//           should_end_interview: false,
//           technical_question: true,
//           question_metadata: {
//             ...technicalQuestion,
//             spoken_text: technicalQuestion.spoken_text,
//             display_text: fullQuestionText,
//           },
//         }
//       } catch (error) {
//         console.error("Error generating technical question:", error.message)
//         shouldAskTechnical = false
//       }
//     }

//     if (!shouldAskTechnical) {
//       const prompt = `AI Interviewer. Generate the next question based on the candidate's response: "${userResponse}"

// Previous questions: ${questionsAsked.slice(-2).join(", ")}
// Job description: ${jobDescription}
// Question ${questionCount} of ${maxQuestions}

// Return a JSON object:
// {
//   "response": "question text",
//   "feedback": "brief positive feedback",
//   "is_question": true,
//   "should_end_interview": false
// }`

//       try {
//         const response = await openai.chat.completions.create({
//           model: "gpt-4o-mini",
//           messages: [{ role: "system", content: prompt }],
//           temperature: 0.7,
//           max_tokens: 250,
//         })

//         const result = JSON.parse(response.choices[0].message.content)
//         nextQuestion = {
//           response: result.response,
//           feedback: result.feedback || "Thank you for your response.",
//           is_question: result.is_question,
//           should_end_interview: result.should_end_interview,
//         }
//       } catch (error) {
//         nextQuestion = {
//           response: "Can you share an example of how you've applied your skills to solve a problem in this field?",
//           feedback: "Thank you for sharing.",
//           is_question: true,
//           should_end_interview: false,
//         }
//       }
//     }

//     return {
//       ...nextQuestion,
//       updated_context_state: {
//         ...contextState,
//         questionsAsked: [...questionsAsked, nextQuestion.response],
//         currentQuestionIndex: nextQuestion.is_question ? currentIndex + 1 : currentIndex,
//         interviewSettings: contextState.interviewSettings || interviewSettings,
//       },
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
// }`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.3,
//         max_tokens: 400,
//       })
//       return JSON.parse(response.choices[0].message.content)
//     } catch (error) {
//       return {
//         score: 7,
//         strengths: ["Good communication", "Relevant experience", "Professional demeanor"],
//         areas_for_improvement: ["Could provide more specific examples"],
//         recommendation: "Consider",
//         summary: "Candidate showed good potential with room for growth.",
//       }
//     }
//   }
// }

// // Controller functions
// export const initializeInterview = async (req, res) => {
//   try {
//     const { jobId, resumeId, interviewSettings = {} } = req.body

//     if (!jobId || !resumeId || !interviewSettings) {
//       return res.status(400).json({
//         error: "Missing required fields: jobId, resumeId, or interviewSettings",
//         success: false,
//       })
//     }

//     console.log("Initialize request:", { jobId, resumeId, interviewSettings })

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(10000),
//       Resume.findById(resumeId).maxTimeMS(10000),
//     ])

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const sessionId = randomUUID()
//     const contextState = {
//       questionsAsked: [],
//       currentQuestionIndex: 0,
//       startTime: new Date().toISOString(),
//       interviewSettings,
//       resumeData: resume,
//     }

//     const mcpSession = new MCPSession({
//       sessionId,
//       jobId,
//       resumeId,
//       contextState,
//     })
//     await mcpSession.save()

//     const voiceInterviewResult = {
//       sessionId,
//       jobId,
//       createdAt: new Date(),
//       interactions: [],
//       interviewSettings,
//     }

//     await Resume.updateOne(
//       { _id: resumeId },
//       { $push: { voiceInterviewResults: voiceInterviewResult } },
//       { upsert: true },
//     )

//     const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
//       job.markdown_description || job.context,
//       resume,
//       interviewSettings,
//     )

//     const initialInteraction = {
//       question: initialPrompt,
//       candidateResponse: "",
//       feedback: "",
//       timestamp: new Date(),
//     }

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       { $push: { "voiceInterviewResults.$.interactions": initialInteraction } },
//     )

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("interview_initialized", {
//         sessionId,
//         status: "initialized",
//       })
//     }

//     res.json({
//       sessionId,
//       jobDetails: {
//         title: job.context,
//         description: job.markdown_description,
//       },
//       candidateDetails: { name: resume.candidateName, email: resume.email },
//       maxQuestions: interviewSettings.maxQuestions || 5,
//       contextState,
//       initialPrompt,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Initialize interview error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }

// export const processResponse = async (req, res) => {
//   try {
//     const { sessionId, userMessage, contextState, questionCount } = req.body

//     if (!sessionId || !userMessage || !contextState || questionCount === undefined) {
//       return res.status(400).json({
//         error: "Missing required fields",
//         success: false,
//       })
//     }

//     console.log("Process request:", { sessionId, userMessage, questionCount })

//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000)
//     if (!session) {
//       return res.status(404).json({
//         error: "Session not found",
//         success: false,
//       })
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(10000),
//       Resume.findById(session.resumeId).maxTimeMS(10000),
//     ])

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5
//     const responseData = await FastAIInterviewService.generateNextQuestion(
//       userMessage,
//       contextState,
//       job.markdown_description || job.context || "",
//       questionCount,
//       maxQuestions,
//       contextState.interviewSettings || {},
//       resume,
//     )

//     const {
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       technical_question,
//       question_metadata,
//     } = responseData

//     // Update the session context state
//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } })

//     // Update the candidate response and feedback for the current interaction
//     await Resume.updateOne(
//       { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage,
//           "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
//         },
//       },
//       { arrayFilters: [{ "elem.candidateResponse": "" }] },
//     )

//     // Add new interaction if it's a question and not the end of the interview
//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: technical_question || false,
//         question_metadata: question_metadata || null,
//       }

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
//       )
//     }

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("question_processed", {
//         sessionId,
//         questionCount,
//         technical_question: technical_question || false,
//       })
//     }

//     res.json({
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       technical_question: technical_question || false,
//       question_metadata: question_metadata || null,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Process response error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }

// export const submitInterview = async (req, res) => {
//   try {
//     const { sessionId, jobId, resumeId, userId, email, interviewTranscript, finalContextState } = req.body

//     if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//       return res.status(400).json({
//         error: "All required fields must be provided",
//         success: false,
//       })
//     }

//     const session = await MCPSession.findOne({ sessionId })
//     const job = await JobDescription.findById(jobId)
//     const resume = await Resume.findById(resumeId)

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const transcriptText = interviewTranscript
//       .map((msg) => `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`)
//       .join("\n")

//     const evaluation = await FastAIInterviewService.evaluateInterview(
//       transcriptText,
//       job.markdown_description || job.context,
//       finalContextState,
//     )

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.createdAt": new Date(),
//           "voiceInterviewResults.$.score": evaluation.score,
//           "voiceInterviewResults.$.recommendation": evaluation.recommendation,
//           "voiceInterviewResults.$.evaluation": JSON.stringify(evaluation),
//         },
//       },
//     )

//     if (session) {
//       await MCPSession.deleteOne({ sessionId })
//     }

//     // Send email notification
//     if (resume.email && EMAIL_USER && EMAIL_PASS) {
//       try {
//         const mailOptions = {
//           from: EMAIL_USER,
//           to: resume.email,
//           subject: "Voice Interview Completion",
//           text: `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
//         }
//         await transporter.sendMail(mailOptions)
//       } catch (emailError) {
//         console.error("Email sending failed:", emailError.message)
//       }
//     }

//     // Create notification
//     if (userId) {
//       const newNotification = new Notification({
//         message: `${resume?.candidateName || "Candidate"} Voice Interview Screened`,
//         recipientId: userId,
//         resumeId,
//       })
//       await newNotification.save()
//     }

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("interview_completed", {
//         sessionId,
//         evaluation,
//         status: "completed",
//       })
//     }

//     res.json({
//       message: "Interview submitted successfully",
//       evaluation,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Submit interview error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }


// ---------------------WORKING CODE ---------------------------
// import { randomUUID } from "crypto"
// import nodemailer from "nodemailer"
// import { OpenAI } from "openai"
// import Resume from "../../model/resumeModel.js"
// import MCPSession from "../../model/mcpSessionModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Notification from "../../model/NotificationModal.js"

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY
// const EMAIL_USER = process.env.EMAIL_USER
// const EMAIL_PASS = process.env.EMAIL_PASS

// // Initialize services
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: EMAIL_USER,
//     pass: EMAIL_PASS,
//   },
// })

// // AI Interview Service
// class FastAIInterviewService {
//   static detectTechnicalRole(jobDescription) {
//     const technicalKeywords = [
//       "software",
//       "developer",
//       "engineer",
//       "programming",
//       "coding",
//       "technical",
//       "architect",
//       "qa",
//       "testing",
//       "devops",
//       "data",
//       "machine learning",
//       "ai",
//       "blockchain",
//       "cloud",
//       "security",
//       "mobile",
//       "web",
//       "api",
//       "database",
//       "system",
//       "network",
//       "infrastructure",
//       "automation",
//       "javascript",
//       "python",
//       "java",
//       "react",
//       "node",
//       "frontend",
//       "backend",
//       "fullstack",
//       "angular",
//       "vue",
//       "typescript",
//       "mongodb",
//       "sql",
//       "nosql",
//       "aws",
//       "docker",
//     ]
//     const description = jobDescription.toLowerCase()
//     return technicalKeywords.some((keyword) => description.includes(keyword))
//   }

//   static detectProgrammingLanguage(jobDescription) {
//     const languages = {
//       javascript: ["javascript", "js", "react", "node", "vue", "angular", "typescript", "express", "nextjs"],
//       python: ["python", "django", "flask", "pandas", "numpy", "fastapi", "pytorch", "tensorflow"],
//       java: ["java", "spring", "hibernate", "maven", "gradle"],
//       csharp: ["c#", "csharp", ".net", "asp.net", "blazor"],
//       php: ["php", "laravel", "symfony", "wordpress"],
//       ruby: ["ruby", "rails", "sinatra"],
//       go: ["golang", "go", "gin", "fiber"],
//       rust: ["rust", "actix", "rocket"],
//       cpp: ["c++", "cpp", "qt"],
//       sql: ["sql", "mysql", "postgresql", "database", "mongodb", "redis"],
//     }
//     const description = jobDescription.toLowerCase()
//     for (const [lang, keywords] of Object.entries(languages)) {
//       if (keywords.some((keyword) => description.includes(keyword))) {
//         return lang
//       }
//     }
//     return "javascript"
//   }

//   static generateAdvancedCodeSnippet(language, questionType, difficulty) {
//     const advancedSnippets = {
//       javascript: {
//         intermediate: {
//           debugging: `// React Hook Issue - What's wrong here?
// function useCounter(initialValue = 0) {
//   const [count, setCount] = useState(initialValue);
  
//   const increment = () => {
//     setCount(count + 1);
//     setCount(count + 1); // Double increment?
//   };
  
//   const reset = useCallback(() => {
//     setCount(initialValue);
//   }, []);
  
//   return { count, increment, reset };
// }`,
//           coding: `// Implement a custom React hook for debounced search
// function useDebounce(value, delay) {
//   // Your implementation here
//   // Should return debounced value
// }

// // Usage example:
// function SearchComponent() {
//   const [searchTerm, setSearchTerm] = useState('');
//   const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
//   // Effect for API call should go here
// }`,
//           system_design: `// Design a React Context for theme management
// const ThemeContext = createContext();

// export function ThemeProvider({ children }) {
//   // Implement theme state management
//   // Support: light/dark modes, custom colors
//   // Persist theme preference
// }

// export function useTheme() {
//   // Return theme utilities
// }`,
//         },
//         advanced: {
//           coding: `// Implement a React hook for infinite scrolling
// function useInfiniteScroll(fetchMore, hasMore) {
//   // Your implementation here
//   // Should handle:
//   // - Intersection Observer
//   // - Loading states
//   // - Error handling
//   // - Cleanup
// }

// // Usage:
// function PostsList() {
//   const { data, loading, error } = useInfiniteScroll(
//     fetchPosts, 
//     hasMorePosts
//   );
// }`,
//           performance: `// Optimize this React component
// function ExpensiveList({ items, onItemClick }) {
//   return (
//     <div>
//       {items.map(item => (
//         <div key={item.id} onClick={() => onItemClick(item)}>
//           <ExpensiveComponent data={item} />
//           {item.children?.map(child => (
//             <NestedComponent key={child.id} data={child} />
//           ))}
//         </div>
//       ))}
//     </div>
//   );
// }`,
//         },
//       },
//       python: {
//         intermediate: {
//           debugging: `# What's wrong with this async code?
// import asyncio
// import aiohttp

// async def fetch_data(urls):
//     results = []
//     for url in urls:
//         async with aiohttp.ClientSession() as session:
//             async with session.get(url) as response:
//                 data = await response.json()
//                 results.append(data)
//     return results

// # How would you optimize this?`,
//           coding: `# Implement a decorator for caching function results
// def memoize(func):
//     # Your implementation here
//     # Should handle:
//     # - Different argument types
//     # - Cache size limits
//     # - TTL (time to live)
//     pass

// @memoize
// def expensive_calculation(n):
//     # Simulate expensive operation
//     return sum(i**2 for i in range(n))`,
//         },
//         advanced: {
//           system_design: `# Design a distributed task queue system
// class TaskQueue:
//     def __init__(self, redis_url, workers=4):
//         # Initialize Redis connection
//         # Set up worker processes
//         pass
    
//     def enqueue(self, task_func, *args, **kwargs):
//         # Add task to queue with priority
//         pass
    
//     def process_tasks(self):
//         # Worker process implementation
//         # Handle failures, retries, dead letter queue
//         pass`,
//         },
//       },
//     }

//     const langSnippets = advancedSnippets[language] || advancedSnippets.javascript
//     const difficultySnippets = langSnippets[difficulty] || langSnippets.intermediate
//     const typeSnippets = difficultySnippets[questionType] || Object.values(difficultySnippets)[0]
//     return typeSnippets || `// Advanced ${language} ${questionType} challenge`
//   }

//   static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
//     const detectedLanguage = this.detectProgrammingLanguage(jobDescription)
//     const difficulty = questionNumber <= 2 ? "intermediate" : "advanced"

//     const prompt = `You are a senior technical interviewer. Generate a challenging technical question that tests real-world problem-solving skills.

// Job Description: ${jobDescription}
// Candidate: ${resumeData.candidateName} - ${resumeData.skills || "General technical background"}
// Previous Questions: ${previousQuestions.join("; ")}
// Question #${questionNumber} - Difficulty: ${difficulty}
// Primary Language: ${detectedLanguage}

// Create a question that:
// 1. Tests practical, real-world scenarios (not basic syntax)
// 2. Requires problem-solving and critical thinking
// 3. Includes a code snippet with subtle issues or optimization opportunities
// 4. Is appropriate for a ${difficulty} level developer
// 5. Focuses on: performance, scalability, best practices, or architecture

// Return JSON:
// {
//   "question_text": "Challenging question without code (what to analyze/implement)",
//   "code_snippet": "Complex, realistic code example with issues or optimization needs",
//   "language": "${detectedLanguage}",
//   "expected_topics": ["specific technical concepts"],
//   "difficulty": "${difficulty}",
//   "question_type": "debugging|optimization|architecture|implementation",
//   "follow_up_questions": ["What would you improve?", "How would you scale this?"]
// }

// Make the code snippet realistic and challenging - not basic examples.`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.9,
//         max_tokens: 800,
//       })

//       const content = response.choices[0].message.content.trim()

//       try {
//         const technicalQuestion = JSON.parse(content)
//         if (!technicalQuestion.question_text) {
//           throw new Error("Invalid question format")
//         }

//         let codeSnippet = technicalQuestion.code_snippet || ""
//         if (!codeSnippet.trim()) {
//           const questionType = technicalQuestion.question_type || "coding"
//           codeSnippet = this.generateAdvancedCodeSnippet(detectedLanguage, questionType, difficulty)
//         }

//         return {
//           question_text: technicalQuestion.question_text,
//           code_snippet: codeSnippet,
//           language: technicalQuestion.language || detectedLanguage,
//           expected_topics: technicalQuestion.expected_topics || [],
//           difficulty: difficulty,
//           question_type: technicalQuestion.question_type || "coding",
//           follow_up_questions: technicalQuestion.follow_up_questions || [],
//         }
//       } catch (parseError) {
//         console.error("Parse error in technical question:", parseError.message)
//         const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "debugging", difficulty)
//         return {
//           question_text:
//             "Analyze this code for potential issues, performance problems, and suggest improvements. What would you change and why?",
//           code_snippet: fallbackCode,
//           language: detectedLanguage,
//           expected_topics: ["code-review", "performance", "best-practices", "architecture"],
//           difficulty: difficulty,
//           question_type: "debugging",
//           follow_up_questions: ["How would you test this?", "What about scalability?"],
//         }
//       }
//     } catch (error) {
//       console.error("Error generating technical question:", error.message)
//       const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "coding", difficulty)
//       return {
//         question_text:
//           "Review this code implementation. What are the potential issues and how would you improve it for production use?",
//         code_snippet: fallbackCode,
//         language: detectedLanguage,
//         expected_topics: ["problem-solving", "production-readiness"],
//         difficulty: difficulty,
//         question_type: "coding",
//         follow_up_questions: ["What about error handling?", "How would you monitor this?"],
//       }
//     }
//   }

//   static async generateInitialPrompt(jobDescription, resumeData, interviewSettings = {}) {
//     const focusAreasText =
//       interviewSettings.focusAreas?.length > 0
//         ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
//         : ""
//     const styleText = interviewSettings.interviewStyle
//       ? `Use a ${interviewSettings.interviewStyle} interview style. `
//       : ""

//     const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute voice interview.
// ${styleText}${focusAreasText}
// Create a warm, professional greeting with the first question for ${resumeData.candidateName}.
// Job: ${jobDescription}
// Keep it concise and natural. Start with a general introduction question.`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.7,
//         max_tokens: 150,
//       })
//       return response.choices[0].message.content
//     } catch (error) {
//       return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`
//     }
//   }

//   static async generateNextQuestion(
//     userResponse,
//     contextState,
//     jobDescription,
//     questionCount,
//     maxQuestions,
//     interviewSettings = {},
//     resumeData = {},
//   ) {
//     const questionsAsked = contextState.questionsAsked || []
//     const currentIndex = contextState.currentQuestionIndex || 0

//     if (questionCount >= maxQuestions) {
//       return {
//         response:
//           "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
//         feedback: "Thank you for participating in the interview.",
//         is_question: false,
//         should_end_interview: true,
//         updated_context_state: {
//           ...contextState,
//           questionsAsked: [...questionsAsked, "Interview concluded"],
//           currentQuestionIndex: currentIndex,
//           interviewSettings: contextState.interviewSettings || interviewSettings,
//         },
//       }
//     }

//     const isTechnicalRole = this.detectTechnicalRole(jobDescription)
//     let shouldAskTechnical = isTechnicalRole && (questionCount === 2 || questionCount === 4)
//     let nextQuestion

//     if (shouldAskTechnical) {
//       try {
//         const technicalQuestion = await this.generateTechnicalQuestion(
//           jobDescription,
//           resumeData,
//           questionsAsked,
//           questionCount,
//         )

//         let fullQuestionText = technicalQuestion.question_text
//         if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
//           fullQuestionText += " Please analyze the code I've shared and walk me through your thought process."
//         }

//         nextQuestion = {
//           response: fullQuestionText,
//           feedback: `Excellent! Now let's dive into a technical challenge.`,
//           is_question: true,
//           should_end_interview: false,
//           technical_question: true,
//           question_metadata: {
//             ...technicalQuestion,
//             spoken_text: technicalQuestion.question_text,
//             display_text: fullQuestionText,
//           },
//         }
//       } catch (error) {
//         console.error("Error generating technical question:", error.message)
//         shouldAskTechnical = false
//       }
//     }

//     if (!shouldAskTechnical) {
//       const prompt = `AI Interviewer. Generate the next question based on the candidate's response: "${userResponse}"

// Previous questions: ${questionsAsked.slice(-2).join(", ")}
// Job description: ${jobDescription}
// Question ${questionCount} of ${maxQuestions}

// Return a JSON object:
// {
//   "response": "question text",
//   "feedback": "brief positive feedback",
//   "is_question": true,
//   "should_end_interview": false
// }`

//       try {
//         const response = await openai.chat.completions.create({
//           model: "gpt-4o-mini",
//           messages: [{ role: "system", content: prompt }],
//           temperature: 0.7,
//           max_tokens: 250,
//         })

//         const result = JSON.parse(response.choices[0].message.content)
//         nextQuestion = {
//           response: result.response,
//           feedback: result.feedback || "Thank you for your response.",
//           is_question: result.is_question,
//           should_end_interview: result.should_end_interview,
//         }
//       } catch (error) {
//         nextQuestion = {
//           response: "Can you share an example of how you've applied your skills to solve a problem in this field?",
//           feedback: "Thank you for sharing.",
//           is_question: true,
//           should_end_interview: false,
//         }
//       }
//     }

//     return {
//       ...nextQuestion,
//       updated_context_state: {
//         ...contextState,
//         questionsAsked: [...questionsAsked, nextQuestion.response],
//         currentQuestionIndex: nextQuestion.is_question ? currentIndex + 1 : currentIndex,
//         interviewSettings: contextState.interviewSettings || interviewSettings,
//       },
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
// }`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.3,
//         max_tokens: 400,
//       })
//       return JSON.parse(response.choices[0].message.content)
//     } catch (error) {
//       return {
//         score: 7,
//         strengths: ["Good communication", "Relevant experience", "Professional demeanor"],
//         areas_for_improvement: ["Could provide more specific examples"],
//         recommendation: "Consider",
//         summary: "Candidate showed good potential with room for growth.",
//       }
//     }
//   }
// }

// // Controller functions
// export const initializeInterview = async (req, res) => {
//   try {
//     const { jobId, resumeId, interviewSettings = {} } = req.body

//     if (!jobId || !resumeId || !interviewSettings) {
//       return res.status(400).json({
//         error: "Missing required fields: jobId, resumeId, or interviewSettings",
//         success: false,
//       })
//     }

//     console.log("Initialize request:", { jobId, resumeId, interviewSettings })

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(10000),
//       Resume.findById(resumeId).maxTimeMS(10000),
//     ])

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const sessionId = randomUUID()
//     const contextState = {
//       questionsAsked: [],
//       currentQuestionIndex: 0,
//       startTime: new Date().toISOString(),
//       interviewSettings,
//       resumeData: resume,
//     }

//     const mcpSession = new MCPSession({
//       sessionId,
//       jobId,
//       resumeId,
//       contextState,
//     })
//     await mcpSession.save()

//     const voiceInterviewResult = {
//       sessionId,
//       jobId,
//       createdAt: new Date(),
//       interactions: [],
//       interviewSettings,
//     }

//     await Resume.updateOne(
//       { _id: resumeId },
//       { $push: { voiceInterviewResults: voiceInterviewResult } },
//       { upsert: true },
//     )

//     const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
//       job.markdown_description || job.context,
//       resume,
//       interviewSettings,
//     )

//     const initialInteraction = {
//       question: initialPrompt,
//       candidateResponse: "",
//       feedback: "",
//       timestamp: new Date(),
//     }

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       { $push: { "voiceInterviewResults.$.interactions": initialInteraction } },
//     )

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("interview_initialized", {
//         sessionId,
//         status: "initialized",
//       })
//     }

//     res.json({
//       sessionId,
//       jobDetails: {
//         title: job.context,
//         description: job.markdown_description,
//       },
//       candidateDetails: { name: resume.candidateName, email: resume.email },
//       maxQuestions: interviewSettings.maxQuestions || 5,
//       contextState,
//       initialPrompt,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Initialize interview error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }

// export const processResponse = async (req, res) => {
//   try {
//     const { sessionId, userMessage, contextState, questionCount } = req.body

//     if (!sessionId || !userMessage || !contextState || questionCount === undefined) {
//       return res.status(400).json({
//         error: "Missing required fields",
//         success: false,
//       })
//     }

//     console.log("Process request:", { sessionId, userMessage, questionCount })

//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000)
//     if (!session) {
//       return res.status(404).json({
//         error: "Session not found",
//         success: false,
//       })
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(10000),
//       Resume.findById(session.resumeId).maxTimeMS(10000),
//     ])

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5
//     const responseData = await FastAIInterviewService.generateNextQuestion(
//       userMessage,
//       contextState,
//       job.markdown_description || job.context || "",
//       questionCount,
//       maxQuestions,
//       contextState.interviewSettings || {},
//       resume,
//     )

//     const {
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       technical_question,
//       question_metadata,
//     } = responseData

//     // Update the session context state
//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } })

//     // Update the candidate response and feedback for the current interaction
//     await Resume.updateOne(
//       { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage,
//           "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
//         },
//       },
//       { arrayFilters: [{ "elem.candidateResponse": "" }] },
//     )

//     // Add new interaction if it's a question and not the end of the interview
//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: technical_question || false,
//         question_metadata: question_metadata || null,
//       }

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
//       )
//     }

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("question_processed", {
//         sessionId,
//         questionCount,
//         technical_question: technical_question || false,
//       })
//     }

//     res.json({
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       technical_question: technical_question || false,
//       question_metadata: question_metadata || null,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Process response error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }

// export const submitInterview = async (req, res) => {
//   try {
//     const { sessionId, jobId, resumeId, userId, email, interviewTranscript, finalContextState } = req.body

//     if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//       return res.status(400).json({
//         error: "All required fields must be provided",
//         success: false,
//       })
//     }

//     const session = await MCPSession.findOne({ sessionId })
//     const job = await JobDescription.findById(jobId)
//     const resume = await Resume.findById(resumeId)

//     if (!job || !resume) {
//       return res.status(404).json({
//         error: "Job or resume not found",
//         success: false,
//       })
//     }

//     const transcriptText = interviewTranscript
//       .map((msg) => `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`)
//       .join("\n")

//     const evaluation = await FastAIInterviewService.evaluateInterview(
//       transcriptText,
//       job.markdown_description || job.context,
//       finalContextState,
//     )

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.createdAt": new Date(),
//           "voiceInterviewResults.$.score": evaluation.score,
//           "voiceInterviewResults.$.recommendation": evaluation.recommendation,
//           "voiceInterviewResults.$.evaluation": JSON.stringify(evaluation),
//         },
//       },
//     )

//     if (session) {
//       await MCPSession.deleteOne({ sessionId })
//     }

//     // Send email notification
//     if (resume.email && EMAIL_USER && EMAIL_PASS) {
//       try {
//         const mailOptions = {
//           from: EMAIL_USER,
//           to: resume.email,
//           subject: "Voice Interview Completion",
//           text: `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
//         }
//         await transporter.sendMail(mailOptions)
//       } catch (emailError) {
//         console.error("Email sending failed:", emailError.message)
//       }
//     }

//     // Create notification
//     if (userId) {
//       const newNotification = new Notification({
//         message: `${resume?.candidateName || "Candidate"} Voice Interview Screened`,
//         recipientId: userId,
//         resumeId,
//       })
//       await newNotification.save()
//     }

//     // Emit to socket if available
//     if (req.io) {
//       req.io.emit("interview_completed", {
//         sessionId,
//         evaluation,
//         status: "completed",
//       })
//     }

//     res.json({
//       message: "Interview submitted successfully",
//       evaluation,
//       success: true,
//     })
//   } catch (error) {
//     console.error("Submit interview error:", error.message)
//     res.status(500).json({
//       error: error.message,
//       success: false,
//     })
//   }
// }

// ------------ OLD CODE ------------------------

// import { OpenAI } from "@langchain/openai"
// import dotenv from "dotenv"
// import Resume from "../../model/resumeModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import AIInterviewResult from "../../model/aiInterviewResultModel.js"
// import nodemailer from "nodemailer"
// import Notification from "../../model/NotificationModal.js"


// dotenv.config()

// // Initialize AI interview session
// export const initializeAIInterview = async (req, res) => {
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
//     const focusAreas = queryParams.focusAreas ? queryParams.focusAreas.split(",") : ["technical", "experience"]
//     const customInstructions = queryParams.customInstructions || ""

//     // Generate initial greeting and first question
//     const systemPrompt = `
//       You are an AI interviewer conducting a job interview using the Model Context Protocol (MCP). 
//       Your task is to interview a candidate for the following position and evaluate their fit.
      
//       Job Description: ${job.markdown_description}
      
//       Candidate Resume: ${JSON.stringify(resume)}
      
//       Interview Parameters:
//       - Maximum Questions: ${maxQuestions}
//       - Interview Duration: Approximately ${interviewDuration} minutes
//       - Interview Style: ${interviewStyle} (${interviewStyle === "conversational" ? "friendly and relaxed" : interviewStyle === "challenging" ? "probing and rigorous" : "professional but approachable"})
//       - Focus Areas: ${focusAreas.join(", ")}
//       ${customInstructions ? `- Custom Instructions: ${customInstructions}` : ""}
      
//       Guidelines:
//       1. Start with a brief, professional greeting introducing yourself as an AI interviewer.
//       2. Ask one question at a time and wait for the candidate's response.
//       3. Follow up with relevant questions based on the candidate's previous answers.
//       4. Focus on the specified areas while maintaining a natural conversation flow.
//       5. Adapt your questions based on the candidate's background and experience.
//       6. Avoid asking yes/no questions; prefer open-ended questions that reveal skills and experience.
//       7. Keep your responses concise and professional.
      
//       For your first response, provide:
//       1. A brief greeting introducing yourself
//       2. Your first interview question that's relevant to the job and candidate's background
//     `

//     const response = await model.call(systemPrompt)

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

//     // Return the interview initialization data
//     return res.status(200).json({
//       message: "AI Interview initialized successfully",
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
//       interviewDuration,
//       interviewStyle,
//       focusAreas,
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }

// // Process candidate response and generate next question
// export const aiInterviewResponse = async (req, res) => {
//   const { jobId, resumeId, userMessage, messageHistory, questionCount } = req.body

//   if (!jobId || !resumeId || !userMessage) {
//     return res.status(400).json({ message: "Missing required parameters" })
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

//     // Determine if this should be the last question
//     const isNearingEnd = questionCount >= maxQuestions - 1

//     // Format message history for the AI
//     const formattedHistory = messageHistory.map((msg) => ({
//       role: msg.role,
//       content: msg.content,
//     }))

//     // Create the system prompt
//     const systemPrompt = `
//       You are an AI interviewer conducting a job interview using the Model Context Protocol (MCP).
      
//       Job Description: ${job.markdown_description}
      
//       Candidate Resume: ${JSON.stringify(resume)}
      
//       Current question count: ${questionCount} out of maximum ${maxQuestions} questions.
      
//       Guidelines:
//       1. Analyze the candidate's response and formulate a relevant follow-up question.
//       2. Make your questions specific to the candidate's background and previous answers.
//       3. Ensure questions are open-ended and reveal skills, experience, and problem-solving abilities.
//       4. Keep your response concise and focused on the next question.
//       5. Do not summarize or evaluate the candidate's answers yet.
//       ${isNearingEnd ? "6. This is nearing the end of the interview. If appropriate, ask a concluding question." : ""}
      
//       The candidate just responded: "${userMessage}"
      
//       Provide your next question or concluding remark.
//     `

//     // Generate AI response
//     const aiResponse = await model.call(systemPrompt)

//     // Determine if this is a question or a closing statement
//     const isQuestion = aiResponse.includes("?") || questionCount < maxQuestions - 1

//     // If this is the final question, prepare a closing message
//     let closingMessage = null
//     if (questionCount >= maxQuestions - 1) {
//       closingMessage =
//         "Thank you for participating in this interview. Your responses have been recorded and will be reviewed by the hiring team. We'll be in touch soon with next steps."
//     }

//     // Return the AI response
//     return res.status(200).json({
//       response: aiResponse,
//       isQuestion,
//       shouldEndInterview: questionCount >= maxQuestions,
//       closingMessage,
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }

// // Submit completed interview
// export const submitAIInterview = async (req, res) => {
//   const { jobId, resumeId, userId, email, interviewTranscript } = req.body

//   if (!jobId || !resumeId || !interviewTranscript) {
//     return res.status(400).json({ message: "Missing required parameters" })
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

//     // Create AI model instance for evaluation
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     // Format transcript for evaluation
//     const formattedTranscript = interviewTranscript
//       .map((msg, index) => `${msg.type === "agent" ? "Interviewer" : "Candidate"}: ${msg.content}`)
//       .join("\n\n")

//     // Generate evaluation
//     const evaluationPrompt = `
//       You are an expert HR evaluator. Review this job interview transcript and provide:
      
//       1. An overall score out of 10
//       2. A brief summary of strengths (2-3 bullet points)
//       3. A brief summary of areas for improvement (1-2 bullet points)
//       4. A recommendation (Strongly Recommend / Recommend / Consider / Do Not Recommend)
      
//       Job Description: ${job.markdown_description}
      
//       Interview Transcript:
//       ${formattedTranscript}
      
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
//       transcript: interviewTranscript,
//       evaluation,
//       score,
//       recommendation,
//     })

//     await aiInterviewResult.save()

//     // Update resume status
//     if (resume) {
//       resume.aiInterviewResults = resume.aiInterviewResults || []
//       resume.aiInterviewResults.push({
//         interviewId: aiInterviewResult._id,
//         score,
//         recommendation,
//       })

//       // Update candidate status
//       resume.candidateStatus = "AI Interview Completed"
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
//         subject: `AI Interview Completed: ${resume.candidateName} for ${job.context}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//             <h2 style="text-align: center; color: #4CAF50;">AI Interview Completed</h2>
//             <p>Dear Hiring Manager,</p>
//             <p>An AI interview has been completed by a candidate for the ${job.context} position. Below are the details:</p>
//             <p><strong>Interview Details:</strong></p>
//             <ul>
//               <li><strong>Job Title:</strong> ${job.context}</li>
//               <li><strong>Candidate Name:</strong> ${resume.candidateName}</li>
//               <li><strong>Overall Score:</strong> ${score}/10</li>
//               <li><strong>Recommendation:</strong> ${recommendation}</li>
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
//         message: `${resume?.candidateName} AI Interview Completed`,
//         recipientId: userId,
//         resumeId: resumeId,
//       })

//       await newNotification.save()

//       // Emit the new notification event
//       io.emit("newNotification", newNotification)
//     }

//     return res.status(200).json({
//       message: "Interview submitted and evaluated successfully!",
//       score,
//       recommendation,
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }

// // Send AI interview links to candidates
// export const sendAIInterviewLink = async (req, res) => {
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
//         subject: `AI Interview Invitation: ${jobTitle} at ${company}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//             <h2 style="text-align: center; color: #4CAF50;">AI Interview Invitation</h2>
//             <p>Dear ${resume.candidateName},</p>
//             <p>Thank you for your interest in the ${jobTitle} position at ${company}.</p>
//             <p>As part of our selection process, we'd like to invite you to participate in an AI-powered interview. This innovative approach allows you to showcase your skills and experience through a conversation with our AI interviewer.</p>
//             <p><strong>Interview Details:</strong></p>
//             <ul>
//               <li><strong>Format:</strong> Conversational AI Interview</li>
//               <li><strong>Duration:</strong> Approximately ${interviewSettings?.interviewDuration || 15} minutes</li>
//               <li><strong>Questions:</strong> ${interviewSettings?.maxQuestions || 8} questions related to your experience and the role</li>
//             </ul>
//             <p><strong>Instructions:</strong></p>
//             <ol>
//               <li>Click the link below to start your interview</li>
//               <li>Ensure you're in a quiet environment with a stable internet connection</li>
//               <li>Answer each question thoughtfully and completely</li>
//               <li>The AI will ask follow-up questions based on your responses</li>
//             </ol>
//             <p style="text-align: center; margin: 30px 0;">
//               <a href="${personalizedLink}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Start Your AI Interview</a>
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
//     await Resume.updateMany({ _id: { $in: resumeIds } }, { $set: { candidateStatus: "AI Interview Scheduled" } })

//     return res.status(200).json({
//       message: `AI Interview links sent to ${successCount} out of ${resumeIds.length} candidates`,
//       results,
//     })
//   } catch (error) {
//     console.log("Error ->", error.message)
//     return res.status(500).json({ error: error.message })
//   }
// }
