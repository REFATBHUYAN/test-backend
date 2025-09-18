import Resume from "../../model/resumeModel.js";

export const saveResumes = async (req, res) => {
  const { resumes } = req.body;

  if (!resumes || resumes.length === 0) {
    return res.status(400).json({ message: "No resumes provided" });
  }

  try {
    const savedResumes = await Promise.all(
      resumes.map(async (resume) => {
        // Check if the resume already exists based on a unique field
        const existingResume = await Resume.findOne({ email: resume?.email, jobTitle: resume?.jobTitle }); // Adjust the field as necessary
        if (existingResume) {
          console.log(`Resume with email ${resume.email} already exists. Skipping.`);
          return existingResume; // Return the existing resume instead of saving a new one
        }

        const newResume = new Resume(resume);
        return await newResume.save();
      })
    );

    return res.status(200).json({ message: "Resumes processed successfully", data: savedResumes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error processing resumes", error });
  }
};
