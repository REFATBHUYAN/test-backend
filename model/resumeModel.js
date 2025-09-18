import mongoose from "mongoose";

const assessmentScoreSchema = new mongoose.Schema({
  criteria: { type: String, required: false },
  score: { type: Number, required: false },
});

const assessmentSchema = new mongoose.Schema({
  resumeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Resume",
    required: true,
  },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  criteriaScores: [assessmentScoreSchema],
  comment: { type: String, required: true },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

const noteSchema = new mongoose.Schema({
  noteText: { type: String, required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const voiceInterviewInteractionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  candidateResponse: { type: String, required: true },
  feedback: { type: String, required: false },
  timestamp: { type: Date, default: Date.now },
  sentiment: { type: String, default: "neutral" }, // Stores sentiment for each interaction (e.g., "positive", "neutral", "negative")
  technical_question: { type: Boolean, default: false }, // Indicates if the question is technical
  question_metadata: {
    question_text: { type: String },
    code_snippet: { type: String },
    language: { type: String },
    difficulty: { type: String },
    question_type: { type: String },
    expected_topics: [{ type: String }],
    follow_up_questions: [{ type: String }],
    spoken_text: { type: String },
    display_text: { type: String },
  }, // Stores code snippet and metadata
});

const voiceInterviewResultSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sessionId: { type: String, required: true },
  score: { type: Number, required: false },
  tabSwitchCount: { type: Number, required: false },
  isDisqualified: { type: Boolean, required: false },
  recommendation: { type: String, required: false },
  submissionReason: { type: String, required: false },
  evaluation: { type: mongoose.Schema.Types.Mixed, required: false }, // Flexible to store evaluation object
  interactions: [voiceInterviewInteractionSchema],

  sentimentResults: [
    {
      questionNumber: { type: Number, required: false },
      sentiment: { type: String, required: false }, // e.g., "positive", "neutral", "negative"
      transcription: { type: String, required: false }, // Transcribed text from video
      videoLabels: [{ type: String }], // Video analysis labels (empty in current implementation)
      timestamp: { type: Date, default: Date.now },
    },
  ], // Added to store detailed sentiment analysis results
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, required: false }, // Added to track interview completion
});



const expectationsSchema = new mongoose.Schema({
  salaryRange: {
    low: Number,
    high: Number,
  },
  workLocation: { type: String },
  workType: { type: String },
  hasDrivingLicense: { type: Boolean, default: false },
  willingToRelocate: { type: Boolean, default: false },
  expectationQuestions: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  candidateQuestionResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  rawAnswers: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  questionMetadata: [
    {
      questionIndex: Number,
      questionText: String,
      questionType: {
        type: String,
        enum: ["text", "option", "custom"],
        default: "text",
      },
      options: [String],
      selectedOption: String,
      answerValue: mongoose.Schema.Types.Mixed,
    },
  ],
  candidateResponse: {
    salaryRangeResponse: { type: Boolean },
    workLocation: { type: Boolean },
    workType: { type: Boolean },
    hasDrivingLicense: { type: Boolean },
    willingToRelocate: { type: Boolean },
    others: String,
    created_at: { type: Date, default: Date.now },
  },
  created_at: { type: Date, default: Date.now },
});

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: false },
    name: { type: String, required: false },
    type: { type: String, required: false },
    originalname: String,
    public_id: String,
    format: String,
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    questions: { type: [String], default: [] },
    answers: { type: [String], default: [] },
    attachments: { type: [[attachmentSchema]], default: [] },
    answerAttachments: { type: [[attachmentSchema]], default: [] },
    date: { type: Date, default: Date.now },
  },
  { _id: false }
);

