// import { PromptTemplate } from "@langchain/core/prompts";
// import { OpenAI } from "@langchain/openai";
// import dotenv from "dotenv";
// import { z } from "zod";
// import { StructuredOutputParser } from "langchain/output_parsers";
// import ResumeCVs from "../model/cv_resume.js";
// dotenv.config();

// export const jobDesc2 = async (req, res) => {
//   let { jobDesc, resumeData } = req.body;

//   // Parse resumeData from JSON string to object
//   try {
//     resumeData = JSON.parse(resumeData);
//   } catch (error) {
//     return res.status(400).json({ message: "Invalid resume data format." });
//   }

//   if (!Array.isArray(jobDesc)) {
//     jobDesc = [jobDesc];
//   }

//   if (!jobDesc) {
//     return res.status(400).json({ message: "Please enter job description." });
//   }

//   if (!resumeData) {
//     return res.status(400).json({ message: "Please provide resume data." });
//   }

//   const matchResumes = [];

//   const matchingScoreDetailsSchema = z.object({
//     skillsMatch: z
//       .number()
//       .int()
//       .min(0)
//       .max(100)
//       .describe("Match score for skills"),
//     experienceMatch: z
//       .number()
//       .int()
//       .min(0)
//       .max(100)
//       .describe("Match score for experience"),
//     educationMatch: z
//       .number()
//       .int()
//       .min(0)
//       .max(100)
//       .describe("Match score for education"),
//     overallMatch: z
//       .number()
//       .int()
//       .min(0)
//       .max(100)
//       .describe("Overall matching score"),
//   });

//   const analysisSchema = z.object({
//     skills: z.object({
//       candidateSkills: z
//         .array(z.string().describe("Skills of the candidate "))
//         .describe("Skills mentioned by the candidate"),
//       matched: z.array(z.string().describe("Matched skill")),
//       notMatched: z.array(z.string().describe("Not matched skill")),
//     }),
//     experience: z.object({
//       relevantExperience: z.string().describe("Description of relevant experience"),
//       yearsOfExperience: z.string().describe("Years of experience"),
//     }),
//     education: z.object({
//       highestDegree: z.string().describe("Candidate's highest degree"),
//       relevantCourses: z.array(z.string().describe("Relevant courses taken")),
//     }),
//     projects: z.array(z.string().describe("Projects of the candidate")),
//     recommendation: z.string().describe("Recommendation for the candidate."),
//     comments: z.string().describe("Comments on the candidate's profile."),
//     additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
//   });

//   const candidateSchema = z.object({
//     candidateName: z.string().describe("Candidate's full name"),
//     email: z.string().describe("Email of the candidate"),
//     mobile: z.number().describe("Mobile number of the candidate"),
//     forJobTitle: z.string().describe("Job title of the job Description"),
//     matchingScoreDetails: matchingScoreDetailsSchema,
//     analysis: analysisSchema,
//   });

//   const model = new OpenAI({
//     modelName: "gpt-4.1",
//     temperature: 0,
//   });

//   const parser = StructuredOutputParser.fromZodSchema(candidateSchema);

//   try {
//     await Promise.all(
//       jobDesc.map(async (jd, index) => {
//         try {
//           const prompt = PromptTemplate.fromTemplate(
//             `You are a technical recruiter capable of analyzing a resume with a job description and providing a matching score in JSON format. Do not write any other text except the JSON object.
//                         format_instructions: {formatting_instructions}    
//                         resume: {resume}
//                         job description: {jobDesription}
//                         `
//           );

//           const chain = prompt.pipe(model).pipe(parser);
//           const result = await chain.invoke({
//             resume: JSON.stringify(resumeData), // Passing resume data as string
//             jobDesription: jd,
//             formatting_instructions: parser.getFormatInstructions(),
//           });

//           const existingResume = await ResumeCVs.findOne({
//             email: result.email,
//             forJobTitle: result.forJobTitle,
//             mobile: result.mobile,
//           });

//           if (existingResume) {
//             console.log(`Resume for ${result.email} already exists.`);
//           } else {
//             const newResume = await ResumeCVs.create(result);
//             console.log(`New resume created for ${result.email}.`);
//           }

//           matchResumes.push({
//             index: index,
//             result: result,
//           });
//         } catch (error) {
//           console.log("Error while processing", error);
//           throw new Error(error);
//         }
//       })
//     );

//     return res.status(200).json({ result: matchResumes });
//   } catch (error) {
//     console.log("Error -->", error);
//     return res.status(500).json({ error: error.message });
//   }
// };


// second response

import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import ResumeCVs from "../model/cv_resume.js";
dotenv.config();

