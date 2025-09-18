// import express from "express";
// import router from "./routes/match.js";
// import authRouter from "./routes/auth.js";
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
// import { resumePendingWorkflows } from "./controllers/aiInterview/agentController.js";
// import { spawn } from "child_process";
// import { OpenAI } from "openai";
// import multer from "multer";
// import path from "path";
// import fs from "fs/promises";
// import { fileURLToPath } from "url";

// // Get __dirname equivalent in ES modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Create a shared uploads directory at the root level
// const uploadsDir = path.join(__dirname, "Uploads");

// // Ensure uploads directory exists
// try {
//   await fs.mkdir(uploadsDir, { recursive: true });
//   console.log("Uploads directory created/verified at:", uploadsDir);
// } catch (error) {
//   console.error("Failed to create uploads directory:", error);
// }

// // Configure multer for file uploads with absolute path
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir); // Use absolute path
//   },
//   filename: (req, file, cb) => {
//     const timestamp = Date.now();
//     const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_"); // Sanitize filename
//     cb(null, `${timestamp}-${originalName}`);
//   },
// });

// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 50 * 1024 * 1024, // 50MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     // Accept video files
//     if (file.mimetype.startsWith("video/")) {
//       cb(null, true);
//     } else {
//       cb(new Error("Only video files are allowed"), false);
//     }
//   },
// });

// dotenv.config();

// const app = express();
// const server = http.createServer(app);

// export const io = new Server(server, {
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"],
//   },
// });

// // Middleware
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
//       "chrome-extension://igfekpkjkmfhkaeflnjpmafjmjgekdgd",
//     ],
//     credentials: true,
//   })
// );
// app.use(cookieParser());
// app.use(bodyParser.json({ limit: "2mb" }));

// // Socket.io connection handling
// io.on("connect", (socket) => {
//   console.log("A user connected");
//   socket.on("disconnect", () => {
//     console.log("A user disconnected");
//   });
// });

// // Initialize OpenAI
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // Enhanced MCP Client with proper connection management
// class MCPClient {
//   constructor() {
//     this.process = null;
//     this.requestId = 0;
//     this.pendingRequests = new Map();
//     this.isConnected = false;
//     this.isConnecting = false;
//     this.connectionPromise = null;
//     this.reconnectAttempts = 0;
//     this.maxReconnectAttempts = 0;
//     this.reconnectDelay = 2000;
//     this.heartbeatInterval = null;
//     this.lastHeartbeat = null;
//   }

//   async connect() {
//     if (this.isConnected && this.process && !this.process.killed) {
//       console.log("MCP client already connected");
//       return true;
//     }

//     if (this.isConnecting && this.connectionPromise) {
//       console.log("Waiting for existing connection attempt...");
//       return await this.connectionPromise;
//     }

//     this.isConnecting = true;
//     this.connectionPromise = this._performConnection();

//     try {
//       const result = await this.connectionPromise;
//       return result;
//     } finally {
//       this.isConnecting = false;
//       this.connectionPromise = null;
//     }
//   }

//   async _performConnection() {
//     console.log("Creating new MCP client connection...");

//     return new Promise((resolve, reject) => {
//       try {
//         this._cleanup();

//         this.process = spawn("node", ["./controllers/aiInterview/mcpServer.js"], {
//           stdio: ["pipe", "pipe", "pipe"],
//           env: {
//             ...process.env,
//             NODE_ENV: process.env.NODE_ENV || "development",
//           },
//           detached: false,
//           cwd: process.cwd(),
//         });

//         let readyReceived = false;
//         const connectionTimeout = setTimeout(() => {
//           if (!readyReceived) {
//             console.error("MCP Server failed to initialize within 60 seconds");
//             this._cleanup();
//             reject(new Error("MCP Server failed to initialize within 60 seconds"));
//           }
//         }, 60000);

//         this.process.on("error", (error) => {
//           console.error("MCP process error:", error.message);
//           this._cleanup();
//           clearTimeout(connectionTimeout);
//           if (!readyReceived) {
//             reject(error);
//           }
//         });

