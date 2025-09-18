// Import necessary modules and dependencies
import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Resume from "../model/resumeModel.js"; // Ensure this model aligns with the candidateSchema
import mongoose from "mongoose";

dotenv.config();

// Define Zod Schemas for validating and structuring the data
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

const skillsAnalysisSchema = z.array(z.string().describe("The skills that candidate have is matched with the job description skills "));
const notMatchedSkillsAnalysisSchema = z.array(
  z.string().describe("tha skills that have in job description but not matched with candidate skills")
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
  recommendation: z.string().describe("Recommendation for the candidate and this is must need"),
  comments: z.string().describe("Comments on the candidate's profile. this is must need"),
  additionalNotes: z
    .string()
    .optional()
    .describe("Additional notes about the candidate and this is must need"),
});

const candidateSchema = z.object({
  candidateName: z.string().describe("Candidate's full name"),
  email: z.string().describe("Email of the candidate"),
  mobile: z
    .number()
    .describe("Mobile number of the candidate (without country code)"),
  jobTitle: z
    .string()
    .describe("Job title of the candidate who is applying for"),
  companyName: z
    .string()
    .describe("Company name for which the candidate is applying"),
  linkedinLink: z.string().describe("LinkedIn link of the candidate"),
  matchingScoreDetails: matchingScoreDetailsSchema,
  analysis: analysisSchema,
});

// Initialize OpenAI model
const model = new OpenAI({
  // modelName: "gpt-3.5-turbo", // Adjust if needed
  modelName: "gpt-4.1",
  temperature: 0,
});

// Initialize parser with the defined Zod schema
const parser = StructuredOutputParser.fromZodSchema(candidateSchema);

// The updated controller
export const jobDescTest = async (req, res) => {
  // Extract required fields from the request body
  let { jobDesc, resumeData, resumeLink, companyName, companyId } = req.body;

  // Ensure jobDesc is an array
  if (!Array.isArray(jobDesc)) {
    jobDesc = [jobDesc];
  }

  // Validate presence of job descriptions and resume data
  if (!jobDesc || jobDesc.length === 0) {
    return res.status(400).json({ message: "Please provide at least one job description." });
  }

  if (!resumeData) {
    return res.status(400).json({ message: "Please provide resume data." });
  }

  const matchResumes = [];

  try {
    // Convert resumeData from JSON to text for AI evaluation
    const resumeText = `
      Candidate Name: ${resumeData.candidateName}
      Email: ${resumeData.email}
      Mobile: ${resumeData.mobile}

      Skills: ${resumeData.skills.join(", ")}
      Experience: ${resumeData.experience.relevantExperience} (Years: ${
      resumeData.experience.yearsOfExperience
    })
      Education: ${
        resumeData.education.highestDegree
      } (${resumeData.education.relevantCourses.join(", ")})
      Projects: ${resumeData.projects.join(", ")}
      Recommendation: ${resumeData.recommendation}
    `;

    // Process each job description concurrently
    await Promise.all(
      jobDesc?.map(async (jd, index) => {
        try {
          // Define the prompt template
          const prompt = PromptTemplate.fromTemplate(
            `You are a technical recruiter capable of analyzing a resume with a job description and providing a matching score in JSON format. Don't write a single word except the JSON object.
            
            format_instructions: {formatting_instructions}
            resume: {resume}
            job description: {jobDescription}
            
            matching score:
            `
          );

          // Create the processing chain
          const chain = prompt.pipe(model).pipe(parser);

          // Invoke the chain with the necessary inputs
          const result = await chain.invoke({
            resume: resumeText,
            jobDescription: jd?.jobDescription,
            formatting_instructions: parser.getFormatInstructions(),
          });

          // Assign additional fields to the result
          result.companyName = companyName;
          result.jobTitle = jd?.jobId;
          result.resumeLink = resumeLink;
        //   result.companyId = new mongoose.Types.ObjectId(jd?.jobId);
          result.companyId = companyId;

          // Optionally, check for existing resume entries to prevent duplicates
          /*
          const existingResume = await Resume.findOne({
            email: result.email,
            jobTitle: result.jobTitle,
            mobile: result.mobile,
          });

          if (existingResume) {
            console.log(
              `Resume for ${result.email} with mobile number ${result.mobile} already exists for the job title ${result.jobTitle}.`
            );
          } else {
            await Resume.create(result);
          }
          */

          // Save the result to the database
          // await Resume.create(result);

          // Aggregate the matched results
          matchResumes.push({
            index: index,
            jobDescription: jd?.jobDescription,
            result: result,
          });
        } catch (error) {
          console.log(`Error processing job description at index ${index}:`, error.message);
          // Optionally, you can push error details to matchResumes or handle differently
          matchResumes.push({
            index: index,
            jobDescription: jd?.jobDescription,
            error: error.message,
          });
        }
      })
    );

    // Respond with the matched results
    return res.status(200).json({ result: matchResumes });
  } catch (error) {
    console.log("Error -->", error);
    return res.status(500).json({ error: error.message });
  }
};
