// import { PromptTemplate } from "@langchain/core/prompts";
// import { OpenAI } from "@langchain/openai";
// import dotenv from "dotenv";
// import { z } from "zod";
// import { StructuredOutputParser } from "langchain/output_parsers";
// import JobDescription from "../model/JobDescriptionModel.js"; // Import the model

// dotenv.config();

// export const generateCompanyJD = async (req, res) => {
//   const { context, company_name } = req.body;

//   if (!context) {
//     return res
//       .status(400)
//       .json({ message: "No context for job description provided." });
//   }

//   if (!company_name) {
//     return res.status(400).json({ message: "No company name provided." });
//   }

//   // Updated schema to include new fields from the prompt
//   const schema = z.object({
//     job_title: z.string().describe("The official title of the position"),
//     short_description: z.string().describe("Short description of the job"),
//     key_responsibilities: z
//       .array(z.string())
//       .describe("List of key responsibilities"),
//     qualifications: z.array(z.string()).describe("List of qualifications"),
//     experience_required: z
//       .array(z.string())
//       .describe("List of experience required"),
//     job_type: z
//       .string()
//       .describe("Type of job (e.g., full-time, part-time, contract)"),
//     location: z
//       .string()
//       .describe("Primary location of the role (physical or remote)"),
//     compensation: z
//       .string()
//       .describe("Details on salary or compensation information"),
//     other_relevant_details: z
//       .array(z.string())
//       .describe("List of other relevant details"),
//     // Add these new fields to the schema
//     topskills: z
//       .array(z.string())
//       .describe("Top 5 most important skills mentioned in the job description"),
//     topresponsibilityskills: z
//       .array(z.string())
//       .describe("Top 5 skills derived from the key responsibilities"),
//     topqualificationskills: z
//       .array(z.string())
//       .describe("Top 5 skills derived from the qualifications section"),
//   });

//   const model = new OpenAI({
//     modelName: "gpt-4.1",
//     temperature: 0,
//   });

//   try {
//     const parser = StructuredOutputParser.fromZodSchema(schema);

//     const prompt = PromptTemplate.fromTemplate(
//       `You are an intelligent assistant responsible for generating a legitimate and detailed job description based on the provided context. The job description you create should reflect a real, tangible job opportunity with clear and accurate information. It must include the following sections:
        
//             1. **Job Title**: The official title of the position.
//             2. **Short Description**: A brief and accurate summary of the role.
//             3. **Key Responsibilities**: A clear list of duties and tasks the employee will be responsible for.
//             4. **Qualifications**: A list of required skills, education, and certifications.
//             5. **Experience Required**: A list of necessary prior experience, including years and type of experience.
//             6. **Job Type**: Specify whether the role is full-time, part-time, contract, etc.
//             7. **Location**: The primary location of the role (physical or remote).
//             8. **Compensation**: Include details on whether the position is paid, and any relevant salary or compensation information (if available).
//             9. **Other Relevant Details**: Any additional information such as travel requirements, work conditions, or unique perks.
//             10. **Top Skills**: Extract the top 5 most important skills mentioned in the job description. Each skill should be limited to a maximum of two words.
//             11. **Top Responsibility Skills**: Extract the top 5 skills derived from the key responsibilities. Each skill should be limited to a maximum of two words.
//             12. **Top Qualification Skills**: Extract the top 5 skills derived from the qualifications section. Each skill should be limited to a maximum of two words.
        
//             Ensure that all the information is factual, clear, and professionally presented. The job description should reflect a legitimate hiring opportunity and comply with LinkedIn's job posting policies.
        
//             format_instructions: {formatting_instructions}    
//             context: {context}
            
//             Job Description:
//             `
//     );

//     const chain = prompt.pipe(model).pipe(parser);

//     const result = await chain.invoke({
//       context: context,
//       formatting_instructions: parser.getFormatInstructions(),
//     });

//     // Generate the markdown description
//     const markdownDescription = `
// # ${result.job_title}

// ## Short Description
// ${result.short_description}

