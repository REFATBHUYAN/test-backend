import { OpenAI } from "@langchain/openai";
import mongoose from 'mongoose';
import dotenv from "dotenv";
import Resume from "../model/resumeModel.js";

dotenv.config();

export const submitAnswer2 = async (req, res) => {
    const { answers, questions, resumeId } = req.body;

    if (!answers || !questions) {
        return res.status(400).json({ message: "Questions and answers are required." });
    }

    const model = new OpenAI({
        modelName: "gpt-4.1",
        temperature: 0,
    });

    const prompt = `You are an expert interviewer. I will provide you with a list of questions and answers given by a candidate. Please evaluate each answer and provide a score out of 10, along with a brief feedback comment.
    
    Questions and Answers:
    ${questions?.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`).join('\n\n')}
    
    Please provide the scores and feedback in the following format:
    Q1: score - feedback
    Q2: score - feedback
    ...
    `;

    try {
        const response = await model.call(prompt);

        // Split the response into lines
        const lines = response.split('\n').filter(line => line.trim() !== '');

        // Initialize an array to store parsed scores
        const scores = [];

        // Process each line to extract question, score, and feedback
        lines.forEach(line => {
            const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
            if (match) {
                const question = `Q${match[1]}`;
                const score = parseInt(match[2], 10);
                const feedback = match[3].trim();
                scores.push({ question, score, feedback });
            }
        });

        // Calculate the total score and average score
        const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
        const averageScore = totalScore / scores.length;

        // Optionally, calculate percentage score (if scores are out of 10)
        const percentageScore = (averageScore / 10) * 100;

        // Retrieve resume using resumeId and update with averageScore
        const resumeIdObjectId = new mongoose.Types.ObjectId(resumeId);
        console.log("resumeid object id resume",resumeIdObjectId)
        const resume = await Resume.findById(resumeIdObjectId);
        console.log("resumeid resume",resume);
        if (!resume) {
            return res.status(404).json({ message: "Resume not found." });
        }

        console.log("resumeid resume",resume);

        resume.averageScore = averageScore;
        await resume.save();

        

        res.status(200).json({ scores, averageScore, percentageScore, message: "Answer Submit successfully!" });
    } catch (error) {
        console.error('Error scoring answers:', error.message);
        res.status(500).json({ error: error.message });
    }
};
