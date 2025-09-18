// Import necessary modules and dependencies
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import mammoth from "mammoth";

// Configure environment variables
dotenv.config();

// Define Zod Schemas for validating and structuring the data
const matchingScoreDetailsSchema = z.object({
    skillsMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(" score for skills"),
    experienceMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(" score for experience"),
    educationMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe(" score for education"),
    overallMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Overall resume score"),
  });
  
  const skillsAnalysisSchema = z.array(z.string().describe("Candidate skill"));
  const notMatchedSkillsAnalysisSchema = z.array(
    z.string().describe("Need skills to improve resume")
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
    companyName: z
      .string()
      .describe("Company name for which the candidate is applying"),
    linkedinLink: z.string().describe("LinkedIn link of the candidate"),
    matchingScoreDetails: matchingScoreDetailsSchema,
    analysis: analysisSchema,
  });

// The updated controller without job descriptions and cloudinary upload
export const scoreSingleResume = async (req, res) => {
  // Extract the uploaded file from the request
  const uploadedFile = req.file; // Assuming single file upload using middleware like multer
  const { companyName, companyId } = req.body;

  // Input Validation
  if (!uploadedFile) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // Initialize OpenAI model
  const model = new OpenAI({
    modelName: "gpt-4.1", // Ensure this matches your existing setup
    temperature: 0,
  });

  // Initialize parser with the defined Zod schema
  const parser = StructuredOutputParser.fromZodSchema(candidateSchema);

  // Define the prompt template (no job description included)
  const prompt = PromptTemplate.fromTemplate(
    `You are a technical recruiter capable of analyzing a resume. 
Please provide a matching score between 0 and 100 based on the following criteria: 
- Relevance of skills
- Years of relevant experience
- Education background
- Specific projects related to the candidate's experience.

Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.

format_instructions: {formatting_instructions}
resume: {resume}`
  );

  try {
    // Extract resume content based on file type (PDF or DOCX)
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

    // Process the resume content
    const chain = prompt.pipe(model).pipe(parser);
    const result = await chain.invoke({
      resume: resumeContent,
      formatting_instructions: parser.getFormatInstructions(),
    });

    // Add additional fields to the result
    result.companyName = companyName;
    result.companyId = companyId;

    // Respond with the result
    res.json({
      message: "Resume processed successfully",
      result: result,
    });
  } catch (error) {
    console.error("Error processing resume:", error.message);
    return res.status(500).json({ error: "Error processing resume" });
  }
};
