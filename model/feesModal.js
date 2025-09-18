import mongoose from 'mongoose';

const feesSchema = new mongoose.Schema({
  organisationName: {
    type: String,
    required: true,
  },
  organisationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  screening: {
    base: {
      type: Number,
      default: 150,
    },
    perCV: {
      type: Number,
      default: 0.30,
    },
  },
  expectations: {
    perCV: {
      type: Number,
      default: 0.30,
    },
  },
  aptitudeTests: {
    perCV: {
      type: Number,
      default: 2,
    },
  },
  f2fInterviews: {
    perCV: {
      type: Number,
      default: 0.20,
    },
  },
  basePrice: {
    type: Number,
    default: 300,
  },
  cvLimit: {
    type: Number,
    default: 150,
  },
  freeJobs: {
    type: Number,
    default: 2,
  },
  costPerAdditionalCV: {
    type: Number,
    default: 0.20,
  },
  packageType: {
    type: String,
    enum: ['Small', 'Standard', 'Enterprise', 'Small-Recruit', 'Standard-Recruit', 'Enterprise-Recruit'],
    default: 'Small',
  },
});

feesSchema.index({ companyId: 1 }); // 1 for ascending index, -1 for descending index


const Fees = mongoose.model('Fees', feesSchema);
export default Fees;


// import mongoose from 'mongoose';

// const feesSchema = new mongoose.Schema({
//   organisationName: {
//     type: String,
//     required: true,
//   },
//   organisationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Company',
//     required: true,
//   },
//   screening: {
//     base: {
//       type: Number,
//       default: 100,
//     },
//     perCV: {
//       type: Number,
//       default: 1,
//     },
//   },
//   expectations: {
//     perCV: {
//       type: Number,
//       default: 1,
//     },
//   },
//   aptitudeTests: {
//     perCV: {
//       type: Number,
//       default: 1,
//     },
//   },
//   f2fInterviews: {
//     perCV: {
//       type: Number,
//       default: 1,
//     },
//   },
// });

// const Fees = mongoose.model('Fees', feesSchema);
// export default Fees;


// Controller function to create default fees for a company
// export const createDefaultFees = async (req, res) => {
//     try {
//       const { organisationName, organisationId } = req.body;
  
//       if (!organisationName || !organisationId) {
//         return res.status(400).json({ message: 'Organisation name and ID are required' });
//       }
  
//       // Check if fees already exist for the company
//       const existingFees = await Fees.findOne({ organisationId });
//       if (existingFees) {
//         return res.status(400).json({ message: 'Fees already set for this organisation' });
//       }
  
//       // Create default fees
//       const newFees = new Fees({
//         organisationName,
//         organisationId,
//       });
  
//       await newFees.save();
  
//       res.status(201).json({ message: 'Default fees created successfully', fees: newFees });
//     } catch (error) {
//       res.status(500).json({ message: 'Error creating fees', error: error.message });
//     }
//   };