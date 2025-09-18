import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Job from "../model/JobDescriptionModel.js"; // Import your Job model
import Resume from "../model/resumeModel.js"; // Import your Resume model

dotenv.config();

export const generateTenPsychoQuestion = async (req, res) => {
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

    const prompt = PromptTemplate.fromTemplate(
      `You are an experienced technical recruiter that analyzes the job description and resume. Extract all the data from the resume including experience, education, skills, projects, and everything else. Based on your analysis, generate psychometric test questions for the candidate who is applying for the job.

      Psychometric tests are designed to measure candidates' suitability for a role based on the required personality characteristics and cognitive abilities. These tests help assess the candidates' fit for the job and the organization's culture.

      Generate exactly 10 psychometric test questions.

      Example questions:
      - How do you typically approach problem-solving?
      - Describe a time when you had to adapt to a significant change at work.
      - How do you prioritize your tasks when you have multiple deadlines?

      format_instructions: {formatting_instructions}
      resume: {resume}
      job_description: {jobDescription}

      questions:
      `
    );

    const questionSchema = z.array(
      z.string().describe("Psychometric test question for the candidate")
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
      .json({ message: "Psychometric Questions Generated Successfully", questions: result });
  } catch (error) {
    console.log("Error ->", error.message);
    return res.status(500).json({ error: error.message });
  }
};
