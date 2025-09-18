import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema({
    candidateName: String,
    forJobTitle: String,
    email: String,
    mobile: Number,
    linkedinLink: { type: String, default: null }, // Optional LinkedIn link field
    matchingScoreDetails: {
      skillsMatch: Number,
      experienceMatch: Number,
      educationMatch: Number,
      overallMatch: Number
    },
    analysis: {
      skills: {
        candidateSkills : [String],
        matched: [String],
        notMatched: [String]
      },
      experience: {
        relevantExperience: String,
        yearsOfExperience: String
      },
      education: {
        highestDegree: String,
        relevantCourses: [String]
      },
      projects: [String],
      recommendation: String,
      comments: String,
      additionalNotes: String
    }
  });


  const ResumeCVs = mongoose.model("Resume_to_CVs", resumeSchema);

  export default ResumeCVs;