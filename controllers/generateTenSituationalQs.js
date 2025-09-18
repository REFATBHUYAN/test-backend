import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Job from "../model/JobDescriptionModel.js"; // Import your Job model
import Resume from "../model/resumeModel.js"; // Import your Resume model

dotenv.config();

export const generateTenSituationalQs = async (req, res) => {
  const { jobId, resumeId } = req.query; // Or use req.query if you're using query parameters

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
    //   `You are an intelligent assistant tasked with creating a situational-based psychometric test based on the given job description and resume.
    //         The test should include situational-based questions that evaluate how the candidate might respond to specific work-related scenarios.
    //         Provide a set of 10 situational-based questions along with the format and instructions for the candidate to complete the test.
    //         The difficulty level of the questions should be based on the experience and skills mentioned in the job description and the resume.
            
    //         format_instructions: {formatting_instructions}    
    //         job_description: {jobDescription}
    //         resume: {resume}
            
    //         Situational-Based Psychometric Test in markdown:
    //         `
    // );
    const prompt = PromptTemplate.fromTemplate(
      `You are an experienced technical recruiter tasked with creating a situational-based psychometric test based on the given job description and resume. Your goal is to generate questions that evaluate how the candidate might respond to specific work-related scenarios.
    
      Situational-based questions should assess the candidate's problem-solving skills, decision-making abilities, and adaptability in various situations related to the job. The questions should reflect the experience and skills mentioned in the job description and the resume. 
    
      Here are some example situational-based questions:
      - Describe a situation where you had to make a difficult decision under pressure. How did you handle it, and what was the outcome?
      - Can you provide an example of a time when you had to adapt to a significant change in your work environment? How did you manage the transition?
      - Tell me about a challenging project you worked on and the steps you took to ensure its success.
    
      Generate exactly 10 situational-based questions.
    
      format_instructions: {formatting_instructions}    
      job_description: {jobDescription}
      resume: {resume}
      
      Situational-Based Psychometric Test Questions in markdown:
      `
    );

    const questionSchema = z.array(
      z
        .string()
        .describe("Situational-based psychometric question for the candidate")
    );

    const parser = StructuredOutputParser.fromZodSchema(questionSchema);

    const chain = prompt.pipe(model).pipe(parser);

    const result = await chain.invoke({
      jobDescription: job.markdown_description,
      resume: JSON.stringify(resume),
      formatting_instructions: parser.getFormatInstructions(),
    });

    return res
      .status(200)
      .json({
        message:
          "Situational-Based Psychometric Test Questions Generated Successfully",
        questions: result,
      });
  } catch (error) {
    return res
      .status(500)
      .json({
        message: "Error in generating situational-based psychometric test.",
        error: error.message,
      });
  }
};
