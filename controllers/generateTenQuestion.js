import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

dotenv.config();

export const generateTenQuestion = async(req, res) => {
    const { jobDesc, resumeData } = req.body;

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
        Generate exactly 10 questions.
        format_instructions: {formatting_instructions}    
        resume: {resume}
        job description: {jobDescription}
        
        questions:
        `
    );

    const questionSchema = z.array(z.string().describe("Question for the candidate"));

    const parser = StructuredOutputParser.fromZodSchema(questionSchema);

    try {
        const chain = prompt.pipe(model).pipe(parser);

        const result = await chain.invoke({
            resume: JSON.stringify(resumeData),
            jobDescription: jobDesc,
            formatting_instructions: parser.getFormatInstructions()
        });

        return res.status(200).json({ message: "Questions Generated Successfully", questions: result });
        
    } catch (error) {
        console.log("Error ->", error.message);
        return res.status(500).json({ error: error.message });
    }
};
