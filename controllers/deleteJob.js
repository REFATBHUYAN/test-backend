import JobDescription from '../model/JobDescriptionModel.js';
import mongoose from "mongoose";

export const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    // const resumeIdObjectId = new mongoose.Types.ObjectId(id);
    // console.log("resumeid object id resume", resumeIdObjectId);
    // const resume = await Resume.findByIdAndDelete(resumeIdObjectId);
    const job = await JobDescription.findByIdAndDelete(id);
    if (!job) {
      return res
        .status(404)
        .json({ success: false, message: "Job not found." });
    }
    res.json({ success: true, message: "Job deleted successfully!" });
  } catch (error) {
    console.error("Error deleting Job:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete Job." });
  }
};
