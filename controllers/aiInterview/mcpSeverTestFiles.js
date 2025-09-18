// // ----------------server without video sentiment---------------------
// import express from "express";
// import router from "./routes/match.js";
// import authRouter from "./routes/auth.js";
// import workflowRoutes from "./routes/workflowRoutes.js";
// import notificationRoutes from "./routes/notificationRoutes.js";
// import dotenv from "dotenv";
// import cors from "cors";
// import cookieParser from "cookie-parser";
// import http from "http";
// import { Server } from "socket.io";
// import logger from "morgan";
// import connectDB from "./db/index.js";
// import bodyParser from "body-parser";
// import paymentRoutes from "./controllers/extensionPayment/paymentRoutes.js";
// import companyPaymentRoutes from "./controllers/companyPayment/paymentRoutes.js";
// import calendlyRoutes from "./controllers/calendly/calendlyRouter.js";
// import calendlyController from "./controllers/calendly/calendlyController.js";
// import { resumePendingWorkflows } from "./controllers/aiInterview/agentController.js";
// import { spawn } from "child_process";
// import { OpenAI } from "openai";

// dotenv.config();

// const app = express();
// const server = http.createServer(app);
// export const io = new Server(server, {
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"],
//   },
// });

// app.use(logger("dev"));
// app.use(express.json({ limit: "50mb" }));
// app.use(express.urlencoded({ limit: "50mb", extended: true }));
// app.use(
//   cors({
//     origin: [
//       "http://localhost:5173",
//       "https://bloomix2.netlify.app",
//       "https://bloomix.netlify.app",
//       "https://bloomix3.netlify.app",
//       "*",
//       "chrome-extension://igfekpkjkmfhkaeflnjpmafjmjgekdgd",
//     ],
//     credentials: true,
//   })
// );
// app.use(cookieParser());
// app.use(bodyParser.json({ limit: "2mb" }));

// io.on("connect", (socket) => {
//   console.log("A user connected");
//   socket.on("disconnect", () => {
//     console.log("A user disconnected");
//   });
// });

// // Initialize OpenAI
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // MCP Client with improved error handling and readiness check
// class MCPClient {
//   constructor() {
//     this.process = null;
//     this.requestId = 0;
//     this.pendingRequests = new Map();
//     this.isConnected = false;
//     this.isConnecting = false;
//   }

//   async connect() {
//     if (this.isConnecting) {
//       // Wait for existing connection attempt
//       await new Promise((resolve) => {
//         const checkConnection = () => {
//           if (!this.isConnecting) {
//             resolve();
//           } else {
//             setTimeout(checkConnection, 1000);
//           }
//         };
//         checkConnection();
//       });
//       return this.isConnected;
//     }

//     if (this.isConnected && this.process && !this.process.killed) {
//       return true;
//     }

//     this.isConnecting = true;

//     return new Promise((resolve, reject) => {
//       try {
//         // Clean up existing process
//         if (this.process && !this.process.killed) {
//           this.process.kill("SIGTERM");
//         }

//         this.process = spawn(
//           "node",
//           ["./controllers/aiInterview/mcpServer.js"],
//           {
//             stdio: ["pipe", "pipe", "pipe"],
//             env: { ...process.env },
//             detached: false,
//           }
//         );

//         let readyReceived = false;
//         const connectionTimeout = setTimeout(() => {
//           if (!readyReceived) {
//             this.isConnecting = false;
//             this.isConnected = false;
//             if (this.process && !this.process.killed) {
//               this.process.kill("SIGKILL");
//             }
//             reject(
//               new Error("MCP Server failed to initialize within 15 seconds")
//             );
//           }
//         }, 15000);

//         this.process.on("error", (error) => {
//           console.error("MCP process error:", error);
//           this.isConnected = false;
//           this.isConnecting = false;
//           clearTimeout(connectionTimeout);
//           if (!readyReceived) {
//             reject(error);
//           }
//         });

//         this.process.on("exit", (code, signal) => {
//           console.error(
//             `MCP process exited with code: ${code}, signal: ${signal}`
//           );
//           this.isConnected = false;
//           this.isConnecting = false;
//           clearTimeout(connectionTimeout);

