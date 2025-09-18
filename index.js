import express from "express"
import router from "./routes/match.js"
import authRouter from "./routes/auth.js"
import workflowRoutes from "./routes/workflowRoutes.js"
import headhunterRoutes from "./routes/headhunterRoutes.js"
import notificationRoutes from "./routes/notificationRoutes.js"
import businessDevelopmentRoutes from "./routes/businessDevelopmentRoutes.js"
import businessDevelopmentAgentRoutes from "./routes/businessDevelopmentAgentRoutes.js"
import businessDevelopmentRoutes2 from "./routes/businessDevelopmentRoutes2.js"
import aiInterviewRoutes, { attachIO } from "./routes/aiInterviewRoutes.js"
import dotenv from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser"
import http from "http"
import { Server } from "socket.io"
import logger from "morgan"
import connectDB from "./db/index.js"
import bodyParser from "body-parser"
import paymentRoutes from "./controllers/extensionPayment/paymentRoutes.js"
import companyPaymentRoutes from "./controllers/companyPayment/paymentRoutes.js"
import calendlyRoutes from "./controllers/calendly/calendlyRouter.js"
import calendlyController from "./controllers/calendly/calendlyController.js"
import { resumePendingWorkflows } from "./controllers/aiInterview/agentController.js"
import { handleLinkedInVerification } from "./controllers/aiInterview/headhunterController.js"

dotenv.config()

const app = express()
const server = http.createServer(app)

// Initialize Socket.IO
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

// Middleware
app.use(logger("dev"))
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ limit: "50mb", extended: true }))
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://bloomix2.netlify.app",
      "https://bloomix.netlify.app",
      "https://bloomix3.netlify.app",
      "*",
      "chrome-extension://igfekpkjkmfhkaeflnjpmafjmjgekdgd",
      "chrome-extension://ignihmapbcgjplfoblacilidfmckicgc",
      "chrome-extension://*",
    ],
    credentials: true,
  }),
)
app.use(cookieParser())
app.use(bodyParser.json({ limit: "2mb" }))

// Socket.IO connection handling
io.on("connect", (socket) => {
  console.log("A user connected:", socket.id)

  handleLinkedInVerification(socket);

  socket.on("join_interview", (sessionId) => {
    socket.join(`interview_${sessionId}`)
    console.log(`User ${socket.id} joined interview ${sessionId}`)
  })

  socket.on("interview_status", (data) => {
    socket.to(`interview_${data.sessionId}`).emit("status_update", data)
  })

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id)
  })
})

const startServer = async () => {
  try {
    await connectDB()
    console.log("MongoDB connected successfully!")

    await resumePendingWorkflows()

    // Set up routes after DB connection
    app.use("/v1", router)
    app.use("/v1/notifications", notificationRoutes)
    app.use("/v1/auth", authRouter)
    app.use("/v1/api/calendly", calendlyController)
    app.use("/", paymentRoutes)
    app.use("/", companyPaymentRoutes)
    app.use("/", calendlyRoutes)
    app.use("/v1/api/workflows", workflowRoutes)
    app.use("/v1/api/headhunter", headhunterRoutes)
    app.use("/v1/api/business-dev", businessDevelopmentRoutes)
    app.use("/v1/api/business-development", businessDevelopmentAgentRoutes)
    // app.use("/v1/api/business-dev", businessDevelopmentRoutes)

    // AI Interview routes with Socket.IO support
    app.use("/v1/api", attachIO(io), aiInterviewRoutes)

    app.get("/", (req, res) => {
      res.send("Hello to Everyone from Bloomix!")
    })
    // Add this to your app.js for health checks
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        playwright: process.env.PLAYWRIGHT_BROWSERS_PATH 
    });
});

    server.listen(process.env.PORT || 5000, () => {
      console.log(`Server is running at port: ${process.env.PORT || 5000}`)
    })
  } catch (err) {
    console.log("MongoDB connection failed: ", err)
  }
}

startServer()


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
//       await new Promise(resolve => {
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
//           this.process.kill('SIGTERM');
//         }

//         this.process = spawn("node", ["./controllers/aiInterview/mcpServer.js"], {
//           stdio: ["pipe", "pipe", "pipe"],
//           env: { ...process.env },
//           detached: false
//         });

//         let readyReceived = false;
//         const connectionTimeout = setTimeout(() => {
//           if (!readyReceived) {
//             this.isConnecting = false;
//             this.isConnected = false;
//             if (this.process && !this.process.killed) {
//               this.process.kill('SIGKILL');
//             }
//             reject(new Error("MCP Server failed to initialize within 15 seconds"));
//           }
//         }, 15000);

