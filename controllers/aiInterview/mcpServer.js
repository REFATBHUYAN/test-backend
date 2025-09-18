import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { OpenAI } from "openai";
import mongoose from "mongoose";
import Resume from "../../model/resumeModel.js";
import MCPSession from "../../model/mcpSessionModel.js";
import JobDescription from "../../model/JobDescriptionModel.js";
import Notification from "../../model/NotificationModal.js";
import connectDB from "../../db/index.js";

// Environment configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const MONGODB_URI = process.env.MONGODB_URI;

// Initialize services
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Logging utility that doesn't interfere with JSON communication
function logToStderr(message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = data 
    ? `[${timestamp}] MCP Server: ${message} - ${JSON.stringify(data)}`
    : `[${timestamp}] MCP Server: ${message}`;
  process.stderr.write(logMessage + '\n');
}

// AI Interview Service
class FastAIInterviewService {
  static detectTechnicalRole(jobDescription) {
    const technicalKeywords = [
      "software", "developer", "engineer", "programming", "coding", "technical", "architect",
      "qa", "testing", "devops", "data", "machine learning", "ai", "blockchain", "cloud",
      "security", "mobile", "web", "api", "database", "system", "network", "infrastructure",
      "automation", "javascript", "python", "java", "react", "node", "frontend", "backend",
      "fullstack", "angular", "vue", "typescript", "mongodb", "sql", "nosql", "aws", "docker",
    ];
    const description = jobDescription.toLowerCase();
    return technicalKeywords.some((keyword) => description.includes(keyword));
  }

  static detectProgrammingLanguage(jobDescription) {
    const languages = {
      javascript: ["javascript", "js", "react", "node", "vue", "angular", "typescript", "express", "nextjs"],
      python: ["python", "django", "flask", "pandas", "numpy", "fastapi", "pytorch", "tensorflow"],
      java: ["java", "spring", "hibernate", "maven", "gradle"],
      csharp: ["c#", "csharp", ".net", "asp.net", "blazor"],
      php: ["php", "laravel", "symfony", "wordpress"],
      ruby: ["ruby", "rails", "sinatra"],
      go: ["golang", "go", "gin", "fiber"],
      rust: ["rust", "actix", "rocket"],
      cpp: ["c++", "cpp", "qt"],
      sql: ["sql", "mysql", "postgresql", "database", "mongodb", "redis"],
    };
    const description = jobDescription.toLowerCase();
    for (const [lang, keywords] of Object.entries(languages)) {
      if (keywords.some((keyword) => description.includes(keyword))) {
        return lang;
      }
    }
    return "javascript";
  }

  static generateAdvancedCodeSnippet(language, questionType, difficulty) {
    const advancedSnippets = {
      javascript: {
        intermediate: {
          debugging: `// React Hook Issue - What's wrong here?
function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);
  
  const increment = () => {
    setCount(count + 1);
    setCount(count + 1); // Double increment?
  };
  
  const reset = useCallback(() => {
    setCount(initialValue);
  }, []);
  
  return { count, increment, reset };
}`,

          coding: `// Implement a custom React hook for debounced search
function useDebounce(value, delay) {
  // Your implementation here
  // Should return debounced value
}

// Usage example:
function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  
  // Effect for API call should go here
}`,

          system_design: `// Design a React Context for theme management
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Implement theme state management
  // Support: light/dark modes, custom colors
  // Persist theme preference
}

export function useTheme() {
  // Return theme utilities
}`,
        },
        advanced: {
          coding: `// Implement a React hook for infinite scrolling
function useInfiniteScroll(fetchMore, hasMore) {
  // Your implementation here
  // Should handle:
  // - Intersection Observer
  // - Loading states
  // - Error handling
  // - Cleanup
}

// Usage:
function PostsList() {
  const { data, loading, error } = useInfiniteScroll(
    fetchPosts, 
    hasMorePosts
  );
}`,

          performance: `// Optimize this React component
function ExpensiveList({ items, onItemClick }) {
  return (
    <div>
      {items.map(item => (
        <div key={item.id} onClick={() => onItemClick(item)}>
          <ExpensiveComponent data={item} />
          {item.children?.map(child => (
            <NestedComponent key={child.id} data={child} />
          ))}
        </div>
      ))}
    </div>
  );
}`,
        },
      },
      python: {
        intermediate: {
          debugging: `# What's wrong with this async code?
import asyncio
import aiohttp

async def fetch_data(urls):
    results = []
    for url in urls:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                data = await response.json()
                results.append(data)
    return results

# How would you optimize this?`,

          coding: `# Implement a decorator for caching function results
def memoize(func):
    # Your implementation here
    # Should handle:
    # - Different argument types
    # - Cache size limits
    # - TTL (time to live)
    pass

@memoize
def expensive_calculation(n):
    # Simulate expensive operation
    return sum(i**2 for i in range(n))`,
        },
        advanced: {
          system_design: `# Design a distributed task queue system
class TaskQueue:
    def __init__(self, redis_url, workers=4):
        # Initialize Redis connection
        # Set up worker processes
        pass
    
    def enqueue(self, task_func, *args, **kwargs):
        # Add task to queue with priority
        pass
    
    def process_tasks(self):
        # Worker process implementation
        # Handle failures, retries, dead letter queue
        pass`,
        },
      },
    };
    const langSnippets = advancedSnippets[language] || advancedSnippets.javascript;
    const difficultySnippets = langSnippets[difficulty] || langSnippets.intermediate;
    const typeSnippets = difficultySnippets[questionType] || Object.values(difficultySnippets)[0];
    return typeSnippets || `// Advanced ${language} ${questionType} challenge`;
  }

  static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
    const detectedLanguage = this.detectProgrammingLanguage(jobDescription);
    const difficulty = questionNumber <= 2 ? "intermediate" : "advanced";

    const prompt = `You are a senior technical interviewer. Generate a challenging technical question that tests real-world problem-solving skills.

Job Description: ${jobDescription}
Candidate: ${resumeData.candidateName} - ${resumeData.skills || "General technical background"}
Previous Questions: ${previousQuestions.join("; ")}
Question #${questionNumber} - Difficulty: ${difficulty}
Primary Language: ${detectedLanguage}

Create a question that:
1. Tests practical, real-world scenarios (not basic syntax)
2. Requires problem-solving and critical thinking
3. Includes a code snippet with subtle issues or optimization opportunities
4. Is appropriate for a ${difficulty} level developer
5. Focuses on: performance, scalability, best practices, or architecture

Return JSON:
{
  "question_text": "Challenging question without code (what to analyze/implement)",
  "code_snippet": "Complex, realistic code example with issues or optimization needs",
  "language": "${detectedLanguage}",
  "expected_topics": ["specific technical concepts"],
  "difficulty": "${difficulty}",
  "question_type": "debugging|optimization|architecture|implementation",
  "follow_up_questions": ["What would you improve?", "How would you scale this?"]
}

Make the code snippet realistic and challenging - not basic examples.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.9,
        max_tokens: 800,
      });

      const content = response.choices[0].message.content.trim();

      try {
        const technicalQuestion = JSON.parse(content);
        if (!technicalQuestion.question_text) {
          throw new Error("Invalid question format");
        }
        let codeSnippet = technicalQuestion.code_snippet || "";
        if (!codeSnippet.trim()) {
          const questionType = technicalQuestion.question_type || "coding";
          codeSnippet = this.generateAdvancedCodeSnippet(detectedLanguage, questionType, difficulty);
        }
        return {
          question_text: technicalQuestion.question_text,
          code_snippet: codeSnippet,
          language: technicalQuestion.language || detectedLanguage,
          expected_topics: technicalQuestion.expected_topics || [],
          difficulty: difficulty,
          question_type: technicalQuestion.question_type || "coding",
          follow_up_questions: technicalQuestion.follow_up_questions || [],
        };
      } catch (parseError) {
        logToStderr("Parse error in technical question", parseError.message);
        const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "debugging", difficulty);
        return {
          question_text: "Analyze this code for potential issues, performance problems, and suggest improvements. What would you change and why?",
          code_snippet: fallbackCode,
          language: detectedLanguage,
          expected_topics: ["code-review", "performance", "best-practices", "architecture"],
          difficulty: difficulty,
          question_type: "debugging",
          follow_up_questions: ["How would you test this?", "What about scalability?"],
        };
      }
    } catch (error) {
      logToStderr("Error generating technical question", error.message);
      const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "coding", difficulty);
      return {
        question_text: "Review this code implementation. What are the potential issues and how would you improve it for production use?",
        code_snippet: fallbackCode,
        language: detectedLanguage,
        expected_topics: ["problem-solving", "production-readiness"],
        difficulty: difficulty,
        question_type: "coding",
        follow_up_questions: ["What about error handling?", "How would you monitor this?"],
      };
    }
  }

  static async generateInitialPrompt(jobDescription, resumeData, interviewSettings = {}) {
    const focusAreasText = interviewSettings.focusAreas?.length > 0
      ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
      : "";
    const styleText = interviewSettings.interviewStyle
      ? `Use a ${interviewSettings.interviewStyle} interview style. `
      : "";

    const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute voice interview.

${styleText}${focusAreasText}

Create a warm, professional greeting with the first question for ${resumeData.candidateName}.

Job: ${jobDescription}

Keep it concise and natural. Start with a general introduction question.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      });
      return response.choices[0].message.content;
    } catch (error) {
      return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`;
    }
  }

  static async generateNextQuestion(
    userResponse,
    contextState,
    jobDescription,
    questionCount,
    maxQuestions,
    interviewSettings = {},
    resumeData = {}
  ) {
    const questionsAsked = contextState.questionsAsked || [];
    const currentIndex = contextState.currentQuestionIndex || 0;

    if (questionCount >= maxQuestions) {
      return {
        response: "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
        feedback: "Thank you for participating in the interview.",
        is_question: false,
        should_end_interview: true,
        updated_context_state: {
          ...contextState,
          questionsAsked: [...questionsAsked, "Interview concluded"],
          currentQuestionIndex: currentIndex,
          interviewSettings: contextState.interviewSettings || interviewSettings,
        },
      };
    }

    const isTechnicalRole = this.detectTechnicalRole(jobDescription);
    let shouldAskTechnical = isTechnicalRole && (questionCount === 2 || questionCount === 4);

    let nextQuestion;

    if (shouldAskTechnical) {
      try {
        const technicalQuestion = await this.generateTechnicalQuestion(
          jobDescription,
          resumeData,
          questionsAsked,
          questionCount
        );

        let fullQuestionText = technicalQuestion.question_text;
        if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
          fullQuestionText += " Please analyze the code I've shared and walk me through your thought process.";
        }

        nextQuestion = {
          response: fullQuestionText,
          feedback: `Excellent! Now let's dive into a technical challenge.`,
          is_question: true,
          should_end_interview: false,
          technical_question: true,
          question_metadata: {
            ...technicalQuestion,
            spoken_text: technicalQuestion.question_text,
            display_text: fullQuestionText,
          },
        };
      } catch (error) {
        logToStderr("Error generating technical question", error.message);
        shouldAskTechnical = false;
      }
    }

    if (!shouldAskTechnical) {
      const prompt = `AI Interviewer. Generate the next question based on the candidate's response: "${userResponse}"

Previous questions: ${questionsAsked.slice(-2).join(", ")}
Job description: ${jobDescription}
Question ${questionCount} of ${maxQuestions}

Return a JSON object:
{
  "response": "question text",
  "feedback": "brief positive feedback",
  "is_question": true,
  "should_end_interview": false
}`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: prompt }],
          temperature: 0.7,
          max_tokens: 250,
        });

        const result = JSON.parse(response.choices[0].message.content);
        nextQuestion = {
          response: result.response,
          feedback: result.feedback || "Thank you for your response.",
          is_question: result.is_question,
          should_end_interview: result.should_end_interview,
        };
      } catch (error) {
        nextQuestion = {
          response: "Can you share an example of how you've applied your skills to solve a problem in this field?",
          feedback: "Thank you for sharing.",
          is_question: true,
          should_end_interview: false,
        };
      }
    }

    return {
      ...nextQuestion,
      updated_context_state: {
        ...contextState,
        questionsAsked: [...questionsAsked, nextQuestion.response],
        currentQuestionIndex: nextQuestion.is_question ? currentIndex + 1 : currentIndex,
        interviewSettings: contextState.interviewSettings || interviewSettings,
      },
    };
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
      return {
        score: 7,
        strengths: ["Good communication", "Relevant experience", "Professional demeanor"],
        areas_for_improvement: ["Could provide more specific examples"],
        recommendation: "Consider",
        summary: "Candidate showed good potential with room for growth.",
      };
    }
  }
}

