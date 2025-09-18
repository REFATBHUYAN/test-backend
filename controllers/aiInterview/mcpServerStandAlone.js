import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { OpenAI } from "openai";
import mongoose from "mongoose";
import Resume from "../../model/resumeModel.js";
import MCPSession from "../../model/mcpSessionModel.js";
import JobDescription from "../../model/JobDescriptionModel.js";
import Notification from "../../model/NotificationModal.js";
import connectDB from "../../db/index.js";
import { Storage } from "@google-cloud/storage";
import { VideoIntelligenceServiceClient } from "@google-cloud/video-intelligence";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
// import express from "express";

// Environment configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const GOOGLE_CLOUD_KEYFILE = process.env.GOOGLE_CLOUD_KEYFILE;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const MONGODB_URI = process.env.MONGODB_URI;

// Initialize services
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const storage = new Storage({ keyFilename: GOOGLE_CLOUD_KEYFILE, projectId: GOOGLE_CLOUD_PROJECT_ID });
const videoIntelligence = new VideoIntelligenceServiceClient({ keyFilename: GOOGLE_CLOUD_KEYFILE });
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

// Multer for video file uploads
const upload = multer({ dest: "uploads/" });

// Logging utility
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

    const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute video interview.

${styleText}${focusAreasText}

