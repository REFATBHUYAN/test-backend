import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import QuestionAnswerScore from "../model/questionAnswerScoreModel.js"; // Import the new model
import Resume from "../model/resumeModel.js"; // Import Resume model
import JobDescription from "../model/JobDescriptionModel.js"; // Import JobDescription model
import nodemailer from "nodemailer"; // Import Nodemailer

dotenv.config();

export const submitAnswer4 = async (req, res) => {
  const { answers, questions, resumeId, jobId, qId, email } = req.body;

  console.log("answers", answers);
  console.log("questions", questions);
  console.log("resumeId", resumeId);
  console.log("jobId", jobId);
  console.log("qId", qId);
  console.log("email", email);

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
      return res.status(409).json({
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

    // Retrieve job title and candidate details
    const resume = await Resume.findById(resumeId);
    const job = await JobDescription.findById(jobId);

    if (resume && job) {
      const { candidateName, email: candidateEmail } = resume;
      const { context } = job;

      // Configure Nodemailer
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Submission Confirmation for ${context}`,
        html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
      <h2 style="text-align: center; color: #4CAF50;">Candidate Test Submission Received</h2>
      <p>Dear Hiring Manager,</p>
      <p>We have received a new submission from a candidate for the ${context} position. Below are the details of the submission:</p>
      <p><strong>Submission Details:</strong></p>
      <ul>
        <li><strong>Job Title:</strong> ${context}</li>
        <li><strong>Candidate Name:</strong> ${resume.candidateName}</li>
        <li><strong>Questions Answered:</strong> ${questions.length}</li>
        <li><strong>Average Score:</strong> ${averageScore.toFixed(2)}</li>
        <li><strong>Percentage Score:</strong> ${percentageScore.toFixed(
          2
        )}%</li>
      </ul>
      <p>Please review the candidate's responses and proceed with the next steps as necessary.</p>
      <p>Best regards,</p>
      <p>The Team</p>
    </div>
  `,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log("Notification email sent successfully!");
      } catch (error) {
        console.error("Error sending email:", error);
      }
    }

    res.status(200).json({
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