//         this.process.on("exit", (code, signal) => {
//           console.error(`MCP process exited with code: ${code}, signal: ${signal}`);
//           this._cleanup();
//           clearTimeout(connectionTimeout);

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
//           try {
//             const lines = rawData.split("\n").filter((line) => line.trim());

//             for (const line of lines) {
//               const trimmedLine = line.trim();

//               if (trimmedLine === "MCP Server ready") {
//                 if (!readyReceived) {
//                   readyReceived = true;
//                   this.isConnected = true;
//                   this.reconnectAttempts = 0;
//                   this.lastHeartbeat = Date.now();
//                   clearTimeout(connectionTimeout);
//                   console.log("MCP Server connection established");
//                   this._startHeartbeat();
//                   resolve(true);
//                 }
//                 continue;
//               }

//               if (!trimmedLine.startsWith("{")) {
//                 continue;
//               }

//               try {
//                 const response = JSON.parse(trimmedLine);
//                 console.log("Parsed MCP response:", JSON.stringify(response, null, 2));

//                 if (response.id && this.pendingRequests.has(response.id)) {
//                   const { resolve: resolveRequest, reject: rejectRequest } = this.pendingRequests.get(response.id);
//                   this.pendingRequests.delete(response.id);

//                   if (response.error) {
//                     console.error("MCP Server error:", response.error);
//                     rejectRequest(new Error(`MCP Server error: ${response.error.message || response.error}`));
//                   } else {
//                     console.log("MCP request resolved successfully");
//                     resolveRequest(response);
//                   }
//                 }
//               } catch (jsonError) {
//                 if (trimmedLine.length > 0) {
//                   console.log("Non-JSON output from MCP server:", trimmedLine.substring(0, 200));
//                 }
//               }
//             }
//           } catch (error) {
//             console.error("Error processing MCP stdout:", error.message);
//           }
//         });

//         this.process.stderr.on("data", (data) => {
//           const errorMsg = data.toString().trim();
//           if (errorMsg) {
//             console.log("MCP Server stderr:", errorMsg);
//           }
//         });
//       } catch (error) {
//         this._cleanup();
//         reject(error);
//       }
//     });
//   }

//   _startHeartbeat() {
//     if (this.heartbeatInterval) {
//       clearInterval(this.heartbeatInterval);
//     }

//     this.heartbeatInterval = setInterval(() => {
//       if (!this.isConnected || !this.process || this.process.killed) {
//         this._stopHeartbeat();
//         return;
//       }

//       const now = Date.now();
//       if (this.lastHeartbeat && now - this.lastHeartbeat > 60000) {
//         console.warn("MCP Server appears unresponsive, reconnecting...");
//         this._cleanup();
//       }
//     }, 30000);
//   }

//   _stopHeartbeat() {
//     if (this.heartbeatInterval) {
//       clearInterval(this.heartbeatInterval);
//       this.heartbeatInterval = null;
//     }
//   }

//   _cleanup() {
//     this.isConnected = false;
//     this._stopHeartbeat();

//     if (this.process && !this.process.killed) {
//       try {
//         this.process.kill("SIGTERM");
//         setTimeout(() => {
//           if (this.process && !this.process.killed) {
//             this.process.kill("SIGKILL");
//           }
//         }, 5000);
//       } catch (error) {
//         console.error("Error killing MCP process:", error.message);
//       }
//     }
//     this.process = null;
//   }

//   async callTool(method, params) {
//     console.log(`Calling MCP tool: ${method}`);
//     console.log("Tool params:", JSON.stringify(params, null, 2));

//     let retryCount = 0;
//     const maxRetries = 3;

//     while (retryCount < maxRetries) {
//       try {
//         if (!this.isConnected || !this.process || this.process.killed) {
//           console.log(`MCP Client not connected, attempting to connect... (attempt ${retryCount + 1})`);
//           await this.connect();
//         }

