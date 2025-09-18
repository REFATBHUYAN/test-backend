import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema({
  recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
  jobTitle: String,
  platforms: [String],
  searchSettings: Object,
  candidatesFound: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
  cost: {
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    apiCalls: { type: Number, default: 0 },
  },
  results: [
    {
      candidateName: String,
      email: String,
      mobile: mongoose.Schema.Types.Mixed,
      jobTitle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JobDescription",
      },
      skills: [String],
      experience: String,
      summary: String,
      candidateStatus: String,
      matchingScoreDetails: {
        overallMatch: Number,
      },
      aiSourced: Boolean,
      sourceInfo: {
        platform: String,
        profileUrl: String,
        linkedinProfileUrl: String,
        portfolioUrl: String,
        sourcedAt: Date,
        sourcedBy: mongoose.Schema.Types.ObjectId,
        aiModel: String,
        hasEmail: Boolean,
      },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});

const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema);

export default SearchHistory;
