import { PromptTemplate } from "@langchain/core/prompts"
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv"
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
dotenv.config();


export const generateJD = async (req,res) => {
    const {context} = req.body;

    if(!context){
        return res.status(400).json({message: "No context for job Description provided."})
    }

    const schema = z.object({
        job_description : z.string().describe("Job description for the for job specifications in markdown")
    })

    const model = new OpenAI({
        modelName: "gpt-4.1",
        temperature: 0,
    });

    try {

    const parser = StructuredOutputParser.fromZodSchema(schema);

    const prompt = PromptTemplate.fromTemplate(
        `You are a intelligent assistant who can generate job decription on the basis of context of one or two lines.
        Your job descriptions should cover key responsibilities, qualifications, skills, experience required, and any other relevant details for the role.
        format_instructions: {formatting_instructions}    
        context: {context}
        
        
        Job Description in markdown:
        `
    );

    const chain = prompt.pipe(model).pipe(parser)

    const result =await chain.invoke({
        context: context,
        formatting_instructions: parser.getFormatInstructions()
    })

    //console.log(result)

    return res.status(200).json({
        job_description: result
    });

    } catch (error) {
        return res.status(500).json({message: "Error in generating in JD.", error : error.message });
    }




}

