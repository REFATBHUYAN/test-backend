import { PromptTemplate } from "@langchain/core/prompts"
import { OpenAI } from "@langchain/openai"
import dotenv from "dotenv"
import { z } from "zod"
import { StructuredOutputParser } from "langchain/output_parsers"
import JobDescription from "../../model/JobDescriptionModel.js"

dotenv.config()

// Helper function to convert markdown to HTML
function convertMarkdownToHTML(markdown) {
  if (!markdown) return ""

  // Convert headers
  let html = markdown
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")

  // Convert lists
  html = html
    .replace(/^\s*- (.*$)/gm, "<li>$1</li>")
    .replace(/^\s*\* (.*$)/gm, "<li>$1</li>")
    .replace(/^\s*\d+\. (.*$)/gm, "<li>$1</li>")

  // Wrap lists
  html = html.replace(/<li>.*?<\/li>(\n<li>.*?<\/li>)*/gs, (match) => {
    if (match.includes("1. ")) {
      return `<ol>${match}</ol>`
    }
    return `<ul>${match}</ul>`
  })

  // Convert bold and italic
  html = html
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<em>$1</em>")

  // Convert links
  html = html.replace(/\[(.*?)\]$$(.*?)$$/g, '<a href="$2">$1</a>')

  // Convert paragraphs (must be done last)
  html = html
    .split("\n\n")
    .map((para) => {
      if (!para.trim()) return ""
      if (para.startsWith("<h") || para.startsWith("<ul") || para.startsWith("<ol")) {
        return para
      }
      return `<p>${para}</p>`
    })
    .join("")

  return html
}

// Function to convert HTML to markdown
async function convertHTMLToMarkdown(htmlContent) {
  if (!htmlContent) {
    return ""
  }

  const model = new OpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0,
  })

  const prompt = PromptTemplate.fromTemplate(
    `Convert the following HTML content to markdown format:
    
    HTML:
    {html_content}
    
    Markdown:
    `,
  )

  try {
    const chain = prompt.pipe(model)
    const result = await chain.invoke({
      html_content: htmlContent,
    })

    return result
  } catch (error) {
    console.error("Error converting HTML to markdown:", error)
    return htmlContent // Return original HTML if conversion fails
  }
}

// Function to extract complete job data from HTML job description
async function extractJobDataFromHTML(htmlDescription, context, company_name) {
  if (!htmlDescription) {
    throw new Error("No HTML description provided")
  }

  // Define schema for the complete job data extraction
  const jobDataSchema = z.object({
    job_title: z.string().describe("The official title of the position"),
    short_description: z.string().describe("Short description of the job"),
    key_responsibilities: z.array(z.string()).describe("List of key responsibilities"),
    qualifications: z.array(z.string()).describe("List of qualifications"),
    experience_required: z.array(z.string()).describe("List of experience required"),
    job_type: z.string().describe("Type of job (e.g., full-time, part-time, contract)"),
    location: z.string().describe("Primary location of the role (physical or remote)"),
    compensation: z.string().describe("Details on salary or compensation information"),
    other_relevant_details: z.array(z.string()).describe("List of other relevant details"),
    topskills: z.array(z.string()).describe("Top 5 most important skills mentioned in the job description"),
    topresponsibilityskills: z.array(z.string()).describe("Top 5 skills derived from the key responsibilities"),
    topqualificationskills: z.array(z.string()).describe("Top 5 skills derived from the qualifications section"),
  })

  const model = new OpenAI({
    modelName: "gpt-4.1",
    temperature: 0,
  })

  try {
    const parser = StructuredOutputParser.fromZodSchema(jobDataSchema)

    const prompt = PromptTemplate.fromTemplate(
      `You are an intelligent assistant responsible for analyzing a job description in HTML format and extracting structured data.
      
      Analyze the following HTML job description and extract:
      1. **Job Title**: The official title of the position.
      2. **Short Description**: A brief and accurate summary of the role.
      3. **Key Responsibilities**: A clear list of duties and tasks the employee will be responsible for.
      4. **Qualifications**: A list of required skills, education, and certifications.
      5. **Experience Required**: A list of necessary prior experience, including years and type of experience.
      6. **Job Type**: Specify whether the role is full-time, part-time, contract, etc.
      7. **Location**: The primary location of the role (physical or remote).
      8. **Compensation**: Include details on whether the position is paid, and any relevant salary or compensation information.
      9. **Other Relevant Details**: Any additional information such as travel requirements, work conditions, or unique perks.
      10. **Top Skills**: Extract the top 5 most important skills mentioned in the job description. Each skill should be limited to a maximum of two words.
      11. **Top Responsibility Skills**: Extract the top 5 skills derived from the key responsibilities. Each skill should be limited to a maximum of two words.
      12. **Top Qualification Skills**: Extract the top 5 skills derived from the qualifications section. Each skill should be limited to a maximum of two words.
      
      If any section is missing or you cannot identify specific information, provide your best estimate based on the available content.
      
      format_instructions: {formatting_instructions}
      html_description: {html_description}
      context: {context}
      company_name: {company_name}
      
      Job Data Analysis:
      `,
    )

    const chain = prompt.pipe(model).pipe(parser)

    const result = await chain.invoke({
      html_description: htmlDescription,
      context: context || "",
      company_name: company_name || "",
      formatting_instructions: parser.getFormatInstructions(),
    })

    return {
      job_title: result.job_title || "",
      short_description: result.short_description || "",
      key_responsibilities: result.key_responsibilities || [],
      qualifications: result.qualifications || [],
      experience_required: result.experience_required || [],
      job_type: result.job_type || "",
      location: result.location || "",
      compensation: result.compensation || "",
      other_relevant_details: result.other_relevant_details || [],
      topskills: result.topskills || [],
      topresponsibilityskills: result.topresponsibilityskills || [],
      topqualificationskills: result.topqualificationskills || [],
    }
  } catch (error) {
    console.error("Error extracting job data from HTML:", error)
    // Return empty values as fallback
    return {
      job_title: "",
      short_description: "",
      key_responsibilities: [],
      qualifications: [],
      experience_required: [],
      job_type: "",
      location: "",
      compensation: "",
      other_relevant_details: [],
      topskills: [],
      topresponsibilityskills: [],
      topqualificationskills: [],
    }
  }
}

