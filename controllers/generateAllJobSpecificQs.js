import { PromptTemplate } from "@langchain/core/prompts";
import { OpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";
import Job from "../model/JobDescriptionModel.js"; // Import your Job model
import Resume from "../model/resumeModel.js"; // Import your Resume model

dotenv.config();

export const generateAllJobSpecificQs = async (req, res) => {
  const {
    jobId,
    resumeId,
    psychometric,
    jobSpecific,
    situational,
    personality,
    qAmount
  } = req.query;

  if (
    !jobId ||
    !resumeId ||
    (psychometric === undefined &&
      jobSpecific === undefined &&
      situational === undefined &&
      personality === undefined)
  ) {
    return res.status(400).json({ message: "Missing required parameters." });
  }

  // Validate qAmount
  const questionAmount = parseInt(qAmount, 10);
  if (isNaN(questionAmount) || questionAmount < 1) {
    return res.status(400).json({ message: "Invalid question amount provided." });
  }

  try {
    const job = await Job.findById(jobId);
    const resume = await Resume.findById(resumeId);

    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!resume) return res.status(404).json({ message: "Resume not found" });

    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    });

    // Define test types based on query parameters
    const testTypes = {
      psychometric: psychometric === "true",
      jobSpecific: jobSpecific === "true",
      situational: situational === "true",
      personality: personality === "true",
    };
    console.log("testTypes", testTypes);

    // Calculate question distribution based on test types and qAmount
    const questionCounts = calculateQuestionDistribution(testTypes, questionAmount);
    console.log("questionCounts", questionCounts); // Debugging statement

    const prompts = {
      psychometric: `
        As an expert in psychometric assessment, your task is to generate ${questionCounts.psychometric} unique and insightful questions that evaluate the candidate's personality traits, attitudes, and psychological attributes. These questions should be tailored to the specific job role and the candidate's background.
    
        Context:
        1. Job Description: {jobDescription}
        2. Candidate's Resume: {resume}
    
        Instructions:
        1. Analyze the job description and resume thoroughly.
        2. Generate ${questionCounts.psychometric} diverse questions that cover different aspects of psychometric assessment, including but not limited to:
           - Emotional intelligence
           - Decision-making style
           - Adaptability and resilience
           - Interpersonal skills
           - Work preferences and motivations
           - Values and ethics
           - Stress management
           - Leadership potential
        3. Ensure each question is unique and relevant to the specific job and candidate's background.
        4. Avoid generic questions that could apply to any job or candidate.
        5. Format your response as a numbered list of questions.
    
        Remember, the goal is to gain deep insights into the candidate's psychological profile and how it aligns with the job requirements and company culture.
    
        {formatting_instructions}
    
        Generated Psychometric Questions:
      `,

      jobSpecific: `
        As a seasoned technical recruiter, your task is to create ${questionCounts.jobSpecific} job-specific questions that evaluate the candidate's technical skills, knowledge, and experience directly related to the position. These questions should be challenging yet fair, focusing on how well the candidate's background matches the job requirements.
    
        Context:
        1. Job Description: {jobDescription}
        2. Candidate's Resume: {resume}
    
        Instructions:
        1. Thoroughly analyze the job description and the candidate's resume.
        2. Generate ${questionCounts.jobSpecific} diverse questions that assess specific competencies, experiences, and skills relevant to the job position, including but not limited to:
           - Technical knowledge and expertise
           - Relevant project experience
           - Problem-solving abilities in job-specific scenarios
           - Familiarity with industry-specific tools and methodologies
           - Understanding of best practices in the field
           - Ability to apply skills to real-world situations
        3. Tailor each question to the specific requirements of the job and the candidate's background.
        4. Ensure questions are technically challenging but answerable based on the expected expertise level.
        5. Format your response as a numbered list of questions.
    
        The goal is to accurately assess the candidate's technical fit for the role and their potential to contribute effectively.
    
        {formatting_instructions}
    
        Generated Job-Specific Questions:
      `,

      situational: `
        As a professional interviewer specializing in situational assessment, your task is to generate ${questionCounts.situational} situational questions that explore how the candidate would handle specific scenarios related to the job role. These questions should assess problem-solving abilities, decision-making processes, and interpersonal skills in hypothetical work situations.
    
        Context:
        1. Job Description: {jobDescription}
        2. Candidate's Resume: {resume}
    
        Instructions:
        1. Carefully review the job description and the candidate's resume.
        2. Generate ${questionCounts.situational} diverse situational questions that cover various aspects of the job role, including but not limited to:
           - Handling conflicts or disagreements
           - Managing priorities and deadlines
           - Dealing with ambiguity or unclear requirements
           - Collaborating with cross-functional teams
           - Addressing ethical dilemmas
           - Adapting to change or unexpected challenges
           - Leading projects or initiatives
           - Resolving customer or stakeholder issues
        3. Ensure each scenario is realistic and relevant to the specific job and industry.
        4. Tailor the situations to the level of responsibility expected in the role.
        5. Format your response as a numbered list of questions.
    
        The aim is to understand how the candidate approaches real-world challenges they might face in this position.
    
        {formatting_instructions}
    
        Generated Situational Questions:
      `,
      personality: `
        As a professional interviewer specializing in personality assessment, your task is to generate ${questionCounts.personality} personality questions that explore how the candidate would handle specific scenarios related to the job role. These questions should assess problem-solving abilities, decision-making processes, and interpersonal skills in hypothetical work situations.
    
        Context:
        1. Job Description: {jobDescription}
        2. Candidate's Resume: {resume}
    
        Instructions:
        1. Carefully review the job description and the candidate's resume.
        2. Generate ${questionCounts.personality} diverse personality questions that cover various aspects of the job role, including but not limited to:
           - Handling conflicts or disagreements
           - Managing priorities and deadlines
           - Dealing with ambiguity or unclear requirements
           - Collaborating with cross-functional teams
           - Addressing ethical dilemmas
           - Adapting to change or unexpected challenges
           - Leading projects or initiatives
           - Resolving customer or stakeholder issues
        3. Ensure each scenario is realistic and relevant to the specific job and industry.
        4. Tailor the situations to the level of responsibility expected in the role.
        5. Format your response as a numbered list of questions.
    
        The aim is to understand how the candidate approaches real-world challenges they might face in this position.
    
        {formatting_instructions}
    
        Generated Personality Questions:
      `,
    };

    const allQuestions = [];

    for (const [testType, isEnabled] of Object.entries(testTypes)) {
      if (isEnabled) {
        // Ensure that only enabled test types are processed
        const promptTemplate = PromptTemplate.fromTemplate(prompts[testType]);

        const questionSchema = z.array(
          z.string().describe("Question for the candidate")
        );

        const parser = StructuredOutputParser.fromZodSchema(questionSchema);
        const chain = promptTemplate.pipe(model).pipe(parser);

        const result = await chain.invoke({
          resume: JSON.stringify(resume),
          jobDescription: job.markdown_description,
          formatting_instructions: parser.getFormatInstructions(),
        });

        allQuestions.push(...result);
      }
    }

    console.log("all questions", allQuestions); // Debugging statement

    return res
      .status(200)
      .json({
        message: "Questions Generated Successfully",
        questions: allQuestions,
      });
  } catch (error) {
    console.error("Error ->", error.message);
    return res.status(500).json({ error: error.message });
  }
};

