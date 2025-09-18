import mongoose from "mongoose"

const businessProspectSchema = new mongoose.Schema({
  // Basic Information
  name: { type: String, required: true },
  email: { type: String, sparse: true },
  phone: { type: String, sparse: true },
  jobTitle: { type: String, required: true },
  company: { type: String, required: true },
  location: { type: String, required: true },

  // Search Criteria Used
  searchCriteria: {
  industry: String,
  targetLocation: String,
  role: String,
  keywords: [String],
  companySize: String,
  experienceLevel: String,
  searchId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessSearchHistory" }, // Link to specific search
  searchVersion: { type: String, default: "1.0" } // Track search algorithm version
},

  // URLs and Social Profiles
  profileUrls: {
  linkedin: String,
  portfolio: String,
  companyWebsite: String,
  personalWebsite: String,
  twitter: String,
  github: String,
  crunchbase: String,        // New
  angelco: String,           // New
  facebook: String,          // New
  instagram: String,         // New
},

  // AI Generated Content
  aiAnalysis: {
  industryExpertise: [String],
  keyStrengths: [String],
  potentialPainPoints: [String],
  businessOpportunities: [String],
  competitorAnalysis: String,
  marketPosition: String,
  decisionMakingAuthority: {
    type: String,
    enum: ["high", "medium", "low", "unknown"],
    default: "unknown",
  },
  // New enhanced fields
  keyMotivators: [String],
  riskFactors: [String],
  budgetLikelihood: {
    type: String,
    enum: ["high", "medium", "low", "unknown"],
    default: "unknown"
  },
  timeToDecision: {
    type: String,
    enum: ["fast", "medium", "slow", "unknown"],
    default: "unknown"
  },
  competitiveThreats: [String],
  businessGrowthStage: {
    type: String,
    enum: ["startup", "growth", "scale", "mature", "unknown"],
    default: "unknown"
  }
},

  // AI Generated Outreach
  outreachContent: {
    personalizedMessage: String,
    emailSubject: String,
    linkedinMessage: String,
    followUpSequence: [String],
    valueProposition: String,
    callToAction: String,
  },

  // AI Recommendations
  recommendations: {
    bestContactMethod: {
      type: String,
      enum: ["email", "linkedin", "phone", "company_website"],
      default: "email",
    },
    optimalContactTime: String,
    approachStrategy: String,
    priorityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    conversionProbability: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
  },

  // Engagement Tracking
  engagement: {
    status: {
      type: String,
      enum: [
        "new",
        "contacted",
        "responded",
        "meeting_scheduled",
        "proposal_sent",
        "closed_won",
        "closed_lost",
        "nurturing",
      ],
      default: "new",
    },
    lastContactDate: Date,
    nextFollowUpDate: Date,
    contactAttempts: { type: Number, default: 0 },
    responseRate: { type: Number, default: 0 },
    notes: [String],
  },

  // Source Information
  sourceInfo: {
  searchEngine: String,
  searchQuery: String,
  sourceUrl: String,
  extractedAt: { type: Date, default: Date.now },
  dataQuality: {
    type: String,
    enum: ["high", "medium", "low"],
    default: "medium",
  },
  searchId: { type: mongoose.Schema.Types.ObjectId, ref: "BusinessSearchHistory" }, // Link to specific search
  sourceType: {
    type: String,
    enum: ["linkedin", "company_website", "directory", "news", "social", "other"],
    default: "other"
  },
  contactInfoSources: {
    emailSource: String,     // Where email was found
    phoneSource: String,     // Where phone was found
    socialSource: String     // Where social links were found
  },
  dataConfidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  }
},

  // Business Development Specific
  businessContext: {
  companyRevenue: String,
  companySize: String,
  industry: String,
  businessModel: String,
  techStack: [String],
  currentChallenges: [String],
  growthStage: {
    type: String,
    enum: ["startup", "growth", "mature", "enterprise"],
    default: "growth",
  },
  // New enhanced fields
  fundingStage: String,      // "Pre-seed", "Seed", "Series A", etc.
  lastFundingAmount: String,
  investors: [String],
  competitorAnalysis: String,
  marketTrends: [String],
  painPointSeverity: {
    type: String,
    enum: ["critical", "high", "medium", "low"],
    default: "medium"
  }
},

  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  tags: [String],
  isActive: { type: Boolean, default: true },
})