// MCP Server Implementation
export const server = new Server(
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
            interviewSettings: { type: "object", description: "Interview settings" },
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
            userMessage: { type: "string", description: "Candidate's response" },
            contextState: { type: "object", description: "Current interview context" },
            questionCount: { type: "number", description: "Current question count" },
          },
          required: ["sessionId", "userMessage", "contextState", "questionCount"],
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
            interviewTranscript: { type: "array", description: "Complete interview transcript" },
            finalContextState: { type: "object", description: "Final interview context" },
          },
          required: ["sessionId", "jobId", "resumeId", "interviewTranscript"],
        },
      },
    ],
  };
});

// Handler functions
async function handleInitializeInterview({ jobId, resumeId, interviewSettings = {} }) {
  if (!jobId || !resumeId || !interviewSettings) {
    throw new McpError(ErrorCode.InvalidParams, "jobId, resumeId, and interviewSettings are required");
  }

  try {
    await connectDB();
    logToStderr("Finding job and resume", { jobId, resumeId });
    
    const [job, resume] = await Promise.all([
      JobDescription.findById(jobId).maxTimeMS(10000),
      Resume.findById(resumeId).maxTimeMS(10000),
    ]);

    if (!job || !resume) {
      throw new McpError(ErrorCode.InvalidParams, "Job or resume not found");
    }

    logToStderr("Creating session");
    const sessionId = randomUUID();
    const contextState = {
      questionsAsked: [],
      currentQuestionIndex: 0,
      startTime: new Date().toISOString(),
      interviewSettings,
      resumeData: resume,
    };

    const mcpSession = new MCPSession({
      sessionId,
      jobId,
      resumeId,
      contextState,
    });

    await mcpSession.save();

    const voiceInterviewResult = {
      sessionId,
      jobId,
      createdAt: new Date(),
      interactions: [],
      interviewSettings,
    };

    await Resume.updateOne(
      { _id: resumeId },
      { $push: { voiceInterviewResults: voiceInterviewResult } },
      { upsert: true }
    );

    logToStderr("Generating initial prompt");
    const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
      job.markdown_description || job.context,
      resume,
      interviewSettings
    );

    const initialInteraction = {
      question: initialPrompt,
      candidateResponse: "",
      feedback: "",
      timestamp: new Date(),
    };

    await Resume.updateOne(
      { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
      { $push: { "voiceInterviewResults.$.interactions": initialInteraction } }
    );

    logToStderr("Interview initialized successfully");
    return {
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
  } catch (error) {
    logToStderr("Initialize interview error", error.message);
    throw new McpError(ErrorCode.InternalError, error.message);
  }
}

async function handleProcessResponse({ sessionId, userMessage, contextState, questionCount }) {
  if (!sessionId || !userMessage || !contextState) {
    throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required");
  }

  try {
    await connectDB();
    logToStderr("Processing response for session", sessionId);
    
    const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000);
    if (!session) {
      throw new McpError(ErrorCode.NotFound, "Session not found");
    }

    const [job, resume] = await Promise.all([
      JobDescription.findById(session.jobId).maxTimeMS(10000),
      Resume.findById(session.resumeId).maxTimeMS(10000),
    ]);

    if (!job || !resume) {
      throw new McpError(ErrorCode.NotFound, "Job or resume not found");
    }

    const maxQuestions = contextState.interviewSettings?.maxQuestions || 5;
    const responseData = await FastAIInterviewService.generateNextQuestion(
      userMessage,
      contextState,
      job.markdown_description || job.context || "",
      questionCount,
      maxQuestions,
      contextState.interviewSettings || {},
      resume
    );

    const { response, feedback, is_question, should_end_interview, updated_context_state, technical_question, question_metadata } = responseData;

    // Update the session context state
    await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } });

    // Update the candidate response and feedback for the current interaction
    await Resume.updateOne(
      { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $set: {
          "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage,
          "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
        },
      },
      { arrayFilters: [{ "elem.candidateResponse": "" }] }
    );

    // Add new interaction if it's a question and not the end of the interview
    if (is_question && !should_end_interview) {
      const newInteraction = {
        question: response,
        candidateResponse: "",
        feedback: "",
        timestamp: new Date(),
        technical_question: technical_question || false,
        question_metadata: question_metadata || null,
      };

      await Resume.updateOne(
        { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
        { $push: { "voiceInterviewResults.$.interactions": newInteraction } }
      );
    }

    logToStderr("Response processed successfully");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            response,
            feedback,
            is_question,
            should_end_interview,
            updated_context_state,
            technical_question: technical_question || false,
            question_metadata: question_metadata || null,
            success: true,
          }),
        },
      ],
    };
  } catch (error) {
    logToStderr("Process response error", error.message);
    throw new McpError(ErrorCode.InternalError, error.message);
  }
}

