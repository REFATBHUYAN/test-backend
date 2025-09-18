// models/companyModel.js
// import mongoose from 'mongoose';

// const companySchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: true,
//   },
//   website: {
//     type: String,
//     required: false,
//   },
//   address: {
//     type: String,
//     required: false,
//   },
//   phoneNumber: {
//     type: String,
//     required: false,
//   },
// });

// const Company = mongoose.model('Company', companySchema);

// export default Company;

// models/companyModel.js
import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  website: {
    type: String,
    required: false,
  },
  address: {
    type: String,
    required: false,
  },
  phoneNumber: {
    type: String,
    required: false,
  },
  companyExessId: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Company",
    default: [],
  },
  subscription: {
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled'],
      default: 'inactive',
    },
    plan: {
      type: String,
      enum: ['crazy', 'ludicrous', 'insane'],
      required: false,
    },
    plan2: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: false,
    },
    startDate: {
      type: Date,
      required: false,
    },
    endDate: {
      type: Date,
      required: false,
    },
    stripeCustomerId: {
      type: String,
      required: false,
    },
    stripeSubscriptionId: {
      type: String,
      required: false,
    },
    gocardlessCustomerId: {
      type: String,
      required: false,
    },
    gocardlessMandateId: {
      type: String,
      required: false,
    },
    gocardlessSubscriptionId: {
      type: String,
      required: false,
    },
  },
}, { timestamps: true });

const Company = mongoose.model('Company', companySchema);

export default Company;