// Helper function to calculate question distribution based on selected test types and total questions
function calculateQuestionDistribution(testTypes, totalQuestions) {
  const selectedTypes = Object.keys(testTypes).filter((type) => testTypes[type]);
  const count = selectedTypes.length;
  const distribution = {
    psychometric: 0,
    jobSpecific: 0,
    situational: 0,
    personality: 0,
  };

  if (count === 0) {
    return distribution; // No test types selected
  }

  // Calculate base number of questions per type
  const baseQuestions = Math.floor(totalQuestions / count);
  const remainingQuestions = totalQuestions % count;

  // Distribute base questions equally
  selectedTypes.forEach((type) => {
    distribution[type] = baseQuestions;
  });

  // Distribute remaining questions, prioritizing jobSpecific
  if (remainingQuestions > 0) {
    if (testTypes.jobSpecific) {
      // If jobSpecific is selected, allocate all remaining to it
      distribution.jobSpecific += remainingQuestions;
    } else {
      // Otherwise, distribute remaining questions to other selected types
      for (let i = 0; i < remainingQuestions; i++) {
        distribution[selectedTypes[i % selectedTypes.length]] += 1;
      }
    }
  }

  return distribution;
}

// import { PromptTemplate } from "@langchain/core/prompts";
// import { OpenAI } from "@langchain/openai";
// import dotenv from "dotenv";
// import { z } from "zod";
// import { StructuredOutputParser } from "langchain/output_parsers";
// import Job from "../model/JobDescriptionModel.js"; // Import your Job model
// import Resume from "../model/resumeModel.js"; // Import your Resume model

