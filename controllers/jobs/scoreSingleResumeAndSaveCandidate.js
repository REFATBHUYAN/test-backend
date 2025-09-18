import { PDFLoader } from "langchain/document_loaders/fs/pdf"
import { PromptTemplate } from "@langchain/core/prompts"
import { OpenAI } from "@langchain/openai"
import fs from "fs"
import dotenv from "dotenv"
import { z } from "zod"
import { StructuredOutputParser } from "langchain/output_parsers"
import mammoth from "mammoth"
import { v2 as cloudinary } from "cloudinary"
import Resume from "../../model/resumeModel.js"
import Candidate from "../../model/candidateModal.js"
import JobDescription from "../../model/JobDescriptionModel.js"

dotenv.config()

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Define Zod Schemas for validating and structuring the data
const matchingScoreDetailsSchema = z.object({
  skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
  experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
  educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
  overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
})

const matchingScoreDetailsSchema2 = z.object({
  skillsMatch: z.number().int().min(0).max(100).describe("Give score to candidate skills have"),
  experienceMatch: z.number().int().min(0).max(100).describe("Give score according to candidate experience have"),
  educationMatch: z.number().int().min(0).max(100).describe("Give score according to candidate Education have"),
  overallMatch: z.number().int().min(0).max(100).describe("Overall score the resume"),
})

const skillsAnalysisSchema = z.array(
  z.string().describe("The skills that candidate have is matched with the job description skills"),
)

const skillsAnalysisSchema2 = z.array(z.string().describe("The top skills that candidate have"))

const notMatchedSkillsAnalysisSchema = z.array(
  z.string().describe("The skills that have in job description but not matched with candidate skills"),
)

const notMatchedSkillsAnalysisSchema2 = z.array(
  z.string().describe("The skills that need to add in candidate skills for betterment"),
)

const experienceAnalysisSchema = z.object({
  relevantExperience: z.string().describe("Description of relevant experience"),
  yearsOfExperience: z.string().describe("Years of experience"),
})

const experienceAnalysisSchema2 = z.object({
  relevantExperience: z.string().describe("Description of relevant experience"),
  yearsOfExperience: z.string().describe("Years of experience"),
})

const educationAnalysisSchema = z.object({
  highestDegree: z.string().describe("Candidate's highest degree"),
  relevantCourses: z.array(z.string().describe("Relevant courses taken")),
})

const educationAnalysisSchema2 = z.object({
  highestDegree: z.string().describe("Candidate's highest degree"),
  relevantCourses: z.array(z.string().describe("Relevant courses taken")),
})

const analysisSchema = z.object({
  skills: z.object({
    candidateSkills: z
      .array(z.string().describe("Skills of the candidate"))
      .describe("Skills mentioned by the candidate"),
    matched: skillsAnalysisSchema,
    notMatched: notMatchedSkillsAnalysisSchema,
  }),
  experience: experienceAnalysisSchema,
  education: educationAnalysisSchema,
  projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
  recommendation: z.string().describe("Recommendation for the candidate."),
  comments: z.string().describe("Comments on the candidate's profile."),
  additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
})

const analysisSchema2 = z.object({
  skills: z.object({
    candidateSkills: z
      .array(z.string().describe("Skills of the candidate"))
      .describe("Skills mentioned by the candidate"),
    matched: skillsAnalysisSchema2,
    notMatched: notMatchedSkillsAnalysisSchema2,
  }),
  experience: experienceAnalysisSchema2,
  education: educationAnalysisSchema2,
  projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
  recommendation: z.string().describe("Recommendation for the candidate."),
  comments: z.string().describe("Comments on the candidate's profile."),
  additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
})

const candidateSchema = z.object({
  candidateName: z.string().describe("Candidate's full name or 'Not found' if not present"),
  email: z.string().describe("Email of the candidate or 'Not found' if not present"),
  mobile: z.string().describe("Mobile number of the candidate with country code or 'Not provided' if not present"),
  jobTitle: z.string().describe("Job title of the candidate who is applying for"),
  companyName: z.string().describe("Company name for which the candidate is applying"),
  linkedinLink: z.string().describe("LinkedIn link of the candidate or 'Not found' if not present"),
  matchingScoreDetails: matchingScoreDetailsSchema,
  analysis: analysisSchema,
})

const candidateSchema2 = z.object({
  candidateName: z.string().describe("Candidate's full name or 'Not found' if not present"),
  email: z.string().describe("Email of the candidate or 'Not found' if not present"),
  mobile: z.string().describe("Mobile number of the candidate with country code or 'Not provided' if not present"),
  companyName: z.string().describe("Company name for which the candidate is applying"),
  linkedinLink: z.string().describe("LinkedIn link of the candidate or 'Not found' if not present"),
  matchingScoreDetails: matchingScoreDetailsSchema2,
  analysis: analysisSchema2,
})

// Helper function to process expectation answers with metadata
const processExpectationAnswers = async (expectationAnswers, jobTitle) => {
  try {
    // Get the job details to understand question types
    const jobDetails = await JobDescription.findById(jobTitle)
    if (!jobDetails || !jobDetails.expectationQuestions) {
      return { processedAnswers: {}, questionMetadata: [] }
    }

    const processedAnswers = {}
    const questionMetadata = []
    const questions = jobDetails.expectationQuestions

    Object.entries(expectationAnswers).forEach(([questionIndex, answer]) => {
      const question = questions[Number.parseInt(questionIndex)]

      if (!question) return

      // Handle different question formats (old string format vs new object format)
      let questionType = "text" // default
      let questionText = ""
      let questionOptions = []

      if (typeof question === "object") {
        questionType = question.type || "text"
        questionText = question.text || ""
        questionOptions = question.options || []
      } else {
        // Old format - treat as text question
        questionText = question
        questionType = "text"
      }

      // Process answer based on question type
      let processedAnswer = answer
      let selectedOption = ""

      switch (questionType) {
        case "option":
          // Yes/No questions - answer is boolean
          processedAnswer = answer === true ? "Yes" : answer === false ? "No" : answer
          selectedOption = processedAnswer
          break

        case "custom":
          // Multiple choice questions - answer is index, convert to actual option text
          if (typeof answer === "number" && questionOptions[answer]) {
            processedAnswer = questionOptions[answer]
            selectedOption = questionOptions[answer]
          }
          break

        case "text":
        default:
          // Text questions - keep as is
          processedAnswer = String(answer || "")
          selectedOption = processedAnswer
          break
      }

      // Store with question text as key for better readability
      const questionKey = `Q${Number.parseInt(questionIndex) + 1}: ${questionText}`
      processedAnswers[questionKey] = processedAnswer

      // Store metadata for better tracking
      questionMetadata.push({
        questionIndex: Number.parseInt(questionIndex),
        questionText: questionText,
        questionType: questionType,
        options: questionOptions,
        selectedOption: selectedOption,
        answerValue: answer,
      })
    })

    return { processedAnswers, questionMetadata }
  } catch (error) {
    console.error("Error processing expectation answers:", error)
    return { processedAnswers: {}, questionMetadata: [] }
  }
}

// Helper function to check if candidate should be disqualified
const checkDisqualification = async (expectationAnswers, jobTitle) => {
  try {
    const jobDetails = await JobDescription.findById(jobTitle)
    if (!jobDetails || !jobDetails.expectationQuestions) {
      return false
    }

    const questions = jobDetails.expectationQuestions

    for (const [questionIndex, answer] of Object.entries(expectationAnswers)) {
      const question = questions[Number.parseInt(questionIndex)]

      if (!question) continue

      // Handle different question formats
      if (typeof question === "object") {
        // Check for disqualifying answers
        if (question.type === "option" && answer === false) {
          // "No" answer to yes/no question is disqualifying
          return true
        } else if (
          question.type === "custom" &&
          question.disqualifyingOptions &&
          question.disqualifyingOptions.includes(answer)
        ) {
          // Selected a disqualifying option in multiple choice
          return true
        }
      }
    }

    return false
  } catch (error) {
    console.error("Error checking disqualification:", error)
    return false
  }
}

