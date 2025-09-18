// Fixed Resume Generation Controller - Handles errors gracefully and ensures completion
import { OpenAI } from "openai"
import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx"
import PDFDocument from "pdfkit"
import { io } from "../../index.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Resume generation endpoint
export const generateResume2 = async (req, res) => {
  try {
    const { candidate, jobInfo, format = "docx", recruiterId } = req.body
    if (!candidate || !candidate.candidateName) {
      return res.status(400).json({
        success: false,
        error: "Candidate information is required",
      })
    }
    // Ensure candidateId is consistent with frontend logic
    const candidateId = candidate.id || candidate._id || `${candidate.candidateName}_${candidate.email || Date.now()}`
    console.log(`🚀 Starting resume generation for: ${candidate.candidateName} (ID: ${candidateId})`)

    // Emit initial progress
    io.emit("resumeGenerationProgress", {
      candidateId,
      candidateName: candidate.candidateName,
      status: "initializing",
      progress: 5,
      message: "Starting resume generation process...",
    })

    res.status(200).json({
      success: true,
      message: "Resume generation started",
      candidateId,
    })

    // Start the resume generation process asynchronously
    generateResumeAsync(candidate, jobInfo, format, candidateId, recruiterId)
  } catch (error) {
    console.error("❌ Error starting resume generation:", error.message)
    res.status(500).json({
      success: false,
      error: "Failed to start resume generation",
    })
  }
}
// FIXED: generateResume function - better error handling
export const generateResume = async (req, res) => {
  try {
    const { candidate, jobInfo, format = "docx", recruiterId } = req.body;
    
    // FIXED: Better validation
    if (!candidate) {
      return res.status(400).json({
        success: false,
        error: "Candidate information is required",
      });
    }

    if (!candidate.candidateName && !candidate.name) {
      return res.status(400).json({
        success: false,
        error: "Candidate name is required",
      });
    }

    // FIXED: Ensure candidateId is properly set
    const candidateId = candidate.id || candidate._id || `${candidate.candidateName || candidate.name}_${candidate.email || Date.now()}`;
    
    console.log(`🚀 Starting resume generation for: ${candidate.candidateName || candidate.name} (ID: ${candidateId})`);

    // Emit initial progress
    io.emit("resumeGenerationProgress", {
      candidateId,
      candidateName: candidate.candidateName || candidate.name,
      status: "initializing",
      progress: 5,
      message: "Starting resume generation process...",
    });

    res.status(200).json({
      success: true,
      message: "Resume generation started",
      candidateId,
    });

    // Start the resume generation process asynchronously
    generateResumeAsync(candidate, jobInfo, format, candidateId, recruiterId);
  } catch (error) {
    console.error("❌ Error starting resume generation:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to start resume generation",
    });
  }
};

