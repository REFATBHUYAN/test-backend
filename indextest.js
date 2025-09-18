import express from "express"
import router from "./routes/match.js"
import authRouter from "./routes/auth.js"
import notificationRoutes from "./routes/notificationRoutes.js"
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
// import mcpController from "./controllers/mcpController.js"
import { OpenAI } from "openai"
import { spawn } from "child_process"
// const { spawn } = require("child_process")

dotenv.config()

const app = express()

const server = http.createServer(app)
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

app.use(logger("dev"))
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ limit: "50mb", extended: true }))
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://bloomix2.netlify.app",
      "https://bloomix.netlify.app",
      "https://bloomix3.netlify.app",
      "*",
      "chrome-extension://igfekpkjkmfhkaeflnjpmafjmjgekdgd",
    ],
    credentials: true,
  }),
)
app.use(cookieParser())
app.use(bodyParser.json({ limit: "2mb" }))

io.on("connect", (socket) => {
  console.log("A user connected")
  socket.on("disconnect", () => {
    console.log("A user disconnected")
  })
})

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })


// Simple MCP Client
class MCPClient {
  constructor() {
    this.process = null
    this.requestId = 0
    this.pendingRequests = new Map()
  }

  async connect() {
    return new Promise((resolve, reject) => {
      // Adjust this path to your MCP server file "./controllers/aiInterview/mcpServer.js"
      this.process = spawn("node", ["./controllers/aiInterview/mcpServer.js"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      })

      this.process.on("error", reject)

      this.process.stdout.on("data", (data) => {
        try {
          const lines = data
            .toString()
            .split("\n")
            .filter((line) => line.trim())
          for (const line of lines) {
            const response = JSON.parse(line)
            if (response.id && this.pendingRequests.has(response.id)) {
              const { resolve: resolveRequest } = this.pendingRequests.get(response.id)
              this.pendingRequests.delete(response.id)
              resolveRequest(response)
            }
          }
        } catch (error) {
          console.error("Error parsing MCP response:", error)
        }
      })

      this.process.stderr.on("data", (data) => {
        console.error("MCP Server stderr:", data.toString())
      })
      

      setTimeout(() => resolve(true), 1000)
    })
  }

  async callTool(name, args) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId
      const request = {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }

      this.pendingRequests.set(id, { resolve, reject })
      this.process.stdin.write(JSON.stringify(request) + "\n")

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error("Request timeout"))
        }
      }, 30000)
    })
  }
}

// Global MCP client
let mcpClient = null

async function getMCPClient() {
  if (!mcpClient) {
    mcpClient = new MCPClient()
    await mcpClient.connect()
  }
  return mcpClient
}

// API Routes
// app.post("/v1/api/initialize", async (req, res) => {
//   try {
//     const client = await getMCPClient()
//     const { jobId, resumeId } = req.body
//     const result = await client.callTool("initialize_interview", { jobId, resumeId })
//     res.json(result)
//   } catch (error) {
//     console.error("Initialize error:", error)
//     res.status(500).json({ error: error.message })
//   }
// })

app.post("/v1/api/initialize", async (req, res) => {
  try {
    const client = await getMCPClient()
    const { jobId, resumeId, maxQuestions, interviewDuration, interviewStyle, voiceType, focusAreas, email, userId } =
      req.body

      console.log("initialize", jobId, resumeId, maxQuestions, interviewDuration, interviewStyle, voiceType, focusAreas, email, userId)

    const result = await client.callTool("initialize_interview", {
      jobId,
      resumeId,
      interviewSettings: {
        maxQuestions: maxQuestions || 8,
        interviewDuration: interviewDuration || 15,
        interviewStyle: interviewStyle || "balanced",
        voiceType: voiceType || "professional",
        focusAreas: focusAreas || [],
        email,
        userId,
      },
    })
    res.json(result)
  } catch (error) {
    console.error("Initialize error:", error)
    res.status(500).json({ error: error.message })
  }
})


app.post("/v1/api/process", async (req, res) => {
  try {
    const client = await getMCPClient()
    const { sessionId, userMessage, contextState, questionCount, interviewSettings } = req.body
    console.log("process data", sessionId, userMessage, contextState, questionCount, interviewSettings)

    const result = await client.callTool("process_response", {
      sessionId,
      userMessage,
      contextState,
      questionCount,
      interviewSettings,
    })
    res.json(result)
  } catch (error) {
    console.error("Process error:", error)
    res.status(500).json({ error: error.message })
  }
})

// app.post("/v1/api/process", async (req, res) => {
//   try {
//     const client = await getMCPClient()
//     const { sessionId, userMessage, contextState, questionCount } = req.body
//     const result = await client.callTool("process_response", {
//       sessionId,
//       userMessage,
//       contextState,
//       questionCount,
//     })
//     res.json(result)
//   } catch (error) {
//     console.error("Process error:", error)
//     res.status(500).json({ error: error.message })
//   }
// })