//           // Reject pending requests
//           for (const [id, { reject: rejectRequest }] of this.pendingRequests) {
//             rejectRequest(new Error(`MCP process exited with code ${code}`));
//           }
//           this.pendingRequests.clear();

//           if (!readyReceived) {
//             reject(new Error(`MCP process exited with code ${code}`));
//           }
//         });

//         this.process.stdout.on("data", (data) => {
//           const rawData = data.toString().trim();
//           console.log("Raw MCP stdout:", rawData);

//           try {
//             const lines = rawData.split("\n").filter((line) => line.trim());

//             for (const line of lines) {
//               const trimmedLine = line.trim();

//               // Handle ready signal
//               if (trimmedLine === "MCP Server ready") {
//                 if (!readyReceived) {
//                   readyReceived = true;
//                   this.isConnected = true;
//                   this.isConnecting = false;
//                   clearTimeout(connectionTimeout);
//                   console.log("MCP Server connection established");
//                   resolve(true);
//                 }
//                 continue;
//               }

//               // Skip non-JSON lines (database connection messages, etc.)
//               if (
//                 !trimmedLine.startsWith("{") &&
//                 !trimmedLine.startsWith("[")
//               ) {
//                 console.log("Skipping non-JSON line:", trimmedLine);
//                 continue;
//               }

//               // Try to parse as JSON
//               try {
//                 const response = JSON.parse(trimmedLine);
//                 console.log(
//                   "Parsed MCP response:",
//                   JSON.stringify(response, null, 2)
//                 );

//                 if (response.id && this.pendingRequests.has(response.id)) {
//                   const { resolve: resolveRequest } = this.pendingRequests.get(
//                     response.id
//                   );
//                   this.pendingRequests.delete(response.id);
//                   resolveRequest(response);
//                 } else {
//                   console.warn(
//                     "Unexpected MCP response ID or missing ID:",
//                     response.id
//                   );
//                 }
//               } catch (jsonError) {
//                 console.log("Line is not valid JSON, skipping:", trimmedLine);
//               }
//             }
//           } catch (error) {
//             console.error("Error processing MCP response:", error.message);
//           }
//         });

//         this.process.stderr.on("data", (data) => {
//           const errorMsg = data.toString();
//           // Only log actual errors, not info messages
//           if (
//             errorMsg.includes("error") ||
//             errorMsg.includes("Error") ||
//             errorMsg.includes("ERROR")
//           ) {
//             console.error("MCP Server error:", errorMsg);
//           } else {
//             console.log("MCP Server info:", errorMsg.trim());
//           }
//         });
//       } catch (error) {
//         this.isConnecting = false;
//         this.isConnected = false;
//         reject(error);
//       }
//     });
//   }

//   async callTool(name, args) {
//     // Ensure connection is established
//     if (!this.isConnected || !this.process || this.process.killed) {
//       console.log("MCP Client not connected, attempting to connect...");
//       await this.connect();
//     }

//     if (!this.isConnected || !this.process) {
//       throw new Error("MCP Client failed to connect");
//     }

//     return new Promise((resolve, reject) => {
//       const id = ++this.requestId;
//       const request = {
//         jsonrpc: "2.0",
//         id,
//         method: "tools/call",
//         params: { name, arguments: args },
//       };

//       console.log("Sending MCP request:", JSON.stringify(request, null, 2));

//       const timeoutId = setTimeout(() => {
//         if (this.pendingRequests.has(id)) {
//           this.pendingRequests.delete(id);
//           reject(
//             new Error(`Request timeout after 30 seconds for tool: ${name}`)
//           );
//         }
//       }, 30000);

//       this.pendingRequests.set(id, {
//         resolve: (response) => {
//           clearTimeout(timeoutId);
//           resolve(response);
//         },
//         reject: (error) => {
//           clearTimeout(timeoutId);
//           reject(error);
//         },
//       });

//       try {
//         if (!this.process.stdin || !this.process.stdin.writable) {
//           clearTimeout(timeoutId);
//           this.pendingRequests.delete(id);
//           reject(new Error("MCP process stdin is not writable"));
//           return;
//         }

