import Candidate from "../../model/candidateModal.js";
import Fees from "../../model/feesModal.js";
import JobDescription from "../../model/JobDescriptionModel.js";
import Resume from "../../model/resumeModel.js";
import User from "../../model/User.js";
import mongoose from "mongoose";

// export const getCompanyData2 = async (req, res) => {
//   const { company_name } = req.query;

//   if (!company_name) {
//     return res.status(400).json({ message: "No company name provided." });
//   }

//   try {
//     // Fetch job descriptions
//     const jobDescriptions = await JobDescription.find({ company_name: company_name });

//     // Fetch resumes
//     const resumes = await Resume.find({ companyName: company_name });

//     // Fetch users
//     const users = await User.find({ company: company_name });

//     if (jobDescriptions.length === 0 && resumes.length === 0 && users.length === 0) {
//       return res.status(404).json({
//         message: "No job descriptions, resumes, or users found for the provided company name.",
//       });
//     }

//     return res.status(200).json({
//       jobDescriptions,
//       resumes,
//       users, // Include users in the response
//     });
//   } catch (error) {
//     return res.status(500).json({
//       message: "Error retrieving data.",
//       error: error.message,
//     });
//   }
// };

export const getSingleCompanyData = async (req, res) => {
  const { companyId } = req.params;

  // Check if companyId is provided
  if (!companyId) {
    return res.status(400).json({ message: "No company ID provided." });
  }

  try {
    // Validate companyId format (optional)
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Invalid company ID format." });
    }

    // Fetch job descriptions by companyId
    const jobDescriptions = await JobDescription.find({ companyId });

    // Fetch resumes by companyId
    const resumes = await Resume.find({ companyId });

    // Fetch users by companyId
    const users = await User.find({ companyId });
    // const fees = await Fees.find({ organisationId: companyId });
    // const candidate = await Candidate.find({ companyId });

    // Check if any data is found
    if (
      jobDescriptions.length === 0 &&
      resumes.length === 0 &&
      users.length === 0
    ) {
      return res.status(404).json({
        message:
          "No job descriptions, resumes, or users found for the provided company ID.",
      });
    }

    // Return the found data
    return res.status(200).json({
      jobs: jobDescriptions,
      resumes,
      users,
      // fees,
      //   candidate
    });
  } catch (error) {
    // Log the error for debugging
    console.error("Error retrieving data by companyId:", error);

    // Return 500 status with error message
    return res.status(500).json({
      message: "Error retrieving data by companyId.",
      error: error.message,
    });
  }
};