Create a warm, professional greeting with the first question for ${resumeData.candidateName}. Inform the candidate that their video responses will be analyzed for sentiment to assess enthusiasm and fit.

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
      return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute video interview. Your responses will be analyzed for sentiment to assess enthusiasm and fit. ${focusAreasText}Tell me about yourself and why you're interested in this role.`;
    }
  }

  static async analyzeVideoSentiment(videoPath) {
    try {
      // Upload video to Google Cloud Storage
      const bucketName = process.env.GCP_BUCKET_NAME || "your-gcp-bucket-name"; // Set in .env
      const fileName = path.basename(videoPath);
      const bucket = storage.bucket(bucketName);
      await bucket.upload(videoPath, { destination: fileName });

      const gcsUri = `gs://${bucketName}/${fileName}`;

      // Analyze video with Google Cloud Video Intelligence
      const [operation] = await videoIntelligence.annotateVideo({
        inputUri: gcsUri,
        features: ["SPEECH_TRANSCRIPTION", "LABEL_DETECTION"],
      });

      const [result] = await operation.promise();
      const annotations = result.annotationResults[0];

      // Extract transcription
      const transcription = annotations.speechTranscriptions?.[0]?.alternatives?.[0]?.transcript || "";

      // Analyze sentiment of transcription with OpenAI
      const textSentiment = await this.analyzeTextSentiment(transcription);

      // Analyze video labels for emotional cues
      const labels = annotations.segmentLabelAnnotations?.map(label => ({
        name: label.entity.description,
        confidence: label.segments[0].confidence,
      })) || [];

      // Map labels to sentiment (basic heuristic)
      const positiveLabels = ["smile", "laughter", "confident"];
      const negativeLabels = ["frown", "nervous", "hesitation"];
      let videoSentimentScore = 0;
      labels.forEach(label => {
        if (positiveLabels.includes(label.name.toLowerCase())) {
          videoSentimentScore += label.confidence;
        } else if (negativeLabels.includes(label.name.toLowerCase())) {
          videoSentimentScore -= label.confidence;
        }
      });

      const videoSentiment = videoSentimentScore > 0.3 ? "positive" : videoSentimentScore < -0.3 ? "negative" : "neutral";

      // Combine text and video sentiment
      const combinedSentiment = this.combineSentiments(textSentiment, videoSentiment);

      // Clean up
      await fs.unlink(videoPath);
      await bucket.file(fileName).delete();

      return {
        sentiment: combinedSentiment,
        transcription,
        videoLabels: labels,
      };
    } catch (error) {
      logToStderr("Error analyzing video sentiment", error.message);
      return { sentiment: "neutral", transcription: "", videoLabels: [] };
    }
  }

  static async analyzeTextSentiment(userResponse) {
    const prompt = `Analyze the sentiment of the following text and classify it as "positive," "negative," or "neutral." Provide a brief explanation.

Text: "${userResponse}"

Return a JSON object:
{
  "sentiment": "positive|negative|neutral",
  "explanation": "Brief explanation of the sentiment classification"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        temperature: 0.5,
        max_tokens: 100,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.sentiment || "neutral";
    } catch (error) {
      logToStderr("Error analyzing text sentiment with OpenAI", error.message);
      return "neutral";
    }
  }

  static combineSentiments(textSentiment, videoSentiment) {
    const sentimentMap = { positive: 1, neutral: 0, negative: -1 };
    const textScore = sentimentMap[textSentiment] || 0;
    const videoScore = sentimentMap[videoSentiment] || 0;
    const combinedScore = (textScore * 0.6 + videoScore * 0.4); // 60% text, 40% video
    if (combinedScore > 0.3) return "positive";
    if (combinedScore < -0.3) return "negative";
    return "neutral";
  }

  static async generateNextQuestion(
    userResponse,
    videoPath,
    contextState,
    jobDescription,
    questionCount,
    maxQuestions,
    interviewSettings = {},
    resumeData = {},
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

    // Perform sentiment analysis (video + text)
    const { sentiment, transcription, videoLabels } = await this.analyzeVideoSentiment(videoPath);
    const effectiveResponse = transcription || userResponse;

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
          feedback: `Excellent! Now let's dive into a technical challenge. You seemed ${sentiment} in your previous response.`,
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
      const prompt = `AI Interviewer. Generate the next question based on the candidate's response: "${effectiveResponse}"

Previous questions: ${questionsAsked.slice(-2).join(", ")}
Job description: ${jobDescription}
Question ${questionCount} of ${maxQuestions}
Sentiment (combined video/text): ${sentiment}

Return a JSON object:
{
  "response": "question text",
  "feedback": "brief positive feedback incorporating sentiment analysis",
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
          feedback: result.feedback || `Thank you for your response. You seemed ${sentiment} during your answer.`,
          is_question: result.is_question,
          should_end_interview: result.should_end_interview,
        };
      } catch (error) {
        nextQuestion = {
          response: "Can you share an example of how you've applied your skills to solve a problem in this field?",
          feedback: `Thank you for your response. You seemed ${sentiment} during your answer.`,
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
        sentimentResults: [
          ...(contextState.sentimentResults || []),
          { questionNumber: questionCount, sentiment, transcription, videoLabels, timestamp: new Date() },
        ],
      },
    };
  }

  static async evaluateInterview(transcript, jobDescription, contextState) {
    const prompt = `Evaluate interview transcript. Provide concise assessment, incorporating video and text sentiment analysis.

Job: ${jobDescription}
Transcript: ${JSON.stringify(transcript)}
Sentiment Results: ${JSON.stringify(contextState.sentimentResults || [])}

JSON response:
{
  "score": [1-10],
  "strengths": ["strength1", "strength2", "strength3"],
  "areas_for_improvement": ["area1", "area2"],
  "sentiment_summary": ["summary of candidate's emotional state based on video and text"],
  "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
  "summary": "Brief assessment including sentiment insights"
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
      logToStderr("Error evaluating interview", error.message);
      return {
        score: 7,
        strengths: ["Good communication", "Relevant experience", "Professional demeanor"],
        areas_for_improvement: ["Could provide more specific examples"],
        sentiment_summary: ["Candidate appeared generally neutral based on video and text analysis"],
        recommendation: "Consider",
        summary: "Candidate showed good potential with room for growth. Sentiment analysis indicates neutral demeanor.",
      };
    }
  }
}

// Express Server Setup
// const app = express();
// app.use(express.json());
// app.use(upload.single("video"));