// dotenv.config();

// export const generateAllJobSpecificQs = async (req, res) => {
//   const {
//     jobId,
//     resumeId,
//     psychometric,
//     jobSpecific,
//     situational,
//     personality,
//     qAmount
//   } = req.query;

//   if (
//     !jobId ||
//     !resumeId ||
//     (psychometric === undefined &&
//       jobSpecific === undefined &&
//       situational === undefined)
//   ) {
//     return res.status(400).json({ message: "Missing required parameters." });
//   }

//   try {
//     const job = await Job.findById(jobId);
//     const resume = await Resume.findById(resumeId);

//     if (!job) return res.status(404).json({ message: "Job not found" });
//     if (!resume) return res.status(404).json({ message: "Resume not found" });

//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     });

//     // Define test types based on query parameters
//     const testTypes = {
//       psychometric: psychometric === "true",
//       jobSpecific: jobSpecific === "true",
//       situational: situational === "true",
//       personality: personality === "true",
//     };
//     console.log("testTypes", testTypes);

//     // Calculate question distribution based on test types
//     const questionCounts = calculateQuestionDistribution(testTypes);
//     console.log("questionCounts", questionCounts); // Debugging statement

//     // const prompts = {
//     //   psychometric: `
//     //     You are an expert in psychometric assessment and are tasked with generating questions that evaluate the candidate's personality traits, attitudes, and psychological attributes. Using the provided job description and resume, your goal is to create insightful questions that reflect the candidate’s personal and professional attributes relevant to the role.

//     //     Your task is to generate ${questionCounts.psychometric} questions that focus on understanding the candidate’s behavior, decision-making style, and suitability for the company culture. The questions should be designed to uncover aspects of the candidate’s psychological profile and how they align with the job requirements.

//     //     Example questions might include:
//     //     - Describe a situation where you had to adapt your working style to fit a new team or company culture.
//     //     - How do you typically handle stress or challenging situations in the workplace?
//     //     - Can you provide an example of how your personal values align with the values of your previous employers?

//     //     Generate exactly ${questionCounts.psychometric} questions.

//     //     format_instructions: {formatting_instructions}
//     //     resume: {resume}
//     //     job_description: {jobDescription}

//     //     questions:
//     //   `,
//     //   jobSpecific: `
//     //     You are a seasoned recruiter with a deep understanding of the job requirements and the candidate’s qualifications. Based on the provided job description and resume, your task is to create questions that evaluate the candidate’s technical skills, knowledge, and experience directly related to the job.

//     //     Generate ${questionCounts.jobSpecific} questions that are tailored to assess specific competencies, experiences, and skills relevant to the job position. The questions should be challenging but fair, focusing on how well the candidate’s background matches the job requirements.

//     //     Example questions might include:
//     //     - Can you describe a complex project you worked on that is similar to the type of work required for this position?
//     //     - How have you applied specific technologies or methodologies mentioned in the job description in your past roles?
//     //     - Provide an example of a time when your skills directly contributed to achieving a significant goal or overcoming a challenge in a previous job.

//     //     Generate exactly ${questionCounts.jobSpecific} questions.

//     //     format_instructions: {formatting_instructions}
//     //     resume: {resume}
//     //     job_description: {jobDescription}

//     //     questions:
//     //   `,
//     //   situational: `
//     //     You are a professional interviewer focusing on understanding how the candidate would handle specific scenarios related to the job role. Based on the job description and resume, your goal is to generate questions that explore how the candidate might respond to various workplace situations.

