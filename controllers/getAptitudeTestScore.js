import mongoose from "mongoose";
import Resume from "../model/resumeModel.js";

export const getAptituteTestResult = async (req, res) => {
  const { resumeIds, jobId } = req.body;

  console.log(resumeIds, jobId);

  if (!resumeIds || !jobId) {
    return res
      .status(400)
      .json({ message: "resumeIds and jobId are required." });
  }

  try {
    // Check if resumeIds is a valid array
    if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ message: "Invalid resumeIds provided." });
    }

    // Find resumes matching the resumeIds and jobId, selecting relevant score fields
    const resumes = await Resume.find({
      _id: { $in: resumeIds.map((id) => new mongoose.Types.ObjectId(id)) },
      jobTitle: new mongoose.Types.ObjectId(jobId),
    }).select("candidateName customQuestionResults jobSpecificQuestionResults");

    if (!resumes || resumes.length === 0) {
      return res
        .status(404)
        .json({
          message: "No data found for the provided resumeIds and jobId.",
        });
    }

    // Format the response to include score data
    const scoreData = resumes.map((resume) => {
      const customResults = resume.customQuestionResults || {};
      const jobSpecificResults = resume.jobSpecificQuestionResults || [];

      return {
        resumeId: resume._id,
        candidateName: resume.candidateName,
        customQuestionResults: {
          averageScore: customResults.aiEvaluation?.averageScore || 0,
          percentageScore: customResults.aiEvaluation?.percentageScore || 0,
          scores: customResults.aiEvaluation?.individualScores || [],
          recommendation: customResults.aiEvaluation?.recommendation || "N/A",
          overallFeedback: customResults.aiEvaluation?.overallFeedback || "",
        },
        jobSpecificQuestionResults: jobSpecificResults.map((result) => ({
          qId: result.qId,
          averageScore: result.averageScore || 0,
          percentageScore: result.percentageScore || 0,
          scores: result.scores || [],
          recommendation: result.aiEvaluation?.recommendation || "N/A",
          overallFeedback: result.aiEvaluation?.overallFeedback || "",
        })),
      };
    });

    res.status(200).json(scoreData);
  } catch (error) {
    console.error("Error fetching scores:", error.message);
    res
      .status(500)
      .json({
        message: "An error occurred while fetching the scores.",
        error: error.message,
      });
  }
};

// import mongoose from "mongoose";
// import QuestionAnswerScore from "../model/questionAnswerScoreModel.js";

// export const getAptituteTestResult = async (req, res) => {
//   const { resumeIds, jobId } = req.body;

//   console.log(resumeIds, jobId)

//   if (!resumeIds || !jobId) {
//     return res
//       .status(400)
//       .json({ message: "resumeIds and jobId are required." });
//   }

//   try {
//     // Check if resumeIds is a valid array
//     if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
//       return res.status(400).json({ message: "Invalid resumeIds provided." });
//     }

//     // Find all scores matching the jobId and any of the resumeIds
//     const scores = await QuestionAnswerScore.find({
//       resumeId: {
//         $in: resumeIds.map((id) => id),
//       },
//       jobId: jobId,
//     });
//     // const scores = await QuestionAnswerScore.find({
//     //   resumeId: {
//     //     $in: resumeIds.map((id) => mongoose.Types.ObjectId(id)),
//     //   },
//     //   jobId: mongoose.Types.ObjectId(jobId),
//     // });

//     if (!scores || scores.length === 0) {
//       return res
//         .status(404)
//         .json({
//           message: "No data found for the provided resumeIds and jobId.",
//         });
//     }

//     res.status(200).json(scores);
//   } catch (error) {
//     console.error("Error fetching scores:", error.message);
//     res
//       .status(500)
//       .json({
//         message: "An error occurred while fetching the scores.",
//         error: error.message,
//       });
//   }
// };