async function handleSubmitInterview({
  sessionId,
  jobId,
  resumeId,
  userId,
  email,
  interviewTranscript,
  finalContextState,
}) {
  if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
    throw new McpError(ErrorCode.InvalidParams, "All required fields must be provided");
  }

  try {
    await connectDB();
    const session = await MCPSession.findOne({ sessionId });
    if (!session) {
      // throw new McpError(ErrorCode.NotFound, "Session not found");
      console.log("Session not found");
    }

    const job = await JobDescription.findById(jobId);
    if (!job) {
      // throw new McpError(ErrorCode.NotFound, "Job not found");
      console.log("Job not found");
    }

    const resume = await Resume.findById(resumeId);
    if (!resume) {
      // throw new McpError(ErrorCode.NotFound, "Resume not found");
      console.log("Resume not found");
    }

    const transcriptText = interviewTranscript
      .map((msg) => `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`)
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

    if (resume.email && EMAIL_USER && EMAIL_PASS) {
      try {
        const mailOptions = {
          from: EMAIL_USER,
          to: "refatbubt@gmail.com",
          // to: resume.email,
          subject: "Voice Interview Completion",
          text: `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
        };
        await transporter.sendMail(mailOptions);
      } catch (emailError) {
        // logToStderr("Email sending failed", emailError.message);
        console.log("Email sending failed");
      }
    }

    if (userId) {
      const newNotification = new Notification({
        message: `${resume?.candidateName || "Candidate"} Voice Interview Screened`,
        recipientId: userId,
        resumeId,
      });
      await newNotification.save();
    }

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
  } catch (error) {
    // logToStderr("Submit interview error", error.message);
    // throw new McpError(ErrorCode.InternalError, error.message);
    console.log("Submit interview error");
  }
}

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "initialize_interview":
        return await handleInitializeInterview(args);
      case "process_response":
        return await handleProcessResponse(args);
      case "submit_interview":
        return await handleSubmitInterview(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    logToStderr(`Tool ${name} error`, error.message);
    throw new McpError(ErrorCode.InternalError, error.message);
  }
});

// Logging utility that doesn't interfere with JSON communication
// function logToStderr(message, data = null) {
//   const timestamp = new Date().toISOString();
//   const logMessage = data 
//     ? `[${timestamp}] MCP Server: ${message} - ${JSON.stringify(data)}`
//     : `[${timestamp}] MCP Server: ${message}`;
//   process.stderr.write(logMessage + '\n');
// }

// Start server
async function main() {
  try {
    // Suppress database connection messages from stdout
    // const originalConsoleLog = console.log;
    // console.log = (...args) => {
    //   const message = args.join(' ');
    //   // Only redirect database messages to stderr, allow other logs
    //   if (message.includes('Database Connected') || message.includes('MongoDB') || message.includes('DB Host')) {
    //     logToStderr(message);
    //   } else {
    //     originalConsoleLog(...args);
    //   }
    // };

    // Connect to database first with timeout
    const dbConnection = connectDB();
    const dbTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 100000)
    );
    
    await Promise.race([dbConnection, dbTimeout]);
    logToStderr("Database connection established successfully");
    
    // Initialize MCP transport
    const transport = new StdioServerTransport();
    
    // Set up error handlers before connecting
    process.on('uncaughtException', (error) => {
      logToStderr("Uncaught exception", error.message);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logToStderr("Unhandled rejection", { reason: reason?.message || reason, promise });
      process.exit(1);
    });

    process.on('SIGTERM', () => {
      logToStderr("Received SIGTERM, shutting down gracefully");
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logToStderr("Received SIGINT, shutting down gracefully");
      process.exit(0);
    });

    // Connect to MCP transport
    await server.connect(transport);
    logToStderr("MCP transport connected");
    
    // Signal readiness to parent process via stdout (this is the only stdout message)
    process.stdout.write("MCP Server ready\n");
    
    logToStderr("MCP Server started and ready for requests");
    
  } catch (error) {
    logToStderr("Failed to start MCP Server", error.message);
    process.exit(1);
  }
}

// Handle process cleanup
process.on('exit', (code) => {
  logToStderr(`MCP Server process exiting with code: ${code}`);
});

main().catch((error) => {
  logToStderr("Fatal error in main", error.message);
  process.exit(1);
});

// ----------------------WITH CODE SNIPPET SOLUTION---------------------------

// import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
// import { randomUUID } from "node:crypto";
// import nodemailer from "nodemailer";
// import { OpenAI } from "openai";
// import mongoose from "mongoose";
// import Resume from "../../model/resumeModel.js";
// import MCPSession from "../../model/mcpSessionModel.js";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import Notification from "../../model/NotificationModal.js";
// import connectDB from "../../db/index.js";

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const EMAIL_USER = process.env.EMAIL_USER;
// const EMAIL_PASS = process.env.EMAIL_PASS;
// const MONGODB_URI = process.env.MONGODB_URI;

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
//   static detectTechnicalRole(jobDescription) {
//     const technicalKeywords = [
//       "software", "developer", "engineer", "programming", "coding", "technical", "architect",
//       "qa", "testing", "devops", "data", "machine learning", "ai", "blockchain", "cloud",
//       "security", "mobile", "web", "api", "database", "system", "network", "infrastructure",
//       "automation", "javascript", "python", "java", "react", "node", "frontend", "backend",
//       "fullstack", "angular", "vue", "typescript", "mongodb", "sql", "nosql", "aws", "docker",
//     ];
//     const description = jobDescription.toLowerCase();
//     return technicalKeywords.some((keyword) => description.includes(keyword));
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
//     };
//     const description = jobDescription.toLowerCase();
//     for (const [lang, keywords] of Object.entries(languages)) {
//       if (keywords.some((keyword) => description.includes(keyword))) {
//         return lang;
//       }
//     }
//     return "javascript";
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

//           architecture: `// Design a scalable state management solution
// class StateManager {
//   constructor() {
//     this.state = {};
//     this.listeners = new Set();
//     this.middleware = [];
//   }
  
//   // Implement:
//   // - subscribe/unsubscribe
//   // - dispatch with middleware
//   // - time-travel debugging
//   // - persistence layer
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
//     // - Different argument types
//     // - Cache size limits
//     // - TTL (time to live)
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
//     };
//     const langSnippets = advancedSnippets[language] || advancedSnippets.javascript;
//     const difficultySnippets = langSnippets[difficulty] || langSnippets.intermediate;
//     const typeSnippets = difficultySnippets[questionType] || Object.values(difficultySnippets)[0];
//     return typeSnippets || `// Advanced ${language} ${questionType} challenge`;
//   }

//   static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
//     const detectedLanguage = this.detectProgrammingLanguage(jobDescription);
//     const difficulty = questionNumber <= 2 ? "intermediate" : "advanced";

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

// Make the code snippet realistic and challenging - not basic examples.`;

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.9,
//         max_tokens: 800,
//       });

//       const content = response.choices[0].message.content.trim();

//       try {
//         const technicalQuestion = JSON.parse(content);
//         if (!technicalQuestion.question_text) {
//           throw new Error("Invalid question format");
//         }
//         let codeSnippet = technicalQuestion.code_snippet || "";
//         if (!codeSnippet.trim()) {
//           const questionType = technicalQuestion.question_type || "coding";
//           codeSnippet = this.generateAdvancedCodeSnippet(detectedLanguage, questionType, difficulty);
//         }
//         return {
//           question_text: technicalQuestion.question_text,
//           code_snippet: codeSnippet,
//           language: technicalQuestion.language || detectedLanguage,
//           expected_topics: technicalQuestion.expected_topics || [],
//           difficulty: difficulty,
//           question_type: technicalQuestion.question_type || "coding",
//           follow_up_questions: technicalQuestion.follow_up_questions || [],
//         };
//       } catch (parseError) {
//         console.error("Parse error in technical question:", parseError);
//         const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "debugging", difficulty);
//         return {
//           question_text: "Analyze this code for potential issues, performance problems, and suggest improvements. What would you change and why?",
//           code_snippet: fallbackCode,
//           language: detectedLanguage,
//           expected_topics: ["code-review", "performance", "best-practices", "architecture"],
//           difficulty: difficulty,
//           question_type: "debugging",
//           follow_up_questions: ["How would you test this?", "What about scalability?"],
//         };
//       }
//     } catch (error) {
//       console.error("Error generating technical question:", error);
//       const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "coding", difficulty);
//       return {
//         question_text: "Review this code implementation. What are the potential issues and how would you improve it for production use?",
//         code_snippet: fallbackCode,
//         language: detectedLanguage,
//         expected_topics: ["problem-solving", "production-readiness"],
//         difficulty: difficulty,
//         question_type: "coding",
//         follow_up_questions: ["What about error handling?", "How would you monitor this?"],
//       };
//     }
//   }

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

// Keep it concise and natural. Start with a general introduction question.`;

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.7,
//         max_tokens: 150,
//       });
//       return response.choices[0].message.content;
//     } catch (error) {
//       return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`;
//     }
//   }

//   static async generateNextQuestion(
//     userResponse,
//     contextState,
//     jobDescription,
//     questionCount,
//     maxQuestions,
//     interviewSettings = {},
//     resumeData = {}
//   ) {
//     const questionsAsked = contextState.questionsAsked || [];
//     const currentIndex = contextState.currentQuestionIndex || 0;

//     if (questionCount >= maxQuestions) {
//       return {
//         response: "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
//         feedback: "Thank you for participating in the interview.",
//         is_question: false,
//         should_end_interview: true,
//         updated_context_state: {
//           ...contextState,
//           questionsAsked: [...questionsAsked, "Interview concluded"],
//           currentQuestionIndex: currentIndex,
//           interviewSettings: contextState.interviewSettings || interviewSettings,
//         },
//       };
//     }

//     const isTechnicalRole = this.detectTechnicalRole(jobDescription);
//     let shouldAskTechnical = isTechnicalRole && (questionCount === 2 || questionCount === 4);

//     let nextQuestion;

//     if (shouldAskTechnical) {
//       try {
//         const technicalQuestion = await this.generateTechnicalQuestion(
//           jobDescription,
//           resumeData,
//           questionsAsked,
//           questionCount
//         );

//         let fullQuestionText = technicalQuestion.question_text;
//         if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
//           fullQuestionText += " Please analyze the code I've shared and walk me through your thought process.";
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
//         };
//       } catch (error) {
//         console.error("Error generating technical question:", error);
//         shouldAskTechnical = false;
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
// }`;

//       try {
//         const response = await openai.chat.completions.create({
//           model: "gpt-4o-mini",
//           messages: [{ role: "system", content: prompt }],
//           temperature: 0.7,
//           max_tokens: 250,
//         });

//         const result = JSON.parse(response.choices[0].message.content);
//         nextQuestion = {
//           response: result.response,
//           feedback: result.feedback || "Thank you for your response.",
//           is_question: result.is_question,
//           should_end_interview: result.should_end_interview,
//         };
//       } catch (error) {
//         nextQuestion = {
//           response: "Can you share an example of how you've applied your skills to solve a problem in this field?",
//           feedback: "Thank you for sharing.",
//           is_question: true,
//           should_end_interview: false,
//         };
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
//     };
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
// export const server = new Server(
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
//     ],
//   }
// });

// // Handler functions
// async function handleInitializeInterview({ jobId, resumeId, interviewSettings = {} }) {
//   if (!jobId || !resumeId || !interviewSettings) {
//     throw new McpError(ErrorCode.InvalidParams, "jobId, resumeId, and interviewSettings are required");
//   }

//   try {
//     await connectDB();
//     console.error("MCP Server: Finding job and resume...");
//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(5000),
//       Resume.findById(resumeId).maxTimeMS(5000),
//     ]);

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.InvalidParams, "Job or resume not found");
//     }

//     console.error("MCP Server: Job and resume found, creating session...");
//     const sessionId = randomUUID();
//     const contextState = {
//       questionsAsked: [],
//       currentQuestionIndex: 0,
//       startTime: new Date().toISOString(),
//       interviewSettings,
//       resumeData: resume,
//     };

//     const mcpSession = new MCPSession({
//       sessionId,
//       jobId,
//       resumeId,
//       contextState,
//     });

//     await mcpSession.save();

//     const voiceInterviewResult = {
//       sessionId,
//       jobId,
//       createdAt: new Date(),
//       interactions: [],
//       interviewSettings,
//     };

//     await Resume.updateOne(
//       { _id: resumeId },
//       { $push: { voiceInterviewResults: voiceInterviewResult } },
//       { upsert: true }
//     );

//     console.error("MCP Server: Generating initial prompt...");
//     const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
//       job.markdown_description || job.context,
//       resume,
//       interviewSettings
//     );

//     const initialInteraction = {
//       question: initialPrompt,
//       candidateResponse: "",
//       feedback: "",
//       timestamp: new Date(),
//     };

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       { $push: { "voiceInterviewResults.$.interactions": initialInteraction } }
//     );

//     console.error("MCP Server: Interview initialized successfully");
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             sessionId,
//             jobDetails: {
//               title: job.context,
//               description: job.markdown_description,
//             },
//             candidateDetails: { name: resume.candidateName, email: resume.email },
//             maxQuestions: interviewSettings.maxQuestions || 5,
//             contextState,
//             initialPrompt,
//             success: true,
//           }),
//         },
//       ],
//     };
//   } catch (error) {
//     console.error("MCP Server: Initialize interview error:", error.message);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// async function handleProcessResponse2({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required");
//   }

//   try {
//     await connectDB();
//     console.error("MCP Server: Processing response for session:", sessionId);
//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(5000);
//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found");
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(5000),
//       Resume.findById(session.resumeId).maxTimeMS(5000),
//     ]);

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.NotFound, "Job or resume not found");
//     }

//     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5;
//     const responseData = await FastAIInterviewService.generateNextQuestion(
//       userMessage,
//       contextState,
//       job.markdown_description || job.context || "",
//       questionCount,
//       maxQuestions,
//       contextState.interviewSettings || {},
//       resume
//     );

//     const { response, feedback, is_question, should_end_interview, updated_context_state } = responseData;

//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } });

//     await Resume.updateOne(
//       { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage,
//           "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
//         },
//       },
//       { arrayFilters: [{ "elem.candidateResponse": "" }] }
//     );

//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: responseData.technical_question || false,
//         question_metadata: responseData.question_metadata || null,
//       };

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } }
//       );
//     }

