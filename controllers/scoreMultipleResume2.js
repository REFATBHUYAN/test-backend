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
import { io } from "../index.js";

dotenv.config();

export const scoreMultipleResume2 = async (req, res) => {
  const uploadedFiles = req.files;
  const { jobDesc, companyName, jobTitle, additionalInstructions } = req.body;
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
    matchingScoreDetails: matchingScoreDetailsSchema,
    analysis: analysisSchema,
  });

  try {
    const model = new OpenAI({
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
          const loader = new PDFLoader(uploadedFile.path);
          const docs = await loader.load();

          // Check if docs array is not empty
          if (!docs || docs.length === 0) {
            throw new Error(
              `Failed to load content from PDF: ${uploadedFile.filename}`
            );
          }

          const resumeContent = docs[0].pageContent;

          // Check if resumeContent is defined
          if (!resumeContent) {
            throw new Error(
              `No content found in PDF: ${uploadedFile.filename}`
            );
          }

          const chain = prompt.pipe(model).pipe(parser);
          const result = await chain.invoke({
            resume: docs[0].pageContent,
            jobDesc: jobDesc,
            additionalInstructions: additionalInstructions,
            companyName: companyName,
            formatting_instructions: parser.getFormatInstructions(),
          });

          result.companyName = companyName;
          result.jobTitle = jobTitle;

          // Save or update the resume in your database
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

          // Emit progress after each resume is processed
          io.emit("progress", {
            completed: index + 1,
            total: totalResumes,
          });
        } catch (error) {
          // Changed line: log the error and continue processing other resumes
          console.log(`Error processing file: ${uploadedFile.filename}`, error.message);
          // Skip the error and continue with the next file
        }
      })
    );

    res.json({
      message: "Files uploaded successfully",
      result: matchedResumes,
    });
  } catch (error) {
    // Changed line: log the error and send an error response
    console.error("Error processing resumes:", error.message);
    return res.status(500).json({ error: "Error processing resumes" });
  }
};
