// import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import {
//   CallToolRequestSchema,
//   ListToolsRequestSchema,
// } from "@modelcontextprotocol/sdk/types.js";
// import { randomUUID } from "node:crypto";
// import nodemailer from "nodemailer";
// import { ChatOpenAI } from "@langchain/openai";
// import mongoose from "mongoose";
// import Resume from "../../model/resumeModel.js";
// import MCPSession from "../../model/mcpSessionModel.js";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import connectDB from "../../db/index.js";
// import path from "path";
// import { fileURLToPath } from "url";
// import { dirname } from "path";
// import ffmpeg from "fluent-ffmpeg";
// import ffmpegStatic from "ffmpeg-static";
// import cloudinary from "cloudinary";

// // Set FFmpeg path
// ffmpeg.setFfmpegPath(ffmpegStatic);

// // Get __dirname equivalent in ES modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// // Use the shared uploads directory from the root
// const rootDir = path.resolve(__dirname, "../..");
// const uploadsDir = path.join(rootDir, "Uploads");

// // Environment configuration
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const EMAIL_USER = process.env.EMAIL_USER;
// const EMAIL_PASS = process.env.EMAIL_PASS;
// const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
// const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
// const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
// const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN;

// // Enhanced logging utility
// function logToStderr(message, data = null) {
//   const timestamp = new Date().toISOString();
//   const logMessage = data
//     ? `[${timestamp}] MCP Server: ${message} - ${JSON.stringify(data, null, 2)}`
//     : `[${timestamp}] MCP Server: ${message}`;
//   process.stderr.write(logMessage + "\n");
// }

// // Validate environment variables
// if (!HUGGINGFACE_API_TOKEN || !OPENAI_API_KEY || !EMAIL_USER || !EMAIL_PASS) {
//   logToStderr("Missing required environment variables", {
//     HUGGINGFACE_API_TOKEN: !!HUGGINGFACE_API_TOKEN,
//     OPENAI_API_KEY: !!OPENAI_API_KEY,
//     EMAIL_USER: !!EMAIL_USER,
//     EMAIL_PASS: !!EMAIL_PASS,
//   });
//   process.exit(1);
// }

// // Initialize services
// const openai = new ChatOpenAI({
//   apiKey: OPENAI_API_KEY,
//   modelName: "gpt-4o-mini",
// });
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: { user: EMAIL_USER, pass: EMAIL_PASS },
// });

// cloudinary.v2.config({
//   cloud_name: CLOUDINARY_CLOUD_NAME,
//   api_key: CLOUDINARY_API_KEY,
//   api_secret: CLOUDINARY_API_SECRET,
// });

// logToStderr("MCP Server initializing...");
// logToStderr("Environment check", {
//   uploadsDir,
//   hasOpenAI: !!OPENAI_API_KEY,
//   hasHuggingFace: !!HUGGINGFACE_API_TOKEN,
// });


// // Simple AI Interview Service
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
//       const response = await openai.invoke([
//         { role: "system", content: prompt },
//       ]);
//       const content = response.content.trim();

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
//         logToStderr("Parse error in technical question", parseError.message);
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
//       logToStderr("Error generating technical question", error.message);
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
//       const response = await openai.invoke([
//         { role: "system", content: prompt },
//       ]);
//       return response.content.trim();
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
//         logToStderr("Error generating technical question", error.message);
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
//         const response = await openai.invoke([
//           { role: "system", content: prompt },
//         ]);
//         const result = JSON.parse(response.content.trim());
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
// Transcript: ${JSON.stringify(transcript)}

// JSON response:
// {
//   "score": [1-10],
//   "strengths": ["strength1", "strength2", "strength3"],
//   "areas_for_improvement": ["area1", "area2"],
//   "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
//   "summary": "Brief assessment"
// }`;

//     try {
//       const response = await openai.invoke([
//         { role: "system", content: prompt },
//       ]);
//       return JSON.parse(response.content.trim());
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

// // Tool handlers
// async function handleInitializeInterview({
//   jobId,
//   resumeId,
//   interviewSettings,
// }) {
//   logToStderr("Starting initialize_interview handler", { jobId, resumeId });

//   if (!jobId || !resumeId) {
//     logToStderr("Missing required parameters", { jobId, resumeId });
//     throw new Error("jobId and resumeId are required");
//   }

//   try {
//     logToStderr("Connecting to database...");
//     await connectDB();
//     logToStderr("Database connected successfully");

//     logToStderr("Fetching job and resume data...");
//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(10000),
//       Resume.findById(resumeId).maxTimeMS(10000),
//     ]);

//     if (!job || !resume) {
//       logToStderr("Job or resume not found", {
//         jobFound: !!job,
//         resumeFound: !!resume,
//       });
//       throw new Error("Job or resume not found");
//     }

//     logToStderr("Generating initial prompt...");
//     const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
//       job.markdown_description || job.context || "",
//       resume,
//       interviewSettings
//     );
//     logToStderr("Initial prompt generated", {
//       promptLength: initialPrompt.length,
//     });

//     const sessionId = randomUUID();
//     const contextState = {
//       questionsAsked: [initialPrompt],
//       currentQuestionIndex: 0,
//       interviewSettings,
//     };

//     logToStderr("Creating session...", { sessionId });
//     const session = new MCPSession({
//       sessionId,
//       jobId,
//       resumeId,
//       userId: resume.userId,
//       contextState,
//       createdAt: new Date(),
//       transcript: [
//         { role: "assistant", content: initialPrompt, timestamp: new Date() },
//       ],
//     });

//     await session.save();
//     logToStderr("Session saved successfully", { sessionId });

//     const responseData = {
//       success: true,
//       sessionId,
//       initialPrompt,
//       contextState,
//       jobDetails: { title: job.context, description: job.markdown_description },
//       candidateDetails: { name: resume.candidateName, email: resume.email },
//     };

//     logToStderr("Interview initialized successfully", { sessionId });

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(responseData),
//         },
//       ],
//     };
//   } catch (error) {
//     logToStderr("Initialize interview error", {
//       error: error.message,
//       stack: error.stack,
//     });
//     throw new Error(`Failed to initialize interview: ${error.message}`);
//   }
// }

// async function handleProcessResponse({
//   sessionId,
//   userMessage,
//   videoPath,
//   contextState,
//   questionCount,
// }) {
//   logToStderr("Starting process_response handler", {
//     sessionId,
//     questionCount,
//     userMessage,
//   });

//   if (!sessionId || !contextState) {
//     logToStderr("Missing required parameters", {
//       sessionId: !!sessionId,
//       contextState: !!contextState,
//     });
//     throw new Error("sessionId and contextState are required");
//   }

//   try {
//     await connectDB();
//     logToStderr("Database connected for process_response");

//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000);
//     if (!session) {
//       logToStderr("Session not found", { sessionId });
//       throw new Error("Session not found");
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(10000),
//       Resume.findById(session.resumeId).maxTimeMS(10000),
//     ]);

//     if (!job || !resume) {
//       logToStderr("Job or resume not found for session", {
//         jobFound: !!job,
//         resumeFound: !!resume,
//       });
//       throw new Error("Job or resume not found");
//     }

//     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5;
//     logToStderr("Generating next question...", { questionCount, maxQuestions });

//     const responseData = await FastAIInterviewService.generateNextQuestion(
//       userMessage || "No response provided",
//       contextState,
//       job.markdown_description || job.context || "",
//       questionCount,
//       maxQuestions,
//       contextState.interviewSettings,
//       resume
//     );

//     const {
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       transcription,
//     } = responseData;

//     logToStderr("Updating session with new data...");
//     await MCPSession.updateOne(
//       { sessionId },
//       {
//         $set: { contextState: updated_context_state },
//         $push: {
//           transcript: [
//             {
//               role: "user",
//               content: transcription || userMessage || "No response",
//               timestamp: new Date(),
//             },
//             { role: "assistant", content: response, timestamp: new Date() },
//           ],
//         },
//       }
//     );
//     logToStderr("Session updated successfully");

//     const finalResponseData = {
//       success: true,
//       response,
//       feedback,
//       is_question,
//       should_end_interview,
//       updated_context_state,
//       transcription: transcription || "No transcription available",
//     };

//     logToStderr("Response processed successfully", {
//       sessionId,
//       questionCount,
//     });

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(finalResponseData),
//         },
//       ],
//     };
//   } catch (error) {
//     logToStderr("Process response error", {
//       error: error.message,
//       stack: error.stack,
//     });
//     throw new Error(`Failed to process response: ${error.message}`);
//   }
// }

// async function handleSubmitInterview({
//   sessionId,
//   jobId,
//   resumeId,
//   userId,
//   email,
//   interviewTranscript,
// }) {
//   logToStderr("Starting submit_interview handler", { sessionId });

//   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//     logToStderr("Missing required parameters for submit", {
//       sessionId: !!sessionId,
//       jobId: !!jobId,
//       resumeId: !!resumeId,
//       interviewTranscript: !!interviewTranscript,
//     });
//     throw new Error(
//       "sessionId, jobId, resumeId, and interviewTranscript are required"
//     );
//   }

//   try {
//     await connectDB();
//     logToStderr("Database connected for submit_interview");

//     const [job, resume, session] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(10000),
//       Resume.findById(resumeId).maxTimeMS(10000),
//       MCPSession.findOne({ sessionId }).maxTimeMS(10000),
//     ]);

//     if (!job || !resume || !session) {
//       logToStderr("Required data not found", {
//         jobFound: !!job,
//         resumeFound: !!resume,
//         sessionFound: !!session,
//       });
//       throw new Error("Job, resume, or session not found");
//     }

//     await MCPSession.updateOne(
//       { sessionId },
//       {
//         $set: {
//           completedAt: new Date(),
//           status: "completed",
//         },
//       }
//     );

//     logToStderr("Generating interview evaluation...");
//     const evaluation = await FastAIInterviewService.evaluateInterview(
//       interviewTranscript,
//       job.markdown_description || job.context || "",
//       session.contextState
//     );
//     logToStderr("Interview evaluation generated", { score: evaluation.score });

//     if (email) {
//       const mailOptions = {
//         from: EMAIL_USER,
//         to: email,
//         subject: "AI Interview Completion",
//         html: `
//           <h2>Interview Completed</h2>
//           <p>Thank you for completing your AI-powered video interview for ${
//             job.context || "the position"
//           }.</p>
//           <p><strong>Summary:</strong> ${evaluation.summary}</p>
//           <p><strong>Score:</strong> ${evaluation.score}/10</p>
//           <p><strong>Recommendation:</strong> ${evaluation.recommendation}</p>
//           <p>We will review your responses and get back to you soon with next steps.</p>
//         `,
//       };

//       try {
//         await transporter.sendMail(mailOptions);
//         logToStderr("Notification email sent", { to: email });
//       } catch (emailError) {
//         logToStderr("Failed to send notification email", {
//           error: emailError.message,
//         });
//       }
//     }

//     const finalResponseData = {
//       success: true,
//       sessionId,
//       evaluation,
//     };

//     logToStderr("Interview submitted successfully", {
//       sessionId,
//       score: evaluation.score,
//     });

//     return {
//       content: [
//         {
//           type: "text",
//           text: JSON.stringify(finalResponseData),
//         },
//       ],
//     };
//   } catch (error) {
//     logToStderr("Submit interview error", {
//       error: error.message,
//       stack: error.stack,
//     });
//     throw new Error(`Failed to submit interview: ${error.message}`);
//   }
// }

// // Create MCP Server instance
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

// logToStderr("MCP Server instance created");

