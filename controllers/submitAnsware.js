import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

dotenv.config();

export const submitAnswer = async (req, res) => {
    const { answers, questions } = req.body;

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

        const lines = response?.split('\n')?.filter(line => line?.trim() !== '');
        console.log("lines", lines);
        const scores = lines?.map(line => {
            const [question, scoreFeedback] = line?.split(':');
            const [score, feedback] = scoreFeedback?.split('-')?.map(part => part?.trim());
            return { question, score: parseInt(score, 10), feedback };
        });

        res.status(200).json({ scores });
    } 
    // try {
    //     const response = await model.call(prompt);

    //     // Parse the response into an array of objects
    //     // const scores = response.split('\n')
    //     //     .filter(line => line.trim() !== '')
    //     //     ?.map(line => {
    //     //         const [question, scoreFeedback] = line.split(':');
    //     //         const [score, feedback] = scoreFeedback.split('-')?.map(part => part.trim());
    //     //         return { question, score: parseInt(score, 10), feedback };
    //     //     });
    //     const lines = response.split('\n').filter(line => line.trim() !== '');
    //     const scores = lines?.map(line => {
    //         const [question, scoreFeedback] = line.split(':');
    //         const [score, feedback] = scoreFeedback.split('-')?.map(part => part.trim());
    //         return { question, score: parseInt(score, 10), feedback };
    //     });

    //     // Calculate the total score and average score
    //     const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
    //     const averageScore = totalScore / scores.length;

    //     // Optionally, calculate percentage score (if scores are out of 10)
    //     const percentageScore = (averageScore / 10) * 100;

    //     res.status(200).json({ scores, averageScore, percentageScore });
    // }
    catch (error) {
        console.error('Error scoring answers:', error.message);
        res.status(500).json({ error: error.message });
    }
};