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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const submitVideoResponses2 = async (req, res) => {
  const { resumeId, jobId, qId, email, userId } = JSON.parse(req.body.metadata);
  const questions = JSON.parse(req.body.questions);

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No video files uploaded." });
  }

  try {
    console.log(`Received ${req.files.length} files`);
    req.files.forEach((file, index) => {
      console.log(`File ${index + 1}:`, {
        fieldname: file.fieldname,
        originalname: file.originalname,
        encoding: file.encoding,
        mimetype: file.mimetype,
        size: file.size,
        destination: file.destination,
        filename: file.filename,
        path: file.path
      });
    });

    const validationResults = await Promise.all(req.files.map(async (file) => {
      const isValid = await isValidVideo(file.path);
      console.log(`File ${file.originalname} validation result: ${isValid}`);
      return { file, isValid };
    }));

    const validFiles = validationResults.filter(result => result.isValid).map(result => result.file);

    if (validFiles.length === 0) {
      const invalidFiles = validationResults.filter(result => !result.isValid).map(result => result.file.originalname);
      return res.status(400).json({ 
        message: "No valid video files uploaded.", 
        invalidFiles: invalidFiles 
      });
    }

    console.log(`Processing ${validFiles.length} valid files`);

    const transcriptions = await Promise.all(validFiles.map(processVideo));

    if (transcriptions.length !== questions.length) {
      return res.status(400).json({ message: "Mismatch between questions and responses." });
    }

    const scores = await analyzeResponses(questions, transcriptions);

    const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
    const averageScore = totalScore / scores.length;
    const percentageScore = (averageScore / 10) * 100;

    const questionAnswerScore = new QuestionAnswerScore({
      resumeId,
      jobId,
      qId,
      scores,
      averageScore,
      percentageScore,
    });

    await questionAnswerScore.save();

    // Update Resume
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
      await sendEmailNotification(email, job.context, resume.candidateName, questions.length, averageScore, percentageScore);
    }

    // Create and emit notification
    const newNotification = new Notification({
      message: `${resume?.candidateName} Video Interview Screened`,
      recipientId: userId,
      resumeId: resumeId,
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

const processVideo = async (file) => {
  const videoPath = file.path;
  const audioPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.wav`);

  try {
    console.log(`Extracting audio from ${videoPath}`);
    await extractAudio(videoPath, audioPath);
    
    console.log(`Transcribing audio from ${audioPath}`);
    const transcription = await transcribeAudioWithHuggingFace(audioPath);
    
    await Promise.all([
      fs.unlink(videoPath),
      fs.unlink(audioPath)
    ]);

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
        console.error("FFmpeg stderr:", stderr);
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
  const prompt = `You are an expert interviewer. Evaluate the following questions and answers from a candidate interview. Provide a score out of 10 and brief feedback for each answer.

  ${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${transcriptions[i]}`).join("\n\n")}

  Format your response as follows:
  Q1: score - feedback
  Q2: score - feedback
  ...`;

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
  const lines = content.split('\n').filter(line => line.trim() !== '');
  return lines.map((line, index) => {
    const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
    if (match) {
      return {
        question: questions[index],
        answer: transcriptions[index],
        score: parseInt(match[2], 10),
        feedback: match[3].trim()
      };
    }
    console.error(`Failed to parse score for question ${index + 1}: ${line}`);
    return {
      question: questions[index],
      answer: transcriptions[index],
      score: 0,
      feedback: "Failed to parse score and feedback."
    };
  });
};

const isValidVideo = async (filePath) => {
  return new Promise((resolve) => {
    const command = `"${ffmpeg}" -v error -i "${filePath}" -f null -`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`FFmpeg validation error for ${filePath}:`, stderr);
        fs.stat(filePath, (err, stats) => {
          if (err) {
            console.error(`Error accessing file ${filePath}:`, err);
          } else {
            console.log(`File ${filePath} size: ${stats.size} bytes`);
          }
        });
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};

const sendEmailNotification = async (email, jobTitle, candidateName, questionsAnswered, averageScore, percentageScore) => {
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
      <h2 style="text-align: center; color: #4CAF50;">Candidate Video Interview Submission Received</h2>
      <p>Dear Hiring Manager,</p>
      <p>We have received a new video interview submission from a candidate for the ${jobTitle} position. Below are the details of the submission:</p>
      <p><strong>Submission Details:</strong></p>
      <ul>
        <li><strong>Job Title:</strong> ${jobTitle}</li>
        <li><strong>Candidate Name:</strong> ${candidateName}</li>
        <li><strong>Questions Answered:</strong> ${questionsAnswered}</li>
        <li><strong>Average Score:</strong> ${averageScore.toFixed(2)}</li>
        <li><strong>Percentage Score:</strong> ${percentageScore.toFixed(2)}%</li>
      </ul>
      <p>Please review the candidate's video responses and proceed with the next steps as necessary.</p>
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
};