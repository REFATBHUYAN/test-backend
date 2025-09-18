import mongoose from "mongoose"

const businessSearchSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  searchName: { type: String, required: true },
  
  // Search Criteria
  targetIndustry: { type: String, required: true },
  targetLocation: { type: String },
  companySize: { type: String },
  jobTitles: [String], // CEO, CTO, Marketing Director, etc.
  technologies: [String],
  keywords: [String],
  excludeKeywords: [String],
  
  // Search Settings
  platforms: [String],
  leadCount: { type: Number, default: 20 },
  searchRadius: { type: String },
  
  // Results
  status: {
    type: String,
    enum: ["pending", "searching", "analyzing", "completed", "failed", "stopped"],
    default: "pending",
  },
  
  leadsFound: { type: Number, default: 0 },
  rawLeads: [{
    personName: String,
    email: String,
    mobile: String,
    jobTitle: String,
    companyName: String,
    companySize: String,
    industry: String,
    location: String,
    linkedinUrl: String,
    profileUrl: String,
    portfolioUrl: String,
    companyWebsite: String,
    sourceInfo: Object,
    foundAt: { type: Date, default: Date.now },
    platformSource: String,
  }],
  
  results: [Object], // Final analyzed leads
  
  // LinkedIn Profiles for extraction
  linkedinProfiles: [{
    profileUrl: String,
    personName: String,
    profileTitle: String,
    companyName: String,
    location: String,
    extractionStatus: {
      type: String,
      enum: ["pending", "processing", "success", "failed", "rate_limited", "blocked", "skipped"],
      default: "pending",
    },
    errorCode: Number,
    lastAttempted: { type: Date, default: Date.now },
    retryCount: { type: Number, default: 0 },
  }],
  
  // Progress Tracking
  searchProgress: {
    currentPhase: {
      type: String,
      enum: ["initializing", "searching", "linkedin_extraction", "ai_analysis", "generating_outreach", "completed"],
      default: "initializing",
    },
    platformsCompleted: { type: Number, default: 0 },
    totalPlatforms: { type: Number, default: 0 },
    rawLeadsFound: { type: Number, default: 0 },
    linkedinProfilesFound: { type: Number, default: 0 },
    linkedinProfilesProcessed: { type: Number, default: 0 },
    leadsAnalyzed: { type: Number, default: 0 },
    finalLeadsSelected: { type: Number, default: 0 },
    isLinkedinExtractionComplete: { type: Boolean, default: false },
    isAiAnalysisComplete: { type: Boolean, default: false },
  },
  
  platformProgress: {
    google: { status: String, leadsFound: Number, completed: Boolean },
    linkedin: { status: String, leadsFound: Number, completed: Boolean },
    crunchbase: { status: String, leadsFound: Number, completed: Boolean },
    apollo: { status: String, leadsFound: Number, completed: Boolean },
    zoominfo: { status: String, leadsFound: Number, completed: Boolean },
  },
  
  // Cost and Analytics
  cost: {
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    apiCalls: { type: Number, default: 0 },
  },
  
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
  stoppedAt: Date,
  stoppedBy: mongoose.Schema.Types.ObjectId,
})

const BusinessSearch = mongoose.model("BusinessSearch", businessSearchSchema)
export default BusinessSearch