//         if (!this.isConnected) {
//           throw new Error("MCP Client is not connected after connection attempt");
//         }
//         break;
//       } catch (error) {
//         retryCount++;
//         if (retryCount >= maxRetries) {
//           throw new Error(`Failed to connect to MCP server after ${maxRetries} attempts: ${error.message}`);
//         }
//         console.warn(`Connection attempt ${retryCount} failed, retrying in ${this.reconnectDelay}ms...`);
//         await new Promise((resolve) => setTimeout(resolve, this.reconnectDelay));
//         this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
//       }
//     }

//     return new Promise((resolve, reject) => {
//       const id = ++this.requestId;
//       const request = {
//         jsonrpc: "2.0",
//         id,
//         method,
//         params,
//       };

//       console.log("Sending MCP request:", JSON.stringify(request, null, 2));

//       const timeoutMs = method === "process_response" ? 120000 : 60000;
//       const timeoutId = setTimeout(() => {
//         if (this.pendingRequests.has(id)) {
//           this.pendingRequests.delete(id);
//           reject(new Error(`Request timeout after ${timeoutMs / 1000} seconds for method: ${method}`));
//         }
//       }, timeoutMs);

//       this.pendingRequests.set(id, {
//         resolve: (response) => {
//           clearTimeout(timeoutId);
//           this.lastHeartbeat = Date.now();
//           resolve(response);
//         },
//         reject: (error) => {
//           clearTimeout(timeoutId);
//           reject(error);
//         },
//       });

//       try {
//         if (!this.process.stdin || !this.process.stdin.writable) {
//           this.pendingRequests.delete(id);
//           clearTimeout(timeoutId);
//           reject(new Error("MCP process stdin is not writable"));
//           return;
//         }

//         const requestString = JSON.stringify(request) + "\n";
//         this.process.stdin.write(requestString, (err) => {
//           if (err) {
//             this.pendingRequests.delete(id);
//             clearTimeout(timeoutId);
//             reject(new Error(`Failed to write to MCP stdin: ${err.message}`));
//           }
//         });
//       } catch (error) {
//         this.pendingRequests.delete(id);
//         clearTimeout(timeoutId);
//         reject(new Error(`Error sending MCP request: ${error.message}`));
//       }
//     });
//   }

//   disconnect() {
//     this._cleanup();
//     for (const [id, { reject }] of this.pendingRequests) {
//       reject(new Error("MCP Client disconnected"));
//     }
//     this.pendingRequests.clear();
//   }

//   isHealthy() {
//     return (
//       this.isConnected &&
//       this.process &&
//       !this.process.killed &&
//       (!this.lastHeartbeat || Date.now() - this.lastHeartbeat < 120000)
//     );
//   }
// }

// // Singleton MCP client instance
// let mcpClientInstance = null;
// const clientLock = { locked: false, queue: [] };

// async function getMCPClient() {
//   if (mcpClientInstance && mcpClientInstance.isHealthy()) {
//     return mcpClientInstance;
//   }

//   if (clientLock.locked) {
//     return new Promise((resolve, reject) => {
//       const timeout = setTimeout(() => {
//         reject(new Error("Timeout waiting for MCP client"));
//       }, 30000);

//       clientLock.queue.push({
//         resolve: (client) => {
//           clearTimeout(timeout);
//           resolve(client);
//         },
//         reject: (error) => {
//           clearTimeout(timeout);
//           reject(error);
//         },
//       });
//     });
//   }

//   clientLock.locked = true;

//   try {
//     if (!mcpClientInstance || !mcpClientInstance.isHealthy()) {
//       if (mcpClientInstance) {
//         mcpClientInstance.disconnect();
//       }
//       mcpClientInstance = new MCPClient();
//     }

//     await mcpClientInstance.connect();

//     const queue = clientLock.queue.splice(0);
//     for (const { resolve } of queue) {
//       resolve(mcpClientInstance);
//     }

