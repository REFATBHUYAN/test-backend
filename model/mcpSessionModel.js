// import mongoose from "mongoose"

// const mcpSessionSchema = new mongoose.Schema({
//   sessionId: {
//     type: String,
//     required: true,
//     unique: true,
//     index: true,
//   },
//   jobId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "JobDescription",
//     required: true,
//   },
//   resumeId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Resume",
//     required: true,
//   },
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true,
//   },
//   contextState: {
//     type: mongoose.Schema.Types.Mixed,
//     required: true,
//     default: {},
//   },
//   transcript: [
//     {
//       role: {
//         type: String,
//         enum: ["user", "assistant"],
//         required: true,
//       },
//       content: {
//         type: String,
//         required: true,
//       },
//       timestamp: {
//         type: Date,
//         default: Date.now,
//       },
//       sentiment: {
//         type: String,
//         default: "neutral",
//       },
//       transcription: {
//         type: String,
//       },
//       technical_question: {
//         type: Boolean,
//         default: false,
//       },
//       question_metadata: {
//         type: mongoose.Schema.Types.Mixed,
//       },
//     },
//   ],
//   status: {
//     type: String,
//     enum: ["active", "completed", "terminated"],
//     default: "active",
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
//   completedAt: {
//     type: Date,
//   },
//   lastActivity: {
//     type: Date,
//     default: Date.now,
//   },
// })

// // Update lastActivity on save
// mcpSessionSchema.pre("save", function (next) {
//   this.lastActivity = new Date()
//   next()
// })

// // Index for performance
// mcpSessionSchema.index({ sessionId: 1 })
// mcpSessionSchema.index({ userId: 1 })
// mcpSessionSchema.index({ createdAt: -1 })

// const MCPSession = mongoose.model("MCPSession", mcpSessionSchema)

// export default MCPSession


import mongoose from "mongoose"

const mcpSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobDescription",
      required: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
    },
    contextState: {
      type: Object,
      required: true,
    },
    messages: [
      {
        role: {
          type: String,
          enum: ["system", "user", "assistant"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isCompleted: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

const MCPSession = mongoose.model("MCPSession", mcpSessionSchema)

export default MCPSession