// The updated controller for single resume and single job description
export const scoreSingleResumeAndSaveCandidate = async (req, res) => {
  try {
    // Extract the uploaded file and other required fields from the request
    const uploadedFile = req.file
    const {
      jobDesc,
      companyName,
      jobTitle,
      companyId,
      checked,
      expectationAnswers,
      candidateEmail,
    } = req.body

    // Input Validation
    if (!uploadedFile) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    if (!jobDesc || typeof jobDesc !== "string") {
      return res.status(400).json({ message: "Invalid or missing job description" })
    }

    if (!companyName || typeof companyName !== "string") {
      return res.status(400).json({ message: "Invalid or missing company name" })
    }

    if (!jobTitle || typeof jobTitle !== "string") {
      return res.status(400).json({ message: "Invalid or missing job title" })
    }

    // Parse expectation answers if provided
    let parsedExpectationAnswers = {}
    if (expectationAnswers) {
      try {
        parsedExpectationAnswers = JSON.parse(expectationAnswers)
      } catch (error) {
        console.error("Error parsing expectation answers:", error)
        parsedExpectationAnswers = {}
      }
    }

    // Initialize OpenAI model
    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    })

    // Initialize parsers with the defined Zod schemas
    const parser = StructuredOutputParser.fromZodSchema(candidateSchema)
    const parser2 = StructuredOutputParser.fromZodSchema(candidateSchema2)

    // Single comprehensive prompt for candidate info extraction and scoring
    const prompt = PromptTemplate.fromTemplate(
      `You are a technical recruiter tasked with analyzing a resume. Your task is to:

      1. Extract the candidate's information accurately from the resume:
         - Full name
         - Email address
         - Mobile number (with country code, e.g., +1234567890)
         - LinkedIn URL (if present)
         If any information is not found, explicitly return 'Not found' for name, email, or LinkedIn, and 'Not provided' for mobile.
         For the mobile number, if no country code is present, infer the country from the resume content (e.g., address, location, or other context) and add the appropriate country code (e.g., +1 for US/Canada, +91 for India). If the country cannot be determined, then leave as it is.

      2. Provide a matching score between 0 and 100 based on the following criteria:
         - Relevance of skills
         - Years of relevant experience
         - Education background
         - Specific projects related to the job description.

      3. If no job description is provided (i.e., jobDesc is empty), provide a general evaluation of the resume based on:
         - Relevance of skills
         - Years of relevant experience
         - Education background
         - Specific projects related to the candidate's experience.

      Format the response as a JSON object including:
      - For job-specific scoring (when jobDesc is provided): candidateName, email, mobile, linkedinLink, jobTitle, companyName, matchingScoreDetails (with skillsMatch, experienceMatch, educationMatch, overallMatch), and analysis (with skills, experience, education, projects, recommendation, comments, additionalNotes).
      - For general scoring (when jobDesc is empty): candidateName, email, mobile, linkedinLink, companyName, matchingScoreDetails (with skillsMatch, experienceMatch, educationMatch, overallMatch), and analysis (with skills, experience, education, projects, recommendation, comments, additionalNotes).

      format_instructions: {formatting_instructions}    
      resume: {resume}
      job description: {jobDesc}
      company name: {companyName}
      job title: {jobTitle}
      matching score:
    `,
    )

    // Upload the resume to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
      resource_type: "auto",
      folder: "resumes",
    })

    const resumeLink = uploadResult.secure_url

    // Extract resume content based on file type
    let resumeContent
    if (uploadedFile.mimetype === "application/pdf") {
      const loader = new PDFLoader(uploadedFile.path)
      const docs = await loader.load()
      resumeContent = docs[0]?.pageContent
    } else if (uploadedFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const { value } = await mammoth.extractRawText({
        path: uploadedFile.path,
      })
      resumeContent = value
    }

    if (!resumeContent) {
      throw new Error(`No content found in file: ${uploadedFile.filename}`)
    }

    // Clean up the uploaded file from the server
    await fs.promises.unlink(uploadedFile.path)

    // Initialize the processing chain
    const chain = prompt.pipe(model).pipe(parser)

    // Invoke the chain with the resume and job description
    const result = await chain.invoke({
      resume: resumeContent,
      jobDesc: jobDesc,
      companyName: companyName,
      jobTitle: jobTitle,
      formatting_instructions: parser.getFormatInstructions(),
    })

    // Override AI-extracted email with user-provided email if available
    if (candidateEmail) {
      result.email = candidateEmail
    }

    // Assign additional fields
    result.companyName = companyName
    result.jobTitle = jobTitle
    result.resumeLink = resumeLink
    result.companyId = companyId
    result.jobStatus = ["Screened", "Expectations Screened"]

    // Process and add expectation answers to the result if provided
    if (Object.keys(parsedExpectationAnswers).length > 0) {
      // Process the answers based on question types
      const { processedAnswers, questionMetadata } = await processExpectationAnswers(parsedExpectationAnswers, jobTitle)

      // Store the expectation data in the resume using the updated schema
      result.expectations = {
        candidateQuestionResponse: processedAnswers, // Plain object for processed answers
        rawAnswers: parsedExpectationAnswers, // Store raw answers for reference
        questionMetadata: questionMetadata, // Store metadata for better tracking
        created_at: new Date(),
      }
    }

    // Save the result to the database
    const savedResume = await Resume.create(result)

    // If checked, also save to candidate database for future opportunities
    if (checked) {
      // Use the same prompt but with empty jobDesc for general scoring
      const chain2 = prompt.pipe(model).pipe(parser2)
      const result2 = await chain2.invoke({
        resume: resumeContent,
        jobDesc: "", // Empty jobDesc for general scoring
        companyName: companyName,
        jobTitle: "", // No jobTitle for candidate database
        formatting_instructions: parser2.getFormatInstructions(),
      })

      // Override AI-extracted email with user-provided email
      if (candidateEmail) {
        result2.email = candidateEmail
      }

      // Assign additional fields
      result2.companyName = companyName
      result2.resumeLink = resumeLink
      result2.companyId = companyId

      // Save the result to the candidate database
      await Candidate.create(result2)
    }

    // Respond with the matched result
    res.json({
      message: "Resume processed successfully against the job description",
      result: result,
      resumeId: savedResume._id,
      expectationAnswers: result.expectations?.candidateQuestionResponse || {},
      questionMetadata: result.expectations?.questionMetadata || [],
    })
  } catch (error) {
    console.error("Error processing resume:", error.message)
    return res.status(500).json({
      error: "Error processing resume",
      details: error.message,
    })
  }
}
// ----------------update to new code with less promts ----------
// import { PDFLoader } from "langchain/document_loaders/fs/pdf"
// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import fs from "fs"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import mammoth from "mammoth"
// import { v2 as cloudinary } from "cloudinary"
// import Resume from "../../model/resumeModel.js"
// import Candidate from "../../model/candidateModal.js"
// import JobDescription from "../../model/JobDescriptionModel.js"

// dotenv.config()

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// })

// // Define Zod Schemas for validating and structuring the data
// const matchingScoreDetailsSchema = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
//   educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
// })

// const matchingScoreDetailsSchema2 = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Give score to candidate skills have"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Give score according to candidate experience have"),
//   educationMatch: z.number().int().min(0).max(100).describe("Give score according to candidate Education have"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall score the resume"),
// })

// const skillsAnalysisSchema = z.array(
//   z.string().describe("The skills that candidate have is matched with the job description skills"),
// )

// const skillsAnalysisSchema2 = z.array(z.string().describe("The top skills that candidate have"))

// const notMatchedSkillsAnalysisSchema = z.array(
//   z.string().describe("The skills that have in job description but not matched with candidate skills"),
// )

// const notMatchedSkillsAnalysisSchema2 = z.array(
//   z.string().describe("The skills that need to add in candidate skills for betterment"),
// )

// const experienceAnalysisSchema = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const experienceAnalysisSchema2 = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const educationAnalysisSchema = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const educationAnalysisSchema2 = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const analysisSchema = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema,
//     notMatched: notMatchedSkillsAnalysisSchema,
//   }),
//   experience: experienceAnalysisSchema,
//   education: educationAnalysisSchema,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const analysisSchema2 = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema2,
//     notMatched: notMatchedSkillsAnalysisSchema2,
//   }),
//   experience: experienceAnalysisSchema2,
//   education: educationAnalysisSchema2,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const candidateSchema = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.string().describe("Mobile number of the candidate with country code"),
//   jobTitle: z.string().describe("Job title of the candidate who is applying for"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema,
//   analysis: analysisSchema,
// })

// const candidateSchema2 = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.string().describe("Mobile number of the candidate with country code"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema2,
//   analysis: analysisSchema2,
// })