// ## Key Responsibilities
// ${result.key_responsibilities?.map((item) => `- ${item}`).join("\n")}

// ## Qualifications
// ${result.qualifications?.map((item) => `- ${item}`).join("\n")}

// ## Experience Required
// ${result.experience_required?.map((item) => `- ${item}`).join("\n")}

// ## Job Type
// ${result.job_type}

// ## Location
// ${result.location}

// ## Compensation
// ${result.compensation}

// ## Other Relevant Details
// ${result.other_relevant_details?.map((item) => `- ${item}`).join("\n")}
//     `;

//     // Save the job description to the database
//     const jobDescription = new JobDescription({
//       context: context,
//       company_name: company_name,
//       short_description: result.short_description,
//       key_responsibilities: result.key_responsibilities,
//       qualifications: result.qualifications,
//       experience_required: result.experience_required,
//       other_relevant_details: result.other_relevant_details,
//       markdown_description: markdownDescription,
//       topskills: result.topskills, // Directly assign generated skills
//       topresponsibilityskills: result.topresponsibilityskills, // Directly assign generated skills
//       topqualificationskills: result.topqualificationskills, // Directly assign generated skills
//       status: "Open",
//       publish: false,
//     });

//     // await jobDescription.save();
//     console.log("Job description generated and saved:", jobDescription);

//     return res.status(200).json({
//       job_description: jobDescription,
//     });
//   } catch (error) {
//     console.error("Error in generating JD:", error);
//     return res
//       .status(500)
//       .json({ message: "Error in generating JD.", error: error.message });
//   }
// };

import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import JobDescription from "../model/JobDescriptionModel.js"; // Import the model

dotenv.config();

// Helper function to convert markdown to HTML
function convertMarkdownToHTML(markdown) {
  if (!markdown) return "";

  // Convert headers
  let html = markdown
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^### (.*$)/gm, "<h3>$1</h3>");

  // Convert lists
  html = html
    .replace(/^\s*- (.*$)/gm, "<li>$1</li>")
    .replace(/^\s*\* (.*$)/gm, "<li>$1</li>")
    .replace(/^\s*\d+\. (.*$)/gm, "<li>$1</li>");

  // Wrap lists
  html = html.replace(/<li>.*?<\/li>(\n<li>.*?<\/li>)*/gs, (match) => {
    if (match.includes("1. ")) {
      return `<ol>${match}</ol>`;
    }
    return `<ul>${match}</ul>`;
  });

  // Convert bold and italic
  html = html
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<em>$1</em>");

  // Convert links
  html = html.replace(/\[(.*?)\]$$(.*?)$$/g, '<a href="$2">$1</a>');

  // Convert paragraphs (must be done last)
  html = html
    .split("\n\n")
    .map((para) => {
      if (!para.trim()) return "";
      if (
        para.startsWith("<h") ||
        para.startsWith("<ul") ||
        para.startsWith("<ol")
      ) {
        return para;
      }
      return `<p>${para}</p>`;
    })
    .join("");

  return html;
}

