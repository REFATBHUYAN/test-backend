// import JobDescription from '../model/JobDescriptionModel.js';

// export const updateSingleJobDescription = async (req, res) => {
//     const { id } = req.params; // Get ID from URL params
//     const { markdown_description } = req.body; // Get new description from request body

//     if (!id || !markdown_description) {
//         return res.status(400).json({ message: "Job ID and markdown description are required." });
//     }

//     try {
//         const jobDescription = await JobDescription.findById(id); // Find job by ID
//         if (!jobDescription) {
//             return res.status(404).json({ message: "Job description not found." });
//         }

//         jobDescription.markdown_description = markdown_description; // Update description
//         await jobDescription.save(); // Save changes

//         return res.status(200).json({ job_description: jobDescription });
//     } catch (error) {
//         return res.status(500).json({ message: "Error updating job description.", error: error.message });
//     }
// };

import JobDescription from "../model/JobDescriptionModel.js";

export const updateSingleJobDescription = async (req, res) => {
  const { id } = req.params;
  const { markdown_description, user_name, user_email, context } = req.body;

  if (!id || !markdown_description) {
    return res
      .status(400)
      .json({ message: "Job ID and markdown description are required." });
  }

  try {
    const jobDescription = await JobDescription.findById(id);
    if (!jobDescription) {
      return res.status(404).json({ message: "Job description not found." });
    }

    jobDescription.markdown_description = markdown_description;
    if (context) {
      jobDescription.context = context;
    }

    // Add modification details
    jobDescription.modifications.push({
      user_name,
      user_email,
    });

    await jobDescription.save();

    return res.status(200).json({ job_description: jobDescription });
  } catch (error) {
    return res
      .status(500)
      .json({
        message: "Error updating job description.",
        error: error.message,
      });
  }
};