//     return mcpClientInstance;
//   } catch (error) {
//     console.error("Failed to get MCP client:", error.message);

//     const queue = clientLock.queue.splice(0);
//     for (const { reject } of queue) {
//       reject(error);
//     }

//     if (mcpClientInstance) {
//       mcpClientInstance.disconnect();
//     }
//     mcpClientInstance = null;
//     throw error;
//   } finally {
//     clientLock.locked = false;
//   }
// }

// // Deduplication variables
// let lastInitializeRequest = null;
// let lastInitializeTimestamp = 0;
// let lastProcessVideoRequest = null;
// let lastProcessVideoTimestamp = 0;
// let lastSubmitRequest = null;
// let lastSubmitTimestamp = 0;

// // API routes
// app.use("/v1", router);
// app.use("/v1/notifications", notificationRoutes);
// app.use("/v1/auth", authRouter);
// app.use("/", paymentRoutes);
// app.use("/", companyPaymentRoutes);
// app.use("/", calendlyRoutes);

// // Initialize interview endpoint
// app.post("/v1/api/initialize", async (req, res) => {
//   console.log("=== Initialize Interview Request ===");
//   console.log("Request body:", JSON.stringify(req.body, null, 2));

//   const requestKey = JSON.stringify(req.body);
//   const currentTime = Date.now();

//   if (lastInitializeRequest === requestKey && currentTime - lastInitializeTimestamp < 1000) {
//     console.log("Ignoring duplicate initialize request");
//     return res.status(429).json({
//       success: false,
//       error: "Duplicate request detected, please wait",
//     });
//   }

//   lastInitializeRequest = requestKey;
//   lastInitializeTimestamp = currentTime;

//   try {
//     const client = await getMCPClient();
//     console.log("Got MCP client, calling initialize_interview...");

//     const result = await client.callTool("initialize_interview", req.body);
//     console.log("MCP result received:", JSON.stringify(result, null, 2));

//     if (result && result.result && result.result.content && result.result.content[0] && result.result.content[0].text) {
//       try {
//         const responseData = JSON.parse(result.result.content[0].text);
//         console.log("Parsed response data:", JSON.stringify(responseData, null, 2));
//         res.json(responseData);
//       } catch (parseError) {
//         console.error("Failed to parse MCP response:", parseError.message);
//         console.error("Raw response:", result.result.content[0].text);
//         throw new Error(`Failed to parse MCP response: ${parseError.message}`);
//       }
//     } else {
//       console.error("Invalid response structure from MCP server:", JSON.stringify(result, null, 2));
//       throw new Error("Invalid response format from MCP server");
//     }
//   } catch (error) {
//     console.error("Initialize error:", error.message);
//     console.error("Error stack:", error.stack);
//     res.status(500).json({
//       success: false,
//       error: `Failed to initialize interview: ${error.message}`,
//     });
//   }
// });

// // Process video endpoint
// app.post("/v1/api/process-video", upload.single("video"), async (req, res) => {
//   console.log("=== Process Video Request Started ===");
//   console.log("Request body keys:", Object.keys(req.body));
//   console.log(
//     "File info:",
//     req.file
//       ? {
//           originalname: req.file.originalname,
//           filename: req.file.filename,
//           path: req.file.path,
//           size: req.file.size,
//           mimetype: req.file.mimetype,
//         }
//       : "No file uploaded"
//   );

//   const requestKey = JSON.stringify({
//     sessionId: req.body.sessionId,
//     contextState: req.body.contextState,
//     questionCount: req.body.questionCount,
//   });
//   const currentTime = Date.now();

//   if (lastProcessVideoRequest === requestKey && currentTime - lastProcessVideoTimestamp < 1000) {
//     console.log("Ignoring duplicate process-video request");
//     return res.status(429).json({
//       success: false,
//       error: "Duplicate request detected, please wait",
//     });
//   }

//   lastProcessVideoRequest = requestKey;
//   lastProcessVideoTimestamp = currentTime;