// // List available tools
// server.setRequestHandler(ListToolsRequestSchema, async () => {
//   logToStderr("Listing available tools");
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
//               description: "Interview configuration settings",
//             },
//           },
//           required: ["jobId", "resumeId"],
//         },
//       },
//       {
//         name: "process_response",
//         description:
//           "Process candidate video response and generate next question",
//         inputSchema: {
//           type: "object",
//           properties: {
//             sessionId: { type: "string", description: "Interview session ID" },
//             userMessage: {
//               type: "string",
//               description: "Text message from user",
//             },
//             videoPath: {
//               type: "string",
//               description: "Path to uploaded video file",
//             },
//             contextState: {
//               type: "object",
//               description: "Current interview context",
//             },
//             questionCount: {
//               type: "number",
//               description: "Current question number",
//             },
//           },
//           required: ["sessionId", "contextState"],
//         },
//       },
//       {
//         name: "submit_interview",
//         description: "Submit completed interview for evaluation",
//         inputSchema: {
//           type: "object",
//           properties: {
//             sessionId: { type: "string", description: "Interview session ID" },
//             jobId: { type: "string", description: "Job description ID" },
//             resumeId: { type: "string", description: "Resume ID" },
//             userId: { type: "string", description: "User ID" },
//             email: { type: "string", description: "User email" },
//             interviewTranscript: {
//               type: "array",
//               description: "Complete interview transcript",
//             },
//           },
//           required: ["sessionId", "jobId", "resumeId", "interviewTranscript"],
//         },
//       },
//     ],
//   };
// });

// logToStderr("Tools list handler registered");

// // Handle tool calls with proper JSON-RPC 2.0 response format
// server.setRequestHandler(CallToolRequestSchema, async (request) => {
//   const { name, arguments: args } = request.params;
//   logToStderr(`Received tool call: ${name}`, {
//     arguments: args,
//     availableMethods: ["initialize_interview", "process_response", "submit_interview"],
//   });

//   try {
//     let result;
//     switch (name) {
//       case "initialize_interview":
//         logToStderr("Processing initialize_interview");
//         result = await handleInitializeInterview(args);
//         break;
//       case "process_response":
//         logToStderr("Processing process_response");
//         result = await handleProcessResponse(args);
//         break;
//       case "submit_interview":
//         logToStderr("Processing submit_interview");
//         result = await handleSubmitInterview(args);
//         break;
//       default:
//         logToStderr(`Unknown tool requested: ${name}`);
//         throw new Error(`Unknown tool: ${name}`);
//     }

//     logToStderr(`Tool ${name} processed successfully`);
//     return {
//       jsonrpc: "2.0",
//       id: request.id,
//       result: result,
//     };
//   } catch (error) {
//     logToStderr(`Tool execution error for ${name}`, {
//       error: error.message,
//       stack: error.stack,
//     });

//     return {
//       jsonrpc: "2.0",
//       id: request.id,
//       error: {
//         code: -32603,
//         message: error.message,
//         data: {
//           stack: error.stack,
//         },
//       },
//     };
//   }
// });

// logToStderr("Tool call handler registered");



// // Start the server
// async function main() {
//   logToStderr("Starting MCP Server main function...");

//   try {
//     logToStderr("Connecting to database...");
//     await connectDB();
//     logToStderr("Database connected successfully");

//     logToStderr("Creating stdio transport...");
//     const transport = new StdioServerTransport();

//     logToStderr("Connecting server to transport...");
//     await server.connect(transport);

//     logToStderr("MCP Server started successfully");

//     console.log("MCP Server ready");
//   } catch (error) {
//     logToStderr("Failed to start MCP Server", {
//       error: error.message,
//       stack: error.stack,
//     });
//     process.exit(1);
//   }
// }

// // Error handling
// process.on("uncaughtException", (error) => {
//   logToStderr("Uncaught exception", {
//     error: error.message,
//     stack: error.stack,
//   });
//   process.exit(1);
// });

// process.on("unhandledRejection", (reason, promise) => {
//   logToStderr("Unhandled rejection", { reason: reason?.message || reason });
//   process.exit(1);
// });

// // Graceful shutdown
// process.on("SIGINT", async () => {
//   logToStderr("Received SIGINT, shutting down gracefully...");
//   try {
//     await server.close();
//     await mongoose.connection.close();
//     logToStderr("MCP Server and database connection closed successfully");
//   } catch (error) {
//     logToStderr("Error during shutdown", { error: error.message });
//   }
//   process.exit(0);
// });

// process.on("SIGTERM", async () => {
//   logToStderr("Received SIGTERM, shutting down gracefully...");
//   try {
//     await server.close();
//     await mongoose.connection.close();
//     logToStderr("MCP Server and database connection closed successfully");
//   } catch (error) {
//     logToStderr("Error during shutdown", { error: error.message });
//   }
//   process.exit(0);
// });

// // Start the server
// logToStderr("About to call main function...");
// main().catch((error) => {
//   logToStderr("Fatal error starting server", {
//     error: error.message,
//     stack: error.stack,
//   });
//   process.exit(1);
// });

// // ------ working with video response but not saved question and answer in the database ------
// // This file implements the MCP server for AI-powered interview management.

// // import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"
// // import { randomUUID } from "node:crypto"
// // import nodemailer from "nodemailer"
// // import { OpenAI } from "openai"
// // import Resume from "../../model/resumeModel.js"
// // import MCPSession from "../../model/mcpSessionModel.js"
// // import JobDescription from "../../model/JobDescriptionModel.js"
// // import Notification from "../../model/NotificationModal.js"
// // import connectDB from "../../db/index.js"
// // import fs from "fs/promises"
// // import path from "path"
// // import { fileURLToPath } from "url"
// // import { dirname } from "path"
// // import ffmpeg from "fluent-ffmpeg"
// // import ffmpegStatic from "ffmpeg-static"
// // import cloudinary from "cloudinary"

// // // Set FFmpeg path
// // ffmpeg.setFfmpegPath(ffmpegStatic)

// // // Get __dirname equivalent in ES modules
// // const __filename = fileURLToPath(import.meta.url)
// // const __dirname = dirname(__filename)

// // // Create uploads directory
// // await fs.mkdir(path.join(__dirname, "uploads"), { recursive: true })

// // // Environment configuration
// // const OPENAI_API_KEY = process.env.OPENAI_API_KEY
// // const EMAIL_USER = process.env.EMAIL_USER
// // const EMAIL_PASS = process.env.EMAIL_PASS
// // const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME
// // const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY
// // const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET
// // const HUGGINGFACE_API_TOKEN = process.env.HUGGINGFACE_API_TOKEN

// // // Validate environment variables
// // if (!HUGGINGFACE_API_TOKEN || !OPENAI_API_KEY || !EMAIL_USER || !EMAIL_PASS) {
// //   console.error("Missing required environment variables")
// //   process.exit(1)
// // }

// // // Initialize services
// // const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
// // const transporter = nodemailer.createTransport({
// //   service: "gmail",
// //   auth: { user: EMAIL_USER, pass: EMAIL_PASS },
// // })

// // cloudinary.v2.config({
// //   cloud_name: CLOUDINARY_CLOUD_NAME,
// //   api_key: CLOUDINARY_API_KEY,
// //   api_secret: CLOUDINARY_API_SECRET,
// // })

// // // Logging utility
// // function logToStderr(message, data = null) {
// //   const timestamp = new Date().toISOString()
// //   const logMessage = data
// //     ? `[${timestamp}] MCP Server: ${message} - ${JSON.stringify(data)}`
// //     : `[${timestamp}] MCP Server: ${message}`
// //   process.stderr.write(logMessage + "\n")
// // }

// // // Utility function to create timeout for OpenAI calls
// // function createTimeoutPromise(ms, operation) {
// //   return new Promise((_, reject) => {
// //     setTimeout(() => reject(new Error(`${operation} timeout after ${ms}ms`)), ms)
// //   })
// // }

// // // AI Interview Service
// // class FastAIInterviewService {
// //   static detectTechnicalRole(jobDescription) {
// //     const technicalKeywords = [
// //       "software",
// //       "developer",
// //       "engineer",
// //       "programming",
// //       "coding",
// //       "technical",
// //       "architect",
// //       "qa",
// //       "testing",
// //       "devops",
// //       "data",
// //       "machine learning",
// //       "ai",
// //       "blockchain",
// //       "cloud",
// //       "security",
// //       "mobile",
// //       "web",
// //       "api",
// //       "database",
// //       "system",
// //       "network",
// //       "infrastructure",
// //       "automation",
// //       "javascript",
// //       "python",
// //       "java",
// //       "react",
// //       "node",
// //       "frontend",
// //       "backend",
// //       "fullstack",
// //       "angular",
// //       "vue",
// //       "typescript",
// //       "mongodb",
// //       "sql",
// //       "nosql",
// //       "aws",
// //       "docker",
// //     ]
// //     const description = jobDescription.toLowerCase()
// //     return technicalKeywords.some((keyword) => description.includes(keyword))
// //   }

// //   static detectProgrammingLanguage(jobDescription) {
// //     const languages = {
// //       javascript: ["javascript", "js", "react", "node", "vue", "angular", "typescript", "express", "nextjs"],
// //       python: ["python", "django", "flask", "pandas", "numpy", "fastapi", "pytorch", "tensorflow"],
// //       java: ["java", "spring", "hibernate", "maven", "gradle"],
// //       csharp: ["c#", "csharp", ".net", "asp.net", "blazor"],
// //       php: ["php", "laravel", "symfony", "wordpress"],
// //       ruby: ["ruby", "rails", "sinatra"],
// //       go: ["golang", "go", "gin", "fiber"],
// //       rust: ["rust", "actix", "rocket"],
// //       cpp: ["c++", "cpp", "qt"],
// //       sql: ["sql", "mysql", "postgresql", "database", "mongodb", "redis"],
// //     }
// //     const description = jobDescription.toLowerCase()
// //     for (const [lang, keywords] of Object.entries(languages)) {
// //       if (keywords.some((keyword) => description.includes(keyword))) {
// //         return lang
// //       }
// //     }
// //     return "javascript"
// //   }

// //   static generateAdvancedCodeSnippet(language, questionType, difficulty) {
// //     const advancedSnippets = {
// //       javascript: {
// //         intermediate: {
// //           debugging: `// React Hook Issue - What's wrong here?
// // import { useState, useCallback } from 'react';

// // function useCounter(initialValue = 0) {
// //   const [count, setCount] = useState(initialValue);

// //   const increment = () => {
// //     setCount(count + 1);
// //     setCount(count + 1); // Double increment?
// //   };

// //   const reset = useCallback(() => {
// //     setCount(initialValue);
// //   }, []);

// //   return { count, increment, reset };
// // }`,
// //           coding: `// Implement a custom React hook for debounced search
// // import { useState, useEffect } from 'react';

// // function useDebounce(value, delay) {
// //   // Your implementation here
// //   // Should return debounced value
// // }

// // // Usage example:
// // function SearchComponent() {
// //   const [searchTerm, setSearchTerm] = useState('');
// //   const debouncedSearchTerm = useDebounce(searchTerm, 500);

// //   // Effect for API call should go here
// // }`,
// //         },
// //         advanced: {
// //           coding: `// Implement a React hook for infinite scrolling
// // import { useState, useEffect, useRef } from 'react';

// // function useInfiniteScroll(fetchMore, hasMore) {
// //   // Your implementation here
// //   // Should handle:
// //   // - Intersection Observer
// //   // - Loading states
// //   // - Error handling
// //   // - Cleanup
// // }

// // // Usage:
// // function PostsList() {
// //   const { data, loading, error } = useInfiniteScroll(
// //     fetchPosts,
// //     hasMorePosts
// //   );
// // }`,
// //         },
// //       },
// //     }

// //     const langSnippets = advancedSnippets[language] || advancedSnippets.javascript
// //     const difficultySnippets = langSnippets[difficulty] || langSnippets.intermediate
// //     const typeSnippets = difficultySnippets[questionType] || Object.values(difficultySnippets)[0]
// //     return typeSnippets || `// Advanced ${language} ${questionType} challenge`
// //   }