export const generateCompanyJD2 = async (req, res) => {
  const { context, company_name } = req.body

  if (!context) {
    return res.status(400).json({ message: "No context for job description provided." })
  }

  if (!company_name) {
    return res.status(400).json({ message: "No company name provided." })
  }

  // Updated schema to include new fields from the prompt
  const schema = z.object({
    job_title: z.string().describe("The official title of the position"),
    short_description: z.string().describe("Short description of the job"),
    key_responsibilities: z.array(z.string()).describe("List of key responsibilities"),
    qualifications: z.array(z.string()).describe("List of qualifications"),
    experience_required: z.array(z.string()).describe("List of experience required"),
    job_type: z.string().describe("Type of job (e.g., full-time, part-time, contract)"),
    location: z.string().describe("Primary location of the role (physical or remote)"),
    compensation: z.string().describe("Details on salary or compensation information"),
    other_relevant_details: z.array(z.string()).describe("List of other relevant details"),
    // Add these new fields to the schema
    topskills: z.array(z.string()).describe("Top 5 most important skills mentioned in the job description"),
    topresponsibilityskills: z.array(z.string()).describe("Top 5 skills derived from the key responsibilities"),
    topqualificationskills: z.array(z.string()).describe("Top 5 skills derived from the qualifications section"),
  })

  const model = new OpenAI({
    modelName: "gpt-4.1",
    temperature: 0,
  })

  try {
    const parser = StructuredOutputParser.fromZodSchema(schema)

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
            `,
    )

    const chain = prompt.pipe(model).pipe(parser)

    const result = await chain.invoke({
      context: context,
      formatting_instructions: parser.getFormatInstructions(),
    })

    // Generate the HTML description directly instead of markdown
    const htmlDescription = `
<h1>${result.job_title}</h1>

<h2>Short Description</h2>
<p>${result.short_description}</p>

<h2>Key Responsibilities</h2>
<ul>
  ${result.key_responsibilities?.map((item) => `<li>${item}</li>`).join("")}
</ul>

<h2>Qualifications</h2>
<ul>
  ${result.qualifications?.map((item) => `<li>${item}</li>`).join("")}
</ul>

<h2>Experience Required</h2>
<ul>
  ${result.experience_required?.map((item) => `<li>${item}</li>`).join("")}
</ul>

<h2>Job Type</h2>
<p>${result.job_type}</p>

<h2>Location</h2>
<p>${result.location}</p>

<h2>Compensation</h2>
<p>${result.compensation}</p>

<h2>Other Relevant Details</h2>
<ul>
  ${result.other_relevant_details?.map((item) => `<li>${item}</li>`).join("")}
</ul>
    `

    // Generate markdown for backward compatibility
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
    `

    // Save the job description to the database
    const jobDescription = new JobDescription({
      context: context,
      company_name: company_name,
      short_description: result.short_description,
      key_responsibilities: result.key_responsibilities,
      qualifications: result.qualifications,
      experience_required: result.experience_required,
      other_relevant_details: result.other_relevant_details,
      markdown_description: markdownDescription, // Keep markdown for backward compatibility
      html_description: htmlDescription, // Add HTML version directly
      topskills: result.topskills, // Directly assign generated skills
      topresponsibilityskills: result.topresponsibilityskills, // Directly assign generated skills
      topqualificationskills: result.topqualificationskills, // Directly assign generated skills
      status: "Open",
      publish: false,
      is_manual_entry: false,
      job_type: result.job_type,
      location: result.location,
      compensation: result.compensation,
      customQuestions: [], // Initialize empty custom questions array
    })

    // await jobDescription.save();
    console.log("Job description generated and saved:", jobDescription)

    return res.status(200).json({
      job_description: jobDescription,
    })
  } catch (error) {
    console.error("Error in generating JD:", error)
    return res.status(500).json({ message: "Error in generating JD.", error: error.message })
  }
}