//         this.process.stdin.write(`${JSON.stringify(request)}\n`, (err) => {
//           if (err) {
//             clearTimeout(timeoutId);
//             this.pendingRequests.delete(id);
//             reject(new Error(`Failed to write to stdin: ${err.message}`));
//           }
//         });
//       } catch (error) {
//         clearTimeout(timeoutId);
//         this.pendingRequests.delete(id);
//         reject(new Error(`Error sending request: ${error.message}`));
//       }
//     });
//   }

//   async reconnect() {
//     console.log("Reconnecting MCP client...");
//     this.isConnected = false;

//     if (this.process && !this.process.killed) {
//       this.process.kill("SIGTERM");
//       // Wait a bit for graceful shutdown
//       await new Promise((resolve) => setTimeout(resolve, 1000));
//     }

//     this.pendingRequests.clear();
//     await this.connect();
//   }

//   disconnect() {
//     this.isConnected = false;
//     this.isConnecting = false;

//     if (this.process && !this.process.killed) {
//       this.process.kill("SIGTERM");
//     }

//     // Clear pending requests
//     for (const [id, { reject }] of this.pendingRequests) {
//       reject(new Error("MCP Client disconnected"));
//     }
//     this.pendingRequests.clear();
//   }
// }

// // Enhanced MCP client management
// let mcpClient = null;
// let connectionPromise = null;

// async function getMCPClient() {
//   // If already connected and healthy, return immediately
//   if (
//     mcpClient &&
//     mcpClient.isConnected &&
//     mcpClient.process &&
//     !mcpClient.process.killed
//   ) {
//     return mcpClient;
//   }

//   // If connection is in progress, wait for it
//   if (connectionPromise) {
//     console.log("Waiting for existing connection attempt...");
//     try {
//       await connectionPromise;
//       if (mcpClient && mcpClient.isConnected) {
//         return mcpClient;
//       }
//     } catch (error) {
//       console.error("Existing connection attempt failed:", error.message);
//       connectionPromise = null;
//     }
//   }

//   // Create new connection
//   console.log("Creating new MCP client connection...");
//   connectionPromise = createNewMCPClient();

//   try {
//     await connectionPromise;
//     connectionPromise = null;
//     return mcpClient;
//   } catch (error) {
//     connectionPromise = null;
//     throw error;
//   }
// }

// async function createNewMCPClient() {
//   try {
//     // Clean up existing client
//     if (mcpClient) {
//       try {
//         mcpClient.disconnect();
//       } catch (cleanupError) {
//         console.error("Error during cleanup:", cleanupError.message);
//       }
//     }

//     // Create new client
//     mcpClient = new MCPClient();

//     // Connect with timeout
//     const connectionTimeout = new Promise((_, reject) =>
//       setTimeout(
//         () =>
//           reject(new Error("MCP Client connection timeout after 20 seconds")),
//         20000
//       )
//     );

//     await Promise.race([mcpClient.connect(), connectionTimeout]);

//     console.log("MCP Client connected successfully");
//     return mcpClient;
//   } catch (error) {
//     console.error("Failed to create MCP client:", error.message);
//     mcpClient = null;
//     throw error;
//   }
// }

// // Graceful shutdown handler
// process.on("SIGTERM", () => {
//   console.log("Received SIGTERM, cleaning up MCP client...");
//   if (mcpClient) {
//     mcpClient.disconnect();
//   }
//   process.exit(0);
// });

// process.on("SIGINT", () => {
//   console.log("Received SIGINT, cleaning up MCP client...");
//   if (mcpClient) {
//     mcpClient.disconnect();
//   }
//   process.exit(0);
// });

// const startServer = async () => {
//   try {
//     await connectDB();
//     console.log("MongoDB connected successfully!");
//     await resumePendingWorkflows();

//     // Set up routes after DB connection
//     app.use("/v1", router);
//     app.use("/v1/notifications", notificationRoutes);
//     app.use("/v1/auth", authRouter);
//     app.use("/v1/api/calendly", calendlyController);
//     app.use("/", paymentRoutes);
//     app.use("/", companyPaymentRoutes);
//     app.use("/", calendlyRoutes);
//     app.use("/v1/api/workflows", workflowRoutes);
//     // API Routes with enhanced retry logic and error handling
//     app.post("/v1/api/initialize", async (req, res) => {
//       const maxRetries = 2;
//       let attempt = 0;
//       let lastError = null;