export const generateCompanyJD = async (req, res) => {
  const { context, company_name } = req.body;

  if (!context) {
    return res
      .status(400)
      .json({ message: "No context for job description provided." });
  }

  if (!company_name) {
    return res.status(400).json({ message: "No company name provided." });
  }

  // Updated schema to include new fields from the prompt
  const schema = z.object({
    job_title: z.string().describe("The official title of the position"),
    short_description: z.string().describe("Short description of the job"),
    key_responsibilities: z
      .array(z.string())
      .describe("List of key responsibilities"),
    qualifications: z.array(z.string()).describe("List of qualifications"),
    experience_required: z
      .array(z.string())
      .describe("List of experience required"),
    job_type: z
      .string()
      .describe("Type of job (e.g., full-time, part-time, contract)"),
    location: z
      .string()
      .describe("Primary location of the role (physical or remote)"),
    compensation: z
      .string()
      .describe("Details on salary or compensation information"),
    other_relevant_details: z
      .array(z.string())
      .describe("List of other relevant details"),
    // Add these new fields to the schema
    topskills: z
      .array(z.string())
      .describe("Top 5 most important skills mentioned in the job description"),
    topresponsibilityskills: z
      .array(z.string())
      .describe("Top 5 skills derived from the key responsibilities"),
    topqualificationskills: z
      .array(z.string())
      .describe("Top 5 skills derived from the qualifications section"),
  });

  const model = new OpenAI({
    modelName: "gpt-4.1",
    temperature: 0,
  });

  try {
    const parser = StructuredOutputParser.fromZodSchema(schema);

    const prompt = PromptTemplate.fromTemplate(
      `You are an intelligent assistant responsible for generating a legitimate and detailed job description based on the provided context. The job description you create should reflect a real, tangible job opportunity with clear and accurate information. It must include the following sections:
        
            1. **Job Title**: The official title of the position.
            2. **Short Description**: A brief and accurate summary of the role.
            3. **Key Responsibilities**: A clear list of duties and tasks the employee will be responsible for.
            4. **Qualifications**: A list of required skills, education, and certifications.
            5. **Experience Required**: A list of necessary prior experience, including years and type of experience.
            6. **Job Type**: Specify whether the role is full-time, part-time, contract, etc.
            7. **Location**: The primary location of the role (physical or remote).
            8. **Compensation**: Include details on whether the position is paid, and any relevant salary or compensation information (if available).
            9. **Other Relevant Details**: Any additional information such as travel requirements, work conditions, or unique perks.
            10. **Top Skills**: Extract the top 5 most important skills mentioned in the job description. Each skill should be limited to a maximum of two words.
            11. **Top Responsibility Skills**: Extract the top 5 skills derived from the key responsibilities. Each skill should be limited to a maximum of two words.
            12. **Top Qualification Skills**: Extract the top 5 skills derived from the qualifications section. Each skill should be limited to a maximum of two words.
        
            Ensure that all the information is factual, clear, and professionally presented. The job description should reflect a legitimate hiring opportunity and comply with LinkedIn's job posting policies.
        
            format_instructions: {formatting_instructions}    
            context: {context}
            
            Job Description:
            `
    );

    const chain = prompt.pipe(model).pipe(parser);

    const result = await chain.invoke({
      context: context,
      formatting_instructions: parser.getFormatInstructions(),
    });

    // Generate the markdown description
    const markdownDescription = `
# ${result.job_title}

## Short Description
${result.short_description}

## Key Responsibilities
${result.key_responsibilities?.map((item) => `- ${item}`).join("\n")}

## Qualifications
${result.qualifications?.map((item) => `- ${item}`).join("\n")}

## Experience Required
${result.experience_required?.map((item) => `- ${item}`).join("\n")}

## Job Type
${result.job_type}

## Location
${result.location}

## Compensation
${result.compensation}

## Other Relevant Details
${result.other_relevant_details?.map((item) => `- ${item}`).join("\n")}
    `;

    // Convert markdown to HTML for rich text editor
    const htmlDescription = convertMarkdownToHTML(markdownDescription);

    // Save the job description to the database
    const jobDescription = new JobDescription({
      context: context,
      company_name: company_name,
      short_description: result.short_description,
      key_responsibilities: result.key_responsibilities,
      qualifications: result.qualifications,
      experience_required: result.experience_required,
      other_relevant_details: result.other_relevant_details,
      markdown_description: markdownDescription,
      html_description: htmlDescription, // Add HTML version
      topskills: result.topskills, // Directly assign generated skills
      topresponsibilityskills: result.topresponsibilityskills, // Directly assign generated skills
      topqualificationskills: result.topqualificationskills, // Directly assign generated skills
      status: "Open",
      publish: false,
    });

    // await jobDescription.save();
    console.log("Job description generated and saved:", jobDescription);

    return res.status(200).json({
      job_description: jobDescription,
    });
  } catch (error) {
    console.error("Error in generating JD:", error);
    return res
      .status(500)
      .json({ message: "Error in generating JD.", error: error.message });
  }
};


