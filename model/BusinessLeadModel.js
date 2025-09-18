import mongoose from "mongoose"

const businessLeadSchema = new mongoose.Schema({
  // Lead Information
  personName: { type: String, required: true },
  email: { type: String },
  mobile: { type: String },
  jobTitle: { type: String },
  companyName: { type: String, required: true },
  companySize: { type: String },
  industry: { type: String },
  location: { type: String },
  
  // URLs and Links
  linkedinUrl: { type: String },
  profileUrl: { type: String },
  portfolioUrl: { type: String },
  companyWebsite: { type: String },
  
  // Business Information
  targetIndustry: { type: String },
  businessRule: { type: String }, // Decision maker, influencer, etc.
  companyRevenue: { type: String },
  employeeCount: { type: String },
  technologies: [String],
  painPoints: [String],
  
  // AI Analysis
  aiThoughts: { type: String },
  recommendation: { type: String }, // Hot Lead, Warm Lead, Cold Lead, Not Qualified
  matchScore: { type: Number, default: 0 },
  confidenceLevel: { type: String, default: 'Medium' },
  
  // Outreach
  outreachMessage: { type: String },
  outreachSubject: { type: String },
  bestContactMethod: { type: String }, // email, linkedin, phone
  
  // Metadata
  sourceInfo: {
    platform: { type: String },
    profileUrl: { type: String },
    extractionMethod: { type: String },
    sourcedAt: { type: Date, default: Date.now },
    aiModel: { type: String, default: 'gpt-4o' },
  },
  
  // Business Development Specific
  leadStatus: { type: String, enum: ['new', 'contacted', 'qualified', 'opportunity', 'closed', 'unqualified'], default: 'new' },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  tags: [String],
  notes: { type: String },
  
  // Tracking
  contactedAt: { type: Date },
  lastFollowUp: { type: Date },
  nextFollowUp: { type: Date },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
})

const BusinessLead = mongoose.model("BusinessLead", businessLeadSchema)
export default BusinessLead