//     //     Generate ${questionCounts.situational} situational questions that assess the candidate’s problem-solving abilities, decision-making process, and interpersonal skills in hypothetical scenarios relevant to the job. The questions should help uncover how the candidate approaches challenges and interacts with others in a work environment.

//     //     Example questions might include:
//     //     - How would you handle a situation where you have conflicting priorities and tight deadlines?
//     //     - Describe a time when you had to resolve a disagreement within your team. What approach did you take?
//     //     - If faced with a new project with unclear requirements, how would you go about clarifying the objectives and planning your approach?

//     //     Generate exactly ${questionCounts.situational} questions.

//     //     format_instructions: {formatting_instructions}
//     //     resume: {resume}
//     //     job_description: {jobDescription}

//     //     questions:
//     //   `,
//     // };

//     // Collect all generated questions

//     const prompts = {
//       psychometric: `
//         As an expert in psychometric assessment, your task is to generate ${questionCounts.psychometric} unique and insightful questions that evaluate the candidate's personality traits, attitudes, and psychological attributes. These questions should be tailored to the specific job role and the candidate's background.
    
//         Context:
//         1. Job Description: {jobDescription}
//         2. Candidate's Resume: {resume}
    
//         Instructions:
//         1. Analyze the job description and resume thoroughly.
//         2. Generate ${questionCounts.psychometric} diverse questions that cover different aspects of psychometric assessment, including but not limited to:
//            - Emotional intelligence
//            - Decision-making style
//            - Adaptability and resilience
//            - Interpersonal skills
//            - Work preferences and motivations
//            - Values and ethics
//            - Stress management
//            - Leadership potential
//         3. Ensure each question is unique and relevant to the specific job and candidate's background.
//         4. Avoid generic questions that could apply to any job or candidate.
//         5. Format your response as a numbered list of questions.
    
//         Remember, the goal is to gain deep insights into the candidate's psychological profile and how it aligns with the job requirements and company culture.
    
//         {formatting_instructions}
    
//         Generated Psychometric Questions:
//       `,

//       jobSpecific: `
//         As a seasoned technical recruiter, your task is to create ${questionCounts.jobSpecific} job-specific questions that evaluate the candidate's technical skills, knowledge, and experience directly related to the position. These questions should be challenging yet fair, focusing on how well the candidate's background matches the job requirements.
    
//         Context:
//         1. Job Description: {jobDescription}
//         2. Candidate's Resume: {resume}
    
//         Instructions:
//         1. Thoroughly analyze the job description and the candidate's resume.
//         2. Generate ${questionCounts.jobSpecific} diverse questions that assess specific competencies, experiences, and skills relevant to the job position, including but not limited to:
//            - Technical knowledge and expertise
//            - Relevant project experience
//            - Problem-solving abilities in job-specific scenarios
//            - Familiarity with industry-specific tools and methodologies
//            - Understanding of best practices in the field
//            - Ability to apply skills to real-world situations
//         3. Tailor each question to the specific requirements of the job and the candidate's background.
//         4. Ensure questions are technically challenging but answerable based on the expected expertise level.
//         5. Format your response as a numbered list of questions.
    
//         The goal is to accurately assess the candidate's technical fit for the role and their potential to contribute effectively.
    
//         {formatting_instructions}
    
//         Generated Job-Specific Questions:
//       `,

//       situational: `
//         As a professional interviewer specializing in situational assessment, your task is to generate ${questionCounts.situational} situational questions that explore how the candidate would handle specific scenarios related to the job role. These questions should assess problem-solving abilities, decision-making processes, and interpersonal skills in hypothetical work situations.
    
//         Context:
//         1. Job Description: {jobDescription}
//         2. Candidate's Resume: {resume}
    
//         Instructions:
//         1. Carefully review the job description and the candidate's resume.
//         2. Generate ${questionCounts.situational} diverse situational questions that cover various aspects of the job role, including but not limited to:
//            - Handling conflicts or disagreements
//            - Managing priorities and deadlines
//            - Dealing with ambiguity or unclear requirements
//            - Collaborating with cross-functional teams
//            - Addressing ethical dilemmas
//            - Adapting to change or unexpected challenges
//            - Leading projects or initiatives
//            - Resolving customer or stakeholder issues
//         3. Ensure each scenario is realistic and relevant to the specific job and industry.
//         4. Tailor the situations to the level of responsibility expected in the role.
//         5. Format your response as a numbered list of questions.
    