// Async resume generation function - FIXED with proper error handling
async function generateResumeAsync(candidate, jobInfo, format, candidateId, recruiterId) {
  let tempFilePath = null
  try {
    console.log(`📊 Processing resume for: ${candidate.candidateName} (ID: ${candidateId})`)

    // Step 1: Simplified Research (skip if fails)
    io.emit("resumeGenerationProgress", {
      candidateId,
      candidateName: candidate.candidateName,
      status: "researching",
      progress: 20,
      message: "Gathering additional candidate information...",
    })
    let additionalInfo = {}
    try {
      additionalInfo = await conductSimplifiedResearch(candidate)
      console.log(`🔍 Research completed for: ${candidate.candidateName}`)
    } catch (researchError) {
      console.log(`⚠️ Research failed, continuing with basic info: ${researchError.message}`)
      additionalInfo = {
        achievements: [],
        projects: [],
        publications: [],
        certifications: [],
        education: [],
        experience: [],
      }
    }

    // Step 2: AI Enhancement of candidate data
    io.emit("resumeGenerationProgress", {
      candidateId,
      candidateName: candidate.candidateName,
      status: "enhancing",
      progress: 40,
      message: "AI is enhancing candidate information...",
    })
    const enhancedCandidate = await enhanceCandidateWithAI(candidate, additionalInfo, jobInfo)
    console.log(`🧠 AI enhancement completed for: ${candidate.candidateName}`)

    // Step 3: Generate resume content
    io.emit("resumeGenerationProgress", {
      candidateId,
      candidateName: candidate.candidateName,
      status: "generating",
      progress: 60,
      message: "Generating professional resume content...",
    })
    const resumeContent = await generateResumeContent(enhancedCandidate, jobInfo)
    console.log(`📝 Resume content generated for: ${candidate.candidateName}`)

    // Step 4: Create document
    io.emit("resumeGenerationProgress", {
      candidateId,
      candidateName: candidate.candidateName,
      status: "formatting",
      progress: 80,
      message: `Creating ${format.toUpperCase()} document...`,
    })
    const fileName = `${candidate.candidateName.replace(/\s+/g, "_")}_Resume_${Date.now()}.${format}`
    tempFilePath = path.join(__dirname, "../temp", fileName)

    // Ensure temp directory exists
    try {
      if (!fs.existsSync(path.dirname(tempFilePath))) {
        fs.mkdirSync(path.dirname(tempFilePath), { recursive: true })
      }
    } catch (dirError) {
      console.error("Error creating temp directory:", dirError.message)
      throw new Error("Failed to create temporary directory")
    }

    if (format === "pdf") {
      await createPDFResumeFixed(resumeContent, tempFilePath)
    } else if (format === "docx") {
      await createDOCXResumeFixed(resumeContent, tempFilePath)
    } else {
      throw new Error(`Unsupported format: ${format}`)
    }
    console.log(`📄 ${format.toUpperCase()} document created for: ${candidate.candidateName}`)

    // Step 5: Complete and provide download
    // FIXED: In generateResumeAsync function - fix the completion event
io.emit("resumeGenerationComplete", {
  candidateId,
  candidateName: candidate.candidateName || candidate.name,
  status: "completed",
  progress: 100,
  message: "Resume generated successfully!",
  downloadUrl: `/api/headhunter/download-resume/${fileName}`, // FIXED: Relative URL only
  format,
  fileName,
});
    // io.emit("resumeGenerationComplete", {
    //   candidateId,
    //   candidateName: candidate.candidateName,
    //   status: "completed",
    //   progress: 100,
    //   message: "Resume generated successfully!",
    //   downloadUrl: `/api/headhunter/download-resume/${fileName}`,
    //   format,
    //   fileName,
    // })
    console.log(`✅ Resume generation completed successfully for: ${candidate.candidateName}`)
  } catch (error) {
    console.error(`❌ Error generating resume for ${candidate.candidateName}:`, error.message)
    // Clean up temp file if it exists
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath)
        console.log(`🗑️ Cleaned up temp file: ${tempFilePath}`)
      } catch (cleanupError) {
        console.log(`⚠️ Could not clean up temp file: ${cleanupError.message}`)
      }
    }
    // Always emit error event to stop frontend processing
    io.emit("resumeGenerationError", {
      candidateId,
      candidateName: candidate.candidateName,
      status: "error",
      progress: 0,
      error: error.message || "Resume generation failed",
    })
  }
}

// Simplified research function - handles failures gracefully
async function conductSimplifiedResearch(candidate) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID
  if (!apiKey || !searchEngineId) {
    console.log("⚠️ Google Search API not configured. Skipping research.")
    return {
      achievements: [],
      projects: [],
      publications: [],
      certifications: [],
      education: [],
      experience: [],
    }
  }
  try {
    console.log(`🔍 Starting simplified research for: ${candidate.candidateName}`)
    // Only try one simple search query
    const searchQuery = `"${candidate.candidateName}" ${candidate.currentJobTitle || ""} resume`.trim()
    const additionalInfo = {
      achievements: [],
      projects: [],
      publications: [],
      certifications: [],
      education: [],
      experience: [],
    }
    try {
      const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
        params: {
          key: apiKey,
          cx: searchEngineId,
          q: searchQuery,
          num: 3, // Limit to 3 results
        },
        timeout: 8000, // 8 second timeout
      })
      if (response.data.items && response.data.items.length > 0) {
        // Try to extract info from just the first result
        const firstResult = response.data.items[0]
        if (firstResult.snippet) {
          // Use AI to extract info from just the snippet (no scraping)
          const extractedInfo = await extractInfoFromSnippet(firstResult.snippet, candidate.candidateName)
          mergeAdditionalInfo(additionalInfo, extractedInfo)
        }
      }
    } catch (searchError) {
      console.log(`⚠️ Search failed, continuing without additional info: ${searchError.message}`)
    }
    return additionalInfo
  } catch (error) {
    console.log("⚠️ Research completely failed, returning empty info:", error.message)
    return {
      achievements: [],
      projects: [],
      publications: [],
      certifications: [],
      education: [],
      experience: [],
    }
  }
}

