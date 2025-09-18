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
import Candidate from "../../model/candidateModal.js";

dotenv.config();


const matchingScoreDetailsSchema2 = z.object({
  skillsMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Give score to candidate skills have"),
  experienceMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Give score according to candidate experience have"),
  educationMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Give score according to candidate Education have"),
  overallMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Overall score the resume"),
});

const skillsAnalysisSchema2 = z.array(
  z.string().describe("The top skills that candidate have")
);

const notMatchedSkillsAnalysisSchema2 = z.array(
  z
    .string()
    .describe("The skills that need to add in candidate skills for betterment")
);

const experienceAnalysisSchema2 = z.object({
  relevantExperience: z.string().describe("Description of relevant experience"),
  yearsOfExperience: z.string().describe("Years of experience"),
});

const educationAnalysisSchema2 = z.object({
  highestDegree: z.string().describe("Candidate's highest degree"),
  relevantCourses: z.array(z.string().describe("Relevant courses taken")),
});

const analysisSchema2 = z.object({
  skills: z.object({
    candidateSkills: z
      .array(z.string().describe("Skills of the candidate"))
      .describe("Skills mentioned by the candidate"),
    matched: skillsAnalysisSchema2,
    notMatched: notMatchedSkillsAnalysisSchema2,
  }),
  experience: experienceAnalysisSchema2,
  education: educationAnalysisSchema2,
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

const candidateSchema2 = z.object({
  candidateName: z.string().describe("Candidate's full name"),
  email: z.string().describe("Email of the candidate"),
  mobile: z
    .number()
    .describe("Mobile number of the candidate (without country code)"),
  companyName: z
    .string()
    .describe("Company name for which the candidate is applying"),
  linkedinLink: z.string().describe("LinkedIn link of the candidate"),
  matchingScoreDetails: matchingScoreDetailsSchema2,
  analysis: analysisSchema2,
});

// The updated controller for single resume and single job description
export const scoreSingleResume3 = async (req, res) => {
  try {
    // Extract the uploaded file and other required fields from the request
    
    const { companyName, companyId, resumeData, resumeLink } = req.body;
    console.log("resume data: " + resumeData);

    const resumeText = `
      Candidate Name: ${resumeData?.candidateName}
      Email: ${resumeData?.email}
      Mobile: ${resumeData?.mobile}

      Skills: ${resumeData?.skills.join(", ")}
      Experience: ${resumeData?.experience?.relevantExperience} (Years: ${
      resumeData?.experience?.yearsOfExperience
    })
      Education: ${
        resumeData?.education?.highestDegree
      } (${resumeData?.education?.relevantCourses.join(", ")})
      Projects: ${resumeData?.projects.join(", ")}
      Recommendation: ${resumeData?.recommendation}
    `;

    // Initialize OpenAI model
    const model = new OpenAI({
      modelName: "gpt-4.1", // Ensure this matches your existing setup
      temperature: 0,
    });

    const parser2 = StructuredOutputParser.fromZodSchema(candidateSchema2);

    const prompt2 = PromptTemplate.fromTemplate(
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

    

    const chain2 = prompt2.pipe(model).pipe(parser2);

    const result2 = await chain2.invoke({
      resume: resumeText,
      formatting_instructions: parser2.getFormatInstructions(),
    });

    // Assign additional fields
    result2.companyName = companyName;
    result2.resumeLink = resumeLink;
    result2.companyId = companyId;
    // result.linkedinLink = linkedinLink; // Uncomment if LinkedIn link is extracted

    // Save the result to the database
    await Candidate.create(result2);

    // Respond with the matched result
    res.json({
      message: "Resume processed successfully against the job description",
      result: result2,
    });
  } catch (error) {
    console.error("Error processing resume:", error.message);
    return res.status(500).json({ error: "Error processing resume" });
  }
};
