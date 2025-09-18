import { PromptTemplate } from "@langchain/core/prompts"
import { OpenAI } from "@langchain/openai"
import dotenv from "dotenv"
import { z } from "zod"
import { StructuredOutputParser } from "langchain/output_parsers"
import Job from "../../model/JobDescriptionModel.js"
import Resume from "../../model/resumeModel.js" // Your existing resume model

dotenv.config()

// Dynamic question generation controller
export const generateDynamicQuestions = async (req, res) => {
  const {
    jobId,
    resumeId,
    numberOfQuestions = 10,
    tailorToExperience = false,
    psychometric = false,
    jobSpecific = false,
    situational = false,
    personality = false,
  } = req.query

  if (!jobId) {
    return res.status(400).json({ message: "Please provide job ID." })
  }

  if (!resumeId) {
    return res.status(400).json({ message: "Please provide resume ID." })
  }

  // Check if at least one test type is selected
  const selectedTests = { psychometric, jobSpecific, situational, personality }
  const activeTests = Object.entries(selectedTests)
    .filter(([key, value]) => value === "true")
    .map(([key]) => key)

  if (activeTests.length === 0) {
    return res.status(400).json({ message: "Please select at least one test type." })
  }

  try {
    const job = await Job.findById(jobId)
    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    const resume = await Resume.findById(resumeId)
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0.3,
    })

    // Create dynamic prompt based on selected test types
    const testTypeDescriptions = {
      psychometric: "psychological traits, cognitive abilities, and behavioral patterns",
      jobSpecific: "technical skills, job-related competencies, and role-specific knowledge",
      situational: "problem-solving in work scenarios, decision-making, and situational judgment",
      personality: "personality traits, work style preferences, and cultural fit",
    }

    const selectedTestDescriptions = activeTests.map((test) => testTypeDescriptions[test]).join(", ")

    const experienceContext =
      tailorToExperience === "true"
        ? `
      IMPORTANT: Pay special attention to the candidate's work history and tailor questions to their specific past experiences. 
      For example, if they worked at a specific company like Johnson & Johnson, create situational questions relevant to that industry or company context.
      Reference their actual work experiences, projects, and companies in your questions where appropriate.
      `
        : ""

    const prompt = PromptTemplate.fromTemplate(`
      You are an experienced technical recruiter and assessment specialist. Your task is to generate ${numberOfQuestions} unique and insightful questions for a candidate applying for a specific job. 
      
      The questions should assess: ${selectedTestDescriptions}
      
      Context:
      1. Job Description: {jobDescription}
      2. Candidate's Resume: {resume}
      3. Selected Test Types: ${activeTests.join(", ")}
      4. Number of Questions: ${numberOfQuestions}
      
      ${experienceContext}
      
      Instructions:
      1. Analyze the job description and resume thoroughly.
      2. Generate ${numberOfQuestions} diverse questions that cover the selected test types:
         ${activeTests.includes("psychometric") ? "- Psychometric: Assess cognitive abilities, logical reasoning, and psychological traits" : ""}
         ${activeTests.includes("jobSpecific") ? "- Job-Specific: Focus on technical skills and role-specific competencies" : ""}
         ${activeTests.includes("situational") ? "- Situational: Present work scenarios requiring problem-solving and decision-making" : ""}
         ${activeTests.includes("personality") ? "- Personality: Explore personality traits, work style, and cultural fit" : ""}
      
      3. Ensure each question is unique and tailored to the specific job and candidate's background.
      4. Distribute questions evenly across selected test types.
      5. Make questions challenging but fair, appropriate for the role level.
      6. Avoid generic questions that could apply to any job or candidate.
      
      Question Guidelines by Type:
      - Psychometric: "Describe your approach to solving complex problems under pressure"
      - Job-Specific: "How would you implement [specific technology/process] in this role?"
      - Situational: "You're faced with [specific scenario], how do you handle it?"
      - Personality: "What motivates you most in your work environment?"
      
      {formatting_instructions}
      
      Generated Questions:
      `)

    const questionSchema = z.array(z.string().describe("Assessment question for the candidate"))

    const parser = StructuredOutputParser.fromZodSchema(questionSchema)

    const chain = prompt.pipe(model).pipe(parser)

    const result = await chain.invoke({
      resume: JSON.stringify(resume),
      jobDescription: job.markdown_description,
      formatting_instructions: parser.getFormatInstructions(),
    })

    return res.status(200).json({
      message: "Questions Generated Successfully",
      questions: result,
      testTypes: activeTests,
      numberOfQuestions: Number.parseInt(numberOfQuestions),
      tailorToExperience: tailorToExperience === "true",
    })
  } catch (error) {
    console.log("Error ->", error.message)
    return res.status(500).json({ error: error.message })
  }
}