//     console.error("MCP Server: Response processed successfully");
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             response,
//             feedback,
//             is_question,
//             should_end_interview,
//             updated_context_state,
//             technical_question: responseData.technical_question || false,
//             question_metadata: responseData.question_metadata || null,
//             success: true,
//           }),
//         },
//       ],
//     };
//   } catch (error) {
//     console.error("MCP Server: Process response error:", error.message);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// async function handleProcessResponse({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required");
//   }

//   try {
//     await connectDB();
//     console.log("MCP Server: Processing response for session:", sessionId);
//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(5000);
//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found");
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(5000),
//       Resume.findById(session.resumeId).maxTimeMS(5000),
//     ]);

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.NotFound, "Job or resume not found");
//     }

//     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5;
//     const responseData = await FastAIInterviewService.generateNextQuestion(
//       userMessage,
//       contextState,
//       job.markdown_description || job.context || "",
//       questionCount,
//       maxQuestions,
//       contextState.interviewSettings || {},
//       resume
//     );

//     const { response, feedback, is_question, should_end_interview, updated_context_state, technical_question, question_metadata } = responseData;

//     // Log question_metadata for debugging
//     console.log("Generated question_metadata:", question_metadata);

//     // Validate question_metadata for technical questions
//     if (technical_question && (!question_metadata || !question_metadata.code_snippet)) {
//       console.warn("Warning: technical_question is true but question_metadata is incomplete:", question_metadata);
//     }

//     // Update the session context state
//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } });

//     // Update the candidate response and feedback for the current interaction
//     await Resume.updateOne(
//       { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage,
//           "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
//         },
//       },
//       { arrayFilters: [{ "elem.candidateResponse": "" }] }
//     );

//     // Add new interaction if it's a question and not the end of the interview
//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: technical_question || false,
//         question_metadata: question_metadata || null, // Ensure question_metadata is saved
//       };

//       console.log("Saving new interaction:", newInteraction); // Debug log

//       const updateResult = await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } }
//       );

//       console.log("Interaction save result:", updateResult); // Debug log
//     }

//     console.log("MCP Server: Response processed successfully");
//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             response,
//             feedback,
//             is_question,
//             should_end_interview,
//             updated_context_state,
//             technical_question: technical_question || false,
//             question_metadata: question_metadata || null,
//             success: true,
//           }),
//         },
//       ],
//     };
//   } catch (error) {
//     console.error("MCP Server: Process response error:", error.message);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// async function handleSubmitInterview({
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

//   try {
//     await connectDB();
//     const session = await MCPSession.findOne({ sessionId });
//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found");
//     }

//     const job = await JobDescription.findById(jobId);
//     if (!job) {
//       throw new McpError(ErrorCode.NotFound, "Job not found");
//     }

//     const resume = await Resume.findById(resumeId);
//     if (!resume) {
//       throw new McpError(ErrorCode.NotFound, "Resume not found");
//     }

//     const transcriptText = interviewTranscript
//       .map((msg) => `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`)
//       .join("\n");

//     const evaluation = await FastAIInterviewService.evaluateInterview(
//       transcriptText,
//       job.markdown_description || job.context,
//       finalContextState
//     );

//     await Resume.updateOne(
//       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
//       {
//         $set: {
//           "voiceInterviewResults.$.createdAt": new Date(),
//           "voiceInterviewResults.$.score": evaluation.score,
//           "voiceInterviewResults.$.recommendation": evaluation.recommendation,
//           "voiceInterviewResults.$.evaluation": JSON.stringify(evaluation),
//         },
//       }
//     );

//     await MCPSession.deleteOne({ sessionId });

//     if (resume.email && EMAIL_USER && EMAIL_PASS) {
//       try {
//         const mailOptions = {
//           from: EMAIL_USER,
//           to: resume.email,
//           subject: "Voice Interview Completion",
//           text: `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
//         };
//         await transporter.sendMail(mailOptions);
//       } catch (emailError) {
//         console.error("Email sending failed:", emailError.message);
//       }
//     }

//     if (userId) {
//       const newNotification = new Notification({
//         message: `${resume?.candidateName || "Candidate"} Voice Interview Screened`,
//         recipientId: userId,
//         resumeId,
//       });
//       await newNotification.save();
//     }

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             message: "Interview submitted successfully",
//             evaluation,
//             success: true,
//           }),
//         },
//       ],
//     };
//   } catch (error) {
//     console.error("Error in handleSubmitInterview:", error);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// // Tool handlers
// server.setRequestHandler(CallToolRequestSchema, async (request) => {
//   const { name, arguments: args } = request.params;
//   try {
//     switch (name) {
//       case "initialize_interview":
//         return await handleInitializeInterview(args);
//       case "process_response":
//         return await handleProcessResponse(args);
//       case "submit_interview":
//         return await handleSubmitInterview(args);
//       default:
//         throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
//     }
//   } catch (error) {
//     console.error(`Tool ${name} error:`, error.message);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// });

// // Start server
// async function main() {
//   try {
//     await connectDB();
//     console.error("Database Connected!! DB Host: " + MONGODB_URI);
//     const transport = new StdioServerTransport();
//     await server.connect(transport);
//     console.log("MCP Server ready"); // Signal readiness to stdout
//   } catch (error) {
//     console.error("MCP Server fatal error:", error.message);
//     process.exit(1);
//   }
// }

// main().catch((error) => {
//   console.error("MCP Server fatal error:", error.message);
//   process.exit(1);
// });

// ------------------------without code nippet solution-------------------------
// import { Server } from "@modelcontextprotocol/sdk/server/index.js"
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
// import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
// import { randomUUID } from "node:crypto"
// import nodemailer from "nodemailer"
// import { OpenAI } from "openai"
// import mongoose from "mongoose"
// import Resume from "../../model/resumeModel.js"
// import MCPSession from "../../model/mcpSessionModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Notification from "../../model/NotificationModal.js"
// import connectDB from "../../db/index.js";

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY
// const EMAIL_USER = process.env.EMAIL_USER
// const EMAIL_PASS = process.env.EMAIL_PASS
// const MONGODB_URI = process.env.MONGODB_URI

// // Initialize services
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: EMAIL_USER,
//     pass: EMAIL_PASS,
//   },
// })

// // Connect to MongoDB
// // async function connectDB() {
// //   try {
// //     if (mongoose.connection.readyState === 0) {
// //       await mongoose.connect(MONGODB_URI)
// //       console.error("MCP Server: MongoDB connected")
// //     }
// //   } catch (error) {
// //     console.error("MCP Server: MongoDB connection failed:", error.message)
// //     throw error
// //   }
// // }

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

//     return "javascript" // Default fallback
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

//           architecture: `// Design a scalable state management solution
// class StateManager {
//   constructor() {
//     this.state = {};
//     this.listeners = new Set();
//     this.middleware = [];
//   }
  
//   // Implement:
//   // - subscribe/unsubscribe
//   // - dispatch with middleware
//   // - time-travel debugging
//   // - persistence layer
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
//     // - Different argument types
//     // - Cache size limits
//     // - TTL (time to live)
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

//     // Determine difficulty based on question number and job requirements
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