app.post("/v1/api/submit", async (req, res) => {
  try {
    const client = await getMCPClient()
    const result = await client.callTool("submit_interview", req.body)
    res.json(result)
  } catch (error) {
    console.error("Submit error:", error)
    res.status(500).json({ error: error.message })
  }
})


// MCP Interview Routes
// app.post("/initializeMCPInterview", mcpController.initializeMCPInterview)
// app.post("/mcpInterviewResponse", mcpController.mcpInterviewResponse)
// app.post("/submitMCPInterview", mcpController.submitMCPInterview)
// app.post("/sendVoiceInterviewLink", mcpController.sendVoiceInterviewLink)

const startServer = async () => {
  try {
    await connectDB()
    console.log("MongoDB connected successfully!")

    // Set up routes after DB connection
    app.use("/v1", router)
    app.use("/v1/notifications", notificationRoutes)
    app.use("/v1/auth", authRouter)
    app.use("/v1/api/calendly", calendlyController)
    app.use("/", paymentRoutes)
    app.use("/", companyPaymentRoutes)
    app.use("/", calendlyRoutes)
    console.log("Routes are set up.")

    app.get("/", (req, res) => {
      res.send("Hello to Everyone from Bloomix!")
    })

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
// // import { sendChatLink } from "./controllers/sendChatLink.js";
// dotenv.config();

// const app = express();

// const server = http.createServer(app);
// export const io = new Server(server, {
//   cors: {
//     origin: "*", // Allow CORS from any origin (Adjust as needed)
//     methods: ["GET", "POST"],
//   },
// });
// // app.use("v1/api/webhook", express.raw({ type: "application/json" }))
// // export const io = new Server(server);

// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(logger("dev"));
// app.use(express.json({ limit: "50mb" }));
// app.use(express.urlencoded({ limit: "50mb", extended: true }));
// // app.use(cors());
// // app.use(cors({
// //   origin: '*',
// //   credentials: true
// // }));
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
// // app.use(cors({ origin: '*' }))

// app.use(cookieParser());
// app.use(bodyParser.json({ limit: "2mb" }));

// io.on("connect", (socket) => {
//   console.log("A  user connected");
//   socket.on("disconnect", () => {
//     console.log("A user disconnected");
//   });
// });

// const PORT = process.env.PORT || 6000;

// // app.use("/", router);
// // app.use("/auth", authRouter);

// // const PORT = process.env.PORT || 5000;

// // connectDB()
// //   .then(() => {
// //     app.listen(PORT, () => {
// //       console.log(`Server is running at port : ${process.env.PORT}`);
// //     });
// //   })
// //   .catch((err) => {
// //     console.log("MONGO db connection failed !!! ", err);
// //   });

// app.get("/", (req, res) => {
//   res.send("Hello to Everyone from Bloomix!");
// });

// // console.log(process.memoryUsage());

// // Set up routes
// // app.use("/v1", router);
// // app.use("/v1/auth", authRouter);
// // app.post("/v1/sendChatLink", sendChatLink);

// // app.listen(PORT, async () => {
// //   console.log(`Server is running at port: ${PORT}`);
// //   try {
// //     await connectDB();
// //     console.log("MongoDB connected successfully!");
// //     app.use("/v1", router);
// //     app.use("/v1/auth", authRouter);
// //     console.log("Routes are set up.");
// //   } catch (err) {
// //     console.log("MongoDB connection failed: ", err);
// //   }
// // });

// // new code

// const startServer = async () => {
//   try {
//     await connectDB();
//     console.log("MongoDB connected successfully!");

//     // Set up routes only after successful DB connection
//     app.use("/v1", router);
//     app.use("/v1/notifications", notificationRoutes);
//     app.use("/v1/auth", authRouter);
//     app.use("/v1/api/calendly", calendlyController);
//     // Special handling for Stripe webhooks
//     // app.use((req, res, next) => {
//     //   if (req.originalUrl === "/v1/api") {
//     //     let data = "";
//     //     req.setEncoding("utf8");
//     //     req.on("data", (chunk) => {
//     //       data += chunk;
//     //     });
//     //     req.on("end", () => {
//     //       req.rawBody = data;
//     //       next();
//     //     });
//     //   } else {
//     //     express.json()(req, res, next);
//     //   }
//     // });

//     // Routes
//     // app.use("/v1/api", paymentRoutes);
//     app.use("/", paymentRoutes);
//     app.use("/", companyPaymentRoutes);
//     app.use("/", calendlyRoutes);
//     // app.use("/v1/api", paymentRoutes);
//     console.log("Routes are set up.");

//     server.listen(PORT, () => {
//       console.log(`Server is running at port: ${PORT}`);
//     });

//     // app.listen(PORT, () => {
//     //   console.log(`Server is running at port: ${PORT}`);
//     // });
//   } catch (err) {
//     console.log("MongoDB connection failed: ", err);
//     // Optionally: Implement a retry mechanism here
//   }
// };

// startServer();