// // AI-powered phone number processing function
// const processPhoneNumberWithAI = async (resumeContent, providedPhone = null) => {
//   try {
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     let prompt
//     if (providedPhone) {
//       // If phone number is provided, add country code if missing
//       prompt = `
//         Analyze the following phone number and add the appropriate country code if it's missing.
//         If the country code is already present, return it as is.
//         If no country code is present, try to detect the country from the resume content and add the appropriate country code.
        
//         Phone number: ${providedPhone}
//         Resume content: ${resumeContent.substring(0, 1000)}
        
//         Return only the phone number with country code in the format: +[country_code][phone_number]
//         Example: +1234567890 or +919876543210
        
//         If you cannot determine the country, default to +1 (US/Canada).
//       `
//     } else {
//       // If no phone number provided, try to extract from resume and add country code
//       prompt = `
//         Extract the phone number from the following resume content and add the appropriate country code.
//         If multiple phone numbers are found, return the primary/main one.
//         If no phone number is found, return "Not provided".
        
//         Resume content: ${resumeContent.substring(0, 1500)}
        
//         Try to detect the country from the resume content (location, address, etc.) and add the appropriate country code.
//         Return only the phone number with country code in the format: +[country_code][phone_number]
//         Example: +1234567890 or +919876543210
        
//         If you cannot determine the country, default to +1 (US/Canada).
//       `
//     }

//     const response = await model.invoke(prompt)

//     // Clean up the response and ensure it starts with +
//     let processedPhone = response.trim()

//     // If the response doesn't start with +, add it
//     if (processedPhone && !processedPhone.startsWith("+") && processedPhone !== "Not provided") {
//       processedPhone = "+" + processedPhone.replace(/\D/g, "")
//     }

//     return processedPhone || "Not provided"
//   } catch (error) {
//     console.error("Error processing phone number with AI:", error)
//     // Fallback: if AI fails, try basic processing
//     if (providedPhone) {
//       const cleanPhone = providedPhone.replace(/\D/g, "")
//       return cleanPhone.startsWith("1") ? `+${cleanPhone}` : `+1${cleanPhone}`
//     }
//     return "Not provided"
//   }
// }

// // Enhanced helper function to process expectation answers with metadata
// const processExpectationAnswers = async (expectationAnswers, jobTitle) => {
//   try {
//     // Get the job details to understand question types
//     const jobDetails = await JobDescription.findById(jobTitle)
//     if (!jobDetails || !jobDetails.expectationQuestions) {
//       return { processedAnswers: {}, questionMetadata: [] }
//     }

//     const processedAnswers = {}
//     const questionMetadata = []
//     const questions = jobDetails.expectationQuestions

//     Object.entries(expectationAnswers).forEach(([questionIndex, answer]) => {
//       const question = questions[Number.parseInt(questionIndex)]

//       if (!question) return

//       // Handle different question formats (old string format vs new object format)
//       let questionType = "text" // default
//       let questionText = ""
//       let questionOptions = []

//       if (typeof question === "object") {
//         questionType = question.type || "text"
//         questionText = question.text || ""
//         questionOptions = question.options || []
//       } else {
//         // Old format - treat as text question
//         questionText = question
//         questionType = "text"
//       }

//       // Process answer based on question type
//       let processedAnswer = answer
//       let selectedOption = ""

//       switch (questionType) {
//         case "option":
//           // Yes/No questions - answer is boolean
//           processedAnswer = answer === true ? "Yes" : answer === false ? "No" : answer
//           selectedOption = processedAnswer
//           break

//         case "custom":
//           // Multiple choice questions - answer is index, convert to actual option text
//           if (typeof answer === "number" && questionOptions[answer]) {
//             processedAnswer = questionOptions[answer]
//             selectedOption = questionOptions[answer]
//           }
//           break

//         case "text":
//         default:
//           // Text questions - keep as is
//           processedAnswer = String(answer || "")
//           selectedOption = processedAnswer
//           break
//       }

//       // Store with question text as key for better readability
//       const questionKey = `Q${Number.parseInt(questionIndex) + 1}: ${questionText}`
//       processedAnswers[questionKey] = processedAnswer

//       // Store metadata for better tracking
//       questionMetadata.push({
//         questionIndex: Number.parseInt(questionIndex),
//         questionText: questionText,
//         questionType: questionType,
//         options: questionOptions,
//         selectedOption: selectedOption,
//         answerValue: answer,
//       })
//     })

//     return { processedAnswers, questionMetadata }
//   } catch (error) {
//     console.error("Error processing expectation answers:", error)
//     return { processedAnswers: {}, questionMetadata: [] }
//   }
// }

// // Helper function to check if candidate should be disqualified
// const checkDisqualification = async (expectationAnswers, jobTitle) => {
//   try {
//     const jobDetails = await JobDescription.findById(jobTitle)
//     if (!jobDetails || !jobDetails.expectationQuestions) {
//       return false
//     }

//     const questions = jobDetails.expectationQuestions

//     for (const [questionIndex, answer] of Object.entries(expectationAnswers)) {
//       const question = questions[Number.parseInt(questionIndex)]

//       if (!question) continue

//       // Handle different question formats
//       if (typeof question === "object") {
//         // Check for disqualifying answers
//         if (question.type === "option" && answer === false) {
//           // "No" answer to yes/no question is disqualifying
//           return true
//         } else if (
//           question.type === "custom" &&
//           question.disqualifyingOptions &&
//           question.disqualifyingOptions.includes(answer)
//         ) {
//           // Selected a disqualifying option in multiple choice
//           return true
//         }
//       }
//     }

//     return false
//   } catch (error) {
//     console.error("Error checking disqualification:", error)
//     return false
//   }
// }

// // The updated controller for single resume and single job description
// export const scoreSingleResumeAndSaveCandidate = async (req, res) => {
//   try {
//     // Extract the uploaded file and other required fields from the request
//     const uploadedFile = req.file
//     const {
//       jobDesc,
//       companyName,
//       jobTitle,
//       companyId,
//       checked,
//       expectationAnswers,
//       // Only email is now provided from frontend
//       candidateEmail,
//     } = req.body

//     // Input Validation
//     if (!uploadedFile) {
//       return res.status(400).json({ message: "No file uploaded" })
//     }

//     if (!jobDesc || typeof jobDesc !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job description" })
//     }

//     if (!companyName || typeof companyName !== "string") {
//       return res.status(400).json({ message: "Invalid or missing company name" })
//     }

//     if (!jobTitle || typeof jobTitle !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job title" })
//     }

//     // Parse expectation answers if provided
//     let parsedExpectationAnswers = {}
//     if (expectationAnswers) {
//       try {
//         parsedExpectationAnswers = JSON.parse(expectationAnswers)
//       } catch (error) {
//         console.error("Error parsing expectation answers:", error)
//         parsedExpectationAnswers = {}
//       }
//     }

//     // Initialize OpenAI model
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     // Initialize parser with the defined Zod schema
//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema)
//     const parser2 = StructuredOutputParser.fromZodSchema(candidateSchema2)

//     // Define the prompt template
//     const prompt = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume with a job description. Please provide a matching score between 0 and 100 based on the following criteria: 
//   - Relevance of skills
//   - Years of relevant experience
//   - Education background
//   - Specific projects related to the job description.
  
//   Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
  
//   format_instructions: {formatting_instructions}    
//             resume: {resume}
//             job description: {jobDesc}
//             matching score:
//   `,
//     )

//     const prompt2 = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume. 
//     Please provide a matching score between 0 and 100 based on the following criteria: 
//     - Relevance of skills
//     - Years of relevant experience
//     - Education background
//     - Specific projects related to the candidate's experience.
    
//     Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
    
//     format_instructions: {formatting_instructions}
//     resume: {resume}`,
//     )

//     // Upload the resume to Cloudinary
//     const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
//       resource_type: "auto",
//       folder: "resumes",
//     })

//     const resumeLink = uploadResult.secure_url

//     // Extract resume content based on file type
//     let resumeContent
//     if (uploadedFile.mimetype === "application/pdf") {
//       const loader = new PDFLoader(uploadedFile.path)
//       const docs = await loader.load()
//       resumeContent = docs[0]?.pageContent
//     } else if (uploadedFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
//       const { value } = await mammoth.extractRawText({
//         path: uploadedFile.path,
//       })
//       resumeContent = value
//     }

//     if (!resumeContent) {
//       throw new Error(`No content found in file: ${uploadedFile.filename}`)
//     }