export const updateJobDescription3 = async (req, res) => {
  const { job_description, user_name, user_email, companyId, customQuestions } = req.body

  try {
    // Check if we have an existing job description to update
    let existingJobDescription = null
    if (job_description._id) {
      existingJobDescription = await JobDescription.findById(job_description._id)
    }

    // Extract data from HTML content if it's a manual entry
    const jobData = { ...job_description }

    // If this is a manual entry with HTML description, use AI to extract all job data
    if (jobData.is_manual_entry && jobData.html_description) {
      console.log("Extracting complete job data from manual HTML description...")
      try {
        // Extract all job data from HTML
        const extractedJobData = await extractJobDataFromHTML(
          jobData.html_description,
          jobData.context,
          jobData.company_name,
        )

        // Generate markdown from HTML if not already present
        if (!jobData.markdown_description) {
          jobData.markdown_description = await convertHTMLToMarkdown(jobData.html_description)
        }

        // Update all job data fields with extracted information
        jobData.short_description = extractedJobData.short_description
        jobData.key_responsibilities = extractedJobData.key_responsibilities
        jobData.qualifications = extractedJobData.qualifications
        jobData.experience_required = extractedJobData.experience_required
        jobData.job_type = extractedJobData.job_type
        jobData.location = extractedJobData.location
        jobData.compensation = extractedJobData.compensation
        jobData.other_relevant_details = extractedJobData.other_relevant_details
        jobData.topskills = extractedJobData.topskills
        jobData.topresponsibilityskills = extractedJobData.topresponsibilityskills
        jobData.topqualificationskills = extractedJobData.topqualificationskills

        console.log("Job data extracted successfully")
      } catch (error) {
        console.error("Error extracting job data:", error)
        // Continue with the process even if data extraction fails
      }
    }

    if (existingJobDescription) {
      // Update existing job description
      existingJobDescription.context = jobData.context
      existingJobDescription.company_name = jobData.company_name
      existingJobDescription.short_description = jobData.short_description
      existingJobDescription.key_responsibilities = jobData.key_responsibilities
      existingJobDescription.qualifications = jobData.qualifications
      existingJobDescription.experience_required = jobData.experience_required
      existingJobDescription.other_relevant_details = jobData.other_relevant_details
      existingJobDescription.markdown_description = jobData.markdown_description
      existingJobDescription.html_description = jobData.html_description
      existingJobDescription.topskills = jobData.topskills
      existingJobDescription.topresponsibilityskills = jobData.topresponsibilityskills
      existingJobDescription.topqualificationskills = jobData.topqualificationskills
      existingJobDescription.is_manual_entry = jobData.is_manual_entry || false
      existingJobDescription.job_type = jobData.job_type
      existingJobDescription.location = jobData.location
      existingJobDescription.compensation = jobData.compensation
      
      // Update custom questions if provided
      if (customQuestions) {
        existingJobDescription.customQuestions = customQuestions
      }

      // Add modification history
      existingJobDescription.modifications.push({
        user_name,
        user_email,
        date: new Date(),
      })

      await existingJobDescription.save()

      return res.status(200).json({ job_description: existingJobDescription })
    } else {
      // Create new job description
      const newJobDescription = new JobDescription({
        ...jobData,
        created_by: {
          name: user_name,
          email: user_email,
        },
        assignee: {
          name: user_name,
          email: user_email,
          assignDate: new Date(),
        },
        jobOwner: {
          name: user_name,
          email: user_email,
          assignDate: new Date(),
        },
        companyId,
        // Make sure html_description is included
        html_description: jobData.html_description || convertMarkdownToHTML(jobData.markdown_description),
        is_manual_entry: jobData.is_manual_entry || false,
        customQuestions: customQuestions || [], // Add custom questions to new job
      })

      await newJobDescription.save()

      return res.status(200).json({ job_description: newJobDescription })
    }
  } catch (error) {
    console.log("server error", error)
    return res.status(500).json({
      message: "Error creating/updating job description.",
      error: error.message,
    })
  }
}
export const updateJobDescription2 = async (req, res) => {
  const { job_description, user_name, user_email, companyId, expectationQuestions } = req.body;

  try {
    // Check if we have an existing job description to update
    let existingJobDescription = null;
    if (job_description._id) {
      existingJobDescription = await JobDescription.findById(job_description._id);
    }

    // Extract data from HTML content if it's a manual entry
    const jobData = { ...job_description };

    // If this is a manual entry with HTML description, use AI to extract all job data
    if (jobData.is_manual_entry && jobData.html_description) {
      console.log("Extracting complete job data from manual HTML description...");
      try {
        const extractedJobData = await extractJobDataFromHTML(
          jobData.html_description,
          jobData.context,
          jobData.company_name
        );

        if (!jobData.markdown_description) {
          jobData.markdown_description = await convertHTMLToMarkdown(jobData.html_description);
        }

        jobData.short_description = extractedJobData.short_description;
        jobData.key_responsibilities = extractedJobData.key_responsibilities;
        jobData.qualifications = extractedJobData.qualifications;
        jobData.experience_required = extractedJobData.experience_required;
        jobData.job_type = extractedJobData.job_type;
        jobData.location = extractedJobData.location;
        jobData.compensation = extractedJobData.compensation;
        jobData.other_relevant_details = extractedJobData.other_relevant_details;
        jobData.topskills = extractedJobData.topskills;
        jobData.topresponsibilityskills = extractedJobData.topresponsibilityskills;
        jobData.topqualificationskills = extractedJobData.topqualificationskills;

        console.log("Job data extracted successfully");
      } catch (error) {
        console.error("Error extracting job data:", error);
      }
    }

    if (existingJobDescription) {
      // Update existing job description
      existingJobDescription.context = jobData.context;
      existingJobDescription.company_name = jobData.company_name;
      existingJobDescription.short_description = jobData.short_description;
      existingJobDescription.key_responsibilities = jobData.key_responsibilities;
      existingJobDescription.qualifications = jobData.qualifications;
      existingJobDescription.experience_required = jobData.experience_required;
      existingJobDescription.other_relevant_details = jobData.other_relevant_details;
      existingJobDescription.markdown_description = jobData.markdown_description;
      existingJobDescription.html_description = jobData.html_description;
      existingJobDescription.topskills = jobData.topskills;
      existingJobDescription.topresponsibilityskills = jobData.topresponsibilityskills;
      existingJobDescription.topqualificationskills = jobData.topqualificationskills;
      existingJobDescription.is_manual_entry = jobData.is_manual_entry || false;
      existingJobDescription.job_type = jobData.job_type;
      existingJobDescription.location = jobData.location;
      existingJobDescription.compensation = jobData.compensation;

      // Update expectationQuestions if provided
      if (expectationQuestions && Array.isArray(expectationQuestions)) {
        existingJobDescription.expectationQuestions = expectationQuestions;
      }

      // Add modification history
      existingJobDescription.modifications.push({
        user_name,
        user_email,
        date: new Date(),
      });

      await existingJobDescription.save();

      return res.status(200).json({ job_description: existingJobDescription });
    } else {
      // Create new job description
      const newJobDescription = new JobDescription({
        ...jobData,
        created_by: {
          name: user_name,
          email: user_email,
        },
        assignee: {
          name: user_name,
          email: user_email,
          assignDate: new Date(),
        },
        jobOwner: {
          name: user_name,
          email: user_email,
          assignDate: new Date(),
        },
        companyId,
        html_description: jobData.html_description || convertMarkdownToHTML(jobData.markdown_description),
        is_manual_entry: jobData.is_manual_entry || false,
        expectationQuestions: expectationQuestions || [], // Use expectationQuestions
      });

      await newJobDescription.save();

      return res.status(200).json({ job_description: newJobDescription });
    }
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      message: "Error creating/updating job description.",
      error: error.message,
    });
  }
};

// Save custom questions to job
export const saveCustomQuestions = async (req, res) => {
  try {
    const { jobId, questions } = req.body

    if (!jobId || !questions) {
      return res.status(400).json({
        success: false,
        message: "Job ID and questions are required",
      })
    }

    const job = await JobDescription.findByIdAndUpdate(
      jobId, 
      { customQuestions: questions }, 
      { new: true }
    )

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      })
    }

    res.json({
      success: true,
      message: "Custom questions saved successfully",
      job: job
    })
  } catch (error) {
    console.error("Error saving custom questions:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
    })
  }
}