// //   static async generateTechnicalQuestion(jobDescription, resumeData, previousQuestions = [], questionNumber = 1) {
// //     const detectedLanguage = this.detectProgrammingLanguage(jobDescription)
// //     const difficulty = questionNumber <= 2 ? "intermediate" : "advanced"

// //     const prompt = `You are a senior technical interviewer. Generate a challenging technical question that tests real-world problem-solving skills.

// // Job Description: ${jobDescription}
// // Candidate: ${resumeData.candidateName} - ${resumeData.skills || "General technical background"}
// // Previous Questions: ${previousQuestions.join("; ")}
// // Question #${questionNumber} - Difficulty: ${difficulty}
// // Primary Language: ${detectedLanguage}

// // Create a question that:
// // 1. Tests practical, real-world scenarios (not basic syntax)
// // 2. Requires problem-solving and critical thinking
// // 3. Includes a code snippet with subtle issues or optimization opportunities
// // 4. Is appropriate for a ${difficulty} level developer
// // 5. Focuses on: performance, scalability, best practices, or architecture

// // Return JSON:
// // {
// //   "question_text": "Challenging question without code (what to analyze/implement)",
// //   "code_snippet": "Complex, realistic code example with issues or optimization needs",
// //   "language": "${detectedLanguage}",
// //   "expected_topics": ["specific technical concepts"],
// //   "difficulty": "${difficulty}",
// //   "question_type": "debugging|optimization|architecture|implementation",
// //   "follow_up_questions": ["What would you improve?", "How would you scale this?"]
// // }

// // Make the code snippet realistic and challenging - not basic examples.`

// //     try {
// //       const openaiCall = openai.chat.completions.create({
// //         model: "gpt-4o-mini",
// //         messages: [{ role: "system", content: prompt }],
// //         temperature: 0.9,
// //         max_tokens: 800,
// //       })

// //       const response = await Promise.race([openaiCall, createTimeoutPromise(10000, "Technical question generation")])

// //       const content = response.choices[0].message.content.trim()

// //       try {
// //         const technicalQuestion = JSON.parse(content)
// //         if (!technicalQuestion.question_text) {
// //           throw new Error("Invalid question format")
// //         }

// //         let codeSnippet = technicalQuestion.code_snippet || ""
// //         if (!codeSnippet.trim()) {
// //           const questionType = technicalQuestion.question_type || "coding"
// //           codeSnippet = this.generateAdvancedCodeSnippet(detectedLanguage, questionType, difficulty)
// //         }

// //         return {
// //           question_text: technicalQuestion.question_text,
// //           code_snippet: codeSnippet,
// //           language: technicalQuestion.language || detectedLanguage,
// //           expected_topics: technicalQuestion.expected_topics || [],
// //           difficulty: difficulty,
// //           question_type: technicalQuestion.question_type || "coding",
// //           follow_up_questions: technicalQuestion.follow_up_questions || [],
// //         }
// //       } catch (parseError) {
// //         logToStderr("Parse error in technical question", { error: parseError.message })
// //         const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "debugging", difficulty)
// //         return {
// //           question_text:
// //             "Analyze this code for potential issues, performance problems, and suggest improvements. What would you change and why?",
// //           code_snippet: fallbackCode,
// //           language: detectedLanguage,
// //           expected_topics: ["code-review", "performance", "best-practices", "architecture"],
// //           difficulty: difficulty,
// //           question_type: "debugging",
// //           follow_up_questions: ["How would you test this?", "What about scalability?"],
// //         }
// //       }
// //     } catch (error) {
// //       logToStderr("Error generating technical question", { error: error.message })
// //       const fallbackCode = this.generateAdvancedCodeSnippet(detectedLanguage, "coding", difficulty)
// //       return {
// //         question_text:
// //           "Review this code implementation. What are the potential issues and how would you improve it for production use?",
// //         code_snippet: fallbackCode,
// //         language: detectedLanguage,
// //         expected_topics: ["problem-solving", "production-readiness"],
// //         difficulty: difficulty,
// //         question_type: "coding",
// //         follow_up_questions: ["What about error handling?", "How would you monitor this?"],
// //       }
// //     }
// //   }

// //   static async generateInitialPrompt(jobDescription, resumeData, interviewSettings = {}) {
// //     const focusAreasText =
// //       interviewSettings.focusAreas?.length > 0
// //         ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
// //         : ""
// //     const styleText = interviewSettings.interviewStyle
// //       ? `Use a ${interviewSettings.interviewStyle} interview style. `
// //       : ""

// //     const prompt = `You are an AI interviewer conducting a ${interviewSettings.interviewDuration || 15}-minute video interview.

// // ${styleText}${focusAreasText}

// // Create a warm, professional greeting with the first question for ${resumeData.candidateName}. Inform the candidate that their video responses will be analyzed for sentiment to assess enthusiasm and fit.

// // Job: ${jobDescription}

// // Keep it concise and natural. Start with a general introduction question.`

// //     try {
// //       const openaiCall = openai.chat.completions.create({
// //         model: "gpt-4o-mini",
// //         messages: [{ role: "system", content: prompt }],
// //         temperature: 0.7,
// //         max_tokens: 150,
// //       })

// //       const response = await Promise.race([openaiCall, createTimeoutPromise(5000, "Initial prompt generation")])

// //       return response.choices[0].message.content
// //     } catch (error) {
// //       logToStderr("Error generating initial prompt", { error: error.message })
// //       return `Hello ${resumeData.candidateName}, welcome to your ${interviewSettings.interviewDuration || 15}-minute video interview. Your responses will be analyzed for sentiment to assess enthusiasm and fit. ${focusAreasText}Tell me about yourself and why you're interested in this role.`
// //     }
// //   }

// //   static async analyzeVideoSentiment(videoPath) {
// //     try {
// //       const videoFilePath = path.resolve(__dirname, videoPath)

// //       try {
// //         await fs.access(videoFilePath)
// //       } catch (error) {
// //         throw new Error(`Video file not found: ${videoPath}`)
// //       }

// //       const audioFilePath = path.join(__dirname, `uploads/audio-${randomUUID()}.wav`)

// //       await new Promise((resolve, reject) => {
// //         const command = ffmpeg(videoFilePath)
// //           .output(audioFilePath)
// //           .noVideo()
// //           .audioCodec("pcm_s16le")
// //           .audioChannels(1)
// //           .audioFrequency(16000)
// //           .on("end", resolve)
// //           .on("error", (err) => {
// //             logToStderr("FFmpeg error", { error: err.message })
// //             reject(new Error(`FFmpeg error: ${err.message}`))
// //           })

// //         setTimeout(() => {
// //           command.kill()
// //           reject(new Error("FFmpeg timeout"))
// //         }, 30000)

// //         command.run()
// //       })

// //       let transcription = ""
// //       try {
// //         const controller = new AbortController()
// //         const timeoutId = setTimeout(() => controller.abort(), 10000)

// //         const response = await fetch("https://api-inference.huggingface.co/models/openai/whisper-tiny", {
// //           method: "POST",
// //           headers: {
// //             Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
// //             "Content-Type": "application/octet-stream",
// //           },
// //           body: await fs.readFile(audioFilePath),
// //           signal: controller.signal,
// //         })

// //         clearTimeout(timeoutId)
// //         const result = await response.json()
// //         if (result.error) {
// //           throw new Error(result.error)
// //         }
// //         transcription = result.text || ""
// //       } catch (error) {
// //         logToStderr("Error transcribing audio with Whisper", { error: error.message })
// //         transcription = ""
// //       }

// //       try {
// //         await fs.unlink(audioFilePath)
// //       } catch (cleanupError) {
// //         logToStderr("Failed to clean up audio file", { error: cleanupError.message })
// //       }

// //       let textSentiment = "neutral"
// //       let sentimentScore = 0
// //       if (transcription) {
// //         try {
// //           const controller = new AbortController()
// //           const timeoutId = setTimeout(() => controller.abort(), 10000)

// //           const response = await fetch(
// //             "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
// //             {
// //               method: "POST",
// //               headers: {
// //                 Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
// //                 "Content-Type": "application/json",
// //               },
// //               body: JSON.stringify({ inputs: transcription }),
// //               signal: controller.signal,
// //             },
// //           )

// //           clearTimeout(timeoutId)
// //           const result = await response.json()
// //           if (result.error) {
// //             throw new Error(result.error)
// //           }
// //           textSentiment = result[0]?.label?.toLowerCase() || "neutral"
// //           sentimentScore = result[0]?.score || 0
// //         } catch (error) {
// //           logToStderr("Error analyzing text sentiment with Hugging Face", { error: error.message })
// //         }
// //       }

// //       const videoSentiment = textSentiment
// //       const combinedSentiment = this.combineSentiments(textSentiment, videoSentiment)

// //       try {
// //         await fs.unlink(videoFilePath)
// //       } catch (cleanupError) {
// //         logToStderr("Failed to clean up video file", { error: cleanupError.message })
// //       }

// //       return {
// //         sentiment: combinedSentiment,
// //         transcription,
// //         videoLabels: [],
// //       }
// //     } catch (error) {
// //       logToStderr("Error analyzing video sentiment", { error: error.message })
// //       try {
// //         await fs.unlink(videoPath)
// //       } catch (cleanupError) {
// //         logToStderr("Cleanup error", { error: cleanupError.message })
// //       }
// //       return { sentiment: "neutral", transcription: "", videoLabels: [] }
// //     }
// //   }

// //   static async analyzeTextSentiment(userResponse) {
// //     if (!userResponse || userResponse.trim() === "") {
// //       return "neutral"
// //     }
// //     try {
// //       const controller = new AbortController()
// //       const timeoutId = setTimeout(() => controller.abort(), 10000)
// //       const response = await fetch(
// //         "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
// //         {
// //           method: "POST",
// //           headers: {
// //             Authorization: `Bearer ${HUGGINGFACE_API_TOKEN}`,
// //             "Content-Type": "application/json",
// //           },
// //           body: JSON.stringify({ inputs: userResponse }),
// //           signal: controller.signal,
// //         },
// //       )
// //       clearTimeout(timeoutId)

// //       if (!response.ok) {
// //         throw new Error(`HTTP error! status: ${response.status}`)
// //       }

// //       const result = await response.json()

// //       if (result.error) {
// //         if (result.error.includes("loading")) {
// //           await new Promise((resolve) => setTimeout(resolve, 2000))
// //           return await this.analyzeTextSentiment(userResponse)
// //         }
// //         throw new Error(result.error)
// //       }

// //       return result[0]?.label?.toLowerCase() || "neutral"
// //     } catch (error) {
// //       logToStderr("Error analyzing text sentiment with Hugging Face", { error: error.message })
// //       return "neutral"
// //     }
// //   }

// //   static combineSentiments(textSentiment, videoSentiment) {
// //     const sentimentMap = { positive: 1, neutral: 0, negative: -1 }
// //     const textScore = sentimentMap[textSentiment] || 0
// //     const videoScore = sentimentMap[videoSentiment] || 0
// //     const combinedScore = textScore * 0.6 + videoScore * 0.4
// //     if (combinedScore > 0.3) return "positive"
// //     if (combinedScore < -0.3) return "negative"
// //     return "neutral"
// //   }

// //   static async generateNextQuestion(
// //     userResponse,
// //     videoPath,
// //     contextState,
// //     jobDescription,
// //     questionCount,
// //     maxQuestions,
// //     interviewSettings = {},
// //     resumeData = {},
// //   ) {
// //     const questionsAsked = contextState.questionsAsked || []
// //     const currentIndex = contextState.currentQuestionIndex || 0