//     // Clean up the uploaded file from the server
//     await fs.promises.unlink(uploadedFile.path)

//     // Initialize the processing chain
//     const chain = prompt.pipe(model).pipe(parser)
//     const chain2 = prompt2.pipe(model).pipe(parser2)

//     // Invoke the chain with the resume and job description
//     const result = await chain.invoke({
//       resume: resumeContent,
//       jobDesc: jobDesc,
//       companyName: companyName,
//       companyId: companyId,
//       formatting_instructions: parser.getFormatInstructions(),
//     })

//     // Process phone number with AI (extract from resume and add country code)
//     const processedPhone = await processPhoneNumberWithAI(resumeContent)
//     result.mobile = processedPhone

//     // Override AI-extracted email with user-provided email if available
//     if (candidateEmail) {
//       result.email = candidateEmail
//     }

//     // Assign additional fields
//     result.companyName = companyName
//     result.jobTitle = jobTitle
//     result.resumeLink = resumeLink
//     result.companyId = companyId
//     result.jobStatus = ["Screened", "Expectations Screened"]

//     // Process and add expectation answers to the result if provided
//     if (Object.keys(parsedExpectationAnswers).length > 0) {
//       // Process the answers based on question types
//       const { processedAnswers, questionMetadata } = await processExpectationAnswers(parsedExpectationAnswers, jobTitle)

//       // Store the expectation data in the resume using the updated schema
//       result.expectations = {
//         candidateQuestionResponse: processedAnswers, // Plain object for processed answers
//         rawAnswers: parsedExpectationAnswers, // Store raw answers for reference
//         questionMetadata: questionMetadata, // Store metadata for better tracking
//         created_at: new Date(),
//       }
//     }

//     // Save the result to the database
//     const savedResume = await Resume.create(result)

//     // If checked, also save to candidate database for future opportunities
//     if (checked) {
//       const result2 = await chain2.invoke({
//         resume: resumeContent,
//         companyName: companyName,
//         companyId: companyId,
//         formatting_instructions: parser2.getFormatInstructions(),
//       })

//       // Process phone number with AI for candidate database too
//       const processedPhone2 = await processPhoneNumberWithAI(resumeContent)
//       result2.mobile = processedPhone2

//       // Override AI-extracted email with user-provided email for candidate database too
//       if (candidateEmail) {
//         result2.email = candidateEmail
//       }

//       // Assign additional fields
//       result2.companyName = companyName
//       result2.resumeLink = resumeLink
//       result2.companyId = companyId

//       // Save the result to the candidate database
//       await Candidate.create(result2)
//     }

//     // Respond with the matched result
//     res.json({
//       message: "Resume processed successfully against the job description",
//       result: result,
//       resumeId: savedResume._id,
//       expectationAnswers: result.expectations?.candidateQuestionResponse || {},
//       questionMetadata: result.expectations?.questionMetadata || [],
//     })
//   } catch (error) {
//     console.error("Error processing resume:", error.message)
//     return res.status(500).json({
//       error: "Error processing resume",
//       details: error.message,
//     })
//   }
// }


// import { PDFLoader } from "langchain/document_loaders/fs/pdf"
// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import fs from "fs"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import mammoth from "mammoth"
// import { v2 as cloudinary } from "cloudinary"
// import Resume from "../../model/resumeModel.js"
// import Candidate from "../../model/candidateModal.js"
// import JobDescription from "../../model/JobDescriptionModel.js"

// dotenv.config()

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// })

// // Define Zod Schemas for validating and structuring the data
// const matchingScoreDetailsSchema = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
//   educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
// })

// const matchingScoreDetailsSchema2 = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Give score to candidate skills have"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Give score according to candidate experience have"),
//   educationMatch: z.number().int().min(0).max(100).describe("Give score according to candidate Education have"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall score the resume"),
// })

// const skillsAnalysisSchema = z.array(
//   z.string().describe("The skills that candidate have is matched with the job description skills"),
// )

// const skillsAnalysisSchema2 = z.array(z.string().describe("The top skills that candidate have"))

// const notMatchedSkillsAnalysisSchema = z.array(
//   z.string().describe("The skills that have in job description but not matched with candidate skills"),
// )

// const notMatchedSkillsAnalysisSchema2 = z.array(
//   z.string().describe("The skills that need to add in candidate skills for betterment"),
// )

// const experienceAnalysisSchema = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const experienceAnalysisSchema2 = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const educationAnalysisSchema = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const educationAnalysisSchema2 = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const analysisSchema = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema,
//     notMatched: notMatchedSkillsAnalysisSchema,
//   }),
//   experience: experienceAnalysisSchema,
//   education: educationAnalysisSchema,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const analysisSchema2 = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema2,
//     notMatched: notMatchedSkillsAnalysisSchema2,
//   }),
//   experience: experienceAnalysisSchema2,
//   education: educationAnalysisSchema2,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const candidateSchema = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.number().describe("Mobile number of the candidate (without country code)"),
//   jobTitle: z.string().describe("Job title of the candidate who is applying for"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema,
//   analysis: analysisSchema,
// })

// const candidateSchema2 = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.number().describe("Mobile number of the candidate (without country code)"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema2,
//   analysis: analysisSchema2,
// })

// // Enhanced helper function to process expectation answers with metadata
// const processExpectationAnswers = async (expectationAnswers, jobTitle) => {
//   try {
//     // Get the job details to understand question types
//     const jobDetails = await JobDescription.findById(jobTitle)
//     if (!jobDetails || !jobDetails.expectationQuestions) {
//       return { processedAnswers: {}, questionMetadata: [] }
//     }

//     const processedAnswers = {}
//     const questionMetadata = []
//     const questions = jobDetails.expectationQuestions

//     Object.entries(expectationAnswers).forEach(([questionIndex, answer]) => {
//       const question = questions[Number.parseInt(questionIndex)]

//       if (!question) return

//       // Handle different question formats (old string format vs new object format)
//       let questionType = "text" // default
//       let questionText = ""
//       let questionOptions = []

//       if (typeof question === "object") {
//         questionType = question.type || "text"
//         questionText = question.text || ""
//         questionOptions = question.options || []
//       } else {
//         // Old format - treat as text question
//         questionText = question
//         questionType = "text"
//       }

//       // Process answer based on question type
//       let processedAnswer = answer
//       let selectedOption = ""

//       switch (questionType) {
//         case "option":
//           // Yes/No questions - answer is boolean
//           processedAnswer = answer === true ? "Yes" : answer === false ? "No" : answer
//           selectedOption = processedAnswer
//           break

//         case "custom":
//           // Multiple choice questions - answer is index, convert to actual option text
//           if (typeof answer === "number" && questionOptions[answer]) {
//             processedAnswer = questionOptions[answer]
//             selectedOption = questionOptions[answer]
//           }
//           break

//         case "text":
//         default:
//           // Text questions - keep as is
//           processedAnswer = String(answer || "")
//           selectedOption = processedAnswer
//           break
//       }

//       // Store with question text as key for better readability
//       const questionKey = `Q${Number.parseInt(questionIndex) + 1}: ${questionText}`
//       processedAnswers[questionKey] = processedAnswer

//       // Store metadata for better tracking
//       questionMetadata.push({
//         questionIndex: Number.parseInt(questionIndex),
//         questionText: questionText,
//         questionType: questionType,
//         options: questionOptions,
//         selectedOption: selectedOption,
//         answerValue: answer,
//       })
//     })

//     return { processedAnswers, questionMetadata }
//   } catch (error) {
//     console.error("Error processing expectation answers:", error)
//     return { processedAnswers: {}, questionMetadata: [] }
//   }
// }

// // Helper function to check if candidate should be disqualified
// const checkDisqualification = async (expectationAnswers, jobTitle) => {
//   try {
//     const jobDetails = await JobDescription.findById(jobTitle)
//     if (!jobDetails || !jobDetails.expectationQuestions) {
//       return false
//     }

//     const questions = jobDetails.expectationQuestions

//     for (const [questionIndex, answer] of Object.entries(expectationAnswers)) {
//       const question = questions[Number.parseInt(questionIndex)]

//       if (!question) continue

//       // Handle different question formats
//       if (typeof question === "object") {
//         // Check for disqualifying answers
//         if (question.type === "option" && answer === false) {
//           // "No" answer to yes/no question is disqualifying
//           return true
//         } else if (
//           question.type === "custom" &&
//           question.disqualifyingOptions &&
//           question.disqualifyingOptions.includes(answer)
//         ) {
//           // Selected a disqualifying option in multiple choice
//           return true
//         }
//       }
//     }

