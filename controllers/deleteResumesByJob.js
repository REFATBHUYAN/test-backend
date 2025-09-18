
import Resume from "../model/resumeModel.js"; // Adjust the path to your Resume model



// Endpoint to delete resumes by job ID
export const deleteResumesByJob = async (req, res) => {
  const { jobId } = req.params;

  try {
    const result = await Resume.deleteMany({ jobTitle: jobId });
    if (result.deletedCount > 0) {
      res.status(200).json({ success: true, message: 'Resumes deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'No resumes found for the given job ID' });
    }
  } catch (error) {
    console.error('Error deleting resumes:', error);
    res.status(500).json({ success: false, message: 'Error deleting resumes' });
  }
};


