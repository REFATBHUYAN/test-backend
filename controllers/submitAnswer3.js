import { OpenAI } from "@langchain/openai";
import mongoose from "mongoose";
import dotenv from "dotenv";
import QuestionAnswerScore from "../model/questionAnswerScoreModel.js"; // Import the new model

dotenv.config();

export const submitAnswer3 = async (req, res) => {
  const { answers, questions, resumeId, jobId, qId } = req.body;

  console.log("answers", answers);
  console.log("questions", questions);
  console.log("resumeId", resumeId);
  console.log("jobId", jobId);
  console.log("qId", qId);
  // console.log("email", email);

  if (!answers || !questions) {
    return res
      .status(400)
      .json({ message: "Questions and answers are required." });
  }

  try {
    // Check if a record with the same resumeId, jobId, and qId already exists
    const existingRecord = await QuestionAnswerScore.findOne({
      resumeId,
      jobId,
      qId,
    });

    if (existingRecord) {
      return res
        .status(409)
        .json({
          message:
            "A record with the same resumeId, jobId, and qId already exists.",
        });
    }

    // Create the AI model instance
    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    });

    const prompt = `You are an expert interviewer. I will provide you with a list of questions and answers given by a candidate. Please evaluate each answer and provide a score out of 10, along with a brief feedback comment.
    
        Questions and Answers:
        ${questions
          ?.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`)
          .join("\n\n")}
    
        Please provide the scores and feedback in the following format:
        Q1: score - feedback
        Q2: score - feedback
        ...
        `;

    const response = await model.call(prompt);

    // Split the response into lines
    const lines = response.split("\n").filter((line) => line.trim() !== "");

    // Initialize an array to store parsed scores
    const scores = [];

    // Process each line to extract question, score, and feedback
    lines.forEach((line, index) => {
      const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
      if (match) {
        const question = questions[index];
        const answer = answers[index];
        const score = parseInt(match[2], 10);
        const feedback = match[3].trim();
        scores.push({ question, answer, score, feedback });
      }
    });

    // Calculate the total score and average score
    const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
    const averageScore = totalScore / scores.length;

    // Optionally, calculate percentage score (if scores are out of 10)
    const percentageScore = (averageScore / 10) * 100;

    // Save all the data at once in the QuestionAnswerScore model
    const questionAnswerScore = new QuestionAnswerScore({
      resumeId: resumeId,
      jobId: jobId,
      qId: qId,
      scores: scores,
      averageScore: averageScore,
      percentageScore: percentageScore,
    });

    await questionAnswerScore.save();

    res
      .status(200)
      .json({
        scores,
        averageScore,
        percentageScore,
        message: "Answers submitted and evaluated successfully!",
      });
  } catch (error) {
    console.error("Error scoring answers:", error.message);
    res.status(500).json({ error: error.message });
  }
};
