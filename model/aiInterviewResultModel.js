import mongoose from "mongoose";

const aiEvaluationResultSchema = new mongoose.Schema({
  searchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "HeadhunterSearchHistory",
    required: true,
  },
  candidate: {
    type: Object,
    required: true,
  },
  job: {
    type: Object,
    required: true,
  },
  evaluation: {
    type: Object,
  },
  error: {
    type: String,
  },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const AIEvaluationResult = mongoose.model(
  "AIEvaluationResult",
  aiEvaluationResultSchema
);

export default AIEvaluationResult;