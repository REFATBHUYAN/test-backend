import mongoose from "mongoose";

const agentWorkflowSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JobDescription",
    required: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  recruiterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  candidatesToInterview: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
  },
  candidatesToRecommend: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },
  status: {
    type: String,
    enum: ["Pending", "In Progress", "Completed", "Failed"],
    default: "Pending",
  },
  checkCount: {
    type: Number,
    default: 0,
  },
  interviewSettings: {
    maxQuestions: { type: Number, default: 8 },
    interviewDuration: { type: Number, default: 15 },
    focusAreas: { type: [String], default: ["technical", "experience"] },
    interviewStyle: { type: String, default: "balanced" },
    voiceType: { type: String, default: "professional" },
    customInstructions: { type: String, default: "" },
  },
  results: {
    topCandidates: [
      {
        candidateName: String,
        email: String,
        resumeId: mongoose.Schema.Types.ObjectId,
        combinedScore: Number,
        resumeScore: Number,
        interviewScore: Number,
      },
    ],
    summary: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  interviewDeadline: {
    type: Date,
    required: true,
  },
});

agentWorkflowSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

agentWorkflowSchema.index({ jobId: 1, createdAt: -1 });

export default mongoose.model("AgentWorkflow", agentWorkflowSchema);

// import mongoose from "mongoose";

// const agentWorkflowSchema = new mongoose.Schema({
//   jobId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "JobDescription",
//     required: true,
//   },
//   companyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Company",
//     required: true,
//   },
//   candidatesToInterview: {
//     type: Number,
//     required: true,
//     min: 1,
//     max: 100,
//   },
//   candidatesToRecommend: {
//     type: Number,
//     required: true,
//     min: 1,
//     max: 10,
//   },
//   status: {
//     type: String,
//     enum: ["Pending", "In Progress", "Completed", "Failed"],
//     default: "Pending",
//   },
//   results: {
//     topCandidates: [
//       {
//         candidateName: String,
//         email: String,
//         resumeId: mongoose.Schema.Types.ObjectId,
//         combinedScore: Number,
//         resumeScore: Number,
//         interviewScore: Number,
//       },
//     ],
//     summary: String,
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now,
//   },
//   interviewDeadline: {
//     type: Date,
//     required: true,
//   },
// });

// agentWorkflowSchema.pre("save", function (next) {
//   this.updatedAt = Date.now();
//   next();
// });

// agentWorkflowSchema.index({ jobId: 1, createdAt: -1 });

// export default mongoose.model("AgentWorkflow", agentWorkflowSchema);