const customQuestionResultsSchema = new mongoose.Schema({
  questions: [mongoose.Schema.Types.Mixed], // Original questions
  answers: [mongoose.Schema.Types.Mixed], // Raw answers
  answerMetadata: [
    {
      questionIndex: Number,
      questionText: String,
      questionType: {
        type: String,
        enum: ["text", "option", "custom"],
        default: "text",
      },
      candidateAnswer: mongoose.Schema.Types.Mixed,
      selectedOption: mongoose.Schema.Types.Mixed,
      options: [String],
      aiScore: { type: Number, min: 0, max: 10 }, // Score out of 10 to match LangChain evaluation
      aiAnalysis: String,
    },
  ],
  aiEvaluation: {
    individualScores: [
      {
        questionIndex: Number,
        questionText: String,
        answerText: String,
        questionType: String,
        score: { type: Number, min: 0, max: 10 },
        feedback: String,
      },
    ],
    overallScore: { type: Number, min: 0, max: 10 },
    averageScore: { type: Number, min: 0, max: 10 },
    percentageScore: { type: Number, min: 0, max: 100 },
    recommendation: {
      type: String,
      enum: [
        "Highly Recommended",
        "Recommended",
        "Consider",
        "Not Recommended",
      ],
    },
    overallFeedback: String,
    evaluatedAt: { type: Date, default: Date.now },
  },
  disqualifyingAnswers: [
    {
      questionIndex: Number,
      questionText: String,
      answer: mongoose.Schema.Types.Mixed,
      reason: String,
    },
  ],
  isDisqualified: { type: Boolean, default: false },
  completedAt: { type: Date, default: Date.now },
});

// New schema for job-specific question results
const jobSpecificQuestionResultSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  qId: { type: String, required: true },
  questions: [{ type: String, required: true }], // Array of question strings
  answers: [{ type: String, required: true }], // Array of answer strings
  scores: [
    {
      question: { type: String, required: true },
      answer: { type: String, required: true },
      score: { type: Number, required: true, min: 0, max: 10 },
      feedback: { type: String, required: true },
    },
  ],
  testTypes: [{ type: String }], // Array of test types (psychometric, jobSpecific, etc.)
  averageScore: { type: Number, required: true, min: 0, max: 10 },
  percentageScore: { type: Number, required: true, min: 0, max: 100 },
  numberOfQuestions: { type: Number, required: true },
  tailorToExperience: { type: Boolean, default: false },
  aiEvaluation: {
    individualScores: [
      {
        questionIndex: Number,
        questionText: String,
        answerText: String,
        score: { type: Number, min: 0, max: 10 },
        feedback: String,
      },
    ],
    overallScore: { type: Number, min: 0, max: 10 },
    averageScore: { type: Number, min: 0, max: 10 },
    percentageScore: { type: Number, min: 0, max: 100 },
    recommendation: {
      type: String,
      enum: [
        "Highly Recommended",
        "Recommended",
        "Consider",
        "Not Recommended",
      ],
    },
    overallFeedback: String,
    evaluatedAt: { type: Date, default: Date.now },
  },
  completedAt: { type: Date, default: Date.now },
});

const resumeSchema = new mongoose.Schema({
  candidateName: String,
  jobTitle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JobDescription",
  },
  email: String,
  mobile: mongoose.Schema.Types.Mixed,
  // mobile: String || Number,
  companyName: String,
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: false,
  },
  resumeLink: String,
  containerId: { type: String, default: null },
  linkedinLink: { type: String, default: null },
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
  averageScore: { type: Number, default: null },
  selected: { type: Boolean, default: false },
  candidateStatus: {
    type: String,
    default: "Screened",
  },
  jobStatus: {
    type: [String],
    default: ["Screened"],
  },
  expectations: expectationsSchema,
  customQuestionResults: customQuestionResultsSchema,
  // New field for job-specific question results
  jobSpecificQuestionResults: [jobSpecificQuestionResultSchema],
  voiceInterviewResults: [voiceInterviewResultSchema],
  assessmentScore: assessmentSchema,
  chat: chatSchema,
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
  created_at: {
    type: Date,
    default: Date.now,
  },
  notes: [noteSchema],
});

resumeSchema.index({ companyId: 1 });

resumeSchema.pre("save", function (next) {
  if (this.isModified("candidateStatus")) {
    if (!this.jobStatus.includes(this.candidateStatus)) {
      this.jobStatus.push(this.candidateStatus);
    }
  }

  if (this.isModified("chat.questions") || this.isModified("chat.answers")) {
    this.chat.date = Date.now();
  }
  next();
});