// //     if (questionCount >= maxQuestions) {
// //       return {
// //         response:
// //           "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
// //         feedback: "Thank you for participating in the interview.",
// //         is_question: false,
// //         should_end_interview: true,
// //         updated_context_state: {
// //           ...contextState,
// //           questionsAsked: [...questionsAsked, "Interview concluded"],
// //           currentQuestionIndex: currentIndex,
// //           interviewSettings: contextState.interviewSettings || interviewSettings,
// //         },
// //       }
// //     }

// //     const { sentiment, transcription, videoLabels } = videoPath
// //       ? await this.analyzeVideoSentiment(videoPath)
// //       : { sentiment: "neutral", transcription: "", videoLabels: [] }

// //     const effectiveResponse = transcription || userResponse
// //     const isTechnicalRole = this.detectTechnicalRole(jobDescription)
// //     let shouldAskTechnical = isTechnicalRole && (questionCount === 2 || questionCount === 4)
// //     let nextQuestion

// //     if (shouldAskTechnical) {
// //       try {
// //         const technicalQuestion = await this.generateTechnicalQuestion(
// //           jobDescription,
// //           resumeData,
// //           questionsAsked,
// //           questionCount,
// //         )

// //         let fullQuestionText = technicalQuestion.question_text
// //         if (technicalQuestion.code_snippet && technicalQuestion.code_snippet.trim()) {
// //           fullQuestionText += " Please analyze the code I've shared and walk me through your thought process."
// //         }

// //         nextQuestion = {
// //           response: fullQuestionText,
// //           feedback: `Excellent! Now let's dive into a technical challenge. You seemed ${sentiment} in your previous response.`,
// //           is_question: true,
// //           should_end_interview: false,
// //           technical_question: true,
// //           question_metadata: {
// //             ...technicalQuestion,
// //             spoken_text: technicalQuestion.question_text,
// //             display_text: fullQuestionText,
// //           },
// //         }
// //       } catch (error) {
// //         logToStderr("Error generating technical question", { error: error.message })
// //         shouldAskTechnical = false
// //       }
// //     }

// //     if (!shouldAskTechnical) {
// //       const systemPrompt = `AI Interviewer. Generate the next question based on the candidate's response: "${effectiveResponse}"

// // Previous questions: ${questionsAsked.slice(-2).join(", ")}
// // Job description: ${jobDescription}
// // Question ${questionCount} of ${maxQuestions}
// // Sentiment (combined video/text): ${sentiment}

// // Return a JSON object:
// // {
// //   "response": "question text",
// //   "feedback": "brief positive feedback incorporating sentiment analysis",
// //   "is_question": true,
// //   "should_end_interview": false
// // }`

// //       try {
// //         const openaiCall = openai.chat.completions.create({
// //           model: "gpt-4o-mini",
// //           messages: [{ role: "system", content: systemPrompt }],
// //           temperature: 0.7,
// //           max_tokens: 250,
// //         })

// //         const response = await Promise.race([openaiCall, createTimeoutPromise(10000, "Next question generation")])

// //         const parsedResult = JSON.parse(response.choices[0].message.content)
// //         nextQuestion = {
// //           response: parsedResult.response,
// //           feedback: parsedResult.feedback || `Thank you for your response. You seemed ${sentiment} during your answer.`,
// //           is_question: parsedResult.is_question,
// //           should_end_interview: parsedResult.should_end_interview,
// //         }
// //       } catch (error) {
// //         logToStderr("Error generating next question with OpenAI", { error: error.message })
// //         nextQuestion = {
// //           response: "Can you share an example of how you've applied your skills to solve a problem in this field?",
// //           feedback: `Thank you for your response. You seemed ${sentiment} during your answer.`,
// //           is_question: true,
// //           should_end_interview: false,
// //         }
// //       }
// //     }

// //     return {
// //       ...nextQuestion,
// //       updated_context_state: {
// //         ...contextState,
// //         questionsAsked: [...questionsAsked, nextQuestion.response],
// //         currentQuestionIndex: nextQuestion.is_question ? currentIndex + 1 : currentIndex,
// //         interviewSettings: contextState.interviewSettings || interviewSettings,
// //         sentimentResults: [
// //           ...(contextState.sentimentResults || []),
// //           { questionNumber: questionCount, sentiment, transcription, videoLabels, timestamp: new Date() },
// //         ],
// //       },
// //     }
// //   }

// //   static async evaluateInterview(transcript, jobDescription, contextState) {
// //     const systemPrompt = `Evaluate interview transcript. Provide concise assessment, incorporating video and text sentiment analysis.

// // Job: ${jobDescription}
// // Transcript: ${JSON.stringify(transcript)}
// // Sentiment Results: ${JSON.stringify(contextState.sentimentResults || [])}

// // JSON response:
// // {
// //   "score": [1-10],
// //   "strengths": ["strength1", "strength2", "strength3"],
// //   "areas_for_improvement": ["area1", "area2"],
// //   "sentiment_summary": ["summary of candidate's emotional state based on video and text"],
// //   "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
// //   "summary": "Brief assessment including sentiment insights"
// // }`

// //     try {
// //       const openaiCall = openai.chat.completions.create({
// //         model: "gpt-4o-mini",
// //         messages: [{ role: "system", content: systemPrompt }],
// //         temperature: 0.3,
// //         max_tokens: 400,
// //       })

// //       const response = await Promise.race([openaiCall, createTimeoutPromise(10000, "Interview evaluation")])

// //       return JSON.parse(response.choices[0].message.content)
// //     } catch (error) {
// //       logToStderr("Error evaluating interview with OpenAI", { error: error.message })
// //       return {
// //         score: 7,
// //         strengths: ["Good communication", "Relevant experience", "Professional demeanor"],
// //         areas_for_improvement: ["Could provide more specific examples"],
// //         sentiment_summary: ["Candidate appeared generally neutral based on video and text analysis"],
// //         recommendation: "Consider",
// //         summary: "Candidate showed good potential with room for growth. Sentiment analysis indicates neutral demeanor.",
// //       }
// //     }
// //   }
// // }

// // // Request handlers
// // async function handleInitializeInterview({ jobId, resumeId, interviewSettings }) {
// //   logToStderr("Starting initialize_interview handler", { jobId, resumeId })

// //   if (!jobId || !resumeId) {
// //     logToStderr("Missing required parameters", { jobId, resumeId })
// //     throw new McpError(ErrorCode.InvalidParams, "jobId and resumeId are required")
// //   }

// //   try {
// //     logToStderr("Connecting to database...")
// //     await connectDB()
// //     logToStderr("Database connected successfully")

// //     logToStderr("Fetching job and resume data...")
// //     const [job, resume] = await Promise.all([
// //       JobDescription.findById(jobId).maxTimeMS(5000),
// //       Resume.findById(resumeId).maxTimeMS(5000),
// //     ])

// //     if (!job || !resume) {
// //       logToStderr("Job or resume not found", { jobFound: !!job, resumeFound: !!resume })
// //       throw new McpError(ErrorCode.NotFound, "Job or resume not found")
// //     }

// //     logToStderr("Generating initial prompt...")
// //     const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
// //       job.markdown_description || job.context || "",
// //       resume,
// //       interviewSettings,
// //     )

// //     logToStderr("Initial prompt generated", { promptLength: initialPrompt.length })

// //     const sessionId = randomUUID()
// //     const contextState = {
// //       questionsAsked: [initialPrompt],
// //       currentQuestionIndex: 0,
// //       interviewSettings,
// //       sentimentResults: [],
// //     }

// //     logToStderr("Creating session...", { sessionId })
// //     const session = new MCPSession({
// //       sessionId,
// //       jobId,
// //       resumeId,
// //       userId: resume.userId,
// //       contextState,
// //       createdAt: new Date(),
// //       transcript: [{ role: "assistant", content: initialPrompt, timestamp: new Date() }],
// //     })

// //     await session.save()
// //     logToStderr("Session saved successfully", { sessionId })

// //     logToStderr("Updating resume with interview results...")
// //     await Resume.updateOne(
// //       { _id: resumeId },
// //       {
// //         $push: {
// //           voiceInterviewResults: {
// //             sessionId,
// //             jobId,
// //             createdAt: new Date(),
// //             interactions: [
// //               {
// //                 question: initialPrompt,
// //                 candidateResponse: "",
// //                 feedback: "",
// //                 timestamp: new Date(),
// //                 sentiment: "neutral",
// //                 technical_question: false,
// //               },
// //             ],
// //             interviewSettings,
// //           },
// //         },
// //       },
// //     )

// //     logToStderr("Resume updated successfully")

// //     const responseData = {
// //       success: true,
// //       sessionId,
// //       initialPrompt,
// //       contextState,
// //       jobDetails: { title: job.context, description: job.markdown_description },
// //       candidateDetails: { name: resume.candidateName, email: resume.email },
// //     }

// //     logToStderr("Interview initialized successfully", { sessionId, responseDataKeys: Object.keys(responseData) })

// //     return {
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify(responseData),
// //         },
// //       ],
// //     }
// //   } catch (error) {
// //     logToStderr("Initialize interview error", { error: error.message, stack: error.stack })
// //     throw new McpError(ErrorCode.InternalError, `Failed to initialize interview: ${error.message}`)
// //   }
// // }

// // async function handleProcessResponse({ sessionId, userMessage, videoPath, contextState, questionCount }) {
// //   logToStderr("Starting process_response handler", { sessionId, questionCount })

// //   if (!sessionId || (!userMessage && !videoPath) || !contextState) {
// //     logToStderr("Missing required parameters", {
// //       sessionId: !!sessionId,
// //       userMessage: !!userMessage,
// //       videoPath: !!videoPath,
// //       contextState: !!contextState,
// //     })
// //     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage or videoPath, and contextState are required")
// //   }

// //   try {
// //     await connectDB()
// //     logToStderr("Database connected for process_response")

// //     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(5000)
// //     if (!session) {
// //       logToStderr("Session not found", { sessionId })
// //       throw new McpError(ErrorCode.NotFound, "Session not found")
// //     }

// //     const [job, resume] = await Promise.all([
// //       JobDescription.findById(session.jobId).maxTimeMS(5000),
// //       Resume.findById(session.resumeId).maxTimeMS(5000),
// //     ])

// //     if (!job || !resume) {
// //       logToStderr("Job or resume not found for session", { jobFound: !!job, resumeFound: !!resume })
// //       throw new McpError(ErrorCode.NotFound, "Job or resume not found")
// //     }

// //     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5
// //     logToStderr("Generating next question...", { questionCount, maxQuestions })

// //     const responseData = await FastAIInterviewService.generateNextQuestion(
// //       userMessage || "",
// //       videoPath,
// //       contextState,
// //       job.markdown_description || job.context || "",
// //       questionCount,
// //       maxQuestions,
// //       contextState.interviewSettings || {},
// //       resume,
// //     )

// //     const {
// //       response,
// //       feedback,
// //       is_question,
// //       should_end_interview,
// //       updated_context_state,
// //       technical_question,
// //       question_metadata,
// //     } = responseData

// //     logToStderr("Updating session with new data...")
// //     await MCPSession.updateOne(
// //       { sessionId },
// //       {
// //         $set: { contextState: updated_context_state },
// //         $push: {
// //           transcript: [
// //             {
// //               role: "user",
// //               content:
// //                 userMessage || responseData.updated_context_state.sentimentResults.slice(-1)[0]?.transcription || "",
// //               timestamp: new Date(),
// //             },
// //             { role: "assistant", content: response, timestamp: new Date() },
// //           ],
// //         },
// //       },
// //     )

// //     logToStderr("Session updated successfully")

