import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
dotenv.config();

export const personalityTest = async (req, res) => {
    const { jd } = req.body;

    if (!jd) {
        return res.status(400).json({ message: "No context for job description provided." });
    }

    const schema = z.object({
        psychometric_test: z.string().describe("Psychometric test questions based on the job description in markdown")
    });

    const model = new OpenAI({
        modelName: "gpt-4.1",
        temperature: 0,
    });

    try {
        const parser = StructuredOutputParser.fromZodSchema(schema);

        // const prompt = PromptTemplate.fromTemplate(
        //     `You are an intelligent assistant tasked with creating a psychometric test based on a given job description in JSON object.
        //     The test should include questions that assess the candidate's personality, cognitive abilities, and suitability for the role.
        //     Provide a set of questions along with the format and instructions for the candidate to complete the test.
        //     format_instructions: {formatting_instructions}    
        //     job_description: {job_description}
            
        //     Psychometric Test in markdown:
        //     `
        // );

        const prompt = PromptTemplate.fromTemplate(
            `You are an intelligent assistant tasked with creating a psychometric test based on a given job description in JSON object.
            The test should include personality-based questions that evaluate how the candidate might respond to specific work-related scenarios.
            Provide a set of personality-based questions along with the format and instructions for the candidate to complete the test.
            Difficulty level should be based on the experienced mentioned in the job description
            format_instructions: {formatting_instructions}    
            job_description: {job_description}
            
            Personality-Based Psychometric Test in markdown:
            `
        );
        

        const chain = prompt.pipe(model).pipe(parser);

        const result = await chain.invoke({
            job_description: jd,
            formatting_instructions: parser.getFormatInstructions()
        });

        //console.log(result)

        return res.status(200).json(result); 

    } catch (error) {
        return res.status(500).json({ message: "Error in generating psychometric test.", error: error.message });
    }
};