//   if (!req.file) {
//     console.error("No video file uploaded");
//     return res.status(400).json({
//       success: false,
//       error: "No video file uploaded",
//     });
//   }

//   const { sessionId, userMessage, contextState, questionCount } = req.body;

//   if (!sessionId || !contextState) {
//     console.error("Missing required fields:", { sessionId: !!sessionId, contextState: !!contextState });
//     return res.status(400).json({
//       success: false,
//       error: "Missing required fields: sessionId, contextState",
//     });
//   }

//   console.log("Processing video for session:", {
//     sessionId,
//     questionCount,
//     fileSize: req.file.size,
//     fileName: req.file.filename,
//     filePath: req.file.path,
//   });

//   try {
//     const stats = await fs.stat(req.file.path);
//     console.log("File verification successful:", {
//       path: req.file.path,
//       size: stats.size,
//       exists: true,
//     });
//   } catch (error) {
//     console.error("File verification failed:", error);
//     return res.status(500).json({
//       success: false,
//       error: "Uploaded file not accessible",
//     });
//   }

//   try {
//     let parsedContextState;
//     try {
//       parsedContextState = typeof contextState === "string" ? JSON.parse(contextState) : contextState;
//     } catch (parseError) {
//       console.error("Context state parse error:", parseError);
//       throw new Error("Invalid contextState JSON format");
//     }

//     console.log("Calling MCP client with video path:", req.file.path);
//     const client = await getMCPClient();

//     const result = await client.callTool("process_response", {
//       sessionId,
//       userMessage: userMessage || "",
//       videoPath: req.file.path,
//       contextState: parsedContextState,
//       questionCount: Number.parseInt(questionCount, 10) || 1,
//     });

//     console.log("MCP client response received");

//     if (result && result.result && result.result.content && result.result.content[0] && result.result.content[0].text) {
//       const responseData = JSON.parse(result.result.content[0].text);
//       console.log("Transcription received:", responseData.transcription?.substring(0, 200) || "No transcription");
//       console.log("Response success:", responseData.success);
//       res.json(responseData);
//     } else {
//       console.error("Invalid response format from MCP server:", result);
//       throw new Error("Invalid response format from MCP server");
//     }
//   } catch (error) {
//     console.error("Process video error:", error.message);
//     console.error("Error stack:", error.stack);
//     res.status(500).json({
//       success: false,
//       error: `Failed to process video: ${error.message}`,
//     });
//   } finally {
//     if (req.file && req.file.path) {
//       try {
//         await fs.unlink(req.file.path);
//         console.log("Cleaned up video file:", req.file.path);
//       } catch (cleanupError) {
//         console.error("Failed to clean up video file:", cleanupError.message);
//       }
//     }
//   }
// });

// // Submit interview endpoint
// app.post("/v1/api/submit", async (req, res) => {
//   console.log("=== Submit Interview Request ===");
//   console.log("Request body:", JSON.stringify(req.body, null, 2));

//   const requestKey = JSON.stringify({
//     sessionId: req.body.sessionId,
//     jobId: req.body.jobId,
//     resumeId: req.body.resumeId,
//   });
//   const currentTime = Date.now();

//   if (lastSubmitRequest === requestKey && currentTime - lastSubmitTimestamp < 1000) {
//     console.log("Ignoring duplicate submit request");
//     return res.status(429).json({
//       success: false,
//       error: "Duplicate request detected, please wait",
//     });
//   }

//   lastSubmitRequest = requestKey;
//   lastSubmitTimestamp = currentTime;

//   try {
//     const client = await getMCPClient();
//     const result = await client.callTool("submit_interview", req.body);

//     if (result && result.result && result.result.content && result.result.content[0] && result.result.content[0].text) {
//       const responseData = JSON.parse(result.result.content[0].text);
//       console.log("Submit response:", JSON.stringify(responseData, null, 2));
//       res.json(responseData);
//     } else {
//       throw new Error("Invalid response format from MCP server");
//     }
//   } catch (error) {
//     console.error("Submit error:", error.message);
//     res.status(500).json({
//       success: false,
//       error: `Failed to submit interview: ${error.message}`,
//     });
//   }
// });