const Resume = mongoose.model("CV_Summary", resumeSchema);

export default Resume;

// import mongoose from "mongoose";

// const assessmentScoreSchema = new mongoose.Schema({
//   criteria: { type: String, required: false },
//   score: { type: Number, required: false },
// });

// const assessmentSchema = new mongoose.Schema({
//   resumeId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Resume",
//     required: true,
//   },
//   jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   criteriaScores: [assessmentScoreSchema],
//   comment: { type: String, required: true },
//   created_at: {
//     type: Date,
//     default: Date.now,
//   },
// });

// const noteSchema = new mongoose.Schema({
//   noteText: { type: String, required: true },
//   userName: { type: String, required: true },
//   userEmail: { type: String, required: true },
//   createdAt: { type: Date, default: Date.now },
// });

// const voiceInterviewInteractionSchema = new mongoose.Schema({
//   question: { type: String, required: true },
//   candidateResponse: { type: String, required: true },
//   feedback: { type: String, required: false },
//   timestamp: { type: Date, default: Date.now },
// });

// const voiceInterviewResultSchema = new mongoose.Schema({
//   jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   sessionId: { type: String, required: true },
//   score: { type: Number, required: false },
//   recommendation: { type: String, required: false },
//   evaluation: { type: String, required: false },
//   interactions: [voiceInterviewInteractionSchema],
//   createdAt: { type: Date, default: Date.now },
// });

// const expectationsSchema = new mongoose.Schema({
//   salaryRange: {
//     low: Number,
//     high: Number,
//   },
//   workLocation: { type: String },
//   workType: { type: String },
//   hasDrivingLicense: { type: Boolean, default: false },
//   willingToRelocate: { type: Boolean, default: false },
//   expectationQuestions: {
//     type: [mongoose.Schema.Types.Mixed],
//     default: [],
//   },
//   candidateQuestionResponse: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {},
//   },
//   rawAnswers: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {},
//   },
//   questionMetadata: [
//     {
//       questionIndex: Number,
//       questionText: String,
//       questionType: {
//         type: String,
//         enum: ["text", "option", "custom"],
//         default: "text",
//       },
//       options: [String],
//       selectedOption: String,
//       answerValue: mongoose.Schema.Types.Mixed,
//     },
//   ],
//   candidateResponse: {
//     salaryRangeResponse: { type: Boolean },
//     workLocation: { type: Boolean },
//     workType: { type: Boolean },
//     hasDrivingLicense: { type: Boolean },
//     willingToRelocate: { type: Boolean },
//     others: String,
//     created_at: { type: Date, default: Date.now },
//   },
//   created_at: { type: Date, default: Date.now },
// });

// const attachmentSchema = new mongoose.Schema(
//   {
//     url: { type: String, required: false },
//     name: { type: String, required: false },
//     type: { type: String, required: false },
//     originalname: String,
//     public_id: String,
//     format: String,
//   },
//   { _id: false }
// );

// const chatSchema = new mongoose.Schema(
//   {
//     questions: { type: [String], default: [] },
//     answers: { type: [String], default: [] },
//     attachments: { type: [[attachmentSchema]], default: [] },
//     answerAttachments: { type: [[attachmentSchema]], default: [] },
//     date: { type: Date, default: Date.now },
//   },
//   { _id: false }
// );

