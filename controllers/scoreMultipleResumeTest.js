import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import { io } from "../index.js";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "langchain/output_parsers";
import { z } from "zod";
import Resume from "../model/resumeModel.js";
import Notification from "../model/NotificationModal.js";
import nodemailer from "nodemailer";
import { PDFExtract } from "pdf.js-extract";

dotenv.config();

// Cloudinary setup
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Initialize PDF extractor
const pdfExtract = new PDFExtract();

// Robust PDF text extraction using pdf.js-extract
const extractPDFText = async (filePath) => {
  try {
    console.log(`Extracting text from: ${filePath}`);
    
    const options = {
      firstPage: 1,
      lastPage: undefined,
      password: '',
      verbosity: -1,
      normalizeWhitespace: false,
      disableCombineTextItems: false
    };

    return new Promise((resolve, reject) => {
      pdfExtract.extract(filePath, options, (err, data) => {
        if (err) {
          console.error("PDF extraction error:", err);
          reject(new Error(`PDF extraction failed: ${err.message}`));
          return;
        }

        try {
          let extractedText = '';
          
          if (data && data.pages && data.pages.length > 0) {
            data.pages.forEach((page, pageIndex) => {
              if (page.content && page.content.length > 0) {
                // Sort content by y-coordinate (top to bottom) then x-coordinate (left to right)
                const sortedContent = page.content
                  .filter(item => item.str && item.str.trim().length > 0)
                  .sort((a, b) => {
                    const yDiff = Math.abs(a.y - b.y);
                    if (yDiff < 2) { // Same line
                      return a.x - b.x;
                    }
                    return b.y - a.y; // Top to bottom (higher y values first)
                  });

                let currentLineY = null;
                let currentLine = '';

                sortedContent.forEach(item => {
                  if (currentLineY === null || Math.abs(item.y - currentLineY) > 2) {
                    // New line
                    if (currentLine.trim()) {
                      extractedText += currentLine.trim() + '\n';
                    }
                    currentLine = item.str;
                    currentLineY = item.y;
                  } else {
                    // Same line, add space if needed
                    currentLine += ' ' + item.str;
                  }
                });

                // Add the last line
                if (currentLine.trim()) {
                  extractedText += currentLine.trim() + '\n';
                }
              }
            });
          }

          // Clean up the text
          extractedText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();

          if (!extractedText || extractedText.length < 50) {
            reject(new Error("Insufficient text extracted from PDF"));
            return;
          }

          console.log(`Successfully extracted ${extractedText.length} characters`);
          resolve(extractedText);

        } catch (processingError) {
          console.error("Error processing PDF data:", processingError);
          reject(new Error(`Error processing PDF data: ${processingError.message}`));
        }
      });
    });

  } catch (error) {
    console.error("PDF text extraction error:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

// Enhanced Zod Schema with detailed descriptions
const matchingScoreDetailsSchema = z.object({
  skillsMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Skill matching score (0-100). Calculate as: (Number of matched job skills / Total job skills required) * 100. Include exact matches and close synonyms/related technologies."),

  experienceMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Experience matching score (0-100). Consider: years of relevant experience, industry relevance, role similarity, and responsibility level. Score based on how well candidate's background aligns with job requirements."),

  educationMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Education matching score (0-100). Evaluate: degree level relevance, field of study alignment, certifications, and additional training. Higher scores for exact field matches and advanced degrees when required."),

  overallMatch: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Overall matching score (0-100). Weighted calculation: (skillsMatch * 0.4) + (experienceMatch * 0.35) + (educationMatch * 0.25). Represents candidate's total fit for the position."),
});

const analysisSchema = z.object({
  skills: z.object({
    candidateSkills: z
      .array(z.string())
      .describe("COMPLETE list of ALL skills found in the candidate's resume. Include: technical skills (programming languages, frameworks, tools), soft skills (leadership, communication), industry knowledge, certifications, and any other competencies mentioned. Be comprehensive - extract every skill, even if not directly job-related."),

    matched: z
      .array(z.string())
      .describe("Skills from the job description that the candidate possesses. Match exactly or through synonyms/related technologies. Examples: if job requires 'React' and resume has 'React.js', count as matched. Include partial matches like 'JavaScript' for 'Node.js' requirements."),

    notMatched: z
      .array(z.string())
      .describe("Skills mentioned in the job description that the candidate does NOT have. Only list skills specifically required by the job that are missing from the candidate's resume. Do not include candidate's extra skills here - only job requirements they lack."),
  }),

  experience: z.object({
    relevantExperience: z
      .string()
      .min(10)
      .describe("Detailed summary of the candidate's most relevant work experience. Include: specific roles, key responsibilities, notable achievements, and how their experience relates to the job requirements. Focus on experience that directly applies to the target position."),

    yearsOfExperience: z
      .string()
      .min(1)
      .describe("Total years of relevant professional experience. Format as '3 years', '5+ years', '10-12 years', etc. Calculate based on work history that's relevant to the target role, not just total career time."),
  }),

  education: z.object({
    highestDegree: z
      .string()
      .min(3)
      .describe("Most advanced degree or qualification obtained. Format as 'Bachelor's in Computer Science', 'Master's in Business Administration', 'PhD in Engineering', 'High School Diploma', 'Professional Certificate in Data Science', etc. Include field of study."),

    relevantCourses: z
      .array(z.string())
      .describe("List of relevant courses, certifications, training programs, or educational achievements mentioned in the resume. Include professional certifications, online courses, bootcamps, and specialized training relevant to the job."),
  }),

  projects: z
    .array(z.string())
    .describe("List of relevant projects mentioned in the resume. Focus on projects that demonstrate skills needed for the job. Include brief description of each project's relevance to the target role. Example: 'E-commerce web app using React and Node.js - demonstrates full-stack development skills required for this position.'"),

  recommendation: z
    .enum(['Strongly Recommended', 'Recommended', 'Good Fit', 'Average Fit', 'Not a good fit'])
    .describe("Final recommendation based on overall analysis. Strongly Recommended (90-100% match), Recommended (75-89%), Good Fit (60-74%), Average Fit (45-59%), Not a good fit (<45%)."),

  comments: z
    .string()
    .min(50)
    .describe("Comprehensive evaluation comments. Include: key strengths that make them suitable, areas of concern or skill gaps, standout achievements, cultural fit indicators, and specific reasons for the recommendation. Provide actionable insights for hiring decision."),

  additionalNotes: z
    .string()
    .optional()
    .describe("Additional observations not covered elsewhere. May include: availability indicators, willingness to relocate, language skills, unique qualifications, potential red flags, or other relevant information that could impact hiring decision."),
});

const candidateSchema = z.object({
  candidateName: z
    .string()
    .min(1)
    .describe("Extract the candidate's complete name from resume. Look in header, contact section, or document title. Return full name exactly as written (e.g., 'John Michael Smith'). If only partial name found, use what's available. Never return 'Not found' - always find some identifying name."),
  
  email: z
    .string()
    .min(1)
    .describe("Extract primary email address from resume. Look for patterns containing '@' symbol. Return in standard format (e.g., 'john.smith@gmail.com'). If multiple emails found, prioritize professional/personal email over academic. If truly not found, return 'Not found'."),
  
  mobile: z
    .string()
    .min(1)
    .describe("Extract phone number from resume. Look for digit sequences with country codes (+1, +91, etc.), parentheses, dashes, or spaces. Include country code if available (e.g., '+1-555-123-4567'). If only local number found, include it as-is. Return 'Not provided' only if absolutely no phone number exists."),
  
  jobTitle: z
    .string()
    .min(1)
    .describe("Extract current or target job title. Check: objective/summary section, most recent work experience, or profile heading. Examples: 'Senior Software Engineer', 'Marketing Manager', 'Data Scientist'. If unclear, infer from skills and experience. Avoid generic titles like 'Professional' or 'Employee'."),
  
  companyName: z
    .string()
    .min(1)
    .describe("Extract current or most recent employer's name from work experience section. Return company name as written (e.g., 'Google Inc.', 'Microsoft Corporation', 'ABC Marketing Agency'). If currently unemployed, use last employer. If self-employed, return 'Self-Employed' or business name."),
  
  linkedinLink: z
    .string()
    .min(1)
    .describe("Extract LinkedIn profile URL from resume. Look for patterns like 'linkedin.com/in/', 'linkedin.com/pub/', or 'linkedin.com/profile/'. Return complete URL format: 'https://linkedin.com/in/username'. If only partial link found, construct full URL. Return 'Not found' only if no LinkedIn reference exists."),
  
  matchingScoreDetails: matchingScoreDetailsSchema,
  analysis: analysisSchema
});

// Enhanced prompt template with detailed skill matching instructions
const promptTemplate = PromptTemplate.fromTemplate(
  `You are an expert technical recruiter and resume analyst. Analyze this resume against the job requirements with extreme precision and comprehensive skill extraction.

**CRITICAL EXTRACTION AND ANALYSIS RULES:**

**1. CANDIDATE INFORMATION EXTRACTION:**
- NAME: Search thoroughly in header, contact section, document properties, or any mention of the person's identity
- EMAIL: Look for any text containing '@' - scan entire document
- PHONE: Find any sequence of numbers that could be a phone number (with +, (), -, spaces)
- JOB TITLE: Check objective, summary, current role, or infer from recent experience
- COMPANY: Extract from work experience section - most recent employer
- LINKEDIN: Look for linkedin.com references, even partial ones

**2. COMPREHENSIVE SKILL ANALYSIS:**

**candidateSkills (COMPLETE LIST):**
Extract EVERY skill mentioned in the resume, including:
- Programming languages (JavaScript, Python, Java, C++, etc.)
- Frameworks & libraries (React, Angular, Django, Spring, etc.)  
- Tools & technologies (Git, Docker, AWS, Jenkins, etc.)
- Databases (MySQL, MongoDB, PostgreSQL, etc.)
- Methodologies (Agile, Scrum, DevOps, etc.)
- Soft skills (Leadership, Communication, Problem-solving, etc.)
- Industry knowledge (Healthcare, Finance, E-commerce, etc.)
- Certifications (AWS Certified, PMP, Scrum Master, etc.)
- Languages spoken (English, Spanish, Mandarin, etc.)
Be exhaustive - include every competency mentioned.

**matched (Job Skills They Have):**
From the job description requirements, list skills the candidate POSSESSES:
- Exact matches: Job wants "React" → Resume has "React"
- Synonym matches: Job wants "JavaScript" → Resume has "JS" or "ECMAScript"
- Related technology: Job wants "Node.js" → Resume has "JavaScript" + "Backend"
- Framework knowledge: Job wants "REST APIs" → Resume has "API development"
Only include skills that are specifically mentioned in job requirements AND found in candidate's resume.

**notMatched (Missing Job Requirements):**
List ONLY the skills mentioned in job description that candidate LACKS:
- Only job requirements the candidate doesn't have
- Do NOT include candidate's extra skills that aren't in job description
- Be precise about what's missing vs what they have through related experience

**3. SCORING METHODOLOGY:**
- **skillsMatch**: (Matched job skills / Total job skills) × 100
- **experienceMatch**: Years relevance + role similarity + industry fit
- **educationMatch**: Degree level + field relevance + certifications  
- **overallMatch**: (skillsMatch × 0.4) + (experienceMatch × 0.35) + (educationMatch × 0.25)

**4. DETAILED ANALYSIS REQUIREMENTS:**
- **relevantExperience**: Summarize work history most applicable to target role
- **projects**: Focus on projects demonstrating job-relevant skills
- **recommendation**: Base on overall match percentage
- **comments**: Provide specific strengths, gaps, and hiring insights (minimum 50 words)

**RESUME TEXT TO ANALYZE:**
{resumeText}

**JOB DESCRIPTION & REQUIREMENTS:**
{jobDesc}

**RECRUITER INSTRUCTIONS:**
{additionalInstructions}

{skillSection}

**OUTPUT FORMAT:**
{format_instructions}

**QUALITY ASSURANCE:**
- Double-check all extracted personal information
- Ensure candidateSkills includes ALL skills from resume
- Verify matched/notMatched logic is correct
- Provide detailed justification for scores
- Never leave fields empty - always provide meaningful content`
);

// Parallel processing function
const processResumeParallel = async (file, jobDesc, additionalInstructions, skillSection, companyName, jobTitle, companyId, parsedSkills) => {
  const fileName = file.originalname;
  console.log(`Starting processing: ${fileName}`);
  
  try {
    // Step 1: Extract text from PDF
    const resumeText = await extractPDFText(file.path);
    console.log(`Text extracted for ${fileName}: ${resumeText.substring(0, 100)}...`);

    // Step 2: Upload to Cloudinary (parallel with AI processing)
    const cloudinaryUpload = cloudinary.uploader.upload(file.path, {
      resource_type: "auto",
      folder: "resumes",
      public_id: `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    // Step 3: AI Analysis (parallel with upload)
    const model = new ChatOpenAI({ 
      modelName: "gpt-4o", // Use latest model
      temperature: 0.1,
      maxTokens: 4000,
      timeout: 60000,
    });
    
    const parser = StructuredOutputParser.fromZodSchema(candidateSchema);
    const chain = promptTemplate.pipe(model).pipe(parser);

    const aiAnalysis = chain.invoke({
      jobDesc,
      additionalInstructions,
      resumeText,
      skillSection,
      format_instructions: parser.getFormatInstructions(),
    });

    // Wait for both operations to complete
    const [cloudRes, result] = await Promise.all([cloudinaryUpload, aiAnalysis]);

    console.log(`AI analysis completed for ${fileName}`);

    // Validate and enhance result
    if (!result) {
      throw new Error("AI returned empty result");
    }

    // Add metadata
    result.resumeLink = cloudRes.secure_url;
    result.companyName = companyName;
    result.jobTitle = jobTitle;
    result.companyId = companyId;
    result.originalFileName = fileName;
    
    if (parsedSkills.length) {
      result.additionalSkillsConsidered = parsedSkills;
    }

    // Fallback for candidate name
    if (!result.candidateName || result.candidateName === "Not found") {
      const nameFromFile = fileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      result.candidateName = nameFromFile || "Unknown Candidate";
    }

    // Save to database
    const savedResume = await Resume.create(result);
    
    console.log(`Successfully processed: ${fileName}`);
    
    return {
      success: true,
      file: fileName,
      result: { ...result, _id: savedResume._id }
    };

  } catch (error) {
    console.error(`Processing failed for ${fileName}:`, error);
    return {
      success: false,
      file: fileName,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    // Cleanup file
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (cleanupError) {
      console.error(`Cleanup failed for ${fileName}:`, cleanupError);
    }
  }
};

// Main Controller - Optimized for speed and reliability
export const scoreMultipleResumeTest = async (req, res) => {
  const startTime = Date.now();
  
  const {
    jobDesc,
    companyName,
    jobTitle,
    additionalInstructions = "N/A",
    additionalSkills,
    userEmail,
    userId,
    companyId,
  } = req.body;

  const files = req.files;
  
  // Input validation
  if (!files?.length || !jobDesc) {
    return res.status(400).json({ 
      message: "Missing resumes or job description.",
      error: "MISSING_REQUIRED_FIELDS"
    });
  }

  console.log(`Processing ${files.length} resumes...`);

  // Parse additional skills
  let skillSection = "";
  let parsedSkills = [];
  try {
    parsedSkills = additionalSkills ? JSON.parse(additionalSkills) : [];
    if (parsedSkills.length) {
      skillSection = `**Important Skills to Prioritize:** ${parsedSkills.join(", ")}`;
    }
  } catch (e) {
    console.error("Skill parsing error:", e);
  }

  // Process all resumes in parallel (with concurrency limit)
  const concurrencyLimit = 3; // Process 3 resumes at a time
  const results = [];
  
  for (let i = 0; i < files.length; i += concurrencyLimit) {
    const batch = files.slice(i, i + concurrencyLimit);
    
    const batchPromises = batch.map(file => 
      processResumeParallel(
        file, 
        jobDesc, 
        additionalInstructions, 
        skillSection, 
        companyName, 
        jobTitle, 
        companyId, 
        parsedSkills
      )
    );

    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults.map(r => r.value || r.reason));

    // Emit progress
    const completed = Math.min(i + concurrencyLimit, files.length);
    io.emit("progress", { 
      completed, 
      total: files.length,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  }

  // Separate successful and failed results
  const processed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  const processingTime = (Date.now() - startTime) / 1000;
  console.log(`Processing completed in ${processingTime}s. Success: ${processed.length}, Failed: ${failed.length}`);

  // Send completion email
  if (userEmail) {
    try {
      const emailHtml = `
        <h2>Resume Screening Complete</h2>
        <p><strong>Job Title:</strong> ${jobTitle}</p>
        <p><strong>Processing Time:</strong> ${processingTime.toFixed(1)} seconds</p>
        <hr>
        <p>✅ <strong>Successfully Processed:</strong> ${processed.length} resumes</p>
        <p>❌ <strong>Failed:</strong> ${failed.length} resumes</p>
        ${failed.length > 0 ? `
          <h3>Failed Files:</h3>
          <ul>
            ${failed.map(f => `<li>${f.file}: ${f.error}</li>`).join('')}
          </ul>
        ` : ''}
      `;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: `Resume Screening Complete - ${processed.length}/${files.length} Successful`,
        html: emailHtml,
      });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
    }
  }

  // Send notification
  if (userId && jobTitle) {
    try {
      const notify = await Notification.create({
        message: `Resume screening completed: ${processed.length}/${files.length} successful in ${processingTime.toFixed(1)}s`,
        recipientId: userId,
        jobId: jobTitle,
        metadata: {
          processedCount: processed.length,
          failedCount: failed.length,
          totalCount: files.length,
          processingTime: processingTime
        }
      });
      
      io.emit("newNotification", notify);
    } catch (notificationError) {
      console.error("Notification creation failed:", notificationError);
    }
  }

  // Return comprehensive response
  const response = {
    success: processed.length > 0,
    message: `Processing completed: ${processed.length}/${files.length} resumes successful`,
    statistics: {
      total: files.length,
      processed: processed.length,
      failed: failed.length,
      successRate: ((processed.length / files.length) * 100).toFixed(1) + "%",
      processingTime: processingTime.toFixed(1) + "s",
      averageTimePerResume: (processingTime / files.length).toFixed(1) + "s"
    },
    result: processed,
    failedResumes: failed,
    additionalSkillsProcessed: parsedSkills,
    timestamp: new Date().toISOString()
  };

  const statusCode = processed.length > 0 ? 200 : 500;
  res.status(statusCode).json(response);
};


// not working -- change 18 september 2025
// import path from "path";
// import fs from "fs";
// import dotenv from "dotenv";
// import { v2 as cloudinary } from "cloudinary";
// import { io } from "../index.js";
// import { ChatOpenAI } from "@langchain/openai";
// import { PromptTemplate } from "@langchain/core/prompts";
// import { StructuredOutputParser } from "langchain/output_parsers";
// import { z } from "zod";
// import Resume from "../model/resumeModel.js";
// import Notification from "../model/NotificationModal.js";
// import nodemailer from "nodemailer";

// dotenv.config();

// // Cloudinary setup
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Email transporter
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// // --------------------- Zod Schema ---------------------
// const matchingScoreDetailsSchema = z.object({
//   skillsMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Skill matching score (0-100). Based on overlap between resume skills and job description skills."),

//   experienceMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Experience matching score (0-100). Based on relevance of candidate’s job history to job requirements."),

//   educationMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Education matching score (0-100). Based on highest qualification and relevance to the job."),

//   overallMatch: z
//     .number()
//     .int()
//     .min(0)
//     .max(100)
//     .describe("Combined match score across skills, experience, and education. Consider weighted average or summary judgment."),
// });

// const analysisSchema = z.object({
//   skills: z.object({
//     candidateSkills: z
//       .array(z.string())
//       .describe("List of all skills explicitly or implicitly mentioned in the resume, including technical, soft, and tools."),

//     matched: z
//       .array(z.string())
//       .describe("Skills from job description that are found in the resume. Match can be exact or fuzzy."),

//     notMatched: z
//       .array(z.string())
//       .describe("Job description skills that were not found or inferred from the resume."),
//   }),

//   experience: z.object({
//     relevantExperience: z
//       .string()
//       .describe("Short paragraph summarizing relevant past job roles, responsibilities, or industries. Use most relevant info."),

//     yearsOfExperience: z
//       .string()
//       .describe("Total number of years the candidate has worked in related fields. Use numeric format like '3 years', '5+ years'."),
//   }),

//   education: z.object({
//     highestDegree: z
//       .string()
//       .describe("Most advanced degree or certification obtained by the candidate. E.g., 'B.Sc. in Computer Science'."),

//     relevantCourses: z
//       .array(z.string())
//       .describe("Relevant academic or professional courses, certifications, or training mentioned in the resume."),
//   }),

//   projects: z
//     .array(z.string())
//     .describe("List of relevant personal or professional projects mentioned in the resume. Focus on those matching job domain."),

//   recommendation: z
//     .string()
//     .describe("Final evaluation of the candidate’s fit for the job. Use one of: 'Strongly Recommended', 'Recommended', 'Good Fit', 'Average Fit', 'Not a good fit'."),

//   comments: z
//     .string()
//     .describe("Detailed notes or reasoning supporting the recommendation. Summarize strengths, concerns, or highlights."),

//   additionalNotes: z
//     .string()
//     .optional()
//     .describe("Any extra information not covered in other sections. May include availability, relocation info, languages, etc."),
// });

// const candidateSchema = z.object({
//   candidateName: z
//     .string()
//     .describe("Extract the candidate’s **full name** from the resume header or top section or at least get one single name also. Return in full form, e.g., 'John A. Doe' or single word of name. If not found, return 'Not found'."),
  
//   email: z
//     .string()
//     .describe("Extract the **primary email address** of the candidate. Use standard email format, e.g., 'john@example.com'. If not found, return 'Not found'."),
  
//   mobile: z
//     .string()
//     .describe("Extract the **mobile number with country code** if available. Format example: '+880123456789'. If not found, return 'Not provided'."),
  
//   jobTitle: z
//     .string()
//     .describe("Extract the job title the candidate is targeting or most recently held, e.g., 'Software Engineer'. If unclear, guess based on content or return 'Not found'."),
  
//   companyName: z
//     .string()
//     .describe("Extract the company name where the candidate is currently working or last worked. Example: 'Google', 'Acme Corp'. If not found, return 'Not found'."),
  
//   linkedinLink: z
//     .string()
//     .describe("Extract a valid LinkedIn profile URL from the resume. Format: 'https://linkedin.com/in/username'. If not found, return 'Not found'."),
  
//   matchingScoreDetails: matchingScoreDetailsSchema, // assumed to already have good validation
//   analysis: analysisSchema // assumed to already include your custom instructions
// });

// // --------------------- Prompt Template ---------------------
// const promptTemplate = PromptTemplate.fromTemplate(
//   `You are a professional technical recruiter. Your task is to analyze a candidate's resume against a job description, extract relevant details, and score their suitability.

// **1. Extraction:**
// - Full Name, Email, Mobile (with country code, e.g., +1), and LinkedIn URL.
// - If not found, use 'Not found' or 'Not provided'.

// **2. Matching Score (0-100):**
// - skillsMatch: How well do their skills match the job?
// - experienceMatch: Is their experience relevant?
// - educationMatch: Does their education align?
// - overallMatch: Final suitability score.

// **3. Detailed Analysis:**
// - Breakdown of skills, experience summary, education, relevant projects.
// - Give a clear recommendation and comments.

// **Context:**
// - Job Description: {jobDesc}
// - Recruiter Instructions: {additionalInstructions}
// {skillSection}

// **Resume PDF Link (for analysis):**
// {resumeLink}

// Use this format:
// {format_instructions}`
// );

// // --------------------- Main Controller ---------------------
// export const scoreMultipleResumeTest = async (req, res) => {
//   const {
//     jobDesc,
//     companyName,
//     jobTitle,
//     additionalInstructions = "N/A",
//     additionalSkills,
//     userEmail,
//     userId,
//     companyId,
//   } = req.body;

//   const files = req.files;
//   if (!files?.length || !jobDesc) {
//     return res
//       .status(400)
//       .json({ message: "Missing resumes or job description." });
//   }

//   const total = files.length;
//   let completed = 0;
//   const processed = [];
//   const failed = [];

//   let skillSection = "";
//   let parsedSkills = [];
//   try {
//     parsedSkills = additionalSkills ? JSON.parse(additionalSkills) : [];
//     if (parsedSkills.length) {
//       skillSection = `- Important Skills to Prioritize: ${parsedSkills.join(
//         ", "
//       )}`;
//     }
//   } catch (e) {
//     console.error("Skill parsing error", e);
//   }

//   const model = new ChatOpenAI({ modelName: "gpt-4.1", temperature: 0.5 });
//   const parser = StructuredOutputParser.fromZodSchema(candidateSchema);
//   const chain = promptTemplate.pipe(model).pipe(parser);

//   for (const file of files) {
//     try {
//       // Upload file to Cloudinary
//       const cloudRes = await cloudinary.uploader.upload(file.path, {
//         resource_type: "auto",
//         folder: "resumes",
//       });

//       // Send file URL to GPT
//       const result = await chain.invoke({
//         jobDesc,
//         additionalInstructions,
//         resumeLink: cloudRes.secure_url,
//         skillSection,
//         format_instructions: parser.getFormatInstructions(),
//       });

//       // Add metadata
//       result.resumeLink = cloudRes.secure_url;
//       result.companyName = companyName;
//       result.jobTitle = jobTitle;
//       result.companyId = companyId;
//       if (parsedSkills.length) {
//         result.additionalSkillsConsidered = parsedSkills;
//       }

//       await Resume.create(result);
//       processed.push({ file: file.originalname, result });
//     } catch (err) {
//       failed.push({ file: file.originalname, error: err.message });
//     } finally {
//       completed++;
//       io.emit("progress", { completed, total });
//       if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
//     }
//   }

//   if (userEmail) {
//     await transporter.sendMail({
//       from: process.env.EMAIL_USER,
//       to: userEmail,
//       subject: `Resume Screening Complete for ${jobTitle}`,
//       html: `✅ Resume screening completed.<br/>✅ Processed: ${processed.length}, ❌ Failed: ${failed.length}.`,
//     });
//   }

//   if (userId && jobTitle) {
//     const notify = await Notification.create({
//       message: `Candidate screening completed for job: ${jobTitle}`,
//       recipientId: userId,
//       jobId: jobTitle,
//     });
//     io.emit("newNotification", notify);
//   }

//   res.status(200).json({
//     message: "Resume scoring complete.",
//     result: processed,
//     failedResumes: failed,
//     additionalSkillsProcessed: parsedSkills,
//   });
// };


// ---------------- commented code in 2023-07-12 ----------------
//   `
// import { PDFLoader } from "langchain/document_loaders/fs/pdf"
// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import fs from "fs"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import Resume from "../model/resumeModel.js"
// import JobDescription from "../model/JobDescriptionModel.js"
// import nodemailer from "nodemailer"
// import { io } from "../index.js"
// import mammoth from "mammoth"
// import { v2 as cloudinary } from "cloudinary"
// import Notification from "../model/NotificationModal.js"

// dotenv.config()

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// })

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// })

// export const scoreMultipleResumeTest = async (req, res) => {
//   const uploadedFiles = req.files
//   const {
//     jobDesc,
//     companyName,
//     jobTitle,
//     additionalInstructions,
//     additionalSkills,
//     userEmail,
//     userId,
//     companyId,
//   } = req.body
//   const matchedResumes = []

//   if (!uploadedFiles || uploadedFiles.length === 0) {
//     return res.status(400).json({ message: "No files uploaded" })
//   }

//   if (!jobDesc) {
//     return res.status(400).json({ message: "No job description provided" })
//   }

//   // Parse additional skills if provided
//   let parsedAdditionalSkills = []
//   if (additionalSkills) {
//     try {
//       parsedAdditionalSkills = JSON.parse(additionalSkills)
//     } catch (error) {
//       console.error("Error parsing additional skills:", error)
//     }
//   }

//   // Update JobDescription with additional skills if provided
//   if (jobTitle && parsedAdditionalSkills.length > 0) {
//     try {
//       await JobDescription.findByIdAndUpdate(
//         jobTitle,
//         {
//           $set: { additional_skills: parsedAdditionalSkills },
//         },
//         { new: true },
//       )
//       console.log(`Updated job ${jobTitle} with additional skills:`, parsedAdditionalSkills)
//     } catch (error) {
//       console.error("Error updating job description with additional skills:", error)
//     }
//   }

//   const totalResumes = uploadedFiles.length
//   let completedResumes = 0

//   const matchingScoreDetailsSchema = z.object({
//     skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
//     experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
//     educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
//     overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
//   })

//   const skillsAnalysisSchema = z.array(
//     z.string().describe("The skills that candidate have is matched with the job description skills"),
//   )

//   const notMatchedSkillsAnalysisSchema = z.array(
//     z.string().describe("Skills listed in the job description that the candidate does not possess"),
//   )
//   // const notMatchedSkillsAnalysisSchema = z.array(
//   //   z.string().describe("The skills that candidate did not have that mentioned in job description"),
//   // )

//   const experienceAnalysisSchema = z.object({
//     relevantExperience: z.string().describe("Description of relevant experience"),
//     yearsOfExperience: z.string().describe("Years of experience"),
//   })

//   const educationAnalysisSchema = z.object({
//     highestDegree: z.string().describe("Candidate's highest degree"),
//     relevantCourses: z.array(z.string().describe("Relevant courses taken")),
//   })

//   const analysisSchema = z.object({
//     skills: z.object({
//       candidateSkills: z
//         .array(z.string().describe("Skills of the candidate"))
//         .describe("Skills mentioned by the candidate"),
//       matched: skillsAnalysisSchema,
//       notMatched: notMatchedSkillsAnalysisSchema,
//     }),
//     experience: experienceAnalysisSchema,
//     education: educationAnalysisSchema,
//     projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//     recommendation: z.string().describe("Recommendation for the candidate."),
//     comments: z.string().describe("Comments on the candidate's profile."),
//     additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
//   })

//   const candidateSchema = z.object({
//     candidateName: z.string().describe("Candidate's full name or 'Not found' if not present"),
//     email: z.string().describe("Email of the candidate or 'Not found' if not present"),
//     mobile: z.string().describe("Mobile number of the candidate with country code or 'Not provided' if not present"),
//     jobTitle: z.string().describe("Job title of the candidate who is applying for"),
//     companyName: z.string().describe("Company name for which the candidate is applying"),
//     linkedinLink: z.string().describe("LinkedIn link of the candidate or 'Not found' if not present"),
//     matchingScoreDetails: matchingScoreDetailsSchema,
//     analysis: analysisSchema,
//   })

//   try {
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0.5,
//     })

//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema)

//     // Single comprehensive prompt for candidate info extraction and scoring
//     const prompt = PromptTemplate.fromTemplate(
//       `You are a technical recruiter tasked with analyzing a resume against a job description. Your task is to:

//       1. Extract the candidate's information accurately from the resume:
//          - Full name
//          - Email address
//          - Mobile number (with country code, e.g., +1234567890)
//          - LinkedIn URL (if present)
//          If any information is not found, explicitly return 'Not found' for name, email, or LinkedIn, and 'Not provided' for mobile.
//          For the mobile number, if no country code is present, infer the country from the resume content (e.g., address, location, or other context) and add the appropriate country code (e.g., +1 for US/Canada, +91 for India). If the country cannot be determined, default to +1.

//       2. Provide a matching score between 0 and 100 based on the following criteria:
//          - Relevance of skills (including additional skills specified)
//          - Years of relevant experience
//          - Education background
//          - Specific projects related to the job description.

//       ${
//         parsedAdditionalSkills.length > 0
//           ? `IMPORTANT: Pay special attention to these additional skills that are highly valued for this position: ${parsedAdditionalSkills.join(", ")}.
//              Consider these skills when calculating the skills match score and overall match score.`
//           : ""
//       }

//       Format the response as a JSON object including the fields: candidateName, email, mobile, linkedinLink, skillsMatch, experienceMatch, educationMatch, overallMatch, and detailed analysis.

//       format_instructions: {formatting_instructions}
//       resume: {resume}
//       job description: {jobDesc}
//       additional instructions: {additionalInstructions}
//       ${parsedAdditionalSkills.length > 0 ? `additional skills to prioritize: ${parsedAdditionalSkills.join(", ")}` : ""}
//       matching score:
//     `,
//     )

//     await Promise.all(
//       uploadedFiles.map(async (uploadedFile, index) => {
//         try {
//           let resumeContent

//           // Upload to Cloudinary
//           const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
//             resource_type: "auto",
//             folder: "resumes",
//           })

//           const resumeLink = uploadResult.secure_url

//           // Extract resume content based on file type
//           if (uploadedFile.mimetype === "application/pdf") {
//             const loader = new PDFLoader(uploadedFile.path)
//             const docs = await loader.load()
//             resumeContent = docs[0]?.pageContent
//           } else if (
//             uploadedFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//           ) {
//             const { value } = await mammoth.extractRawText({
//               path: uploadedFile.path,
//             })
//             resumeContent = value
//           }

//           if (!resumeContent) {
//             throw new Error(`No content found in file: ${uploadedFile.filename}`)
//           }

//           // Run AI analysis with single prompt
//           const chain = prompt.pipe(model).pipe(parser)
//           const result = await chain.invoke({
//             resume: resumeContent,
//             jobDesc: jobDesc,
//             additionalInstructions: additionalInstructions,
//             formatting_instructions: parser.getFormatInstructions(),
//           })

//           // Assign additional fields
//           result.companyName = companyName
//           result.jobTitle = jobTitle
//           result.resumeLink = resumeLink
//           result.companyId = companyId

//           // Add additional skills information to the result
//           if (parsedAdditionalSkills.length > 0) {
//             result.additionalSkillsConsidered = parsedAdditionalSkills
//           }

//           // Save to database
//           await Resume.create(result)

//           matchedResumes.push({
//             file: uploadedFile.filename,
//             result: result,
//           })

//           // Clean up uploaded file
//           await fs.promises.unlink(uploadedFile.path)

//           // Update progress
//           completedResumes += 1
//           io.emit("progress", {
//             completed: completedResumes,
//             total: totalResumes,
//           })
//         } catch (error) {
//           console.log(`Error processing file: ${uploadedFile.filename}`, error.message)
//         }
//       }),
//     )

//     // Send email notification if userEmail is provided
//     if (userEmail) {
//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: userEmail,
//         subject: "Resume Processing Complete",
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//               <h2 style="text-align: center; color: #4CAF50;">Resume Processing Complete</h2>
//               <p>Dear Recruiter,</p>
//               <p>We are pleased to inform you that your resumes have been successfully processed. You can now review the results of the analysis.</p>
//               ${
//                 parsedAdditionalSkills.length > 0
//                   ? `<p><strong>Additional Skills Considered:</strong> ${parsedAdditionalSkills.join(", ")}</p>`
//                   : ""
//               }
//               <p><strong>What to do next:</strong></p>
//               <ol>
//                   <li>Check the analysis results for detailed feedback on the resumes.</li>
//                   <li>If you have any questions or need further assistance, feel free to reply to company email.</li>
//               </ol>
//               <p style="text-align: center;">
//                   <a href="https://bloomix2.netlify.app/main/pullcvs" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">View Results</a>
//               </p>
//               <p>Thank you for using our service!</p>
//               <p>Best regards,</p>
//               <p>Bloomix</p>
//           </div>
//         `,
//       }

//       await transporter.sendMail(mailOptions)
//     }

//     // Create and save notification
//     const newNotification = new Notification({
//       message: "Candidates screening complete for a job",
//       recipientId: userId,
//       jobId: jobTitle,
//     })

//     await newNotification.save()
//     io.emit("newNotification", newNotification)

//     res.json({
//       message: "Files uploaded successfully",
//       result: matchedResumes,
//       additionalSkillsProcessed: parsedAdditionalSkills,
//     })
//   } catch (error) {
//     console.error("Error processing resumes:", error.message)
//     return res.status(500).json({ error: "Error processing resumes" })
//   }
// }
// -------------change in 12 july 2025---------------
// import { PDFLoader } from "langchain/document_loaders/fs/pdf"
// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import fs from "fs"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import Resume from "../model/resumeModel.js"
// import JobDescription from "../model/JobDescriptionModel.js"
// import nodemailer from "nodemailer"
// import { io } from "../index.js"
// import mammoth from "mammoth"
// import { v2 as cloudinary } from "cloudinary"
// import Notification from "../model/NotificationModal.js"

// dotenv.config()

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// })

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// })

// export const scoreMultipleResumeTest = async (req, res) => {
//   const uploadedFiles = req.files
//   const {
//     jobDesc,
//     companyName,
//     jobTitle,
//     additionalInstructions,
//     additionalSkills, // NEW: Additional skills from frontend
//     userEmail,
//     userId,
//     companyId,
//   } = req.body
//   const matchedResumes = []

//   if (!uploadedFiles || uploadedFiles.length === 0) {
//     return res.status(400).json({ message: "No files uploaded" })
//   }

//   if (!jobDesc) {
//     return res.status(400).json({ message: "No job description provided" })
//   }

//   // Parse additional skills if provided
//   let parsedAdditionalSkills = []
//   if (additionalSkills) {
//     try {
//       parsedAdditionalSkills = JSON.parse(additionalSkills)
//     } catch (error) {
//       console.error("Error parsing additional skills:", error)
//     }
//   }

//   // Update JobDescription with additional skills if provided
//   if (jobTitle && parsedAdditionalSkills.length > 0) {
//     try {
//       await JobDescription.findByIdAndUpdate(
//         jobTitle,
//         {
//           $set: { additional_skills: parsedAdditionalSkills },
//           // $push: {
//           //   modifications: {
//           //     user_name: "System", // You can get this from currentUser if available
//           //     user_email: userEmail || "system@company.com",
//           //     date: new Date(),
//           //   },
//           // },
//         },
//         { new: true },
//       )
//       console.log(`Updated job ${jobTitle} with additional skills:`, parsedAdditionalSkills)
//     } catch (error) {
//       console.error("Error updating job description with additional skills:", error)
//     }
//   }

//   const totalResumes = uploadedFiles.length
//   let completedResumes = 0

//   const matchingScoreDetailsSchema = z.object({
//     skillsMatch: z.number().int().min(0).max(100).describe("Match score for skills"),
//     experienceMatch: z.number().int().min(0).max(100).describe("Match score for experience"),
//     educationMatch: z.number().int().min(0).max(100).describe("Match score for education"),
//     overallMatch: z.number().int().min(0).max(100).describe("Overall matching score"),
//   })

//   const skillsAnalysisSchema = z.array(
//     z.string().describe("The skills that candidate have is matched with the job description skills "),
//   )
//   const notMatchedSkillsAnalysisSchema = z.array(
//     z.string().describe("tha skills that have in job description but not matched with candidate skills"),
//   )

//   const experienceAnalysisSchema = z.object({
//     relevantExperience: z.string().describe("Description of relevant experience"),
//     yearsOfExperience: z.string().describe("Years of experience"),
//   })

//   const educationAnalysisSchema = z.object({
//     highestDegree: z.string().describe("Candidate's highest degree"),
//     relevantCourses: z.array(z.string().describe("Relevant courses taken")),
//   })

//   const analysisSchema = z.object({
//     skills: z.object({
//       candidateSkills: z
//         .array(z.string().describe("Skills of the candidate"))
//         .describe("skills mentioned by the candidate"),
//       matched: skillsAnalysisSchema,
//       notMatched: notMatchedSkillsAnalysisSchema,
//     }),
//     experience: experienceAnalysisSchema,
//     education: educationAnalysisSchema,
//     projects: z.array(z.string().describe("Project of the candidate")).describe("Projects mentioned by the candidate"),
//     recommendation: z.string().describe("Recommendation for the candidate."),
//     comments: z.string().describe("Comments on the candidate's profile."),
//     additionalNotes: z.string().optional().describe("Additional notes about the candidate"),
//   })

//   const candidateSchema = z.object({
//     candidateName: z.string().describe("Candidate's full name"),
//     email: z.string().describe("email of the candidate"),
//     mobile: z.number().describe("mobile number of the candidate (without country code)"),
//     jobTitle: z.string().describe("Job title of the candidate who is applying for"),
//     companyName: z.string().describe("Company name for which the candidate is applying"),
//     linkedinLink: z.string().describe("linkedin link of the candidate"),
//     matchingScoreDetails: matchingScoreDetailsSchema,
//     analysis: analysisSchema,
//   })

//   try {
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     })

//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema)

//     // Enhanced prompt to include additional skills
//     const prompt = PromptTemplate.fromTemplate(
//       `You are a technical recruiter capable of analyzing a resume with a job description. Please provide a matching score between 0 and 100 based on the following criteria:
//   - Relevance of skills (including additional skills specified)
//   - Years of relevant experience
//   - Education background
//   - Specific projects related to the job description.

//   ${
//     parsedAdditionalSkills.length > 0
//       ? `IMPORTANT: Pay special attention to these additional skills that are highly valued for this position: ${parsedAdditionalSkills.join(", ")}.
//     Consider these skills when calculating the skills match score and overall match score.`
//       : ""
//   }

//   Format the response as a JSON object including the fields: skillsMatch, experienceMatch, educationMatch, overallMatch, and any other relevant analysis.

//   format_instructions: {formatting_instructions}
//             resume: {resume}
//             job description: {jobDesc}
//             additional instructions: {additionalInstructions}
//             ${parsedAdditionalSkills.length > 0 ? `additional skills to prioritize: ${parsedAdditionalSkills.join(", ")}` : ""}
//             matching score:
//   `,
//     )

//     await Promise.all(
//       uploadedFiles.map(async (uploadedFile, index) => {
//         try {
//           let resumeContent

//           const uploadResult = await cloudinary.uploader.upload(uploadedFile.path, {
//             resource_type: "auto",
//             folder: "resumes",
//           })

//           const resumeLink = uploadResult.secure_url

//           if (uploadedFile.mimetype === "application/pdf") {
//             const loader = new PDFLoader(uploadedFile.path)
//             const docs = await loader.load()
//             resumeContent = docs[0]?.pageContent
//           } else if (
//             uploadedFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//           ) {
//             const { value } = await mammoth.extractRawText({
//               path: uploadedFile.path,
//             })
//             resumeContent = value
//           }

//           if (!resumeContent) {
//             throw new Error(`No content found in file: ${uploadedFile.filename}`)
//           }

//           const chain = prompt.pipe(model).pipe(parser)
//           const result = await chain.invoke({
//             resume: resumeContent,
//             jobDesc: jobDesc,
//             additionalInstructions: additionalInstructions,
//             companyName: companyName,
//             companyId: companyId,
//             formatting_instructions: parser.getFormatInstructions(),
//           })

//           result.companyName = companyName
//           result.jobTitle = jobTitle
//           result.resumeLink = resumeLink
//           result.companyId = companyId

//           // Add additional skills information to the result
//           if (parsedAdditionalSkills.length > 0) {
//             result.additionalSkillsConsidered = parsedAdditionalSkills
//           }

//           await Resume.create(result)

//           matchedResumes.push({
//             file: uploadedFile.filename,
//             result: result,
//           })

//           await fs.promises.unlink(uploadedFile.path)

//           completedResumes += 1
//           io.emit("progress", {
//             completed: completedResumes,
//             total: totalResumes,
//           })
//         } catch (error) {
//           console.log(`Error processing file: ${uploadedFile.filename}`, error.message)
//         }
//       }),
//     )

//     if (userEmail) {
//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: userEmail,
//         subject: "Resume Processing Complete",
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//               <h2 style="text-align: center; color: #4CAF50;">Resume Processing Complete</h2>
//               <p>Dear Recruiter,</p>
//               <p>We are pleased to inform you that your resume has been successfully processed. You can now review the results of the analysis.</p>
//               ${
//                 parsedAdditionalSkills.length > 0
//                   ? `<p><strong>Additional Skills Considered:</strong> ${parsedAdditionalSkills.join(", ")}</p>`
//                   : ""
//               }
//               <p><strong>What to do next:</strong></p>
//               <ol>
//                   <li>Check the analysis results for detailed feedback on your resume.</li>
//                   <li>If you have any questions or need further assistance, feel free to reply to company email.</li>
//               </ol>
//               <p style="text-align: center;">
//                   <a href="https://bloomix2.netlify.app/main/pullcvs" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">View Results</a>
//               </p>
//               <p>Thank you for using our service!</p>
//               <p>Best regards,</p>
//               <p>Bloomix</p>
//           </div>
//         `,
//       }

//       await transporter.sendMail(mailOptions)
//     }

//     const newNotification = new Notification({
//       message: "Candidates screening complete for a job",
//       recipientId: userId,
//       jobId: jobTitle,
//     })

//     await newNotification.save()
//     io.emit("newNotification", newNotification)

//     res.json({
//       message: "Files uploaded successfully",
//       result: matchedResumes,
//       additionalSkillsProcessed: parsedAdditionalSkills,
//     })
//   } catch (error) {
//     console.error("Error processing resumes:", error.message)
//     return res.status(500).json({ error: "Error processing resumes" })
//   }
// }

// import express from "express";
// import http from "http";
// import { Server } from "socket.io";
// import { PDFLoader } from "langchain/document_loaders/fs/pdf";
// import { PromptTemplate } from "@langchain/core/prompts";
// import { OpenAI } from "@langchain/openai";
// import fs from "fs";
// import dotenv from "dotenv";
// import { z } from "zod";
// import { StructuredOutputParser } from "langchain/output_parsers";
// import Resume from "../model/resumeModel.js";
// import nodemailer from "nodemailer"; // Import nodemailer
// import { io } from "../index.js";
// import mammoth from "mammoth";
// import { v2 as cloudinary } from "cloudinary";
// import Notification from "../model/NotificationModal.js";
// import mongoose from 'mongoose';
// dotenv.config();

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Create a transporter object using SMTP transport
// const transporter = nodemailer.createTransport({
//   service: "gmail", // Replace with your email service provider
//   auth: {
//     user: process.env.EMAIL_USER, // Your email address
//     pass: process.env.EMAIL_PASS, // Your email password or app password
//   },
// });

// export const scoreMultipleResumeTest = async (req, res) => {
//   const uploadedFiles = req.files;
//   const {
//     jobDesc,
//     companyName,
//     jobTitle,
//     additionalInstructions,
//     userEmail,
//     userId,
//     companyId,
//   } = req.body;
//   const matchedResumes = [];

//   if (!uploadedFiles || uploadedFiles.length === 0) {
//     return res.status(400).json({ message: "No files uploaded" });
//   }

//   if (!jobDesc) {
//     return res.status(400).json({ message: "No job description provided" });
//   }

//   const totalResumes = uploadedFiles.length;
//   let completedResumes = 0; // Shared variable to track progress

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

//   // const skillsAnalysisSchema = z.array(z.string().describe("Matched skill"));
//   // const notMatchedSkillsAnalysisSchema = z.array(
//   //   z.string().describe("Not matched skill")
//   // );
//   const skillsAnalysisSchema = z.array(
//     z
//       .string()
//       .describe(
//         "The skills that candidate have is matched with the job description skills "
//       )
//   );
//   const notMatchedSkillsAnalysisSchema = z.array(
//     z
//       .string()
//       .describe(
//         "tha skills that have in job description but not matched with candidate skills"
//       )
//   );

//   const experienceAnalysisSchema = z.object({
//     relevantExperience: z
//       .string()
//       .describe("Description of relevant experience"),
//     yearsOfExperience: z.string().describe("Years of experience"),
//   });

//   const educationAnalysisSchema = z.object({
//     highestDegree: z.string().describe("Candidate's highest degree"),
//     relevantCourses: z.array(z.string().describe("Relevant courses taken")),
//   });

//   const analysisSchema = z.object({
//     skills: z.object({
//       candidateSkills: z
//         .array(z.string().describe("Skills of the candidate"))
//         .describe("skills mentioned by the candidate"),
//       matched: skillsAnalysisSchema,
//       notMatched: notMatchedSkillsAnalysisSchema,
//     }),
//     experience: experienceAnalysisSchema,
//     education: educationAnalysisSchema,
//     projects: z
//       .array(z.string().describe("Project of the candidate"))
//       .describe("Projects mentioned by the candidate"),
//     recommendation: z.string().describe("Recommendation for the candidate."),
//     comments: z.string().describe("Comments on the candidate's profile."),
//     additionalNotes: z
//       .string()
//       .optional()
//       .describe("Additional notes about the candidate"),
//   });

//   const candidateSchema = z.object({
//     candidateName: z.string().describe("Candidate's full name"),
//     email: z.string().describe("email of the candidate"),
//     mobile: z
//       .number()
//       .describe("mobile number of the candidate (without country code)"),
//     jobTitle: z
//       .string()
//       .describe("Job title of the candidate who is applying for"),
//     companyName: z
//       .string()
//       .describe("Company name for which the candidate is applying"),
//     linkedinLink: z.string().describe("linkedin link of the candidate"),
//     matchingScoreDetails: matchingScoreDetailsSchema,
//     analysis: analysisSchema,
//   });

//   try {
//     const model = new OpenAI({
//       // modelName: "gpt-3.5-turbo",
//       modelName: "gpt-4.1",
//       temperature: 0,
//     });

//     const parser = StructuredOutputParser.fromZodSchema(candidateSchema);
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
//             additional instructions: {additionalInstructions}
//             matching score:
//   `
//     );

//     const prompt2 = PromptTemplate.fromTemplate(
//       `You are a technical Recruiter who is capable of analyzing resume with job description and provide a matching score in JSON object. Don't write a single word except JSON object.
//             format_instructions: {formatting_instructions}
//             resume: {resume}
//             job description: {jobDesc}
//             additional instructions: {additionalInstructions}
//             matching score:`
//     );

//     await Promise.all(
//       uploadedFiles.map(async (uploadedFile, index) => {
//         try {
//           let resumeContent;
//           // Upload the file to Cloudinary and get the link
//           const uploadResult = await cloudinary.uploader.upload(
//             uploadedFile.path,
//             {
//               resource_type: "auto", // Handles both PDF and DOCX
//               folder: "resumes", // Optional folder in Cloudinary
//             }
//           );

//           // Store resume link
//           const resumeLink = uploadResult.secure_url;

//           if (uploadedFile.mimetype === "application/pdf") {
//             const loader = new PDFLoader(uploadedFile.path);
//             const docs = await loader.load();
//             resumeContent = docs[0]?.pageContent;
//           } else if (
//             uploadedFile.mimetype ===
//             "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//           ) {
//             const { value } = await mammoth.extractRawText({
//               path: uploadedFile.path,
//             });
//             resumeContent = value;
//           }

//           if (!resumeContent) {
//             throw new Error(
//               `No content found in file: ${uploadedFile.filename}`
//             );
//           }

//           // Extract LinkedIn link if available
//           // const linkedInRegex = /https?:\/\/(www\.)?linkedin\.com\/[a-zA-Z0-9\-/]+/gi;
//           // const linkedinLink = resumeContent.match(linkedInRegex) ? resumeContent.match(linkedInRegex)[0] : null;

//           const chain = prompt.pipe(model).pipe(parser);
//           const result = await chain.invoke({
//             resume: resumeContent,
//             jobDesc: jobDesc,
//             additionalInstructions: additionalInstructions,
//             companyName: companyName,
//             companyId: companyId,
//             formatting_instructions: parser.getFormatInstructions(),
//           });

//           result.companyName = companyName;
//           result.jobTitle = jobTitle;
//           result.resumeLink = resumeLink;
//           // const companyObjectId = mongoose.Types.ObjectId(companyId);
//           // result.companyId = companyObjectId;
//           result.companyId = companyId;
//           // result.linkedinLink = linkedinLink; // Store LinkedIn link

//           //   const existingResume = await Resume.findOne({
//           //     email: result.email,
//           //     mobile: result.mobile,
//           //   });

//           //   if (existingResume) {
//           //     console.log(
//           //       `Resume for ${result.email} with mobile number ${result.mobile} already exists.`
//           //     );
//           //   } else {
//           //     await Resume.create(result);
//           //   }
//           await Resume.create(result);

//           matchedResumes.push({
//             file: uploadedFile.filename,
//             result: result,
//           });

//           await fs.promises.unlink(uploadedFile.path);
//           // Update progress after each successful resume processing
//           completedResumes += 1;
//           io.emit("progress", {
//             completed: completedResumes,
//             total: totalResumes,
//           });

//           // io.emit("progress", {
//           //   completed: index + 1,
//           //   total: totalResumes,
//           // });
//         } catch (error) {
//           console.log(
//             `Error processing file: ${uploadedFile.filename}`,
//             error.message
//           );
//         }
//       })
//     );

//     if (userEmail) {
//       // Send email notification to user
//       const mailOptions = {
//         from: process.env.EMAIL_USER, // Sender address
//         to: userEmail, // List of recipients
//         subject: "Resume Processing Complete",
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//               <h2 style="text-align: center; color: #4CAF50;">Resume Processing Complete</h2>
//               <p>Dear Recruiter,</p>
//               <p>We are pleased to inform you that your resume has been successfully processed. You can now review the results of the analysis.</p>
//               <p><strong>What to do next:</strong></p>
//               <ol>
//                   <li>Check the analysis results for detailed feedback on your resume.</li>
//                   <li>If you have any questions or need further assistance, feel free to reply to company email.</li>
//               </ol>
//               <p style="text-align: center;">
//                   <a href="https://bloomix2.netlify.app/main/pullcvs" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">View Results</a>
//               </p>
//               <p>Thank you for using our service!</p>
//               <p>Best regards,</p>
//               <p>Bloomix</p>
//           </div>
//         `,
//       };

//       await transporter.sendMail(mailOptions);
//     }

//     const newNotification = new Notification({
//       message: "Candidates screening complete for a job",

//       recipientId: userId,

//       jobId: jobTitle,
//     });

//     await newNotification.save();

//     // Emit the new notification event to the specific recipient
//     io.emit("newNotification", newNotification);

//     res.json({
//       message: "Files uploaded successfully",
//       result: matchedResumes,
//     });
//   } catch (error) {
//     console.error("Error processing resumes:", error.message);
//     return res.status(500).json({ error: "Error processing resumes" });
//   }
// };
