import { HfInference } from '@huggingface/inference';
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import QuestionAnswerScore from '../../model/questionAnswerScoreModel.js';
import Resume from '../../model/resumeModel.js';
import JobDescription from '../../model/JobDescriptionModel.js';
import nodemailer from 'nodemailer';
import Notification from '../../model/NotificationModal.js';
import { io } from '../../index.js';

dotenv.config();

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const submitVideoResponses33 = async (req, res) => {
  const { resumeId, jobId, qId, email, userId } = JSON.parse(req.body.metadata);
  const questions = JSON.parse(req.body.questions);

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No video files uploaded." });
  }

  try {
    console.log(`Received ${req.files.length} files`);

    // Validate uploaded video files
    const validationResults = await Promise.all(
      req.files.map(async (file) => {
        const isValid = await isValidVideo(file.path);
        console.log(`File ${file.originalname} validation result: ${isValid}`);
        return { file, isValid };
      })
    );

    const validFiles = validationResults.filter(result => result.isValid).map(result => result.file);
    if (validFiles.length === 0) {
      const invalidFiles = validationResults
        .filter(result => !result.isValid)
        .map(result => result.file.originalname);
      return res.status(400).json({
        message: "No valid video files uploaded.",
        invalidFiles
      });
    }

    console.log(`Processing ${validFiles.length} valid files`);

    // Process videos and get transcriptions
    const transcriptions = await Promise.all(validFiles.map(processVideo));

    if (transcriptions.length !== questions.length) {
      return res.status(400).json({ message: "Mismatch between questions and responses." });
    }

    // Analyze responses using OpenAI
    const model = new OpenAI({
        modelName: "gpt-4.1",
        temperature: 0,
      });
  
      const prompt = `You are an expert interviewer. I will provide you with a list of questions and answers given by a candidate. Please evaluate each answer and provide a score out of 10, along with a brief feedback comment.
      
          Questions and Answers:
          ${questions
            ?.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${transcriptions[i]}`)
            .join("\n\n")}
      
          Please provide the scores and feedback in the following format:
          Q1: score - feedback
          Q2: score - feedback
          ...
          `;
  
        //   const response = await model.call(prompt);
        const response = await model.chat.completions.create({
            model: "gpt-4.1",
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
          });
          const content = response.choices[0].message.content;
          console.log("OpenAI response:", content);
  
      // Split the response into lines
      const lines = content.split("\n").filter((line) => line.trim() !== "");
  
      // Initialize an array to store parsed scores
      const scores = [];
  
      // Process each line to extract question, score, and feedback
      lines.forEach((line, index) => {
        const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
        if (match) {
          const question = questions[index];
          const answer = transcriptions[index];
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
  

    // Save QuestionAnswerScore in database
    const questionAnswerScore = new QuestionAnswerScore({
      resumeId,
      jobId,
      qId,
      scores,
      averageScore,
      percentageScore,
    });

    // await questionAnswerScore.save();
    console.log("questionAnswerScore", questionAnswerScore);

    // Update Resume with new scores
    const resume = await Resume.findById(resumeId);
    if (resume) {
      resume.questionAnswerScores.push({
        resumeId: questionAnswerScore.resumeId,
        jobId: questionAnswerScore.jobId,
        qId: questionAnswerScore.qId,
        scores: questionAnswerScore.scores,
        averageScore: questionAnswerScore.averageScore,
        percentageScore: questionAnswerScore.percentageScore,
      });
      resume.candidateStatus = "Aptitude Tests Assessed";
      await resume.save();
    }

    // Send email notification
    const job = await JobDescription.findById(jobId);
    if (resume && job) {
      await sendEmailNotification(
        email,
        job.context,
        resume.candidateName,
        questions.length,
        averageScore,
        percentageScore
      );
    }

    // Create and emit notification
    const newNotification = new Notification({
      message: `${resume?.candidateName} Video Interview Screened`,
      recipientId: userId,
      resumeId,
    });
    await newNotification.save();
    io.emit("newNotification", newNotification);

    res.status(200).json({
      scores,
      averageScore,
      percentageScore,
      message: "Video responses submitted and evaluated successfully!",
    });
  } catch (error) {
    console.error("Error processing video responses:", error);
    res.status(500).json({ error: error.message });
  }
};
export const submitVideoResponses3 = async (req, res) => {
  const { resumeId, jobId, qId, email, userId } = JSON.parse(req.body.metadata)
  const questions = JSON.parse(req.body.questions)

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No video files uploaded." })
  }

  try {
    console.log(`Received ${req.files.length} files`)

    // Validate uploaded video files
    const validationResults = await Promise.all(
      req.files.map(async (file) => {
        const isValid = await isValidVideo(file.path)
        console.log(`File ${file.originalname} validation result: ${isValid}`)
        return { file, isValid }
      }),
    )

    const validFiles = validationResults.filter((result) => result.isValid).map((result) => result.file)
    if (validFiles.length === 0) {
      const invalidFiles = validationResults
        .filter((result) => !result.isValid)
        .map((result) => result.file.originalname)
      return res.status(400).json({
        message: "No valid video files uploaded.",
        invalidFiles,
      })
    }

    console.log(`Processing ${validFiles.length} valid files`)

    // Process videos and get transcriptions
    const transcriptions = await Promise.all(validFiles.map(processVideo))

    if (transcriptions.length !== questions.length) {
      return res.status(400).json({ message: "Mismatch between questions and responses." })
    }

    // Analyze responses using OpenAI
    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    })

    const prompt = `You are an expert interviewer. I will provide you with a list of questions and answers given by a candidate. Please evaluate each answer and provide a score out of 10, along with a brief feedback comment.
      
          Questions and Answers:
          ${questions?.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${transcriptions[i]}`).join("\n\n")}
      
          Please provide the scores and feedback in the following format:
          Q1: score - feedback
          Q2: score - feedback
          ...
          `

    //   const response = await model.call(prompt);
    const response = await model.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    })
    const content = response.choices[0].message.content
    console.log("OpenAI response:", content)

    // Split the response into lines
    const lines = content.split("\n").filter((line) => line.trim() !== "")

    // Initialize an array to store parsed scores
    const scores = []

    // Process each line to extract question, score, and feedback
    lines.forEach((line, index) => {
      const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/)
      if (match) {
        const question = questions[index]
        const answer = transcriptions[index]
        const score = Number.parseInt(match[2], 10)
        const feedback = match[3].trim()
        scores.push({ question, answer, score, feedback })
      }
    })

    // Calculate the total score and average score
    const totalScore = scores.reduce((sum, item) => sum + item.score, 0)
    const averageScore = totalScore / scores.length

    // Optionally, calculate percentage score (if scores are out of 10)
    const percentageScore = (averageScore / 10) * 100

    // Determine recommendation based on score
    let recommendation = "Not Recommended"
    if (percentageScore >= 80) recommendation = "Highly Recommended"
    else if (percentageScore >= 70) recommendation = "Recommended"
    else if (percentageScore >= 60) recommendation = "Consider"

    // Create job-specific question result object for the new schema
    const jobSpecificResult = {
      jobId: jobId,
      qId: qId,
      questions: questions,
      answers: transcriptions, // Use transcriptions as answers
      scores: scores,
      testTypes: ["video"], // Mark this as a video test
      averageScore: averageScore,
      percentageScore: percentageScore,
      numberOfQuestions: questions.length,
      tailorToExperience: false, // Video interviews are typically not tailored
      aiEvaluation: {
        individualScores: scores.map((score, index) => ({
          questionIndex: index,
          questionText: score.question,
          answerText: score.answer,
          score: score.score,
          feedback: score.feedback,
        })),
        overallScore: averageScore,
        averageScore: averageScore,
        percentageScore: percentageScore,
        recommendation: recommendation,
        overallFeedback: "Video interview evaluation completed successfully",
        evaluatedAt: new Date(),
      },
      completedAt: new Date(),
    }

    // Update Resume with new job-specific question results
    const resume = await Resume.findById(resumeId)
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    // Initialize jobSpecificQuestionResults if it doesn't exist
    if (!resume.jobSpecificQuestionResults) {
      resume.jobSpecificQuestionResults = []
    }

    // Check if a record with the same resumeId, jobId, and qId already exists
    const existingRecord = resume.jobSpecificQuestionResults?.find(
      (result) => result.jobId.toString() === jobId && result.qId === qId,
    )

    if (existingRecord) {
      return res.status(409).json({
        message: "A video interview record with the same resumeId, jobId, and qId already exists.",
      })
    }

    // Add to resume's jobSpecificQuestionResults array
    resume.jobSpecificQuestionResults.push(jobSpecificResult)
    resume.candidateStatus = "Video Interview Assessed"

    // Add to jobStatus array if not already present
    if (!resume.jobStatus.includes("Video Interview Assessed")) {
      resume.jobStatus.push("Video Interview Assessed")
    }

    // Save with validation disabled for existing data to avoid potential validation errors
    await resume.save({ validateBeforeSave: false })

    // Send email notification
    const job = await JobDescription.findById(jobId)
    if (resume && job) {
      await sendEmailNotification(
        email,
        job.context,
        resume.candidateName,
        questions.length,
        averageScore,
        percentageScore,
      )
    }

    // Create and emit notification
    const newNotification = new Notification({
      message: `${resume?.candidateName} Video Interview Screened - Score: ${percentageScore.toFixed(1)}%`,
      recipientId: userId,
      resumeId,
    })
    await newNotification.save()
    io.emit("newNotification", newNotification)

    res.status(200).json({
      scores,
      averageScore,
      percentageScore,
      recommendation,
      message: "Video responses submitted and evaluated successfully!",
      aiEvaluation: jobSpecificResult.aiEvaluation,
    })
  } catch (error) {
    console.error("Error processing video responses:", error)
    res.status(500).json({ error: error.message })
  }
}