//         this.process.on("error", (error) => {
//           // console.error("MCP process error:", error);
//           this.isConnected = false;
//           this.isConnecting = false;
//           clearTimeout(connectionTimeout);
//           if (!readyReceived) {
//             reject(error);
//           }
//         });

//         this.process.on("exit", (code, signal) => {
//           // console.error(`MCP process exited with code: ${code}, signal: ${signal}`);
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
//           // console.log("Raw MCP stdout:", rawData);
          
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
//               if (!trimmedLine.startsWith('{') && !trimmedLine.startsWith('[')) {
//                 console.log("Skipping non-JSON line:", trimmedLine);
//                 continue;
//               }

//               // Try to parse as JSON
//               try {
//                 const response = JSON.parse(trimmedLine);
//                 console.log("Parsed MCP response:", JSON.stringify(response, null, 2));
                
//                 if (response.id && this.pendingRequests.has(response.id)) {
//                   const { resolve: resolveRequest } = this.pendingRequests.get(response.id);
//                   this.pendingRequests.delete(response.id);
//                   resolveRequest(response);
//                 } else {
//                   console.warn("Unexpected MCP response ID or missing ID:", response.id);
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
//           if (errorMsg.includes('error') || errorMsg.includes('Error') || errorMsg.includes('ERROR')) {
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
//           reject(new Error(`Request timeout after 50 seconds for tool: ${name}`));
//         }
//       }, 50000);

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
//       this.process.kill('SIGTERM');
//       // Wait a bit for graceful shutdown
//       await new Promise(resolve => setTimeout(resolve, 1000));
//     }
    
//     this.pendingRequests.clear();
//     await this.connect();
//   }

//   disconnect() {
//     this.isConnected = false;
//     this.isConnecting = false;
    
//     if (this.process && !this.process.killed) {
//       this.process.kill('SIGTERM');
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
//   if (mcpClient && mcpClient.isConnected && mcpClient.process && !mcpClient.process.killed) {
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
//       setTimeout(() => reject(new Error('MCP Client connection timeout after 20 seconds')), 20000)
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
// process.on('SIGTERM', () => {
//   console.log('Received SIGTERM, cleaning up MCP client...');
//   if (mcpClient) {
//     mcpClient.disconnect();
//   }
//   process.exit(0);
// });

// process.on('SIGINT', () => {
//   console.log('Received SIGINT, cleaning up MCP client...');
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
//               error: "Missing required fields: jobId, resumeId, or interviewSettings",
//               success: false
//             });
//           }

//           console.log("Initialize request:", { jobId, resumeId, interviewSettings });

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
//             throw new Error(result.error.message || "MCP Server returned error");
//           }

//           if (!result.result) {
//             throw new Error("MCP Server returned empty result");
//           }

//           return res.json({
//             success: true,
//             ...result.result
//           });

//         } catch (error) {
//           lastError = error;
//           console.error(`Initialize attempt ${attempt} failed:`, error.message);
          
//           if (attempt === maxRetries) {
//             console.error("All initialize attempts failed");
//             return res.status(500).json({
//               error: `Failed after ${maxRetries} attempts: ${error.message}`,
//               success: false,
//               lastError: error.message
//             });
//           }

//           // Wait before retry, with exponential backoff
//           const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
//           console.log(`Waiting ${delay}ms before retry...`);
//           await new Promise((resolve) => setTimeout(resolve, delay));
          
//           // Force reconnection if connection-related error
//           if (error.message.includes('not connected') || error.message.includes('exited')) {
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
//           const { sessionId, userMessage, contextState, questionCount } = req.body;
          
//           if (!sessionId || !userMessage || !contextState || questionCount === undefined) {
//             return res.status(400).json({
//               error: "Missing required fields",
//               success: false
//             });
//           }

//           console.log("Process request:", { sessionId, userMessage, questionCount });

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
//             ...result.result
//           });

//         } catch (error) {
//           console.error(`Process attempt ${attempt} failed:`, error.message);
          
//           if (attempt === maxRetries) {
//             return res.status(500).json({
//               error: error.message,
//               success: false
//             });
//           }

//           await new Promise((resolve) => setTimeout(resolve, 1000));
          
//           if (error.message.includes('not connected') || error.message.includes('exited')) {
//             try {
//               if (mcpClient) {
//                 await mcpClient.reconnect();
//               }
//             } catch (reconnectError) {
//               console.error("Process reconnection failed:", reconnectError.message);
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
//               success: false
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
//             ...result.result
//           });

//         } catch (error) {
//           console.error(`Submit attempt ${attempt} failed:`, error.message);
          
//           if (attempt === maxRetries) {
//             return res.status(500).json({
//               error: error.message,
//               success: false
//             });
//           }

//           await new Promise((resolve) => setTimeout(resolve, 1000));
          