// Extract info from search snippet only (no web scraping)
async function extractInfoFromSnippet(snippet, candidateName) {
  const prompt = `
    Extract professional information about "${candidateName}" from this search snippet.
    Only include information that is clearly about this specific person.
    
    Snippet:
    ---
    ${snippet}
    ---
    
    Return ONLY this JSON structure:
    {
      "achievements": ["achievement1"],
      "projects": ["project1"],
      "certifications": ["cert1"],
      "education": ["education1"],
      "experience": ["experience1"],
      "publications": ["publication1"]
    }
    
    Return empty arrays if no relevant information is found.
  `
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 500,
      temperature: 0.1,
      response_format: { type: "json_object" },
    })
    return JSON.parse(response.choices[0].message.content)
  } catch (error) {
    console.log("⚠️ AI extraction failed:", error.message)
    return {
      achievements: [],
      projects: [],
      certifications: [],
      education: [],
      experience: [],
      publications: [],
    }
  }
}

// Merge additional information
function mergeAdditionalInfo(target, source) {
  try {
    Object.keys(source).forEach((key) => {
      if (Array.isArray(source[key]) && Array.isArray(target[key])) {
        target[key] = [...new Set([...target[key], ...source[key]])].slice(0, 5) // Limit to 5 items
      }
    })
  } catch (error) {
    console.log("⚠️ Error merging additional info:", error.message)
  }
}