//         // Use AI-generated code or fallback to advanced snippets
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
//         console.error("Parse error in technical question:", parseError)

//         // Advanced fallback
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
//       console.error("Error generating technical question:", error)

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
//         console.error("Error generating technical question:", error)
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

// // MCP Server Implementation
// export const server = new Server(
//   {
//     name: "ai-interview-server",
//     version: "1.0.0",
//   },
//   {
//     capabilities: {
//       tools: {},
//     },
//   },
// )

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
//     ],
//   }
// })

// // Handler functions
// async function handleInitializeInterview({ jobId, resumeId, interviewSettings = {} }) {
//   if (!jobId || !resumeId || !interviewSettings) {
//     throw new McpError(ErrorCode.InvalidParams, "jobId, resumeId, and interviewSettings are required")
//   }

//   try {
//     await connectDB()

//     console.error("MCP Server: Finding job and resume...")

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(5000),
//       Resume.findById(resumeId).maxTimeMS(5000),
//     ])

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.InvalidParams, "Job or resume not found")
//     }

//     console.error("MCP Server: Job and resume found, creating session...")

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

//     console.error("MCP Server: Generating initial prompt...")

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

//     console.error("MCP Server: Interview initialized successfully")

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             sessionId,
//             jobDetails: {
//               title: job.context,
//               description: job.markdown_description,
//             },
//             candidateDetails: { name: resume.candidateName, email: resume.email },
//             maxQuestions: interviewSettings.maxQuestions || 5,
//             contextState,
//             initialPrompt,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("MCP Server: Initialize interview error:", error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// async function handleProcessResponse({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required")
//   }

//   try {
//     await connectDB()

//     console.error("MCP Server: Processing response for session:", sessionId)

//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(5000)

//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found")
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(5000),
//       Resume.findById(session.resumeId).maxTimeMS(5000),
//     ])

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.NotFound, "Job or resume not found")
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

//     const { response, feedback, is_question, should_end_interview, updated_context_state } = responseData

//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } })

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

//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: responseData.technical_question || false,
//         question_metadata: responseData.question_metadata || null,
//       }

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
//       )
//     }

//     console.error("MCP Server: Response processed successfully")

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             response,
//             feedback,
//             is_question,
//             should_end_interview,
//             updated_context_state,
//             technical_question: responseData.technical_question || false,
//             question_metadata: responseData.question_metadata || null,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("MCP Server: Process response error:", error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// async function handleSubmitInterview({
//   sessionId,
//   jobId,
//   resumeId,
//   userId,
//   email,
//   interviewTranscript,
//   finalContextState,
// }) {
//   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//     throw new McpError(ErrorCode.InvalidParams, "All required fields must be provided")
//   }

//   try {
//     await connectDB()

//     const session = await MCPSession.findOne({ sessionId })

//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found")
//     }

//     const job = await JobDescription.findById(jobId)

//     if (!job) {
//       throw new McpError(ErrorCode.NotFound, "Job not found")
//     }

//     const resume = await Resume.findById(resumeId)

//     if (!resume) {
//       throw new McpError(ErrorCode.NotFound, "Resume not found")
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

//     await MCPSession.deleteOne({ sessionId })

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

//     if (userId) {
//       const newNotification = new Notification({
//         message: `${resume?.candidateName || "Candidate"} Voice Interview Screened`,
//         recipientId: userId,
//         resumeId,
//       })

//       await newNotification.save()
//     }

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             message: "Interview submitted successfully",
//             evaluation,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("Error in handleSubmitInterview:", error)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// // Tool handlers
// server.setRequestHandler(CallToolRequestSchema, async (request) => {
//   const { name, arguments: args } = request.params

//   try {
//     switch (name) {
//       case "initialize_interview":
//         return await handleInitializeInterview(args)
//       case "process_response":
//         return await handleProcessResponse(args)
//       case "submit_interview":
//         return await handleSubmitInterview(args)
//       default:
//         throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
//     }
//   } catch (error) {
//     console.error(`Tool ${name} error:`, error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// })

// // Start server
// async function main() {
//   try {
//     await connectDB()

//     const transport = new StdioServerTransport()
//     await server.connect(transport)
//     console.error("AI Interview MCP Server running on stdio")
//   } catch (error) {
//     console.error("MCP Server fatal error:", error.message)
//     process.exit(1)
//   }
// }

// main().catch((error) => {
//   console.error("MCP Server fatal error:", error.message)
//   process.exit(1)
// })

//===========================================================
// working code with code snippet generation
// ==========================================================
// #!/usr/bin/env node

// import { Server } from "@modelcontextprotocol/sdk/server/index.js"
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
// import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
// import { randomUUID } from "node:crypto"
// import nodemailer from "nodemailer"
// import { OpenAI } from "openai"
// import mongoose from "mongoose"
// import Resume from "../../model/resumeModel.js"
// import MCPSession from "../../model/mcpSessionModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Notification from "../../model/NotificationModal.js"
// import connectDB from "../../db/index.js";

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY
// const EMAIL_USER = process.env.EMAIL_USER
// const EMAIL_PASS = process.env.EMAIL_PASS
// const MONGODB_URI = process.env.MONGODB_URI

// // Initialize services
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: EMAIL_USER,
//     pass: EMAIL_PASS,
//   },
// })

// // Connect to MongoDB
// // async function connectDB() {
// //   try {
// //     if (mongoose.connection.readyState === 0) {
// //       await mongoose.connect(MONGODB_URI)
// //       console.error("MCP Server: MongoDB connected")
// //     }
// //   } catch (error) {
// //     console.error("MCP Server: MongoDB connection failed:", error.message)
// //     throw error
// //   }
// // }


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
//     ]

//     const description = jobDescription.toLowerCase()
//     return technicalKeywords.some((keyword) => description.includes(keyword))
//   }

//   static detectProgrammingLanguage(jobDescription) {
//     const languages = {
//       javascript: ["javascript", "js", "react", "node", "vue", "angular", "typescript"],
//       python: ["python", "django", "flask", "pandas", "numpy"],
//       java: ["java", "spring", "hibernate"],
//       csharp: ["c#", "csharp", ".net", "asp.net"],
//       php: ["php", "laravel", "symfony"],
//       ruby: ["ruby", "rails"],
//       go: ["golang", "go"],
//       rust: ["rust"],
//       cpp: ["c++", "cpp"],
//       sql: ["sql", "mysql", "postgresql", "database"],
//     }

//     const description = jobDescription.toLowerCase()

//     for (const [lang, keywords] of Object.entries(languages)) {
//       if (keywords.some((keyword) => description.includes(keyword))) {
//         return lang
//       }
//     }

//     return "javascript" // Default fallback
//   }

//   static generateCodeSnippet(language, questionType, difficulty) {
//     const codeSnippets = {
//       javascript: {
//         beginner: {
//           debugging: `function calculateSum(a, b) {
//   return a + b;
// }

// // What's wrong with this function call?
// let result = calculateSum(5, "10");
// console.log(result); // Expected: 15, Actual: ?`,

//           coding: `// Complete this function to reverse a string
// function reverseString(str) {
//   // Your code here
  
// }

// // Test cases:
// // reverseString("hello") should return "olleh"
// // reverseString("world") should return "dlrow"`,

//           conceptual: `const numbers = [1, 2, 3, 4, 5];

// // What will this code output?
// const doubled = numbers.map(num => num * 2);
// console.log(doubled);`,
//         },

//         intermediate: {
//           debugging: `async function fetchUserData(userId) {
//   const response = await fetch(\`/api/users/\${userId}\`);
//   const userData = response.json();
//   return userData;
// }

// // What's the issue with this async function?
// fetchUserData(123).then(data => console.log(data));`,

//           coding: `// Implement a function to find the most frequent element in an array
// function findMostFrequent(arr) {
//   // Your implementation here
  
// }

// // Test cases:
// // findMostFrequent([1, 2, 3, 2, 2, 4]) should return 2
// // findMostFrequent(['a', 'b', 'a', 'c', 'a']) should return 'a'`,

//           system_design: `// Design a simple cache implementation
// class SimpleCache {
//   constructor(maxSize = 100) {
//     // Initialize your cache here
//   }
  
//   get(key) {
//     // Implement get method
//   }
  
//   set(key, value) {
//     // Implement set method with size limit
//   }
// }`,
//         },

//         advanced: {
//           coding: `// Implement a debounce function
// function debounce(func, delay) {
//   // Your implementation here
  
// }

// // Usage example:
// const debouncedSearch = debounce((query) => {
//   console.log('Searching for:', query);
// }, 300);`,

//           system_design: `// Design a rate limiter for an API
// class RateLimiter {
//   constructor(maxRequests, windowMs) {
//     // Initialize rate limiter
//   }
  
//   isAllowed(clientId) {
//     // Return true if request is allowed, false otherwise
//   }
  
//   reset(clientId) {
//     // Reset rate limit for a client
//   }
// }`,
//         },
//       },

//       python: {
//         beginner: {
//           debugging: `def calculate_average(numbers):
//     total = sum(numbers)
//     return total / len(numbers)

// # What happens when we call this with an empty list?
// result = calculate_average([])
// print(result)`,

//           coding: `# Complete this function to check if a number is prime
// def is_prime(n):
//     # Your code here
//     pass

// # Test cases:
// # is_prime(7) should return True
// # is_prime(8) should return False`,
//         },

//         intermediate: {
//           coding: `# Implement a function to find duplicate elements
// def find_duplicates(arr):
//     # Your implementation here
//     pass

// # Test case:
// # find_duplicates([1, 2, 3, 2, 4, 5, 1]) should return [1, 2]`,

//           debugging: `class BankAccount:
//     def __init__(self, balance=0):
//         self.balance = balance
    
//     def withdraw(self, amount):
//         self.balance -= amount
//         return self.balance