// Helper functions
const processVideo = async (file) => {
  const videoPath = file.path;
  const audioPath = path.join(
    path.dirname(videoPath),
    `${path.basename(videoPath, path.extname(videoPath))}.wav`
  );

  try {
    console.log(`Extracting audio from ${videoPath}`);
    await extractAudio(videoPath, audioPath);

    console.log(`Transcribing audio from ${audioPath}`);
    const transcription = await transcribeAudioWithHuggingFace(audioPath);

    await Promise.all([fs.unlink(videoPath), fs.unlink(audioPath)]);

    return transcription;
  } catch (error) {
    console.error(`Error processing video ${file.filename}:`, error);
    throw error;
  }
};

const extractAudio = (videoPath, audioPath) => {
  return new Promise((resolve, reject) => {
    const command = `"${ffmpeg}" -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Error extracting audio:", error);
        reject(new Error("Failed to extract audio from video."));
      } else {
        resolve();
      }
    });
  });
};

const transcribeAudioWithHuggingFace = async (audioPath) => {
  try {
    const audioBuffer = await fs.readFile(audioPath);
    const response = await hf.automaticSpeechRecognition({
      model: "openai/whisper-large-v3",
      data: audioBuffer,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Error in Hugging Face transcription:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

const analyzeResponses = async (questions, transcriptions) => {
  const prompt = `You are an expert interviewer. Evaluate the following questions and answers. Provide a score out of 10 and feedback.

${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${transcriptions[i]}`).join("\n\n")}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const content = response.choices[0].message.content;
    return parseScores(content, questions, transcriptions);
  } catch (error) {
    console.error("Error in OpenAI analysis:", error);
    throw new Error("Failed to analyze responses.");
  }
};

const parseScores = (content, questions, transcriptions) => {
//   const lines = content.split("\n").filter(line => line.trim() !== "");
const lines = content.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line, index) => {
    const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
    if (match) {
      return {
        question: questions[index],
        answer: transcriptions[index],
        score: parseInt(match[2], 10),
        feedback: match[3].trim(),
      };
    }
    console.error(`Failed to parse score for question ${index + 1}: ${line}`);
    return {
      question: questions[index],
      answer: transcriptions[index],
      score: 0,
      feedback: "Failed to parse score and feedback.",
    };
  });
};
// const parseScores = (content, questions, transcriptions) => {
//   const lines = content.split("\n").filter(line => line.trim() !== "");
//   return lines.map((line, index) => {
//     const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
//     if (match) {
//       return {
//         question: questions[index],
//         answer: transcriptions[index],
//         score: parseInt(match[2], 10),
//         feedback: match[3].trim(),
//       };
//     }
//     console.error(`Failed to parse score for question ${index + 1}: ${line}`);
//     return {
//       question: questions[index],
//       answer: transcriptions[index],
//       score: 0,
//       feedback: "Failed to parse score and feedback.",
//     };
//   });
// };

const isValidVideo = async (filePath) => {
  return new Promise((resolve) => {
    const command = `"${ffmpeg}" -v error -i "${filePath}" -f null -`;
    exec(command, (error) => resolve(!error));
  });
};

const sendEmailNotification = async (
  email,
  jobTitle,
  candidateName,
  questionsAnswered,
  averageScore,
  percentageScore
) => {
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
    subject: `Video Interview Submission Confirmation for ${jobTitle}`,
    html: `
      <h2>Candidate Video Interview Submission Received</h2>
      <p>Details:</p>
      <ul>
        <li><strong>Candidate:</strong> ${candidateName}</li>
        <li><strong>Job:</strong> ${jobTitle}</li>
        <li><strong>Questions Answered:</strong> ${questionsAnswered}</li>
        <li><strong>Average Score:</strong> ${averageScore.toFixed(2)}</li>
        <li><strong>Percentage:</strong> ${percentageScore.toFixed(2)}%</li>
      </ul>`,
  };

  return transporter.sendMail(mailOptions);
};