// Enhanced candidate with AI - with better error handling
async function enhanceCandidateWithAI(candidate, additionalInfo, jobInfo) {
  const prompt = `
    You are a professional resume writer. Enhance this candidate's information.
    Create a comprehensive professional profile.
    
    **Candidate Data:**
    - Name: ${candidate.candidateName}
    - Title: ${candidate.currentJobTitle || "Professional"}
    - Company: ${candidate.currentCompany || "Previous Company"}
    - Location: ${candidate.location || "Not specified"}
    - Skills: ${(candidate.skills || []).join(", ") || "Professional skills"}
    - Summary: ${candidate.summary || "Experienced professional"}
    - Email: ${candidate.email || ""}
    - Phone: ${candidate.mobile || ""}
    
    **Additional Research:**
    - Achievements: ${(additionalInfo.achievements || []).join(", ") || "None"}
    - Projects: ${(additionalInfo.projects || []).join(", ") || "None"}
    - Certifications: ${(additionalInfo.certifications || []).join(", ") || "None"}
    
    **Target Job:**
    ${
      jobInfo
        ? `- Title: ${jobInfo.title}
    - Skills: ${(jobInfo.requiredSkills || []).join(", ")}`
        : "- General professional position"
    }
    
    Return ONLY this JSON structure:
    {
      "personalInfo": {
        "name": "${candidate.candidateName}",
        "email": "${candidate.email || ""}",
        "phone": "${candidate.mobile || ""}",
        "location": "${candidate.location || ""}",
        "linkedinUrl": "${candidate.sourceInfo?.linkedinProfileUrl || ""}",
        "portfolioUrl": "${candidate.sourceInfo?.portfolioUrl || ""}"
      },
      "professionalSummary": "Compelling 2-3 sentence summary",
      "coreCompetencies": ["skill1", "skill2", "skill3", "skill4", "skill5", "skill6"],
      "workExperience": [
        {
          "title": "${candidate.currentJobTitle || "Professional"}",
          "company": "${candidate.currentCompany || "Current Company"}",
          "duration": "Present",
          "achievements": ["• Achievement 1", "• Achievement 2", "• Achievement 3"]
        }
      ],
      "education": [
        {
          "degree": "Relevant Degree",
          "institution": "Educational Institution",
          "year": "Year",
          "details": null
        }
      ],
      "projects": [
        {
          "name": "Project Name",
          "description": "Project description",
          "technologies": ["tech1", "tech2"],
          "impact": "Business impact"
        }
      ],
      "certifications": ["Professional Certification"],
      "achievements": ["Professional Achievement"],
      "publications": []
    }
  `
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 2000,
      temperature: 0.2,
      response_format: { type: "json_object" },
    })
    return JSON.parse(response.choices[0].message.content)
  } catch (error) {
    console.error("❌ Error enhancing candidate with AI:", error.message)
    // Return fallback structure
    return {
      personalInfo: {
        name: candidate.candidateName,
        email: candidate.email || null,
        phone: candidate.mobile || null,
        location: candidate.location || null,
        linkedinUrl: candidate.sourceInfo?.linkedinProfileUrl || null,
        portfolioUrl: candidate.sourceInfo?.portfolioUrl || null,
      },
      professionalSummary: candidate.summary || "Experienced professional with strong technical skills.",
      coreCompetencies: candidate.skills || ["Professional Skills", "Technical Expertise", "Problem Solving"],
      workExperience: [
        {
          title: candidate.currentJobTitle || "Professional",
          company: candidate.currentCompany || "Current Company",
          duration: "Present",
          achievements: ["• Contributed to team success", "• Delivered quality results", "• Collaborated effectively"],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      achievements: [],
      publications: [],
    }
  }
}

// Generate resume content with error handling
async function generateResumeContent(enhancedCandidate, jobInfo) {
  const prompt = `
    Create a professional resume structure for this candidate.
    
    **Enhanced Candidate Data:**
    ${JSON.stringify(enhancedCandidate, null, 2)}
    
    **Target Position:**
    ${jobInfo ? `${jobInfo.title}` : "Professional position"}
    
    Return ONLY this JSON structure:
    {
      "header": {
        "name": "${enhancedCandidate.personalInfo?.name || "Professional"}",
        "title": "Professional Title",
        "contact": {
          "email": "${enhancedCandidate.personalInfo?.email || ""}",
          "phone": "${enhancedCandidate.personalInfo?.phone || ""}",
          "location": "${enhancedCandidate.personalInfo?.location || ""}",
          "linkedin": "${enhancedCandidate.personalInfo?.linkedinUrl || ""}",
          "portfolio": "${enhancedCandidate.personalInfo?.portfolioUrl || ""}"
        }
      },
      "summary": "${enhancedCandidate.professionalSummary || "Experienced professional with strong skills"}",
      "sections": [
        {
          "title": "CORE COMPETENCIES",
          "type": "skills",
          "content": ${JSON.stringify(enhancedCandidate.coreCompetencies || ["Professional Skills"])}
        },
        {
          "title": "PROFESSIONAL EXPERIENCE",
          "type": "experience",
          "content": ${JSON.stringify(enhancedCandidate.workExperience || [])}
        },
        {
          "title": "EDUCATION",
          "type": "education",
          "content": ${JSON.stringify(enhancedCandidate.education || [])}
        },
        {
          "title": "KEY PROJECTS",
          "type": "projects",
          "content": ${JSON.stringify(enhancedCandidate.projects || [])}
        },
        {
          "title": "CERTIFICATIONS & ACHIEVEMENTS",
          "type": "certifications",
          "content": ${JSON.stringify([...(enhancedCandidate.certifications || []), ...(enhancedCandidate.achievements || [])])}
        }
      ]
    }
  `
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 2500,
      temperature: 0.1,
      response_format: { type: "json_object" },
    })
    return JSON.parse(response.choices[0].message.content)
  } catch (error) {
    console.error("❌ Error generating resume content:", error.message)
    throw new Error("Failed to generate resume content with AI")
  }
}

