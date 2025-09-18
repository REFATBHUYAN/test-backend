


import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Job from "../model/JobDescriptionModel.js"; // Import your Job model
import Resume from "../model/resumeModel.js"; // Import your Resume model

dotenv.config();

export const generateTenQuestion323 = async (req, res) => {
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

    const prompt = PromptTemplate.fromTemplate(`
      You are an experienced technical recruiter specializing in personality mapping and behavioral interviews. Your task is to generate 10 unique and insightful questions for a candidate applying for a specific job. These questions should help assess the candidate's personality traits, problem-solving skills, and cultural fit.
      
      Context:
      1. Job Description: {jobDescription}
      2. Candidate's Resume: {resume}
      
      Instructions:
      1. Analyze the job description and resume thoroughly.
      2. Generate 10 diverse questions that cover different aspects of personality mapping, including but not limited to:
         - Problem-solving and creativity
         - Leadership and teamwork
         - Adaptability and learning agility
         - Communication skills
         - Work ethic and motivation
         - Emotional intelligence
         - Cultural fit
         - Career goals and aspirations
      
      3. Ensure each question is unique and tailored to the specific job and candidate's background.
      4. Avoid generic questions that could apply to any job or candidate.
      5. Format your response as a numbered list of questions.
      
      Example question types (do not use these exact questions):
      - Describe a situation where you had to think outside the box to solve a problem.
      - How do you approach learning new technologies or methodologies in your field?
      - Tell me about a time when you had to lead a team through a challenging project.
      - How do you handle conflicting priorities or deadlines?
      
      Remember, the goal is to gain deep insights into the candidate's personality, work style, and potential fit for the role and company culture.
      
      {formatting_instructions}
      
      Generated Questions:
      `)

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
