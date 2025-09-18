import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema({
  candidateName: {
    type: String,
    required: [true, "Candidate name is required"],
    trim: true,
    maxlength: [100, "Candidate name cannot exceed 100 characters"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JobDescription",
    required: [true, "Job ID is required"],
  },
  jobTitle: {
    type: String,
    required: [true, "Job title is required"],
    trim: true,
    maxlength: [100, "Job title cannot exceed 100 characters"],
  },
  skills: {
    type: [String],
    default: [],
    validate: {
      validator: (skills) => skills.every((skill) => typeof skill === "string" && skill.length <= 50),
      message: "Each skill must be a string and cannot exceed 50 characters",
    },
  },
  experience: {
    type: String,
    trim: true,
    maxlength: [2000, "Experience description cannot exceed 2000 characters"],
  },
  summary: {
    type: String,
    trim: true,
    maxlength: [1000, "Summary cannot exceed 1000 characters"],
  },
  candidateStatus: {
    type: String,
    enum: [
      "AI Sourced",
      "Applied",
      "Screening",
      "Interviewing",
      "Offered",
      "Hired",
      "Rejected",
    ],
    default: "AI Sourced",
  },
  matchingScoreDetails: {
    overallMatch: { type: Number, min: 0, max: 100, default: 0 },
    skillsMatch: { type: Number, min: 0, max: 100, default: 0 },
    experienceMatch: { type: Number, min: 0, max: 100, default: 0 },
    locationMatch: { type: Number, min: 0, max: 100, default: 0 },
    industryMatch: { type: Number, min: 0, max: 100, default: 0 },
  },
  aiSourced: {
    type: Boolean,
    default: true,
  },
  sourceInfo: {
    platform: {
      type: String,
      enum: ["google", "linkedin", "github", "manual"],
      required: [true, "Source platform is required"],
    },
    profileUrl: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+$/, "Please provide a valid URL"],
    },
    sourcedAt: { type: Date, default: Date.now },
    sourcedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    searchQuery: { type: String, trim: true, maxlength: [500, "Search query cannot exceed 500 characters"] },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update `updatedAt` timestamp on save
resumeSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient querying
resumeSchema.index({ jobId: 1, candidateName: 1 });
resumeSchema.index({ email: 1 });
resumeSchema.index({ "sourceInfo.platform": 1, candidateStatus: 1 });

const AI_Resume = mongoose.model("AI_Resume", resumeSchema);

export default AI_Resume;