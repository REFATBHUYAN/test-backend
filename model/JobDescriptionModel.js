
import mongoose from "mongoose";

const ModificationSchema = new mongoose.Schema({
  user_name: {
    type: String,
    required: false,
  },
  user_email: {
    type: String,
    required: false,
  },
  date: {
    type: Date,
    default: Date.now,
    required: false,
  },
});

const customQuestionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "option", "custom"],
      default: "text",
    },
    questionIndex: {
      type: Number,
      required: true,
    },
    options: [String], // For multiple choice questions
    disqualifyingOptions: [Number], // Indices of options that disqualify
  },
  { _id: false },
)

const JobDescriptionSchema = new mongoose.Schema({
  context: {
    type: String,
    required: true,
  },
  company_name: {
    type: String,
    required: true,
  },
  expectationQuestions: {
    type: [mongoose.Schema.Types.Mixed], // This allows both strings and objects
    default: [],
  },
  customQuestions: {
    type: [customQuestionSchema], // Use the structured schema
    default: [],
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId, // Assuming companyId is a reference to a Company document
    ref: "Company", // Assuming you have a Company model
    required: false, // Initially not required since you need to update it
  },
  short_description: {
    type: String,
    required: false,
  },
  key_responsibilities: {
    type: [String],
    required: false,
  },
  qualifications: {
    type: [String],
    required: false,
  },
  experience_required: {
    type: [String],
    required: false,
  },
  other_relevant_details: {
    type: [String],
    required: false,
  },
  markdown_description: {
    type: String,
    required: false,
  },
  html_description: {
    type: String,
    required: false, // Make it optional for backward compatibility
  },
  resumes: {
    // New field for storing resume URLs
    type: [String],
    default: [],
  },
  topskills: { type: [String], default: [] }, // New field
  topresponsibilityskills: { type: [String], default: [] }, // New field
  topqualificationskills: { type: [String], default: [] },
  // NEW FIELD: Additional skills array
  additional_skills: {
    type: [String],
    default: [],
    required: false,
  },
  // customQuestions: [{ type: String }], // Simple array of question strings
  created_by: {
    user_name: {
      type: String,
      required: false,
    },
    user_email: {
      type: String,
      required: false,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  job_criteria: {
    type: [String],
    required: false,
  },
  modifications: [ModificationSchema], // Stores modification history
  assignee: {
    name: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      required: false,
    },
    assignDate: {
      type: Date,
      default: Date.now,
      required: false,
    },
  },
  jobOwner: {
    name: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      required: false,
    },
    assignDate: {
      type: Date,
      default: Date.now,
      required: false,
    },
  },
  jobClient: {
    name: {
      type: String,
      required: false,
    },
    website: {
      type: String,
      required: false,
    },
    assignDate: {
      type: Date,
      default: Date.now,
      required: false,
    },
  },
  status: {
    type: String,
    default: "Open",
    required: false,
  },
  publish: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

JobDescriptionSchema.index({ companyId: 1 }); // 1 for ascending index, -1 for descending index


const JobDescription = mongoose.model("JobDescription", JobDescriptionSchema);

export default JobDescription;
