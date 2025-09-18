import Resume from "../../model/resumeModel.js";


export const submitAssessmentScore = async (req, res) => {
  const { resumeId, jobId, criteriaScores, comment } = req.body;

  try {
    // Find the resume by its ID
    const resume = await Resume.findById(resumeId);

    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    // Calculate total score (optional)
    // const totalScore = criteriaScores.reduce((sum, item) => sum + parseFloat(item.score || 0), 0);

    // Add the assessmentScore to the resume
    resume.assessmentScore = {
      resumeId,
      jobId,
      criteriaScores,
      comment,
    //   totalScore
    };

    // Save the updated resume
    await resume.save();

    res.status(200).json({ message: "Assessment score saved successfully", resume });
  } catch (error) {
    console.error("Error submitting assessment score:", error);
    res.status(500).json({ message: "Error submitting assessment score" });
  }
};