// //     await Resume.updateOne(
// //       { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
// //       {
// //         $set: {
// //           "voiceInterviewResults.$.interactions.$[elem].candidateResponse":
// //             userMessage || responseData.updated_context_state.sentimentResults.slice(-1)[0]?.transcription || "",
// //           "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
// //           "voiceInterviewResults.$.interactions.$[elem].sentiment":
// //             responseData.updated_context_state.sentimentResults.slice(-1)[0]?.sentiment || "neutral",
// //         },
// //         $push: {
// //           "voiceInterviewResults.$.sentimentResults": responseData.updated_context_state.sentimentResults.slice(-1)[0],
// //         },
// //       },
// //       { arrayFilters: [{ "elem.candidateResponse": "" }] },
// //     )

// //     if (is_question && !should_end_interview) {
// //       const newInteraction = {
// //         question: response,
// //         candidateResponse: "",
// //         feedback: "",
// //         timestamp: new Date(),
// //         sentiment: "neutral",
// //         technical_question: technical_question || false,
// //       }

// //       await Resume.updateOne(
// //         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
// //         { $push: { "voiceInterviewResults.$.interactions": newInteraction } },
// //       )
// //     }

// //     const finalResponseData = {
// //       success: true,
// //       response,
// //       feedback,
// //       is_question,
// //       should_end_interview,
// //       updated_context_state,
// //       technical_question,
// //       question_metadata,
// //       sentiment: responseData.updated_context_state.sentimentResults.slice(-1)[0]?.sentiment || "neutral",
// //     }

// //     logToStderr("Response processed successfully", {
// //       sessionId,
// //       questionCount,
// //       responseKeys: Object.keys(finalResponseData),
// //     })

// //     return {
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify(finalResponseData),
// //         },
// //       ],
// //     }
// //   } catch (error) {
// //     logToStderr("Process response error", { error: error.message, stack: error.stack })
// //     throw new McpError(ErrorCode.InternalError, `Failed to process response: ${error.message}`)
// //   }
// // }

// // async function handleSubmitInterview({
// //   sessionId,
// //   jobId,
// //   resumeId,
// //   userId,
// //   email,
// //   interviewTranscript,
// //   finalContextState,
// // }) {
// //   logToStderr("Starting submit_interview handler", { sessionId })

// //   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
// //     logToStderr("Missing required parameters for submit", {
// //       sessionId: !!sessionId,
// //       jobId: !!jobId,
// //       resumeId: !!resumeId,
// //       interviewTranscript: !!interviewTranscript,
// //     })
// //     throw new McpError(ErrorCode.InvalidParams, "sessionId, jobId, resumeId, and interviewTranscript are required")
// //   }

// //   try {
// //     await connectDB()
// //     logToStderr("Database connected for submit_interview")

// //     const [job, resume, session] = await Promise.all([
// //       JobDescription.findById(jobId).maxTimeMS(5000),
// //       Resume.findById(resumeId).maxTimeMS(5000),
// //       MCPSession.findOne({ sessionId }).maxTimeMS(5000),
// //     ])

// //     if (!job || !resume || !session) {
// //       logToStderr("Required data not found", { jobFound: !!job, resumeFound: !!resume, sessionFound: !!session })
// //       throw new McpError(ErrorCode.NotFound, "Job, resume, or session not found")
// //     }

// //     await MCPSession.updateOne(
// //       { sessionId },
// //       {
// //         $set: {
// //           contextState: finalContextState,
// //           completedAt: new Date(),
// //         },
// //       },
// //     )

// //     logToStderr("Generating interview evaluation...")
// //     const evaluation = await FastAIInterviewService.evaluateInterview(
// //       interviewTranscript,
// //       job.markdown_description || job.context || "",
// //       finalContextState,
// //     )

// //     logToStderr("Interview evaluation generated", { score: evaluation.score })

// //     await Resume.updateOne(
// //       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
// //       {
// //         $set: {
// //           "voiceInterviewResults.$.interactions": interviewTranscript,
// //           "voiceInterviewResults.$.sentimentResults": finalContextState.sentimentResults || [],
// //           "voiceInterviewResults.$.evaluation": evaluation,
// //           "voiceInterviewResults.$.completedAt": new Date(),
// //         },
// //       },
// //     )

// //     if (email) {
// //       const mailOptions = {
// //         from: EMAIL_USER,
// //         to: email,
// //         subject: "AI Interview Completion",
// //         html: `
// //           <h2>Interview Completed</h2>
// //           <p>Thank you for completing your AI-powered video interview for ${job.context || "the position"}.</p>
// //           <p><strong>Summary:</strong> ${evaluation.summary}</p>
// //           <p><strong>Score:</strong> ${evaluation.score}/10</p>
// //           <p><strong>Recommendation:</strong> ${evaluation.recommendation}</p>
// //           <p><strong>Sentiment Summary:</strong> ${evaluation.sentiment_summary.join(", ")}</p>
// //           <p>We will review your responses and get back to you soon with next steps.</p>
// //         `,
// //       }

// //       try {
// //         await transporter.sendMail(mailOptions)
// //         logToStderr("Notification email sent", { to: email })
// //       } catch (emailError) {
// //         logToStderr("Failed to send notification email", { error: emailError.message })
// //       }
// //     }

// //     const notification = new Notification({
// //       userId: userId || resume.userId,
// //       message: `Interview for ${job.context || "Unknown Job"} completed. Score: ${evaluation.score}/10`,
// //       type: "interview_completion",
// //       recipientId: userId || resume.userId,
// //       createdAt: new Date(),
// //     })
// //     await notification.save()

// //     const finalResponseData = {
// //       success: true,
// //       sessionId,
// //       evaluation,
// //     }

// //     logToStderr("Interview submitted successfully", { sessionId, score: evaluation.score })

// //     return {
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify(finalResponseData),
// //         },
// //       ],
// //     }
// //   } catch (error) {
// //     logToStderr("Submit interview error", { error: error.message, stack: error.stack })
// //     throw new McpError(ErrorCode.InternalError, `Failed to submit interview: ${error.message}`)
// //   }
// // }

// // // Enhanced JSON-RPC handling
// // class JSONRPCProcessor {
// //   constructor() {
// //     this.inputBuffer = ""
// //   }

// //   processInput(data) {
// //     this.inputBuffer += data
// //     const requests = []

// //     // Split by newlines and process complete lines
// //     const lines = this.inputBuffer.split("\n")

// //     // Keep the last incomplete line in buffer
// //     this.inputBuffer = lines.pop() || ""

// //     for (const line of lines) {
// //       const trimmedLine = line.trim()
// //       if (!trimmedLine) continue

// //       try {
// //         const request = JSON.parse(trimmedLine)
// //         if (this.isValidJSONRPC(request)) {
// //           requests.push(request)
// //         } else {
// //           logToStderr("Invalid JSON-RPC request format", { request })
// //         }
// //       } catch (parseError) {
// //         logToStderr("JSON parse error", { error: parseError.message, line: trimmedLine.substring(0, 100) })
// //       }
// //     }

// //     return requests
// //   }

// //   isValidJSONRPC(request) {
// //     return (
// //       request &&
// //       typeof request === "object" &&
// //       request.jsonrpc === "2.0" &&
// //       request.id !== undefined &&
// //       request.method &&
// //       typeof request.method === "string"
// //     )
// //   }
// // }

// // // Request handler
// // async function handleRequest(request) {
// //   logToStderr("Handling JSON-RPC request", { method: request.method, id: request.id })

// //   try {
// //     let result
// //     switch (request.method) {
// //       case "initialize_interview":
// //         result = await handleInitializeInterview(request.params)
// //         break
// //       case "process_response":
// //         result = await handleProcessResponse(request.params)
// //         break
// //       case "submit_interview":
// //         result = await handleSubmitInterview(request.params)
// //         break
// //       default:
// //         logToStderr("Unknown method requested", { method: request.method })
// //         throw new McpError(ErrorCode.MethodNotFound, `Unknown method: ${request.method}`)
// //     }

// //     logToStderr("Request handled successfully", { method: request.method, id: request.id })
// //     return result
// //   } catch (error) {
// //     logToStderr("Request handling error", { method: request.method, error: error.message, stack: error.stack })
// //     throw error
// //   }
// // }

// // // Response sender
// // function sendResponse(id, result) {
// //   const response = {
// //     jsonrpc: "2.0",
// //     id,
// //     result,
// //   }

// //   try {
// //     const responseString = JSON.stringify(response) + "\n"
// //     process.stdout.write(responseString)
// //     logToStderr("Sent JSON-RPC response", { requestId: id, responseLength: responseString.length })
// //   } catch (error) {
// //     logToStderr("Error sending response", { error: error.message, requestId: id })
// //   }
// // }

// // function sendError(id, error) {
// //   const response = {
// //     jsonrpc: "2.0",
// //     id,
// //     error: {
// //       code: error instanceof McpError ? error.code : ErrorCode.InternalError,
// //       message: error.message,
// //     },
// //   }

// //   try {
// //     const responseString = JSON.stringify(response) + "\n"
// //     process.stdout.write(responseString)
// //     logToStderr("Sent JSON-RPC error response", { requestId: id, error: error.message })
// //   } catch (sendError) {
// //     logToStderr("Error sending error response", { error: sendError.message, requestId: id })
// //   }
// // }

// // // Main processing logic
// // const jsonrpcProcessor = new JSONRPCProcessor()

// // process.stdin.setEncoding("utf8")

// // process.stdin.on("data", async (data) => {
// //   logToStderr("Received stdin data", { dataLength: data.length })

// //   try {
// //     const requests = jsonrpcProcessor.processInput(data.toString())
// //     logToStderr("Processed requests", { requestCount: requests.length })

// //     // Process each request sequentially to avoid race conditions
// //     for (const request of requests) {
// //       try {
// //         logToStderr("Processing request", { method: request.method, id: request.id })
// //         const result = await handleRequest(request)
// //         sendResponse(request.id, result)
// //       } catch (error) {
// //         logToStderr("Request processing failed", { method: request.method, id: request.id, error: error.message })
// //         sendError(request.id, error)
// //       }
// //     }
// //   } catch (error) {
// //     logToStderr("Error processing stdin data", { error: error.message, stack: error.stack })
// //     sendError(null, error)
// //   }
// // })

// // // Error handling
// // process.on("uncaughtException", (error) => {
// //   logToStderr("Uncaught exception", { error: error.message, stack: error.stack })
// //   process.exit(1)
// // })

// // process.on("unhandledRejection", (reason, promise) => {
// //   logToStderr("Unhandled rejection", { reason: reason?.message || reason })
// //   process.exit(1)
// // })

// // // Startup
// // logToStderr("MCP Server starting up...")
// // process.stdout.write("MCP Server ready\n")
// // logToStderr("MCP Server ready and listening for requests")

// // -------------------------------------------------- don't know------------------

// // import { Server } from "@modelcontextprotocol/sdk/server/index.js";
// // import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// // import {
// //   CallToolRequestSchema,
// //   McpError,
// //   ErrorCode,
// // } from "@modelcontextprotocol/sdk/types.js";
// // import { randomUUID } from "node:crypto";
// // import nodemailer from "nodemailer";
// // import { OpenAI } from "openai";
// // import mongoose from "mongoose";
// // import Resume from "../../model/resumeModel.js";
// // import MCPSession from "../../model/mcpSessionModel.js";
// // import JobDescription from "../../model/JobDescriptionModel.js";
// // import Notification from "../../model/NotificationModal.js";
// // import connectDB from "../../db/index.js";
// // import { Storage } from "@google-cloud/storage";
// // import { VideoIntelligenceServiceClient } from "@google-cloud/video-intelligence";
// // import fs from "fs/promises";
// // import path from "path";

// // // Environment configuration
// // const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// // const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
// // const GOOGLE_CLOUD_KEYFILE = process.env.GOOGLE_CLOUD_KEYFILE;
// // const EMAIL_USER = process.env.EMAIL_USER;
// // const EMAIL_PASS = process.env.EMAIL_PASS;
// // const MONGODB_URI = process.env.MONGODB_URI;

