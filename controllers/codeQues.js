import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts"
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv"
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
dotenv.config();



export const codeQues = async(req,res) => {
    console.log(req.body);
    const {jobDesc} = req.body;

    console.log(jobDesc);
    const resumeFile = req.file;

    if (!jobDesc) {
        return res.status(400).json({ message: "Please enter job description." });
    }

    if (!resumeFile) {
        return res.status(400).json({ message: "Please upload the file." });
    }



    const model = new OpenAI({
        modelName: "gpt-4.1",
        temperature: 0,
    })

    const prompt = PromptTemplate.fromTemplate(
        `You are an experienced technical recruiter who analyzes the job description and resume. Your task is to generate code snippets containing errors that need to be debugged. The goal is for the candidate to identify and fix the errors in the provided code snippets.

        The questions should be based on the candidate's projects, experience, and skills. The difficulty of the debugging tasks should range from easy to medium. Ensure the code snippets are aligned with the technologies and languages the candidate is familiar with.
  
        format_instructions: {formatting_instructions}    
        resume: {resume}
        job description: {jobDesription}
        
        questions:
        `
    );

    const questionSchema = z.object({
        question: z.array(
            z.object({
                codeSnippet: z.string().describe("Code snippet that needs to be debugged"),
                solution: z.string().describe("Solution to the codeSnippet error"),
            })
        ).describe("Code snippets question in the form of a codeSnippet and solution object"),
    });



    const parser = StructuredOutputParser.fromZodSchema(questionSchema);

    try {
        const loader = new PDFLoader(resumeFile.path);
        const docs = await loader.load();

        const resumeData = docs[0].pageContent;

        const chain = prompt.pipe(model).pipe(parser);

        const result = await chain.invoke({
            resume: resumeData,
            jobDesription: jobDesc,
            formatting_instructions: parser.getFormatInstructions()
        })

        await fs.promises.unlink(resumeFile.path);

        return res.status(200).json({message: "Question Generated Successfully" , question: result})
        
    } catch (error) {
        console.log("Error ->" , error.message);
        return res.status(500).json({ error: error.message });

    }






}