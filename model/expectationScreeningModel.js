import mongoose from "mongoose";

const expectationScreeningSchema = new mongoose.Schema({
  salaryRange: {
    low: { type: String, required: true },
    high: { type: String, required: true }
  },
  workLocation: {
    type: String,
    enum: ['Remote', 'Hybrid', 'Onsite'],
    required: true
  },
  workType: {
    type: String,
    enum: ['Full Time', 'Contract', 'Part-time'],
    required: true
  },
  hasDrivingLicense: {
    type: String,
    enum: ['Yes', 'No'],
    required: true
  },
  willingToRelocate: {
    type: String,
    enum: ['Yes', 'No'],
    required: true
  },
  others: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

expectationScreeningSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const ExpectationScreening = mongoose.model('ExpectationScreening', expectationScreeningSchema);

export default ExpectationScreening;