// const customQuestionResultsSchema = new mongoose.Schema({
//   questions: [mongoose.Schema.Types.Mixed], // Original questions
//   answers: [mongoose.Schema.Types.Mixed], // Raw answers
//   answerMetadata: [
//     {
//       questionIndex: Number,
//       questionText: String,
//       questionType: {
//         type: String,
//         enum: ["text", "option", "custom"],
//         default: "text",
//       },
//       candidateAnswer: mongoose.Schema.Types.Mixed,
//       selectedOption: mongoose.Schema.Types.Mixed,
//       options: [String],
//       aiScore: { type: Number, min: 0, max: 10 }, // Score out of 10 to match LangChain evaluation
//       aiAnalysis: String,
//     },
//   ],
//   aiEvaluation: {
//     individualScores: [
//       {
//         questionIndex: Number,
//         questionText: String,
//         answerText: String,
//         questionType: String,
//         score: { type: Number, min: 0, max: 10 },
//         feedback: String,
//       },
//     ],
//     overallScore: { type: Number, min: 0, max: 10 },
//     averageScore: { type: Number, min: 0, max: 10 },
//     percentageScore: { type: Number, min: 0, max: 100 },
//     recommendation: {
//       type: String,
//       enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//     },
//     overallFeedback: String,
//     evaluatedAt: { type: Date, default: Date.now },
//   },
//   disqualifyingAnswers: [
//     {
//       questionIndex: Number,
//       questionText: String,
//       answer: mongoose.Schema.Types.Mixed,
//       reason: String,
//     },
//   ],
//   isDisqualified: { type: Boolean, default: false },
//   completedAt: { type: Date, default: Date.now },
// })

// const resumeSchema = new mongoose.Schema({
//   candidateName: String,
//   jobTitle: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "JobDescription",
//   },
//   email: String,
//   mobile: Number,
//   companyName: String,
//   companyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Company",
//     required: false,
//   },
//   resumeLink: String,
//   containerId: { type: String, default: null },
//   linkedinLink: { type: String, default: null },
//   matchingScoreDetails: {
//     skillsMatch: Number,
//     experienceMatch: Number,
//     educationMatch: Number,
//     overallMatch: Number,
//   },
//   analysis: {
//     skills: {
//       candidateSkills: [String],
//       matched: [String],
//       notMatched: [String],
//     },
//     experience: {
//       relevantExperience: String,
//       yearsOfExperience: String,
//     },
//     education: {
//       highestDegree: String,
//       relevantCourses: [String],
//     },
//     projects: [String],
//     recommendation: String,
//     comments: String,
//     additionalNotes: String,
//   },
//   averageScore: { type: Number, default: null },
//   selected: { type: Boolean, default: false },
//   candidateStatus: {
//     type: String,
//     default: "Screened",
//   },
//   jobStatus: {
//     type: [String],
//     default: ["Screened"],
//   },
//   expectations: expectationsSchema,
//   customQuestionResults: customQuestionResultsSchema,
//   voiceInterviewResults: [voiceInterviewResultSchema],
//   assessmentScore: assessmentSchema,
//   chat: chatSchema,
//   created_at: {
//     type: Date,
//     default: Date.now,
//   },
//   notes: [noteSchema],
// });

// resumeSchema.index({ companyId: 1 });

// resumeSchema.pre("save", function (next) {
//   if (this.isModified("candidateStatus")) {
//     if (!this.jobStatus.includes(this.candidateStatus)) {
//       this.jobStatus.push(this.candidateStatus);
//     }
//   }

//   if (this.isModified("chat.questions") || this.isModified("chat.answers")) {
//     this.chat.date = Date.now();
//   }
//   next();
// });

// const Resume = mongoose.model("CV_Summary", resumeSchema);

// export default Resume;

// import mongoose from "mongoose";

// // Schema for individual score entry
// const assessmentScoreSchema = new mongoose.Schema({
//   criteria: { type: String, required: false }, // Stores the criteria name
//   score: { type: Number, required: false }, // Stores the score for that criteria
// });

// // Define the schema for assessment score
// const assessmentSchema = new mongoose.Schema({
//   resumeId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Resume",
//     required: true,
//   }, // Reference to the Resume
//   jobId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Reference to Job
//   criteriaScores: [assessmentScoreSchema], // Stores an array of criteria and their scores
//   comment: { type: String, required: true }, // Stores any comment provided
//   created_at: {
//     type: Date,
//     default: Date.now,
//   },
// });

// const noteSchema = new mongoose.Schema({
//   noteText: {
//     type: String,
//     required: true,
//   },
//   userName: {
//     type: String,
//     required: true,
//   },
//   userEmail: {
//     type: String,
//     required: true,
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
// });