//     return false
//   } catch (error) {
//     console.error("Error checking disqualification:", error)
//     return false
//   }
// }

// // The updated controller for single resume and single job description
// export const scoreSingleResumeAndSaveCandidate = async (req, res) => {
//   try {
//     // Extract the uploaded file and other required fields from the request
//     const uploadedFile = req.file
//     const {
//       jobDesc,
//       companyName,
//       jobTitle,
//       companyId,
//       checked,
//       expectationAnswers,
//       // New fields for candidate information
//       firstName,
//       lastName,
//       candidateEmail,
//       candidateMobile,
//       candidateLinkedin,
//     } = req.body

//     // Input Validation
//     if (!uploadedFile) {
//       return res.status(400).json({ message: "No file uploaded" })
//     }

//     if (!jobDesc || typeof jobDesc !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job description" })
//     }

//     if (!companyName || typeof companyName !== "string") {
//       return res.status(400).json({ message: "Invalid or missing company name" })
//     }

//     if (!jobTitle || typeof jobTitle !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job title" })
//     }

//     // Parse expectation answers if provided
//     let parsedExpectationAnswers = {}
//     if (expectationAnswers) {
//       try {
//         parsedExpectationAnswers = JSON.parse(expectationAnswers)
//       } catch (error) {
//         console.error("Error parsing expectation answers:", error)
//         parsedExpectationAnswers = {}
//       }
//     }

//     // Initialize OpenAI model
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     // Initialize parser with the defined Zod schema
//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema)
//     const parser2 = StructuredOutputParser.fromZodSchema(candidateSchema2)

//     // Define the prompt template
//     const prompt = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume with a job description. Please provide a matching score between 0 and 100 based on the following criteria: 
//   - Relevance of skills
//   - Years of relevant experience
//   - Education background
//   - Specific projects related to the job description.
  
//   Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
  
//   format_instructions: {formatting_instructions}    
//             resume: {resume}
//             job description: {jobDesc}
//             matching score:
//   `,
//     )

//     const prompt2 = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume. 
//     Please provide a matching score between 0 and 100 based on the following criteria: 
//     - Relevance of skills
//     - Years of relevant experience
//     - Education background
//     - Specific projects related to the candidate's experience.
    
//     Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
    
//     format_instructions: {formatting_instructions}
//     resume: {resume}`,
//     )

//     // Upload the resume to Cloudinary
//     const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
//       resource_type: "auto",
//       folder: "resumes",
//     })

//     const resumeLink = uploadResult.secure_url

//     // Extract resume content based on file type
//     let resumeContent
//     if (uploadedFile.mimetype === "application/pdf") {
//       const loader = new PDFLoader(uploadedFile.path)
//       const docs = await loader.load()
//       resumeContent = docs[0]?.pageContent
//     } else if (uploadedFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
//       const { value } = await mammoth.extractRawText({
//         path: uploadedFile.path,
//       })
//       resumeContent = value
//     }

//     if (!resumeContent) {
//       throw new Error(`No content found in file: ${uploadedFile.filename}`)
//     }

//     // Clean up the uploaded file from the server
//     await fs.promises.unlink(uploadedFile.path)

//     // Initialize the processing chain
//     const chain = prompt.pipe(model).pipe(parser)
//     const chain2 = prompt2.pipe(model).pipe(parser2)

//     // Invoke the chain with the resume and job description
//     const result = await chain.invoke({
//       resume: resumeContent,
//       jobDesc: jobDesc,
//       companyName: companyName,
//       companyId: companyId,
//       formatting_instructions: parser.getFormatInstructions(),
//     })

//     // Override AI-extracted information with user-provided data if available
//     if (firstName && lastName) {
//       result.candidateName = `${firstName} ${lastName}`.trim()
//     }

//     if (candidateEmail) {
//       result.email = candidateEmail
//     }

//     if (candidateMobile) {
//       // Try to extract just the digits for the mobile number
//       const mobileDigits = candidateMobile.replace(/\D/g, "")
//       if (mobileDigits) {
//         result.mobile = Number.parseInt(mobileDigits, 10) || result.mobile
//       }
//     }

//     if (candidateLinkedin) {
//       result.linkedinLink = candidateLinkedin
//     }

//     // Assign additional fields
//     result.companyName = companyName
//     result.jobTitle = jobTitle
//     result.resumeLink = resumeLink
//     result.companyId = companyId
//     result.jobStatus = ["Screened", "Expectations Screened"]

//     // Process and add expectation answers to the result if provided
//     if (Object.keys(parsedExpectationAnswers).length > 0) {
//       // Process the answers based on question types
//       const { processedAnswers, questionMetadata } = await processExpectationAnswers(parsedExpectationAnswers, jobTitle)

//       // Store the expectation data in the resume using the updated schema
//       result.expectations = {
//         candidateQuestionResponse: processedAnswers, // Plain object for processed answers
//         rawAnswers: parsedExpectationAnswers, // Store raw answers for reference
//         questionMetadata: questionMetadata, // Store metadata for better tracking
//         created_at: new Date(),
//       }
//     }

//     // Save the result to the database
//     const savedResume = await Resume.create(result)

//     // If checked, also save to candidate database for future opportunities
//     if (checked) {
//       const result2 = await chain2.invoke({
//         resume: resumeContent,
//         companyName: companyName,
//         companyId: companyId,
//         formatting_instructions: parser2.getFormatInstructions(),
//       })

//       // Override AI-extracted information with user-provided data for candidate database too
//       if (firstName && lastName) {
//         result2.candidateName = `${firstName} ${lastName}`.trim()
//       }

//       if (candidateEmail) {
//         result2.email = candidateEmail
//       }

//       if (candidateMobile) {
//         const mobileDigits = candidateMobile.replace(/\D/g, "")
//         if (mobileDigits) {
//           result2.mobile = Number.parseInt(mobileDigits, 10) || result2.mobile
//         }
//       }

//       if (candidateLinkedin) {
//         result2.linkedinLink = candidateLinkedin
//       }

//       // Assign additional fields
//       result2.companyName = companyName
//       result2.resumeLink = resumeLink
//       result2.companyId = companyId

//       // Save the result to the candidate database
//       await Candidate.create(result2)
//     }

//     // Respond with the matched result
//     res.json({
//       message: "Resume processed successfully against the job description",
//       result: result,
//       resumeId: savedResume._id,
//       expectationAnswers: result.expectations?.candidateQuestionResponse || {},
//       questionMetadata: result.expectations?.questionMetadata || [],
//     })
//   } catch (error) {
//     console.error("Error processing resume:", error.message)
//     return res.status(500).json({
//       error: "Error processing resume",
//       details: error.message,
//     })
//   }
// }



// import { PDFLoader } from "langchain/document_loaders/fs/pdf"
// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import fs from "fs"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import mammoth from "mammoth"
// import { v2 as cloudinary } from "cloudinary"
// import Resume from "../../model/resumeModel.js"
// import Candidate from "../../model/candidateModal.js"
// import JobDescription from "../../model/JobDescriptionModel.js"

// dotenv.config()

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// })

// // Define Zod Schemas for validating and structuring the data
// const matchingScoreDetailsSchema = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
//   educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
// })

// const matchingScoreDetailsSchema2 = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Give score to candidate skills have"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Give score according to candidate experience have"),
//   educationMatch: z.number().int().min(0).max(100).describe("Give score according to candidate Education have"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall score the resume"),
// })

// const skillsAnalysisSchema = z.array(
//   z.string().describe("The skills that candidate have is matched with the job description skills"),
// )

// const skillsAnalysisSchema2 = z.array(z.string().describe("The top skills that candidate have"))

// const notMatchedSkillsAnalysisSchema = z.array(
//   z.string().describe("The skills that have in job description but not matched with candidate skills"),
// )

// const notMatchedSkillsAnalysisSchema2 = z.array(
//   z.string().describe("The skills that need to add in candidate skills for betterment"),
// )

