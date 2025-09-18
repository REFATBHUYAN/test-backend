import { Schema, model } from 'mongoose';

const referenceSchema = new Schema({
  candidateEmail: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: false,
  },
  designation: {
    type: String,
    required: false,
  },
  companyName: {
    type: String,
    required: false,
  },
  datesWorked: {
    type: String,
    required: false,
  },
  message: {
    type: String,
    required: false,
  },
  tellNo: String,
  mailId: String,
}, { timestamps: true });

const Reference = model('Reference', referenceSchema);

export default Reference;

