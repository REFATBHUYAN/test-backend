import mongoose from "mongoose"

const businessSearchHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // Search Parameters
  searchParams: {
  industry: { type: String, required: true },
  location: { type: String, required: true },
  role: { type: String, required: true },
  keywords: [String],
  companySize: String,
  experienceLevel: String,
  maxResults: { type: Number, default: 50 },
  // New enhanced fields
  enhancedSearch: { type: Boolean, default: false },
  searchVersion: { type: String, default: "1.0" },
  targetCompanies: [String],  // Specific companies to target
  excludeCompanies: [String], // Companies to exclude
  minBudget: String,          // Minimum budget requirement
  urgencyLevel: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium"
  }
},

  // Search Results Summary
  results: {
  totalFound: { type: Number, default: 0 },
  totalProcessed: { type: Number, default: 0 },
  highPriorityProspects: { type: Number, default: 0 },
  mediumPriorityProspects: { type: Number, default: 0 },
  lowPriorityProspects: { type: Number, default: 0 },
  // New enhanced fields
  contactInfoQuality: {
    withEmail: { type: Number, default: 0 },
    withPhone: { type: Number, default: 0 },
    withLinkedIn: { type: Number, default: 0 },
    highQualityData: { type: Number, default: 0 }
  },
  sourceBreakdown: {
    linkedin: { type: Number, default: 0 },
    companyWebsites: { type: Number, default: 0 },
    directories: { type: Number, default: 0 },
    news: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  averagePriorityScore: { type: Number, default: 0 },
  topIndustries: [String],
  topCompanies: [String]
},

  // Search Status
  status: {
    type: String,
    enum: ["pending", "searching", "analyzing", "generating_outreach", "completed", "failed", "stopped"],
    default: "pending",
  },

  // Progress Tracking
  progress: {
    currentPhase: String,
    percentage: { type: Number, default: 0 },
    currentItem: String,
    itemsProcessed: { type: Number, default: 0 },
    totalItems: { type: Number, default: 0 },
  },

  // AI Processing Stats
  aiStats: {
  tokensUsed: { type: Number, default: 0 },
  apiCalls: { type: Number, default: 0 },
  processingTime: { type: Number, default: 0 },
  averageAnalysisTime: { type: Number, default: 0 },
  // New enhanced fields
  openaiCosts: { type: Number, default: 0 },
  googleSearchCosts: { type: Number, default: 0 },
  successfulExtractions: { type: Number, default: 0 },
  failedExtractions: { type: Number, default: 0 },
  averageDataQuality: { type: Number, default: 0 }
},

  // Cost Tracking
  cost: {
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
  },
  performance: {
  searchDuration: { type: Number, default: 0 }, // in seconds
  extractionSuccessRate: { type: Number, default: 0 }, // percentage
  aiAnalysisSuccessRate: { type: Number, default: 0 }, // percentage
  overallQualityScore: { type: Number, default: 0 }, // 0-100
  userSatisfactionScore: { type: Number, default: 0 } // if user provides feedback
},

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
  stoppedAt: Date,

  // Error Handling
  errors: [String],
  warnings: [String],
})

const BusinessSearchHistory = mongoose.model("BusinessSearchHistory", businessSearchHistorySchema)
export default BusinessSearchHistory

// import mongoose from "mongoose"

// const businessSearchHistorySchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

//   // Search Parameters
//   searchParams: {
//     industry: { type: String, required: true },
//     location: { type: String, required: true },
//     role: { type: String, required: true },
//     keywords: [String],
//     companySize: String,
//     experienceLevel: String,
//     maxResults: { type: Number, default: 50 },
//   },

//   // Search Results Summary
//   results: {
//     totalFound: { type: Number, default: 0 },
//     totalProcessed: { type: Number, default: 0 },
//     highPriorityProspects: { type: Number, default: 0 },
//     mediumPriorityProspects: { type: Number, default: 0 },
//     lowPriorityProspects: { type: Number, default: 0 },
//   },

//   // Search Status
//   status: {
//     type: String,
//     enum: ["pending", "searching", "analyzing", "generating_outreach", "completed", "failed", "stopped"],
//     default: "pending",
//   },

//   // Progress Tracking
//   progress: {
//     currentPhase: String,
//     percentage: { type: Number, default: 0 },
//     currentItem: String,
//     itemsProcessed: { type: Number, default: 0 },
//     totalItems: { type: Number, default: 0 },
//   },

//   // AI Processing Stats
//   aiStats: {
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//     processingTime: { type: Number, default: 0 }, // in seconds
//     averageAnalysisTime: { type: Number, default: 0 },
//   },

//   // Cost Tracking
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//   },

//   // Timestamps
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
//   stoppedAt: Date,

//   // Error Handling
//   errors: [String],
//   warnings: [String],
// })

// const BusinessSearchHistory = mongoose.model("BusinessSearchHistory", businessSearchHistorySchema)
// export default BusinessSearchHistory