// // Health check endpoint
// app.get("/health", (req, res) => {
//   const mcpStatus = mcpClientInstance
//     ? {
//         connected: mcpClientInstance.isConnected,
//         healthy: mcpClientInstance.isHealthy(),
//         processAlive: mcpClientInstance.process && !mcpClientInstance.process.killed,
//         pendingRequests: mcpClientInstance.pendingRequests.size,
//         lastHeartbeat: mcpClientInstance.lastHeartbeat,
//       }
//     : null;

//   res.json({
//     status: "OK",
//     timestamp: new Date().toISOString(),
//     uploadsDir: uploadsDir,
//     mcp: mcpStatus,
//   });
// });

// // MCP status endpoint for debugging
// app.get("/mcp-status", async (req, res) => {
//   try {
//     if (!mcpClientInstance) {
//       return res.json({
//         status: "No MCP client instance",
//         connected: false,
//       });
//     }

//     const status = {
//       connected: mcpClientInstance.isConnected,
//       healthy: mcpClientInstance.isHealthy(),
//       processAlive: mcpClientInstance.process && !mcpClientInstance.process.killed,
//       pendingRequests: mcpClientInstance.pendingRequests.size,
//       lastHeartbeat: mcpClientInstance.lastHeartbeat,
//       reconnectAttempts: mcpClientInstance.reconnectAttempts,
//     };

//     if (!mcpClientInstance.isHealthy()) {
//       try {
//         await getMCPClient();
//         status.reconnected = true;
//       } catch (error) {
//         status.reconnectError = error.message;
//       }
//     }

//     res.json(status);
//   } catch (error) {
//     res.status(500).json({
//       error: error.message,
//       connected: false,
//     });
//   }
// });

// // Error handling middleware
// app.use((err, req, res, next) => {
//   console.error("Server error:", err.stack);

//   if (err instanceof multer.MulterError) {
//     if (err.code === "LIMIT_FILE_SIZE") {
//       return res.status(400).json({
//         success: false,
//         error: "File too large. Maximum size is 50MB.",
//       });
//     }
//   }

//   res.status(500).json({
//     success: false,
//     error: "Internal server error",
//   });
// });

// // Start server
// const PORT = process.env.PORT || 5000;

// server.listen(PORT, async () => {
//   try {
//     await connectDB();
//     console.log("Database connected successfully");

//     await resumePendingWorkflows();
//     console.log("Pending workflows resumed");

//     console.log(`Server running on port ${PORT}`);
//     console.log(`Uploads directory: ${uploadsDir}`);

//     try {
//       await getMCPClient();
//       console.log("MCP client initialized successfully");
//     } catch (error) {
//       console.warn("Failed to initialize MCP client on startup:", error.message);
//       console.warn("MCP client will be initialized on first request");
//     }
//   } catch (error) {
//     console.error("Failed to start server:", error.message);
//     process.exit(1);
//   }
// });

// // Graceful shutdown handler
// const gracefulShutdown = (signal) => {
//   console.log(`Received ${signal}, cleaning up...`);

//   if (mcpClientInstance) {
//     console.log("Disconnecting MCP client...");
//     mcpClientInstance.disconnect();
//   }

//   server.close(() => {
//     console.log("Server closed");
//     process.exit(0);
//   });

//   setTimeout(() => {
//     console.log("Force exit");
//     process.exit(1);
//   }, 10000);
// };

// process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
// process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// process.on("uncaughtException", (error) => {
//   console.error("Uncaught Exception:", error);
//   gracefulShutdown("uncaughtException");
// });

// process.on("unhandledRejection", (reason, promise) => {
//   console.error("Unhandled Rejection at:", promise, "reason:", reason);
//   gracefulShutdown("unhandledRejection");
// });