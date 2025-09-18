import Resume from "../../model/resumeModel.js";

// Controller function to fetch resume by email
export const getResumeByEmail = async (req, res) => {
  try {
    const { email } = req.params; // Get email from request parameters
    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    // const resume = await Resume.findOne({ email }).populate("jobTitle").populate("companyId"); // Populate fields if necessary
    // if (!resumes) {
    //     return res.status(404).json({ message: "Resume not found." });
    //   }


    const resumes = await Resume.find({ email })
      .populate("jobTitle")
      .populate("companyId");

    if (resumes.length === 0) {
      return res
        .status(404)
        .json({ message: "No resumes found for the provided email." });
    }

    

    res.status(200).json(resumes);
  } catch (error) {
    console.error("Error fetching resume by email:", error);
    res
      .status(500)
      .json({ message: "An error occurred while fetching the resume." });
  }
};