// # What's the issue with this implementation?
// account = BankAccount(100)
// print(account.withdraw(150))  # Should this be allowed?`,
//         },
//       },

//       sql: {
//         beginner: {
//           coding: `-- Given tables: users(id, name, email) and orders(id, user_id, amount)
// -- Write a query to find all users who have placed orders

// SELECT 
// -- Your query here

// FROM users u
// -- Complete the query`,
//         },

//         intermediate: {
//           coding: `-- Find the top 3 customers by total order amount
// -- Tables: customers(id, name), orders(id, customer_id, amount, order_date)

// SELECT 
// -- Your query here

// -- Complete this query to show customer name and total amount`,
//         },
//       },
//     }

//     const langSnippets = codeSnippets[language] || codeSnippets.javascript
//     const difficultySnippets = langSnippets[difficulty] || langSnippets.beginner
//     const typeSnippets =
//       difficultySnippets[questionType] || difficultySnippets.coding || Object.values(difficultySnippets)[0]

//     return typeSnippets || `// Sample ${language} code snippet for ${questionType} question`
//   }

//   static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
//     const detectedLanguage = this.detectProgrammingLanguage(jobDescription)

//     const prompt = `You are an expert technical interviewer. Based on the job description and candidate's background, generate a relevant technical question with a code snippet.

// Job Description: ${jobDescription}
// Candidate Background: ${resumeData.candidateName} - ${resumeData.skills || "General technical background"}
// Previous Questions Asked: ${previousQuestions.join("; ")}
// Question Number: ${questionNumber}
// Detected Primary Language: ${detectedLanguage}

// Generate a technical question that:
// 1. Is directly relevant to the job requirements
// 2. Tests practical knowledge and problem-solving skills
// 3. Includes a relevant code snippet in ${detectedLanguage} or the most relevant language
// 4. Is appropriate for the candidate's experience level
// 5. Is different from previously asked questions
// 6. Can be answered in 2-3 minutes verbally

// Return a JSON object with this exact structure:
// {
//   "question_text": "The main question to ask (without code)",
//   "code_snippet": "The code snippet to display (properly formatted)",
//   "language": "${detectedLanguage}",
//   "expected_topics": ["topic1", "topic2", "topic3"],
//   "difficulty": "beginner|intermediate|advanced",
//   "question_type": "coding|system_design|conceptual|debugging|architecture"
// }

// Make sure:
// - question_text is the spoken question without code
// - code_snippet is properly formatted code that will be displayed separately
// - The JSON is valid and properly formatted`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.8,
//         max_tokens: 600,
//       })

//       const content = response.choices[0].message.content.trim()

//       try {
//         const technicalQuestion = JSON.parse(content)

//         if (!technicalQuestion.question_text || typeof technicalQuestion.question_text !== "string") {
//           throw new Error("Invalid question format")
//         }

//         // If no code snippet provided by AI, generate one
//         let codeSnippet = technicalQuestion.code_snippet || ""
//         if (!codeSnippet.trim()) {
//           const difficulty = technicalQuestion.difficulty || "intermediate"
//           const questionType = technicalQuestion.question_type || "coding"
//           codeSnippet = this.generateCodeSnippet(detectedLanguage, questionType, difficulty)
//         }

//         return {
//           question_text: technicalQuestion.question_text,
//           code_snippet: codeSnippet,
//           language: technicalQuestion.language || detectedLanguage,
//           expected_topics: technicalQuestion.expected_topics || [],
//           difficulty: technicalQuestion.difficulty || "intermediate",
//           question_type: technicalQuestion.question_type || "coding",
//         }
//       } catch (parseError) {
//         console.error("Parse error in technical question:", parseError)

//         // Fallback with generated code snippet
//         const fallbackCode = this.generateCodeSnippet(detectedLanguage, "coding", "intermediate")

//         return {
//           question_text:
//             "Can you walk me through this code and explain what it does? Also, can you identify any potential issues or improvements?",
//           code_snippet: fallbackCode,
//           language: detectedLanguage,
//           expected_topics: ["code-review", "debugging", "best-practices"],
//           difficulty: "intermediate",
//           question_type: "debugging",
//         }
//       }
//     } catch (error) {
//       console.error("Error generating technical question:", error)

//       // Fallback technical question with code
//       const fallbackCode = this.generateCodeSnippet(detectedLanguage, "coding", "intermediate")

//       return {
//         question_text:
//           "Let's look at some code. Can you explain what this code does and walk me through your thought process?",
//         code_snippet: fallbackCode,
//         language: detectedLanguage,
//         expected_topics: ["problem-solving", "code-analysis"],
//         difficulty: "intermediate",
//         question_type: "coding",
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

//         // Combine question text with code snippet reference
//         let fullQuestionText = technicalQuestion.question_text

//         if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
//           fullQuestionText += " Please take a look at the code snippet I've shared and walk me through your analysis."
//         }

//         nextQuestion = {
//           response: fullQuestionText,
//           feedback: `Great response! Now let's dive into something more technical.`,
//           is_question: true,
//           should_end_interview: false,
//           technical_question: true,
//           question_metadata: {
//             ...technicalQuestion,
//             spoken_text: technicalQuestion.question_text, // Text to be spoken (without code)
//             display_text: fullQuestionText, // Text to be displayed
//           },
//         }
//       } catch (error) {
//         console.error("Error generating technical question:", error)
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
//   },
// )

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
//     ],
//   }
// })

// // Handler functions
// async function handleInitializeInterview({ jobId, resumeId, interviewSettings = {} }) {
//   if (!jobId || !resumeId || !interviewSettings) {
//     throw new McpError(ErrorCode.InvalidParams, "jobId, resumeId, and interviewSettings are required")
//   }

//   try {
//     // Ensure MongoDB connection
//     await connectDB()

//     console.error("MCP Server: Finding job and resume...")

//     // Use Promise.all for parallel queries with timeout
//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(5000),
//       Resume.findById(resumeId).maxTimeMS(5000),
//     ])

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.InvalidParams, "Job or resume not found")
//     }

//     console.error("MCP Server: Job and resume found, creating session...")

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

//     console.error("MCP Server: Generating initial prompt...")

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

//     console.error("MCP Server: Interview initialized successfully")

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             sessionId,
//             jobDetails: {
//               title: job.context,
//               description: job.markdown_description,
//             },
//             candidateDetails: { name: resume.candidateName, email: resume.email },
//             maxQuestions: interviewSettings.maxQuestions || 5,
//             contextState,
//             initialPrompt,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("MCP Server: Initialize interview error:", error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// async function handleProcessResponse({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required")
//   }

//   try {
//     // Ensure MongoDB connection
//     await connectDB()

//     console.error("MCP Server: Processing response for session:", sessionId)

//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(5000)

//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found")
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(5000),
//       Resume.findById(session.resumeId).maxTimeMS(5000),
//     ])

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.NotFound, "Job or resume not found")
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

//     const { response, feedback, is_question, should_end_interview, updated_context_state } = responseData

//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } })

//     // Update database interactions
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

//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: responseData.technical_question || false,
//         question_metadata: responseData.question_metadata || null,
//       }

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
//       )
//     }

//     console.error("MCP Server: Response processed successfully")

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             response,
//             feedback,
//             is_question,
//             should_end_interview,
//             updated_context_state,
//             technical_question: responseData.technical_question || false,
//             question_metadata: responseData.question_metadata || null,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("MCP Server: Process response error:", error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// async function handleSubmitInterview({
//   sessionId,
//   jobId,
//   resumeId,
//   userId,
//   email,
//   interviewTranscript,
//   finalContextState,
// }) {
//   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//     throw new McpError(ErrorCode.InvalidParams, "All required fields must be provided")
//   }

//   try {
//     // Ensure MongoDB connection
//     await connectDB()

//     // Fetch the session
//     const session = await MCPSession.findOne({ sessionId })

//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found")
//     }

//     // Fetch the job
//     const job = await JobDescription.findById(jobId)

//     if (!job) {
//       throw new McpError(ErrorCode.NotFound, "Job not found")
//     }

//     // Fetch the resume to get candidate email
//     const resume = await Resume.findById(resumeId)

//     if (!resume) {
//       throw new McpError(ErrorCode.NotFound, "Resume not found")
//     }

//     // Convert transcript to text
//     const transcriptText = interviewTranscript
//       .map((msg) => `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`)
//       .join("\n")

//     // Evaluate the interview
//     const evaluation = await FastAIInterviewService.evaluateInterview(
//       transcriptText,
//       job.markdown_description || job.context,
//       finalContextState,
//     )

//     // Update resume with evaluation results
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

//     // Delete the session
//     await MCPSession.deleteOne({ sessionId })

//     // Send email to resume.email if available
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

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             message: "Interview submitted successfully",
//             evaluation,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("Error in handleSubmitInterview:", error)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// // Tool handlers
// server.setRequestHandler(CallToolRequestSchema, async (request) => {
//   const { name, arguments: args } = request.params

//   try {
//     switch (name) {
//       case "initialize_interview":
//         return await handleInitializeInterview(args)
//       case "process_response":
//         return await handleProcessResponse(args)
//       case "submit_interview":
//         return await handleSubmitInterview(args)
//       default:
//         throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
//     }
//   } catch (error) {
//     console.error(`Tool ${name} error:`, error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// })

// // Start server
// async function main() {
//   try {
//     // Connect to database first
//     await connectDB()

//     const transport = new StdioServerTransport()
//     await server.connect(transport)
//     console.log("AI Interview MCP Server running on stdio")
//   } catch (error) {
//     console.error("MCP Server fatal error:", error.message)
//     process.exit(1)
//   }
// }

// main().catch((error) => {
//   console.error("MCP Server fatal error:", error.message)
//   process.exit(1)
// })