// Indexes for better performance
businessProspectSchema.index({ email: 1 })
businessProspectSchema.index({ company: 1 })
businessProspectSchema.index({ "searchCriteria.industry": 1 })
businessProspectSchema.index({ "recommendations.priorityScore": -1 })
businessProspectSchema.index({ "engagement.status": 1 })
businessProspectSchema.index({ createdBy: 1, createdAt: -1 })
businessProspectSchema.index({ "sourceInfo.searchId": 1 });
businessProspectSchema.index({ "sourceInfo.dataQuality": 1 });
businessProspectSchema.index({ "aiAnalysis.budgetLikelihood": 1 });
businessProspectSchema.index({ "businessContext.fundingStage": 1 });
businessProspectSchema.index({ phone: 1 }, { sparse: true });
businessProspectSchema.index({ "profileUrls.linkedin": 1 }, { sparse: true });

const BusinessProspect = mongoose.model("BusinessProspect", businessProspectSchema)
export default BusinessProspect

// import mongoose from "mongoose"

// const businessProspectSchema = new mongoose.Schema({
//   // Basic Information
//   name: { type: String, required: true },
//   email: { type: String, sparse: true },
//   phone: { type: String, sparse: true },
//   jobTitle: { type: String, required: true },
//   company: { type: String, required: true },
//   location: { type: String, required: true },

//   // Search Criteria Used
//   searchCriteria: {
//     industry: String,
//     targetLocation: String,
//     role: String,
//     keywords: [String],
//     companySize: String,
//     experienceLevel: String,
//   },

//   // URLs and Social Profiles
//   profileUrls: {
//     linkedin: String,
//     portfolio: String,
//     companyWebsite: String,
//     personalWebsite: String,
//     twitter: String,
//     github: String,
//   },

//   // AI Generated Content
//   aiAnalysis: {
//     industryExpertise: [String],
//     keyStrengths: [String],
//     potentialPainPoints: [String],
//     businessOpportunities: [String],
//     competitorAnalysis: String,
//     marketPosition: String,
//     decisionMakingAuthority: {
//       type: String,
//       enum: ["high", "medium", "low", "unknown"],
//       default: "unknown",
//     },
//   },

//   // AI Generated Outreach
//   outreachContent: {
//     personalizedMessage: String,
//     emailSubject: String,
//     linkedinMessage: String,
//     followUpSequence: [String],
//     valueProposition: String,
//     callToAction: String,
//   },

//   // AI Recommendations
//   recommendations: {
//     bestContactMethod: {
//       type: String,
//       enum: ["email", "linkedin", "phone", "company_website"],
//       default: "email",
//     },
//     optimalContactTime: String,
//     approachStrategy: String,
//     priorityScore: {
//       type: Number,
//       min: 0,
//       max: 100,
//       default: 50,
//     },
//     conversionProbability: {
//       type: Number,
//       min: 0,
//       max: 100,
//       default: 50,
//     },
//   },

//   // Engagement Tracking
//   engagement: {
//     status: {
//       type: String,
//       enum: [
//         "new",
//         "contacted",
//         "responded",
//         "meeting_scheduled",
//         "proposal_sent",
//         "closed_won",
//         "closed_lost",
//         "nurturing",
//       ],
//       default: "new",
//     },
//     lastContactDate: Date,
//     nextFollowUpDate: Date,
//     contactAttempts: { type: Number, default: 0 },
//     responseRate: { type: Number, default: 0 },
//     notes: [String],
//   },

//   // Source Information
//   sourceInfo: {
//     searchEngine: String,
//     searchQuery: String,
//     sourceUrl: String,
//     extractedAt: { type: Date, default: Date.now },
//     dataQuality: {
//       type: String,
//       enum: ["high", "medium", "low"],
//       default: "medium",
//     },
//   },

//   // Business Development Specific
//   businessContext: {
//     companyRevenue: String,
//     companySize: String,
//     industry: String,
//     businessModel: String,
//     techStack: [String],
//     currentChallenges: [String],
//     growthStage: {
//       type: String,
//       enum: ["startup", "growth", "mature", "enterprise"],
//       default: "growth",
//     },
//   },

//   // Metadata
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now },
//   tags: [String],
//   isActive: { type: Boolean, default: true },
// })

// // Indexes for better performance
// businessProspectSchema.index({ email: 1 })
// businessProspectSchema.index({ company: 1 })
// businessProspectSchema.index({ "searchCriteria.industry": 1 })
// businessProspectSchema.index({ "recommendations.priorityScore": -1 })
// businessProspectSchema.index({ "engagement.status": 1 })
// businessProspectSchema.index({ createdBy: 1, createdAt: -1 })

// const BusinessProspect = mongoose.model("BusinessProspect", businessProspectSchema)
// export default BusinessProspect
