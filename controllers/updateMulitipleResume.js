import Resume from "../model/resumeModel.js"; // Adjust the path to your Resume model

// Endpoint to update the "selected" field for multiple resumes by their IDs
// export const updateMultipleResumes = async (req, res) => {
//   const { resumeIds } = req.body;
//   console.log("resumeIDS" ,resumeIds);


//   try {
//     // Ensure the array of resume IDs is provided
//     if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
//       return res.status(400).json({ success: false, message: "No resume IDs provided." });
//     }

//     // Perform the update
//     const result = await Resume.updateMany(
//       { _id: { $in: resumeIds } }, // Match resumes by the provided IDs
//       { $set: { selected: true } } // Set the "selected" field to true
//     );

//     console.log("result",result);


//     if (result.modifiedCount > 0) {
//       res.status(200).json({ success: true, message: "Resumes updated successfully." });
//     } else {
//       res.status(404).json({ success: false, message: "No resumes found for the given IDs." });
//     }
//   } catch (error) {
//     console.error("Error updating resumes:", error);
//     res.status(500).json({ success: false, message: "Error updating resumes." });
//   }
// };

// export const updateMultipleResumes = async (req, res) => {
//   const { resumeIds } = req.body;
//   console.log("resumeIDs:", resumeIds);

//   try {
//     // Ensure the array of resume IDs is provided
//     if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
//       return res.status(400).json({ success: false, message: "No resume IDs provided." });
//     }

//     // Perform the update
//     const result = await Resume.updateMany(
//       { _id: { $in: resumeIds } }, // Match resumes by the provided IDs
//       { $set: { candidateStatus: "Selected for Expectations Screening" } } // Set the "candidateStatus" field
//     );

//     console.log("Update result:", result);

//     if (result.modifiedCount > 0) {
//       res.status(200).json({ success: true, message: "Candidate statuses updated successfully." });
//     } else {
//       res.status(404).json({ success: false, message: "No resumes found for the given IDs." });
//     }
//   } catch (error) {
//     console.error("Error updating resumes:", error);
//     res.status(500).json({ success: false, message: "Error updating candidate statuses." });
//   }
// };
// export const updateMultipleResumes2 = async (req, res) => {
//   const { resumeIds } = req.body;
//   console.log("resumeIDs:", resumeIds);

//   try {
//     // Ensure the array of resume IDs is provided
//     if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
//       return res.status(400).json({ success: false, message: "No resume IDs provided." });
//     }

//     // Perform the update
//     const result = await Resume.updateMany(
//       { _id: { $in: resumeIds } }, // Match resumes by the provided IDs
//       { $set: { candidateStatus: "Selected for Aptitude Testing" } } // Set the "candidateStatus" field
//     );

//     console.log("Update result:", result);

//     if (result.modifiedCount > 0) {
//       res.status(200).json({ success: true, message: "Candidate statuses updated successfully." });
//     } else {
//       res.status(404).json({ success: false, message: "No resumes found for the given IDs." });
//     }
//   } catch (error) {
//     console.error("Error updating resumes:", error);
//     res.status(500).json({ success: false, message: "Error updating candidate statuses." });
//   }
// };

// Method to update candidate status to "Selected for Expectations Screening"
export const updateMultipleResumes = async (req, res) => {
  const { resumeIds } = req.body;
  console.log("resumeIDs:", resumeIds);

  try {
    // Ensure the array of resume IDs is provided
    if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ success: false, message: "No resume IDs provided." });
    }

    // Loop over each resume ID and update the candidateStatus
    const resumes = await Resume.find({ _id: { $in: resumeIds } });

    if (resumes.length === 0) {
      return res.status(404).json({ success: false, message: "No resumes found for the given IDs." });
    }

    // Update the candidateStatus for each resume and trigger the post-save hook
    for (let resume of resumes) {
      resume.candidateStatus = "Selected for Expectations Screening"; // Set the candidateStatus
      await resume.save(); // This triggers the post-save hook
    }

    res.status(200).json({ success: true, message: "Candidate statuses updated successfully." });
  } catch (error) {
    console.error("Error updating resumes:", error);
    res.status(500).json({ success: false, message: "Error updating candidate statuses." });
  }
};

// Method to update candidate status to "Selected for Aptitude Testing"
export const updateMultipleResumes2 = async (req, res) => {
  const { resumeIds } = req.body;
  console.log("resumeIDs:", resumeIds);

  try {
    // Ensure the array of resume IDs is provided
    if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ success: false, message: "No resume IDs provided." });
    }

    // Loop over each resume ID and update the candidateStatus
    const resumes = await Resume.find({ _id: { $in: resumeIds } });

    if (resumes.length === 0) {
      return res.status(404).json({ success: false, message: "No resumes found for the given IDs." });
    }

    // Update the candidateStatus for each resume and trigger the post-save hook
    for (let resume of resumes) {
      resume.candidateStatus = "Selected for Aptitude Testing"; // Set the candidateStatus
      await resume.save(); // This triggers the post-save hook
    }

    res.status(200).json({ success: true, message: "Candidate statuses updated successfully." });
  } catch (error) {
    console.error("Error updating resumes:", error);
    res.status(500).json({ success: false, message: "Error updating candidate statuses." });
  }
};