//         The aim is to understand how the candidate approaches real-world challenges they might face in this position.
    
//         {formatting_instructions}
    
//         Generated Situational Questions:
//       `,
//       personality: `
//         As a professional interviewer specializing in personality assessment, your task is to generate ${questionCounts.personality} personality questions that explore how the candidate would handle specific scenarios related to the job role. These questions should assess problem-solving abilities, decision-making processes, and interpersonal skills in hypothetical work situations.
    
//         Context:
//         1. Job Description: {jobDescription}
//         2. Candidate's Resume: {resume}
    
//         Instructions:
//         1. Carefully review the job description and the candidate's resume.
//         2. Generate ${questionCounts.personality} diverse personality questions that cover various aspects of the job role, including but not limited to:
//            - Handling conflicts or disagreements
//            - Managing priorities and deadlines
//            - Dealing with ambiguity or unclear requirements
//            - Collaborating with cross-functional teams
//            - Addressing ethical dilemmas
//            - Adapting to change or unexpected challenges
//            - Leading projects or initiatives
//            - Resolving customer or stakeholder issues
//         3. Ensure each scenario is realistic and relevant to the specific job and industry.
//         4. Tailor the situations to the level of responsibility expected in the role.
//         5. Format your response as a numbered list of questions.
    
//         The aim is to understand how the candidate approaches real-world challenges they might face in this position.
    
//         {formatting_instructions}
    
//         Generated Situational Questions:
//       `,
//     };

//     const allQuestions = [];

//     for (const [testType, isEnabled] of Object.entries(testTypes)) {
//       if (isEnabled) {
//         // Ensure that only enabled test types are processed
//         const promptTemplate = PromptTemplate.fromTemplate(prompts[testType]);

//         const questionSchema = z.array(
//           z.string().describe("Question for the candidate")
//         );

//         const parser = StructuredOutputParser.fromZodSchema(questionSchema);
//         const chain = promptTemplate.pipe(model).pipe(parser);

//         const result = await chain.invoke({
//           resume: JSON.stringify(resume),
//           jobDescription: job.markdown_description,
//           formatting_instructions: parser.getFormatInstructions(),
//         });

//         allQuestions.push(...result);
//       }
//     }

//     console.log("all questions", allQuestions); // Debugging statement

//     return res
//       .status(200)
//       .json({
//         message: "Questions Generated Successfully",
//         questions: allQuestions,
//       });
//   } catch (error) {
//     console.error("Error ->", error.message);
//     return res.status(500).json({ error: error.message });
//   }
// };

// // Helper function to calculate question distribution based on selected test types
// function calculateQuestionDistribution(testTypes) {
//   const count = Object.values(testTypes).filter(
//     (value) => value === true
//   ).length;
//   const distribution = {
//     psychometric: 0,
//     jobSpecific: 0,
//     situational: 0,
//     personality: 0,
//   };

//   if (count === 1) {
//     // Only one test type selected
//     const [selectedType] = Object.keys(testTypes).filter(
//       (type) => testTypes[type]
//     );
//     distribution[selectedType] = 10;
//   } else if (count === 2) {
//     // Two test types selected
//     const selectedTypes = Object.keys(testTypes).filter(
//       (type) => testTypes[type]
//     );
//     distribution[selectedTypes[0]] = 5;
//     distribution[selectedTypes[1]] = 5;
//   } else if (count === 3) {
//     const selectedTypes = Object.keys(testTypes).filter(
//       (type) => testTypes[type]
//     );
//     distribution[selectedTypes[0]] = 3;
//     distribution[selectedTypes[1]] = 4;
//     distribution[selectedTypes[2]] = 3;
//   } else if (count === 4) {
//     // All three test types selected
//     distribution.psychometric = 2;
//     distribution.jobSpecific = 4;
//     distribution.situational = 2;
//     distribution.personality = 2;
//   }

//   return distribution;
// }