// const experienceAnalysisSchema = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const experienceAnalysisSchema2 = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const educationAnalysisSchema = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const educationAnalysisSchema2 = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const analysisSchema = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema,
//     notMatched: notMatchedSkillsAnalysisSchema,
//   }),
//   experience: experienceAnalysisSchema,
//   education: educationAnalysisSchema,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const analysisSchema2 = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema2,
//     notMatched: notMatchedSkillsAnalysisSchema2,
//   }),
//   experience: experienceAnalysisSchema2,
//   education: educationAnalysisSchema2,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const candidateSchema = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.number().describe("Mobile number of the candidate (without country code)"),
//   jobTitle: z.string().describe("Job title of the candidate who is applying for"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema,
//   analysis: analysisSchema,
// })

// const candidateSchema2 = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.number().describe("Mobile number of the candidate (without country code)"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema2,
//   analysis: analysisSchema2,
// })

// // Enhanced helper function to process expectation answers with metadata
// const processExpectationAnswers = async (expectationAnswers, jobTitle) => {
//   try {
//     // Get the job details to understand question types
//     const jobDetails = await JobDescription.findById(jobTitle)
//     if (!jobDetails || !jobDetails.expectationQuestions) {
//       return { processedAnswers: {}, questionMetadata: [] }
//     }

//     const processedAnswers = {}
//     const questionMetadata = []
//     const questions = jobDetails.expectationQuestions

//     Object.entries(expectationAnswers).forEach(([questionIndex, answer]) => {
//       const question = questions[Number.parseInt(questionIndex)]

//       if (!question) return

//       // Handle different question formats (old string format vs new object format)
//       let questionType = "text" // default
//       let questionText = ""
//       let questionOptions = []

//       if (typeof question === "object") {
//         questionType = question.type || "text"
//         questionText = question.text || ""
//         questionOptions = question.options || []
//       } else {
//         // Old format - treat as text question
//         questionText = question
//         questionType = "text"
//       }

//       // Process answer based on question type
//       let processedAnswer = answer
//       let selectedOption = ""

//       switch (questionType) {
//         case "option":
//           // Yes/No questions - answer is boolean
//           processedAnswer = answer === true ? "Yes" : answer === false ? "No" : answer
//           selectedOption = processedAnswer
//           break

//         case "custom":
//           // Multiple choice questions - answer is index, convert to actual option text
//           if (typeof answer === "number" && questionOptions[answer]) {
//             processedAnswer = questionOptions[answer]
//             selectedOption = questionOptions[answer]
//           }
//           break

//         case "text":
//         default:
//           // Text questions - keep as is
//           processedAnswer = String(answer || "")
//           selectedOption = processedAnswer
//           break
//       }

//       // Store with question text as key for better readability
//       const questionKey = `Q${Number.parseInt(questionIndex) + 1}: ${questionText}`
//       processedAnswers[questionKey] = processedAnswer

//       // Store metadata for better tracking
//       questionMetadata.push({
//         questionIndex: Number.parseInt(questionIndex),
//         questionText: questionText,
//         questionType: questionType,
//         options: questionOptions,
//         selectedOption: selectedOption,
//         answerValue: answer,
//       })
//     })

//     return { processedAnswers, questionMetadata }
//   } catch (error) {
//     console.error("Error processing expectation answers:", error)
//     return { processedAnswers: {}, questionMetadata: [] }
//   }
// }

// // Helper function to check if candidate should be disqualified
// const checkDisqualification = async (expectationAnswers, jobTitle) => {
//   try {
//     const jobDetails = await JobDescription.findById(jobTitle)
//     if (!jobDetails || !jobDetails.expectationQuestions) {
//       return false
//     }

//     const questions = jobDetails.expectationQuestions

//     for (const [questionIndex, answer] of Object.entries(expectationAnswers)) {
//       const question = questions[Number.parseInt(questionIndex)]

//       if (!question) continue

//       // Handle different question formats
//       if (typeof question === "object") {
//         // Check for disqualifying answers
//         if (question.type === "option" && answer === false) {
//           // "No" answer to yes/no question is disqualifying
//           return true
//         } else if (
//           question.type === "custom" &&
//           question.disqualifyingOptions &&
//           question.disqualifyingOptions.includes(answer)
//         ) {
//           // Selected a disqualifying option in multiple choice
//           return true
//         }
//       }
//     }

//     return false
//   } catch (error) {
//     console.error("Error checking disqualification:", error)
//     return false
//   }
// }

// // The updated controller for single resume and single job description
// export const scoreSingleResumeAndSaveCandidate = async (req, res) => {
//   try {
//     // Extract the uploaded file and other required fields from the request
//     const uploadedFile = req.file
//     const { jobDesc, companyName, jobTitle, companyId, checked, expectationAnswers } = req.body

//     // Input Validation
//     if (!uploadedFile) {
//       return res.status(400).json({ message: "No file uploaded" })
//     }

//     if (!jobDesc || typeof jobDesc !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job description" })
//     }

//     if (!companyName || typeof companyName !== "string") {
//       return res.status(400).json({ message: "Invalid or missing company name" })
//     }

//     if (!jobTitle || typeof jobTitle !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job title" })
//     }

//     // Parse expectation answers if provided
//     let parsedExpectationAnswers = {}
//     if (expectationAnswers) {
//       try {
//         parsedExpectationAnswers = JSON.parse(expectationAnswers)
//       } catch (error) {
//         console.error("Error parsing expectation answers:", error)
//         parsedExpectationAnswers = {}
//       }
//     }

//     // Check if candidate should be disqualified based on their answers
//     // const isDisqualified = await checkDisqualification(parsedExpectationAnswers, jobTitle)

//     // if (isDisqualified) {
//     //   return res.status(400).json({
//     //     message: "Application cannot be processed due to screening requirements not being met",
//     //     disqualified: true,
//     //   })
//     // }

//     // Initialize OpenAI model
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     // Initialize parser with the defined Zod schema
//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema)
//     const parser2 = StructuredOutputParser.fromZodSchema(candidateSchema2)

//     // Define the prompt template
//     const prompt = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume with a job description. Please provide a matching score between 0 and 100 based on the following criteria: 
//   - Relevance of skills
//   - Years of relevant experience
//   - Education background
//   - Specific projects related to the job description.
  
//   Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
  
//   format_instructions: {formatting_instructions}    
//             resume: {resume}
//             job description: {jobDesc}
//             matching score:
//   `,
//     )

//     const prompt2 = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume. 
//     Please provide a matching score between 0 and 100 based on the following criteria: 
//     - Relevance of skills
//     - Years of relevant experience
//     - Education background
//     - Specific projects related to the candidate's experience.
    
//     Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
    
//     format_instructions: {formatting_instructions}
//     resume: {resume}`,
//     )

//     // Upload the resume to Cloudinary
//     const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
//       resource_type: "auto",
//       folder: "resumes",
//     })

//     const resumeLink = uploadResult.secure_url

//     // Extract resume content based on file type
//     let resumeContent
//     if (uploadedFile.mimetype === "application/pdf") {
//       const loader = new PDFLoader(uploadedFile.path)
//       const docs = await loader.load()
//       resumeContent = docs[0]?.pageContent
//     } else if (uploadedFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
//       const { value } = await mammoth.extractRawText({
//         path: uploadedFile.path,
//       })
//       resumeContent = value
//     }

//     if (!resumeContent) {
//       throw new Error(`No content found in file: ${uploadedFile.filename}`)
//     }

//     // Clean up the uploaded file from the server
//     await fs.promises.unlink(uploadedFile.path)

//     // Initialize the processing chain
//     const chain = prompt.pipe(model).pipe(parser)
//     const chain2 = prompt2.pipe(model).pipe(parser2)

//     // Invoke the chain with the resume and job description
//     const result = await chain.invoke({
//       resume: resumeContent,
//       jobDesc: jobDesc,
//       companyName: companyName,
//       companyId: companyId,
//       formatting_instructions: parser.getFormatInstructions(),
//     })

//     // Assign additional fields
//     result.companyName = companyName
//     result.jobTitle = jobTitle
//     result.resumeLink = resumeLink
//     result.companyId = companyId
//     result.jobStatus = ["Screened", "Expectations Screened"]
//     // result.jobStatus.push("Screened")
//     // result.jobStatus.push("Expectations Screened")

//     // Process and add expectation answers to the result if provided
//     if (Object.keys(parsedExpectationAnswers).length > 0) {
//       // Process the answers based on question types
//       const { processedAnswers, questionMetadata } = await processExpectationAnswers(parsedExpectationAnswers, jobTitle)