// ===============================================================================
// Previous working code
// ===============================================================================

// #!/usr/bin/env node
// import { Server } from "@modelcontextprotocol/sdk/server/index.js"
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
// import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
// import { randomUUID } from "node:crypto"
// import nodemailer from "nodemailer"
// import { OpenAI } from "openai"
// import mongoose from "mongoose"
// import Resume from "../../model/resumeModel.js"
// import MCPSession from "../../model/mcpSessionModel.js"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Notification from "../../model/NotificationModal.js"
// import connectDB from "../../db/index.js";
// import { io } from '../../index.js';

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY
// const EMAIL_USER = process.env.EMAIL_USER
// const EMAIL_PASS = process.env.EMAIL_PASS
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"
// const MONGODB_URI = process.env.MONGODB_URI

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
//     ]

//     const description = jobDescription.toLowerCase()
//     return technicalKeywords.some((keyword) => description.includes(keyword))
//   }

//   static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
//     const prompt = `You are an expert technical interviewer. Based on the job description and candidate's background, generate a relevant technical question.

// Job Description: ${jobDescription}

// Candidate Background: ${resumeData.candidateName} - ${resumeData.skills || "General technical background"}

// Previous Questions Asked: ${previousQuestions.join("; ")}

// Question Number: ${questionNumber}

// Generate a technical question that:
// 1. Is directly relevant to the job requirements
// 2. Tests practical knowledge and problem-solving skills
// 3. Can include code snippets, system design, or conceptual problems
// 4. Is appropriate for the candidate's experience level
// 5. Is different from previously asked questions
// 6. Can be answered in 2-3 minutes verbally

// Return a JSON object with this exact structure:
// {
//   "question": "The technical question to ask",
//   "code_snippet": "Optional code snippet if relevant (can be empty string)",
//   "expected_topics": ["topic1", "topic2", "topic3"],
//   "difficulty": "beginner|intermediate|advanced",
//   "question_type": "coding|system_design|conceptual|debugging|architecture"
// }

// Make sure the JSON is valid and properly formatted.`

//     try {
//       const response = await openai.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [{ role: "system", content: prompt }],
//         temperature: 0.8,
//         max_tokens: 500,
//       })

//       const content = response.choices[0].message.content.trim()

//       try {
//         const technicalQuestion = JSON.parse(content)

//         if (!technicalQuestion.question || typeof technicalQuestion.question !== "string") {
//           throw new Error("Invalid question format")
//         }

//         return {
//           question: technicalQuestion.question,
//           code_snippet: technicalQuestion.code_snippet || "",
//           expected_topics: technicalQuestion.expected_topics || [],
//           difficulty: technicalQuestion.difficulty || "intermediate",
//           question_type: technicalQuestion.question_type || "conceptual",
//         }
//       } catch (parseError) {
//         return {
//           question: content,
//           code_snippet: "",
//           expected_topics: ["problem-solving"],
//           difficulty: "intermediate",
//           question_type: "conceptual",
//         }
//       }
//     } catch (error) {
//       return {
//         question:
//           "Can you walk me through how you would approach solving a complex technical problem? Please describe your problem-solving methodology and give an example from your experience.",
//         code_snippet: "",
//         expected_topics: ["problem-solving", "methodology"],
//         difficulty: "intermediate",
//         question_type: "conceptual",
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

//         let questionText = technicalQuestion.question

//         if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
//           questionText += `\n\nHere's some code to analyze:\n\`\`\`\n${technicalQuestion.code_snippet}\n\`\`\`\n\nPlease walk me through your thinking process.`
//         }

//         nextQuestion = {
//           response: questionText,
//           feedback: `Great response! Now let's dive into something more technical.`,
//           is_question: true,
//           should_end_interview: false,
//           technical_question: true,
//           question_metadata: technicalQuestion,
//         }
//       } catch (error) {
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
//   },
// )

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
//     ],
//   }
// })

// // Handler functions
// async function handleInitializeInterview({ jobId, resumeId, interviewSettings = {} }) {
//   if (!jobId || !resumeId || !interviewSettings) {
//     throw new McpError(ErrorCode.InvalidParams, "jobId, resumeId, and interviewSettings are required")
//   }

//   try {
//     // Check MongoDB connection
//     if (mongoose.connection.readyState !== 1) {
//       throw new McpError(ErrorCode.InternalError, "Database not connected")
//     }

//     console.log("MCP Server: Finding job and resume...")

//     // Use Promise.all for parallel queries with timeout
//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(5000),
//       Resume.findById(resumeId).maxTimeMS(5000),
//     ])

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.InvalidParams, "Job or resume not found")
//     }

//     console.log("MCP Server: Job and resume found, creating session...")

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

//     console.log("MCP Server: Generating initial prompt...")
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

//     console.log("MCP Server: Interview initialized successfully")

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             sessionId,
//             jobDetails: {
//               title: job.context,
//               description: job.markdown_description,
//             },
//             candidateDetails: { name: resume.candidateName, email: resume.email },
//             maxQuestions: interviewSettings.maxQuestions || 5,
//             contextState,
//             initialPrompt,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("MCP Server: Initialize interview error:", error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// async function handleProcessResponse({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required")
//   }

//   try {
//     // Check MongoDB connection
//     if (mongoose.connection.readyState !== 1) {
//       throw new McpError(ErrorCode.InternalError, "Database not connected")
//     }

//     console.log("MCP Server: Processing response for session:", sessionId)

//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(5000)
//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found")
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(5000),
//       Resume.findById(session.resumeId).maxTimeMS(5000),
//     ])

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.NotFound, "Job or resume not found")
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

//     const { response, feedback, is_question, should_end_interview, updated_context_state } = responseData

//     await MCPSession.updateOne({ sessionId }, { $set: { contextState: updated_context_state } })

//     // Update database interactions
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

//     if (is_question && !should_end_interview) {
//       const newInteraction = {
//         question: response,
//         candidateResponse: "",
//         feedback: "",
//         timestamp: new Date(),
//         technical_question: responseData.technical_question || false,
//         question_metadata: responseData.question_metadata || null,
//       }

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
//       )
//     }

//     console.log("MCP Server: Response processed successfully")

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             response,
//             feedback,
//             is_question,
//             should_end_interview,
//             updated_context_state,
//             technical_question: responseData.technical_question || false,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     console.error("MCP Server: Process response error:", error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }

// async function handleSubmitInterview2({
//   sessionId,
//   jobId,
//   resumeId,
//   userId,
//   email,
//   interviewTranscript,
//   finalContextState,
// }) {
//   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//     throw new McpError(ErrorCode.InvalidParams, "All required fields must be provided")
//   }

//   try {
//     const session = await MCPSession.findOne({ sessionId })
//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found")
//     }

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       throw new McpError(ErrorCode.NotFound, "Job not found")
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

//     await MCPSession.deleteOne({ sessionId })

//     if (email && EMAIL_USER && EMAIL_PASS) {
//       try {
//         const mailOptions = {
//           from: EMAIL_USER,
//           to: email,
//           subject: "Voice Interview Completion",
//           text: `Dear Candidate,\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
//         }
//         await transporter.sendMail(mailOptions)
//       } catch (emailError) {
//         console.error("Email sending failed:", emailError.message)
//       }
//     }

//     const resume = await Resume.findById(resumeId)

//     if (userId) {
//       const newNotification = new Notification({
//         message: `${resume?.candidateName} completed AI Interview`,
//         recipientId: userId,
//         resumeId,
//       })
//       await newNotification.save()
//     }

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             message: "Interview submitted successfully",
//             evaluation,
//             success: true,
//           }),
//         },
//       ],
//     }
//   } catch (error) {
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// }
// async function handleSubmitInterview({
//   sessionId,
//   jobId,
//   resumeId,
//   userId,
//   email, // This parameter is no longer used for sending email
//   interviewTranscript,
//   finalContextState,
// }) {
//   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//     throw new McpError(ErrorCode.InvalidParams, "All required fields must be provided");
//   }

//   try {
//     // Fetch the session
//     const session = await MCPSession.findOne({ sessionId });
//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found");
//     }

//     // Fetch the job
//     const job = await JobDescription.findById(jobId);
//     if (!job) {
//       throw new McpError(ErrorCode.NotFound, "Job not found");
//     }

//     // Fetch the resume to get candidate email
//     const resume = await Resume.findById(resumeId);
//     if (!resume) {
//       throw new McpError(ErrorCode.NotFound, "Resume not found");
//     }

//     // Convert transcript to text
//     const transcriptText = interviewTranscript
//       .map((msg) => `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`)
//       .join("\n");

//     // Evaluate the interview
//     const evaluation = await FastAIInterviewService.evaluateInterview(
//       transcriptText,
//       job.markdown_description || job.context,
//       finalContextState,
//     );

//     // Update resume with evaluation results
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
//     );

//     // Delete the session
//     await MCPSession.deleteOne({ sessionId });

//     // Send email to resume.email if available
//     if (resume.email && EMAIL_USER && EMAIL_PASS) {
//       try {
//         const mailOptions = {
//           from: EMAIL_USER,
//           to: resume.email, // Use resume.email instead of frontend-provided email
//           subject: "Voice Interview Completion",
//           text: `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
//         };
//         await transporter.sendMail(mailOptions);
//       } catch (emailError) {
//         console.error("Email sending failed:", emailError.message);
//       }
//     }

//     // Create and emit notification
//     if (userId) {
//       const percentageScore = evaluation.score; // Assuming score is a number (e.g., 85.5)
//       const newNotification = new Notification({
//         message: `${resume?.candidateName || "Candidate"} Voice Interview Screened`,
//         recipientId: userId,
//         resumeId,
//       });
//       await newNotification.save();

