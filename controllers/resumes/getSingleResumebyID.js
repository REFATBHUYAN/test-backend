// Adjust the path as necessary

import Resume from "../../model/resumeModel.js";

// Controller to fetch a single resume by its ID
export const getResumeById = async (req, res) => {
  const { resumeId } = req.params;

  try {
    // Fetch the resume from the database
    const resume = await Resume.findById(resumeId);

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    // Send the resume data as a response
    res.status(200).json(resume);
  } catch (error) {
    console.error("Error fetching resume:", error);
    res.status(500).json({ message: "Server error" });
  }
};