//       // Store the expectation data in the resume using the updated schema
//       result.expectations = {
//         candidateQuestionResponse: processedAnswers, // Plain object for processed answers
//         rawAnswers: parsedExpectationAnswers, // Store raw answers for reference
//         questionMetadata: questionMetadata, // Store metadata for better tracking
//         created_at: new Date(),
//       }
//     }

//     // Save the result to the database
//     const savedResume = await Resume.create(result)

//     // If checked, also save to candidate database for future opportunities
//     if (checked) {
//       const result2 = await chain2.invoke({
//         resume: resumeContent,
//         companyName: companyName,
//         companyId: companyId,
//         formatting_instructions: parser2.getFormatInstructions(),
//       })

//       // Assign additional fields
//       result2.companyName = companyName
//       result2.resumeLink = resumeLink
//       result2.companyId = companyId

//       // Save the result to the candidate database
//       await Candidate.create(result2)
//     }

//     // Respond with the matched result
//     res.json({
//       message: "Resume processed successfully against the job description",
//       result: result,
//       resumeId: savedResume._id,
//       expectationAnswers: result.expectations?.candidateQuestionResponse || {},
//       questionMetadata: result.expectations?.questionMetadata || [],
//     })
//   } catch (error) {
//     console.error("Error processing resume:", error.message)
//     return res.status(500).json({
//       error: "Error processing resume",
//       details: error.message,
//     })
//   }
// }





// import { PDFLoader } from "langchain/document_loaders/fs/pdf"
// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import fs from "fs"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import mammoth from "mammoth"
// import { v2 as cloudinary } from "cloudinary"
// import Resume from "../../model/resumeModel.js"
// import Candidate from "../../model/candidateModal.js"

// dotenv.config()

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// })

// // Define Zod Schemas for validating and structuring the data
// const matchingScoreDetailsSchema = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
//   educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
// })

// const matchingScoreDetailsSchema2 = z.object({
//   skillsMatch: z.number().int().min(0).max(100).describe("Give score to candidate skills have"),
//   experienceMatch: z.number().int().min(0).max(100).describe("Give score according to candidate experience have"),
//   educationMatch: z.number().int().min(0).max(100).describe("Give score according to candidate Education have"),
//   overallMatch: z.number().int().min(0).max(100).describe("Overall score the resume"),
// })

// const skillsAnalysisSchema = z.array(
//   z.string().describe("The skills that candidate have is matched with the job description skills"),
// )

// const skillsAnalysisSchema2 = z.array(z.string().describe("The top skills that candidate have"))

// const notMatchedSkillsAnalysisSchema = z.array(
//   z.string().describe("The skills that have in job description but not matched with candidate skills"),
// )

// const notMatchedSkillsAnalysisSchema2 = z.array(
//   z.string().describe("The skills that need to add in candidate skills for betterment"),
// )

// const experienceAnalysisSchema = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const experienceAnalysisSchema2 = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// })

// const educationAnalysisSchema = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const educationAnalysisSchema2 = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// })

// const analysisSchema = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema,
//     notMatched: notMatchedSkillsAnalysisSchema,
//   }),
//   experience: experienceAnalysisSchema,
//   education: educationAnalysisSchema,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const analysisSchema2 = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema2,
//     notMatched: notMatchedSkillsAnalysisSchema2,
//   }),
//   experience: experienceAnalysisSchema2,
//   education: educationAnalysisSchema2,
//   projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
// })

// const candidateSchema = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.number().describe("Mobile number of the candidate (without country code)"),
//   jobTitle: z.string().describe("Job title of the candidate who is applying for"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema,
//   analysis: analysisSchema,
// })

// const candidateSchema2 = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z.number().describe("Mobile number of the candidate (without country code)"),
//   companyName: z.string().describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema2,
//   analysis: analysisSchema2,
// })

// // The updated controller for single resume and single job description
// export const scoreSingleResumeAndSaveCandidate = async (req, res) => {
//   try {
//     // Extract the uploaded file and other required fields from the request
//     const uploadedFile = req.file
//     const { jobDesc, companyName, jobTitle, companyId, checked, expectationAnswers } = req.body

//     // Input Validation
//     if (!uploadedFile) {
//       return res.status(400).json({ message: "No file uploaded" })
//     }

//     if (!jobDesc || typeof jobDesc !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job description" })
//     }

//     if (!companyName || typeof companyName !== "string") {
//       return res.status(400).json({ message: "Invalid or missing company name" })
//     }

//     if (!jobTitle || typeof jobTitle !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job title" })
//     }

//     // Parse expectation answers if provided
//     let parsedExpectationAnswers = {}
//     if (expectationAnswers) {
//       try {
//         parsedExpectationAnswers = JSON.parse(expectationAnswers)
//       } catch (error) {
//         console.error("Error parsing expectation answers:", error)
//         parsedExpectationAnswers = {}
//       }
//     }

//     // Initialize OpenAI model
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     // Initialize parser with the defined Zod schema
//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema)
//     const parser2 = StructuredOutputParser.fromZodSchema(candidateSchema2)

//     // Define the prompt template
//     const prompt = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume with a job description. Please provide a matching score between 0 and 100 based on the following criteria: 
//   - Relevance of skills
//   - Years of relevant experience
//   - Education background
//   - Specific projects related to the job description.
  
//   Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
  
//   format_instructions: {formatting_instructions}    
//             resume: {resume}
//             job description: {jobDesc}
//             matching score:
//   `,
//     )

//     const prompt2 = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume. 
//     Please provide a matching score between 0 and 100 based on the following criteria: 
//     - Relevance of skills
//     - Years of relevant experience
//     - Education background
//     - Specific projects related to the candidate's experience.
    
//     Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
    
//     format_instructions: {formatting_instructions}
//     resume: {resume}`,
//     )

//     // Upload the resume to Cloudinary
//     const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
//       resource_type: "auto",
//       folder: "resumes",
//     })

//     const resumeLink = uploadResult.secure_url

//     // Extract resume content based on file type
//     let resumeContent
//     if (uploadedFile.mimetype === "application/pdf") {
//       const loader = new PDFLoader(uploadedFile.path)
//       const docs = await loader.load()
//       resumeContent = docs[0]?.pageContent
//     } else if (uploadedFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
//       const { value } = await mammoth.extractRawText({
//         path: uploadedFile.path,
//       })
//       resumeContent = value
//     }

//     if (!resumeContent) {
//       throw new Error(`No content found in file: ${uploadedFile.filename}`)
//     }

//     // Clean up the uploaded file from the server
//     await fs.promises.unlink(uploadedFile.path)

//     // Initialize the processing chain
//     const chain = prompt.pipe(model).pipe(parser)
//     const chain2 = prompt2.pipe(model).pipe(parser2)

//     // Invoke the chain with the resume and job description
//     const result = await chain.invoke({
//       resume: resumeContent,
//       jobDesc: jobDesc,
//       companyName: companyName,
//       companyId: companyId,
//       formatting_instructions: parser.getFormatInstructions(),
//     })

//     // Assign additional fields
//     result.companyName = companyName
//     result.jobTitle = jobTitle
//     result.resumeLink = resumeLink
//     result.companyId = companyId

//     // Add expectation answers to the result if provided
//     if (Object.keys(parsedExpectationAnswers).length > 0) {
//       // Convert the answers object to the format expected by the schema
//       const candidateQuestionResponse = new Map()
//       Object.entries(parsedExpectationAnswers).forEach(([key, value]) => {
//         candidateQuestionResponse.set(key, value)
//       })

//       result.expectations = {
//         candidateQuestionResponse: candidateQuestionResponse,
//         created_at: new Date(),
//       }
//     }

//     // Save the result to the database
//     await Resume.create(result)

//     if (checked) {
//       const result2 = await chain2.invoke({
//         resume: resumeContent,
//         companyName: companyName,
//         companyId: companyId,
//         formatting_instructions: parser2.getFormatInstructions(),
//       })

//       // Assign additional fields
//       result2.companyName = companyName
//       result2.resumeLink = resumeLink
//       result2.companyId = companyId

//       // Save the result to the database
//       await Candidate.create(result2)
//     }

//     // Respond with the matched result
//     res.json({
//       message: "Resume processed successfully against the job description",
//       result: result,
//     })
//   } catch (error) {
//     console.error("Error processing resume:", error.message)
//     return res.status(500).json({ error: "Error processing resume" })
//   }
// }