//           if (error.message.includes('not connected') || error.message.includes('exited')) {
//             try {
//               if (mcpClient) {
//                 await mcpClient.reconnect();
//               }
//             } catch (reconnectError) {
//               console.error("Submit reconnection failed:", reconnectError.message);
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
// // import mcpController from "./controllers/mcpController.js"
// import { OpenAI } from "openai";
// import { spawn } from "child_process";
// import { resumePendingWorkflows } from "./controllers/aiInterview/agentController.js";
// // const { spawn } = require("child_process")
// // import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// // import { serverMCP } from "./controllers/aiInterview/mcpServer.js";

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

// // Simple MCP Client with improved error handling
// class MCPClient {
//   constructor() {
//     this.process = null;
//     this.requestId = 0;
//     this.pendingRequests = new Map();
//     this.isConnected = false;
//   }

//   async connect() {
//     return new Promise((resolve, reject) => {
//       this.process = spawn("node", ["./controllers/aiInterview/mcpServer.js"], {
//         stdio: ["pipe", "pipe", "pipe"],
//         env: { ...process.env },
//       });

//       this.process.on("error", (error) => {
//         console.error("MCP process error:", error);
//         this.isConnected = false;
//         reject(error);
//       });

//       this.process.on("exit", (code) => {
//         console.error("MCP process exited with code:", code);
//         this.isConnected = false;
//       });

//       this.process.stdout.on("data", (data) => {
//         const rawData = data.toString().trim();
//         console.log("Raw MCP stdout:", rawData);
//         try {
//           const lines = rawData.split("\n").filter((line) => line.trim());
//           for (const line of lines) {
//             const response = JSON.parse(line);
//             console.log(
//               "Parsed MCP response:",
//               JSON.stringify(response, null, 2)
//             );
//             if (response.id && this.pendingRequests.has(response.id)) {
//               const { resolve: resolveRequest } = this.pendingRequests.get(
//                 response.id
//               );
//               this.pendingRequests.delete(response.id);
//               resolveRequest(response);
//             } else if (response.jsonrpc === "2.0") {
//               console.warn("Unexpected MCP response ID:", response.id);
//             }
//           }
//         } catch (error) {
//           console.error("Error parsing MCP response:", error.message);
//         }
//       });

//       this.process.stderr.on("data", (data) => {
//         console.error("MCP Server error:", data.toString());
//       });

//       // Give the server time to start
//       setTimeout(() => {
//         this.isConnected = true;
//         resolve(true);
//       }, 2000);
//     });
//   }

//   // async callTool(name, args) {
//   //   // if (!this.isConnected || !this.process) {
//   //   //   throw new Error("MCP Client not connected");
//   //   // }

//   //   return new Promise((resolve, reject) => {
//   //     const id = ++this.requestId;
//   //     const request = {
//   //       jsonrpc: "2.0",
//   //       id,
//   //       method: "tools/call",
//   //       params: { name, arguments: args },
//   //     };

//   //     console.log("Sending MCP request:", JSON.stringify(request, null, 2));

//   //     const timeoutId = setTimeout(() => {
//   //       if (this.pendingRequests.has(id)) {
//   //         this.pendingRequests.delete(id);
//   //         reject(console.log("Request timeout"));
//   //         // reject(new Error("Request timeout"));
//   //       }
//   //     }, 50000);

//   //     this.pendingRequests.set(id, {
//   //       resolve: (response) => {
//   //         clearTimeout(timeoutId);
//   //         resolve(response);
//   //       },
//   //       reject: (error) => {
//   //         clearTimeout(timeoutId);
//   //         reject(error);
//   //       },
//   //     });

//   //     try {
//   //       this.process.stdin.write(`${JSON.stringify(request)}\n`);
//   //     } catch (error) {
//   //       this.pendingRequests.delete(id);
//   //       clearTimeout(timeoutId);
//   //       reject(error);
//   //     }
//   //   });
//   // }
//   async callTool(name, args) {
//     if (!this.isConnected || !this.process) {
//       throw new Error("MCP Client not connected");
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
//           reject(new Error("Request timeout after 50 seconds"));
//         }
//       }, 50000);

//       this.pendingRequests.set(id, {
//         resolve: (response) => {
//           clearTimeout(timeoutId);
//           this.pendingRequests.delete(id); // Clean up
//           resolve(response);
//         },
//         reject: (error) => {
//           clearTimeout(timeoutId);
//           this.pendingRequests.delete(id); // Clean up
//           reject(error);
//         },
//       });

//       try {
//         if (!this.process.stdin.writable) {
//           throw new Error("Stdin is not writable");
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
//     if (this.process) {
//       this.process.kill();
//     }
//     this.pendingRequests.clear();
//     await this.connect();
//   }
// }