export const jobDesc2 = async (req, res) => {
  let { jobDesc, resumeData } = req.body;

  if (!Array.isArray(jobDesc)) {
    jobDesc = [jobDesc];
  }

  if (!jobDesc) {
    return res.status(400).json({ message: "Please provide a job description." });
  }

  if (!resumeData) {
    return res.status(400).json({ message: "Please provide resume data." });
  }

  const matchResumes = [];

  const matchingScoreDetailsSchema = z.object({
    skillsMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Match score for skills"),
    experienceMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Match score for experience"),
    educationMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Match score for education"),
    overallMatch: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Overall matching score"),
  });

  const skillsAnalysisSchema = z.array(z.string().describe("Candidate Skills that match with job description skills"));
//   const skillsAnalysisSchema = z.array(z.string().describe("Matched skill"));
  const notMatchedSkillsAnalysisSchema = z.array(
    z.string().describe("the skill that job description has but candidate don't have")
  );

  const experienceAnalysisSchema = z.object({
    relevantExperience: z
      .string()
      .describe("Description of relevant experience"),
    yearsOfExperience: z.string().describe("Years of experience"),
  });

  const educationAnalysisSchema = z.object({
    highestDegree: z.string().describe("Candidate's highest degree"),
    relevantCourses: z.array(z.string().describe("Relevant courses taken")),
  });

  const analysisSchema = z.object({
    skills: z.object({
      candidateSkills: z
        .array(z.string().describe("Skills of the candidate "))
        .describe("skills mentioned by the candidate"),
      matched: skillsAnalysisSchema,
      notMatched: notMatchedSkillsAnalysisSchema,
    }),
    experience: experienceAnalysisSchema,
    education: educationAnalysisSchema,
    projects: z
      .array(z.string().describe("Project of the candidate"))
      .describe("Projects mentioned by the candidate"),
    recommendation: z.string().describe("Recommendation for the candidate."),
    comments: z.string().describe("Comments on the candidate's profile."),
    additionalNotes: z
      .string()
      .optional()
      .describe("Additional notes about the candidate"),
  });

  const candidateSchema = z.object({
    candidateName: z.string().describe("Candidate's full name"),
    email: z.string().describe("email of the candidate"),
    mobile: z
      .string()
      .describe("mobile number of the candidate (without country code)"),
    forJobTitle: z.string().describe("Job title of the job Description"),
    matchingScoreDetails: matchingScoreDetailsSchema,
    analysis: analysisSchema,
  });

  const model = new OpenAI({
    modelName: "gpt-4.1",
    temperature: 0,
  });

  const parser = StructuredOutputParser.fromZodSchema(candidateSchema);

  try {
    // Convert resumeData from JSON to text for AI evaluation
    const resumeText = `
      Candidate Name: ${resumeData.candidateName}
      Email: ${resumeData.email}
      Mobile: ${resumeData.mobile}

      Skills: ${resumeData.skills.join(", ")}
      Experience: ${resumeData.experience.relevantExperience} (Years: ${resumeData.experience.yearsOfExperience})
      Education: ${resumeData.education.highestDegree} (${resumeData.education.relevantCourses.join(", ")})
      Projects: ${resumeData.projects.join(", ")}
      Recommendation: ${resumeData.recommendation}
    `;

    await Promise.all(
      jobDesc.map(async (jd, index) => {
        try {
          const prompt = PromptTemplate.fromTemplate(
            `You are a technical recruiter capable of analyzing a resume with a job description and providing a matching score in JSON format. Don't write a single word except the JSON object.
                        
                        format_instructions: {formatting_instructions}
                        resume: {resume}
                        job description: {jobDescription}
                        
                        matching score:
                        `
          );

          const chain = prompt.pipe(model).pipe(parser);
          const result = await chain.invoke({
            resume: resumeText,
            jobDescription: jd,
            formatting_instructions: parser.getFormatInstructions(),
          });

          const existingResume = await ResumeCVs.findOne({
            email: result.email,
            forJobTitle: result.forJobTitle,
            mobile: result.mobile,
          });

          if (existingResume) {
            console.log(
              `Resume for ${result.email} with mobile number ${result.mobile} already exists.`
            );
          } else {
            const newResume = await ResumeCVs.create(result);
            console.log(
              `New resume created for ${result.email} with mobile number ${result.mobile}.`
            );
          }

          matchResumes.push({
            index: index,
            result: result,
          });
        } catch (error) {
          console.log("Error while processing:", error);
          throw new Error(error);
        }
      })
    );

    return res.status(200).json({ result: matchResumes });
  } catch (error) {
    console.log("Error -->", error);
    return res.status(500).json({ error: error.message });
  }
};
