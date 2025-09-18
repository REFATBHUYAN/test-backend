import Resume from "../model/resumeModel.js";

export const getAllResumes = async (req, res) => {
  try {
    const resumes = await Resume.find({});
    //console.log(typeof resumes)

    res
      .status(200)
      .json({
        message: "All resumes fetched successfully",
        resumes: resumes,
        total: resumes.length,
      });
  } catch (error) {
    console.error("Error fetching objects:", error);
    res.status(500).json({ error: "Internal Server Error", errMsg: error });
  }
};