//       while (attempt < maxRetries) {
//         try {
//           attempt++;
//           console.log(`Initialize attempt ${attempt}/${maxRetries}`);

//           const { jobId, resumeId, interviewSettings } = req.body;

//           if (!jobId || !resumeId || !interviewSettings) {
//             return res.status(400).json({
//               error:
//                 "Missing required fields: jobId, resumeId, or interviewSettings",
//               success: false,
//             });
//           }

//           console.log("Initialize request:", {
//             jobId,
//             resumeId,
//             interviewSettings,
//           });

//           // Get or create MCP client with connection verification
//           const client = await getMCPClient();

//           // Verify client is actually connected
//           if (!client.isConnected) {
//             throw new Error("MCP Client connection verification failed");
//           }

//           const result = await client.callTool("initialize_interview", {
//             jobId,
//             resumeId,
//             interviewSettings,
//           });

//           console.log("Initialize result:", JSON.stringify(result, null, 2));

//           if (result.error) {
//             throw new Error(
//               result.error.message || "MCP Server returned error"
//             );
//           }

//           if (!result.result) {
//             throw new Error("MCP Server returned empty result");
//           }

//           return res.json({
//             success: true,
//             ...result.result,
//           });
//         } catch (error) {
//           lastError = error;
//           console.error(`Initialize attempt ${attempt} failed:`, error.message);

//           if (attempt === maxRetries) {
//             console.error("All initialize attempts failed");
//             return res.status(500).json({
//               error: `Failed after ${maxRetries} attempts: ${error.message}`,
//               success: false,
//               lastError: error.message,
//             });
//           }

//           // Wait before retry, with exponential backoff
//           const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
//           console.log(`Waiting ${delay}ms before retry...`);
//           await new Promise((resolve) => setTimeout(resolve, delay));

//           // Force reconnection if connection-related error
//           if (
//             error.message.includes("not connected") ||
//             error.message.includes("exited")
//           ) {
//             console.log("Forcing MCP client reconnection...");
//             try {
//               if (mcpClient) {
//                 await mcpClient.reconnect();
//               }
//             } catch (reconnectError) {
//               console.error("Reconnection failed:", reconnectError.message);
//             }
//           }
//         }
//       }
//     });

//     app.post("/v1/api/process", async (req, res) => {
//       const maxRetries = 2;
//       let attempt = 0;

//       while (attempt < maxRetries) {
//         try {
//           attempt++;
//           const { sessionId, userMessage, contextState, questionCount } =
//             req.body;

//           if (
//             !sessionId ||
//             !userMessage ||
//             !contextState ||
//             questionCount === undefined
//           ) {
//             return res.status(400).json({
//               error: "Missing required fields",
//               success: false,
//             });
//           }

//           console.log("Process request:", {
//             sessionId,
//             userMessage,
//             questionCount,
//           });

//           const client = await getMCPClient();

//           if (!client.isConnected) {
//             throw new Error("MCP Client not connected");
//           }

//           const result = await client.callTool("process_response", {
//             sessionId,
//             userMessage,
//             contextState,
//             questionCount,
//           });

//           console.log("Process result:", JSON.stringify(result, null, 2));

//           if (result.error) {
//             throw new Error(result.error.message || "MCP Server error");
//           }

//           return res.json({
//             success: true,
//             ...result.result,
//           });
//         } catch (error) {
//           console.error(`Process attempt ${attempt} failed:`, error.message);

//           if (attempt === maxRetries) {
//             return res.status(500).json({
//               error: error.message,
//               success: false,
//             });
//           }

//           await new Promise((resolve) => setTimeout(resolve, 1000));

//           if (
//             error.message.includes("not connected") ||
//             error.message.includes("exited")
//           ) {
//             try {
//               if (mcpClient) {
//                 await mcpClient.reconnect();
//               }
//             } catch (reconnectError) {
//               console.error(
//                 "Process reconnection failed:",
//                 reconnectError.message
//               );
//             }
//           }
//         }
//       }
//     });

