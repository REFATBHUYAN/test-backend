import mongoose from "mongoose";

// Define the Resume schema
const candidateSchema = new mongoose.Schema({
  candidateName: String,
  email: String,
  // mobile: Number,
  mobile: mongoose.Schema.Types.Mixed,
  companyName: String,
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: false, // Set to true if every resume must be associated with a company
  },
  resumeLink: String, // New field to store the resume link
  linkedinLink: { type: String, default: null }, // Optional LinkedIn link field
  matchingScoreDetails: {
    skillsMatch: Number,
    experienceMatch: Number,
    educationMatch: Number,
    overallMatch: Number,
  },
  analysis: {
    skills: {
      candidateSkills: [String],
      matched: [String],
      notMatched: [String],
    },
    experience: {
      relevantExperience: String,
      yearsOfExperience: String,
    },
    education: {
      highestDegree: String,
      relevantCourses: [String],
    },
    projects: [String],
    recommendation: String,
    comments: String,
    additionalNotes: String,
  },

  created_at: {
    type: Date,
    default: Date.now,
  },
});

candidateSchema.index({ companyId: 1 }); // 1 for ascending index, -1 for descending index


const Candidate = mongoose.model("Candidate_Summery", candidateSchema);

export default Candidate;
