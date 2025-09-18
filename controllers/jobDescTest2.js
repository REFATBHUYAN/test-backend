// Import necessary modules and dependencies

import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

import nodemailer from "nodemailer";

import mammoth from "mammoth";
import { v2 as cloudinary } from "cloudinary";

// Configure environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create a transporter object using SMTP transport for sending emails
const transporter = nodemailer.createTransport({
  service: "gmail", // Replace with your email service provider if different
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app password
  },
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

const skillsAnalysisSchema = z.array(z.string().describe("Matched skill"));
const notMatchedSkillsAnalysisSchema = z.array(
  z.string().describe("Not matched skill")
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

// The updated controller
export const scoreSingleResumeMultipleJobs = async (req, res) => {
  // Extract the uploaded file and other required fields from the request
  const uploadedFile = req.file; // Assuming single file upload using middleware like multer
  let {
    jobDescs, // Array of job descriptions
    companyName,
    companyId,
  } = req.body;
  
  const matchedResults = [];

  // Input Validation
  if (!uploadedFile) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  if (!Array.isArray(jobDescs)) {
    jobDescs = [jobDescs];
  }
  const parsedJobs = jobDescs?.map((job) => JSON.parse(job));

  if (!jobDescs || jobDescs.length === 0) {
    return res.status(400).json({ message: "No job descriptions provided" });
  }

  // console.log( "job description array ", jobDescs[0])
  // console.log( "job description array ", jobDescs[1])

  // Initialize OpenAI model
  const model = new OpenAI({
    modelName: "gpt-4.1", // Ensure this matches your existing setup
    // modelName: "gpt-3.5-turbo",
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
  // const prompt = PromptTemplate.fromTemplate(
  //   `You are a technical recruiter capable of analyzing a resume with a job description and providing a matching score in JSON format. Don't write a single word except the JSON object.

  //   format_instructions: {formatting_instructions}
  //   resume: {resume}
  //   job description: {jobDesc}
  //   matching score:`
  // );

  try {
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

    // Optionally, extract LinkedIn link from resume content
    // const linkedInRegex = /https?:\/\/(www\.)?linkedin\.com\/[a-zA-Z0-9\-/]+/gi;
    // const linkedinLink = resumeContent.match(linkedInRegex)
    //   ? resumeContent.match(linkedInRegex)[0]
    //   : null;

    // Clean up the uploaded file from the server
    await fs.promises.unlink(uploadedFile.path);

    // Process each job description concurrently
    await Promise.all(
      parsedJobs?.map(async (jd, index) => {
        try {
          // console.log(`Job description single`, jd)
          const chain = prompt.pipe(model).pipe(parser);
          const result = await chain.invoke({
            resume: resumeContent,
            jobDesc: jd?.jobDescription,
            companyName: companyName,
            companyId: companyId,
            formatting_instructions: parser.getFormatInstructions(),
          });

          // Assign additional fields
          result.companyName = companyName;
          result.jobTitle = jd?.jobId;
          result.resumeLink = resumeLink;
          result.companyId = companyId;
          // result.linkedinLink = linkedinLink; // Uncomment if LinkedIn link is extracted
          // console.log("jobdescs id", jd?.jobId);
          // console.log("jobdescs description", jd?.jobDescription);

          // Save the result to the database
          // await Resume.create(result);

          // Aggregate the matched results
          matchedResults.push({
            index: index,
            jobDescription: jd.jobDescription,
            result: result,
          });
        } catch (error) {
          console.log(
            `Error processing job description at index ${index}:`,
            error.message
          );
          // Optionally, you can push error details to matchedResults or handle differently
        }
      })
    );

    // Respond with the matched results
    res.json({
      message: "Resume processed successfully against all job descriptions",
      result: matchedResults,
    });
  } catch (error) {
    console.error("Error processing resume:", error.message);
    return res.status(500).json({ error: "Error processing resume" });
  }
};