// Get custom questions for job
export const getCustomQuestions = async (req, res) => {
  try {
    const { jobId } = req.query

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Job ID is required",
      })
    }

    const job = await JobDescription.findById(jobId)

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      })
    }

    res.json({
      success: true,
      questions: job.customQuestions || [],
    })
  } catch (error) {
    console.error("Error fetching custom questions:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
    })
  }
}

// Save expectation questions (for backward compatibility with ExpectationScreening3)
export const saveExpectationQuestions = async (req, res) => {
  try {
    const { jobId, questions } = req.body

    if (!jobId || !questions) {
      return res.status(400).json({
        error: "Job ID and questions are required",
      })
    }

    const job = await JobDescription.findByIdAndUpdate(
      jobId, 
      { 
        expectationQuestions: questions,
        customQuestions: questions // Also save as customQuestions for consistency
      }, 
      { new: true }
    )

    if (!job) {
      return res.status(404).json({
        error: "Job not found",
      })
    }

    res.json({
      success: true,
      message: "Expectation questions saved successfully",
    })
  } catch (error) {
    console.error("Error saving expectation questions:", error)
    res.status(500).json({
      error: "Internal server error",
    })
  }
}



// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import JobDescription from "../../model/JobDescriptionModel.js"

// dotenv.config()

// // Helper function to convert markdown to HTML
// function convertMarkdownToHTML(markdown) {
//   if (!markdown) return ""

//   // Convert headers
//   let html = markdown
//     .replace(/^# (.*$)/gm, "<h1>$1</h1>")
//     .replace(/^## (.*$)/gm, "<h2>$1</h2>")
//     .replace(/^### (.*$)/gm, "<h3>$1</h3>")

//   // Convert lists
//   html = html
//     .replace(/^\s*- (.*$)/gm, "<li>$1</li>")
//     .replace(/^\s*\* (.*$)/gm, "<li>$1</li>")
//     .replace(/^\s*\d+\. (.*$)/gm, "<li>$1</li>")

//   // Wrap lists
//   html = html.replace(/<li>.*?<\/li>(\n<li>.*?<\/li>)*/gs, (match) => {
//     if (match.includes("1. ")) {
//       return `<ol>${match}</ol>`
//     }
//     return `<ul>${match}</ul>`
//   })

//   // Convert bold and italic
//   html = html
//     .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
//     .replace(/__(.*?)__/g, "<strong>$1</strong>")
//     .replace(/\*(.*?)\*/g, "<em>$1</em>")
//     .replace(/_(.*?)_/g, "<em>$1</em>")

//   // Convert links
//   html = html.replace(/\[(.*?)\]$$(.*?)$$/g, '<a href="$2">$1</a>')

//   // Convert paragraphs (must be done last)
//   html = html
//     .split("\n\n")
//     .map((para) => {
//       if (!para.trim()) return ""
//       if (para.startsWith("<h") || para.startsWith("<ul") || para.startsWith("<ol")) {
//         return para
//       }
//       return `<p>${para}</p>`
//     })
//     .join("")

//   return html
// }

// // Function to convert HTML to markdown
// async function convertHTMLToMarkdown(htmlContent) {
//   if (!htmlContent) {
//     return ""
//   }

//   const model = new OpenAI({
//     modelName: "gpt-3.5-turbo",
//     temperature: 0,
//   })

//   const prompt = PromptTemplate.fromTemplate(
//     `Convert the following HTML content to markdown format:
    
//     HTML:
//     {html_content}
    
//     Markdown:
//     `,
//   )

//   try {
//     const chain = prompt.pipe(model)
//     const result = await chain.invoke({
//       html_content: htmlContent,
//     })

//     return result
//   } catch (error) {
//     console.error("Error converting HTML to markdown:", error)
//     return htmlContent // Return original HTML if conversion fails
//   }
// }

// // Function to extract complete job data from HTML job description
// async function extractJobDataFromHTML(htmlDescription, context, company_name) {
//   if (!htmlDescription) {
//     throw new Error("No HTML description provided")
//   }

//   // Define schema for the complete job data extraction
//   const jobDataSchema = z.object({
//     job_title: z.string().describe("The official title of the position"),
//     short_description: z.string().describe("Short description of the job"),
//     key_responsibilities: z.array(z.string()).describe("List of key responsibilities"),
//     qualifications: z.array(z.string()).describe("List of qualifications"),
//     experience_required: z.array(z.string()).describe("List of experience required"),
//     job_type: z.string().describe("Type of job (e.g., full-time, part-time, contract)"),
//     location: z.string().describe("Primary location of the role (physical or remote)"),
//     compensation: z.string().describe("Details on salary or compensation information"),
//     other_relevant_details: z.array(z.string()).describe("List of other relevant details"),
//     topskills: z.array(z.string()).describe("Top 5 most important skills mentioned in the job description"),
//     topresponsibilityskills: z.array(z.string()).describe("Top 5 skills derived from the key responsibilities"),
//     topqualificationskills: z.array(z.string()).describe("Top 5 skills derived from the qualifications section"),
//   })

//   const model = new OpenAI({
//     modelName: "gpt-4.1",
//     temperature: 0,
//   })

//   try {
//     const parser = StructuredOutputParser.fromZodSchema(jobDataSchema)

//     const prompt = PromptTemplate.fromTemplate(
//       `You are an intelligent assistant responsible for analyzing a job description in HTML format and extracting structured data.
      
//       Analyze the following HTML job description and extract:
//       1. **Job Title**: The official title of the position.
//       2. **Short Description**: A brief and accurate summary of the role.
//       3. **Key Responsibilities**: A clear list of duties and tasks the employee will be responsible for.
//       4. **Qualifications**: A list of required skills, education, and certifications.
//       5. **Experience Required**: A list of necessary prior experience, including years and type of experience.
//       6. **Job Type**: Specify whether the role is full-time, part-time, contract, etc.
//       7. **Location**: The primary location of the role (physical or remote).
//       8. **Compensation**: Include details on whether the position is paid, and any relevant salary or compensation information.
//       9. **Other Relevant Details**: Any additional information such as travel requirements, work conditions, or unique perks.
//       10. **Top Skills**: Extract the top 5 most important skills mentioned in the job description. Each skill should be limited to a maximum of two words.
//       11. **Top Responsibility Skills**: Extract the top 5 skills derived from the key responsibilities. Each skill should be limited to a maximum of two words.
//       12. **Top Qualification Skills**: Extract the top 5 skills derived from the qualifications section. Each skill should be limited to a maximum of two words.
      
