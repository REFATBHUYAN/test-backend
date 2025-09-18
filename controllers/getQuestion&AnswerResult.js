
import QuestionAnswerScore from "../model/questionAnswerScoreModel.js";

// const router = express.Router();

// Route to get QuestionAnswerScore by resumeId and jobId
export const getQuestionAndAnsResult = async (req, res) => {
    // const { resumeId, jobId } = req.query;

    // if (!resumeId || !jobId) {
    //     return res.status(400).json({ message: "resumeId and jobId are required." });
    // }

    // try {
    //     const scoresData = await QuestionAnswerScore.find({ 
    //         resumeId: mongoose.Types.ObjectId(resumeId),
    //         jobId: mongoose.Types.ObjectId(jobId)
    //     });

    //     if (!scoresData || scoresData.length === 0) {
    //         return res.status(404).json({ message: "No data found for the provided resumeId and jobId." });
    //     }

    //     res.status(200).json(scoresData);
    // } catch (error) {
    //     console.error('Error fetching scores:', error.message);
    //     res.status(500).json({ message: "An error occurred while fetching the scores.", error: error.message });
    // }

    const { resumeId, jobId } = req.query;

    try {
        const scores = await QuestionAnswerScore.find({ resumeId, jobId });
        res.json(scores);
    } catch (error) {
        console.error("Error fetching scores:", error.message);
        res.status(500).json({ error: "Server error" });
    }
};
