// import JobDescription from "../../model/JobDescriptionModel.js";
// import cloudinary from 'cloudinary'; // Assuming you have cloudinary configured

// // Configure cloudinary
// cloudinary.v2.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET
// });

// export const uploadSingleResumeForJob = async (req, res) => {
//   try {
//     // Find the job description by ID
//     const job = await JobDescription.findById(req.params.id);

//     // If job not found, return 404
//     if (!job) {
//       return res.status(404).send({ error: 'Job not found' });
//     }

//     // Upload the file to Cloudinary
//     const result = await cloudinary.v2.uploader.upload(req.file.path, {
//       folder: 'resumes', // Optional: folder in cloudinary to store resumes
//       resource_type: 'auto' // Handles all file types
//     });

//     // Push the Cloudinary URL into the resumes array in JobDescription
//     job.resumes.push(result.secure_url);

//     // Save the updated job description in the database
//     await job.save();

//     // Respond with success message and the new resume URL
//     res.json({ message: 'Resume uploaded successfully', resumeUrl: result.secure_url });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send({ error: 'Error uploading resume' });
//   }
// };



// Import necessary modules and dependencies
import express from "express";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import mammoth from "mammoth";
import { v2 as cloudinary } from "cloudinary";
import Resume from "../../model/resumeModel.js";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


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

const skillsAnalysisSchema = z.array(
  z.string().describe(
    "The skills that candidate have is matched with the job description skills"
  )
);
const notMatchedSkillsAnalysisSchema = z.array(
  z.string().describe(
    "The skills that have in job description but not matched with candidate skills"
  )
);

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
    candidateSkills: z
      .array(z.string().describe("Skills of the candidate"))
      .describe("Skills mentioned by the candidate"),
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

// The updated controller for single resume and single job description
export const scoreSingleResumeSingleJob = async (req, res) => {
  try {
    // Extract the uploaded file and other required fields from the request
    const uploadedFile = req.file; // Assuming single file upload using middleware like multer
    const {
      jobDesc,
      companyName,
      jobTitle,
      companyId,
    } = req.body;

    // Input Validation
    if (!uploadedFile) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!jobDesc || typeof jobDesc !== "string") {
      return res.status(400).json({ message: "Invalid or missing job description" });
    }

    if (!companyName || typeof companyName !== "string") {
      return res.status(400).json({ message: "Invalid or missing company name" });
    }

    if (!jobTitle || typeof jobTitle !== "string") {
      return res.status(400).json({ message: "Invalid or missing job title" });
    }

    // Initialize OpenAI model
    const model = new OpenAI({
      modelName: "gpt-4.1", // Ensure this matches your existing setup
      temperature: 0,
    });

    // Initialize parser with the defined Zod schema
    const parser = StructuredOutputParser.fromZodSchema(candidateSchema);

    // Define the prompt template
    const prompt = PromptTemplate.fromTemplate(
      `You are a technical recruiter capable of analyzing a resume with a job description. Please provide a matching score between 0 and 100 based on the following criteria: 
  - Relevance of skills
  - Years of relevant experience
  - Education background
  - Specific projects related to the job description.
  
  Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
  
  format_instructions: {formatting_instructions}    
            resume: {resume}
            job description: {jobDesc}
            matching score:
  `
    );

    // Upload the resume to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
      resource_type: "auto", // Automatically detect the file type (PDF or DOCX)
      folder: "resumes", // Optional folder in Cloudinary
    });

    const resumeLink = uploadResult.secure_url;

    // Extract resume content based on file type
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
      throw new Error(`No content found in file: ${uploadedFile.filename}`);
    }

    // Clean up the uploaded file from the server
    await fs.promises.unlink(uploadedFile.path);

    // Initialize the processing chain
    const chain = prompt.pipe(model).pipe(parser);

    // Invoke the chain with the resume and job description
    const result = await chain.invoke({
      resume: resumeContent,
      jobDesc: jobDesc,
      companyName: companyName,
      companyId: companyId,
      formatting_instructions: parser.getFormatInstructions(),
    });

    // Assign additional fields
    result.companyName = companyName;
    result.jobTitle = jobTitle;
    result.resumeLink = resumeLink;
    result.companyId = companyId;
    // result.linkedinLink = linkedinLink; // Uncomment if LinkedIn link is extracted

    // Save the result to the database
    await Resume.create(result);

    // Respond with the matched result
    res.json({
      message: "Resume processed successfully against the job description",
      result: result,
    });
  } catch (error) {
    console.error("Error processing resume:", error.message);
    return res.status(500).json({ error: "Error processing resume" });
  }
};