// Updated original controller to maintain backward compatibility
export const generateTenQuestion3 = async (req, res) => {
  const { jobId, resumeId } = req.query

  if (!jobId) {
    return res.status(400).json({ message: "Please provide job ID." })
  }

  if (!resumeId) {
    return res.status(400).json({ message: "Please provide resume ID." })
  }

  try {
    const job = await Job.findById(jobId)
    if (!job) {
      return res.status(404).json({ message: "Job not found" })
    }

    const resume = await Resume.findById(resumeId)
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    })

    const prompt = PromptTemplate.fromTemplate(`
      You are an experienced technical recruiter specializing in personality mapping and behavioral interviews. Your task is to generate 10 unique and insightful questions for a candidate applying for a specific job. These questions should help assess the candidate's personality traits, problem-solving skills, and cultural fit.
      
      Context:
      1. Job Description: {jobDescription}
      2. Candidate's Resume: {resume}
      
      Instructions:
      1. Analyze the job description and resume thoroughly.
      2. Generate 10 diverse questions that cover different aspects of personality mapping, including but not limited to:
         - Problem-solving and creativity
         - Leadership and teamwork
         - Adaptability and learning agility
         - Communication skills
         - Work ethic and motivation
         - Emotional intelligence
         - Cultural fit
         - Career goals and aspirations
      
      3. Ensure each question is unique and tailored to the specific job and candidate's background.
      4. Avoid generic questions that could apply to any job or candidate.
      5. Format your response as a numbered list of questions.
      
      Example question types (do not use these exact questions):
      - Describe a situation where you had to think outside the box to solve a problem.
      - How do you approach learning new technologies or methodologies in your field?
      - Tell me about a time when you had to lead a team through a challenging project.
      - How do you handle conflicting priorities or deadlines?
      
      Remember, the goal is to gain deep insights into the candidate's personality, work style, and potential fit for the role and company culture.
      
      {formatting_instructions}
      
      Generated Questions:
      `)

    const questionSchema = z.array(z.string().describe("Question for the candidate"))

    const parser = StructuredOutputParser.fromZodSchema(questionSchema)

    const chain = prompt.pipe(model).pipe(parser)

    const result = await chain.invoke({
      resume: JSON.stringify(resume),
      jobDescription: job.markdown_description,
      formatting_instructions: parser.getFormatInstructions(),
    })

    return res.status(200).json({
      message: "Questions Generated Successfully",
      questions: result,
    })
  } catch (error) {
    console.log("Error ->", error.message)
    return res.status(500).json({ error: error.message })
  }
}

// Submit dynamic answers controller
export const submitDynamicAnswers = async (req, res) => {
  const { questions, answers, resumeId, jobId, email, userId, testTypes, numberOfQuestions, tailorToExperience } =
    req.body

  try {
    // Here you would save the answers to your database
    // This is a placeholder for your actual database logic

    console.log("Submitting dynamic answers:", {
      resumeId,
      jobId,
      testTypes,
      numberOfQuestions,
      tailorToExperience,
      answersCount: answers.length,
    })

    // Example database save logic (replace with your actual implementation)
    // const assessmentResult = await AssessmentResult.create({
    //   resumeId,
    //   jobId,
    //   questions,
    //   answers,
    //   testTypes,
    //   numberOfQuestions,
    //   tailorToExperience,
    //   submittedAt: new Date(),
    //   email,
    //   userId
    // });

    return res.status(200).json({
      message: "Dynamic assessment answers submitted successfully!",
      testTypes,
      numberOfQuestions,
    })
  } catch (error) {
    console.log("Error submitting dynamic answers ->", error.message)
    return res.status(500).json({ error: error.message })
  }
}