// // // Initialize services
// // const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
// // const storage = new Storage({
// //   keyFilename: GOOGLE_CLOUD_KEYFILE,
// //   projectId: GOOGLE_CLOUD_PROJECT_ID,
// // });
// // const videoIntelligence = new VideoIntelligenceServiceClient({
// //   keyFilename: GOOGLE_CLOUD_KEYFILE,
// // });
// // const transporter = nodemailer.createTransport({
// //   service: "gmail",
// //   auth: { user: EMAIL_USER, pass: EMAIL_PASS },
// // });

// // // Logging utility
// // function logToStderr(message, data = null) {
// //   const timestamp = new Date().toISOString();
// //   const logMessage = data
// //     ? `[${timestamp}] MCP Server: ${message} - ${JSON.stringify(data)}`
// //     : `[${timestamp}] MCP Server: ${message}`;
// //   process.stderr.write(logMessage + "\n");
// // }

// // // AI Interview Service
// // class FastAIInterviewService {
// //   static detectTechnicalRole(jobDescription) {
// //     const technicalKeywords = [
// //       "software",
// //       "developer",
// //       "engineer",
// //       "programming",
// //       "coding",
// //       "technical",
// //       "architect",
// //       "qa",
// //       "testing",
// //       "devops",
// //       "data",
// //       "machine learning",
// //       "ai",
// //       "blockchain",
// //       "cloud",
// //       "security",
// //       "mobile",
// //       "web",
// //       "api",
// //       "database",
// //       "system",
// //       "network",
// //       "infrastructure",
// //       "automation",
// //       "javascript",
// //       "python",
// //       "java",
// //       "react",
// //       "node",
// //       "frontend",
// //       "backend",
// //       "fullstack",
// //       "angular",
// //       "vue",
// //       "typescript",
// //       "mongodb",
// //       "sql",
// //       "nosql",
// //       "aws",
// //       "docker",
// //     ];
// //     const description = jobDescription.toLowerCase();
// //     return technicalKeywords.some((keyword) => description.includes(keyword));
// //   }

// //   static detectProgrammingLanguage(jobDescription) {
// //     const languages = {
// //       javascript: [
// //         "javascript",
// //         "js",
// //         "react",
// //         "node",
// //         "vue",
// //         "angular",
// //         "typescript",
// //         "express",
// //         "nextjs",
// //       ],
// //       python: [
// //         "python",
// //         "django",
// //         "flask",
// //         "pandas",
// //         "numpy",
// //         "fastapi",
// //         "pytorch",
// //         "tensorflow",
// //       ],
// //       java: ["java", "spring", "hibernate", "maven", "gradle"],
// //       csharp: ["c#", "csharp", ".net", "asp.net", "blazor"],
// //       php: ["php", "laravel", "symfony", "wordpress"],
// //       ruby: ["ruby", "rails", "sinatra"],
// //       go: ["golang", "go", "gin", "fiber"],
// //       rust: ["rust", "actix", "rocket"],
// //       cpp: ["c++", "cpp", "qt"],
// //       sql: ["sql", "mysql", "postgresql", "database", "mongodb", "redis"],
// //     };
// //     const description = jobDescription.toLowerCase();
// //     for (const [lang, keywords] of Object.entries(languages)) {
// //       if (keywords.some((keyword) => description.includes(keyword))) {
// //         return lang;
// //       }
// //     }
// //     return "javascript";
// //   }

// //   static generateAdvancedCodeSnippet(language, questionType, difficulty) {
// //     const advancedSnippets = {
// //       javascript: {
// //         intermediate: {
// //           debugging: `// React Hook Issue - What's wrong here?
// // function useCounter(initialValue = 0) {
// //   const [count, setCount] = useState(initialValue);

// //   const increment = () => {
// //     setCount(count + 1);
// //     setCount(count + 1); // Double increment?
// //   };

// //   const reset = useCallback(() => {
// //     setCount(initialValue);
// //   }, []);

// //   return { count, increment, reset };
// // }`,
// //           coding: `// Implement a custom React hook for debounced search
// // function useDebounce(value, delay) {
// //   // Your implementation here
// //   // Should return debounced value
// // }

// // // Usage example:
// // function SearchComponent() {
// //   const [searchTerm, setSearchTerm] = useState('');
// //   const debouncedSearchTerm = useDebounce(searchTerm, 500);

// //   // Effect for API call should go here
// // }`,
// //           system_design: `// Design a React Context for theme management
// // const ThemeContext = createContext();

// // export function ThemeProvider({ children }) {
// //   // Implement theme state management
// //   // Support: light/dark modes, custom colors
// //   // Persist theme preference
// // }

// // export function useTheme() {
// //   // Return theme utilities
// // }`,
// //         },
// //         advanced: {
// //           coding: `// Implement a React hook for infinite scrolling
// // function useInfiniteScroll(fetchMore, hasMore) {
// //   // Your implementation here
// //   // Should handle:
// //   // - Intersection Observer
// //   // - Loading states
// //   // - Error handling
// //   // - Cleanup
// // }

// // // Usage:
// // function PostsList() {
// //   const { data, loading, error } = useInfiniteScroll(
// //     fetchPosts,
// //     hasMorePosts
// //   );
// // }`,
// //           performance: `// Optimize this React component
// // function ExpensiveList({ items, onItemClick }) {
// //   return (
// //     <div>
// //       {items.map(item => (
// //         <div key={item.id} onClick={() => onItemClick(item)}>
// //           <ExpensiveComponent data={item} />
// //           {item.children?.map(child => (
// //             <NestedComponent key={child.id} data={child} />
// //           ))}
// //         </div>
// //       ))}
// //     </div>
// //   );
// // }`,
// //         },
// //       },
// //       python: {
// //         intermediate: {
// //           debugging: `# What's wrong with this async code?
// // import asyncio
// // import aiohttp

// // async def fetch_data(urls):
// //     results = []
// //     for url in urls:
// //         async with aiohttp.ClientSession() as session:
// //             async with session.get(url) as response:
// //                 data = await response.json()
// //                 results.append(data)
// //     return results

// // # How would you optimize this?`,
// //           coding: `# Implement a decorator for caching function results
// // def memoize(func):
// //     # Your implementation here
// //     # Should handle:
// //     # - Different argument types
// //     # - Cache size limits
// //     # - TTL (time to live)
// //     pass

// // @memoize
// // def expensive_calculation(n):
// //     # Simulate expensive operation
// //     return sum(i**2 for i in range(n))`,
// //         },
// //         advanced: {
// //           system_design: `# Design a distributed task queue system
// // class TaskQueue:
// //     def __init__(self, redis_url, workers=4):
// //         # Initialize Redis connection
// //         # Set up worker processes
// //         pass

// //     def enqueue(self, task_func, *args, **kwargs):
// //         # Add task to queue with priority
// //         pass

// //     def process_tasks(self):
// //         # Worker process implementation
// //         # Handle failures, retries, dead letter queue
// //         pass`,
// //         },
// //       },
// //     };
// //     const langSnippets =
// //       advancedSnippets[language] || advancedSnippets.javascript;
// //     const difficultySnippets =
// //       langSnippets[difficulty] || langSnippets.intermediate;
// //     const typeSnippets =
// //       difficultySnippets[questionType] || Object.values(difficultySnippets)[0];
// //     return typeSnippets || `// Advanced ${language} ${questionType} challenge`;
// //   }

// //   static async generateTechnicalQuestion(
// //     jobDescription,
// //     resumeData,
// //     previousQuestions = [],
// //     questionNumber = 1
// //   ) {
// //     const detectedLanguage = this.detectProgrammingLanguage(jobDescription);
// //     const difficulty = questionNumber <= 2 ? "intermediate" : "advanced";

// //     const prompt = `You are a senior technical interviewer. Generate a challenging technical question that tests real-world problem-solving skills.

// // Job Description: ${jobDescription}
// // Candidate: ${resumeData.candidateName} - ${
// //       resumeData.skills || "General technical background"
// //     }
// // Previous Questions: ${previousQuestions.join("; ")}
// // Question #${questionNumber} - Difficulty: ${difficulty}
// // Primary Language: ${detectedLanguage}

// // Create a question that:
// // 1. Tests practical, real-world scenarios (not basic syntax)
// // 2. Requires problem-solving and critical thinking
// // 3. Includes a code snippet with subtle issues or optimization opportunities
// // 4. Is appropriate for a ${difficulty} level developer
// // 5. Focuses on: performance, scalability, best practices, or architecture

// // Return JSON:
// // {
// //   "question_text": "Challenging question without code (what to analyze/implement)",
// //   "code_snippet": "Complex, realistic code example with issues or optimization needs",
// //   "language": "${detectedLanguage}",
// //   "expected_topics": ["specific technical concepts"],
// //   "difficulty": "${difficulty}",
// //   "question_type": "debugging|optimization|architecture|implementation",
// //   "follow_up_questions": ["What would you improve?", "How would you scale this?"]
// // }

// // Make the code snippet realistic and challenging - not basic examples.`;

// //     try {
// //       const response = await openai.chat.completions.create({
// //         model: "gpt-4o-mini",
// //         messages: [{ role: "system", content: prompt }],
// //         temperature: 0.9,
// //         max_tokens: 800,
// //       });

// //       const content = response.choices[0].message.content.trim();

// //       try {
// //         const technicalQuestion = JSON.parse(content);
// //         if (!technicalQuestion.question_text) {
// //           throw new Error("Invalid question format");
// //         }
// //         let codeSnippet = technicalQuestion.code_snippet || "";
// //         if (!codeSnippet.trim()) {
// //           const questionType = technicalQuestion.question_type || "coding";
// //           codeSnippet = this.generateAdvancedCodeSnippet(
// //             detectedLanguage,
// //             questionType,
// //             difficulty
// //           );
// //         }
// //         return {
// //           question_text: technicalQuestion.question_text,
// //           code_snippet: codeSnippet,
// //           language: technicalQuestion.language || detectedLanguage,
// //           expected_topics: technicalQuestion.expected_topics || [],
// //           difficulty: difficulty,
// //           question_type: technicalQuestion.question_type || "coding",
// //           follow_up_questions: technicalQuestion.follow_up_questions || [],
// //         };
// //       } catch (parseError) {
// //         logToStderr("Parse error in technical question", parseError.message);
// //         const fallbackCode = this.generateAdvancedCodeSnippet(
// //           detectedLanguage,
// //           "debugging",
// //           difficulty
// //         );
// //         return {
// //           question_text:
// //             "Analyze this code for potential issues, performance problems, and suggest improvements. What would you change and why?",
// //           code_snippet: fallbackCode,
// //           language: detectedLanguage,
// //           expected_topics: [
// //             "code-review",
// //             "performance",
// //             "best-practices",
// //             "architecture",
// //           ],
// //           difficulty: difficulty,
// //           question_type: "debugging",
// //           follow_up_questions: [
// //             "How would you test this?",
// //             "What about scalability?",
// //           ],
// //         };
// //       }
// //     } catch (error) {
// //       logToStderr("Error generating technical question", error.message);
// //       const fallbackCode = this.generateAdvancedCodeSnippet(
// //         detectedLanguage,
// //         "coding",
// //         difficulty
// //       );
// //       return {
// //         question_text:
// //           "Review this code implementation. What are the potential issues and how would you improve it for production use?",
// //         code_snippet: fallbackCode,
// //         language: detectedLanguage,
// //         expected_topics: ["problem-solving", "production-readiness"],
// //         difficulty: difficulty,
// //         question_type: "coding",
// //         follow_up_questions: [
// //           "What about error handling?",
// //           "How would you monitor this?",
// //         ],
// //       };
// //     }
// //   }

