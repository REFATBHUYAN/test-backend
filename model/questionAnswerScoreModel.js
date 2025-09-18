import mongoose from 'mongoose';

const questionAnswerScoreSchema = new mongoose.Schema({
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
    qId: { type: String, required: true },
    scores: [{
        question: { type: String, required: true },
        answer: { type: String, required: true },
        score: { type: Number, required: true },
        feedback: { type: String, required: true }
    }],
    averageScore: { type: Number, required: true },
    percentageScore: { type: Number, required: true }
});

const QuestionAnswerScore = mongoose.model('QuestionAnswerScore', questionAnswerScoreSchema);

export default QuestionAnswerScore;