//       If any section is missing or you cannot identify specific information, provide your best estimate based on the available content.
      
//       format_instructions: {formatting_instructions}
//       html_description: {html_description}
//       context: {context}
//       company_name: {company_name}
      
//       Job Data Analysis:
//       `,
//     )

//     const chain = prompt.pipe(model).pipe(parser)

//     const result = await chain.invoke({
//       html_description: htmlDescription,
//       context: context || "",
//       company_name: company_name || "",
//       formatting_instructions: parser.getFormatInstructions(),
//     })

//     return {
//       job_title: result.job_title || "",
//       short_description: result.short_description || "",
//       key_responsibilities: result.key_responsibilities || [],
//       qualifications: result.qualifications || [],
//       experience_required: result.experience_required || [],
//       job_type: result.job_type || "",
//       location: result.location || "",
//       compensation: result.compensation || "",
//       other_relevant_details: result.other_relevant_details || [],
//       topskills: result.topskills || [],
//       topresponsibilityskills: result.topresponsibilityskills || [],
//       topqualificationskills: result.topqualificationskills || [],
//     }
//   } catch (error) {
//     console.error("Error extracting job data from HTML:", error)
//     // Return empty values as fallback
//     return {
//       job_title: "",
//       short_description: "",
//       key_responsibilities: [],
//       qualifications: [],
//       experience_required: [],
//       job_type: "",
//       location: "",
//       compensation: "",
//       other_relevant_details: [],
//       topskills: [],
//       topresponsibilityskills: [],
//       topqualificationskills: [],
//     }
//   }
// }

// export const generateCompanyJD2 = async (req, res) => {
//   const { context, company_name } = req.body

//   if (!context) {
//     return res.status(400).json({ message: "No context for job description provided." })
//   }

//   if (!company_name) {
//     return res.status(400).json({ message: "No company name provided." })
//   }

//   // Updated schema to include new fields from the prompt
//   const schema = z.object({
//     job_title: z.string().describe("The official title of the position"),
//     short_description: z.string().describe("Short description of the job"),
//     key_responsibilities: z.array(z.string()).describe("List of key responsibilities"),
//     qualifications: z.array(z.string()).describe("List of qualifications"),
//     experience_required: z.array(z.string()).describe("List of experience required"),
//     job_type: z.string().describe("Type of job (e.g., full-time, part-time, contract)"),
//     location: z.string().describe("Primary location of the role (physical or remote)"),
//     compensation: z.string().describe("Details on salary or compensation information"),
//     other_relevant_details: z.array(z.string()).describe("List of other relevant details"),
//     // Add these new fields to the schema
//     topskills: z.array(z.string()).describe("Top 5 most important skills mentioned in the job description"),
//     topresponsibilityskills: z.array(z.string()).describe("Top 5 skills derived from the key responsibilities"),
//     topqualificationskills: z.array(z.string()).describe("Top 5 skills derived from the qualifications section"),
//   })

//   const model = new OpenAI({
//     modelName: "gpt-4.1",
//     temperature: 0,
//   })

//   try {
//     const parser = StructuredOutputParser.fromZodSchema(schema)

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
//             `,
//     )

//     const chain = prompt.pipe(model).pipe(parser)

//     const result = await chain.invoke({
//       context: context,
//       formatting_instructions: parser.getFormatInstructions(),
//     })

//     // Generate the HTML description directly instead of markdown
//     const htmlDescription = `
// <h1>${result.job_title}</h1>

// <h2>Short Description</h2>
// <p>${result.short_description}</p>

// <h2>Key Responsibilities</h2>
// <ul>
//   ${result.key_responsibilities?.map((item) => `<li>${item}</li>`).join("")}
// </ul>

// <h2>Qualifications</h2>
// <ul>
//   ${result.qualifications?.map((item) => `<li>${item}</li>`).join("")}
// </ul>

// <h2>Experience Required</h2>
// <ul>
//   ${result.experience_required?.map((item) => `<li>${item}</li>`).join("")}
// </ul>

// <h2>Job Type</h2>
// <p>${result.job_type}</p>

// <h2>Location</h2>
// <p>${result.location}</p>

// <h2>Compensation</h2>
// <p>${result.compensation}</p>

// <h2>Other Relevant Details</h2>
// <ul>
//   ${result.other_relevant_details?.map((item) => `<li>${item}</li>`).join("")}
// </ul>
//     `

//     // Generate markdown for backward compatibility
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
//     `

//     // Save the job description to the database
//     const jobDescription = new JobDescription({
//       context: context,
//       company_name: company_name,
//       short_description: result.short_description,
//       key_responsibilities: result.key_responsibilities,
//       qualifications: result.qualifications,
//       experience_required: result.experience_required,
//       other_relevant_details: result.other_relevant_details,
//       markdown_description: markdownDescription, // Keep markdown for backward compatibility
//       html_description: htmlDescription, // Add HTML version directly
//       topskills: result.topskills, // Directly assign generated skills
//       topresponsibilityskills: result.topresponsibilityskills, // Directly assign generated skills
//       topqualificationskills: result.topqualificationskills, // Directly assign generated skills
//       status: "Open",
//       publish: false,
//       is_manual_entry: false,
//       job_type: result.job_type,
//       location: result.location,
//       compensation: result.compensation,
//     })

//     // await jobDescription.save();
//     console.log("Job description generated and saved:", jobDescription)

//     return res.status(200).json({
//       job_description: jobDescription,
//     })
//   } catch (error) {
//     console.error("Error in generating JD:", error)
//     return res.status(500).json({ message: "Error in generating JD.", error: error.message })
//   }
// }

// export const updateJobDescription2 = async (req, res) => {
//   const { job_description, user_name, user_email, companyId } = req.body