// // Global MCP client
// let mcpClient = null;

// async function getMCPClient() {
//   if (!mcpClient || !mcpClient.isConnected) {
//     mcpClient = new MCPClient();
//     await mcpClient.connect();
//   }
//   return mcpClient;
// }

// // // API Routes with better error handling (Main)
// // app.post("/v1/api/initialize", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { jobId, resumeId, interviewSettings } = req.body;
// //     console.log("Initialize request:", { jobId, resumeId, interviewSettings });

// //     const result = await client.callTool("initialize_interview", {
// //       jobId,
// //       resumeId,
// //       interviewSettings,
// //     });

// //     console.log("Initialize result:", JSON.stringify(result, null, 2));

// //     if (result.error) {
// //       throw new Error(result.error.message || "MCP Server error");
// //     }

// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Initialize error:", error);
// //     res.status(500).json({
// //       error: error.message,
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: false,
// //             error: error.message,
// //           }),
// //         },
// //       ],
// //     });
// //   }
// // });

// // app.post("/v1/api/process", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { sessionId, userMessage, contextState, questionCount } = req.body;
// //     console.log("Process request:", { sessionId, userMessage, questionCount });

// //     const result = await client.callTool("process_response", {
// //       sessionId,
// //       userMessage,
// //       contextState,
// //       questionCount,
// //     });

// //     console.log("Process result:", JSON.stringify(result, null, 2));

// //     if (result.error) {
// //       throw new Error(result.error.message || "MCP Server error");
// //     }

// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Process error:", error);
// //     res.status(500).json({
// //       error: error.message,
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: false,
// //             error: error.message,
// //           }),
// //         },
// //       ],
// //     });
// //   }
// // });

// // app.post("/v1/api/submit", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const result = await client.callTool("submit_interview", req.body);
// //     console.log("Submit result:", JSON.stringify(result, null, 2));

// //     if (result.error) {
// //       throw new Error(result.error.message || "MCP Server error");
// //     }

// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Submit error:", error);
// //     res.status(500).json({
// //       error: error.message,
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: false,
// //             error: error.message,
// //           }),
// //         },
// //       ],
// //     });
// //   }
// // });

// // Initialize OpenAI
// // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // // Simple MCP Client
// // class MCPClient {
// //   constructor() {
// //     this.process = null;
// //     this.requestId = 0;
// //     this.pendingRequests = new Map();
// //   }

// //   async connect() {
// //     return new Promise((resolve, reject) => {
// //       this.process = spawn("node", ["./controllers/aiInterview/mcpServer.js"], {
// //         stdio: ["pipe", "pipe", "pipe"],
// //         env: { ...process.env },
// //       });

// //       this.process.on("error", (error) => {
// //         console.error("MCP process error:", error);
// //         reject(error);
// //       });

// //       this.process.stdout.on("data", (data) => {
// //         const rawData = data.toString().trim();
// //         console.log("Raw MCP stdout:", rawData);
// //         try {
// //           const lines = rawData.split("\n").filter((line) => line.trim());
// //           for (const line of lines) {
// //             const response = JSON.parse(line);
// //             console.log("Parsed MCP response:", JSON.stringify(response, null, 2));
// //             if (response.id && this.pendingRequests.has(response.id)) {
// //               const { resolve } = this.pendingRequests.get(response.id);
// //               this.pendingRequests.delete(response.id);
// //               resolve(response);
// //             } else {
// //               console.warn("Unexpected MCP response ID:", response.id);
// //             }
// //           }
// //         } catch (error) {
// //           console.error("Error parsing MCP response:", error.message);
// //         }
// //       });

// //       this.process.stderr.on("data", (data) => {
// //         console.error("MCP Server error:", data.toString());
// //       });

// //       setTimeout(() => resolve(true), 1000);
// //     });
// //   }

// //   async callTool(name, args) {
// //     return new Promise((resolve, reject) => {
// //       const id = ++this.requestId;
// //       const request = {
// //         jsonrpc: "2.0",
// //         id,
// //         method: "tools/call",
// //         params: { name, arguments: args },
// //       };

// //       console.log("Sending MCP request:", JSON.stringify(request, null, 2));
// //       this.pendingRequests.set(id, { resolve, reject });
// //       this.process.stdin.write(`${JSON.stringify(request)}\n`);

// //       setTimeout(() => {
// //         if (this.pendingRequests.has(id)) {
// //           this.pendingRequests.delete(id);
// //           reject(new Error("Request timeout"));
// //         }
// //       }, 15000);
// //     });
// //   }
// // }

// // // Global MCP client
// // let mcpClient = null;

// // async function getMCPClient() {
// //   if (!mcpClient) {
// //     mcpClient = new MCPClient();
// //     await mcpClient.connect();
// //   }
// //   return mcpClient;
// // }

