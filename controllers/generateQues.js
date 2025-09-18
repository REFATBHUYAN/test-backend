import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { PromptTemplate } from "@langchain/core/prompts"
import { OpenAI } from "@langchain/openai";
import fs from "fs";
import dotenv from "dotenv"
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
dotenv.config();



export const generateQues = async(req,res) => {
    const {jobDesc} = req.body;

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
        `You are an experience technical recruiter that analyse the job description and resume , Extract all the data from the resume including experience , education , skills , projecs and everything else . On the basis of your analysis generate questions for the candidate who is applying for the job.
        Ask question on the basis on the projects , experience of the candidate , skills  difficulty should be easy to medium.
        format_instructions: {formatting_instructions}    
        resume: {resume}
        job description: {jobDesription}
        
        questions:
        `
    );

    const questionSchema = z.object({
        projects: z.array(z.string().describe("Question based on the project")).describe("Questions based on the projects of the candidate"),
        experience: z.array(z.string().describe("Question based on the experience")).describe("Questions based on the experiences of the candidate"),
        skills:  z.array(z.string().describe("Question based on the skills")).describe("Questions based on the skills of the candidate")
    })

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