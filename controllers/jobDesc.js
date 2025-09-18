import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import ResumeCVs from "../model/cv_resume.js";
dotenv.config();

export const jobDesc = async (req, res) => {
  let { jobDesc } = req.body;

//   console.log("job description type", typeof jobDesc);

  if (!Array.isArray(jobDesc)) {
    jobDesc = [jobDesc];
  }
//   console.log("job description type", typeof jobDesc);
//   console.log("job description", jobDesc.length);

  const resumeFile = req.file;

  if (!jobDesc) {
    return res.status(400).json({ message: "Please enter job description." });
  }

  if (!resumeFile) {
    return res.status(400).json({ message: "Please upload the file." });
  }

  // const jobDescriptions = JSON.parse(jobDesc);
  const matchResumes = [];

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
        .array(z.string().describe("Skills of the candidate "))
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
    linkedinLink: z.string().describe("linkedin link of the candidate"),
    forJobTitle: z.string().describe("Job title of the job Description"),
    matchingScoreDetails: matchingScoreDetailsSchema,
    analysis: analysisSchema,
  });

  const model = new OpenAI({
    modelName: "gpt-4.1",
    temperature: 0,
  });

  const parser = StructuredOutputParser.fromZodSchema(candidateSchema);

  try {
    await Promise.all(
      jobDesc.map(async (jd, index) => {
        try {
          const prompt = PromptTemplate.fromTemplate(
            `You are a technical Recruiter who is capable of analyzing resume with job description and provide a matching score in JSON object.Dont write a single word except json object.
                        format_instructions: {formatting_instructions}    
                        resume: {resume}
                        job description: {jobDesription}
                        
                        matching score:
                        `
          );
          const loader = new PDFLoader(resumeFile.path);
          const docs = await loader.load();
          const chain = prompt.pipe(model).pipe(parser);
          const result = await chain.invoke({
            resume: docs[0].pageContent,
            jobDesription: jd,
            formatting_instructions: parser.getFormatInstructions(),
          });

          const existingResume = await ResumeCVs.findOne({
            email: result.email,
            forJobTitle: result.forJobTitle,
            mobile: result.mobile,
          });

          if (existingResume) {
            // If resume already exists, skip creating a new one
            console.log(
              `Resume for ${result.email} with mobile number ${result.mobile} already exists.`
            );
          } else {
            // If resume doesn't exist, create a new one
            const newResume = await ResumeCVs.create(result);
            console.log(
              `New resume created for ${result.email} with mobile number ${result.mobile}.`
            );
          }

          matchResumes.push({
            index: index,
            result: result,
          });
        } catch (error) {
          console.log("error while mapping", error);
          throw new Error(error);
        }
      })
    );
    await fs.promises.unlink(resumeFile.path);
    return res.status(200).json({ result: matchResumes });
  } catch (error) {
    console.log("error -->", error);
    return res.status(500).json({ error: error.message });
  }
};