// //   static async generateInitialPrompt(
// //     jobDescription,
// //     resumeData,
// //     interviewSettings = {}
// //   ) {
// //     const focusAreasText =
// //       interviewSettings.focusAreas?.length > 0
// //         ? `Focus on these areas: ${interviewSettings.focusAreas.join(", ")}. `
// //         : "";
// //     const styleText = interviewSettings.interviewStyle
// //       ? `Use a ${interviewSettings.interviewStyle} interview style. `
// //       : "";

// //     const prompt = `You are an AI interviewer conducting a ${
// //       interviewSettings.interviewDuration || 15
// //     }-minute video interview.

// // ${styleText}${focusAreasText}

// // Create a warm, professional greeting with the first question for ${
// //       resumeData.candidateName
// //     }. Inform the candidate that their video responses will be analyzed for sentiment to assess enthusiasm and fit.

// // Job: ${jobDescription}

// // Keep it concise and natural. Start with a general introduction question.`;

// //     try {
// //       const response = await openai.chat.completions.create({
// //         model: "gpt-4o-mini",
// //         messages: [{ role: "system", content: prompt }],
// //         temperature: 0.7,
// //         max_tokens: 150,
// //       });
// //       return response.choices[0].message.content;
// //     } catch (error) {
// //       return `Hello ${resumeData.candidateName}, welcome to your ${
// //         interviewSettings.interviewDuration || 15
// //       }-minute video interview. Your responses will be analyzed for sentiment to assess enthusiasm and fit. ${focusAreasText}Tell me about yourself and why you're interested in this role.`;
// //     }
// //   }

// //   static async analyzeVideoSentiment(videoPath) {
// //     try {
// //       // Upload video to Google Cloud Storage
// //       const bucketName = process.env.GCP_BUCKET_NAME || "your-gcp-bucket-name"; // Set in .env
// //       const fileName = path.basename(videoPath);
// //       const bucket = storage.bucket(bucketName);
// //       await bucket.upload(videoPath, { destination: fileName });

// //       const gcsUri = `gs://${bucketName}/${fileName}`;

// //       // Analyze video with Google Cloud Video Intelligence
// //       const [operation] = await videoIntelligence.annotateVideo({
// //         inputUri: gcsUri,
// //         features: ["SPEECH_TRANSCRIPTION", "LABEL_DETECTION"],
// //       });

// //       const [result] = await operation.promise();
// //       const annotations = result.annotationResults[0];

// //       // Extract transcription
// //       const transcription =
// //         annotations.speechTranscriptions?.[0]?.alternatives?.[0]?.transcript ||
// //         "";

// //       // Analyze sentiment of transcription with OpenAI
// //       const textSentiment = await this.analyzeTextSentiment(transcription);

// //       // Analyze video labels for emotional cues
// //       const labels =
// //         annotations.segmentLabelAnnotations?.map((label) => ({
// //           name: label.entity.description,
// //           confidence: label.segments[0].confidence,
// //         })) || [];

// //       // Map labels to sentiment (basic heuristic)
// //       const positiveLabels = ["smile", "laughter", "confident"];
// //       const negativeLabels = ["frown", "nervous", "hesitation"];
// //       let videoSentimentScore = 0;
// //       labels.forEach((label) => {
// //         if (positiveLabels.includes(label.name.toLowerCase())) {
// //           videoSentimentScore += label.confidence;
// //         } else if (negativeLabels.includes(label.name.toLowerCase())) {
// //           videoSentimentScore -= label.confidence;
// //         }
// //       });

// //       const videoSentiment =
// //         videoSentimentScore > 0.3
// //           ? "positive"
// //           : videoSentimentScore < -0.3
// //           ? "negative"
// //           : "neutral";

// //       // Combine text and video sentiment
// //       const combinedSentiment = this.combineSentiments(
// //         textSentiment,
// //         videoSentiment
// //       );

// //       // Clean up
// //       await fs.unlink(videoPath);
// //       await bucket.file(fileName).delete();

// //       return {
// //         sentiment: combinedSentiment,
// //         transcription,
// //         videoLabels: labels,
// //       };
// //     } catch (error) {
// //       logToStderr("Error analyzing video sentiment", error.message);
// //       return { sentiment: "neutral", transcription: "", videoLabels: [] };
// //     }
// //   }

// //   static async analyzeTextSentiment(userResponse) {
// //     const prompt = `Analyze the sentiment of the following text and classify it as "positive," "negative," or "neutral." Provide a brief explanation.

// // Text: "${userResponse}"

// // Return a JSON object:
// // {
// //   "sentiment": "positive|negative|neutral",
// //   "explanation": "Brief explanation of the sentiment classification"
// // }`;

// //     try {
// //       const response = await openai.chat.completions.create({
// //         model: "gpt-4o-mini",
// //         messages: [{ role: "system", content: prompt }],
// //         temperature: 0.5,
// //         max_tokens: 100,
// //       });

// //       const result = JSON.parse(response.choices[0].message.content);
// //       return result.sentiment || "neutral";
// //     } catch (error) {
// //       logToStderr("Error analyzing text sentiment with OpenAI", error.message);
// //       return "neutral";
// //     }
// //   }

// //   static combineSentiments(textSentiment, videoSentiment) {
// //     const sentimentMap = { positive: 1, neutral: 0, negative: -1 };
// //     const textScore = sentimentMap[textSentiment] || 0;
// //     const videoScore = sentimentMap[videoSentiment] || 0;
// //     const combinedScore = textScore * 0.6 + videoScore * 0.4; // 60% text, 40% video
// //     if (combinedScore > 0.3) return "positive";
// //     if (combinedScore < -0.3) return "negative";
// //     return "neutral";
// //   }

// //   static async generateNextQuestion(
// //     userResponse,
// //     videoPath,
// //     contextState,
// //     jobDescription,
// //     questionCount,
// //     maxQuestions,
// //     interviewSettings = {},
// //     resumeData = {}
// //   ) {
// //     const questionsAsked = contextState.questionsAsked || [];
// //     const currentIndex = contextState.currentQuestionIndex || 0;

// //     if (questionCount >= maxQuestions) {
// //       return {
// //         response:
// //           "Thank you for your time and thoughtful responses. This concludes our interview. We'll be in touch soon regarding next steps.",
// //         feedback: "Thank you for participating in the interview.",
// //         is_question: false,
// //         should_end_interview: true,
// //         updated_context_state: {
// //           ...contextState,
// //           questionsAsked: [...questionsAsked, "Interview concluded"],
// //           currentQuestionIndex: currentIndex,
// //           interviewSettings:
// //             contextState.interviewSettings || interviewSettings,
// //         },
// //       };
// //     }

// //     // Perform sentiment analysis (video + text)
// //     const { sentiment, transcription, videoLabels } = videoPath
// //       ? await this.analyzeVideoSentiment(videoPath)
// //       : { sentiment: "neutral", transcription: "", videoLabels: [] };
// //     const effectiveResponse = transcription || userResponse;

// //     const isTechnicalRole = this.detectTechnicalRole(jobDescription);
// //     let shouldAskTechnical =
// //       isTechnicalRole && (questionCount === 2 || questionCount === 4);

// //     let nextQuestion;

// //     if (shouldAskTechnical) {
// //       try {
// //         const technicalQuestion = await this.generateTechnicalQuestion(
// //           jobDescription,
// //           resumeData,
// //           questionsAsked,
// //           questionCount
// //         );

// //         let fullQuestionText = technicalQuestion.question_text;
// //         if (
// //           technicalQuestion.code_snippet &&
// //           technicalQuestion.code_snippet.trim()
// //         ) {
// //           fullQuestionText +=
// //             " Please analyze the code I've shared and walk me through your thought process.";
// //         }

// //         nextQuestion = {
// //           response: fullQuestionText,
// //           feedback: `Excellent! Now let's dive into a technical challenge. You seemed ${sentiment} in your previous response.`,
// //           is_question: true,
// //           should_end_interview: false,
// //           technical_question: true,
// //           question_metadata: {
// //             ...technicalQuestion,
// //             spoken_text: technicalQuestion.question_text,
// //             display_text: fullQuestionText,
// //           },
// //         };
// //       } catch (error) {
// //         logToStderr("Error generating technical question", error.message);
// //         shouldAskTechnical = false;
// //       }
// //     }

// //     if (!shouldAskTechnical) {
// //       const prompt = `AI Interviewer. Generate the next question based on the candidate's response: "${effectiveResponse}"

// // Previous questions: ${questionsAsked.slice(-2).join(", ")}
// // Job description: ${jobDescription}
// // Question ${questionCount} of ${maxQuestions}
// // Sentiment (combined video/text): ${sentiment}

// // Return a JSON object:
// // {
// //   "response": "question text",
// //   "feedback": "brief positive feedback incorporating sentiment analysis",
// //   "is_question": true,
// //   "should_end_interview": false
// // }`;

// //       try {
// //         const response = await openai.chat.completions.create({
// //           model: "gpt-4o-mini",
// //           messages: [{ role: "system", content: prompt }],
// //           temperature: 0.7,
// //           max_tokens: 250,
// //         });

// //         const result = JSON.parse(response.choices[0].message.content);
// //         nextQuestion = {
// //           response: result.response,
// //           feedback:
// //             result.feedback ||
// //             `Thank you for your response. You seemed ${sentiment} during your answer.`,
// //           is_question: result.is_question,
// //           should_end_interview: result.should_end_interview,
// //         };
// //       } catch (error) {
// //         nextQuestion = {
// //           response:
// //             "Can you share an example of how you've applied your skills to solve a problem in this field?",
// //           feedback: `Thank you for your response. You seemed ${sentiment} during your answer.`,
// //           is_question: true,
// //           should_end_interview: false,
// //         };
// //       }
// //     }

// //     return {
// //       ...nextQuestion,
// //       updated_context_state: {
// //         ...contextState,
// //         questionsAsked: [...questionsAsked, nextQuestion.response],
// //         currentQuestionIndex: nextQuestion.is_question
// //           ? currentIndex + 1
// //           : currentIndex,
// //         interviewSettings: contextState.interviewSettings || interviewSettings,
// //         sentimentResults: [
// //           ...(contextState.sentimentResults || []),
// //           {
// //             questionNumber: questionCount,
// //             sentiment,
// //             transcription,
// //             videoLabels,
// //             timestamp: new Date(),
// //           },
// //         ],
// //       },
// //     };
// //   }

// //   static async evaluateInterview(transcript, jobDescription, contextState) {
// //     const prompt = `Evaluate interview transcript. Provide concise assessment, incorporating video and text sentiment analysis.

// // Job: ${jobDescription}
// // Transcript: ${JSON.stringify(transcript)}
// // Sentiment Results: ${JSON.stringify(contextState.sentimentResults || [])}

// // JSON response:
// // {
// //   "score": [1-10],
// //   "strengths": ["strength1", "strength2", "strength3"],
// //   "areas_for_improvement": ["area1", "area2"],
// //   "sentiment_summary": ["summary of candidate's emotional state based on video and text"],
// //   "recommendation": "Strongly Recommend/Recommend/Consider/Do Not Recommend",
// //   "summary": "Brief assessment including sentiment insights"
// // }`;

// //     try {
// //       const response = await openai.chat.completions.create({
// //         model: "gpt-4o-mini",
// //         messages: [{ role: "system", content: prompt }],
// //         temperature: 0.3,
// //         max_tokens: 400,
// //       });
// //       return JSON.parse(response.choices[0].message.content);
// //     } catch (error) {
// //       logToStderr("Error evaluating interview", error.message);
// //       return {
// //         score: 7,
// //         strengths: [
// //           "Good communication",
// //           "Relevant experience",
// //           "Professional demeanor",
// //         ],
// //         areas_for_improvement: ["Could provide more specific examples"],
// //         sentiment_summary: [
// //           "Candidate appeared generally neutral based on video and text analysis",
// //         ],
// //         recommendation: "Consider",
// //         summary:
// //           "Candidate showed good potential with room for growth. Sentiment analysis indicates neutral demeanor.",
// //       };
// //     }
// //   }
// // }