// // Enhanced score schema to include custom questions
// const scoreSchema = new mongoose.Schema({
//   question: { type: String, required: false },
//   answer: { type: String, required: false },
//   score: { type: Number, required: false },
//   feedback: { type: String, required: false },
//   questionType: {
//     type: String,
//     enum: ["standard", "custom"],
//     default: "standard",
//   }, // New field
//   customQuestionId: { type: String, required: false }, // New field for custom question reference
// });

// // Enhanced QuestionAnswerScore schema
// const questionAnswerScoreSchema = new mongoose.Schema({
//   resumeId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Resume",
//     required: false,
//   },
//   jobId: { type: mongoose.Schema.Types.ObjectId, required: false },
//   qId: { type: String, required: false },
//   scores: [scoreSchema],
//   averageScore: { type: Number, required: false },
//   percentageScore: { type: Number, required: false },
//   hasCustomQuestions: { type: Boolean, default: false }, // New field
//   customQuestionCount: { type: Number, default: 0 }, // New field
//   created_at: {
//     type: Date,
//     default: Date.now,
//   },
// });

// // Updated expectations schema to handle new question types
// // const expectationsSchema = new mongoose.Schema({
// //   salaryRange: {
// //     low: Number,
// //     high: Number,
// //   },
// //   workLocation: {
// //     type: String,
// //   },
// //   workType: {
// //     type: String,
// //   },
// //   hasDrivingLicense: {
// //     type: Boolean,
// //     default: false,
// //   },
// //   willingToRelocate: {
// //     type: Boolean,
// //     default: false,
// //   },
// //   expectationQuestions: [String],

// //   // Updated to handle different question types and answers
// //   candidateQuestionResponse: {
// //     type: mongoose.Schema.Types.Mixed, // Changed from Map to Mixed for better flexibility
// //     default: {},
// //   },

// //   // Store raw answers for reference
// //   rawAnswers: {
// //     type: mongoose.Schema.Types.Mixed,
// //     default: {},
// //   },

// //   // Store question metadata for better tracking
// //   questionMetadata: [
// //     {
// //       questionIndex: Number,
// //       questionText: String,
// //       questionType: {
// //         type: String,
// //         enum: ["text", "option", "custom"],
// //         default: "text",
// //       },
// //       options: [String], // For custom multiple choice questions
// //       selectedOption: String, // The actual selected option text
// //       answerValue: mongoose.Schema.Types.Mixed, // The raw answer value
// //     },
// //   ],

// //   candidateResponse: {
// //     salaryRangeResponse: {
// //       type: Boolean,
// //     },
// //     workLocation: {
// //       type: Boolean,
// //     },
// //     workType: {
// //       type: Boolean,
// //     },
// //     hasDrivingLicense: {
// //       type: Boolean,
// //     },
// //     willingToRelocate: {
// //       type: Boolean,
// //     },
// //     others: String, // Candidate's response to additional questions
// //     created_at: {
// //       type: Date,
// //       default: Date.now,
// //     },
// //   },
// //   created_at: {
// //     type: Date,
// //     default: Date.now,
// //   },
// // })
// // const expectationQuestionSchema = new mongoose.Schema({
// //   text: { type: String, required: true },
// //   type: { type: String, enum: ["text", "custom"], required: true },
// //   options: { type: [String], default: [] }, // For multiple-choice questions
// //   disqualifyingOptions: { type: [String], default: [] }, // For disqualifying options
// // });