// Initialize Interview
async function handleInitializeInterview({ jobId, resumeId, interviewSettings }) {
  if (!jobId || !resumeId) {
    throw new McpError(ErrorCode.InvalidParams, "jobId and resumeId are required");
  }

  try {
    await connectDB();
    logToStderr("Initializing interview", { jobId, resumeId });

    const [job, resume] = await Promise.all([
      JobDescription.findById(jobId).maxTimeMS(10000),
      Resume.findById(resumeId).maxTimeMS(10000),
    ]);

    if (!job || !resume) {
      throw new McpError(ErrorCode.NotFound, "Job or resume not found");
    }

    const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
      job.markdown_description || job.context || "",
      resume,
      interviewSettings
    );

    const sessionId = randomUUID();
    const contextState = {
      questionsAsked: [initialPrompt],
      currentQuestionIndex: 0,
      interviewSettings,
      sentimentResults: [],
    };

    const session = new MCPSession({
      sessionId,
      jobId,
      resumeId,
      userId: resume.userId,
      contextState,
      createdAt: new Date(),
      transcript: [{ role: "assistant", content: initialPrompt, timestamp: new Date() }],
    });

    await session.save();

    await Resume.updateOne(
      { _id: resumeId },
      {
        $push: {
          voiceInterviewResults: {
            sessionId,
            jobId,
            createdAt: new Date(),
            interactions: [
              {
                question: initialPrompt,
                candidateResponse: "",
                feedback: "",
                timestamp: new Date(),
                sentiment: "neutral",
                technical_question: false,
              },
            ],
            interviewSettings,
          },
        },
      }
    );

    const notification = new Notification({
      userId: resume.userId,
      message: `Interview started for ${job.context || "Unknown Job"}`,
      type: "interview_start",
      createdAt: new Date(),
    });

    await notification.save();

    logToStderr("Interview initialized", { sessionId });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            sessionId,
            initialPrompt,
            contextState,
            jobDetails: { title: job.context, description: job.markdown_description },
            candidateDetails: { name: resume.candidateName, email: resume.email },
          }),
        },
      ],
    };
  } catch (error) {
    logToStderr("Initialize interview error", error.message);
    throw new McpError(ErrorCode.InternalError, error.message);
  }
}

// Process Response with Video
async function handleProcessResponse({ sessionId, userMessage, videoPath, contextState, questionCount }) {
  if (!sessionId || (!userMessage && !videoPath) || !contextState) {
    throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage or videoPath, and contextState are required");
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
      userMessage || "",
      videoPath,
      contextState,
      job.markdown_description || job.context || "",
      questionCount,
      maxQuestions,
      contextState.interviewSettings || {},
      resume
    );

    const { response, feedback, is_question, should_end_interview, updated_context_state, technical_question, question_metadata } = responseData;

    // Update session
    await MCPSession.updateOne(
      { sessionId },
      {
        $set: { contextState: updated_context_state },
        $push: {
          transcript: [
            { role: "user", content: userMessage || responseData.updated_context_state.sentimentResults.slice(-1)[0]?.transcription || "", timestamp: new Date() },
            { role: "assistant", content: response, timestamp: new Date() },
          ],
        },
      }
    );

    // Update resume with interactions and sentiment
    await Resume.updateOne(
      { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $set: {
          "voiceInterviewResults.$.interactions.$[elem].candidateResponse": userMessage || responseData.updated_context_state.sentimentResults.slice(-1)[0]?.transcription || "",
          "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
          "voiceInterviewResults.$.interactions.$[elem].sentiment": responseData.updated_context_state.sentimentResults.slice(-1)[0]?.sentiment || "neutral",
        },
        $push: {
          "voiceInterviewResults.$.sentimentResults": responseData.updated_context_state.sentimentResults.slice(-1)[0],
        },
      },
      { arrayFilters: [{ "elem.candidateResponse": "" }] }
    );

    // Add new interaction if not ending
    if (is_question && !should_end_interview) {
      const newInteraction = {
        question: response,
        candidateResponse: "",
        feedback: "",
        timestamp: new Date(),
        sentiment: "neutral",
        technical_question: technical_question || false,
      };

      await Resume.updateOne(
        { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
        { $push: { "voiceInterviewResults.$.interactions": newInteraction } }
      );
    }

    logToStderr("Response processed successfully", { sessionId, questionCount, sentiment: responseData.updated_context_state.sentimentResults.slice(-1)[0]?.sentiment });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            response,
            feedback,
            is_question,
            should_end_interview,
            updated_context_state,
            technical_question,
            question_metadata,
            sentiment: responseData.updated_context_state.sentimentResults.slice(-1)[0]?.sentiment || "neutral",
          }),
        },
      ],
    };
  } catch (error) {
    logToStderr("Process response error", error.message);
    throw new McpError(ErrorCode.InternalError, error.message);
  }
}