//   try {
//     // Check if we have an existing job description to update
//     let existingJobDescription = null
//     if (job_description._id) {
//       existingJobDescription = await JobDescription.findById(job_description._id)
//     }

//     // Extract data from HTML content if it's a manual entry
//     const jobData = { ...job_description }

//     // If this is a manual entry with HTML description, use AI to extract all job data
//     if (jobData.is_manual_entry && jobData.html_description) {
//       console.log("Extracting complete job data from manual HTML description...")
//       try {
//         // Extract all job data from HTML
//         const extractedJobData = await extractJobDataFromHTML(
//           jobData.html_description,
//           jobData.context,
//           jobData.company_name,
//         )

//         // Generate markdown from HTML if not already present
//         if (!jobData.markdown_description) {
//           jobData.markdown_description = await convertHTMLToMarkdown(jobData.html_description)
//         }

//         // Update all job data fields with extracted information
//         jobData.short_description = extractedJobData.short_description
//         jobData.key_responsibilities = extractedJobData.key_responsibilities
//         jobData.qualifications = extractedJobData.qualifications
//         jobData.experience_required = extractedJobData.experience_required
//         jobData.job_type = extractedJobData.job_type
//         jobData.location = extractedJobData.location
//         jobData.compensation = extractedJobData.compensation
//         jobData.other_relevant_details = extractedJobData.other_relevant_details
//         jobData.topskills = extractedJobData.topskills
//         jobData.topresponsibilityskills = extractedJobData.topresponsibilityskills
//         jobData.topqualificationskills = extractedJobData.topqualificationskills

//         console.log("Job data extracted successfully")
//       } catch (error) {
//         console.error("Error extracting job data:", error)
//         // Continue with the process even if data extraction fails
//       }
//     }

//     if (existingJobDescription) {
//       // Update existing job description
//       existingJobDescription.context = jobData.context
//       existingJobDescription.company_name = jobData.company_name
//       existingJobDescription.short_description = jobData.short_description
//       existingJobDescription.key_responsibilities = jobData.key_responsibilities
//       existingJobDescription.qualifications = jobData.qualifications
//       existingJobDescription.experience_required = jobData.experience_required
//       existingJobDescription.other_relevant_details = jobData.other_relevant_details
//       existingJobDescription.markdown_description = jobData.markdown_description
//       existingJobDescription.html_description = jobData.html_description
//       existingJobDescription.topskills = jobData.topskills
//       existingJobDescription.topresponsibilityskills = jobData.topresponsibilityskills
//       existingJobDescription.topqualificationskills = jobData.topqualificationskills
//       existingJobDescription.is_manual_entry = jobData.is_manual_entry || false
//       existingJobDescription.job_type = jobData.job_type
//       existingJobDescription.location = jobData.location
//       existingJobDescription.compensation = jobData.compensation

//       // Add modification history
//       existingJobDescription.modifications.push({
//         user_name,
//         user_email,
//         date: new Date(),
//       })

//       await existingJobDescription.save()

//       return res.status(200).json({ job_description: existingJobDescription })
//     } else {
//       // Create new job description
//       const newJobDescription = new JobDescription({
//         ...jobData,
//         created_by: {
//           name: user_name,
//           email: user_email,
//         },
//         assignee: {
//           name: user_name,
//           email: user_email,
//           assignDate: new Date(),
//         },
//         jobOwner: {
//           name: user_name,
//           email: user_email,
//           assignDate: new Date(),
//         },
//         companyId,
//         // Make sure html_description is included
//         html_description: jobData.html_description || convertMarkdownToHTML(jobData.markdown_description),
//         is_manual_entry: jobData.is_manual_entry || false,
//       })

//       await newJobDescription.save()

//       return res.status(200).json({ job_description: newJobDescription })
//     }
//   } catch (error) {
//     console.log("server error", error)
//     return res.status(500).json({
//       message: "Error creating/updating job description.",
//       error: error.message,
//     })
//   }
// }


// // Save custom questions to job
// export const saveCustomQuestions = async (req, res) => {
//   try {
//     const { jobId, questions } = req.body

//     if (!jobId || !questions || questions.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Job ID and questions are required",
//       })
//     }

//     const job = await JobDescription.findByIdAndUpdate(jobId, { customQuestions: questions }, { new: true })

//     if (!job) {
//       return res.status(404).json({
//         success: false,
//         message: "Job not found",
//       })
//     }

//     res.json({
//       success: true,
//       message: "Custom questions saved successfully",
//     })
//   } catch (error) {
//     console.error("Error saving custom questions:", error)
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     })
//   }
// }

// // Get custom questions for job
// export const getCustomQuestions = async (req, res) => {
//   try {
//     const { jobId } = req.query

//     if (!jobId) {
//       return res.status(400).json({
//         success: false,
//         message: "Job ID is required",
//       })
//     }

//     const job = await JobDescription.findById(jobId)

//     if (!job) {
//       return res.status(404).json({
//         success: false,
//         message: "Job not found",
//       })
//     }

//     res.json({
//       success: true,
//       questions: job.customQuestions || [],
//     })
//   } catch (error) {
//     console.error("Error fetching custom questions:", error)
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     })
//   }
// }




// import { PromptTemplate } from "@langchain/core/prompts"
// import { OpenAI } from "@langchain/openai"
// import dotenv from "dotenv"
// import { z } from "zod"
// import { StructuredOutputParser } from "langchain/output_parsers"
// import JobDescription from "../../model/JobDescriptionModel.js";

// dotenv.config()

// // Helper function to convert markdown to HTML
// function convertMarkdownToHTML(markdown) {
//   if (!markdown) return ""

//   // Convert headers
//   let html = markdown
//     .replace(/^# (.*$)/gm, "<h1>$1</h1>")
//     .replace(/^## (.*$)/gm, "<h2>$1</h2>")
//     .replace(/^### (.*$)/gm, "<h3>$1</h3>")

//   // Convert lists
//   html = html
//     .replace(/^\s*- (.*$)/gm, "<li>$1</li>")
//     .replace(/^\s*\* (.*$)/gm, "<li>$1</li>")
//     .replace(/^\s*\d+\. (.*$)/gm, "<li>$1</li>")