// const expectationsSchema = new mongoose.Schema({
//   salaryRange: {
//     low: Number,
//     high: Number,
//   },
//   workLocation: {
//     type: String,
//   },
//   workType: {
//     type: String,
//   },
//   hasDrivingLicense: {
//     type: Boolean,
//     default: false,
//   },
//   willingToRelocate: {
//     type: Boolean,
//     default: false,
//   },
//   // expectationQuestions: [expectationQuestionSchema], // Updated to use the new subschema
//   expectationQuestions: {
//     type: [mongoose.Schema.Types.Mixed], // This allows both strings and objects
//     default: [],
//   }, // Updated to use the new subschema
//   candidateQuestionResponse: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {},
//   },
//   rawAnswers: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {},
//   },
//   questionMetadata: [
//     {
//       questionIndex: Number,
//       questionText: String,
//       questionType: {
//         type: String,
//         enum: ["text", "option", "custom"],
//         default: "text",
//       },
//       options: [String],
//       selectedOption: String,
//       answerValue: mongoose.Schema.Types.Mixed,
//     },
//   ],
//   candidateResponse: {
//     salaryRangeResponse: {
//       type: Boolean,
//     },
//     workLocation: {
//       type: Boolean,
//     },
//     workType: {
//       type: Boolean,
//     },
//     hasDrivingLicense: {
//       type: Boolean,
//     },
//     willingToRelocate: {
//       type: Boolean,
//     },
//     others: String,
//     created_at: {
//       type: Date,
//       default: Date.now,
//     },
//   },
//   created_at: {
//     type: Date,
//     default: Date.now,
//   },
// });

// const attachmentSchema = new mongoose.Schema(
//   {
//     url: { type: String, required: false },
//     name: { type: String, required: false },
//     type: { type: String, required: false },
//     originalname: String,
//     public_id: String,
//     format: String,
//   },
//   { _id: false }
// );

// // Define chat schema with proper attachment support
// const chatSchema = new mongoose.Schema(
//   {
//     questions: { type: [String], default: [] },
//     answers: { type: [String], default: [] },
//     attachments: { type: [[attachmentSchema]], default: [] }, // Array of arrays for question attachments
//     answerAttachments: { type: [[attachmentSchema]], default: [] }, // Array of arrays for answer attachments
//     date: { type: Date, default: Date.now },
//   },
//   { _id: false }
// );

// // Define the Resume schema
// const resumeSchema = new mongoose.Schema({
//   candidateName: String,
//   jobTitle: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "JobDescription",
//   },
//   email: String,
//   mobile: Number,
//   companyName: String,
//   companyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Company",
//     required: false, // Set to true if every resume must be associated with a company
//   },
//   resumeLink: String, // New field to store the resume link
//   containerId: { type: String, default: null }, // Store TrustID containerId
//   linkedinLink: { type: String, default: null }, // Optional LinkedIn link field
//   matchingScoreDetails: {
//     skillsMatch: Number,
//     experienceMatch: Number,
//     educationMatch: Number,
//     overallMatch: Number,
//   },
//   analysis: {
//     skills: {
//       candidateSkills: [String],
//       matched: [String],
//       notMatched: [String],
//     },
//     experience: {
//       relevantExperience: String,
//       yearsOfExperience: String,
//     },
//     education: {
//       highestDegree: String,
//       relevantCourses: [String],
//     },
//     projects: [String],
//     recommendation: String,
//     comments: String,
//     additionalNotes: String,
//   },
//   averageScore: { type: Number, default: null }, // Optional field for an average score
//   selected: { type: Boolean, default: false }, // Field with default value
//   candidateStatus: {
//     type: String,
//     default: "Screened", // Default status when a candidate applies
//   },
//   jobStatus: {
//     type: [String], // Array to store all statuses
//     default: ["Screened"], // Initialize with the default status
//   },
//   expectations: expectationsSchema, // Updated expectations schema

//   // Array of questionAnswerScores (with optional fields)
//   questionAnswerScores: [questionAnswerScoreSchema], // Multiple results per candidate, with all fields optional
//   assessmentScore: assessmentSchema,
//   chat: chatSchema,
//   created_at: {
//     type: Date,
//     default: Date.now,
//   },
//   notes: [noteSchema], // array of notes
// });

// resumeSchema.index({ companyId: 1 }); // 1 for ascending index, -1 for descending index

// resumeSchema.pre("save", function (next) {
//   if (this.isModified("candidateStatus")) {
//     if (!this.jobStatus.includes(this.candidateStatus)) {
//       this.jobStatus.push(this.candidateStatus);
//     }
//   }

//   if (this.isModified("chat.questions") || this.isModified("chat.answers")) {
//     this.chat.date = Date.now(); // Update date to current timestamp
//   }
//   next();
// });

// const Resume = mongoose.model("CV_Summary", resumeSchema);

// export default Resume;