//       // Emit notification via Socket.IO
//       io.emit("newNotification", newNotification);
//     }

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify({
//             message: "Interview submitted successfully",
//             evaluation,
//             success: true,
//           }),
//         },
//       ],
//     };
//   } catch (error) {
//     console.error("Error in handleSubmitInterview:", error);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// // Tool handlers
// server.setRequestHandler(CallToolRequestSchema, async (request) => {
//   const { name, arguments: args } = request.params
//   try {
//     switch (name) {
//       case "initialize_interview":
//         return await handleInitializeInterview(args)
//       case "process_response":
//         return await handleProcessResponse(args)
//       case "submit_interview":
//         return await handleSubmitInterview(args)
//       default:
//         throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
//     }
//   } catch (error) {
//     console.error(`Tool ${name} error:`, error.message)
//     throw new McpError(ErrorCode.InternalError, error.message)
//   }
// })

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
//         return originalStdoutWrite.call(
//           process.stdout,
//           data,
//           encoding,
//           callback
//         );
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
//   await server.connect(transport);
//   console.error("AI Interview MCP Server running on stdio");
// }

// main().catch((error) => {
//   console.error("MCP Server fatal error:", error.message)
//   process.exit(1)
// })




// ============================================================================

// // #!/usr/bin/env node
// import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import {
//   CallToolRequestSchema,
//   ListToolsRequestSchema,
//   McpError,
//   ErrorCode,
// } from "@modelcontextprotocol/sdk/types.js";
// import { randomUUID } from "node:crypto";
// import nodemailer from "nodemailer";
// import { OpenAI } from "openai";
// import Resume from "../../model/resumeModel.js";
// import MCPSession from "../../model/mcpSessionModel.js";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import connectDB from "../../db/index.js";
// import Notification from '../../model/NotificationModal.js';
// import { io } from '../../index.js';

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
//   static async generateInitialPrompt(
//     jobDescription,
//     resumeData,
//     interviewSettings = {}
//   ) {
//     const focusAreasText =
//       interviewSettings.focusAreas?.length > 0
//         ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
//         : "";
//     const styleText = interviewSettings.interviewStyle
//       ? `Use a ${interviewSettings.interviewStyle} interview style. `
//       : "";

//     const prompt = `You are an AI interviewer conducting a ${
//       interviewSettings.interviewDuration || 15
//     }-minute voice interview.
// ${styleText}${focusAreasText}
// Create a warm, professional greeting with the first question for ${
//       resumeData.candidateName
//     }.
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
//       return `Hello ${resumeData.candidateName}, welcome to your ${
//         interviewSettings.interviewDuration || 15
//       }-minute interview. ${focusAreasText}Tell me about yourself and why you're interested in this role.`;
//     }
//   }

//   static async generateNextQuestion(
//     userResponse,
//     contextState,
//     jobDescription,
//     questionCount,
//     maxQuestions,
//     interviewSettings = {}
//   ) {
//     const questionsAsked = contextState.questionsAsked || [];
//     const currentIndex = contextState.currentQuestionIndex || 0;

//     // Check if this is the last question
//     const isLastQuestion = questionCount >= maxQuestions;

//     const focusAreasText =
//       interviewSettings.focusAreas?.length > 0
//         ? `Focus areas: ${interviewSettings.focusAreas.join(", ")}. `
//         : "";
//     const styleText = interviewSettings.interviewStyle
//       ? `Interview style: ${interviewSettings.interviewStyle}. `
//       : "";

//     const prompt = `
// AI Interviewer. Generate the next question or conclusion based on the candidate's response: "${userResponse}"
// Previous questions: ${questionsAsked.slice(-2).join(", ")}
// Job description: ${jobDescription}
// ${focusAreasText}${styleText}
// Question ${questionCount} of ${maxQuestions}
// ${
//   isLastQuestion
//     ? "This should be the final question or conclusion. If this is question " +
//       maxQuestions +
//       ", ask a final meaningful question. If this is beyond " +
//       maxQuestions +
//       ", provide a conclusion."
//     : "Ask a relevant question focusing on the specified areas."
// }

// Return a JSON object:
// {
//   "response": "question or conclusion text",
//   "feedback": "brief positive feedback",
//   "is_question": ${!isLastQuestion || questionCount === maxQuestions},
//   "should_end_interview": ${questionCount > maxQuestions}
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

//       if (
//         !result.response ||
//         typeof result.is_question !== "boolean" ||
//         typeof result.should_end_interview !== "boolean"
//       ) {
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
//           currentQuestionIndex: result.is_question
//             ? currentIndex + 1
//             : currentIndex,
//           interviewSettings:
//             contextState.interviewSettings || interviewSettings,
//         },
//       };
//     } catch (error) {
//       console.error("Error in generateNextQuestion:", error.message);

//       // Fallback logic
//       const shouldEnd = questionCount > maxQuestions;
//       const isQuestion = questionCount <= maxQuestions;

//       return {
//         response: shouldEnd
//           ? "Thank you for your responses. This concludes our interview."
//           : questionCount === maxQuestions
//           ? "As our final question, can you tell me why you believe you would be a great fit for this role?"
//           : "Can you share an example of how you've applied your skills to solve a problem in this field?",
//         feedback: "Thank you for sharing.",
//         is_question: isQuestion,
//         should_end_interview: shouldEnd,
//         updated_context_state: {
//           ...contextState,
//           questionsAsked: [
//             ...questionsAsked,
//             shouldEnd
//               ? "Interview concluded"
//               : questionCount === maxQuestions
//               ? "Final question asked"
//               : "Follow-up question",
//           ],
//           currentQuestionIndex: shouldEnd ? currentIndex : currentIndex + 1,
//           interviewSettings:
//             contextState.interviewSettings || interviewSettings,
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
//         strengths: [
//           "Good communication",
//           "Relevant experience",
//           "Professional demeanor",
//         ],
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
//             interviewSettings: {
//               type: "object",
//               description: "Interview settings",
//             },
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
//             userMessage: {
//               type: "string",
//               description: "Candidate's response",
//             },
//             contextState: {
//               type: "object",
//               description: "Current interview context",
//             },
//             questionCount: {
//               type: "number",
//               description: "Current question count",
//             },
//           },
//           required: [
//             "sessionId",
//             "userMessage",
//             "contextState",
//             "questionCount",
//           ],
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
//             interviewTranscript: {
//               type: "array",
//               description: "Complete interview transcript",
//             },
//             finalContextState: {
//               type: "object",
//               description: "Final interview context",
//             },
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
//             resumeIds: {
//               type: "array",
//               description: "Multiple resume IDs for batch sending",
//             },
//             company: { type: "string", description: "Company name" },
//             jobTitle: { type: "string", description: "Job title" },
//             interviewSettings: {
//               type: "object",
//               description: "Interview configuration",
//             },
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
// export async function handleInitializeInterview({
//   jobId,
//   resumeId,
//   interviewSettings = {},
// }) {
//   if (!jobId || !resumeId || !interviewSettings) {
//     throw new McpError(
//       ErrorCode.InvalidParams,
//       "jobId, resumeId, and interviewSettings are required"
//     );
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
//           jobDetails: {
//             title: job.context,
//             description: job.markdown_description,
//           },
//           candidateDetails: { name: resume.candidateName, email: resume.email },
//           maxQuestions: interviewSettings.maxQuestions || 5,
//           contextState,
//           initialPrompt,
//           success: true,
//         }),
//       },
//     ],
//   };

//   console.log(
//     "Sending initialize response:",
//     JSON.stringify(response, null, 2)
//   );
//   return response;
// }

// export async function handleProcessResponse({
//   sessionId,
//   userMessage,
//   contextState,
//   questionCount,
// }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(
//       ErrorCode.InvalidParams,
//       "sessionId, userMessage, and contextState are required"
//     );
//   }

//   console.log("Received /api/process params:", {
//     sessionId,
//     userMessage,
//     questionCount,
//   });

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

//   const responseData = await FastAIInterviewService.generateNextQuestion(
//     userMessage,
//     contextState,
//     job.markdown_description || job.context || "",
//     questionCount,
//     maxQuestions,
//     contextState.interviewSettings || {}
//   );

//   const {
//     response,
//     feedback,
//     is_question,
//     should_end_interview,
//     updated_context_state,
//   } = responseData;

//   await MCPSession.updateOne(
//     { sessionId },
//     { $set: { contextState: updated_context_state } }
//   );

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
//       { runValidators: true }
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
//     throw new McpError(
//       ErrorCode.InternalError,
//       `Failed to save interaction: ${error.message}`
//     );
//   }

//   const responsePayload = {
//     response,
//     feedback,
//     is_question,
//     should_end_interview,
//     updated_context_state,
//     success: true,
//   };

//   console.log(
//     "Returning /api/process response:",
//     JSON.stringify(responsePayload, null, 2)
//   );

//   return {
//     content: [
//       {
//         type: "text",
//         text: JSON.stringify(responsePayload),
//       },
//     ],
//   };
// }

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
//     throw new McpError(
//       ErrorCode.InvalidParams,
//       "All required fields must be provided"
//     );
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
//     .map(
//       (msg) =>
//         `${msg.type === "user" ? "Candidate" : "Interviewer"}: ${msg.content}`
//     )
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

//   const resume = await Resume.findById(resumeId);

//   // Create and emit notification
//   const newNotification = new Notification({
//     message: `${
//       resume?.candidateName
//     } AI Agent Interviewed`,
//     recipientId: userId,
//     resumeId,
//   });
//   await newNotification.save();
//   io.emit("newNotification", newNotification);

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
//         return originalStdoutWrite.call(
//           process.stdout,
//           data,
//           encoding,
//           callback
//         );
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
//   await server.connect(transport);
//   console.error("AI Interview MCP Server running on stdio");
// }

// main().catch((error) => {
//   console.error("Server error:", error);
//   process.exit(1);
// });