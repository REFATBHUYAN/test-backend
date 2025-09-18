import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

dotenv.config();

export const generateQuestion2 = async(req, res) => {
    const { jobDesc, resumeData } = req.body; // Updated to get resumeData from the request body

    if (!jobDesc) {
        return res.status(400).json({ message: "Please enter job description." });
    }

    if (!resumeData) {
        return res.status(400).json({ message: "Please provide the resume data." });
    }

    const model = new OpenAI({
        modelName: "gpt-4.1",
        temperature: 0,
    });

    const prompt = PromptTemplate.fromTemplate(
        `You are an experienced technical recruiter that analyses the job description and resume. Extract all the data from the resume including experience, education, skills, projects, and everything else. On the basis of your analysis generate questions for the candidate who is applying for the job.
        Ask questions based on the projects, experience of the candidate, skills. Difficulty should be easy to medium.
        format_instructions: {formatting_instructions}    
        resume: {resume}
        job description: {jobDescription}
        
        questions:
        `
    );

    const questionSchema = z.object({
        projects: z.array(z.string().describe("Question based on the project")).describe("Questions based on the projects of the candidate"),
        experience: z.array(z.string().describe("Question based on the experience")).describe("Questions based on the experiences of the candidate"),
        skills: z.array(z.string().describe("Question based on the skills")).describe("Questions based on the skills of the candidate")
    });

    const parser = StructuredOutputParser.fromZodSchema(questionSchema);

    try {
        const chain = prompt.pipe(model).pipe(parser);

        const result = await chain.invoke({
            resume: JSON.stringify(resumeData), // Pass resume data as string
            jobDescription: jobDesc,
            formatting_instructions: parser.getFormatInstructions()
        });

        return res.status(200).json({ message: "Question Generated Successfully", question: result });
        
    } catch (error) {
        console.log("Error ->", error.message);
        return res.status(500).json({ error: error.message });
    }
};
