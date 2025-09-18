import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

dotenv.config();

export const generateTenQuestion2 = async (req, res) => {
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
        `You are an experienced technical recruiter that analyzes the job description and resume. Extract all the data from the resume including experience, education, skills, projects, and everything else. On the basis of your analysis, generate questions for the candidate who is applying for the job.

        Now, create questions to perform Personality Mapping for a candidate. Personality mapping is a process used to identify, visualize, and understand an individual's personality traits, behaviors, and characteristics. It involves creating a detailed representation or "map" of a person's personality, often by using various assessment tools and techniques. The goal of personality mapping is to provide a comprehensive overview of an individual's psychological profile, which can be useful for personal development, career planning, team building, and therapeutic purposes. 

        Ask OpenAI to generate these questions. 
        If it does not return anything reasonable – explain to OpenAI (in the prompt) what Personality Mapping means.

        Here are some example questions:
        - Tell me about a problem you solved in a unique and unusual way and what was the outcome.
        - Where has commitment set you apart in your peer group and in your professional life?
        - Please describe a time when you identified an area of development for yourself and what steps you took to learn these new skills?

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