// // // API Routes
// // app.post("/v1/api/initialize", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { jobId, resumeId, interviewSettings } = req.body;
// //     console.log("Initialize request:", { jobId, resumeId, interviewSettings });

// //     const result = await client.callTool("initialize_interview", {
// //       jobId,
// //       resumeId,
// //       interviewSettings, // Pass settings directly
// //     });
// //     console.log("Initialize result:", JSON.stringify(result, null, 2));
// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Initialize error:", error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });

// // app.post("/v1/api/process", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { sessionId, userMessage, contextState, questionCount } = req.body;
// //     console.log("Process request:", { sessionId, userMessage, questionCount });

// //     const result = await client.callTool("process_response", {
// //       sessionId,
// //       userMessage,
// //       contextState,
// //       questionCount,
// //     });
// //     console.log("Process result:", JSON.stringify(result, null, 2));
// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Process error:", error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });

// // app.post("/v1/api/submit", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const result = await client.callTool("submit_interview", req.body);
// //     console.log("Submit result:", JSON.stringify(result, null, 2));
// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Submit error:", error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });

// const startServer = async () => {
//   try {
//     await connectDB();
//     // const transport = new StdioServerTransport();
//     // await serverMCP.connect(transport);
//     console.log("AI Interview MCP Server running on stdio");
//     await resumePendingWorkflows();
//     console.log("MongoDB connected successfully!");

//     // Set up routes after DB connection
//     app.use("/v1", router);
//     app.use("/v1/notifications", notificationRoutes);
//     app.use("/v1/auth", authRouter);
//     app.use("/v1/api/calendly", calendlyController);
//     app.use("/", paymentRoutes);
//     app.use("/", companyPaymentRoutes);
//     app.use("/", calendlyRoutes);
//     // app.use("/api/jobs", jobRoutes);
//     // app.use("/api/resumes", resumeRoutes);
//     app.use("/v1/api/workflows", workflowRoutes);
//     // API Routes with better error handling
//     app.post("/v1/api/initialize", async (req, res) => {
//       try {
//         const client = await getMCPClient();
//         const { jobId, resumeId, interviewSettings } = req.body;
//         console.log("Initialize request:", {
//           jobId,
//           resumeId,
//           interviewSettings,
//         });

//         const result = await client.callTool("initialize_interview", {
//           jobId,
//           resumeId,
//           interviewSettings,
//         });

//         console.log("Initialize result:", JSON.stringify(result, null, 2));

//         if (result.error) {
//           throw new Error(result.error.message || "MCP Server error");
//         }

//         res.json(result.result);
//       } catch (error) {
//         console.error("Initialize error:", error);
//         res.status(500).json({
//           error: error.message,
//           content: [
//             {
//               type: "text",
//               text: JSON.stringify({
//                 success: false,
//                 error: error.message,
//               }),
//             },
//           ],
//         });
//       }
//     });

//     app.post("/v1/api/process", async (req, res) => {
//       try {
//         const client = await getMCPClient();
//         const { sessionId, userMessage, contextState, questionCount } =
//           req.body;
//         console.log("Process request:", {
//           sessionId,
//           userMessage,
//           questionCount,
//         });

//         const result = await client.callTool("process_response", {
//           sessionId,
//           userMessage,
//           contextState,
//           questionCount,
//         });

//         console.log("Process result:", JSON.stringify(result, null, 2));

//         if (result.error) {
//           throw new Error(result.error.message || "MCP Server error");
//         }

//         res.json(result.result);
//       } catch (error) {
//         console.error("Process error:", error);
//         res.status(500).json({
//           error: error.message,
//           content: [
//             {
//               type: "text",
//               text: JSON.stringify({
//                 success: false,
//                 error: error.message,
//               }),
//             },
//           ],
//         });
//       }
//     });

//     app.post("/v1/api/submit", async (req, res) => {
//       try {
//         const client = await getMCPClient();
//         const result = await client.callTool("submit_interview", req.body);
//         console.log("Submit result:", JSON.stringify(result, null, 2));

//         if (result.error) {
//           throw new Error(result.error.message || "MCP Server error");
//         }

//         res.json(result.result);
//       } catch (error) {
//         console.error("Submit error:", error);
//         res.status(500).json({
//           error: error.message,
//           content: [
//             {
//               type: "text",
//               text: JSON.stringify({
//                 success: false,
//                 error: error.message,
//               }),
//             },
//           ],
//         });
//       }
//     });
//     console.log("Routes are set up.");

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
//           // console.log("Raw MCP stdout:", rawData);

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

//       // console.log("Sending MCP request:", JSON.stringify(request, null, 2));

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

