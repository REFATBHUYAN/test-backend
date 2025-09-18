import express from "express";
import http from "http";
import { Server } from "socket.io";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Resume from "../model/resumeModel.js";
import nodemailer from "nodemailer"; // Import nodemailer
import { io } from "../index.js";
import mammoth from "mammoth";

dotenv.config();

// Create a transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  service: "gmail", // Replace with your email service provider
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app password
  },
});

export const scoreMultipleResume4 = async (req, res) => {
  const uploadedFiles = req.files;
  const { jobDesc, companyName, jobTitle, additionalInstructions, userEmail } =
    req.body;
  const matchedResumes = [];

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  if (!jobDesc) {
    return res.status(400).json({ message: "No job description provided" });
  }

  const totalResumes = uploadedFiles.length;

  const matchingScoreDetailsSchema = z.object({
    skillsMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Match score for skills"),
    experienceMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Match score for experience"),
    educationMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Match score for education"),
    overallMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Overall matching score"),
  });

  const skillsAnalysisSchema = z.array(z.string().describe("Matched skill"));
  const notMatchedSkillsAnalysisSchema = z.array(
    z.string().describe("Not matched skill")
  );

  const experienceAnalysisSchema = z.object({
    relevantExperience: z
      .string()
      .describe("Description of relevant experience"),
    yearsOfExperience: z.string().describe("Years of experience"),
  });

  const educationAnalysisSchema = z.object({
    highestDegree: z.string().describe("Candidate's highest degree"),
    relevantCourses: z.array(z.string().describe("Relevant courses taken")),
  });

  const analysisSchema = z.object({
    skills: z.object({
      candidateSkills: z
        .array(z.string().describe("Skills of the candidate"))
        .describe("skills mentioned by the candidate"),
      matched: skillsAnalysisSchema,
      notMatched: notMatchedSkillsAnalysisSchema,
    }),
    experience: experienceAnalysisSchema,
    education: educationAnalysisSchema,
    projects: z
      .array(z.string().describe("Project of the candidate"))
      .describe("Projects mentioned by the candidate"),
    recommendation: z.string().describe("Recommendation for the candidate."),
    comments: z.string().describe("Comments on the candidate's profile."),
    additionalNotes: z
      .string()
      .optional()
      .describe("Additional notes about the candidate"),
  });

  const candidateSchema = z.object({
    candidateName: z.string().describe("Candidate's full name"),
    email: z.string().describe("email of the candidate"),
    mobile: z
      .number()
      .describe("mobile number of the candidate (without country code)"),
    jobTitle: z
      .string()
      .describe("Job title of the candidate who is applying for"),
    companyName: z
      .string()
      .describe("Company name for which the candidate is applying"),
    linkedinLink: z.string().describe("linkedin link of the candidate"),
    matchingScoreDetails: matchingScoreDetailsSchema,
    analysis: analysisSchema,
  });

  try {
    const model = new OpenAI({
      // modelName: "gpt-3.5-turbo",
      modelName: "gpt-4.1",
      temperature: 0,
    });

    const parser = StructuredOutputParser.fromZodSchema(candidateSchema);

    const prompt = PromptTemplate.fromTemplate(
      `You are a technical Recruiter who is capable of analyzing resume with job description and provide a matching score in JSON object. Don't write a single word except JSON object.
            format_instructions: {formatting_instructions}    
            resume: {resume}
            job description: {jobDesc}
            additional instructions: {additionalInstructions}
            matching score:`
    );

    await Promise.all(
      uploadedFiles.map(async (uploadedFile, index) => {
        try {
          let resumeContent;
          if (uploadedFile.mimetype === "application/pdf") {
            const loader = new PDFLoader(uploadedFile.path);
            const docs = await loader.load();
            resumeContent = docs[0]?.pageContent;
          } else if (
            uploadedFile.mimetype ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            const { value } = await mammoth.extractRawText({
              path: uploadedFile.path,
            });
            resumeContent = value;
          }

          if (!resumeContent) {
            throw new Error(
              `No content found in file: ${uploadedFile.filename}`
            );
          }

          // Extract LinkedIn link if available
          // const linkedInRegex = /https?:\/\/(www\.)?linkedin\.com\/[a-zA-Z0-9\-/]+/gi;
          // const linkedinLink = resumeContent.match(linkedInRegex) ? resumeContent.match(linkedInRegex)[0] : null;

          const chain = prompt.pipe(model).pipe(parser);
          const result = await chain.invoke({
            resume: resumeContent,
            jobDesc: jobDesc,
            additionalInstructions: additionalInstructions,
            companyName: companyName,
            formatting_instructions: parser.getFormatInstructions(),
          });

          result.companyName = companyName;
          result.jobTitle = jobTitle;
          // result.linkedinLink = linkedinLink; // Store LinkedIn link

          const existingResume = await Resume.findOne({
            email: result.email,
            mobile: result.mobile,
          });

          if (existingResume) {
            console.log(
              `Resume for ${result.email} with mobile number ${result.mobile} already exists.`
            );
          } else {
            await Resume.create(result);
          }

          matchedResumes.push({
            file: uploadedFile.filename,
            result: result,
          });

          await fs.promises.unlink(uploadedFile.path);

          io.emit("progress", {
            completed: index + 1,
            total: totalResumes,
          });
        } catch (error) {
          console.log(
            `Error processing file: ${uploadedFile.filename}`,
            error.message
          );
        }
      })
    );

    if (userEmail) {
      // Send email notification to user
      const mailOptions = {
        from: process.env.EMAIL_USER, // Sender address
        to: userEmail, // List of recipients
        subject: "Resume Processing Complete",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
              <h2 style="text-align: center; color: #4CAF50;">Resume Processing Complete</h2>
              <p>Dear Recruiter,</p>
              <p>We are pleased to inform you that your resume has been successfully processed. You can now review the results of the analysis.</p>
              <p><strong>What to do next:</strong></p>
              <ol>
                  <li>Check the analysis results for detailed feedback on your resume.</li>
                  <li>If you have any questions or need further assistance, feel free to reply to company email.</li>
              </ol>
              <p style="text-align: center;">
                  <a href="https://bloomix2.netlify.app/main/pullcvs" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">View Results</a>
              </p>
              <p>Thank you for using our service!</p>
              <p>Best regards,</p>
              <p>Bloomix</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
    }

    res.json({
      message: "Files uploaded successfully",
      result: matchedResumes,
    });
  } catch (error) {
    console.error("Error processing resumes:", error.message);
    return res.status(500).json({ error: "Error processing resumes" });
  }
};