//   // Wrap lists
//   html = html.replace(/<li>.*?<\/li>(\n<li>.*?<\/li>)*/gs, (match) => {
//     if (match.includes("1. ")) {
//       return `<ol>${match}</ol>`
//     }
//     return `<ul>${match}</ul>`
//   })

//   // Convert bold and italic
//   html = html
//     .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
//     .replace(/__(.*?)__/g, "<strong>$1</strong>")
//     .replace(/\*(.*?)\*/g, "<em>$1</em>")
//     .replace(/_(.*?)_/g, "<em>$1</em>")

//   // Convert links
//   html = html.replace(/\[(.*?)\]$$(.*?)$$/g, '<a href="$2">$1</a>')

//   // Convert paragraphs (must be done last)
//   html = html
//     .split("\n\n")
//     .map((para) => {
//       if (!para.trim()) return ""
//       if (para.startsWith("<h") || para.startsWith("<ul") || para.startsWith("<ol")) {
//         return para
//       }
//       return `<p>${para}</p>`
//     })
//     .join("")

//   return html
// }

// export const generateCompanyJD2 = async (req, res) => {
//   const { context, company_name } = req.body

//   if (!context) {
//     return res.status(400).json({ message: "No context for job description provided." })
//   }

//   if (!company_name) {
//     return res.status(400).json({ message: "No company name provided." })
//   }

//   // Updated schema to include new fields from the prompt
//   const schema = z.object({
//     job_title: z.string().describe("The official title of the position"),
//     short_description: z.string().describe("Short description of the job"),
//     key_responsibilities: z.array(z.string()).describe("List of key responsibilities"),
//     qualifications: z.array(z.string()).describe("List of qualifications"),
//     experience_required: z.array(z.string()).describe("List of experience required"),
//     job_type: z.string().describe("Type of job (e.g., full-time, part-time, contract)"),
//     location: z.string().describe("Primary location of the role (physical or remote)"),
//     compensation: z.string().describe("Details on salary or compensation information"),
//     other_relevant_details: z.array(z.string()).describe("List of other relevant details"),
//     // Add these new fields to the schema
//     topskills: z.array(z.string()).describe("Top 5 most important skills mentioned in the job description"),
//     topresponsibilityskills: z.array(z.string()).describe("Top 5 skills derived from the key responsibilities"),
//     topqualificationskills: z.array(z.string()).describe("Top 5 skills derived from the qualifications section"),
//   })

//   const model = new OpenAI({
//     modelName: "gpt-4.1",
//     temperature: 0,
//   })

//   try {
//     const parser = StructuredOutputParser.fromZodSchema(schema)

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
//             `,
//     )

//     const chain = prompt.pipe(model).pipe(parser)

//     const result = await chain.invoke({
//       context: context,
//       formatting_instructions: parser.getFormatInstructions(),
//     })

//     // Generate the HTML description directly instead of markdown
//     const htmlDescription = `
// <h1>${result.job_title}</h1>

// <h2>Short Description</h2>
// <p>${result.short_description}</p>

// <h2>Key Responsibilities</h2>
// <ul>
//   ${result.key_responsibilities?.map((item) => `<li>${item}</li>`).join("")}
// </ul>

// <h2>Qualifications</h2>
// <ul>
//   ${result.qualifications?.map((item) => `<li>${item}</li>`).join("")}
// </ul>

// <h2>Experience Required</h2>
// <ul>
//   ${result.experience_required?.map((item) => `<li>${item}</li>`).join("")}
// </ul>

// <h2>Job Type</h2>
// <p>${result.job_type}</p>

// <h2>Location</h2>
// <p>${result.location}</p>

// <h2>Compensation</h2>
// <p>${result.compensation}</p>

// <h2>Other Relevant Details</h2>
// <ul>
//   ${result.other_relevant_details?.map((item) => `<li>${item}</li>`).join("")}
// </ul>
//     `

//     // Generate markdown for backward compatibility
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
//     `

//     // Save the job description to the database
//     const jobDescription = new JobDescription({
//       context: context,
//       company_name: company_name,
//       short_description: result.short_description,
//       key_responsibilities: result.key_responsibilities,
//       qualifications: result.qualifications,
//       experience_required: result.experience_required,
//       other_relevant_details: result.other_relevant_details,
//       markdown_description: markdownDescription, // Keep markdown for backward compatibility
//       html_description: htmlDescription, // Add HTML version directly
//       topskills: result.topskills, // Directly assign generated skills
//       topresponsibilityskills: result.topresponsibilityskills, // Directly assign generated skills
//       topqualificationskills: result.topqualificationskills, // Directly assign generated skills
//       status: "Open",
//       publish: false,
//       is_manual_entry: false,
//     })

//     // await jobDescription.save();
//     console.log("Job description generated and saved:", jobDescription)

//     return res.status(200).json({
//       job_description: jobDescription,
//     })
//   } catch (error) {
//     console.error("Error in generating JD:", error)
//     return res.status(500).json({ message: "Error in generating JD.", error: error.message })
//   }
// }

// export const updateJobDescription2 = async (req, res) => {
//   const { job_description, user_name, user_email, companyId } = req.body

//   try {
//     // Check if we have an existing job description to update
//     let existingJobDescription = null
//     if (job_description._id) {
//       existingJobDescription = await JobDescription.findById(job_description._id)
//     }

//     // Extract data from HTML content if it's a manual entry
//     const jobData = { ...job_description }

//     if (existingJobDescription) {
//       // Update existing job description
//       existingJobDescription.context = jobData.context
//       existingJobDescription.company_name = jobData.company_name
//       existingJobDescription.short_description = jobData.short_description
//       existingJobDescription.key_responsibilities = jobData.key_responsibilities
//       existingJobDescription.qualifications = jobData.qualifications
//       existingJobDescription.experience_required = jobData.experience_required
//       existingJobDescription.other_relevant_details = jobData.other_relevant_details
//       existingJobDescription.markdown_description = jobData.markdown_description
//       existingJobDescription.html_description = jobData.html_description // Update HTML content
//       existingJobDescription.topskills = jobData.topskills
//       existingJobDescription.topresponsibilityskills = jobData.topresponsibilityskills
//       existingJobDescription.topqualificationskills = jobData.topqualificationskills
//       existingJobDescription.is_manual_entry = jobData.is_manual_entry || false