//           const { jobId, resumeId, interviewSettings, userId } = req.body;

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
//             userId,
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
// ----------------------------first code ---------------------------------
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
// // import mcpController from "./controllers/mcpController.js"
// import { OpenAI } from "openai";
// import { spawn } from "child_process";
// import { resumePendingWorkflows } from "./controllers/aiInterview/agentController.js";
// // const { spawn } = require("child_process")
// // import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// // import { serverMCP } from "./controllers/aiInterview/mcpServer.js";

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

// // Simple MCP Client with improved error handling
// class MCPClient {
//   constructor() {
//     this.process = null;
//     this.requestId = 0;
//     this.pendingRequests = new Map();
//     this.isConnected = false;
//   }

//   async connect() {
//     return new Promise((resolve, reject) => {
//       this.process = spawn("node", ["./controllers/aiInterview/mcpServer.js"], {
//         stdio: ["pipe", "pipe", "pipe"],
//         env: { ...process.env },
//       });

//       this.process.on("error", (error) => {
//         console.error("MCP process error:", error);
//         this.isConnected = false;
//         reject(error);
//       });

//       this.process.on("exit", (code) => {
//         console.error("MCP process exited with code:", code);
//         this.isConnected = false;
//       });

//       this.process.stdout.on("data", (data) => {
//         const rawData = data.toString().trim();
//         console.log("Raw MCP stdout:", rawData);
//         try {
//           const lines = rawData.split("\n").filter((line) => line.trim());
//           for (const line of lines) {
//             const response = JSON.parse(line);
//             console.log(
//               "Parsed MCP response:",
//               JSON.stringify(response, null, 2)
//             );
//             if (response.id && this.pendingRequests.has(response.id)) {
//               const { resolve: resolveRequest } = this.pendingRequests.get(
//                 response.id
//               );
//               this.pendingRequests.delete(response.id);
//               resolveRequest(response);
//             } else if (response.jsonrpc === "2.0") {
//               console.warn("Unexpected MCP response ID:", response.id);
//             }
//           }
//         } catch (error) {
//           console.error("Error parsing MCP response:", error.message);
//         }
//       });

//       this.process.stderr.on("data", (data) => {
//         console.error("MCP Server error:", data.toString());
//       });

//       // Give the server time to start
//       setTimeout(() => {
//         this.isConnected = true;
//         resolve(true);
//       }, 2000);
//     });
//   }

//   // async callTool(name, args) {
//   //   // if (!this.isConnected || !this.process) {
//   //   //   throw new Error("MCP Client not connected");
//   //   // }

//   //   return new Promise((resolve, reject) => {
//   //     const id = ++this.requestId;
//   //     const request = {
//   //       jsonrpc: "2.0",
//   //       id,
//   //       method: "tools/call",
//   //       params: { name, arguments: args },
//   //     };

//   //     console.log("Sending MCP request:", JSON.stringify(request, null, 2));

//   //     const timeoutId = setTimeout(() => {
//   //       if (this.pendingRequests.has(id)) {
//   //         this.pendingRequests.delete(id);
//   //         reject(console.log("Request timeout"));
//   //         // reject(new Error("Request timeout"));
//   //       }
//   //     }, 50000);

//   //     this.pendingRequests.set(id, {
//   //       resolve: (response) => {
//   //         clearTimeout(timeoutId);
//   //         resolve(response);
//   //       },
//   //       reject: (error) => {
//   //         clearTimeout(timeoutId);
//   //         reject(error);
//   //       },
//   //     });

//   //     try {
//   //       this.process.stdin.write(`${JSON.stringify(request)}\n`);
//   //     } catch (error) {
//   //       this.pendingRequests.delete(id);
//   //       clearTimeout(timeoutId);
//   //       reject(error);
//   //     }
//   //   });
//   // }
//   async callTool(name, args) {
//     if (!this.isConnected || !this.process) {
//       throw new Error("MCP Client not connected");
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
//           reject(new Error("Request timeout after 50 seconds"));
//         }
//       }, 50000);

//       this.pendingRequests.set(id, {
//         resolve: (response) => {
//           clearTimeout(timeoutId);
//           this.pendingRequests.delete(id); // Clean up
//           resolve(response);
//         },
//         reject: (error) => {
//           clearTimeout(timeoutId);
//           this.pendingRequests.delete(id); // Clean up
//           reject(error);
//         },
//       });

//       try {
//         if (!this.process.stdin.writable) {
//           throw new Error("Stdin is not writable");
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
//     if (this.process) {
//       this.process.kill();
//     }
//     this.pendingRequests.clear();
//     await this.connect();
//   }
// }

// // Global MCP client
// let mcpClient = null;

