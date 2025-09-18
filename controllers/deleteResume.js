import Resume from "../model/resumeModel.js";
import mongoose from "mongoose";

export const deleteResume = async (req, res) => {
  try {
    const { id } = req.params;
    // const resumeIdObjectId = new mongoose.Types.ObjectId(id);
    // console.log("resumeid object id resume", resumeIdObjectId);
    // const resume = await Resume.findByIdAndDelete(resumeIdObjectId);
    const resume = await Resume.findByIdAndDelete(id);
    if (!resume) {
      return res
        .status(404)
        .json({ success: false, message: "Resume not found." });
    }
    res.json({ success: true, message: "Resume deleted successfully!" });
  } catch (error) {
    console.error("Error deleting resume:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete resume." });
  }
};