// FIXED PDF creation function
async function createPDFResumeFixed(resumeContent, filePath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
      })
      // Use fs.createWriteStream properly
      const stream = fs.createWriteStream(filePath)
      doc.pipe(stream)
      // Header
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .text(resumeContent.header.name || "Professional Name", { align: "center" })
      if (resumeContent.header.title) {
        doc.fontSize(14).font("Helvetica").text(resumeContent.header.title, { align: "center" })
      }
      doc.moveDown(0.5)
      // Contact info
      const contact = resumeContent.header.contact || {}
      const contactInfo = [contact.email, contact.phone, contact.location, contact.linkedin].filter(Boolean).join(" | ")
      if (contactInfo) {
        doc.fontSize(10).text(contactInfo, { align: "center" })
      }
      doc.moveDown(1)
      // Summary
      if (resumeContent.summary) {
        doc.fontSize(12).font("Helvetica-Bold").text("PROFESSIONAL SUMMARY")
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
        doc.moveDown(0.3)
        doc.fontSize(10).font("Helvetica").text(resumeContent.summary)
        doc.moveDown(1)
      }
      // Sections
      if (resumeContent.sections && Array.isArray(resumeContent.sections)) {
        resumeContent.sections.forEach((section) => {
          if (!section.content || section.content.length === 0) return
          // Check if we need a new page
          if (doc.y > 700) {
            doc.addPage()
          }
          doc.fontSize(12).font("Helvetica-Bold").text(section.title)
          doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
          doc.moveDown(0.3)
          if (section.type === "skills") {
            doc.fontSize(10).font("Helvetica").text(section.content.join(" • "))
          } else if (section.type === "experience") {
            section.content.forEach((exp) => {
              doc
                .fontSize(11)
                .font("Helvetica-Bold")
                .text(`${exp.title || "Position"} | ${exp.company || "Company"}`)
              if (exp.duration) {
                doc.fontSize(10).font("Helvetica-Oblique").text(exp.duration)
              }
              if (exp.achievements && exp.achievements.length > 0) {
                exp.achievements.forEach((achievement) => {
                  doc.fontSize(10).font("Helvetica").text(achievement, { indent: 20 })
                })
              }
              doc.moveDown(0.5)
            })
          } else if (section.type === "education") {
            section.content.forEach((edu) => {
              const eduText = [edu.degree, edu.institution, edu.year].filter(Boolean).join(" | ")
              if (eduText) {
                doc.fontSize(10).font("Helvetica-Bold").text(eduText)
                if (edu.details) {
                  doc.fontSize(10).font("Helvetica").text(edu.details, { indent: 20 })
                }
                doc.moveDown(0.3)
              }
            })
          } else if (section.type === "projects") {
            section.content.forEach((project) => {
              doc
                .fontSize(11)
                .font("Helvetica-Bold")
                .text(project.name || "Project")
              doc
                .fontSize(10)
                .font("Helvetica")
                .text(project.description || "Project description")
              if (project.technologies && project.technologies.length > 0) {
                doc
                  .fontSize(9)
                  .font("Helvetica-Oblique")
                  .text(`Technologies: ${project.technologies.join(", ")}`)
              }
              if (project.impact) {
                doc.fontSize(10).font("Helvetica-Oblique").text(`Impact: ${project.impact}`)
              }
              doc.moveDown(0.3)
            })
          } else if (section.type === "certifications") {
            section.content.forEach((cert) => {
              doc.fontSize(10).font("Helvetica").text(`• ${cert}`)
            })
          }
          doc.moveDown(1)
        })
      }
      doc.end()
      stream.on("finish", resolve)
      stream.on("error", reject)
    } catch (error) {
      reject(error)
    }
  })
}

// FIXED DOCX creation function
async function createDOCXResumeFixed(resumeContent, filePath) {
  try {
    const doc = new Document({
      sections: [
        {
          children: [
            // Header
            new Paragraph({
              children: [
                new TextRun({
                  text: resumeContent.header.name || "Professional Name",
                  bold: true,
                  size: 32,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            ...(resumeContent.header.title
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: resumeContent.header.title,
                        size: 20,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ]
              : []),
            new Paragraph({
              children: [
                new TextRun({
                  text: [
                    resumeContent.header.contact?.email,
                    resumeContent.header.contact?.phone,
                    resumeContent.header.contact?.location,
                    resumeContent.header.contact?.linkedin,
                  ]
                    .filter(Boolean)
                    .join(" | "),
                  size: 18,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" }), // Empty line
            // Summary
            ...(resumeContent.summary
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "PROFESSIONAL SUMMARY",
                        bold: true,
                        size: 22,
                      }),
                    ],
                    heading: HeadingLevel.HEADING_2,
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: resumeContent.summary,
                        size: 20,
                      }),
                    ],
                  }),
                  new Paragraph({ text: "" }),
                ]
              : []),
            // Sections
            ...(resumeContent.sections || []).flatMap((section) => {
              if (!section.content || section.content.length === 0) return []
              const sectionParagraphs = [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: section.title,
                      bold: true,
                      size: 22,
                    }),
                  ],
                  heading: HeadingLevel.HEADING_2,
                }),
              ]
              if (section.type === "skills") {
                sectionParagraphs.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: section.content.join(" • "),
                        size: 20,
                      }),
                    ],
                  }),
                )
              } else if (section.type === "experience") {
                section.content.forEach((exp) => {
                  sectionParagraphs.push(
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `${exp.title || "Position"} | ${exp.company || "Company"}`,
                          bold: true,
                          size: 20,
                        }),
                      ],
                    }),
                  )
                  if (exp.duration) {
                    sectionParagraphs.push(
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: exp.duration,
                            italics: true,
                            size: 18,
                          }),
                        ],
                      }),
                    )
                  }
                  if (exp.achievements && exp.achievements.length > 0) {
                    exp.achievements.forEach((achievement) => {
                      sectionParagraphs.push(
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: achievement,
                              size: 18,
                            }),
                          ],
                          indent: { left: 720 },
                        }),
                      )
                    })
                  }
                })
              } else if (section.type === "education") {
                section.content.forEach((edu) => {
                  const eduText = [edu.degree, edu.institution, edu.year].filter(Boolean).join(" | ")
                  if (eduText) {
                    sectionParagraphs.push(
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: eduText,
                            size: 20,
                          }),
                        ],
                      }),
                    )
                    if (edu.details) {
                      sectionParagraphs.push(
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: edu.details,
                              size: 18,
                            }),
                          ],
                          indent: { left: 720 },
                        }),
                      )
                    }
                  }
                })
              } else if (section.type === "projects") {
                section.content.forEach((project) => {
                  sectionParagraphs.push(
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: project.name || "Project",
                          bold: true,
                          size: 20,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: project.description || "Project description",
                          size: 18,
                        }),
                      ],
                    }),
                  )
                  if (project.technologies && project.technologies.length > 0) {
                    sectionParagraphs.push(
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Technologies: ${project.technologies.join(", ")}`,
                            italics: true,
                            size: 16,
                          }),
                        ],
                      }),
                    )
                  }
                  if (project.impact) {
                    sectionParagraphs.push(
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Impact: ${project.impact}`,
                            italics: true,
                            size: 18,
                          }),
                        ],
                      }),
                    )
                  }
                })
              } else if (section.type === "certifications") {
                section.content.forEach((cert) => {
                  sectionParagraphs.push(
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `• ${cert}`,
                          size: 18,
                        }),
                      ],
                    }),
                  )
                })
              }
              sectionParagraphs.push(new Paragraph({ text: "" })) // Empty line after section
              return sectionParagraphs
            }),
          ],
        },
      ],
    })
    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(filePath, buffer)
  } catch (error) {
    console.error("❌ Error creating DOCX resume:", error.message)
    throw error
  }
}