// async function getMCPClient() {
//   if (!mcpClient || !mcpClient.isConnected) {
//     mcpClient = new MCPClient();
//     await mcpClient.connect();
//   }
//   return mcpClient;
// }

// // // API Routes with better error handling (Main)
// // app.post("/v1/api/initialize", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { jobId, resumeId, interviewSettings } = req.body;
// //     console.log("Initialize request:", { jobId, resumeId, interviewSettings });

// //     const result = await client.callTool("initialize_interview", {
// //       jobId,
// //       resumeId,
// //       interviewSettings,
// //     });

// //     console.log("Initialize result:", JSON.stringify(result, null, 2));

// //     if (result.error) {
// //       throw new Error(result.error.message || "MCP Server error");
// //     }

// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Initialize error:", error);
// //     res.status(500).json({
// //       error: error.message,
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: false,
// //             error: error.message,
// //           }),
// //         },
// //       ],
// //     });
// //   }
// // });

// // app.post("/v1/api/process", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { sessionId, userMessage, contextState, questionCount } = req.body;
// //     console.log("Process request:", { sessionId, userMessage, questionCount });

// //     const result = await client.callTool("process_response", {
// //       sessionId,
// //       userMessage,
// //       contextState,
// //       questionCount,
// //     });

// //     console.log("Process result:", JSON.stringify(result, null, 2));

// //     if (result.error) {
// //       throw new Error(result.error.message || "MCP Server error");
// //     }

// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Process error:", error);
// //     res.status(500).json({
// //       error: error.message,
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: false,
// //             error: error.message,
// //           }),
// //         },
// //       ],
// //     });
// //   }
// // });

// // app.post("/v1/api/submit", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const result = await client.callTool("submit_interview", req.body);
// //     console.log("Submit result:", JSON.stringify(result, null, 2));

// //     if (result.error) {
// //       throw new Error(result.error.message || "MCP Server error");
// //     }

// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Submit error:", error);
// //     res.status(500).json({
// //       error: error.message,
// //       content: [
// //         {
// //           type: "text",
// //           text: JSON.stringify({
// //             success: false,
// //             error: error.message,
// //           }),
// //         },
// //       ],
// //     });
// //   }
// // });

// // Initialize OpenAI
// // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // // Simple MCP Client
// // class MCPClient {
// //   constructor() {
// //     this.process = null;
// //     this.requestId = 0;
// //     this.pendingRequests = new Map();
// //   }

// //   async connect() {
// //     return new Promise((resolve, reject) => {
// //       this.process = spawn("node", ["./controllers/aiInterview/mcpServer.js"], {
// //         stdio: ["pipe", "pipe", "pipe"],
// //         env: { ...process.env },
// //       });

// //       this.process.on("error", (error) => {
// //         console.error("MCP process error:", error);
// //         reject(error);
// //       });

// //       this.process.stdout.on("data", (data) => {
// //         const rawData = data.toString().trim();
// //         console.log("Raw MCP stdout:", rawData);
// //         try {
// //           const lines = rawData.split("\n").filter((line) => line.trim());
// //           for (const line of lines) {
// //             const response = JSON.parse(line);
// //             console.log("Parsed MCP response:", JSON.stringify(response, null, 2));
// //             if (response.id && this.pendingRequests.has(response.id)) {
// //               const { resolve } = this.pendingRequests.get(response.id);
// //               this.pendingRequests.delete(response.id);
// //               resolve(response);
// //             } else {
// //               console.warn("Unexpected MCP response ID:", response.id);
// //             }
// //           }
// //         } catch (error) {
// //           console.error("Error parsing MCP response:", error.message);
// //         }
// //       });

// //       this.process.stderr.on("data", (data) => {
// //         console.error("MCP Server error:", data.toString());
// //       });

// //       setTimeout(() => resolve(true), 1000);
// //     });
// //   }

// //   async callTool(name, args) {
// //     return new Promise((resolve, reject) => {
// //       const id = ++this.requestId;
// //       const request = {
// //         jsonrpc: "2.0",
// //         id,
// //         method: "tools/call",
// //         params: { name, arguments: args },
// //       };

// //       console.log("Sending MCP request:", JSON.stringify(request, null, 2));
// //       this.pendingRequests.set(id, { resolve, reject });
// //       this.process.stdin.write(`${JSON.stringify(request)}\n`);

// //       setTimeout(() => {
// //         if (this.pendingRequests.has(id)) {
// //           this.pendingRequests.delete(id);
// //           reject(new Error("Request timeout"));
// //         }
// //       }, 15000);
// //     });
// //   }
// // }

// // // Global MCP client
// // let mcpClient = null;

// // async function getMCPClient() {
// //   if (!mcpClient) {
// //     mcpClient = new MCPClient();
// //     await mcpClient.connect();
// //   }
// //   return mcpClient;
// // }