//     app.post("/v1/api/submit", async (req, res) => {
//       const maxRetries = 1;
//       let attempt = 0;

//       while (attempt < maxRetries) {
//         try {
//           attempt++;
//           const { sessionId, jobId, resumeId, interviewTranscript } = req.body;

//           if (!sessionId || !jobId || !resumeId || !interviewTranscript) {
//             return res.status(400).json({
//               error: "Missing required fields",
//               success: false,
//             });
//           }

//           const client = await getMCPClient();

//           if (!client.isConnected) {
//             throw new Error("MCP Client not connected");
//           }

//           const result = await client.callTool("submit_interview", req.body);
//           console.log("Submit result:", JSON.stringify(result, null, 2));

//           if (result.error) {
//             throw new Error(result.error.message || "MCP Server error");
//           }

//           return res.json({
//             success: true,
//             ...result.result,
//           });
//         } catch (error) {
//           console.error(`Submit attempt ${attempt} failed:`, error.message);

//           if (attempt === maxRetries) {
//             return res.status(500).json({
//               error: error.message,
//               success: false,
//             });
//           }

//           await new Promise((resolve) => setTimeout(resolve, 1000));

//           if (
//             error.message.includes("not connected") ||
//             error.message.includes("exited")
//           ) {
//             try {
//               if (mcpClient) {
//                 await mcpClient.reconnect();
//               }
//             } catch (reconnectError) {
//               console.error(
//                 "Submit reconnection failed:",
//                 reconnectError.message
//               );
//             }
//           }
//         }
//       }
//     });

//     app.get("/", (req, res) => {
//       res.send("Hello to Everyone from Bloomix!");
//     });

//     server.listen(process.env.PORT || 5000, () => {
//       console.log(`Server is running at port: ${process.env.PORT || 5000}`);
//     });
//   } catch (err) {
//     console.log("MongoDB connection failed: ", err);
//   }
// };

// startServer();


// -------------------------------------// MCP Server Test FilesMCP Server Test Files-------------------------------------
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

// // Logging utility that doesn't interfere with JSON communication
// function logToStderr(message, data = null) {
//   const timestamp = new Date().toISOString();
//   const logMessage = data 
//     ? `[${timestamp}] MCP Server: ${message} - ${JSON.stringify(data)}`
//     : `[${timestamp}] MCP Server: ${message}`;
//   process.stderr.write(logMessage + '\n');
// }

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
//   };
// });

// // Handler functions
// async function handleInitializeInterview({ jobId, resumeId, interviewSettings = {} }) {
//   if (!jobId || !resumeId || !interviewSettings) {
//     throw new McpError(ErrorCode.InvalidParams, "jobId, resumeId, and interviewSettings are required");
//   }

//   try {
//     await connectDB();
//     logToStderr("Finding job and resume", { jobId, resumeId });
    
//     const [job, resume] = await Promise.all([
//       JobDescription.findById(jobId).maxTimeMS(10000),
//       Resume.findById(resumeId).maxTimeMS(10000),
//     ]);

//     if (!job || !resume) {
//       throw new McpError(ErrorCode.InvalidParams, "Job or resume not found");
//     }

//     logToStderr("Creating session");
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

//     logToStderr("Generating initial prompt");
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

//     logToStderr("Interview initialized successfully");
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
//     logToStderr("Initialize interview error", error.message);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// }

// async function handleProcessResponse({ sessionId, userMessage, contextState, questionCount }) {
//   if (!sessionId || !userMessage || !contextState) {
//     throw new McpError(ErrorCode.InvalidParams, "sessionId, userMessage, and contextState are required");
//   }

//   try {
//     await connectDB();
//     logToStderr("Processing response for session", sessionId);
    
//     const session = await MCPSession.findOne({ sessionId }).maxTimeMS(10000);
//     if (!session) {
//       throw new McpError(ErrorCode.NotFound, "Session not found");
//     }

//     const [job, resume] = await Promise.all([
//       JobDescription.findById(session.jobId).maxTimeMS(10000),
//       Resume.findById(session.resumeId).maxTimeMS(10000),
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
//         question_metadata: question_metadata || null,
//       };