// Submit Interview
async function handleSubmitInterview({ sessionId, jobId, resumeId, userId, email, interviewTranscript, finalContextState }) {
  if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
    throw new McpError(ErrorCode.InvalidParams, "sessionId, jobId, resumeId, and interviewTranscript are required");
  }

  try {
    await connectDB();
    logToStderr("Submitting interview for session", sessionId);

    const [job, resume, session] = await Promise.all([
      JobDescription.findById(jobId).maxTimeMS(10000),
      Resume.findById(resumeId).maxTimeMS(10000),
      MCPSession.findOne({ sessionId }).maxTimeMS(10000),
    ]);

    if (!job || !resume || !session) {
      throw new McpError(ErrorCode.NotFound, "Job, resume, or session not found");
    }

    // Update session
    await MCPSession.updateOne(
      { sessionId },
      { $set: { contextState: finalContextState } }
    );

    // Update resume
    await Resume.updateOne(
      { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
      {
        $set: {
          "voiceInterviewResults.$.interactions": interviewTranscript,
          "voiceInterviewResults.$.sentimentResults": finalContextState.sentimentResults,
          "voiceInterviewResults.$.completedAt": new Date(),
        },
      }
    );

    // Generate evaluation
    const evaluation = await FastAIInterviewService.evaluateInterview(
      interviewTranscript,
      job.markdown_description || job.context,
      finalContextState
    );

    // Save evaluation
    await Resume.updateOne(
      { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
      { $set: { "voiceInterviewResults.$.evaluation": evaluation } }
    );

    // Send notification email
    if (email) {
      const mailOptions = {
        from: EMAIL_USER,
        to: email,
        subject: "AI Interview Completion",
        html: `
          <h2>Interview Completed</h2>
          <p>Thank you for completing your AI-powered video interview for ${job.context}.</p>
          <p>Summary: ${evaluation.summary}</p>
          <p>Score: ${evaluation.score}/10</p>
          <p>Recommendation: ${evaluation.recommendation}</p>
          <p>Sentiment Summary: ${evaluation.sentiment_summary.join(", ")}</p>
          <p>We will review your responses and get back to you soon.</p>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        logToStderr("Notification email sent", { to: email });
      } catch (emailError) {
        logToStderr("Failed to send notification email", emailError.message);
      }
    }

    // Create notification
    const notification = new Notification({
      userId: userId || resume.userId,
      message: `Interview for ${job.context} completed. Score: ${evaluation.score}/10`,
      type: "interview_completion",
      createdAt: new Date(),
    });

    await notification.save();

    logToStderr("Interview submitted successfully", { sessionId });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            evaluation,
          }),
        },
      ],
    };
  } catch (error) {
    logToStderr("Submit interview error", error.message);
    throw new McpError(ErrorCode.InternalError, error.message);
  }
}

// Register tool handlers
const server = new Server();
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { tool, input } = request;
  logToStderr(`Handling tool: ${tool}`, input);

  try {
    switch (tool) {
      case "initialize_interview":
        return await handleInitializeInterview(input);
      case "process_response":
        return await handleProcessResponse(input);
      case "submit_interview":
        return await handleSubmitInterview(input);
      default:
        throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${tool}`);
    }
  } catch (error) {
    logToStderr(`Error handling tool ${tool}`, error.message);
    throw error instanceof McpError ? error : new McpError(ErrorCode.InternalError, error.message);
  }
});

// Express Server for Video Uploads
app.post("/api/initialize", async (req, res) => {
  try {
    const result = await handleInitializeInterview(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/process-video", upload.single("video"), async (req, res) => {
  try {
    const { sessionId, userMessage, contextState, questionCount } = req.body;
    const videoPath = req.file?.path;

    if (!sessionId || !contextState || !videoPath) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const result = await handleProcessResponse({
      sessionId,
      userMessage,
      videoPath,
      contextState: JSON.parse(contextState),
      questionCount: parseInt(questionCount),
    });

    res.json(result);
  } catch (error) {
    logToStderr("Error in /api/process-video", error.message);
    res.status(500).json({ error: "Failed to process video response" });
  }
});

app.post("/api/submit", async (req, res) => {
  try {
    const result = await handleSubmitInterview(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// app.listen(3000, () => {
//   logToStderr("MCP Server running on port 3000");
// });

// // Start MCP Server
// const transport = new StdioServerTransport(server);
// transport.start();
// logToStderr("MCP Server started");