// import express from "express";
// import { PDFLoader } from "langchain/document_loaders/fs/pdf";
// import { PromptTemplate } from "@langchain/core/prompts";
// import { OpenAI } from "@langchain/openai";
// import fs from "fs";
// import dotenv from "dotenv";
// import { z } from "zod";
// import { StructuredOutputParser } from "langchain/output_parsers";
// import mammoth from "mammoth";
// import { v2 as cloudinary } from "cloudinary";
// import Resume from "../../model/resumeModel.js";
// import Candidate from "../../model/candidateModal.js";

// dotenv.config();

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Define Zod Schemas for validating and structuring the data
// const matchingScoreDetailsSchema = z.object({
//   skillsMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Match score for skills"),
//   experienceMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Match score for experience"),
//   educationMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Match score for education"),
//   overallMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Overall matching score"),
// });
// const matchingScoreDetailsSchema2 = z.object({
//   skillsMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Give score to candidate skills have"),
//   experienceMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Give score according to candidate experience have"),
//   educationMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Give score according to candidate Education have"),
//   overallMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Overall score the resume"),
// });

// const skillsAnalysisSchema = z.array(
//   z
//     .string()
//     .describe(
//       "The skills that candidate have is matched with the job description skills"
//     )
// );
// const skillsAnalysisSchema2 = z.array(
//   z.string().describe("The top skills that candidate have")
// );
// const notMatchedSkillsAnalysisSchema = z.array(
//   z
//     .string()
//     .describe(
//       "The skills that have in job description but not matched with candidate skills"
//     )
// );
// const notMatchedSkillsAnalysisSchema2 = z.array(
//   z
//     .string()
//     .describe("The skills that need to add in candidate skills for betterment")
// );

// const experienceAnalysisSchema = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// });
// const experienceAnalysisSchema2 = z.object({
//   relevantExperience: z.string().describe("Description of relevant experience"),
//   yearsOfExperience: z.string().describe("Years of experience"),
// });

// const educationAnalysisSchema = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// });
// const educationAnalysisSchema2 = z.object({
//   highestDegree: z.string().describe("Candidate's highest degree"),
//   relevantCourses: z.array(z.string().describe("Relevant courses taken")),
// });

// const analysisSchema = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema,
//     notMatched: notMatchedSkillsAnalysisSchema,
//   }),
//   experience: experienceAnalysisSchema,
//   education: educationAnalysisSchema,
//   projects: z
//     .array(z.string().describe("Project of the candidate"))
//     .describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z
//     .string()
//     .optional()
//     .describe("Additional notes about the candidate"),
// });
// const analysisSchema2 = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string().describe("Skills of the candidate"))
//       .describe("Skills mentioned by the candidate"),
//     matched: skillsAnalysisSchema2,
//     notMatched: notMatchedSkillsAnalysisSchema2,
//   }),
//   experience: experienceAnalysisSchema2,
//   education: educationAnalysisSchema2,
//   projects: z
//     .array(z.string().describe("Project of the candidate"))
//     .describe("Projects mentioned by the candidate"),
//   recommendation: z.string().describe("Recommendation for the candidate."),
//   comments: z.string().describe("Comments on the candidate's profile."),
//   additionalNotes: z
//     .string()
//     .optional()
//     .describe("Additional notes about the candidate"),
// });

// const candidateSchema = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z
//     .number()
//     .describe("Mobile number of the candidate (without country code)"),
//   jobTitle: z
//     .string()
//     .describe("Job title of the candidate who is applying for"),
//   companyName: z
//     .string()
//     .describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema,
//   analysis: analysisSchema,
// });
// const candidateSchema2 = z.object({
//   candidateName: z.string().describe("Candidate's full name"),
//   email: z.string().describe("Email of the candidate"),
//   mobile: z
//     .number()
//     .describe("Mobile number of the candidate (without country code)"),
//   companyName: z
//     .string()
//     .describe("Company name for which the candidate is applying"),
//   linkedinLink: z.string().describe("LinkedIn link of the candidate"),
//   matchingScoreDetails: matchingScoreDetailsSchema2,
//   analysis: analysisSchema2,
// });

// // The updated controller for single resume and single job description
// export const scoreSingleResumeAndSaveCandidate = async (req, res) => {
//   try {
//     // Extract the uploaded file and other required fields from the request
//     const uploadedFile = req.file; // Assuming single file upload using middleware like multer
//     const { jobDesc, companyName, jobTitle, companyId, checked } = req.body;

//     // Input Validation
//     if (!uploadedFile) {
//       return res.status(400).json({ message: "No file uploaded" });
//     }

//     if (!jobDesc || typeof jobDesc !== "string") {
//       return res
//         .status(400)
//         .json({ message: "Invalid or missing job description" });
//     }

//     if (!companyName || typeof companyName !== "string") {
//       return res
//         .status(400)
//         .json({ message: "Invalid or missing company name" });
//     }

//     if (!jobTitle || typeof jobTitle !== "string") {
//       return res.status(400).json({ message: "Invalid or missing job title" });
//     }

//     // Initialize OpenAI model
//     const model = new OpenAI({
//       modelName: "gpt-4.1", // Ensure this matches your existing setup
//       temperature: 0,
//     });

//     // Initialize parser with the defined Zod schema
//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema);
//     const parser2 = StructuredOutputParser.fromZodSchema(candidateSchema2);

//     // Define the prompt template
//     const prompt = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume with a job description. Please provide a matching score between 0 and 100 based on the following criteria: 
//   - Relevance of skills
//   - Years of relevant experience
//   - Education background
//   - Specific projects related to the job description.
  
//   Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
  
//   format_instructions: {formatting_instructions}    
//             resume: {resume}
//             job description: {jobDesc}
//             matching score:
//   `
//     );
//     const prompt2 = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume. 
//     Please provide a matching score between 0 and 100 based on the following criteria: 
//     - Relevance of skills
//     - Years of relevant experience
//     - Education background
//     - Specific projects related to the candidate's experience.
    
//     Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.
    
//     format_instructions: {formatting_instructions}
//     resume: {resume}`
//     );

//     // Upload the resume to Cloudinary
//     const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
//       resource_type: "auto", // Automatically detect the file type (PDF or DOCX)
//       folder: "resumes", // Optional folder in Cloudinary
//     });

//     const resumeLink = uploadResult.secure_url;

//     // Extract resume content based on file type
//     let resumeContent;
//     if (uploadedFile.mimetype === "application/pdf") {
//       const loader = new PDFLoader(uploadedFile.path);
//       const docs = await loader.load();
//       resumeContent = docs[0]?.pageContent;
//     } else if (
//       uploadedFile.mimetype ===
//       "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//     ) {
//       const { value } = await mammoth.extractRawText({
//         path: uploadedFile.path,
//       });
//       resumeContent = value;
//     }

//     if (!resumeContent) {
//       throw new Error(`No content found in file: ${uploadedFile.filename}`);
//     }

//     // Clean up the uploaded file from the server
//     await fs.promises.unlink(uploadedFile.path);

//     // Initialize the processing chain
//     const chain = prompt.pipe(model).pipe(parser);
//     const chain2 = prompt2.pipe(model).pipe(parser2);

//     // Invoke the chain with the resume and job description
//     const result = await chain.invoke({
//       resume: resumeContent,
//       jobDesc: jobDesc,
//       companyName: companyName,
//       companyId: companyId,
//       formatting_instructions: parser.getFormatInstructions(),
//     });

//     // Assign additional fields
//     result.companyName = companyName;
//     result.jobTitle = jobTitle;
//     result.resumeLink = resumeLink;
//     result.companyId = companyId;
//     // result.linkedinLink = linkedinLink; // Uncomment if LinkedIn link is extracted

//     // Save the result to the database
//     await Resume.create(result);

//     if (checked) {
//       const result2 = await chain2.invoke({
//         resume: resumeContent,
//         companyName: companyName,
//         companyId: companyId,
//         formatting_instructions: parser2.getFormatInstructions(),
//       });

//       // Assign additional fields
//       result2.companyName = companyName;
//       result2.resumeLink = resumeLink;
//       result2.companyId = companyId;
//       // result.linkedinLink = linkedinLink; // Uncomment if LinkedIn link is extracted

//       // Save the result to the database
//       await Candidate.create(result2);
//     }

//     // Respond with the matched result
//     res.json({
//       message: "Resume processed successfully against the job description",
//       result: result,
//     });
//   } catch (error) {
//     console.error("Error processing resume:", error.message);
//     return res.status(500).json({ error: "Error processing resume" });
//   }
// };