// // // API Routes
// // app.post("/v1/api/initialize", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { jobId, resumeId, interviewSettings } = req.body;
// //     console.log("Initialize request:", { jobId, resumeId, interviewSettings });

// //     const result = await client.callTool("initialize_interview", {
// //       jobId,
// //       resumeId,
// //       interviewSettings, // Pass settings directly
// //     });
// //     console.log("Initialize result:", JSON.stringify(result, null, 2));
// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Initialize error:", error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });

// // app.post("/v1/api/process", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const { sessionId, userMessage, contextState, questionCount } = req.body;
// //     console.log("Process request:", { sessionId, userMessage, questionCount });

// //     const result = await client.callTool("process_response", {
// //       sessionId,
// //       userMessage,
// //       contextState,
// //       questionCount,
// //     });
// //     console.log("Process result:", JSON.stringify(result, null, 2));
// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Process error:", error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });

// // app.post("/v1/api/submit", async (req, res) => {
// //   try {
// //     const client = await getMCPClient();
// //     const result = await client.callTool("submit_interview", req.body);
// //     console.log("Submit result:", JSON.stringify(result, null, 2));
// //     res.json(result.result);
// //   } catch (error) {
// //     console.error("Submit error:", error);
// //     res.status(500).json({ error: error.message });
// //   }
// // });

// const startServer = async () => {
//   try {
//     await connectDB();
//     // const transport = new StdioServerTransport();
//     // await serverMCP.connect(transport);
//     console.log("AI Interview MCP Server running on stdio");
//     await resumePendingWorkflows();
//     console.log("MongoDB connected successfully!");

//     // Set up routes after DB connection
//     app.use("/v1", router);
//     app.use("/v1/notifications", notificationRoutes);
//     app.use("/v1/auth", authRouter);
//     app.use("/v1/api/calendly", calendlyController);
//     app.use("/", paymentRoutes);
//     app.use("/", companyPaymentRoutes);
//     app.use("/", calendlyRoutes);
//     // app.use("/api/jobs", jobRoutes);
//     // app.use("/api/resumes", resumeRoutes);
//     app.use("/v1/api/workflows", workflowRoutes);
//     // API Routes with better error handling
//     app.post("/v1/api/initialize", async (req, res) => {
//       try {
//         const client = await getMCPClient();
//         const { jobId, resumeId, interviewSettings } = req.body;
//         console.log("Initialize request:", {
//           jobId,
//           resumeId,
//           interviewSettings,
//         });

//         const result = await client.callTool("initialize_interview", {
//           jobId,
//           resumeId,
//           interviewSettings,
//         });

//         console.log("Initialize result:", JSON.stringify(result, null, 2));

//         if (result.error) {
//           throw new Error(result.error.message || "MCP Server error");
//         }

//         res.json(result.result);
//       } catch (error) {
//         console.error("Initialize error:", error);
//         res.status(500).json({
//           error: error.message,
//           content: [
//             {
//               type: "text",
//               text: JSON.stringify({
//                 success: false,
//                 error: error.message,
//               }),
//             },
//           ],
//         });
//       }
//     });

//     app.post("/v1/api/process", async (req, res) => {
//       try {
//         const client = await getMCPClient();
//         const { sessionId, userMessage, contextState, questionCount } =
//           req.body;
//         console.log("Process request:", {
//           sessionId,
//           userMessage,
//           questionCount,
//         });

//         const result = await client.callTool("process_response", {
//           sessionId,
//           userMessage,
//           contextState,
//           questionCount,
//         });

//         console.log("Process result:", JSON.stringify(result, null, 2));

//         if (result.error) {
//           throw new Error(result.error.message || "MCP Server error");
//         }

//         res.json(result.result);
//       } catch (error) {
//         console.error("Process error:", error);
//         res.status(500).json({
//           error: error.message,
//           content: [
//             {
//               type: "text",
//               text: JSON.stringify({
//                 success: false,
//                 error: error.message,
//               }),
//             },
//           ],
//         });
//       }
//     });

//     app.post("/v1/api/submit", async (req, res) => {
//       try {
//         const client = await getMCPClient();
//         const result = await client.callTool("submit_interview", req.body);
//         console.log("Submit result:", JSON.stringify(result, null, 2));

//         if (result.error) {
//           throw new Error(result.error.message || "MCP Server error");
//         }

//         res.json(result.result);
//       } catch (error) {
//         console.error("Submit error:", error);
//         res.status(500).json({
//           error: error.message,
//           content: [
//             {
//               type: "text",
//               text: JSON.stringify({
//                 success: false,
//                 error: error.message,
//               }),
//             },
//           ],
//         });
//       }
//     });
//     console.log("Routes are set up.");

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
