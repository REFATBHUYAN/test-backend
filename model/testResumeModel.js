import mongoose from "mongoose";

// Define the expectation screening schema
const expectationScreeningSchema = new mongoose.Schema({
  salaryRange: {
    low: { type: String },
    high: { type: String }
  },
  workLocation: {
    type: String,
    enum: ['Remote', 'Hybrid', 'Onsite']
  },
  workType: {
    type: String,
    enum: ['Full Time', 'Contract', 'Part-time']
  },
  hasDrivingLicense: {
    type: String,
    enum: ['Yes', 'No']
  },
  willingToRelocate: {
    type: String,
    enum: ['Yes', 'No']
  },
  others: {
    type: String
  },
  screeningDate: {
    type: Date,
    default: Date.now
  }
});

// Define the question-answer-score schema
const questionAnswerScoreSchema = new mongoose.Schema({
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  qId: { type: String, required: true },
  scores: [{
    question: { type: String, required: true },
    answer: { type: String, required: true },
    score: { type: Number, required: true },
    feedback: { type: String, required: true }
  }],
  averageScore: { type: Number, required: true },
  percentageScore: { type: Number, required: true },
  testDate: {
    type: Date,
    default: Date.now
  }
});

// Define the resume schema
const resumeSchema = new mongoose.Schema({
  candidateName: String,
  jobTitle: String,
  email: String,
  mobile: Number,
  companyName: String,
  matchingScoreDetails: {
    skillsMatch: Number,
    experienceMatch: Number,
    educationMatch: Number,
    overallMatch: Number
  },
  analysis: {
    skills: {
      candidateSkills: [String],
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
  },
  averageScore: { type: Number, default: null }, // Optional field
  selected: { type: Boolean, default: false }, // Added field with default value
  expectationScreening: { 
    type: expectationScreeningSchema, 
    required: false  // Making it optional
  },
  aptitudeTestResult: { 
    type: questionAnswerScoreSchema, 
    required: false  // Making it optional
  },
  hasExpectationScreening: {
    type: Boolean,
    default: false
  },
  hasAptitudeTestResult: {
    type: Boolean,
    default: false
  }
});

// Middleware to automatically set the boolean fields based on the presence of screening and test results
resumeSchema.pre('save', function(next) {
  this.hasExpectationScreening = !!this.expectationScreening;
  this.hasAptitudeTestResult = !!this.aptitudeTestResult;
  next();
});

const Resume = mongoose.model("CV_Summary", resumeSchema);

export default Resume;
