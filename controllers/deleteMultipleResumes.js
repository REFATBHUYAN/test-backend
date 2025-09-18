import Resume from "../model/resumeModel.js"; // Adjust the path to your Resume model

// Endpoint to delete multiple resumes by their IDs
export const deleteMultipleResumes = async (req, res) => {
  const { resumeIds } = req.body;

  try {
    // Ensure the array of resume IDs is provided
    if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ success: false, message: "No resume IDs provided." });
    }

    // Perform deletion
    const result = await Resume.deleteMany({ _id: { $in: resumeIds } });

    if (result.deletedCount > 0) {
      res.status(200).json({ success: true, message: "Resumes deleted successfully." });
    } else {
      res.status(404).json({ success: false, message: "No resumes found for the given IDs." });
    }
  } catch (error) {
    console.error("Error deleting resumes:", error);
    res.status(500).json({ success: false, message: "Error deleting resumes." });
  }
};