//       // Add modification history
//       existingJobDescription.modifications.push({
//         user_name,
//         user_email,
//         date: new Date(),
//       })

//       await existingJobDescription.save()

//       return res.status(200).json({ job_description: existingJobDescription })
//     } else {
//       // Create new job description
//       const newJobDescription = new JobDescription({
//         ...jobData,
//         created_by: {
//           user_name,
//           user_email,
//         },
//         assignee: {
//           name: user_name,
//           email: user_email,
//           assignDate: new Date(),
//         },
//         jobOwner: {
//           name: user_name,
//           email: user_email,
//           assignDate: new Date(),
//         },
//         companyId, // Adding companyId to the new job description
//         // Make sure html_description is included
//         html_description: jobData.html_description || convertMarkdownToHTML(jobData.markdown_description),
//         is_manual_entry: jobData.is_manual_entry || false,
//       })

//       await newJobDescription.save()

//       return res.status(200).json({ job_description: newJobDescription })
//     }
//   } catch (error) {
//     console.log("server error", error)
//     return res.status(500).json({
//       message: "Error creating/updating job description.",
//       error: error.message,
//     })
//   }
// }

// // Update the updateSingleJob controller to handle HTML content
export const updateSingleJob2 = async (req, res) => {
  const { id } = req.params
  const { html_description, markdown_description, user_email, user_name, context } = req.body

  try {
    const jobDescription = await JobDescription.findById(id)

    if (!jobDescription) {
      return res.status(404).json({ message: "Job description not found." })
    }

    // Update with HTML content if provided, otherwise use markdown
    if (html_description) {
      jobDescription.html_description = html_description
      // If only HTML is provided, we don't need to update markdown
    } else if (markdown_description) {
      jobDescription.markdown_description = markdown_description
      // Convert markdown to HTML for consistency
      jobDescription.html_description = convertMarkdownToHTML(markdown_description)
    }

    // Update context if provided
    if (context) {
      jobDescription.context = context
    }

    // Add modification history
    jobDescription.modifications.push({
      user_name,
      user_email,
      date: new Date(),
    })

    await jobDescription.save()

    return res.status(200).json({
      message: "Job description updated successfully",
      job_description: jobDescription,
    })
  } catch (error) {
    console.error("Error updating job description:", error)
    return res.status(500).json({ message: "Error updating job description", error: error.message })
  }
}

export const updateSingleJob = async (req, res) => {
  const { id } = req.params
  const { html_description, markdown_description, user_email, user_name, context } = req.body

  try {
    const jobDescription = await JobDescription.findById(id)

    if (!jobDescription) {
      return res.status(404).json({ message: "Job description not found." })
    }

    // Update with HTML content if provided
    if (html_description) {
      jobDescription.html_description = html_description

      // Generate markdown from HTML to keep both formats in sync
      try {
        const generatedMarkdown = await convertHTMLToMarkdown(html_description)
        jobDescription.markdown_description = generatedMarkdown
        console.log("Markdown generated from HTML successfully")
      } catch (error) {
        console.error("Error generating markdown from HTML:", error)
        // Continue with the update even if markdown generation fails
      }
    }
    // If only markdown is provided, update markdown and generate HTML
    else if (markdown_description) {
      jobDescription.markdown_description = markdown_description
      // Convert markdown to HTML for consistency
      jobDescription.html_description = convertMarkdownToHTML(markdown_description)
    }

    // Update context if provided
    if (context) {
      jobDescription.context = context
    }

    // Add modification history
    jobDescription.modifications.push({
      user_name,
      user_email,
      date: new Date(),
    })

    await jobDescription.save()

    return res.status(200).json({
      message: "Job description updated successfully",
      job_description: jobDescription,
    })
  } catch (error) {
    console.error("Error updating job description:", error)
    return res.status(500).json({ message: "Error updating job description", error: error.message })
  }
}


// // You can add additional controller functions here for retrieving job descriptions
// // that include the HTML content for display

// export const getJobDescription = async (req, res) => {
//   const { id } = req.params

//   try {
//     const jobDescription = await JobDescription.findById(id)

//     if (!jobDescription) {
//       return res.status(404).json({ message: "Job description not found." })
//     }

//     return res.status(200).json({ job_description: jobDescription })
//   } catch (error) {
//     console.error("Error retrieving job description:", error)
//     return res.status(500).json({ message: "Error retrieving job description.", error: error.message })
//   }
// }

// export const getAllJobDescriptions = async (req, res) => {
//   const { companyId } = req.query

//   try {
//     const query = {}

//     if (companyId) {
//       query.companyId = companyId
//     }

//     const jobDescriptions = await JobDescription.find(query).sort({ created_at: -1 })

//     return res.status(200).json({ job_descriptions: jobDescriptions })
//   } catch (error) {
//     console.error("Error retrieving job descriptions:", error)
//     return res.status(500).json({ message: "Error retrieving job descriptions.", error: error.message })
//   }
// }

// export const togglePublish = async (req, res) => {
//   const { id } = req.params

//   try {
//     const jobDescription = await JobDescription.findById(id)

//     if (!jobDescription) {
//       return res.status(404).json({ message: "Job description not found." })
//     }

//     // Toggle the publish status
//     jobDescription.publish = !jobDescription.publish

//     await jobDescription.save()

//     return res.status(200).json({
//       message: `Job ${jobDescription.publish ? "published" : "unpublished"} successfully`,
//       publish: jobDescription.publish,
//     })
//   } catch (error) {
//     console.error("Error toggling publish status:", error)
//     return res.status(500).json({ message: "Error toggling publish status", error: error.message })
//   }
// }

// export const deleteJob = async (req, res) => {
//   const { id } = req.params

//   try {
//     const result = await JobDescription.findByIdAndDelete(id)

//     if (!result) {
//       return res.status(404).json({ message: "Job description not found." })
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Job deleted successfully",
//     })
//   } catch (error) {
//     console.error("Error deleting job:", error)
//     return res.status(500).json({ message: "Error deleting job", error: error.message })
//   }
// }