// // // Initialize Interview
// // async function handleInitializeInterview({
// //   jobId,
// //   resumeId,
// //   interviewSettings,
// // }) {
// //   if (!jobId || !resumeId) {
// //     throw new McpError(
// //       ErrorCode.InvalidParams,
// //       "jobId and resumeId are required"
// //     );
// //   }

// //   try {
// //     await connectDB();
// //     logToStderr("Initializing interview", { jobId, resumeId });

// //     const [job, resume] = await Promise.all([
// //       JobDescription.findById(jobId).maxTimeMS(10000),
// //       Resume.findById(resumeId).maxTimeMS(10000),
// //     ]);

// //     if (!job || !resume) {
// //       throw new McpError(ErrorCode.NotFound, "Job or resume not found");
// //     }

// //     const initialPrompt = await FastAIInterviewService.generateInitialPrompt(
// //       job.markdown_description || job.context || "",
// //       resume,
// //       interviewSettings
// //     );

// //     const sessionId = randomUUID();
// //     const contextState = {
// //       questionsAsked: [initialPrompt],
// //       currentQuestionIndex: 0,
// //       interviewSettings,
// //       sentimentResults: [],
// //     };

// //     const session = new MCPSession({
// //       sessionId,
// //       jobId,
// //       resumeId,
// //       userId: resume.userId,
// //       contextState,
// //       createdAt: new Date(),
// //       transcript: [
// //         { role: "assistant", content: initialPrompt, timestamp: new Date() },
// //       ],
// //     });

// //     await session.save();

// //     await Resume.updateOne(
// //       { _id: resumeId },
// //       {
// //         $push: {
// //           voiceInterviewResults: {
// //             sessionId,
// //             jobId,
// //             createdAt: new Date(),
// //             interactions: [
// //               {
// //                 question: initialPrompt,
// //                 candidateResponse: "",
// //                 feedback: "",
// //                 timestamp: new Date(),
// //                 sentiment: "neutral",
// //                 technical_question: false,
// //               },
// //             ],
// //             interviewSettings,
// //           },
// //         },
// //       }
// //     );

// //     const notification = new Notification({
// //       userId: resume.userId,
// //       message: `Interview started for ${job.context || "Unknown Job"}`,
// //       type: "interview_start",
// //       createdAt: new Date(),
// //     });

// //     await notification.save();

// //     logToStderr("Interview initialized", { sessionId });
// //     return {
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: true,
// //             sessionId,
// //             initialPrompt,
// //             contextState,
// //             jobDetails: {
// //               title: job.context,
// //               description: job.markdown_description,
// //             },
// //             candidateDetails: {
// //               name: resume.candidateName,
// //               email: resume.email,
// //             },
// //           }),
// //         },
// //       ],
// //     };
// //   } catch (error) {
// //     logToStderr("Initialize interview error", error.message);
// //     throw new McpError(ErrorCode.InternalError, error.message);
// //   }
// // }

// // // Process Response with Video
// // async function handleProcessResponse({
// //   sessionId,
// //   userMessage,
// //   videoPath,
// //   contextState,
// //   questionCount,
// // }) {
// //   if (!sessionId || (!userMessage && !videoPath) || !contextState) {
// //     throw new McpError(
// //       ErrorCode.InvalidParams,
// //       "sessionId, userMessage or videoPath, and contextState are required"
// //     );
// //   }

// //   try {
// //     await connectDB();
// //     logToStderr("Processing response for session", sessionId);

// //     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000);
// //     if (!session) {
// //       throw new McpError(ErrorCode.NotFound, "Session not found");
// //     }

// //     const [job, resume] = await Promise.all([
// //       JobDescription.findById(session.jobId).maxTimeMS(10000),
// //       Resume.findById(session.resumeId).maxTimeMS(10000),
// //     ]);

// //     if (!job || !resume) {
// //       throw new McpError(ErrorCode.NotFound, "Job or resume not found");
// //     }

// //     const maxQuestions = contextState.interviewSettings?.maxQuestions || 5;
// //     const responseData = await FastAIInterviewService.generateNextQuestion(
// //       userMessage || "",
// //       videoPath,
// //       contextState,
// //       job.markdown_description || job.context || "",
// //       questionCount,
// //       maxQuestions,
// //       contextState.interviewSettings || {},
// //       resume
// //     );

// //     const {
// //       response,
// //       feedback,
// //       is_question,
// //       should_end_interview,
// //       updated_context_state,
// //       technical_question,
// //       question_metadata,
// //     } = responseData;

// //     // Update session
// //     await MCPSession.updateOne(
// //       { sessionId },
// //       {
// //         $set: { contextState: updated_context_state },
// //         $push: {
// //           transcript: [
// //             {
// //               role: "user",
// //               content:
// //                 userMessage ||
// //                 responseData.updated_context_state.sentimentResults.slice(-1)[0]
// //                   ?.transcription ||
// //                 "",
// //               timestamp: new Date(),
// //             },
// //             { role: "assistant", content: response, timestamp: new Date() },
// //           ],
// //         },
// //       }
// //     );

// //     // Update resume with interactions and sentiment
// //     await Resume.updateOne(
// //       { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
// //       {
// //         $set: {
// //           "voiceInterviewResults.$.interactions.$[elem].candidateResponse":
// //             userMessage ||
// //             responseData.updated_context_state.sentimentResults.slice(-1)[0]
// //               ?.transcription ||
// //             "",
// //           "voiceInterviewResults.$.interactions.$[elem].feedback": feedback,
// //           "voiceInterviewResults.$.interactions.$[elem].sentiment":
// //             responseData.updated_context_state.sentimentResults.slice(-1)[0]
// //               ?.sentiment || "neutral",
// //         },
// //         $push: {
// //           "voiceInterviewResults.$.sentimentResults":
// //             responseData.updated_context_state.sentimentResults.slice(-1)[0],
// //         },
// //       },
// //       { arrayFilters: [{ "elem.candidateResponse": "" }] }
// //     );

// //     // Add new interaction if not ending
// //     if (is_question && !should_end_interview) {
// //       const newInteraction = {
// //         question: response,
// //         candidateResponse: "",
// //         feedback: "",
// //         timestamp: new Date(),
// //         sentiment: "neutral",
// //         technical_question: technical_question || false,
// //       };

// //       await Resume.updateOne(
// //         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
// //         { $push: { "voiceInterviewResults.$.interactions": newInteraction } }
// //       );
// //     }

// //     logToStderr("Response processed successfully", {
// //       sessionId,
// //       questionCount,
// //       sentiment:
// //         responseData.updated_context_state.sentimentResults.slice(-1)[0]
// //           ?.sentiment,
// //     });
// //     return {
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: true,
// //             response,
// //             feedback,
// //             is_question,
// //             should_end_interview,
// //             updated_context_state,
// //             technical_question,
// //             question_metadata,
// //             sentiment:
// //               responseData.updated_context_state.sentimentResults.slice(-1)[0]
// //                 ?.sentiment || "neutral",
// //           }),
// //         },
// //       ],
// //     };
// //   } catch (error) {
// //     logToStderr("Process response error", error.message);
// //     throw new McpError(ErrorCode.InternalError, error.message);
// //   }
// // }

// // // Submit Interview
// // async function handleSubmitInterview({
// //   sessionId,
// //   jobId,
// //   resumeId,
// //   userId,
// //   email,
// //   interviewTranscript,
// //   finalContextState,
// // }) {
// //   if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
// //     throw new McpError(
// //       ErrorCode.InvalidParams,
// //       "sessionId, jobId, resumeId, and interviewTranscript are required"
// //     );
// //   }

// //   try {
// //     await connectDB();
// //     logToStderr("Submitting interview for session", sessionId);

// //     const [job, resume, session] = await Promise.all([
// //       JobDescription.findById(jobId).maxTimeMS(10000),
// //       Resume.findById(resumeId).maxTimeMS(10000),
// //       MCPSession.findOne({ sessionId }).maxTimeMS(10000),
// //     ]);

// //     if (!job || !resume || !session) {
// //       throw new McpError(
// //         ErrorCode.NotFound,
// //         "Job, resume, or session not found"
// //       );
// //     }

// //     // Update session
// //     await MCPSession.updateOne(
// //       { sessionId },
// //       { $set: { contextState: finalContextState } }
// //     );

// //     // Update resume
// //     await Resume.updateOne(
// //       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
// //       {
// //         $set: {
// //           "voiceInterviewResults.$.interactions": interviewTranscript,
// //           "voiceInterviewResults.$.sentimentResults":
// //             finalContextState.sentimentResults,
// //           "voiceInterviewResults.$.completedAt": new Date(),
// //         },
// //       }
// //     );

// //     // Generate evaluation
// //     const evaluation = await FastAIInterviewService.evaluateInterview(
// //       interviewTranscript,
// //       job.markdown_description || job.context,
// //       finalContextState
// //     );

// //     // Save evaluation
// //     await Resume.updateOne(
// //       { _id: resumeId, "voiceInterviewResults.sessionId": sessionId },
// //       { $set: { "voiceInterviewResults.$.evaluation": evaluation } }
// //     );

// //     // Send notification email
// //     if (email) {
// //       const mailOptions = {
// //         from: EMAIL_USER,
// //         to: email,
// //         subject: "AI Interview Completion",
// //         html: `
// //           <h2>Interview Completed</h2>
// //           <p>Thank you for completing your AI-powered video interview for ${
// //             job.context
// //           }.</p>
// //           <p>Summary: ${evaluation.summary}</p>
// //           <p>Score: ${evaluation.score}/10</p>
// //           <p>Recommendation: ${evaluation.recommendation}</p>
// //           <p>Sentiment Summary: ${evaluation.sentiment_summary.join(", ")}</p>
// //           <p>We will review your responses and get back to you soon.</p>
// //         `,
// //       };

// //       try {
// //         await transporter.sendMail(mailOptions);
// //         logToStderr("Notification email sent", { to: email });
// //       } catch (emailError) {
// //         logToStderr("Failed to send notification email", emailError.message);
// //       }
// //     }

// //     // Create notification
// //     const notification = new Notification({
// //       userId: userId || resume.userId,
// //       message: `Interview for ${job.context} completed. Score: ${evaluation.score}/10`,
// //       type: "interview_completion",
// //       createdAt: new Date(),
// //     });

// //     await notification.save();

// //     logToStderr("Interview submitted successfully", { sessionId });
// //     return {
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: true,
// //             evaluation,
// //           }),
// //         },
// //       ],
// //     };
// //   } catch (error) {
// //     logToStderr("Submit interview error", error.message);
// //     throw new McpError(ErrorCode.InternalError, error.message);
// //   }
// // }

// // // Register tool handlers
// // const server = new Server();
// // server.setRequestHandler(CallToolRequestSchema, async (request) => {
// //   const { tool, input } = request;
// //   logToStderr(`Handling tool: ${tool}`, input);

// //   try {
// //     switch (tool) {
// //       case "initialize_interview":
// //         return await handleInitializeInterview(input);
// //       case "process_response":
// //         return await handleProcessResponse(input);
// //       case "submit_interview":
// //         return await handleSubmitInterview(input);
// //       default:
// //         throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${tool}`);
// //     }
// //   } catch (error) {
// //     logToStderr(`Error handling tool ${tool}`, error.message);
// //     throw error instanceof McpError
// //       ? error
// //       : new McpError(ErrorCode.InternalError, error.message);
// //   }
// // });

// // // Start MCP Server
// // const transport = new StdioServerTransport(server);
// // transport.start();
// // logToStderr("MCP Server started");
// // process.stdout.write("MCP Server ready\n");
