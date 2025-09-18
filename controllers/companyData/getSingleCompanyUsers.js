import User from "../../model/User.js";
import mongoose from "mongoose";

export const getSingleCompanyUsers = async (req, res) => {
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

    // Fetch users by companyId
    const users = await User.find({ companyId });
    // const candidate = await Candidate.find({ companyId });

    // Check if any data is found
    if (users.length === 0) {
      return res.status(404).json({
        message:
          "No job descriptions, resumes, or users found for the provided company ID.",
      });
    }

    // Return the found data
    return res.status(200).json({
      users,
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