//       await Resume.updateOne(
//         { _id: session.resumeId, "voiceInterviewResults.sessionId": sessionId },
//         { $push: { "voiceInterviewResults.$.interactions": newInteraction } }
//       );
//     }

//     logToStderr("Response processed successfully");
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
//     logToStderr("Process response error", error.message);
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
//       // throw new McpError(ErrorCode.NotFound, "Session not found");
//       console.log("Session not found");
//     }

//     const job = await JobDescription.findById(jobId);
//     if (!job) {
//       // throw new McpError(ErrorCode.NotFound, "Job not found");
//       console.log("Job not found");
//     }

//     const resume = await Resume.findById(resumeId);
//     if (!resume) {
//       // throw new McpError(ErrorCode.NotFound, "Resume not found");
//       console.log("Resume not found");
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
//           to: "refatbubt@gmail.com",
//           // to: resume.email,
//           subject: "Voice Interview Completion",
//           text: `Dear ${resume.candidateName || "Candidate"},\n\nThank you for completing your voice interview for ${job.context}. Your responses have been submitted for review.\n\nBest regards,\nAI Interview Team`,
//         };
//         await transporter.sendMail(mailOptions);
//       } catch (emailError) {
//         // logToStderr("Email sending failed", emailError.message);
//         console.log("Email sending failed");
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
//     // logToStderr("Submit interview error", error.message);
//     // throw new McpError(ErrorCode.InternalError, error.message);
//     console.log("Submit interview error");
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
//     logToStderr(`Tool ${name} error`, error.message);
//     throw new McpError(ErrorCode.InternalError, error.message);
//   }
// });

// // Logging utility that doesn't interfere with JSON communication
// // function logToStderr(message, data = null) {
// //   const timestamp = new Date().toISOString();
// //   const logMessage = data 
// //     ? `[${timestamp}] MCP Server: ${message} - ${JSON.stringify(data)}`
// //     : `[${timestamp}] MCP Server: ${message}`;
// //   process.stderr.write(logMessage + '\n');
// // }

// // Start server
// async function main() {
//   try {
//     // Suppress database connection messages from stdout
//     // const originalConsoleLog = console.log;
//     // console.log = (...args) => {
//     //   const message = args.join(' ');
//     //   // Only redirect database messages to stderr, allow other logs
//     //   if (message.includes('Database Connected') || message.includes('MongoDB') || message.includes('DB Host')) {
//     //     logToStderr(message);
//     //   } else {
//     //     originalConsoleLog(...args);
//     //   }
//     // };

//     // Connect to database first with timeout
//     const dbConnection = connectDB();
//     const dbTimeout = new Promise((_, reject) => 
//       setTimeout(() => reject(new Error('Database connection timeout')), 100000)
//     );
    
//     await Promise.race([dbConnection, dbTimeout]);
//     logToStderr("Database connection established successfully");
    
//     // Initialize MCP transport
//     const transport = new StdioServerTransport();
    
//     // Set up error handlers before connecting
//     process.on('uncaughtException', (error) => {
//       logToStderr("Uncaught exception", error.message);
//       process.exit(1);
//     });

//     process.on('unhandledRejection', (reason, promise) => {
//       logToStderr("Unhandled rejection", { reason: reason?.message || reason, promise });
//       process.exit(1);
//     });

//     process.on('SIGTERM', () => {
//       logToStderr("Received SIGTERM, shutting down gracefully");
//       process.exit(0);
//     });

//     process.on('SIGINT', () => {
//       logToStderr("Received SIGINT, shutting down gracefully");
//       process.exit(0);
//     });

//     // Connect to MCP transport
//     await server.connect(transport);
//     logToStderr("MCP transport connected");
    
//     // Signal readiness to parent process via stdout (this is the only stdout message)
//     process.stdout.write("MCP Server ready\n");
    
//     logToStderr("MCP Server started and ready for requests");
    
//   } catch (error) {
//     logToStderr("Failed to start MCP Server", error.message);
//     process.exit(1);
//   }
// }

// // Handle process cleanup
// process.on('exit', (code) => {
//   logToStderr(`MCP Server process exiting with code: ${code}`);
// });

// main().catch((error) => {
//   logToStderr("Fatal error in main", error.message);
//   process.exit(1);
// });