// Download resume endpoint - FIXED
export const downloadResume2 = async (req, res) => {
  try {
    const { fileName } = req.params
    console.log(`📥 Download request for: ${fileName}`)
    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: "File name is required",
      })
    }
    const filePath = path.join(__dirname, "../temp", fileName)

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`)
      return res.status(404).json({
        success: false,
        error: "Resume file not found or has expired",
      })
    }

    // Use res.download for robust file serving
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("❌ Error sending file for download:", err.message)
        // Check if headers were already sent to avoid "Cannot set headers after they are sent"
        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            error: "Failed to download resume",
          })
        }
      } else {
        console.log(`✅ File downloaded successfully: ${fileName}`)
        // Clean up file after 1 hour (moved here to ensure download completes first)
        setTimeout(
          () => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
                console.log(`🗑️ Cleaned up resume file: ${fileName}`)
              }
            } catch (cleanupError) {
              console.log(`⚠️ Could not clean up file ${fileName}:`, cleanupError.message)
            }
          },
          60 * 60 * 1000, // 1 hour
        )
      }
    })
  } catch (error) {
    console.error("❌ Unexpected error in downloadResume:", error.message)
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Failed to download resume",
      })
    }
  }
}

// FIXED: downloadResume function - handle axios blob request
export const downloadResume = async (req, res) => {
  try {
    const { fileName } = req.params;
    console.log(`📥 Download request for: ${fileName}`);
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: "File name is required",
      });
    }

    const filePath = path.join(__dirname, "../temp", fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      return res.status(404).json({
        success: false,
        error: "Resume file not found or has expired",
      });
    }

    // FIXED: Set proper headers for axios blob download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    // FIXED: Send file as stream instead of using res.download
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('end', () => {
      console.log(`✅ File streamed successfully: ${fileName}`);
      // Clean up file after 1 hour
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Cleaned up resume file: ${fileName}`);
          }
        } catch (cleanupError) {
          console.log(`⚠️ Could not clean up file ${fileName}:`, cleanupError.message);
        }
      }, 60 * 60 * 1000);
    });
    
    fileStream.on('error', (error) => {
      console.error("❌ Error streaming file:", error.message);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Failed to download resume",
        });
      }
    });

  } catch (error) {
    console.error("❌ Unexpected error in downloadResume:", error.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Failed to download resume",
      });
    }
  }
};
