import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Job from "../model/JobDescriptionModel.js"; // Import your Job model
import Resume from "../model/resumeModel.js"; // Import your Resume model

dotenv.config();

export const generateTenJobSpecificQs = async (req, res) => {
  const { jobId, resumeId } = req.query;

  if (!jobId) {
    return res.status(400).json({ message: "Please provide job ID." });
  }

  if (!resumeId) {
    return res.status(400).json({ message: "Please provide resume ID." });
  }

  try {
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    });

    // const prompt = PromptTemplate.fromTemplate(
    //   `You are an experienced technical recruiter analyzing the job description and resume. Extract all the data from the resume including experience, education, skills, projects, and other relevant information. Based on this analysis, generate 10 questions for the candidate applying for the job.

    //   The questions should focus on the candidate's experience, skills, and projects. The difficulty should be easy to medium.

    //   format_instructions: {formatting_instructions}
    //   resume: {resume}
    //   job_description: {jobDescription}

    //   questions:
    //   `
    // );
    const prompt = PromptTemplate.fromTemplate(
      `You are an experienced technical recruiter tasked with analyzing the job description and resume provided. Your goal is to extract comprehensive information from the resume, including experience, education, skills, projects, and other relevant details. 
    
      Based on this analysis, generate exactly 10 questions that are tailored to the candidate applying for the job. The questions should focus on the candidate’s experience, skills, and projects as described in their resume, and should be of easy to medium difficulty, reflecting the requirements and expectations outlined in the job description.
    
      Here are some example questions to guide your generation:
      - Describe a project from your resume that best demonstrates your skills and experience relevant to this job.
      - Can you provide an example of how you applied a specific skill mentioned in your resume to solve a problem at work?
      - Tell me about a time when your experience in a particular area helped you overcome a challenge in a previous role.
    
      Generate exactly 10 questions.
    
      format_instructions: {formatting_instructions}
      resume: {resume}
      job_description: {jobDescription}
      
      questions:
      `
    );

    const questionSchema = z.array(
      z.string().describe("Question for the candidate")
    );

    const parser = StructuredOutputParser.fromZodSchema(questionSchema);

    const chain = prompt.pipe(model).pipe(parser);

    const result = await chain.invoke({
      resume: JSON.stringify(resume),
      jobDescription: job.markdown_description,
      formatting_instructions: parser.getFormatInstructions(),
    });

    return res
      .status(200)
      .json({ message: "Questions Generated Successfully", questions: result });
  } catch (error) {
    console.log("Error ->", error.message);
    return res.status(500).json({ error: error.message });
  }
};
