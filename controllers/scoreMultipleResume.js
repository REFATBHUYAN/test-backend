import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Resume from "../model/resumeModel.js";

dotenv.config();

export const scoreMultipleResume = async (req, res) => {
  const uploadedFiles = req.files;
  const { jobDesc, companyName, jobTitle, additionalInstructions } = req.body;
  const matchedResumes = [];
  console.log("additional instructions", additionalInstructions);

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  if (!jobDesc) {
    return res.status(400).json({ message: "No job description provided" });
  }

  const matchingScoreDetailsSchema = z.object({
    skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
    experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
    educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
    overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
  });

  const skillsAnalysisSchema = z.array(z.string().describe("Matched skill"));
  const notMatchedSkillsAnalysisSchema = z.array(z.string().describe("Not matched skill"));

  const experienceAnalysisSchema = z.object({
    relevantExperience: z.string().describe("Description of relevant experience"),
    yearsOfExperience: z.string().describe("Years of experience"),
  });

  const educationAnalysisSchema = z.object({
    highestDegree: z.string().describe("Candidate's highest degree"),
    relevantCourses: z.array(z.string().describe("Relevant courses taken")),
  });

  const analysisSchema = z.object({
    skills: z.object({
      candidateSkills: z.array(z.string().describe("Skills of the candidate")).describe("skills mentioned by the candidate"),
      matched: skillsAnalysisSchema,
      notMatched: notMatchedSkillsAnalysisSchema,
    }),
    experience: experienceAnalysisSchema,
    education: educationAnalysisSchema,
    projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
    recommendation: z.string().describe("Recommendation for the candidate."),
    comments: z.string().describe("Comments on the candidate's profile."),
    additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
  });

  const candidateSchema = z.object({
    candidateName: z.string().describe("Candidate's full name"),
    email: z.string().describe("email of the candidate"),
    mobile: z.number().describe("mobile number of the candidate (without country code)"),
    jobTitle: z.string().describe("Job title of the candidate who is applying for"),
    companyName: z.string().describe("Company name for which the candidate is applying"),
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
      uploadedFiles?.map(async (uploadedFile) => {
        try {
          console.log(uploadedFile);
          const loader = new PDFLoader(uploadedFile.path);
          const docs = await loader.load();
          console.log("resume content ---------");
          console.log(docs[0].pageContent);

          const chain = prompt.pipe(model).pipe(parser);
          const result = await chain.invoke({
            resume: docs[0].pageContent,
            jobDesc: jobDesc,
            additionalInstructions: additionalInstructions, // Added this line
            companyName: companyName,
            formatting_instructions: parser.getFormatInstructions(),
          });
          result.companyName = companyName;
          result.jobTitle = jobTitle;

          const existingResume = await Resume.findOne({
            email: result.email,
            mobile: result.mobile,
          });

          if (existingResume) {
            console.log(`Resume for ${result.email} with mobile number ${result.mobile} already exists.`);
          } else {
            const newResume = await Resume.create(result);
            console.log(`New resume created for ${result.email} with mobile number ${result.mobile}.`);
          }

          matchedResumes.push({
            file: uploadedFile.filename,
            result: result,
          });

          await fs.promises.unlink(uploadedFile.path);
        } catch (error) {
          console.log(`Error processing file: ${uploadedFile.filename}`, error);
          throw new Error(error);
        }
      })
    );

    res.json({ message: "Files uploaded successfully", result: matchedResumes });
  } catch (error) {
    console.log("error==", error);
    return res.status(500).json({ error: error.message });
  }
};
