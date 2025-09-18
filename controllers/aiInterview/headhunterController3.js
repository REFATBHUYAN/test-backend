// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Resume from "../../model/resumeModel.js"
// import Notification from "../../model/NotificationModal.js"
// import { io } from "../../index.js"
// import mongoose from "mongoose"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // Global search control map
// const searchControlMap = new Map()

// // NEW: LinkedIn extraction queue and results
// const linkedinExtractionQueue = new Map() // searchId -> { urls: [], processed: [], failed: [] }
// const linkedinExtractionResults = new Map() // searchId -> extracted candidates

// // --- ENHANCED SCHEMAS ---
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { type: String, enum: ["pending", "in_progress", "completed", "failed", "stopped"], default: "pending" },
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   results: [
//     {
//       candidateName: String,
//       email: String,
//       mobile: mongoose.Schema.Types.Mixed,
//       jobTitle: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "JobDescription",
//       },
//       companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//       currentCompany: String,
//       location: String,
//       skills: [String],
//       experience: String,
//       summary: String,
//       candidateStatus: String,
//       matchingScoreDetails: {
//         skillsMatch: Number,
//         experienceMatch: Number,
//         educationMatch: Number,
//         overallMatch: Number,
//       },
//       analysis: {
//         skills: {
//           candidateSkills: [String],
//           matched: [String],
//           notMatched: [String],
//         },
//         experience: {
//           relevantExperience: String,
//           yearsOfExperience: String,
//         },
//         education: {
//           highestDegree: String,
//           relevantCourses: [String],
//         },
//         projects: [String],
//         recommendation: String,
//         comments: String,
//         additionalNotes: String,
//       },
//       comment: String,
//       recommendation: {
//         type: String,
//         enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//       },
//       aiSourced: Boolean,
//       sourceInfo: {
//         platform: String,
//         profileUrl: String,
//         linkedinProfileUrl: String,
//         githubProfileUrl: String,
//         portfolioUrl: String,
//         dribbbleUrl: String,
//         behanceUrl: String,
//         mediumUrl: String,
//         twitterUrl: String,
//         personalWebsite: String,
//         sourcedAt: Date,
//         sourcedBy: mongoose.Schema.Types.ObjectId,
//         aiModel: String,
//         hasEmail: Boolean,
//         hasPhone: Boolean,
//       },
//     },
//   ],
//   linkedinProfiles: [
//     {
//       profileUrl: String,
//       candidateName: String,
//       profileTitle: String,
//       location: String,
//       extractionStatus: {
//         type: String,
//         enum: ["pending", "processing", "success", "failed", "rate_limited", "blocked"],
//         default: "pending",
//       },
//       errorCode: Number,
//       lastAttempted: { type: Date, default: Date.now },
//       retryCount: { type: Number, default: 0 },
//     },
//   ],
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
//   stoppedAt: Date,
//   stoppedBy: mongoose.Schema.Types.ObjectId,
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // --- UTILITY FUNCTIONS ---
// function cleanJsonResponse(responseText) {
//   const match = responseText.match(/```json([\s\S]*?)```/)
//   const cleanText = match ? match[1] : responseText
//   return cleanText
//     .replace(/```json\n|\n```/g, "")
//     .replace(/```/g, "")
//     .trim()
// }

// function isValidJson(str) {
//   try {
//     JSON.parse(str)
//     return true
//   } catch {
//     return false
//   }
// }

// // Enhanced progress emitter with stop control
// function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "", canStop = true) {
//   const progressData = {
//     searchId,
//     status,
//     progress: Math.min(Math.max(progress, 0), 100),
//     candidatesFound,
//     platform,
//     timestamp: new Date().toISOString(),
//     canStop,
//   }
//   console.log(`Progress Update [${searchId}]: ${progress}% - ${status} - ${candidatesFound} candidates`)
//   io.emit("searchProgress", progressData)
// }

// // Check if search should be stopped
// function shouldStopSearch(searchId) {
//   const control = searchControlMap.get(searchId.toString())
//   return control?.shouldStop || false
// }

// // Stop search function
// export const stopSearch = async (req, res) => {
//   try {
//     const { searchId, recruiterId } = req.body
//     if (!searchId || !recruiterId) {
//       return res.status(400).json({
//         success: false,
//         error: "Search ID and recruiter ID are required",
//       })
//     }

//     // Set stop flag
//     searchControlMap.set(searchId.toString(), { shouldStop: true, stoppedBy: recruiterId })

//     // Update search history
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       stoppedAt: new Date(),
//       stoppedBy: recruiterId,
//     })

//     console.log(`🛑 Search ${searchId} stop requested by ${recruiterId}`)
//     res.status(200).json({
//       success: true,
//       message: "Search stop requested. Processing current candidates...",
//     })

//     // Emit stop notification
//     io.emit("searchStopping", {
//       searchId,
//       message: "Search stopping... Processing current candidates.",
//     })
//   } catch (error) {
//     console.error("❌ Error stopping search:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // NEW: Handle LinkedIn DOM content from frontend
// export const processLinkedInDOM = async (req, res) => {
//   try {
//     const { searchId, profileUrl, domContent, success, error } = req.body;
//     if (!searchId || !profileUrl) {
//       return res.status(400).json({ success: false, error: "Search ID and profile URL are required" });
//     }

//     console.log(`📥 Received LinkedIn DOM for: ${profileUrl}`);

//     if (!success || !domContent) {
//       console.log(`❌ Failed to extract DOM from: ${profileUrl}. Reason: ${error}`);
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed");
//       await checkLinkedInExtractionComplete(searchId);
//       return res.status(200).json({ success: true, message: "Failed extraction recorded" });
//     }

//     await updateLinkedInProfileStatus(searchId, profileUrl, "processing");

//     // Extract candidate data using AI, now solely from domContent
//     const candidate = await extractCandidateFromLinkedInDOM(domContent, profileUrl);
//     if (candidate) {
//       console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`);
            
//       const searches = linkedinExtractionResults.get(searchId) || [];
//       searches.push(candidate);
//       linkedinExtractionResults.set(searchId, searches);
//       await updateLinkedInProfileStatus(searchId, profileUrl, "success", candidate.candidateName);
//     } else {
//       console.log(`❌ AI failed to extract candidate data from: ${profileUrl}`);
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed");
//     }

//     // Check if all LinkedIn profiles are processed to continue the main search
//     await checkLinkedInExtractionComplete(searchId);

//     res.status(200).json({
//       success: true,
//       message: "LinkedIn DOM processed",
//     });
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn DOM:", error.message);
//     // Ensure we still check for completion even on unexpected error
//     if(req.body.searchId) {
//         await checkLinkedInExtractionComplete(req.body.searchId);
//     }
//     res.status(500).json({ success: false, error: "Internal server error" });
//   }
// };

// // NEW: Update LinkedIn profile extraction status
// async function updateLinkedInProfileStatus(searchId, profileUrl, status, candidateName = null) {
//   try {
//     const updateData = {
//       extractionStatus: status,
//       lastAttempted: new Date(),
//     }
//     if (candidateName) {
//       updateData.candidateName = candidateName
//     }

//     await SearchHistory.findOneAndUpdate(
//       {
//         _id: searchId,
//         "linkedinProfiles.profileUrl": profileUrl,
//       },
//       {
//         $set: {
//           "linkedinProfiles.$.extractionStatus": status,
//           "linkedinProfiles.$.lastAttempted": new Date(),
//           ...(candidateName && { "linkedinProfiles.$.candidateName": candidateName }),
//         },
//       },
//     )
//   } catch (error) {
//     console.error("❌ Error updating LinkedIn profile status:", error.message)
//   }
// }

// // ENHANCED: Check if LinkedIn extraction is complete or stopped with better stop handling
// async function checkLinkedInExtractionComplete(searchId) {
//   try {
//     const search = await SearchHistory.findById(searchId);
//     if (!search) return;

//     // Check if the search has been stopped by the user
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search ${searchId} was stopped. Processing candidates with partial LinkedIn results.`);
      
//       // Get extracted candidates so far
//       const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
      
//       // Update remaining pending profiles to failed status
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         $set: {
//           "linkedinProfiles.$[elem].extractionStatus": "failed"
//         }
//       }, {
//         arrayFilters: [{ "elem.extractionStatus": { $in: ["pending", "processing"] } }]
//       });

//       // Continue with partial results
//       await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, true);
      
//       // Clean up
//       linkedinExtractionQueue.delete(searchId);
//       linkedinExtractionResults.delete(searchId);
//       return;
//     }

//     const pendingProfiles = search.linkedinProfiles.filter(
//       (profile) => profile.extractionStatus === "pending" || profile.extractionStatus === "processing"
//     );

//     console.log(`📊 LinkedIn extraction status for ${searchId}: ${pendingProfiles.length} pending, ${search.linkedinProfiles.length - pendingProfiles.length} completed`);

//     if (pendingProfiles.length === 0) {
//       console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`);
//       const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
//       await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, false);
      
//       // Clean up
//       linkedinExtractionQueue.delete(searchId);
//       linkedinExtractionResults.delete(searchId);
//     } else {
//       // Emit progress update for LinkedIn extraction
//       const totalProfiles = search.linkedinProfiles.length;
//       const completedProfiles = totalProfiles - pendingProfiles.length;
//       const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
      
//       // NEW: Emit LinkedIn extraction progress
//       io.emit("linkedinExtractionUpdate", {
//         isExtracting: true,
//         progress: { current: completedProfiles, total: totalProfiles },
//         currentUrl: pendingProfiles[0]?.profileUrl || "",
//       });

//       emitProgress(
//         searchId,
//         `🔗 Extracting LinkedIn profiles: ${completedProfiles}/${totalProfiles} completed (${extractedCandidates.length} candidates extracted)`,
//         60 + (completedProfiles / totalProfiles) * 25,
//         extractedCandidates.length,
//         "linkedin-browser",
//         true // Allow stopping during LinkedIn extraction
//       );
//     }
//   } catch (error) {
//     console.error("❌ Error checking LinkedIn extraction completion:", error.message);
//   }
// }

// // NEW: Extract candidate from LinkedIn DOM using AI
// async function extractCandidateFromLinkedInDOM(domContent, profileUrl, searchId) {
//   const prompt = `
//     You are an expert LinkedIn profile analyzer. Extract comprehensive professional information from this LinkedIn profile DOM content.
    
//     **CRITICAL EXTRACTION REQUIREMENTS:**
//     1. **ZERO FABRICATION**: Only extract information explicitly present in the content
//     2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
//     3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional details
//     4. **EXACT TRANSCRIPTION**: Copy information exactly as written
    
//     **LinkedIn Profile URL:** ${profileUrl}
    
//     **DOM Content:**
//     ---
//     ${domContent.substring(0, 15000)} // Limit content size
//     ---
    
//     **REQUIRED EXTRACTION FIELDS:**
//     Extract the following information ONLY if clearly present:
    
//     **Personal Information:**
//     - Full name (complete name as displayed)
//     - Current location (city, state, country)
//     - Profile headline/title
//     - Contact information (if visible)
    
//     **Professional Information:**
//     - Current position and company
//     - Professional summary/about section
//     - Work experience (current and previous roles)
//     - Skills and endorsements
//     - Education background
//     - Certifications and licenses
    
//     **Additional Information:**
//     - Languages spoken
//     - Volunteer experience
//     - Publications and projects
//     - Recommendations received
//     - Activity and posts (if relevant)
    
//     **OUTPUT FORMAT:**
//     Return ONLY this JSON structure with extracted data or null values:
//     {
//       "candidateName": "Full name exactly as written or null",
//       "email": "email if visible or null",
//       "mobile": "phone number if visible or null",
//       "currentJobTitle": "Current position title or null",
//       "currentCompany": "Current company name or null",
//       "location": "Location string or null",
//       "headline": "LinkedIn headline or null",
//       "summary": "About/summary section or null",
//       "skills": ["skill1", "skill2", "skill3"] or [],
//       "experience": "Work experience description or null",
//       "education": "Education information or null",
//       "certifications": ["cert1", "cert2"] or [],
//       "languages": ["language1", "language2"] or [],
//       "volunteerWork": "Volunteer experience or null",
//       "publications": ["publication1", "publication2"] or [],
//       "recommendations": "Recommendations received or null",
//       "connectionsCount": "Number of connections if visible or null",
//       "yearsOfExperience": "Calculated years of experience or null",
//       "industries": ["industry1", "industry2"] or [],
//       "sourceInfo": {
//         "profileUrl": "${profileUrl}",
//         "platform": "linkedin",
//         "extractionMethod": "browser-dom",
//         "hasEmail": false,
//         "hasPhone": false,
//         "hasContactInfo": false
//       }
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 3000,
//       temperature: 0.05,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)

//     // Validate that we have at least a name
//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from LinkedIn DOM`)
//       return null
//     }

//     // Create candidate object
//     const candidate = {
//       id: `linkedin_browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       candidateName: result.candidateName,
//       email: result.email,
//       mobile: result.mobile,
//       currentJobTitle: result.currentJobTitle,
//       currentCompany: result.currentCompany,
//       location: result.location,
//       headline: result.headline,
//       skills: result.skills || [],
//       summary: result.summary,
//       experience: result.experience,
//       yearsOfExperience: result.yearsOfExperience,
//       education: result.education,
//       certifications: result.certifications || [],
//       languages: result.languages || [],
//       volunteerWork: result.volunteerWork,
//       publications: result.publications || [],
//       recommendations: result.recommendations,
//       connectionsCount: result.connectionsCount,
//       industries: result.industries || [],
//       sourceInfo: {
//         platform: "linkedin",
//         profileUrl: profileUrl,
//         linkedinProfileUrl: profileUrl,
//         extractionMethod: "browser-dom",
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//         hasContactInfo: !!(result.email || result.mobile),
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//       },
//       matchScore: 0,
//     }

//     return candidate
//   } catch (error) {
//     console.error(`❌ Error extracting candidate from LinkedIn DOM:`, error.message)
//     return null
//   }
// }

// // RESTORED: Continue search after LinkedIn extraction with complete candidate processing
// async function continueSearchAfterLinkedInExtraction(searchId, linkedinCandidates, wasStopped = false) {
//   try {
//     console.log(`🔄 Continuing search (stopped=${wasStopped}). Found ${linkedinCandidates.length} candidates from LinkedIn.`);
    
//     const search = await SearchHistory.findById(searchId);
//     if (!search) return;

//     const job = await JobDescription.findById(search.jobId);
//     if (!job) return;

//     // Get existing candidates from other platforms
//     const allCandidates = linkedinExtractionResults.get(searchId) || [];

//     emitProgress(
//       searchId,
//       `🔄 Processing ${allCandidates.length} total candidates...`,
//       85,
//       allCandidates.length,
//       "",
//       false
//     );

//     // Deduplicate candidates
//     const uniqueCandidates = deduplicateCandidates(allCandidates);
//     console.log(`🎯 After deduplication: ${uniqueCandidates.length} unique candidates`);

//     // Evaluate all candidates with AI matching
//     const evaluatedCandidates = [];
//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       // Check for stop during evaluation (though less likely to be needed here)
//       if (shouldStopSearch(searchId) && !wasStopped) {
//         console.log(`🛑 Search stopped during evaluation at candidate ${i + 1}`);
//         wasStopped = true;
//         break;
//       }

//       const candidate = uniqueCandidates[i];
//       const evaluation = await evaluateCandidateMatch(candidate, job, search.searchSettings);
//       if (evaluation) {
//         candidate.matchScore = evaluation.matchingScoreDetails.overallMatch;
//         candidate.matchingScoreDetails = evaluation.matchingScoreDetails;
//         candidate.analysis = evaluation.analysis;
//         candidate.comment = evaluation.comment;
//         candidate.recommendation = evaluation.recommendation;
//         candidate.confidenceLevel = evaluation.confidenceLevel;
//       }

//       candidate.jobTitle = job._id;
//       candidate.companyId = job.companyId;
//       candidate.candidateStatus = "AI Sourced";
//       candidate.aiSourced = true;
//       evaluatedCandidates.push(candidate);

//       // Update progress during evaluation
//       if (i % 5 === 0) {
//         emitProgress(
//           searchId,
//           `📊 Evaluating candidates: ${i + 1}/${uniqueCandidates.length}`,
//           85 + ((i / uniqueCandidates.length) * 10),
//           evaluatedCandidates.length,
//           "",
//           false
//         );
//       }
//     }

//     // Filter and rank candidates
//     const rankedCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName)
//       .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

//     // Select top candidates based on search settings (or all if stopped)
//     const finalCandidates = wasStopped ? rankedCandidates : rankedCandidates.slice(0, search.searchSettings.candidateCount || 10);

//     console.log(`🎯 Selected top ${finalCandidates.length} candidates for saving.`);

//     // Save candidates to Resume database
//     await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId);

//     // Update search history with results
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: wasStopped ? "stopped" : "completed",
//       completedAt: new Date(),
//     });

//     // Emit completion
//     const completionMessage = wasStopped
//       ? `🛑 Search stopped! Saved ${finalCandidates.length} candidates.`
//       : `🎉 Search completed! Found and saved ${finalCandidates.length} high-quality candidates.`;
          
//     emitProgress(searchId, completionMessage, 100, finalCandidates.length, "", false);

//     io.emit("searchComplete", {
//       searchId: searchId,
//       candidates: finalCandidates,
//       wasStopped: wasStopped,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         linkedinCandidatesExtracted: linkedinCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//       },
//     });

//     const notification = new Notification({
//       message: `${wasStopped ? '🛑 Search stopped' : '🎉 Enhanced search completed'}! Found ${finalCandidates.length} candidates for ${job.context}.`,
//       recipientId: search.recruiterId,
//       jobId: job._id,
//     });
//     await notification.save();
//     io.emit("newNotification", notification);

//     // Clean up search control
//     searchControlMap.delete(searchId.toString());

//   } catch (error) {
//     console.error("❌ Error continuing search after LinkedIn extraction:", error.message);
//   }
// }

// // RESTORED: Save candidates to Resume database
// async function saveCandidatesToResumeDatabase(candidates, job, recruiterId) {
//   try {
//     console.log(`💾 Saving ${candidates.length} candidates to Resume database...`)
    
//     const resumeDataArray = candidates.map((candidate) => ({
//       candidateName: candidate.candidateName,
//       email: candidate.email,
//       mobile: candidate.mobile,
//       jobTitle: job._id,
//       companyId: job.companyId,
//       companyName: candidate.currentCompany,
//       resumeLink: candidate.sourceInfo?.profileUrl,
//       linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//       matchingScoreDetails: candidate.matchingScoreDetails,
//       analysis: {
//         skills: {
//           candidateSkills: candidate.skills || [],
//           matched: candidate.analysis?.skills?.matched || [],
//           notMatched: candidate.analysis?.skills?.notMatched || [],
//         },
//         experience: {
//           relevantExperience:
//             candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//           yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//         },
//         education: {
//           highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//           relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//         },
//         projects: candidate.analysis?.projects || candidate.projects || [],
//         recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//         comments: candidate.analysis?.comments || candidate.comment,
//         additionalNotes: candidate.analysis?.additionalNotes || "",
//       },
//       summary: candidate.summary,
//       candidateStatus: "AI Sourced",
//       aiSourced: true,
//       sourceInfo: {
//         platform: candidate.sourceInfo?.platform,
//         profileUrl: candidate.sourceInfo?.profileUrl,
//         linkedinProfileUrl: candidate.sourceInfo?.linkedinProfileUrl,
//         extractionMethod: candidate.sourceInfo?.extractionMethod,
//         sourcedAt: candidate.sourceInfo?.sourcedAt,
//         sourcedBy: recruiterId,
//         aiModel: candidate.sourceInfo?.aiModel,
//         hasEmail: candidate.sourceInfo?.hasEmail,
//         hasPhone: candidate.sourceInfo?.hasPhone,
//       },
//       created_at: new Date(),
//     }))

//     // Check for existing candidates to avoid duplicates
//     const existingResumes = await Resume.find({
//       jobTitle: job._id,
//       companyId: job.companyId,
//       candidateName: { $in: resumeDataArray.map((r) => r.candidateName) },
//     })

//     const existingNames = new Set(existingResumes.map((r) => r.candidateName))
//     const newResumes = resumeDataArray.filter((r) => !existingNames.has(r.candidateName))

//     if (newResumes.length > 0) {
//       await Resume.insertMany(newResumes, { ordered: false })
//       console.log(`✅ Successfully saved ${newResumes.length} new candidates to Resume database`)
//     } else {
//       console.log(`ℹ️ All candidates already exist in database, no new records saved`)
//     }

//     console.log(`📊 Database save summary:`)
//     console.log(`   - Total candidates processed: ${candidates.length}`)
//     console.log(`   - Existing candidates found: ${existingNames.size}`)
//     console.log(`   - New candidates saved: ${newResumes.length}`)
//   } catch (error) {
//     console.error(`❌ Error saving candidates to Resume database:`, error.message)
//   }
// }

// // Analyze job for optimal platform selection
// export const analyzeJobForPlatforms = async (jobDescription, searchSettings) => {
//   const prompt = `
//     You are an expert headhunter and recruitment strategist with 15+ years of experience. Analyze this job posting comprehensively and determine the optimal platforms and search strategies.

//     **Job Details:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Available Platforms:**
//     - linkedin: Professional networking, all industries, executives, managers
//     - github: Developers, engineers, technical roles, open source contributors
//     - google: General web search, resumes, portfolios, industry-specific sites, personal websites
//     - dribbble: UI/UX designers, visual designers, product designers, mobile app designers
//     - behance: Creative professionals, graphic designers, artists, brand designers, photographers

//     **Your Expert Analysis Task:**
//     1. Carefully analyze the job requirements to determine the primary job category and industry
//     2. Identify the most relevant platforms based on role type and industry
//     3. Suggest specialized websites or platforms that might contain relevant candidates
//     4. Determine search priorities based on candidate availability and platform relevance
//     5. Consider alternative job titles and industry-specific terminology

//     **Professional Categories to Consider:**
//     - Technology/Engineering: Software engineers, DevOps, data scientists, AI/ML engineers, full-stack developers, mobile developers, system architects
//     - Design/Creative: UI/UX designers, product designers, graphic designers, brand managers, creative directors, illustrators, photographers
//     - Legal: Corporate lawyers, litigation attorneys, paralegals, compliance officers, legal counsel
//     - Healthcare: Physicians, nurses, medical specialists, healthcare administrators, clinical researchers
//     - Finance: Financial analysts, investment bankers, accountants, financial advisors, risk managers, actuaries
//     - Marketing/Sales: Digital marketers, sales managers, content creators, SEO specialists, social media managers, PR professionals
//     - HR/Management: HR directors, talent acquisition specialists, organizational development, executive recruiters
//     - Education: Professors, teachers, instructional designers, education technology specialists
//     - Operations: Supply chain managers, logistics coordinators, project managers, operations analysts
//     - Consulting: Management consultants, strategy advisors, business analysts, process improvement specialists

//     **Platform Selection Criteria:**
//     - HIGH priority: Primary platforms where 70%+ of qualified candidates are likely found
//     - MEDIUM priority: Secondary platforms with 30-50% candidate likelihood
//     - LOW priority: Niche platforms with <30% but highly qualified candidates

//     Return ONLY a valid JSON object with comprehensive analysis:
//     {
//       "jobCategory": "Primary category (be very specific)",
//       "jobSubcategory": "Detailed subcategory with specialization",
//       "seniorityLevel": "Entry/Mid/Senior/Executive level analysis",
//       "recommendedPlatforms": [
//         {
//           "platform": "platform_name",
//           "priority": "high|medium|low",
//           "reason": "Detailed explanation of why this platform is optimal for this role",
//           "expectedCandidateVolume": "high|medium|low"
//         }
//       ],
//       "specializedSites": [
//         {
//           "site": "domain.com or site description",
//           "description": "What type of professionals and why relevant",
//           "searchApproach": "How to search this platform effectively"
//         }
//       ],
//       "searchKeywords": ["highly relevant keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
//       "alternativeJobTitles": ["alternative title1", "title2", "title3", "title4"],
//       "industrySpecificTerms": ["term1", "term2", "term3", "term4"],
//       "skillSynonyms": {
//         "primary_skill": ["synonym1", "synonym2"],
//         "secondary_skill": ["synonym1", "synonym2"]
//       },
//       "targetCompanyTypes": ["startup", "enterprise", "agency", "consulting"],
//       "searchComplexity": "simple|moderate|complex"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1500,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     })

//     const analysis = JSON.parse(response.choices[0].message.content)
//     console.log("🔍 Enhanced job analysis completed:", {
//       category: analysis.jobCategory,
//       subcategory: analysis.jobSubcategory,
//       platforms: analysis.recommendedPlatforms?.length,
//       complexity: analysis.searchComplexity,
//     })

//     return analysis
//   } catch (error) {
//     console.error("❌ Error analyzing job:", error.message)
//     return null
//   }
// }

// // Get cost estimate function
// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount = 10 } = req.query
//     const estimate = estimateSearchCost(Number.parseInt(candidateCount))
//     res.status(200).json({ success: true, estimate })
//   } catch (error) {
//     console.error("❌ Error calculating cost estimate:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Enhanced search query generation
// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 15 highly effective, diverse search queries to find top-tier candidates.

//     **Job Information:**
//     - Position: ${jobDescription.context}
//     - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
//     - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
//     - Seniority: ${jobAnalysis?.seniorityLevel || searchSettings.experienceLevel}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Alternative Titles: ${jobAnalysis?.alternativeJobTitles?.join(", ") || ""}
//     - Industry Terms: ${jobAnalysis?.industrySpecificTerms?.join(", ") || ""}
//     - Skill Synonyms: ${JSON.stringify(jobAnalysis?.skillSynonyms || {})}
//     - Target Companies: ${jobAnalysis?.targetCompanyTypes?.join(", ") || ""}

//     **Platform to Target:** ${platform}

//     **Platform-Specific Advanced Instructions:**
//     ${getPlatformInstructions(platform, jobAnalysis)}

//     **Advanced Query Generation Strategy:**
//     1. **Diversity is Key**: Create queries with different approaches - skills-based, title-based, company-based, project-based, certification-based
//     2. **Boolean Mastery**: Use advanced operators: AND, OR, NOT, parentheses for grouping, quotes for exact phrases
//     3. **Synonym Integration**: Include skill synonyms and alternative terminology
//     4. **Experience Targeting**: Tailor queries to the required seniority level
//     5. **Geographic Precision**: If location specified, use city, state, metro area, and remote variations
//     6. **Company Intelligence**: Target relevant company types and industry leaders
//     7. **Certification Focus**: Include relevant certifications and credentials
//     8. **Project-Based Search**: Look for specific project types and achievements

//     **Query Categories to Generate (15 total):**
//     - 4 Skill-focused queries (core skills + combinations)
//     - 3 Title-focused queries (exact titles + alternatives)
//     - 2 Company-focused queries (target company types)
//     - 2 Location-focused queries (if applicable)
//     - 2 Experience-focused queries (seniority level)
//     - 1 Certification-focused query
//     - 1 Project-focused query

//     **Quality Standards:**
//     - Each query should be unique and approach candidate finding differently
//     - Queries should be 10-50 words long
//     - Focus on finding individual profiles, not company pages
//     - Include contact discovery elements where appropriate
//     - Balance broad reach with specific targeting

//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8", "query9", "query10", "query11", "query12", "query13", "query14", "query15"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.6,
//       response_format: { type: "json_object" },
//     })

//     const content = JSON.parse(response.choices[0].message.content)
//     const queries = content.queries || []
//     console.log(`🔍 Generated ${queries.length} enhanced queries for ${platform}`)
//     return queries.slice(0, 15)
//   } catch (error) {
//     console.error("❌ Error generating search queries:", error.message)
//     return []
//   }
// }

// // Platform instructions helper
// function getPlatformInstructions(platform, jobAnalysis) {
//   const category = jobAnalysis?.jobCategory?.toLowerCase() || ""
//   const seniority = jobAnalysis?.seniorityLevel?.toLowerCase() || ""

//   switch (platform) {
//     case "linkedin":
//       return `
//         **LinkedIn Advanced Search Strategy:**
//         LinkedIn is the primary professional platform. Create sophisticated queries using:
        
//         **Boolean Search Mastery:**
//         - Use quotes for exact phrases: "Senior Software Engineer"
//         - Use parentheses for grouping: (Java OR Python OR JavaScript)
//         - Use AND/OR/NOT operators strategically
//         - Target current positions and past experience
        
//         **Targeting Strategies:**
//         - Seniority-based: "${seniority}" level professionals
//         - Company-based: Current/past employees of target companies
//         - Skills-based: Multiple skill combinations with AND/OR
//         - Industry-based: Specific industry experience
//         - Location-based: Current location + willing to relocate
//         - Education-based: Relevant degrees and universities
        
//         **Examples by Category:**
//         - Tech: "Senior Software Engineer" AND (Python OR Java) AND "San Francisco"
//         - Design: "UI/UX Designer" AND (Figma OR Sketch) AND "portfolio"
//         - Legal: ("Corporate Lawyer" OR "Legal Counsel") AND "Securities Law"
//         - Finance: "Investment Banker" AND "Mergers Acquisitions" AND CFA
//         - Healthcare: ("Physician" OR "Doctor") AND "Cardiology" AND "Board Certified"
        
//         **Contact Discovery:**
//         - Include "contact" OR "email" in some queries
//         - Target profiles with external contact information
//         - Look for profiles mentioning "open to opportunities"
//       `
//     case "github":
//       return `
//         **GitHub Advanced Search for Technical Talent:**
//         GitHub is perfect for technical roles. Create queries that target:
        
//         **Technical Depth:**
//         - Programming languages: language:Python language:JavaScript
//         - Framework expertise: React Vue.js Django Flask
//         - Location targeting: location:"San Francisco" location:"Remote"
//         - Activity level: followers:>100 repos:>10
//         - Recent activity: pushed:>2024-01-01
        
//         **Profile Intelligence:**
//         - Bio-based searches: Target user bios with role keywords
//         - Repository analysis: Specific project types and technologies
//         - Contribution patterns: Active contributors and maintainers
//         - Company affiliations: Current/past company mentions
        
//         **Examples:**
//         - "Senior Developer" location:"New York" language:Python
//         - "Machine Learning" "AI" followers:>50 repos:>5
//         - "Full Stack" React Node.js location:Remote
//         - "DevOps" Docker Kubernetes AWS location:"San Francisco"
        
//         **Only use for technical roles requiring programming skills.**
//       `
//     case "dribbble":
//       return `
//         **Dribbble Enhanced Search for Design Professionals:**
//         Dribbble is the premier platform for visual designers. Create targeted queries for:
        
//         **Design Specializations:**
//         - UI/UX Design: "UI Designer" "UX Designer" "Product Designer"
//         - Visual Design: "Graphic Designer" "Brand Designer" "Visual Designer"
//         - Mobile Design: "Mobile App Design" "iOS Design" "Android Design"
//         - Web Design: "Web Designer" "Landing Page" "Website Design"
        
//         **Skill-Based Targeting:**
//         - Tools: Figma Sketch Adobe Photoshop Illustrator
//         - Specialties: "Logo Design" "Branding" "Icon Design" "Illustration"
//         - Industries: "SaaS Design" "E-commerce Design" "Healthcare Design"
//         - Experience: "Senior Designer" "Lead Designer" "Design Director"
        
//         **Portfolio Intelligence:**
//         - Project types: "Dashboard Design" "Mobile App" "Website Redesign"
//         - Client work: "Client Work" "Freelance" "Agency Work"
//         - Awards: "Award Winning" "Featured" "Popular"
//         - Contact info: "Available for Work" "Contact" "Hire Me"
        
//         **Location & Availability:**
//         - Geographic: Location-specific searches if needed
//         - Availability: "Available" "Freelance" "Full-time" "Remote"
        
//         **Examples:**
//         - "UI Designer" Figma "San Francisco" "Available for Work"
//         - "Brand Designer" "Logo Design" Adobe Illustrator portfolio
//         - "UX Designer" "Mobile App" "Product Design" "Remote"
//         - "Senior Designer" "Dashboard Design" "SaaS" experience
        
//         **Only use for design and creative roles.**
//       `
//     case "behance":
//       return `
//         **Behance Advanced Search for Creative Professionals:**
//         Behance showcases creative portfolios. Create queries targeting:
        
//         **Creative Categories:**
//         - Graphic Design: "Graphic Designer" "Visual Identity" "Brand Design"
//         - Web Design: "Web Design" "Digital Design" "Interface Design"
//         - Photography: "Photographer" "Commercial Photography" "Product Photography"
//         - Illustration: "Illustrator" "Digital Art" "Character Design"
//         - Motion Graphics: "Motion Designer" "Animation" "Video Graphics"
        
//         **Professional Targeting:**
//         - Experience Level: "Senior" "Lead" "Creative Director" "Art Director"
//         - Industry Focus: "Advertising" "Marketing" "Publishing" "Entertainment"
//         - Software Skills: "Adobe Creative Suite" "After Effects" "Cinema 4D"
//         - Specializations: "Print Design" "Digital Marketing" "Package Design"
        
//         **Portfolio Analysis:**
//         - Project Types: "Campaign Design" "Brand Identity" "Website Design"
//         - Client Work: "Client Projects" "Commercial Work" "Published Work"
//         - Recognition: "Award Winning" "Featured" "Curated"
//         - Availability: "Available for Hire" "Freelance" "Contact"
        
//         **Contact Discovery:**
//         - Include "contact" "email" "hire" "available" in searches
//         - Look for external portfolio links and social media
//         - Target profiles with comprehensive contact information
        
//         **Examples:**
//         - "Brand Designer" "Visual Identity" "Available for Hire" Adobe
//         - "Creative Director" "Advertising" "Campaign Design" experience
//         - "Motion Designer" "After Effects" "Commercial Work" portfolio
//         - "Art Director" "Digital Marketing" "Creative Strategy" senior
        
//         **Only use for creative and artistic roles.**
//       `
//     case "google":
//       return `
//         **Google Advanced Search for Professional Discovery:**
//         Google provides access to resumes, portfolios, and professional websites across the internet.
        
//         **Search Strategies:**
//         - Resume Targeting: filetype:pdf "resume" OR "CV" + role keywords
//         - Portfolio Discovery: "portfolio" "work samples" "case studies"
//         - Professional Websites: "about me" "professional" personal websites
//         - Industry Directories: site:specific-industry-sites.com
//         - Conference Speakers: "speaker" "conference" "presentation"
//         - Company Alumni: "formerly at" "ex-" company names
        
//         **Advanced Operators:**
//         - Site-specific: site:company.com "software engineer"
//         - File types: filetype:pdf "data scientist resume"
//         - Exact phrases: "Senior Product Manager" "available"
//         - Exclusions: -jobs -hiring (avoid job postings)
//         - Time filters: Use recent content for active professionals
        
//         **Professional Platforms Integration:**
//         - site:medium.com technical articles + author profiles
//         - site:stackoverflow.com expert contributors
//         - site:kaggle.com data science competitions
//         - site:angel.co startup professionals
//         - Industry-specific platforms and communities
        
//         **Examples:**
//         - "software engineer" "San Francisco" filetype:pdf resume Python
//         - "marketing director" portfolio "case studies" "contact"
//         - site:medium.com "machine learning" author profile
//         - "UX designer" "portfolio" "available for hire" -jobs
//         - "financial analyst" "CFA" resume filetype:pdf "New York"
//       `
//     default:
//       return `Create platform-appropriate professional search queries with advanced targeting techniques.`
//   }
// }

// // Enhanced candidate extraction with AI
// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     You are an expert talent sourcer specializing in extracting professional information from ${platform} profiles. Your task is to comprehensively analyze this content and extract detailed candidate information with absolute accuracy.

//     **CRITICAL EXTRACTION REQUIREMENTS:**
//     1. **ZERO FABRICATION**: Only extract information explicitly present in the text
//     2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
//     3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional links
//     4. **EXACT TRANSCRIPTION**: Copy information exactly as written
//     5. **PLATFORM EXPERTISE**: Apply ${platform}-specific extraction intelligence

//     **Content Source:** ${url} (Platform: ${platform})
//     **Platform Context:** ${getPlatformExtractionContext(platform)}

//     **Text Content:**
//     ---
//     ${pageText.substring(0, 12000)}
//     ---

//     **REQUIRED EXTRACTION FIELDS:**
//     Extract the following information ONLY if clearly and explicitly present:

//     **Personal Information:**
//     - Full name (complete name as displayed)
//     - Email address (exact format, multiple if present)
//     - Phone number (exact format with country code if shown)
//     - Current location (city, state, country as specified)

//     **Professional Information:**
//     - Current job title (exact title as stated)
//     - Current company (exact company name)
//     - Professional summary/bio (comprehensive if available)
//     - Years of experience (only if explicitly stated)
//     - Industry specialization

//     **Skills & Expertise:**
//     - Technical skills (programming languages, tools, software)
//     - Professional skills (management, communication, etc.)
//     - Certifications and credentials
//     - Specializations and expertise areas

//     **Work History:**
//     - Previous companies and roles
//     - Notable projects and achievements
//     - Portfolio work and case studies
//     - Client work and collaborations

//     **Education:**
//     - Degrees and institutions
//     - Relevant coursework and certifications
//     - Professional development

//     **Digital Presence:**
//     - All social media and professional links found
//     - Portfolio websites and personal sites
//     - Professional platform profiles
//     - Contact methods and availability status

//     **${platform}-Specific Intelligence:**
//     ${getPlatformSpecificExtractionInstructions(platform)}

//     **OUTPUT FORMAT:**
//     Return ONLY this JSON structure with extracted data or null values:
//     {
//       "candidateName": "Full name exactly as written or null",
//       "email": "primary.email@domain.com or null",
//       "alternateEmails": ["additional@emails.com"] or [],
//       "mobile": "exact phone number with formatting or null",
//       "currentJobTitle": "Exact current title or null",
//       "currentCompany": "Exact company name or null",
//       "location": "Exact location string or null",
//       "skills": ["actual", "skills", "extracted"] or [],
//       "technicalSkills": ["programming", "tools", "software"] or [],
//       "summary": "Professional summary/bio from profile or null",
//       "experience": "Work experience description or null",
//       "yearsOfExperience": "X years (only if explicitly stated) or null",
//       "education": "Education information or null",
//       "certifications": ["actual", "certifications"] or [],
//       "projects": ["actual", "projects", "portfolio pieces"] or [],
//       "achievements": ["awards", "recognition", "notable work"] or [],
//       "industries": ["industry", "specializations"] or [],
//       "availabilityStatus": "availability status if mentioned or null",
//       "sourceInfo": {
//         "profileUrl": "${url}",
//         "linkedinProfileUrl": "found LinkedIn URL or null",
//         "githubProfileUrl": "found GitHub URL or null",
//         "portfolioUrl": "found portfolio URL or null",
//         "dribbbleUrl": "found Dribbble URL or null",
//         "behanceUrl": "found Behance URL or null",
//         "twitterUrl": "found Twitter URL or null",
//         "mediumUrl": "found Medium URL or null",
//         "personalWebsite": "found personal website or null",
//         "contactMethods": ["all", "contact", "methods", "found"] or []
//       }
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 3000,
//       temperature: 0.05,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)

//     // Validate that we have at least a name
//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from ${url}`)
//       return null
//     }

//     // Merge technical skills into main skills array
//     const allSkills = [...(result.skills || []), ...(result.technicalSkills || [])]

//     return {
//       id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       candidateName: result.candidateName,
//       email: result.email,
//       alternateEmails: result.alternateEmails || [],
//       mobile: result.mobile,
//       currentJobTitle: result.currentJobTitle,
//       currentCompany: result.currentCompany,
//       location: result.location,
//       skills: [...new Set(allSkills)],
//       summary: result.summary,
//       experience: result.experience,
//       yearsOfExperience: result.yearsOfExperience,
//       education: result.education,
//       certifications: result.certifications || [],
//       projects: result.projects || [],
//       achievements: result.achievements || [],
//       industries: result.industries || [],
//       availabilityStatus: result.availabilityStatus,
//       sourceInfo: {
//         platform,
//         profileUrl: url,
//         linkedinProfileUrl: result.sourceInfo?.linkedinProfileUrl,
//         githubProfileUrl: result.sourceInfo?.githubProfileUrl,
//         portfolioUrl: result.sourceInfo?.portfolioUrl,
//         dribbbleUrl: result.sourceInfo?.dribbbleUrl,
//         behanceUrl: result.sourceInfo?.behanceUrl,
//         twitterUrl: result.sourceInfo?.twitterUrl,
//         mediumUrl: result.sourceInfo?.mediumUrl,
//         personalWebsite: result.sourceInfo?.personalWebsite,
//         contactMethods: result.sourceInfo?.contactMethods || [],
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//       },
//       matchScore: 0,
//     }
//   } catch (error) {
//     console.error(`❌ Error extracting candidate from ${url}:`, error.message)
//     return null
//   }
// }

// // Platform extraction context helpers
// function getPlatformExtractionContext(platform) {
//   switch (platform) {
//     case "linkedin":
//       return "LinkedIn professional profile with work history, skills, education, and connections"
//     case "github":
//       return "GitHub developer profile with repositories, contributions, and technical projects"
//     case "dribbble":
//       return "Dribbble design portfolio with creative work, projects, and design skills"
//     case "behance":
//       return "Behance creative portfolio with artistic work, brand projects, and creative expertise"
//     case "google":
//       return "Web content including resumes, portfolios, personal websites, or professional profiles"
//     default:
//       return "Professional web content with career and contact information"
//   }
// }

// function getPlatformSpecificExtractionInstructions(platform) {
//   switch (platform) {
//     case "dribbble":
//       return `
//         **Dribbble-Specific Extraction:**
//         - Extract design software proficiency (Figma, Sketch, Adobe Creative Suite)
//         - Identify design specializations (UI/UX, branding, illustration, web design)
//         - Note client work vs. personal projects
//         - Extract design process information and methodologies
//         - Look for design awards, features, or recognition
//         - Identify collaboration experience and team projects
//         - Note availability for freelance/full-time work
//         - Extract creative brief understanding and problem-solving approaches
//       `
//     case "behance":
//       return `
//         **Behance-Specific Extraction:**
//         - Identify creative disciplines (graphic design, photography, motion graphics)
//         - Extract brand work and campaign experience
//         - Note commercial vs. personal creative projects
//         - Identify creative software expertise and workflow
//         - Look for published work and client testimonials
//         - Extract creative education and artistic background
//         - Note creative direction and conceptual thinking skills
//         - Identify cross-media experience (print, digital, video)
//       `
//     case "github":
//       return `
//         **GitHub-Specific Extraction:**
//         - Extract programming languages and frameworks from repositories
//         - Identify contribution patterns and open source involvement
//         - Note repository ownership vs. contributions to others' projects
//         - Extract README documentation and project descriptions
//         - Identify technical architecture and system design experience
//         - Look for code quality, testing, and documentation practices
//         - Note collaboration through pull requests and issues
//         - Extract technical leadership through repository management
//       `
//     case "linkedin":
//       return `
//         **LinkedIn-Specific Extraction:**
//         - Extract complete work history with date ranges
//         - Identify professional accomplishments and metrics
//         - Note recommendations and endorsements context
//         - Extract volunteer work and professional associations
//         - Identify leadership roles and team management experience
//         - Look for industry thought leadership through posts/articles
//         - Note professional development and continuous learning
//         - Extract networking strength through connections and activity
//       `
//     default:
//       return "Extract comprehensive professional information relevant to the platform context."
//   }
// }

// // Enhanced candidate evaluation
// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   if (!candidate.candidateName) {
//     console.log("⚠️ Skipping evaluation - insufficient candidate data")
//     return null
//   }

//   const prompt = `
//     You are a senior technical recruiter and talent assessment expert with 20+ years of experience. Conduct a comprehensive evaluation of this candidate's fit for the position using rigorous assessment criteria.

//     **Job Requirements:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Candidate Profile:**
//     - Name: ${candidate.candidateName}
//     - Current Title: ${candidate.currentJobTitle || "Not specified"}
//     - Company: ${candidate.currentCompany || "Not specified"}
//     - Location: ${candidate.location || "Not specified"}
//     - Skills: ${candidate.skills?.join(", ") || "Not specified"}
//     - Technical Skills: ${candidate.technicalSkills?.join(", ") || "Not specified"}
//     - Experience: ${candidate.yearsOfExperience || "Not specified"}
//     - Summary: ${candidate.summary || "Not available"}
//     - Education: ${candidate.education || "Not specified"}
//     - Certifications: ${candidate.certifications?.join(", ") || "Not specified"}
//     - Projects: ${candidate.projects?.join(", ") || "Not specified"}
//     - Achievements: ${candidate.achievements?.join(", ") || "Not specified"}
//     - Industries: ${candidate.industries?.join(", ") || "Not specified"}

//     **COMPREHENSIVE EVALUATION CRITERIA:**

//     **1. Skills Assessment (0-100):**
//     - Match required technical skills against candidate skills
//     - Consider skill depth and breadth
//     - Evaluate transferable skills and learning ability
//     - Account for emerging technologies and future requirements

//     **2. Experience Assessment (0-100):**
//     - Evaluate years of experience against requirements
//     - Assess relevance of previous roles and responsibilities
//     - Consider industry experience and domain knowledge
//     - Evaluate progression and career trajectory

//     **3. Education & Certifications Assessment (0-100):**
//     - Match educational background to requirements
//     - Evaluate relevant certifications and continuous learning
//     - Consider alternative education and self-directed learning
//     - Assess specialized training and professional development

//     **4. Cultural & Role Fit Assessment (0-100):**
//     - Evaluate role responsibilities alignment
//     - Consider company size and culture fit indicators
//     - Assess leadership potential and growth trajectory
//     - Evaluate communication and collaboration indicators

//     **ASSESSMENT GUIDELINES:**
//     - Be honest and realistic in scoring
//     - Consider both current capabilities and potential
//     - Account for missing information in your analysis
//     - Provide actionable insights for hiring decisions
//     - Consider market scarcity and candidate uniqueness

//     **SCORING METHODOLOGY:**
//     - 90-100: Exceptional match, rare find, immediate hire
//     - 80-89: Strong match, highly recommended
//     - 70-79: Good match, recommended with considerations
//     - 60-69: Moderate match, consider with reservations
//     - 50-59: Weak match, significant gaps exist
//     - Below 50: Poor match, not recommended

//     Return ONLY this JSON structure with thorough analysis:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100, detailed skills comparison),
//         "experienceMatch": number (0-100, experience relevance and depth),
//         "educationMatch": number (0-100, educational background relevance),
//         "culturalFitMatch": number (0-100, role and culture alignment),
//         "overallMatch": number (0-100, weighted comprehensive score)
//       },
//       "analysis": {
//         "skills": {
//           "candidateSkills": ["all", "candidate", "skills"],
//           "matched": ["skills", "that", "directly", "match"],
//           "notMatched": ["required", "skills", "missing"],
//           "transferableSkills": ["skills", "that", "could", "transfer"],
//           "skillGaps": ["critical", "gaps", "identified"],
//           "skillStrengths": ["standout", "skills", "and", "expertise"]
//         },
//         "experience": {
//           "relevantExperience": "detailed description of relevant experience or 'Limited information available'",
//           "yearsOfExperience": "exact years mentioned or 'Not specified'",
//           "careerProgression": "analysis of career growth and trajectory",
//           "industryExperience": "relevant industry background",
//           "roleRelevance": "how previous roles align with target position"
//         },
//         "education": {
//           "highestDegree": "actual degree or 'Not specified'",
//           "relevantCourses": ["relevant", "coursework"] or [],
//           "certifications": ["professional", "certifications"],
//           "continuousLearning": "evidence of ongoing professional development"
//         },
//         "projects": ["significant", "projects", "and", "achievements"],
//         "strengths": ["top", "candidate", "strengths"],
//         "concerns": ["potential", "concerns", "or", "risks"],
//         "recommendation": "detailed hiring recommendation with reasoning",
//         "comments": "comprehensive assessment including data gaps and assumptions",
//         "additionalNotes": "market insights, salary expectations, availability, unique value proposition"
//       },
//       "comment": "concise executive summary for hiring managers",
//       "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
//       "confidenceLevel": "High|Medium|Low (based on available information quality)",
//       "nextSteps": "recommended actions for recruitment process"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.1,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)
//     console.log(`✅ Evaluated ${candidate.candidateName}: ${result.matchingScoreDetails?.overallMatch}/100`)
//     return result
//   } catch (error) {
//     console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, error.message)
//     return null
//   }
// }

// // NEW: Enhanced Google search with LinkedIn URL collection (LIMITED TO 50)
// async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
//   const candidates = new Map()
//   const linkedinUrls = new Set() // NEW: Collect LinkedIn URLs
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!apiKey || !searchEngineId) {
//     console.warn("⚠️ Google Search API not configured. Skipping Google search.")
//     return []
//   }

//   const platform = siteFilter.includes("linkedin")
//     ? "linkedin"
//     : siteFilter.includes("github")
//       ? "github"
//       : siteFilter.includes("dribbble")
//         ? "dribbble"
//         : siteFilter.includes("behance")
//           ? "behance"
//           : "google"

//   let totalResults = 0
//   const maxResultsPerQuery = 10
//   const targetCandidates = Math.min(searchSettings.candidateCount * 3, 150)
//   const MAX_LINKEDIN_URLS = 50 // NEW: Limit LinkedIn URLs

//   console.log(`🔍 Starting enhanced Google search for ${platform} with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search stopped by user request at query ${i + 1}`)
//       emitProgress(
//         searchId,
//         `🛑 Search stopped by user. Processing ${candidates.size} candidates found so far...`,
//         50,
//         candidates.size,
//         platform,
//         false,
//       )
//       break
//     }

//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim()
//       console.log(`🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`)
//       emitProgress(
//         searchId,
//         `Searching ${platform}: "${searchQuery.substring(0, 50)}..."`,
//         20 + (i / queries.length) * 25,
//         candidates.size,
//         platform,
//       )

//       const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
//         params: {
//           key: apiKey,
//           cx: searchEngineId,
//           q: searchQuery,
//           num: maxResultsPerQuery,
//           start: 1,
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`📊 Found ${response.data.items.length} results for query: ${searchQuery}`)
//         for (const item of response.data.items) {
//           if (shouldStopSearch(searchId)) {
//             console.log(`🛑 Search stopped during candidate processing`)
//             break
//           }

//           if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
//             // NEW: Check if it's a LinkedIn profile URL and limit collection
//             if (item.link.includes("linkedin.com/in/") && platform === "linkedin") {
//               if (linkedinUrls.size < MAX_LINKEDIN_URLS) {
//                 linkedinUrls.add(item.link)
//                 console.log(`🔗 Collected LinkedIn URL (${linkedinUrls.size}/${MAX_LINKEDIN_URLS}): ${item.link}`)
//               } else {
//                 console.log(`⚠️ LinkedIn URL limit reached (${MAX_LINKEDIN_URLS}). Skipping: ${item.link}`)
//               }
//               continue // Don't try to extract directly, collect for browser extraction
//             }

//             emitProgress(
//               searchId,
//               `Processing: ${item.title?.substring(0, 40)}...`,
//               22 + (i / queries.length) * 25,
//               candidates.size,
//               platform,
//             )

//             const candidate = await extractCandidateFromUrl(item.link, platform)
//             if (candidate && candidate.candidateName) {
//               candidates.set(item.link, candidate)
//               totalResults++
//               console.log(`✅ Extracted: ${candidate.candidateName} (${candidates.size} total)`)
//               emitProgress(
//                 searchId,
//                 `Found candidate: ${candidate.candidateName}`,
//                 25 + (i / queries.length) * 25,
//                 candidates.size,
//                 platform,
//               )

//               if (candidates.size >= searchSettings.candidateCount) {
//                 console.log(`🎯 Reached target candidate count: ${searchSettings.candidateCount}`)
//                 emitProgress(
//                   searchId,
//                   `🎯 Target reached! Found ${candidates.size} candidates. Processing evaluations...`,
//                   50,
//                   candidates.size,
//                   platform,
//                   false,
//                 )
//                 break
//               }
//             } else {
//               console.log(`❌ Failed to extract candidate from: ${item.link}`)
//             }
//           }
//         }
//       }

//       await new Promise((resolve) => setTimeout(resolve, 1200))
//     } catch (error) {
//       console.error(`❌ Search error for query "${query}":`, error.message)
//       if (error.response?.status === 429) {
//         console.log("⏳ Rate limited, waiting before retry...")
//         await new Promise((resolve) => setTimeout(resolve, 5000))
//       }
//     }
//   }

//   // NEW: Handle LinkedIn URLs if found (limited to 50)
//   if (linkedinUrls.size > 0 && platform === "linkedin") {
//     console.log(`🔗 Found ${linkedinUrls.size} LinkedIn URLs (limited to ${MAX_LINKEDIN_URLS}). Sending to browser for extraction...`)
//     await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
//   }

//   console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// // ENHANCED: Handle LinkedIn URLs by sending them to frontend for browser extraction (LIMITED)
// async function handleLinkedInUrls(searchId, linkedinUrls) {
//   try {
//     const MAX_URLS = 10; // Limit to 50 URLs
//     const limitedUrls = linkedinUrls.slice(0, MAX_URLS);
    
//     console.log(`📤 Sending ${limitedUrls.length} LinkedIn URLs to frontend for browser extraction (limited from ${linkedinUrls.length})`)
    
//     // Store LinkedIn URLs in extraction queue
//     linkedinExtractionQueue.set(searchId, {
//       urls: limitedUrls,
//       processed: [],
//       failed: [],
//     })

//     // Save LinkedIn URLs to search history
//     const linkedinProfiles = limitedUrls.map((url) => ({
//       profileUrl: url,
//       candidateName: extractNameFromLinkedInUrl(url),
//       extractionStatus: "pending",
//       lastAttempted: new Date(),
//       retryCount: 0,
//     }))

//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $push: { linkedinProfiles: { $each: linkedinProfiles } },
//     })

//     // Emit LinkedIn URLs to frontend for browser extraction
//     io.emit("linkedinUrlsForExtraction", {
//       searchId: searchId,
//       urls: limitedUrls,
//       message: `Found ${limitedUrls.length} LinkedIn profiles${linkedinUrls.length > MAX_URLS ? ` (limited from ${linkedinUrls.length})` : ''}. Starting browser extraction...`,
//     })

//     // NEW: Emit initial extraction status
//     io.emit("linkedinExtractionUpdate", {
//       isExtracting: true,
//       progress: { current: 0, total: limitedUrls.length },
//       currentUrl: "",
//     })

//     emitProgress(
//       searchId,
//       `📤 Sent ${limitedUrls.length} LinkedIn URLs to browser for extraction...`,
//       60,
//       0,
//       "linkedin-browser",
//       true // CHANGED: Allow stopping during LinkedIn extraction
//     )
//   } catch (error) {
//     console.error("❌ Error handling LinkedIn URLs:", error.message)
//   }
// }

// // Extract name from LinkedIn URL
// function extractNameFromLinkedInUrl(url) {
//   try {
//     const urlParts = url.split("/")
//     const profileId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2]
//     return (
//       profileId
//         .replace(/-/g, " ")
//         .replace(/\d+/g, "")
//         .trim()
//         .split(" ")
//         .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
//         .join(" ") || "LinkedIn Profile"
//     )
//   } catch (error) {
//     return "LinkedIn Profile"
//   }
// }

// // Extract candidate from URL
// async function extractCandidateFromUrl(url, platform) {
//   try {
//     console.log(`🔍 Extracting from: ${url}`)
//     const { data } = await axios.get(url, {
//       timeout: 25000,
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//         "Accept-Language": "en-US,en;q=0.5",
//         Connection: "keep-alive",
//         "Accept-Encoding": "gzip, deflate, br",
//       },
//     })

//     const $ = load(data)
//     $("script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner, .popup, .modal, .overlay").remove()
//     const text = $("body").text().replace(/\s+/g, " ").trim()

//     if (text.length < 300) {
//       console.log(`❌ Insufficient content from ${url} (${text.length} chars)`)
//       return null
//     }

//     console.log(`📄 Extracted ${text.length} characters from ${url}`)
//     const candidate = await extractCandidateWithAI(text, url, platform)
//     if (candidate) {
//       console.log(`✅ Successfully extracted candidate: ${candidate.candidateName}`)
//     }
//     return candidate
//   } catch (error) {
//     console.error(`❌ Error extracting from ${url}:`, error.message)
//     return null
//   }
// }

// // LinkedIn search with enhanced fallback
// async function searchLinkedIn(queries, searchSettings, searchId) {
//   const apiKey = process.env.LINKEDIN_API_KEY
//   if (apiKey) {
//     console.log("🔑 LinkedIn API key found. Using API search.")
//     return await searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey)
//   } else {
//     console.log("🔍 No LinkedIn API key. Using Google search for LinkedIn profiles.")
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
//   }
// }

// async function searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey) {
//   console.log("🚀 --- Enhanced LinkedIn API Search ---")
//   const candidates = new Map()
//   const targetCandidates = Math.min(searchSettings.candidateCount * 2, 100)
//   const apiEndpoint = "https://nubela.co/proxycurl/api/v2/linkedin"
//   const linkedInUrls = new Set()
//   const MAX_LINKEDIN_URLS = 50 // NEW: Limit LinkedIn URLs

//   const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!googleApiKey || !searchEngineId) {
//     console.warn("⚠️ Google Search API not configured. Cannot find LinkedIn profiles to enrich.")
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
//   }

//   // Step 1: Find LinkedIn profile URLs using Google (limited)
//   for (const query of queries) {
//     if (linkedInUrls.size >= MAX_LINKEDIN_URLS) {
//       console.log(`⚠️ LinkedIn URL limit reached (${MAX_LINKEDIN_URLS}). Stopping URL collection.`)
//       break
//     }
    
//     const searchQuery = `${query} site:linkedin.com/in/`
//     try {
//       const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
//         params: { key: googleApiKey, cx: searchEngineId, q: searchQuery, num: 10 },
//         timeout: 10000,
//       })

//       if (response.data.items) {
//         response.data.items.forEach((item) => {
//           if (item.link && item.link.includes("linkedin.com/in/") && linkedInUrls.size < MAX_LINKEDIN_URLS) {
//             linkedInUrls.add(item.link)
//           }
//         })
//       }
//     } catch (error) {
//       console.error(`❌ Error finding LinkedIn URLs with query "${query}":`, error.message)
//     }
//   }

//   console.log(`📊 Found ${linkedInUrls.size} LinkedIn profile URLs to enrich (limited to ${MAX_LINKEDIN_URLS}).`)

//   // Step 2: Enrich profiles using LinkedIn API
//   let processedCount = 0
//   for (const url of linkedInUrls) {
//     if (candidates.size >= targetCandidates) break

//     emitProgress(
//       searchId,
//       `Enriching LinkedIn profile ${processedCount + 1}/${linkedInUrls.size}...`,
//       50 + (processedCount / linkedInUrls.size) * 25,
//       candidates.size,
//       "linkedin-api",
//     )

//     try {
//       const response = await axios.get(apiEndpoint, {
//         headers: { Authorization: `Bearer ${apiKey}` },
//         params: {
//           url: url,
//           fallback_to_cache: "on-error",
//           use_cache: "if-present",
//           skills: "include",
//           inferred_salary: "include",
//           personal_email: "include",
//           personal_contact_number: "include",
//           twitter_profile_id: "include",
//           facebook_profile_id: "include",
//           github_profile_id: "include",
//           extra: "include",
//         },
//         timeout: 20000,
//       })

//       const profileData = response.data
//       if (profileData && profileData.public_identifier && !candidates.has(profileData.public_identifier)) {
//         const candidate = {
//           id: `linkedin_${profileData.public_identifier}`,
//           candidateName: `${profileData.first_name} ${profileData.last_name}`,
//           email: profileData.personal_email,
//           mobile: profileData.personal_contact_number,
//           currentJobTitle: profileData.occupation,
//           currentCompany: profileData.experiences?.[0]?.company,
//           location: `${profileData.city}, ${profileData.state}, ${profileData.country}`,
//           skills: profileData.skills || [],
//           summary: profileData.summary,
//           experience: profileData.experiences
//             ?.map(
//               (exp) =>
//                 `${exp.title} at ${exp.company} (${exp.starts_at?.year || "N/A"} - ${exp.ends_at?.year || "Present"})`,
//             )
//             .join("\n"),
//           yearsOfExperience: calculateExperienceYears(profileData.experiences),
//           education: profileData.education?.map((edu) => `${edu.degree_name}, ${edu.school}`).join("\n"),
//           sourceInfo: {
//             platform: "linkedin",
//             profileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             linkedinProfileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             githubProfileUrl: profileData.github_profile_id
//               ? `https://github.com/${profileData.github_profile_id}`
//               : null,
//             twitterUrl: profileData.twitter_profile_id ? `https://twitter.com/${profileData.twitter_profile_id}` : null,
//             hasEmail: !!profileData.personal_email,
//             hasPhone: !!profileData.personal_contact_number,
//             sourcedAt: new Date(),
//             aiModel: "linkedin-api",
//           },
//           matchScore: 0,
//         }

//         candidates.set(profileData.public_identifier, candidate)
//         console.log(`✅ Enriched via LinkedIn API: ${candidate.candidateName}`)
//       }
//     } catch (error) {
//       console.error(
//         `❌ Error enriching LinkedIn profile from ${url}:`,
//         error.response ? error.response.data : error.message,
//       )
//     }

//     processedCount++
//     await new Promise((resolve) => setTimeout(resolve, 1500))
//   }

//   console.log(`🎉 --- LinkedIn API search finished. Found ${candidates.size} candidates. ---`)
//   return Array.from(candidates.values())
// }

// // Helper function to calculate years of experience
// function calculateExperienceYears(experiences) {
//   if (!experiences || experiences.length === 0) return null

//   let totalMonths = 0
//   experiences.forEach((exp) => {
//     if (exp.starts_at && exp.starts_at.year) {
//       const startYear = exp.starts_at.year
//       const startMonth = exp.starts_at.month || 1
//       const endYear = exp.ends_at?.year || new Date().getFullYear()
//       const endMonth = exp.ends_at?.month || new Date().getMonth() + 1
//       const months = (endYear - startYear) * 12 + (endMonth - startMonth)
//       totalMonths += months
//     }
//   })

//   return totalMonths > 0 ? `${Math.round(totalMonths / 12)} years` : null
// }

// async function searchGitHub(queries, searchSettings, searchId) {
//   const token = process.env.GITHUB_TOKEN
//   if (!token) {
//     console.log("🔍 GitHub token not configured. Using Google search.")
//     return await searchGoogle(queries, searchSettings, "site:github.com", searchId)
//   }

//   const candidates = new Map()
//   let totalResults = 0
//   const maxResultsPerQuery = 15
//   const targetCandidates = Math.min(searchSettings.candidateCount * 3, 100)

//   console.log(`🚀 Starting enhanced GitHub search with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`)
//       emitProgress(
//         searchId,
//         `GitHub search: "${query.substring(0, 50)}..."`,
//         40 + (i / queries.length) * 25,
//         candidates.size,
//         "github",
//       )

//       const response = await axios.get(`https://api.github.com/search/users`, {
//         params: {
//           q: query,
//           per_page: maxResultsPerQuery,
//           sort: "repositories",
//           order: "desc",
//         },
//         headers: {
//           Authorization: `token ${token}`,
//           Accept: "application/vnd.github.v3+json",
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`📊 Found ${response.data.items.length} GitHub users`)
//         for (const user of response.data.items) {
//           if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
//             emitProgress(
//               searchId,
//               `Processing GitHub profile: ${user.login}`,
//               42 + (i / queries.length) * 25,
//               candidates.size,
//               "github",
//             )

//             const candidate = await extractCandidateFromUrl(user.html_url, "github")
//             if (candidate && candidate.candidateName) {
//               candidates.set(user.html_url, candidate)
//               totalResults++
//               console.log(`✅ GitHub candidate: ${candidate.candidateName}`)
//               emitProgress(
//                 searchId,
//                 `Found GitHub candidate: ${candidate.candidateName}`,
//                 45 + (i / queries.length) * 25,
//                 candidates.size,
//                 "github",
//               )
//             }
//           }
//         }
//       }

//       await new Promise((resolve) => setTimeout(resolve, 1500))
//     } catch (error) {
//       console.error(`❌ GitHub search error:`, error.message)
//       if (error.response?.status === 403 || error.response?.status === 429) {
//         console.log("⏳ GitHub rate limited, waiting before retry...")
//         await new Promise((resolve) => setTimeout(resolve, 10000))
//       }
//     }
//   }

//   console.log(`🎉 GitHub search completed. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// async function searchDribbble(queries, searchSettings, searchId) {
//   console.log("🎨 Starting enhanced Dribbble search for design talent")
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
// }

// async function searchBehance(queries, searchSettings, searchId) {
//   console.log("🎭 Starting enhanced Behance search for creative professionals")
//   return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
// }

// // Cost estimation
// function estimateSearchCost(candidateCount) {
//   const tokensPerCandidate = 1200
//   const totalInputTokens = candidateCount * tokensPerCandidate
//   const totalOutputTokens = candidateCount * 700
//   const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000

//   return {
//     estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
//     model: "gpt-4o & gpt-4o-mini",
//     features: [
//       "Enhanced Job Analysis",
//       "AI Profile Extraction",
//       "Smart Platform Selection",
//       "Contact Discovery",
//       "Comprehensive Candidate Evaluation",
//       "Platform-Specific Intelligence",
//       "LinkedIn Browser Extraction (Limited to 50)",
//       "Stop Control During All Phases",
//       "Resume Database Integration",
//     ],
//   }
// }

// // Deduplication
// function deduplicateCandidates(candidates) {
//   const uniqueMap = new Map()
//   for (const candidate of candidates) {
//     const keys = []
//     if (candidate.email) {
//       keys.push(`email_${candidate.email.toLowerCase()}`)
//     }
//     if (candidate.candidateName) {
//       keys.push(`name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`)
//     }
//     if (candidate.sourceInfo?.linkedinProfileUrl) {
//       keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`)
//     }
//     if (candidate.sourceInfo?.githubProfileUrl) {
//       keys.push(`github_${candidate.sourceInfo.githubProfileUrl}`)
//     }
//     if (candidate.sourceInfo?.profileUrl) {
//       keys.push(`profile_${candidate.sourceInfo.profileUrl}`)
//     }
//     if (candidate.mobile) {
//       keys.push(`mobile_${candidate.mobile.toString().replace(/\D/g, "")}`)
//     }

//     const existingKey = keys.find((key) => uniqueMap.has(key))
//     if (!existingKey) {
//       keys.forEach((key) => uniqueMap.set(key, candidate))
//     } else {
//       const existing = uniqueMap.get(existingKey)
//       mergeCandidateInfo(existing, candidate)
//     }
//   }

//   return Array.from(new Set(uniqueMap.values()))
// }

// function mergeCandidateInfo(existing, duplicate) {
//   if (!existing.email && duplicate.email) {
//     existing.email = duplicate.email
//   }
//   if (!existing.mobile && duplicate.mobile) {
//     existing.mobile = duplicate.mobile
//   }
//   if (duplicate.skills && duplicate.skills.length > 0) {
//     existing.skills = [...new Set([...(existing.skills || []), ...duplicate.skills])]
//   }
//   if (duplicate.sourceInfo) {
//     Object.keys(duplicate.sourceInfo).forEach((key) => {
//       if (duplicate.sourceInfo[key] && !existing.sourceInfo[key]) {
//         existing.sourceInfo[key] = duplicate.sourceInfo[key]
//       }
//     })
//   }
//   if (duplicate.summary && duplicate.summary.length > (existing.summary?.length || 0)) {
//     existing.summary = duplicate.summary
//   }
//   if (duplicate.experience && duplicate.experience.length > (existing.experience?.length || 0)) {
//     existing.experience = duplicate.experience
//   }
//   if (duplicate.projects && duplicate.projects.length > 0) {
//     existing.projects = [...new Set([...(existing.projects || []), ...duplicate.projects])]
//   }
//   if (duplicate.achievements && duplicate.achievements.length > 0) {
//     existing.achievements = [...new Set([...(existing.achievements || []), ...duplicate.achievements])]
//   }
//   if (duplicate.matchScore && duplicate.matchScore > (existing.matchScore || 0)) {
//     existing.matchScore = duplicate.matchScore
//     existing.matchingScoreDetails = duplicate.matchingScoreDetails
//     existing.analysis = duplicate.analysis
//     existing.recommendation = duplicate.recommendation
//   }
// }

// // Enhanced main search function with stop control
// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings, recruiterId } = req.body

//     if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
//       return res.status(400).json({
//         success: false,
//         error: "Missing required fields",
//       })
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const companyId = job.companyId
//     if (!companyId) {
//       return res.status(400).json({ success: false, error: "Company ID not found" })
//     }

//     const estimatedCost = estimateSearchCost(searchSettings.candidateCount)

//     const searchHistory = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       companyId,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "in_progress",
//       cost: {
//         estimatedCost: estimatedCost.estimatedCost,
//         actualCost: 0,
//         tokensUsed: 0,
//         apiCalls: 0,
//       },
//       linkedinProfiles: [],
//     })

//     await searchHistory.save()

//     // Initialize search control
//     searchControlMap.set(searchHistory._id.toString(), { shouldStop: false })

//     res.status(200).json({
//       success: true,
//       message: "🚀 Enhanced AI headhunter search started!",
//       searchId: searchHistory._id,
//       estimatedCost: estimatedCost,
//     })

//     // Start the search process
//     performEnhancedDynamicSearch(searchHistory._id, job, searchSettings, recruiterId)
//   } catch (error) {
//     console.error("❌ Error starting search:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // Enhanced main search workflow with stop control and RESTORED candidate saving
// async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0
//   let totalApiCalls = 0
//   let wasStopped = false

//   try {
//     console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`)

//     // Step 1: Enhanced job analysis
//     emitProgress(searchHistoryId, "🧠 Analyzing job requirements with AI intelligence...", 5, 0, "", true)
//     const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings)
//     totalApiCalls += 1
//     totalTokensUsed += 1200

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements")
//     }

//     console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)
//     emitProgress(
//       searchHistoryId,
//       `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Complexity: ${jobAnalysis.searchComplexity}`,
//       10,
//       0,
//       "",
//       true,
//     )

//     // Check for stop before continuing
//     if (shouldStopSearch(searchHistoryId)) {
//       wasStopped = true
//       throw new Error("Search stopped by user request")
//     }

//     // Step 2: Platform optimization
//     const availablePlatforms = searchSettings.platforms
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 }
//         return priorityOrder[b.priority] - priorityOrder[a.priority]
//       })

//     console.log(
//       "🎯 Optimized platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`),
//     )

//     const allCandidates = []

//     // Step 3: Enhanced platform searches with stop control
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       // Check for stop before each platform
//       if (shouldStopSearch(searchHistoryId)) {
//         console.log(`🛑 Search stopped before platform ${recommendedPlatforms[i].platform}`)
//         wasStopped = true
//         break
//       }

//       const platformInfo = recommendedPlatforms[i]
//       const platform = platformInfo.platform

//       emitProgress(
//         searchHistoryId,
//         `🔍 Generating enhanced search queries for ${platform}...`,
//         15 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       )

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis)
//       totalApiCalls += 1
//       totalTokensUsed += 1500

//       if (queries.length === 0) {
//         console.log(`⚠️ No queries generated for ${platform}`)
//         continue
//       }

//       emitProgress(
//         searchHistoryId,
//         `🚀 Searching ${platform} with ${queries.length} AI-optimized queries...`,
//         18 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       )

//       let platformCandidates = []
//       try {
//         switch (platform) {
//           case "google":
//             platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId)
//             break
//           case "linkedin":
//             platformCandidates = await searchLinkedIn(queries, searchSettings, searchHistoryId)
//             break
//           case "github":
//             platformCandidates = await searchGitHub(queries, searchSettings, searchHistoryId)
//             break
//           case "dribbble":
//             platformCandidates = await searchDribbble(queries, searchSettings, searchHistoryId)
//             break
//           case "behance":
//             platformCandidates = await searchBehance(queries, searchSettings, searchHistoryId)
//             break
//         }
//       } catch (platformError) {
//         console.error(`❌ Error searching ${platform}:`, platformError.message)
//         platformCandidates = []
//       }

//       totalApiCalls += platformCandidates.length * 2
//       totalTokensUsed += platformCandidates.length * 2000

//       console.log(`📊 Found ${platformCandidates.length} candidates on ${platform}`)
//       allCandidates.push(...platformCandidates)

//       emitProgress(
//         searchHistoryId,
//         `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
//         30 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       )

//       // Check if we've reached target or should stop
//       if (allCandidates.length >= searchSettings.candidateCount || shouldStopSearch(searchHistoryId)) {
//         if (shouldStopSearch(searchHistoryId)) {
//           console.log(`🛑 Search stopped after ${platform} search`)
//           wasStopped = true
//         } else {
//           console.log(`🎯 Reached target candidate count across platforms`)
//         }
//         break
//       }
//     }

//     console.log(`📊 Total candidates found across all platforms: ${allCandidates.length}`)

//     // NEW: Check if we have LinkedIn URLs pending extraction
//     const extractionQueue = linkedinExtractionQueue.get(searchHistoryId)
//     if (extractionQueue && extractionQueue.urls.length > 0) {
//       console.log(`⏳ Waiting for LinkedIn browser extraction to complete...`)
//       emitProgress(
//         searchHistoryId,
//         `⏳ Waiting for ${extractionQueue.urls.length} LinkedIn profiles to be extracted via browser...`,
//         70,
//         allCandidates.length,
//         "linkedin-browser",
//         true, // CHANGED: Allow stopping during LinkedIn extraction
//       )
      
//       // Store current candidates in search history for later processing
//       await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//         results: allCandidates,
//       })
//       return // Exit here, will continue in continueSearchAfterLinkedInExtraction
//     }

//     // Continue with normal processing if no LinkedIn extraction needed
//     await continueSearchAfterLinkedInExtraction(searchHistoryId, [])

//   } catch (error) {
//     console.error("❌ Enhanced search error:", error.message)
//     const partialCost = (totalTokensUsed * 0.0002) / 1000
//     const finalStatus = wasStopped ? "stopped" : "failed"

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: finalStatus,
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     const errorMessage = wasStopped ? "Search stopped by user request" : error.message
//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: errorMessage,
//       wasStopped,
//     })

//     // Create error notification
//     const errorNotification = new Notification({
//       message: wasStopped
//         ? `🛑 Search stopped for ${job.context}. Partial results may be available.`
//         : `❌ Search failed for ${job.context}. Error: ${error.message}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     })
//     await errorNotification.save()
//     io.emit("newNotification", errorNotification)

//     // Clean up search control
//     searchControlMap.delete(searchHistoryId.toString())
//   }
// }

// // Enhanced get search results to include LinkedIn profiles
// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     const search = await SearchHistory.findById(searchId)

//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" })
//     }

//     res.status(200).json({
//       success: true,
//       results: search.results,
//       linkedinProfiles: search.linkedinProfiles || [],
//       searchDetails: search,
//     })
//   } catch (error) {
//     console.error("❌ Error fetching search results:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params
//     const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20)
//     res.status(200).json({ success: true, searches })
//   } catch (error) {
//     console.error("❌ Error fetching search history:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const addCandidatesToWorkflow = async (req, res) => {
//   try {
//     const { jobId, candidates, recruiterId } = req.body

//     if (!jobId || !candidates || !Array.isArray(candidates)) {
//       return res.status(400).json({ success: false, error: "Invalid request data" })
//     }

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const savedResumes = []
//     for (const candidate of candidates) {
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: jobId,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo?.profileUrl,
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || [],
//             matched: candidate.analysis?.skills?.matched || [],
//             notMatched: candidate.analysis?.skills?.notMatched || [],
//           },
//           experience: {
//             relevantExperience:
//               candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//             yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//           },
//           education: {
//             highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//             relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//           },
//           projects: candidate.analysis?.projects || candidate.projects || [],
//           recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//           comments: candidate.analysis?.comments || candidate.comment,
//           additionalNotes: candidate.analysis?.additionalNotes || "",
//         },
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo,
//         created_at: new Date(),
//       }

//       const resume = new Resume(resumeData)
//       await resume.save()
//       savedResumes.push(resume)
//     }

//     const notification = new Notification({
//       message: `✅ ${candidates.length} candidates successfully added to workflow for ${job.context}`,
//       recipientId: recruiterId,
//       jobId: jobId,
//     })
//     await notification.save()

//     res.status(200).json({
//       success: true,
//       message: `🎉 ${savedResumes.length} candidates successfully added to workflow.`,
//     })
//   } catch (error) {
//     console.error("❌ Error adding candidates to workflow:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export async function deleteSearchHistoryItem(req, res) {
//   const { searchId } = req.params
//   const { recruiterId } = req.body

//   try {
//     if (!mongoose.Types.ObjectId.isValid(searchId)) {
//       return res.status(400).json({ success: false, error: "Invalid search ID" })
//     }

//     if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
//       return res.status(400).json({ success: false, error: "Invalid recruiter ID" })
//     }

//     const search = await SearchHistory.findOneAndDelete({
//       _id: searchId,
//       recruiterId: recruiterId,
//     })

//     if (!search) {
//       return res.status(404).json({
//         success: false,
//         error: "Search history item not found",
//       })
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Search history item deleted successfully",
//     })
//   } catch (error) {
//     console.error("❌ Error deleting search history item:", error.message)
//     return res.status(500).json({ success: false, error: "Server error" })
//   }
// }

// async function analyzeJobAndDeterminePlatforms(jobDescription, searchSettings) {
//   try {
//     const analysis = await analyzeJobForPlatforms(jobDescription, searchSettings)
//     return analysis
//   } catch (error) {
//     console.error("❌ Error analyzing job for platforms:", error.message)
//     return null
//   }
// }

// --- half working code ------------
import { OpenAI } from "openai"
import axios from "axios"
import { load } from "cheerio"
import JobDescription from "../../model/JobDescriptionModel.js"
import Resume from "../../model/resumeModel.js"
import Notification from "../../model/NotificationModal.js"
import { io } from "../../index.js"
import mongoose from "mongoose"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Global search control map
const searchControlMap = new Map()

// NEW: LinkedIn extraction queue and results
const linkedinExtractionQueue = new Map() // searchId -> { urls: [], processed: [], failed: [] }
const linkedinExtractionResults = new Map() // searchId -> extracted candidates

// --- ENHANCED SCHEMAS ---
const searchHistorySchema = new mongoose.Schema({
  recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
  jobTitle: String,
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  platforms: [String],
  searchSettings: Object,
  candidatesFound: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "in_progress", "completed", "failed", "stopped"], default: "pending" },
  cost: {
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    apiCalls: { type: Number, default: 0 },
  },
  results: [
    {
      candidateName: String,
      email: String,
      mobile: mongoose.Schema.Types.Mixed,
      jobTitle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JobDescription",
      },
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
      currentCompany: String,
      location: String,
      skills: [String],
      experience: String,
      summary: String,
      candidateStatus: String,
      matchingScoreDetails: {
        skillsMatch: Number,
        experienceMatch: Number,
        educationMatch: Number,
        overallMatch: Number,
      },
      analysis: {
        skills: {
          candidateSkills: [String],
          matched: [String],
          notMatched: [String],
        },
        experience: {
          relevantExperience: String,
          yearsOfExperience: String,
        },
        education: {
          highestDegree: String,
          relevantCourses: [String],
        },
        projects: [String],
        recommendation: String,
        comments: String,
        additionalNotes: String,
      },
      comment: String,
      recommendation: {
        type: String,
        enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
      },
      aiSourced: Boolean,
      sourceInfo: {
        platform: String,
        profileUrl: String,
        linkedinProfileUrl: String,
        githubProfileUrl: String,
        portfolioUrl: String,
        dribbbleUrl: String,
        behanceUrl: String,
        mediumUrl: String,
        twitterUrl: String,
        personalWebsite: String,
        sourcedAt: Date,
        sourcedBy: mongoose.Schema.Types.ObjectId,
        aiModel: String,
        hasEmail: Boolean,
        hasPhone: Boolean,
      },
    },
  ],
  linkedinProfiles: [
    {
      profileUrl: String,
      candidateName: String,
      profileTitle: String,
      location: String,
      extractionStatus: {
        type: String,
        enum: ["pending", "processing", "success", "failed", "rate_limited", "blocked"],
        default: "pending",
      },
      errorCode: Number,
      lastAttempted: { type: Date, default: Date.now },
      retryCount: { type: Number, default: 0 },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
  stoppedAt: Date,
  stoppedBy: mongoose.Schema.Types.ObjectId,
})

const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// --- UTILITY FUNCTIONS ---
function cleanJsonResponse(responseText) {
  const match = responseText.match(/```json([\s\S]*?)```/)
  const cleanText = match ? match[1] : responseText
  return cleanText
    .replace(/```json\n|\n```/g, "")
    .replace(/```/g, "")
    .trim()
}

function isValidJson(str) {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

// Enhanced progress emitter with stop control
function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "", canStop = true) {
  const progressData = {
    searchId,
    status,
    progress: Math.min(Math.max(progress, 0), 100),
    candidatesFound,
    platform,
    timestamp: new Date().toISOString(),
    canStop,
  }
  console.log(`Progress Update [${searchId}]: ${progress}% - ${status} - ${candidatesFound} candidates`)
  io.emit("searchProgress", progressData)
}

// Check if search should be stopped
function shouldStopSearch(searchId) {
  const control = searchControlMap.get(searchId.toString())
  return control?.shouldStop || false
}

// Stop search function
export const stopSearch = async (req, res) => {
  try {
    const { searchId, recruiterId } = req.body
    if (!searchId || !recruiterId) {
      return res.status(400).json({
        success: false,
        error: "Search ID and recruiter ID are required",
      })
    }

    // Set stop flag
    searchControlMap.set(searchId.toString(), { shouldStop: true, stoppedBy: recruiterId })

    // Update search history
    await SearchHistory.findByIdAndUpdate(searchId, {
      stoppedAt: new Date(),
      stoppedBy: recruiterId,
    })

    console.log(`🛑 Search ${searchId} stop requested by ${recruiterId}`)
    res.status(200).json({
      success: true,
      message: "Search stop requested. Processing current candidates...",
    })

    // Emit stop notification
    io.emit("searchStopping", {
      searchId,
      message: "Search stopping... Processing current candidates.",
    })
  } catch (error) {
    console.error("❌ Error stopping search:", error.message)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// NEW: Handle LinkedIn DOM content from frontend
export const processLinkedInDOM = async (req, res) => {
  try {
    const { searchId, profileUrl, domContent, success, error } = req.body;

    if (!searchId || !profileUrl) {
      return res.status(400).json({ success: false, error: "Search ID and profile URL are required" });
    }

    console.log(`📥 Received LinkedIn DOM for: ${profileUrl}`);
    console.log(`📥 Received LinkedIn DOM content: ${domContent}`);

    if (!success || !domContent) {
      console.log(`❌ Failed to extract DOM from: ${profileUrl}. Reason: ${error}`);
      await updateLinkedInProfileStatus(searchId, profileUrl, "failed");
      await checkLinkedInExtractionComplete(searchId);
      return res.status(200).json({ success: true, message: "Failed extraction recorded" });
    }

    await updateLinkedInProfileStatus(searchId, profileUrl, "processing");

    // Extract candidate data using AI, now solely from domContent
    const candidate = await extractCandidateFromLinkedInDOM(domContent, profileUrl);

    if (candidate) {
      console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`);
      
      const searches = linkedinExtractionResults.get(searchId) || [];
      searches.push(candidate);
      linkedinExtractionResults.set(searchId, searches);

      await updateLinkedInProfileStatus(searchId, profileUrl, "success", candidate.candidateName);
    } else {
      console.log(`❌ AI failed to extract candidate data from: ${profileUrl}`);
      await updateLinkedInProfileStatus(searchId, profileUrl, "failed");
    }

    // Check if all LinkedIn profiles are processed to continue the main search
    await checkLinkedInExtractionComplete(searchId);

    res.status(200).json({
      success: true,
      message: "LinkedIn DOM processed",
    });
  } catch (error) {
    console.error("❌ Error processing LinkedIn DOM:", error.message);
    // Ensure we still check for completion even on unexpected error
    if(req.body.searchId) {
        await checkLinkedInExtractionComplete(req.body.searchId);
    }
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// NEW: Update LinkedIn profile extraction status
async function updateLinkedInProfileStatus(searchId, profileUrl, status, candidateName = null) {
  try {
    const updateData = {
      extractionStatus: status,
      lastAttempted: new Date(),
    }

    if (candidateName) {
      updateData.candidateName = candidateName
    }

    await SearchHistory.findOneAndUpdate(
      {
        _id: searchId,
        "linkedinProfiles.profileUrl": profileUrl,
      },
      {
        $set: {
          "linkedinProfiles.$.extractionStatus": status,
          "linkedinProfiles.$.lastAttempted": new Date(),
          ...(candidateName && { "linkedinProfiles.$.candidateName": candidateName }),
        },
      },
    )
  } catch (error) {
    console.error("❌ Error updating LinkedIn profile status:", error.message)
  }
}

// NEW: Check if LinkedIn extraction is complete or stopped
async function checkLinkedInExtractionComplete(searchId) {
  try {
    const search = await SearchHistory.findById(searchId);
    if (!search) return;

    // Check if the search has been stopped by the user
    if (shouldStopSearch(searchId)) {
      console.log(`🛑 Search ${searchId} was stopped. Finalizing with extracted candidates.`);
      const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
      await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, true); // Pass wasStopped = true
      
      // Clean up
      linkedinExtractionQueue.delete(searchId);
      linkedinExtractionResults.delete(searchId);
      return;
    }

    const pendingProfiles = search.linkedinProfiles.filter(
      (profile) => profile.extractionStatus === "pending" || profile.extractionStatus === "processing"
    );

    if (pendingProfiles.length === 0) {
      console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`);
      const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
      await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, false); // Pass wasStopped = false

      // Clean up
      linkedinExtractionQueue.delete(searchId);
      linkedinExtractionResults.delete(searchId);
    }
  } catch (error) {
    console.error("❌ Error checking LinkedIn extraction completion:", error.message);
  }
}

// NEW: Extract candidate from LinkedIn DOM using AI
async function extractCandidateFromLinkedInDOM(domContent, profileUrl, searchId) {
  const prompt = `
    You are an expert LinkedIn profile analyzer. Extract comprehensive professional information from this LinkedIn profile DOM content.
    
    **CRITICAL EXTRACTION REQUIREMENTS:**
    1. **ZERO FABRICATION**: Only extract information explicitly present in the content
    2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
    3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional details
    4. **EXACT TRANSCRIPTION**: Copy information exactly as written
    
    **LinkedIn Profile URL:** ${profileUrl}
    
    **DOM Content:**
    ---
    ${domContent.substring(0, 15000)} // Limit content size
    ---
    
    **REQUIRED EXTRACTION FIELDS:**
    Extract the following information ONLY if clearly present:
    
    **Personal Information:**
    - Full name (complete name as displayed)
    - Current location (city, state, country)
    - Profile headline/title
    - Contact information (if visible)
    
    **Professional Information:**
    - Current position and company
    - Professional summary/about section
    - Work experience (current and previous roles)
    - Skills and endorsements
    - Education background
    - Certifications and licenses
    
    **Additional Information:**
    - Languages spoken
    - Volunteer experience
    - Publications and projects
    - Recommendations received
    - Activity and posts (if relevant)
    
    **OUTPUT FORMAT:**
    Return ONLY this JSON structure with extracted data or null values:
    {
      "candidateName": "Full name exactly as written or null",
      "email": "email if visible or null",
      "mobile": "phone number if visible or null",
      "currentJobTitle": "Current position title or null",
      "currentCompany": "Current company name or null",
      "location": "Location string or null",
      "headline": "LinkedIn headline or null",
      "summary": "About/summary section or null",
      "skills": ["skill1", "skill2", "skill3"] or [],
      "experience": "Work experience description or null",
      "education": "Education information or null",
      "certifications": ["cert1", "cert2"] or [],
      "languages": ["language1", "language2"] or [],
      "volunteerWork": "Volunteer experience or null",
      "publications": ["publication1", "publication2"] or [],
      "recommendations": "Recommendations received or null",
      "connectionsCount": "Number of connections if visible or null",
      "yearsOfExperience": "Calculated years of experience or null",
      "industries": ["industry1", "industry2"] or [],
      "sourceInfo": {
        "profileUrl": "${profileUrl}",
        "platform": "linkedin",
        "extractionMethod": "browser-dom",
        "hasEmail": false,
        "hasPhone": false,
        "hasContactInfo": false
      }
    }
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 3000,
      temperature: 0.05,
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)

    // Validate that we have at least a name
    if (!result || !result.candidateName) {
      console.log(`❌ No valid candidate data extracted from LinkedIn DOM`)
      return null
    }

    // Create candidate object
    const candidate = {
      id: `linkedin_browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      candidateName: result.candidateName,
      email: result.email,
      mobile: result.mobile,
      currentJobTitle: result.currentJobTitle,
      currentCompany: result.currentCompany,
      location: result.location,
      headline: result.headline,
      skills: result.skills || [],
      summary: result.summary,
      experience: result.experience,
      yearsOfExperience: result.yearsOfExperience,
      education: result.education,
      certifications: result.certifications || [],
      languages: result.languages || [],
      volunteerWork: result.volunteerWork,
      publications: result.publications || [],
      recommendations: result.recommendations,
      connectionsCount: result.connectionsCount,
      industries: result.industries || [],
      sourceInfo: {
        platform: "linkedin",
        profileUrl: profileUrl,
        linkedinProfileUrl: profileUrl,
        extractionMethod: "browser-dom",
        hasEmail: !!result.email,
        hasPhone: !!result.mobile,
        hasContactInfo: !!(result.email || result.mobile),
        sourcedAt: new Date(),
        aiModel: "gpt-4o",
      },
      matchScore: 0,
    }

    return candidate
  } catch (error) {
    console.error(`❌ Error extracting candidate from LinkedIn DOM:`, error.message)
    return null
  }
}

// RESTORED: Continue search after LinkedIn extraction with complete candidate processing
async function continueSearchAfterLinkedInExtraction(searchId, linkedinCandidates, wasStopped = false) {
  try {
    console.log(`🔄 Continuing search (stopped=${wasStopped}). Found ${linkedinCandidates.length} candidates from LinkedIn.`);

    const search = await SearchHistory.findById(searchId);
    if (!search) return;

    const job = await JobDescription.findById(search.jobId);
    if (!job) return;

    // Get existing candidates from other platforms
    const existingCandidates = search.results || [];

    // Combine all candidates
    const allCandidates = [...existingCandidates, ...linkedinCandidates];

    emitProgress(
      searchId,
      `🔄 Processing ${allCandidates.length} total candidates...`,
      90,
      allCandidates.length,
      "",
      false
    );

    // Deduplicate candidates
    const uniqueCandidates = deduplicateCandidates(allCandidates);
    console.log(`🎯 After deduplication: ${uniqueCandidates.length} unique candidates`);

    // Evaluate all candidates with AI matching
    const evaluatedCandidates = [];
    for (let i = 0; i < uniqueCandidates.length; i++) {
      const candidate = uniqueCandidates[i];
      const evaluation = await evaluateCandidateMatch(candidate, job, search.searchSettings);
      if (evaluation) {
        candidate.matchScore = evaluation.matchingScoreDetails.overallMatch;
        candidate.matchingScoreDetails = evaluation.matchingScoreDetails;
        candidate.analysis = evaluation.analysis;
        candidate.comment = evaluation.comment;
        candidate.recommendation = evaluation.recommendation;
        candidate.confidenceLevel = evaluation.confidenceLevel;
      }
      candidate.jobTitle = job._id;
      candidate.companyId = job.companyId;
      candidate.candidateStatus = "AI Sourced";
      candidate.aiSourced = true;
      evaluatedCandidates.push(candidate);
    }

    // Filter and rank candidates
    const rankedCandidates = evaluatedCandidates
      .filter((c) => c.candidateName)
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // Select top candidates based on search settings (or all if stopped)
    const finalCandidates = wasStopped ? rankedCandidates : rankedCandidates.slice(0, search.searchSettings.candidateCount || 10);

    console.log(`🎯 Selected top ${finalCandidates.length} candidates for saving.`);

    // Save candidates to Resume database
    await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId);

    // Update search history with results
    await SearchHistory.findByIdAndUpdate(searchId, {
      results: finalCandidates,
      candidatesFound: finalCandidates.length,
      status: wasStopped ? "stopped" : "completed",
      completedAt: new Date(),
    });

    // Emit completion
    const completionMessage = wasStopped
      ? `🛑 Search stopped! Saved ${finalCandidates.length} candidates.`
      : `🎉 Search completed! Found and saved ${finalCandidates.length} high-quality candidates.`;
      
    emitProgress(searchId, completionMessage, 100, finalCandidates.length, "", false);

    io.emit("searchComplete", {
      searchId: searchId,
      candidates: finalCandidates,
      wasStopped: wasStopped,
      summary: {
        totalCandidatesFound: allCandidates.length,
        linkedinCandidatesExtracted: linkedinCandidates.length,
        finalCandidatesSelected: finalCandidates.length,
      },
    });

    const notification = new Notification({
      message: `${wasStopped ? '🛑 Search stopped' : '🎉 Enhanced search completed'}! Found ${finalCandidates.length} candidates for ${job.context}.`,
      recipientId: search.recruiterId,
      jobId: job._id,
    });
    await notification.save();
    io.emit("newNotification", notification);

    // Clean up search control
    searchControlMap.delete(searchId.toString());
  } catch (error) {
    console.error("❌ Error continuing search after LinkedIn extraction:", error.message);
  }
}

// RESTORED: Save candidates to Resume database
async function saveCandidatesToResumeDatabase(candidates, job, recruiterId) {
  try {
    console.log(`💾 Saving ${candidates.length} candidates to Resume database...`)

    const resumeDataArray = candidates.map((candidate) => ({
      candidateName: candidate.candidateName,
      email: candidate.email,
      mobile: candidate.mobile,
      jobTitle: job._id,
      companyId: job.companyId,
      companyName: candidate.currentCompany,
      resumeLink: candidate.sourceInfo?.profileUrl,
      linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
      matchingScoreDetails: candidate.matchingScoreDetails,
      analysis: {
        skills: {
          candidateSkills: candidate.skills || [],
          matched: candidate.analysis?.skills?.matched || [],
          notMatched: candidate.analysis?.skills?.notMatched || [],
        },
        experience: {
          relevantExperience:
            candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
          yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
        },
        education: {
          highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
          relevantCourses: candidate.analysis?.education?.relevantCourses || [],
        },
        projects: candidate.analysis?.projects || candidate.projects || [],
        recommendation: candidate.analysis?.recommendation || candidate.recommendation,
        comments: candidate.analysis?.comments || candidate.comment,
        additionalNotes: candidate.analysis?.additionalNotes || "",
      },
      summary: candidate.summary,
      candidateStatus: "AI Sourced",
      aiSourced: true,
      sourceInfo: {
        platform: candidate.sourceInfo?.platform,
        profileUrl: candidate.sourceInfo?.profileUrl,
        linkedinProfileUrl: candidate.sourceInfo?.linkedinProfileUrl,
        extractionMethod: candidate.sourceInfo?.extractionMethod,
        sourcedAt: candidate.sourceInfo?.sourcedAt,
        sourcedBy: recruiterId,
        aiModel: candidate.sourceInfo?.aiModel,
        hasEmail: candidate.sourceInfo?.hasEmail,
        hasPhone: candidate.sourceInfo?.hasPhone,
      },
      created_at: new Date(),
    }))

    // Check for existing candidates to avoid duplicates
    const existingResumes = await Resume.find({
      jobTitle: job._id,
      companyId: job.companyId,
      candidateName: { $in: resumeDataArray.map((r) => r.candidateName) },
    })

    const existingNames = new Set(existingResumes.map((r) => r.candidateName))
    const newResumes = resumeDataArray.filter((r) => !existingNames.has(r.candidateName))

    if (newResumes.length > 0) {
      await Resume.insertMany(newResumes, { ordered: false })
      console.log(`✅ Successfully saved ${newResumes.length} new candidates to Resume database`)
    } else {
      console.log(`ℹ️ All candidates already exist in database, no new records saved`)
    }

    console.log(`📊 Database save summary:`)
    console.log(`   - Total candidates processed: ${candidates.length}`)
    console.log(`   - Existing candidates found: ${existingNames.size}`)
    console.log(`   - New candidates saved: ${newResumes.length}`)
  } catch (error) {
    console.error(`❌ Error saving candidates to Resume database:`, error.message)
  }
}

// Analyze job for optimal platform selection
export const analyzeJobForPlatforms = async (jobDescription, searchSettings) => {
  const prompt = `
    You are an expert headhunter and recruitment strategist with 15+ years of experience. Analyze this job posting comprehensively and determine the optimal platforms and search strategies.

    **Job Details:**
    - Position: ${jobDescription.context}
    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
    - Experience Level: ${searchSettings.experienceLevel}
    - Location: ${searchSettings.location || "Any"}
    - Keywords: ${searchSettings.keywords || ""}
    - Industry Focus: ${searchSettings.industryFocus || ""}

    **Available Platforms:**
    - linkedin: Professional networking, all industries, executives, managers
    - github: Developers, engineers, technical roles, open source contributors
    - google: General web search, resumes, portfolios, industry-specific sites, personal websites
    - dribbble: UI/UX designers, visual designers, product designers, mobile app designers
    - behance: Creative professionals, graphic designers, artists, brand designers, photographers

    **Your Expert Analysis Task:**
    1. Carefully analyze the job requirements to determine the primary job category and industry
    2. Identify the most relevant platforms based on role type and industry
    3. Suggest specialized websites or platforms that might contain relevant candidates
    4. Determine search priorities based on candidate availability and platform relevance
    5. Consider alternative job titles and industry-specific terminology

    **Professional Categories to Consider:**
    - Technology/Engineering: Software engineers, DevOps, data scientists, AI/ML engineers, full-stack developers, mobile developers, system architects
    - Design/Creative: UI/UX designers, product designers, graphic designers, brand managers, creative directors, illustrators, photographers
    - Legal: Corporate lawyers, litigation attorneys, paralegals, compliance officers, legal counsel
    - Healthcare: Physicians, nurses, medical specialists, healthcare administrators, clinical researchers
    - Finance: Financial analysts, investment bankers, accountants, financial advisors, risk managers, actuaries
    - Marketing/Sales: Digital marketers, sales managers, content creators, SEO specialists, social media managers, PR professionals
    - HR/Management: HR directors, talent acquisition specialists, organizational development, executive recruiters
    - Education: Professors, teachers, instructional designers, education technology specialists
    - Operations: Supply chain managers, logistics coordinators, project managers, operations analysts
    - Consulting: Management consultants, strategy advisors, business analysts, process improvement specialists

    **Platform Selection Criteria:**
    - HIGH priority: Primary platforms where 70%+ of qualified candidates are likely found
    - MEDIUM priority: Secondary platforms with 30-50% candidate likelihood
    - LOW priority: Niche platforms with <30% but highly qualified candidates

    Return ONLY a valid JSON object with comprehensive analysis:
    {
      "jobCategory": "Primary category (be very specific)",
      "jobSubcategory": "Detailed subcategory with specialization",
      "seniorityLevel": "Entry/Mid/Senior/Executive level analysis",
      "recommendedPlatforms": [
        {
          "platform": "platform_name",
          "priority": "high|medium|low",
          "reason": "Detailed explanation of why this platform is optimal for this role",
          "expectedCandidateVolume": "high|medium|low"
        }
      ],
      "specializedSites": [
        {
          "site": "domain.com or site description",
          "description": "What type of professionals and why relevant",
          "searchApproach": "How to search this platform effectively"
        }
      ],
      "searchKeywords": ["highly relevant keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
      "alternativeJobTitles": ["alternative title1", "title2", "title3", "title4"],
      "industrySpecificTerms": ["term1", "term2", "term3", "term4"],
      "skillSynonyms": {
        "primary_skill": ["synonym1", "synonym2"],
        "secondary_skill": ["synonym1", "synonym2"]
      },
      "targetCompanyTypes": ["startup", "enterprise", "agency", "consulting"],
      "searchComplexity": "simple|moderate|complex"
    }
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 1500,
      temperature: 0.2,
      response_format: { type: "json_object" },
    })

    const analysis = JSON.parse(response.choices[0].message.content)
    console.log("🔍 Enhanced job analysis completed:", {
      category: analysis.jobCategory,
      subcategory: analysis.jobSubcategory,
      platforms: analysis.recommendedPlatforms?.length,
      complexity: analysis.searchComplexity,
    })

    return analysis
  } catch (error) {
    console.error("❌ Error analyzing job:", error.message)
    return null
  }
}

// Get cost estimate function
export const getCostEstimate = async (req, res) => {
  try {
    const { candidateCount = 10 } = req.query
    const estimate = estimateSearchCost(Number.parseInt(candidateCount))
    res.status(200).json({ success: true, estimate })
  } catch (error) {
    console.error("❌ Error calculating cost estimate:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Enhanced search query generation
async function generateSearchQueries2(jobDescription, platform, searchSettings, jobAnalysis) {
  const prompt = `
    You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 15 highly effective, diverse search queries to find top-tier candidates.

    **Job Information:**
    - Position: ${jobDescription.context}
    - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
    - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
    - Seniority: ${jobAnalysis?.seniorityLevel || searchSettings.experienceLevel}
    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
    - Experience Level: ${searchSettings.experienceLevel}
    - Location: ${searchSettings.location || "Any"}
    - Keywords: ${searchSettings.keywords || ""}
    - Alternative Titles: ${jobAnalysis?.alternativeJobTitles?.join(", ") || ""}
    - Industry Terms: ${jobAnalysis?.industrySpecificTerms?.join(", ") || ""}
    - Skill Synonyms: ${JSON.stringify(jobAnalysis?.skillSynonyms || {})}
    - Target Companies: ${jobAnalysis?.targetCompanyTypes?.join(", ") || ""}

    **Platform to Target:** ${platform}

    **Platform-Specific Advanced Instructions:**
    ${getPlatformInstructions(platform, jobAnalysis)}

    **Advanced Query Generation Strategy:**
    1. **Diversity is Key**: Create queries with different approaches - skills-based, title-based, company-based, project-based, certification-based
    2. **Boolean Mastery**: Use advanced operators: AND, OR, NOT, parentheses for grouping, quotes for exact phrases
    3. **Synonym Integration**: Include skill synonyms and alternative terminology
    4. **Experience Targeting**: Tailor queries to the required seniority level
    5. **Geographic Precision**: If location specified, use city, state, metro area, and remote variations
    6. **Company Intelligence**: Target relevant company types and industry leaders
    7. **Certification Focus**: Include relevant certifications and credentials
    8. **Project-Based Search**: Look for specific project types and achievements

    **Query Categories to Generate (15 total):**
    - 4 Skill-focused queries (core skills + combinations)
    - 3 Title-focused queries (exact titles + alternatives)
    - 2 Company-focused queries (target company types)
    - 2 Location-focused queries (if applicable)
    - 2 Experience-focused queries (seniority level)
    - 1 Certification-focused query
    - 1 Project-focused query

    **Quality Standards:**
    - Each query should be unique and approach candidate finding differently
    - Queries should be 10-50 words long
    - Focus on finding individual profiles, not company pages
    - Include contact discovery elements where appropriate
    - Balance broad reach with specific targeting

    Return ONLY a valid JSON object:
    {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8", "query9", "query10", "query11", "query12", "query13", "query14", "query15"]}
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 2000,
      temperature: 0.6,
      response_format: { type: "json_object" },
    })

    const content = JSON.parse(response.choices[0].message.content)
    const queries = content.queries || []
    console.log(`🔍 Generated ${queries.length} enhanced queries for ${platform}`)
    return queries.slice(0, 15)
  } catch (error) {
    console.error("❌ Error generating search queries:", error.message)
    return []
  }
}

async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
  const prompt = `
    You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 5–7 broad, high-yield search queries to maximize candidate discovery.

    **Job Information:**
    - Position: ${jobDescription.context}
    - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
    - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
    - Seniority: ${jobAnalysis?.seniorityLevel || searchSettings.experienceLevel}
    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
    - Experience Level: ${searchSettings.experienceLevel}
    - Location: ${searchSettings.location || "Any"}
    - Keywords: ${searchSettings.keywords || ""}
    - Alternative Titles: ${jobAnalysis?.alternativeJobTitles?.join(", ") || ""}
    - Industry Terms: ${jobAnalysis?.industrySpecificTerms?.join(", ") || ""}
    - Skill Synonyms: ${JSON.stringify(jobAnalysis?.skillSynonyms || {})}

    **Platform to Target:** ${platform}

    **Platform-Specific Instructions:**
    ${getPlatformInstructions(platform, jobAnalysis)}

    **Query Generation Strategy:**
    - Create 5–7 broad queries to maximize candidate matches.
    - Combine core skills, primary job titles, and location (if specified) in each query.
    - Use Boolean operators (AND, OR, quotes) for broad reach.
    - Avoid overly specific queries; focus on high-volume candidate pools.
    - Include alternative job titles and skill synonyms where relevant.
    - Target active profiles with contact information where possible.

    **Query Categories (5–7 total):**
    - 2–3 Skill + Title queries (core skills + primary/alternative titles)
    - 1–2 Location + Title queries (if location specified)
    - 1–2 Experience + Skill queries (seniority + key skills)
    - 1 General keyword-based query (broad industry/role terms)

    **Quality Standards:**
    - Queries should be 10–30 words long.
    - Prioritize individual profiles over company pages.
    - Balance broad reach with relevance.

    Return ONLY a valid JSON object:
    {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7"]}
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use lighter model for faster processing
      messages: [{ role: "system", content: prompt }],
      max_tokens: 800, // Reduced tokens for faster response
      temperature: 0.4, // Slightly lower for consistent but broader queries
      response_format: { type: "json_object" },
    });

    const content = JSON.parse(response.choices[0].message.content);
    const queries = content.queries || [];
    console.log(`🔍 Generated ${queries.length} broad queries for ${platform}`);
    return queries.slice(0, 7); // Ensure max 7 queries
  } catch (error) {
    console.error("❌ Error generating search queries:", error.message);
    return [];
  }
}

// Platform instructions helper
function getPlatformInstructions(platform, jobAnalysis) {
  const category = jobAnalysis?.jobCategory?.toLowerCase() || ""
  const seniority = jobAnalysis?.seniorityLevel?.toLowerCase() || ""

  switch (platform) {
    case "linkedin":
      return `
        **LinkedIn Advanced Search Strategy:**
        LinkedIn is the primary professional platform. Create sophisticated queries using:
        
        **Boolean Search Mastery:**
        - Use quotes for exact phrases: "Senior Software Engineer"
        - Use parentheses for grouping: (Java OR Python OR JavaScript)
        - Use AND/OR/NOT operators strategically
        - Target current positions and past experience
        
        **Targeting Strategies:**
        - Seniority-based: "${seniority}" level professionals
        - Company-based: Current/past employees of target companies
        - Skills-based: Multiple skill combinations with AND/OR
        - Industry-based: Specific industry experience
        - Location-based: Current location + willing to relocate
        - Education-based: Relevant degrees and universities
        
        **Examples by Category:**
        - Tech: "Senior Software Engineer" AND (Python OR Java) AND "San Francisco"
        - Design: "UI/UX Designer" AND (Figma OR Sketch) AND "portfolio"
        - Legal: ("Corporate Lawyer" OR "Legal Counsel") AND "Securities Law"
        - Finance: "Investment Banker" AND "Mergers Acquisitions" AND CFA
        - Healthcare: ("Physician" OR "Doctor") AND "Cardiology" AND "Board Certified"
        
        **Contact Discovery:**
        - Include "contact" OR "email" in some queries
        - Target profiles with external contact information
        - Look for profiles mentioning "open to opportunities"
      `
    case "github":
      return `
        **GitHub Advanced Search for Technical Talent:**
        GitHub is perfect for technical roles. Create queries that target:
        
        **Technical Depth:**
        - Programming languages: language:Python language:JavaScript
        - Framework expertise: React Vue.js Django Flask
        - Location targeting: location:"San Francisco" location:"Remote"
        - Activity level: followers:>100 repos:>10
        - Recent activity: pushed:>2024-01-01
        
        **Profile Intelligence:**
        - Bio-based searches: Target user bios with role keywords
        - Repository analysis: Specific project types and technologies
        - Contribution patterns: Active contributors and maintainers
        - Company affiliations: Current/past company mentions
        
        **Examples:**
        - "Senior Developer" location:"New York" language:Python
        - "Machine Learning" "AI" followers:>50 repos:>5
        - "Full Stack" React Node.js location:Remote
        - "DevOps" Docker Kubernetes AWS location:"San Francisco"
        
        **Only use for technical roles requiring programming skills.**
      `
    case "dribbble":
      return `
        **Dribbble Enhanced Search for Design Professionals:**
        Dribbble is the premier platform for visual designers. Create targeted queries for:
        
        **Design Specializations:**
        - UI/UX Design: "UI Designer" "UX Designer" "Product Designer"
        - Visual Design: "Graphic Designer" "Brand Designer" "Visual Designer"
        - Mobile Design: "Mobile App Design" "iOS Design" "Android Design"
        - Web Design: "Web Designer" "Landing Page" "Website Design"
        
        **Skill-Based Targeting:**
        - Tools: Figma Sketch Adobe Photoshop Illustrator
        - Specialties: "Logo Design" "Branding" "Icon Design" "Illustration"
        - Industries: "SaaS Design" "E-commerce Design" "Healthcare Design"
        - Experience: "Senior Designer" "Lead Designer" "Design Director"
        
        **Portfolio Intelligence:**
        - Project types: "Dashboard Design" "Mobile App" "Website Redesign"
        - Client work: "Client Work" "Freelance" "Agency Work"
        - Awards: "Award Winning" "Featured" "Popular"
        - Contact info: "Available for Work" "Contact" "Hire Me"
        
        **Location & Availability:**
        - Geographic: Location-specific searches if needed
        - Availability: "Available" "Freelance" "Full-time" "Remote"
        
        **Examples:**
        - "UI Designer" Figma "San Francisco" "Available for Work"
        - "Brand Designer" "Logo Design" Adobe Illustrator portfolio
        - "UX Designer" "Mobile App" "Product Design" "Remote"
        - "Senior Designer" "Dashboard Design" "SaaS" experience
        
        **Only use for design and creative roles.**
      `
    case "behance":
      return `
        **Behance Advanced Search for Creative Professionals:**
        Behance showcases creative portfolios. Create queries targeting:
        
        **Creative Categories:**
        - Graphic Design: "Graphic Designer" "Visual Identity" "Brand Design"
        - Web Design: "Web Design" "Digital Design" "Interface Design"
        - Photography: "Photographer" "Commercial Photography" "Product Photography"
        - Illustration: "Illustrator" "Digital Art" "Character Design"
        - Motion Graphics: "Motion Designer" "Animation" "Video Graphics"
        
        **Professional Targeting:**
        - Experience Level: "Senior" "Lead" "Creative Director" "Art Director"
        - Industry Focus: "Advertising" "Marketing" "Publishing" "Entertainment"
        - Software Skills: "Adobe Creative Suite" "After Effects" "Cinema 4D"
        - Specializations: "Print Design" "Digital Marketing" "Package Design"
        
        **Portfolio Analysis:**
        - Project Types: "Campaign Design" "Brand Identity" "Website Design"
        - Client Work: "Client Projects" "Commercial Work" "Published Work"
        - Recognition: "Award Winning" "Featured" "Curated"
        - Availability: "Available for Hire" "Freelance" "Contact"
        
        **Contact Discovery:**
        - Include "contact" "email" "hire" "available" in searches
        - Look for external portfolio links and social media
        - Target profiles with comprehensive contact information
        
        **Examples:**
        - "Brand Designer" "Visual Identity" "Available for Hire" Adobe
        - "Creative Director" "Advertising" "Campaign Design" experience
        - "Motion Designer" "After Effects" "Commercial Work" portfolio
        - "Art Director" "Digital Marketing" "Creative Strategy" senior
        
        **Only use for creative and artistic roles.**
      `
    case "google":
      return `
        **Google Advanced Search for Professional Discovery:**
        Google provides access to resumes, portfolios, and professional websites across the internet.
        
        **Search Strategies:**
        - Resume Targeting: filetype:pdf "resume" OR "CV" + role keywords
        - Portfolio Discovery: "portfolio" "work samples" "case studies"
        - Professional Websites: "about me" "professional" personal websites
        - Industry Directories: site:specific-industry-sites.com
        - Conference Speakers: "speaker" "conference" "presentation"
        - Company Alumni: "formerly at" "ex-" company names
        
        **Advanced Operators:**
        - Site-specific: site:company.com "software engineer"
        - File types: filetype:pdf "data scientist resume"
        - Exact phrases: "Senior Product Manager" "available"
        - Exclusions: -jobs -hiring (avoid job postings)
        - Time filters: Use recent content for active professionals
        
        **Professional Platforms Integration:**
        - site:medium.com technical articles + author profiles
        - site:stackoverflow.com expert contributors
        - site:kaggle.com data science competitions
        - site:angel.co startup professionals
        - Industry-specific platforms and communities
        
        **Examples:**
        - "software engineer" "San Francisco" filetype:pdf resume Python
        - "marketing director" portfolio "case studies" "contact"
        - site:medium.com "machine learning" author profile
        - "UX designer" "portfolio" "available for hire" -jobs
        - "financial analyst" "CFA" resume filetype:pdf "New York"
      `
    default:
      return `Create platform-appropriate professional search queries with advanced targeting techniques.`
  }
}

// Enhanced candidate extraction with AI
async function extractCandidateWithAI(pageText, url, platform) {
  const prompt = `
    You are an expert talent sourcer specializing in extracting professional information from ${platform} profiles. Your task is to comprehensively analyze this content and extract detailed candidate information with absolute accuracy.

    **CRITICAL EXTRACTION REQUIREMENTS:**
    1. **ZERO FABRICATION**: Only extract information explicitly present in the text
    2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
    3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional links
    4. **EXACT TRANSCRIPTION**: Copy information exactly as written
    5. **PLATFORM EXPERTISE**: Apply ${platform}-specific extraction intelligence

    **Content Source:** ${url} (Platform: ${platform})
    **Platform Context:** ${getPlatformExtractionContext(platform)}

    **Text Content:**
    ---
    ${pageText.substring(0, 12000)}
    ---

    **REQUIRED EXTRACTION FIELDS:**
    Extract the following information ONLY if clearly and explicitly present:

    **Personal Information:**
    - Full name (complete name as displayed)
    - Email address (exact format, multiple if present)
    - Phone number (exact format with country code if shown)
    - Current location (city, state, country as specified)

    **Professional Information:**
    - Current job title (exact title as stated)
    - Current company (exact company name)
    - Professional summary/bio (comprehensive if available)
    - Years of experience (only if explicitly stated)
    - Industry specialization

    **Skills & Expertise:**
    - Technical skills (programming languages, tools, software)
    - Professional skills (management, communication, etc.)
    - Certifications and credentials
    - Specializations and expertise areas

    **Work History:**
    - Previous companies and roles
    - Notable projects and achievements
    - Portfolio work and case studies
    - Client work and collaborations

    **Education:**
    - Degrees and institutions
    - Relevant coursework and certifications
    - Professional development

    **Digital Presence:**
    - All social media and professional links found
    - Portfolio websites and personal sites
    - Professional platform profiles
    - Contact methods and availability status

    **${platform}-Specific Intelligence:**
    ${getPlatformSpecificExtractionInstructions(platform)}

    **OUTPUT FORMAT:**
    Return ONLY this JSON structure with extracted data or null values:
    {
      "candidateName": "Full name exactly as written or null",
      "email": "primary.email@domain.com or null",
      "alternateEmails": ["additional@emails.com"] or [],
      "mobile": "exact phone number with formatting or null",
      "currentJobTitle": "Exact current title or null",
      "currentCompany": "Exact company name or null",
      "location": "Exact location string or null",
      "skills": ["actual", "skills", "extracted"] or [],
      "technicalSkills": ["programming", "tools", "software"] or [],
      "summary": "Professional summary/bio from profile or null",
      "experience": "Work experience description or null",
      "yearsOfExperience": "X years (only if explicitly stated) or null",
      "education": "Education information or null",
      "certifications": ["actual", "certifications"] or [],
      "projects": ["actual", "projects", "portfolio pieces"] or [],
      "achievements": ["awards", "recognition", "notable work"] or [],
      "industries": ["industry", "specializations"] or [],
      "availabilityStatus": "availability status if mentioned or null",
      "sourceInfo": {
        "profileUrl": "${url}",
        "linkedinProfileUrl": "found LinkedIn URL or null",
        "githubProfileUrl": "found GitHub URL or null",
        "portfolioUrl": "found portfolio URL or null",
        "dribbbleUrl": "found Dribbble URL or null",
        "behanceUrl": "found Behance URL or null",
        "twitterUrl": "found Twitter URL or null",
        "mediumUrl": "found Medium URL or null",
        "personalWebsite": "found personal website or null",
        "contactMethods": ["all", "contact", "methods", "found"] or []
      }
    }
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 3000,
      temperature: 0.05,
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)

    // Validate that we have at least a name
    if (!result || !result.candidateName) {
      console.log(`❌ No valid candidate data extracted from ${url}`)
      return null
    }

    // Merge technical skills into main skills array
    const allSkills = [...(result.skills || []), ...(result.technicalSkills || [])]

    return {
      id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      candidateName: result.candidateName,
      email: result.email,
      alternateEmails: result.alternateEmails || [],
      mobile: result.mobile,
      currentJobTitle: result.currentJobTitle,
      currentCompany: result.currentCompany,
      location: result.location,
      skills: [...new Set(allSkills)],
      summary: result.summary,
      experience: result.experience,
      yearsOfExperience: result.yearsOfExperience,
      education: result.education,
      certifications: result.certifications || [],
      projects: result.projects || [],
      achievements: result.achievements || [],
      industries: result.industries || [],
      availabilityStatus: result.availabilityStatus,
      sourceInfo: {
        platform,
        profileUrl: url,
        linkedinProfileUrl: result.sourceInfo?.linkedinProfileUrl,
        githubProfileUrl: result.sourceInfo?.githubProfileUrl,
        portfolioUrl: result.sourceInfo?.portfolioUrl,
        dribbbleUrl: result.sourceInfo?.dribbbleUrl,
        behanceUrl: result.sourceInfo?.behanceUrl,
        twitterUrl: result.sourceInfo?.twitterUrl,
        mediumUrl: result.sourceInfo?.mediumUrl,
        personalWebsite: result.sourceInfo?.personalWebsite,
        contactMethods: result.sourceInfo?.contactMethods || [],
        hasEmail: !!result.email,
        hasPhone: !!result.mobile,
        sourcedAt: new Date(),
        aiModel: "gpt-4o",
      },
      matchScore: 0,
    }
  } catch (error) {
    console.error(`❌ Error extracting candidate from ${url}:`, error.message)
    return null
  }
}

// Platform extraction context helpers
function getPlatformExtractionContext(platform) {
  switch (platform) {
    case "linkedin":
      return "LinkedIn professional profile with work history, skills, education, and connections"
    case "github":
      return "GitHub developer profile with repositories, contributions, and technical projects"
    case "dribbble":
      return "Dribbble design portfolio with creative work, projects, and design skills"
    case "behance":
      return "Behance creative portfolio with artistic work, brand projects, and creative expertise"
    case "google":
      return "Web content including resumes, portfolios, personal websites, or professional profiles"
    default:
      return "Professional web content with career and contact information"
  }
}

function getPlatformSpecificExtractionInstructions(platform) {
  switch (platform) {
    case "dribbble":
      return `
        **Dribbble-Specific Extraction:**
        - Extract design software proficiency (Figma, Sketch, Adobe Creative Suite)
        - Identify design specializations (UI/UX, branding, illustration, web design)
        - Note client work vs. personal projects
        - Extract design process information and methodologies
        - Look for design awards, features, or recognition
        - Identify collaboration experience and team projects
        - Note availability for freelance/full-time work
        - Extract creative brief understanding and problem-solving approaches
      `
    case "behance":
      return `
        **Behance-Specific Extraction:**
        - Identify creative disciplines (graphic design, photography, motion graphics)
        - Extract brand work and campaign experience
        - Note commercial vs. personal creative projects
        - Identify creative software expertise and workflow
        - Look for published work and client testimonials
        - Extract creative education and artistic background
        - Note creative direction and conceptual thinking skills
        - Identify cross-media experience (print, digital, video)
      `
    case "github":
      return `
        **GitHub-Specific Extraction:**
        - Extract programming languages and frameworks from repositories
        - Identify contribution patterns and open source involvement
        - Note repository ownership vs. contributions to others' projects
        - Extract README documentation and project descriptions
        - Identify technical architecture and system design experience
        - Look for code quality, testing, and documentation practices
        - Note collaboration through pull requests and issues
        - Extract technical leadership through repository management
      `
    case "linkedin":
      return `
        **LinkedIn-Specific Extraction:**
        - Extract complete work history with date ranges
        - Identify professional accomplishments and metrics
        - Note recommendations and endorsements context
        - Extract volunteer work and professional associations
        - Identify leadership roles and team management experience
        - Look for industry thought leadership through posts/articles
        - Note professional development and continuous learning
        - Extract networking strength through connections and activity
      `
    default:
      return "Extract comprehensive professional information relevant to the platform context."
  }
}

// Enhanced candidate evaluation
async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
  if (!candidate.candidateName) {
    console.log("⚠️ Skipping evaluation - insufficient candidate data")
    return null
  }

  const prompt = `
    You are a senior technical recruiter and talent assessment expert with 20+ years of experience. Conduct a comprehensive evaluation of this candidate's fit for the position using rigorous assessment criteria.

    **Job Requirements:**
    - Position: ${jobDescription.context}
    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
    - Experience Level: ${searchSettings.experienceLevel}
    - Location: ${searchSettings.location || "Any"}
    - Keywords: ${searchSettings.keywords || ""}
    - Industry Focus: ${searchSettings.industryFocus || ""}

    **Candidate Profile:**
    - Name: ${candidate.candidateName}
    - Current Title: ${candidate.currentJobTitle || "Not specified"}
    - Company: ${candidate.currentCompany || "Not specified"}
    - Location: ${candidate.location || "Not specified"}
    - Skills: ${candidate.skills?.join(", ") || "Not specified"}
    - Technical Skills: ${candidate.technicalSkills?.join(", ") || "Not specified"}
    - Experience: ${candidate.yearsOfExperience || "Not specified"}
    - Summary: ${candidate.summary || "Not available"}
    - Education: ${candidate.education || "Not specified"}
    - Certifications: ${candidate.certifications?.join(", ") || "Not specified"}
    - Projects: ${candidate.projects?.join(", ") || "Not specified"}
    - Achievements: ${candidate.achievements?.join(", ") || "Not specified"}
    - Industries: ${candidate.industries?.join(", ") || "Not specified"}

    **COMPREHENSIVE EVALUATION CRITERIA:**
    **1. Skills Assessment (0-100):**
    - Match required technical skills against candidate skills
    - Consider skill depth and breadth
    - Evaluate transferable skills and learning ability
    - Account for emerging technologies and future requirements

    **2. Experience Assessment (0-100):**
    - Evaluate years of experience against requirements
    - Assess relevance of previous roles and responsibilities
    - Consider industry experience and domain knowledge
    - Evaluate progression and career trajectory

    **3. Education & Certifications Assessment (0-100):**
    - Match educational background to requirements
    - Evaluate relevant certifications and continuous learning
    - Consider alternative education and self-directed learning
    - Assess specialized training and professional development

    **4. Cultural & Role Fit Assessment (0-100):**
    - Evaluate role responsibilities alignment
    - Consider company size and culture fit indicators
    - Assess leadership potential and growth trajectory
    - Evaluate communication and collaboration indicators

    **ASSESSMENT GUIDELINES:**
    - Be honest and realistic in scoring
    - Consider both current capabilities and potential
    - Account for missing information in your analysis
    - Provide actionable insights for hiring decisions
    - Consider market scarcity and candidate uniqueness

    **SCORING METHODOLOGY:**
    - 90-100: Exceptional match, rare find, immediate hire
    - 80-89: Strong match, highly recommended
    - 70-79: Good match, recommended with considerations
    - 60-69: Moderate match, consider with reservations
    - 50-59: Weak match, significant gaps exist
    - Below 50: Poor match, not recommended

    Return ONLY this JSON structure with thorough analysis:
    {
      "matchingScoreDetails": {
        "skillsMatch": number (0-100, detailed skills comparison),
        "experienceMatch": number (0-100, experience relevance and depth),
        "educationMatch": number (0-100, educational background relevance),
        "culturalFitMatch": number (0-100, role and culture alignment),
        "overallMatch": number (0-100, weighted comprehensive score)
      },
      "analysis": {
        "skills": {
          "candidateSkills": ["all", "candidate", "skills"],
          "matched": ["skills", "that", "directly", "match"],
          "notMatched": ["required", "skills", "missing"],
          "transferableSkills": ["skills", "that", "could", "transfer"],
          "skillGaps": ["critical", "gaps", "identified"],
          "skillStrengths": ["standout", "skills", "and", "expertise"]
        },
        "experience": {
          "relevantExperience": "detailed description of relevant experience or 'Limited information available'",
          "yearsOfExperience": "exact years mentioned or 'Not specified'",
          "careerProgression": "analysis of career growth and trajectory",
          "industryExperience": "relevant industry background",
          "roleRelevance": "how previous roles align with target position"
        },
        "education": {
          "highestDegree": "actual degree or 'Not specified'",
          "relevantCourses": ["relevant", "coursework"] or [],
          "certifications": ["professional", "certifications"],
          "continuousLearning": "evidence of ongoing professional development"
        },
        "projects": ["significant", "projects", "and", "achievements"],
        "strengths": ["top", "candidate", "strengths"],
        "concerns": ["potential", "concerns", "or", "risks"],
        "recommendation": "detailed hiring recommendation with reasoning",
        "comments": "comprehensive assessment including data gaps and assumptions",
        "additionalNotes": "market insights, salary expectations, availability, unique value proposition"
      },
      "comment": "concise executive summary for hiring managers",
      "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
      "confidenceLevel": "High|Medium|Low (based on available information quality)",
      "nextSteps": "recommended actions for recruitment process"
    }
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 1200,
      temperature: 0.1,
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)
    console.log(`✅ Evaluated ${candidate.candidateName}: ${result.matchingScoreDetails?.overallMatch}/100`)
    return result
  } catch (error) {
    console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, error.message)
    return null
  }
}

// NEW: Enhanced Google search with LinkedIn URL collection
async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
  const candidates = new Map()
  const linkedinUrls = new Set() // NEW: Collect LinkedIn URLs
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

  if (!apiKey || !searchEngineId) {
    console.warn("⚠️ Google Search API not configured. Skipping Google search.")
    return []
  }

  const platform = siteFilter.includes("linkedin")
    ? "linkedin"
    : siteFilter.includes("github")
      ? "github"
      : siteFilter.includes("dribbble")
        ? "dribbble"
        : siteFilter.includes("behance")
          ? "behance"
          : "google"

  let totalResults = 0
  const maxResultsPerQuery = 10
  const targetCandidates = Math.min(searchSettings.candidateCount * 3, 150)

  console.log(`🔍 Starting enhanced Google search for ${platform} with ${queries.length} queries`)

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    if (shouldStopSearch(searchId)) {
      console.log(`🛑 Search stopped by user request at query ${i + 1}`)
      emitProgress(
        searchId,
        `🛑 Search stopped by user. Processing ${candidates.size} candidates found so far...`,
        50,
        candidates.size,
        platform,
        false,
      )
      break
    }

    const query = queries[i]
    if (!query || query.trim() === "") continue

    try {
      const searchQuery = `${query} ${siteFilter}`.trim()
      console.log(`🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`)
      emitProgress(
        searchId,
        `Searching ${platform}: "${searchQuery.substring(0, 50)}..."`,
        20 + (i / queries.length) * 25,
        candidates.size,
        platform,
      )

      const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
        params: {
          key: apiKey,
          cx: searchEngineId,
          q: searchQuery,
          num: maxResultsPerQuery,
          start: 1,
        },
        timeout: 15000,
      })

      if (response.data.items) {
        console.log(`📊 Found ${response.data.items.length} results for query: ${searchQuery}`)

        for (const item of response.data.items) {
          if (shouldStopSearch(searchId)) {
            console.log(`🛑 Search stopped during candidate processing`)
            break
          }

          if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
            // NEW: Check if it's a LinkedIn profile URL
            if (item.link.includes("linkedin.com/in/") && platform === "linkedin") {
              linkedinUrls.add(item.link)
              console.log(`🔗 Collected LinkedIn URL: ${item.link}`)
              continue // Don't try to extract directly, collect for browser extraction
            }

            emitProgress(
              searchId,
              `Processing: ${item.title?.substring(0, 40)}...`,
              22 + (i / queries.length) * 25,
              candidates.size,
              platform,
            )

            const candidate = await extractCandidateFromUrl(item.link, platform)

            if (candidate && candidate.candidateName) {
              candidates.set(item.link, candidate)
              totalResults++
              console.log(`✅ Extracted: ${candidate.candidateName} (${candidates.size} total)`)
              emitProgress(
                searchId,
                `Found candidate: ${candidate.candidateName}`,
                25 + (i / queries.length) * 25,
                candidates.size,
                platform,
              )

              if (candidates.size >= searchSettings.candidateCount) {
                console.log(`🎯 Reached target candidate count: ${searchSettings.candidateCount}`)
                emitProgress(
                  searchId,
                  `🎯 Target reached! Found ${candidates.size} candidates. Processing evaluations...`,
                  50,
                  candidates.size,
                  platform,
                  false,
                )
                break
              }
            } else {
              console.log(`❌ Failed to extract candidate from: ${item.link}`)
            }
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1200))
    } catch (error) {
      console.error(`❌ Search error for query "${query}":`, error.message)
      if (error.response?.status === 429) {
        console.log("⏳ Rate limited, waiting before retry...")
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  // NEW: Handle LinkedIn URLs if found
  if (linkedinUrls.size > 0 && platform === "linkedin") {
    console.log(`🔗 Found ${linkedinUrls.size} LinkedIn URLs. Sending to browser for extraction...`)
    await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
  }

  console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} candidates.`)
  return Array.from(candidates.values())
}

// NEW: Handle LinkedIn URLs by sending them to frontend for browser extraction
async function handleLinkedInUrls2(searchId, linkedinUrls) {
  try {
    console.log(`📤 Sending ${linkedinUrls.length} LinkedIn URLs to frontend for browser extraction`)

    // Store LinkedIn URLs in extraction queue
    linkedinExtractionQueue.set(searchId, {
      urls: linkedinUrls,
      processed: [],
      failed: [],
    })

    // Save LinkedIn URLs to search history
    const linkedinProfiles = linkedinUrls.map((url) => ({
      profileUrl: url,
      candidateName: extractNameFromLinkedInUrl(url),
      extractionStatus: "pending",
      lastAttempted: new Date(),
      retryCount: 0,
    }))

    await SearchHistory.findByIdAndUpdate(searchId, {
      $push: { linkedinProfiles: { $each: linkedinProfiles } },
    })

    // Emit LinkedIn URLs to frontend for browser extraction
    io.emit("linkedinUrlsForExtraction", {
      searchId: searchId,
      urls: linkedinUrls,
      message: `Found ${linkedinUrls.length} LinkedIn profiles. Starting browser extraction...`,
    })

    emitProgress(
      searchId,
      `📤 Sent ${linkedinUrls.length} LinkedIn URLs to browser for extraction...`,
      60,
      0,
      "linkedin-browser",
      false,
    )
  } catch (error) {
    console.error("❌ Error handling LinkedIn URLs:", error.message)
  }
}
async function handleLinkedInUrls(searchId, linkedinUrls) {
  try {
    // Limit to top 20 LinkedIn URLs
    const topUrls = linkedinUrls.slice(0, 20);
    console.log(`📤 Sending ${topUrls.length} LinkedIn URLs to frontend for browser extraction`);

    // Store LinkedIn URLs in extraction queue
    linkedinExtractionQueue.set(searchId, {
      urls: topUrls,
      processed: [],
      failed: [],
    });

    // Save LinkedIn URLs to search history
    const linkedinProfiles = topUrls.map((url) => ({
      profileUrl: url,
      candidateName: extractNameFromLinkedInUrl(url),
      extractionStatus: "pending",
      lastAttempted: new Date(),
      retryCount: 0,
    }));

    await SearchHistory.findByIdAndUpdate(searchId, {
      $push: { linkedinProfiles: { $each: linkedinProfiles } },
    });

    // Emit LinkedIn URLs to frontend for browser extraction
    io.emit("linkedinUrlsForExtraction", {
      searchId: searchId,
      urls: topUrls,
      message: `Found ${topUrls.length} LinkedIn profiles. Starting browser extraction...`,
    });

    emitProgress(
      searchId,
      `📤 Sent ${topUrls.length} LinkedIn URLs to browser for extraction...`,
      60,
      0,
      "linkedin-browser",
      false,
    );
  } catch (error) {
    console.error("❌ Error handling LinkedIn URLs:", error.message);
  }
}

// Extract name from LinkedIn URL
function extractNameFromLinkedInUrl(url) {
  try {
    const urlParts = url.split("/")
    const profileId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2]
    return (
      profileId
        .replace(/-/g, " ")
        .replace(/\d+/g, "")
        .trim()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ") || "LinkedIn Profile"
    )
  } catch (error) {
    return "LinkedIn Profile"
  }
}

// Extract candidate from URL
async function extractCandidateFromUrl(url, platform) {
  try {
    console.log(`🔍 Extracting from: ${url}`)
    const { data } = await axios.get(url, {
      timeout: 25000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
        "Accept-Encoding": "gzip, deflate, br",
      },
    })

    const $ = load(data)
    $("script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner, .popup, .modal, .overlay").remove()
    const text = $("body").text().replace(/\s+/g, " ").trim()

    if (text.length < 300) {
      console.log(`❌ Insufficient content from ${url} (${text.length} chars)`)
      return null
    }

    console.log(`📄 Extracted ${text.length} characters from ${url}`)
    const candidate = await extractCandidateWithAI(text, url, platform)

    if (candidate) {
      console.log(`✅ Successfully extracted candidate: ${candidate.candidateName}`)
    }
    return candidate
  } catch (error) {
    console.error(`❌ Error extracting from ${url}:`, error.message)
    return null
  }
}

// LinkedIn search with enhanced fallback
async function searchLinkedIn(queries, searchSettings, searchId) {
  const apiKey = process.env.LINKEDIN_API_KEY
  if (apiKey) {
    console.log("🔑 LinkedIn API key found. Using API search.")
    return await searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey)
  } else {
    console.log("🔍 No LinkedIn API key. Using Google search for LinkedIn profiles.")
    return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
  }
}

async function searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey) {
  console.log("🚀 --- Enhanced LinkedIn API Search ---")
  const candidates = new Map()
  const targetCandidates = Math.min(searchSettings.candidateCount * 2, 100)
  const apiEndpoint = "https://nubela.co/proxycurl/api/v2/linkedin"
  const linkedInUrls = new Set()
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

  if (!googleApiKey || !searchEngineId) {
    console.warn("⚠️ Google Search API not configured. Cannot find LinkedIn profiles to enrich.")
    return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
  }

  // Step 1: Find LinkedIn profile URLs using Google
  for (const query of queries) {
    if (linkedInUrls.size >= targetCandidates * 2) break
    const searchQuery = `${query} site:linkedin.com/in/`
    try {
      const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
        params: { key: googleApiKey, cx: searchEngineId, q: searchQuery, num: 10 },
        timeout: 10000,
      })
      if (response.data.items) {
        response.data.items.forEach((item) => {
          if (item.link && item.link.includes("linkedin.com/in/")) {
            linkedInUrls.add(item.link)
          }
        })
      }
    } catch (error) {
      console.error(`❌ Error finding LinkedIn URLs with query "${query}":`, error.message)
    }
  }

  console.log(`📊 Found ${linkedInUrls.size} LinkedIn profile URLs to enrich.`)

  // Step 2: Enrich profiles using LinkedIn API
  let processedCount = 0
  for (const url of linkedInUrls) {
    if (candidates.size >= targetCandidates) break
    emitProgress(
      searchId,
      `Enriching LinkedIn profile ${processedCount + 1}/${linkedInUrls.size}...`,
      50 + (processedCount / linkedInUrls.size) * 25,
      candidates.size,
      "linkedin-api",
    )

    try {
      const response = await axios.get(apiEndpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
        params: {
          url: url,
          fallback_to_cache: "on-error",
          use_cache: "if-present",
          skills: "include",
          inferred_salary: "include",
          personal_email: "include",
          personal_contact_number: "include",
          twitter_profile_id: "include",
          facebook_profile_id: "include",
          github_profile_id: "include",
          extra: "include",
        },
        timeout: 20000,
      })

      const profileData = response.data
      if (profileData && profileData.public_identifier && !candidates.has(profileData.public_identifier)) {
        const candidate = {
          id: `linkedin_${profileData.public_identifier}`,
          candidateName: `${profileData.first_name} ${profileData.last_name}`,
          email: profileData.personal_email,
          mobile: profileData.personal_contact_number,
          currentJobTitle: profileData.occupation,
          currentCompany: profileData.experiences?.[0]?.company,
          location: `${profileData.city}, ${profileData.state}, ${profileData.country}`,
          skills: profileData.skills || [],
          summary: profileData.summary,
          experience: profileData.experiences
            ?.map(
              (exp) =>
                `${exp.title} at ${exp.company} (${exp.starts_at?.year || "N/A"} - ${exp.ends_at?.year || "Present"})`,
            )
            .join("\n"),
          yearsOfExperience: calculateExperienceYears(profileData.experiences),
          education: profileData.education?.map((edu) => `${edu.degree_name}, ${edu.school}`).join("\n"),
          sourceInfo: {
            platform: "linkedin",
            profileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
            linkedinProfileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
            githubProfileUrl: profileData.github_profile_id
              ? `https://github.com/${profileData.github_profile_id}`
              : null,
            twitterUrl: profileData.twitter_profile_id ? `https://twitter.com/${profileData.twitter_profile_id}` : null,
            hasEmail: !!profileData.personal_email,
            hasPhone: !!profileData.personal_contact_number,
            sourcedAt: new Date(),
            aiModel: "linkedin-api",
          },
          matchScore: 0,
        }

        candidates.set(profileData.public_identifier, candidate)
        console.log(`✅ Enriched via LinkedIn API: ${candidate.candidateName}`)
      }
    } catch (error) {
      console.error(
        `❌ Error enriching LinkedIn profile from ${url}:`,
        error.response ? error.response.data : error.message,
      )
    }

    processedCount++
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  console.log(`🎉 --- LinkedIn API search finished. Found ${candidates.size} candidates. ---`)
  return Array.from(candidates.values())
}

// Helper function to calculate years of experience
function calculateExperienceYears(experiences) {
  if (!experiences || experiences.length === 0) return null
  let totalMonths = 0
  experiences.forEach((exp) => {
    if (exp.starts_at && exp.starts_at.year) {
      const startYear = exp.starts_at.year
      const startMonth = exp.starts_at.month || 1
      const endYear = exp.ends_at?.year || new Date().getFullYear()
      const endMonth = exp.ends_at?.month || new Date().getMonth() + 1
      const months = (endYear - startYear) * 12 + (endMonth - startMonth)
      totalMonths += months
    }
  })
  return totalMonths > 0 ? `${Math.round(totalMonths / 12)} years` : null
}

async function searchGitHub(queries, searchSettings, searchId) {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.log("🔍 GitHub token not configured. Using Google search.")
    return await searchGoogle(queries, searchSettings, "site:github.com", searchId)
  }

  const candidates = new Map()
  let totalResults = 0
  const maxResultsPerQuery = 15
  const targetCandidates = Math.min(searchSettings.candidateCount * 3, 100)

  console.log(`🚀 Starting enhanced GitHub search with ${queries.length} queries`)

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    const query = queries[i]
    if (!query || query.trim() === "") continue

    try {
      console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`)
      emitProgress(
        searchId,
        `GitHub search: "${query.substring(0, 50)}..."`,
        40 + (i / queries.length) * 25,
        candidates.size,
        "github",
      )

      const response = await axios.get(`https://api.github.com/search/users`, {
        params: {
          q: query,
          per_page: maxResultsPerQuery,
          sort: "repositories",
          order: "desc",
        },
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        timeout: 15000,
      })

      if (response.data.items) {
        console.log(`📊 Found ${response.data.items.length} GitHub users`)
        for (const user of response.data.items) {
          if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
            emitProgress(
              searchId,
              `Processing GitHub profile: ${user.login}`,
              42 + (i / queries.length) * 25,
              candidates.size,
              "github",
            )
            const candidate = await extractCandidateFromUrl(user.html_url, "github")
            if (candidate && candidate.candidateName) {
              candidates.set(user.html_url, candidate)
              totalResults++
              console.log(`✅ GitHub candidate: ${candidate.candidateName}`)
              emitProgress(
                searchId,
                `Found GitHub candidate: ${candidate.candidateName}`,
                45 + (i / queries.length) * 25,
                candidates.size,
                "github",
              )
            }
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1500))
    } catch (error) {
      console.error(`❌ GitHub search error:`, error.message)
      if (error.response?.status === 403 || error.response?.status === 429) {
        console.log("⏳ GitHub rate limited, waiting before retry...")
        await new Promise((resolve) => setTimeout(resolve, 10000))
      }
    }
  }

  console.log(`🎉 GitHub search completed. Found ${candidates.size} candidates.`)
  return Array.from(candidates.values())
}

async function searchDribbble(queries, searchSettings, searchId) {
  console.log("🎨 Starting enhanced Dribbble search for design talent")
  return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
}

async function searchBehance(queries, searchSettings, searchId) {
  console.log("🎭 Starting enhanced Behance search for creative professionals")
  return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
}

// Cost estimation
function estimateSearchCost(candidateCount) {
  const tokensPerCandidate = 1200
  const totalInputTokens = candidateCount * tokensPerCandidate
  const totalOutputTokens = candidateCount * 700
  const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000

  return {
    estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
    model: "gpt-4o & gpt-4o-mini",
    features: [
      "Enhanced Job Analysis",
      "AI Profile Extraction",
      "Smart Platform Selection",
      "Contact Discovery",
      "Comprehensive Candidate Evaluation",
      "Platform-Specific Intelligence",
      "LinkedIn Browser Extraction",
      "Stop Control",
      "Resume Database Integration",
    ],
  }
}

// Deduplication
function deduplicateCandidates(candidates) {
  const uniqueMap = new Map()
  for (const candidate of candidates) {
    const keys = []
    if (candidate.email) {
      keys.push(`email_${candidate.email.toLowerCase()}`)
    }
    if (candidate.candidateName) {
      keys.push(`name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`)
    }
    if (candidate.sourceInfo?.linkedinProfileUrl) {
      keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`)
    }
    if (candidate.sourceInfo?.githubProfileUrl) {
      keys.push(`github_${candidate.sourceInfo.githubProfileUrl}`)
    }
    if (candidate.sourceInfo?.profileUrl) {
      keys.push(`profile_${candidate.sourceInfo.profileUrl}`)
    }
    if (candidate.mobile) {
      keys.push(`mobile_${candidate.mobile.toString().replace(/\D/g, "")}`)
    }

    const existingKey = keys.find((key) => uniqueMap.has(key))
    if (!existingKey) {
      keys.forEach((key) => uniqueMap.set(key, candidate))
    } else {
      const existing = uniqueMap.get(existingKey)
      mergeCandidateInfo(existing, candidate)
    }
  }
  return Array.from(new Set(uniqueMap.values()))
}

function mergeCandidateInfo(existing, duplicate) {
  if (!existing.email && duplicate.email) {
    existing.email = duplicate.email
  }
  if (!existing.mobile && duplicate.mobile) {
    existing.mobile = duplicate.mobile
  }
  if (duplicate.skills && duplicate.skills.length > 0) {
    existing.skills = [...new Set([...(existing.skills || []), ...duplicate.skills])]
  }
  if (duplicate.sourceInfo) {
    Object.keys(duplicate.sourceInfo).forEach((key) => {
      if (duplicate.sourceInfo[key] && !existing.sourceInfo[key]) {
        existing.sourceInfo[key] = duplicate.sourceInfo[key]
      }
    })
  }
  if (duplicate.summary && duplicate.summary.length > (existing.summary?.length || 0)) {
    existing.summary = duplicate.summary
  }
  if (duplicate.experience && duplicate.experience.length > (existing.experience?.length || 0)) {
    existing.experience = duplicate.experience
  }
  if (duplicate.projects && duplicate.projects.length > 0) {
    existing.projects = [...new Set([...(existing.projects || []), ...duplicate.projects])]
  }
  if (duplicate.achievements && duplicate.achievements.length > 0) {
    existing.achievements = [...new Set([...(existing.achievements || []), ...duplicate.achievements])]
  }
  if (duplicate.matchScore && duplicate.matchScore > (existing.matchScore || 0)) {
    existing.matchScore = duplicate.matchScore
    existing.matchingScoreDetails = duplicate.matchingScoreDetails
    existing.analysis = duplicate.analysis
    existing.recommendation = duplicate.recommendation
  }
}

// Enhanced main search function with stop control
export const startHeadhunterSearch = async (req, res) => {
  try {
    const { jobId, searchSettings, recruiterId } = req.body
    if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      })
    }

    searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)
    const job = await JobDescription.findById(jobId)
    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" })
    }

    const companyId = job.companyId
    if (!companyId) {
      return res.status(400).json({ success: false, error: "Company ID not found" })
    }

    const estimatedCost = estimateSearchCost(searchSettings.candidateCount)
    const searchHistory = new SearchHistory({
      recruiterId,
      jobId,
      jobTitle: job.context,
      companyId,
      platforms: searchSettings.platforms,
      searchSettings,
      status: "in_progress",
      cost: {
        estimatedCost: estimatedCost.estimatedCost,
        actualCost: 0,
        tokensUsed: 0,
        apiCalls: 0,
      },
      linkedinProfiles: [],
    })

    await searchHistory.save()

    // Initialize search control
    searchControlMap.set(searchHistory._id.toString(), { shouldStop: false })

    res.status(200).json({
      success: true,
      message: "🚀 Enhanced AI headhunter search started!",
      searchId: searchHistory._id,
      estimatedCost: estimatedCost,
    })

    // Start the search process
    performEnhancedDynamicSearch(searchHistory._id, job, searchSettings, recruiterId)
  } catch (error) {
    console.error("❌ Error starting search:", error.message)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// Enhanced main search workflow with stop control and RESTORED candidate saving
async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
  let totalTokensUsed = 0
  let totalApiCalls = 0
  let wasStopped = false

  try {
    console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`)

    // Step 1: Enhanced job analysis
    emitProgress(searchHistoryId, "🧠 Analyzing job requirements with AI intelligence...", 5, 0, "", true)
    const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings)
    totalApiCalls += 1
    totalTokensUsed += 1200

    if (!jobAnalysis) {
      throw new Error("Failed to analyze job requirements")
    }

    console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)
    emitProgress(
      searchHistoryId,
      `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Complexity: ${jobAnalysis.searchComplexity}`,
      10,
      0,
      "",
      true,
    )

    // Check for stop before continuing
    if (shouldStopSearch(searchHistoryId)) {
      wasStopped = true
      throw new Error("Search stopped by user request")
    }

    // Step 2: Platform optimization
    const availablePlatforms = searchSettings.platforms
    const recommendedPlatforms = jobAnalysis.recommendedPlatforms
      .filter((p) => availablePlatforms.includes(p.platform))
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })

    console.log(
      "🎯 Optimized platforms:",
      recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`),
    )

    const allCandidates = []

    // Step 3: Enhanced platform searches with stop control
    for (let i = 0; i < recommendedPlatforms.length; i++) {
      // Check for stop before each platform
      if (shouldStopSearch(searchHistoryId)) {
        console.log(`🛑 Search stopped before platform ${recommendedPlatforms[i].platform}`)
        wasStopped = true
        break
      }

      const platformInfo = recommendedPlatforms[i]
      const platform = platformInfo.platform

      emitProgress(
        searchHistoryId,
        `🔍 Generating enhanced search queries for ${platform}...`,
        15 + i * 20,
        allCandidates.length,
        platform,
        true,
      )

      const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis)
      totalApiCalls += 1
      totalTokensUsed += 1500

      if (queries.length === 0) {
        console.log(`⚠️ No queries generated for ${platform}`)
        continue
      }

      emitProgress(
        searchHistoryId,
        `🚀 Searching ${platform} with ${queries.length} AI-optimized queries...`,
        18 + i * 20,
        allCandidates.length,
        platform,
        true,
      )

      let platformCandidates = []
      try {
        switch (platform) {
          case "google":
            platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId)
            break
          case "linkedin":
            platformCandidates = await searchLinkedIn(queries, searchSettings, searchHistoryId)
            break
          case "github":
            platformCandidates = await searchGitHub(queries, searchSettings, searchHistoryId)
            break
          case "dribbble":
            platformCandidates = await searchDribbble(queries, searchSettings, searchHistoryId)
            break
          case "behance":
            platformCandidates = await searchBehance(queries, searchSettings, searchHistoryId)
            break
        }
      } catch (platformError) {
        console.error(`❌ Error searching ${platform}:`, platformError.message)
        platformCandidates = []
      }

      totalApiCalls += platformCandidates.length * 2
      totalTokensUsed += platformCandidates.length * 2000

      console.log(`📊 Found ${platformCandidates.length} candidates on ${platform}`)
      allCandidates.push(...platformCandidates)

      emitProgress(
        searchHistoryId,
        `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
        30 + i * 20,
        allCandidates.length,
        platform,
        true,
      )

      // Check if we've reached target or should stop
      if (allCandidates.length >= searchSettings.candidateCount || shouldStopSearch(searchHistoryId)) {
        if (shouldStopSearch(searchHistoryId)) {
          console.log(`🛑 Search stopped after ${platform} search`)
          wasStopped = true
        } else {
          console.log(`🎯 Reached target candidate count across platforms`)
        }
        break
      }
    }

    console.log(`📊 Total candidates found across all platforms: ${allCandidates.length}`)

    // NEW: Check if we have LinkedIn URLs pending extraction
    const extractionQueue = linkedinExtractionQueue.get(searchHistoryId)
    if (extractionQueue && extractionQueue.urls.length > 0) {
      console.log(`⏳ Waiting for LinkedIn browser extraction to complete...`)
      emitProgress(
        searchHistoryId,
        `⏳ Waiting for ${extractionQueue.urls.length} LinkedIn profiles to be extracted via browser...`,
        70,
        allCandidates.length,
        "linkedin-browser",
        false,
      )

      // Store current candidates in search history for later processing
      await SearchHistory.findByIdAndUpdate(searchHistoryId, {
        results: allCandidates,
      })

      return // Exit here, will continue in continueSearchAfterLinkedInExtraction
    }

    // Continue with normal processing if no LinkedIn extraction needed
    await continueSearchAfterLinkedInExtraction(searchHistoryId, [])
  } catch (error) {
    console.error("❌ Enhanced search error:", error.message)
    const partialCost = (totalTokensUsed * 0.0002) / 1000
    const finalStatus = wasStopped ? "stopped" : "failed"

    await SearchHistory.findByIdAndUpdate(searchHistoryId, {
      status: finalStatus,
      cost: {
        estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
        actualCost: partialCost,
        tokensUsed: totalTokensUsed,
        apiCalls: totalApiCalls,
      },
    })

    const errorMessage = wasStopped ? "Search stopped by user request" : error.message
    io.emit("searchError", {
      searchId: searchHistoryId,
      message: errorMessage,
      wasStopped,
    })

    // Create error notification
    const errorNotification = new Notification({
      message: wasStopped
        ? `🛑 Search stopped for ${job.context}. Partial results may be available.`
        : `❌ Search failed for ${job.context}. Error: ${error.message}`,
      recipientId: recruiterId,
      jobId: job._id,
    })
    await errorNotification.save()
    io.emit("newNotification", errorNotification)

    // Clean up search control
    searchControlMap.delete(searchHistoryId.toString())
  }
}

// Enhanced get search results to include LinkedIn profiles
export const getSearchResults = async (req, res) => {
  try {
    const { searchId } = req.params
    const search = await SearchHistory.findById(searchId)
    if (!search) {
      return res.status(404).json({ success: false, error: "Search not found" })
    }

    res.status(200).json({
      success: true,
      results: search.results,
      linkedinProfiles: search.linkedinProfiles || [],
      searchDetails: search,
    })
  } catch (error) {
    console.error("❌ Error fetching search results:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

export const getSearchHistory = async (req, res) => {
  try {
    const { recruiterId } = req.params
    const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20)
    res.status(200).json({ success: true, searches })
  } catch (error) {
    console.error("❌ Error fetching search history:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

export const addCandidatesToWorkflow = async (req, res) => {
  try {
    const { jobId, candidates, recruiterId } = req.body
    if (!jobId || !candidates || !Array.isArray(candidates)) {
      return res.status(400).json({ success: false, error: "Invalid request data" })
    }

    const job = await JobDescription.findById(jobId)
    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" })
    }

    const savedResumes = []
    for (const candidate of candidates) {
      const resumeData = {
        candidateName: candidate.candidateName,
        email: candidate.email,
        mobile: candidate.mobile,
        jobTitle: jobId,
        companyId: job.companyId,
        companyName: candidate.currentCompany,
        resumeLink: candidate.sourceInfo?.profileUrl,
        linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
        matchingScoreDetails: candidate.matchingScoreDetails,
        analysis: {
          skills: {
            candidateSkills: candidate.skills || [],
            matched: candidate.analysis?.skills?.matched || [],
            notMatched: candidate.analysis?.skills?.notMatched || [],
          },
          experience: {
            relevantExperience:
              candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
            yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
          },
          education: {
            highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
            relevantCourses: candidate.analysis?.education?.relevantCourses || [],
          },
          projects: candidate.analysis?.projects || candidate.projects || [],
          recommendation: candidate.analysis?.recommendation || candidate.recommendation,
          comments: candidate.analysis?.comments || candidate.comment,
          additionalNotes: candidate.analysis?.additionalNotes || "",
        },
        summary: candidate.summary,
        candidateStatus: "AI Sourced",
        aiSourced: true,
        sourceInfo: candidate.sourceInfo,
        created_at: new Date(),
      }

      const resume = new Resume(resumeData)
      await resume.save()
      savedResumes.push(resume)
    }

    const notification = new Notification({
      message: `✅ ${candidates.length} candidates successfully added to workflow for ${job.context}`,
      recipientId: recruiterId,
      jobId: jobId,
    })
    await notification.save()

    res.status(200).json({
      success: true,
      message: `🎉 ${savedResumes.length} candidates successfully added to workflow.`,
    })
  } catch (error) {
    console.error("❌ Error adding candidates to workflow:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

export async function deleteSearchHistoryItem(req, res) {
  const { searchId } = req.params
  const { recruiterId } = req.body

  try {
    if (!mongoose.Types.ObjectId.isValid(searchId)) {
      return res.status(400).json({ success: false, error: "Invalid search ID" })
    }

    if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
      return res.status(400).json({ success: false, error: "Invalid recruiter ID" })
    }

    const search = await SearchHistory.findOneAndDelete({
      _id: searchId,
      recruiterId: recruiterId,
    })

    if (!search) {
      return res.status(404).json({
        success: false,
        error: "Search history item not found",
      })
    }

    return res.status(200).json({
      success: true,
      message: "Search history item deleted successfully",
    })
  } catch (error) {
    console.error("❌ Error deleting search history item:", error.message)
    return res.status(500).json({ success: false, error: "Server error" })
  }
}

async function analyzeJobAndDeterminePlatforms(jobDescription, searchSettings) {
  try {
    const analysis = await analyzeJobForPlatforms(jobDescription, searchSettings)
    return analysis
  } catch (error) {
    console.error("❌ Error analyzing job for platforms:", error.message)
    return null
  }
}



// -------------- before extension added working code ----------------
// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Resume from "../../model/resumeModel.js"
// import Notification from "../../model/NotificationModal.js"
// import { io } from "../../index.js"
// import mongoose from "mongoose"
// // import { analyzeJobForPlatforms as analyzeJobAndDeterminePlatforms } from "./headhunter-controller-enhanced.js"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // Global search control map
// const searchControlMap = new Map()

// // --- ENHANCED SCHEMAS ---
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { type: String, enum: ["pending", "in_progress", "completed", "failed", "stopped"], default: "pending" },
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   results: [
//     {
//       candidateName: String,
//       email: String,
//       mobile: mongoose.Schema.Types.Mixed,
//       jobTitle: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "JobDescription",
//       },
//       companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//       currentCompany: String,
//       location: String,
//       skills: [String],
//       experience: String,
//       summary: String,
//       candidateStatus: String,
//       matchingScoreDetails: {
//         skillsMatch: Number,
//         experienceMatch: Number,
//         educationMatch: Number,
//         overallMatch: Number,
//       },
//       analysis: {
//         skills: {
//           candidateSkills: [String],
//           matched: [String],
//           notMatched: [String],
//         },
//         experience: {
//           relevantExperience: String,
//           yearsOfExperience: String,
//         },
//         education: {
//           highestDegree: String,
//           relevantCourses: [String],
//         },
//         projects: [String],
//         recommendation: String,
//         comments: String,
//         additionalNotes: String,
//       },
//       comment: String,
//       recommendation: {
//         type: String,
//         enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//       },
//       aiSourced: Boolean,
//       sourceInfo: {
//         platform: String,
//         profileUrl: String,
//         linkedinProfileUrl: String,
//         githubProfileUrl: String,
//         portfolioUrl: String,
//         dribbbleUrl: String,
//         behanceUrl: String,
//         mediumUrl: String,
//         twitterUrl: String,
//         personalWebsite: String,
//         sourcedAt: Date,
//         sourcedBy: mongoose.Schema.Types.ObjectId,
//         aiModel: String,
//         hasEmail: Boolean,
//         hasPhone: Boolean,
//       },
//     },
//   ],
//   // NEW: LinkedIn Profile Suggestions
//   linkedinProfiles: [
//     {
//       profileUrl: String,
//       candidateName: String, // Extracted from URL or profile title
//       profileTitle: String, // Job title if available
//       location: String, // Location if available
//       extractionStatus: {
//         type: String,
//         enum: ["success", "failed", "rate_limited", "blocked"],
//         default: "failed",
//       },
//       errorCode: Number, // HTTP error code
//       lastAttempted: { type: Date, default: Date.now },
//       retryCount: { type: Number, default: 0 },
//     },
//   ],
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
//   stoppedAt: Date, // NEW: When search was manually stopped
//   stoppedBy: mongoose.Schema.Types.ObjectId, // NEW: Who stopped the search
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // --- UTILITY FUNCTIONS ---
// function cleanJsonResponse(responseText) {
//   const match = responseText.match(/```json([\s\S]*?)```/)
//   const cleanText = match ? match[1] : responseText
//   return cleanText
//     .replace(/```json\n|\n```/g, "")
//     .replace(/```/g, "")
//     .trim()
// }

// function isValidJson(str) {
//   try {
//     JSON.parse(str)
//     return true
//   } catch {
//     return false
//   }
// }

// // Enhanced progress emitter with stop control
// function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "", canStop = true) {
//   const progressData = {
//     searchId,
//     status,
//     progress: Math.min(Math.max(progress, 0), 100),
//     candidatesFound,
//     platform,
//     timestamp: new Date().toISOString(),
//     canStop, // NEW: Whether search can be stopped at this point
//   }
//   console.log(`Progress Update [${searchId}]: ${progress}% - ${status} - ${candidatesFound} candidates`)
//   io.emit("searchProgress", progressData)
// }

// // NEW: Check if search should be stopped
// function shouldStopSearch(searchId) {
//   const control = searchControlMap.get(searchId.toString())
//   return control?.shouldStop || false
// }

// // NEW: Stop search function
// export const stopSearch = async (req, res) => {
//   try {
//     const { searchId, recruiterId } = req.body

//     if (!searchId || !recruiterId) {
//       return res.status(400).json({
//         success: false,
//         error: "Search ID and recruiter ID are required",
//       })
//     }

//     // Set stop flag
//     searchControlMap.set(searchId.toString(), { shouldStop: true, stoppedBy: recruiterId })

//     // Update search history
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       stoppedAt: new Date(),
//       stoppedBy: recruiterId,
//     })

//     console.log(`🛑 Search ${searchId} stop requested by ${recruiterId}`)

//     res.status(200).json({
//       success: true,
//       message: "Search stop requested. Processing current candidates...",
//     })

//     // Emit stop notification
//     io.emit("searchStopping", {
//       searchId,
//       message: "Search stopping... Processing current candidates.",
//     })
//   } catch (error) {
//     console.error("❌ Error stopping search:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // NEW: Extract candidate name from LinkedIn URL
// function extractNameFromLinkedInUrl(url) {
//   try {
//     const urlParts = url.split("/")
//     const profileId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2]

//     // Convert profile ID to readable name (basic conversion)
//     return (
//       profileId
//         .replace(/-/g, " ")
//         .replace(/\d+/g, "")
//         .trim()
//         .split(" ")
//         .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
//         .join(" ") || "LinkedIn Profile"
//     )
//   } catch (error) {
//     return "LinkedIn Profile"
//   }
// }

// // NEW: Save LinkedIn profile to search history
// async function saveLinkedInProfile(searchId, profileData) {
//   try {
//     await SearchHistory.findByIdAndUpdate(
//       searchId,
//       {
//         $push: {
//           linkedinProfiles: profileData,
//         },
//       },
//       { new: true },
//     )
//   } catch (error) {
//     console.error("❌ Error saving LinkedIn profile:", error.message)
//   }
// }

// // NEW: Enhanced LinkedIn profile extraction with fallback saving
// async function extractLinkedInProfileWithFallback(url, searchId, platform = "linkedin") {
//   try {
//     console.log(`🔍 Extracting from: ${url}`)

//     const { data } = await axios.get(url, {
//       timeout: 25000,
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//         "Accept-Language": "en-US,en;q=0.5",
//         Connection: "keep-alive",
//         "Accept-Encoding": "gzip, deflate, br",
//       },
//     })

//     const $ = load(data)
//     $("script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner, .popup, .modal, .overlay").remove()

//     const text = $("body").text().replace(/\s+/g, " ").trim()

//     if (text.length < 300) {
//       console.log(`❌ Insufficient content from ${url} (${text.length} chars)`)
//       throw new Error("Insufficient content")
//     }

//     console.log(`📄 Extracted ${text.length} characters from ${url}`)
//     const candidate = await extractCandidateWithAI(text, url, platform)

//     if (candidate && candidate.candidateName) {
//       console.log(`✅ Successfully extracted candidate: ${candidate.candidateName}`)

//       // Save as successful LinkedIn profile
//       await saveLinkedInProfile(searchId, {
//         profileUrl: url,
//         candidateName: candidate.candidateName,
//         profileTitle: candidate.currentJobTitle,
//         location: candidate.location,
//         extractionStatus: "success",
//       })

//       return candidate
//     } else {
//       throw new Error("No valid candidate data extracted")
//     }
//   } catch (error) {
//     console.error(`❌ Error extracting from ${url}:`, error.message)

//     // Determine error type
//     let extractionStatus = "failed"
//     let errorCode = 0

//     if (error.response) {
//       errorCode = error.response.status
//       if (errorCode === 429) {
//         extractionStatus = "rate_limited"
//       } else if (errorCode === 999 || errorCode === 403) {
//         extractionStatus = "blocked"
//       }
//     }

//     // Save as failed LinkedIn profile with extracted name
//     const candidateName = extractNameFromLinkedInUrl(url)

//     await saveLinkedInProfile(searchId, {
//       profileUrl: url,
//       candidateName,
//       extractionStatus,
//       errorCode,
//     })

//     console.log(`💾 Saved LinkedIn profile suggestion: ${candidateName} (${extractionStatus})`)
//     return null
//   }
// }

// // Analyze job for optimal platform selection
// export const analyzeJobForPlatforms = async (jobDescription, searchSettings) => {
//   const prompt = `
//     You are an expert headhunter and recruitment strategist with 15+ years of experience. Analyze this job posting comprehensively and determine the optimal platforms and search strategies.

//     **Job Details:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Available Platforms:**
//     - linkedin: Professional networking, all industries, executives, managers
//     - github: Developers, engineers, technical roles, open source contributors
//     - google: General web search, resumes, portfolios, industry-specific sites, personal websites
//     - dribbble: UI/UX designers, visual designers, product designers, mobile app designers
//     - behance: Creative professionals, graphic designers, artists, brand designers, photographers

//     **Your Expert Analysis Task:**
//     1. Carefully analyze the job requirements to determine the primary job category and industry
//     2. Identify the most relevant platforms based on role type and industry
//     3. Suggest specialized websites or platforms that might contain relevant candidates
//     4. Determine search priorities based on candidate availability and platform relevance
//     5. Consider alternative job titles and industry-specific terminology

//     **Professional Categories to Consider:**
//     - Technology/Engineering: Software engineers, DevOps, data scientists, AI/ML engineers, full-stack developers, mobile developers, system architects
//     - Design/Creative: UI/UX designers, product designers, graphic designers, artists, brand managers, creative directors, illustrators, photographers
//     - Legal: Corporate lawyers, litigation attorneys, paralegals, compliance officers, legal counsel
//     - Healthcare: Physicians, nurses, medical specialists, healthcare administrators, clinical researchers
//     - Finance: Financial analysts, investment bankers, accountants, financial advisors, risk managers, actuaries
//     - Marketing/Sales: Digital marketers, sales managers, content creators, SEO specialists, social media managers, PR professionals
//     - HR/Management: HR directors, talent acquisition specialists, organizational development, executive recruiters
//     - Education: Professors, teachers, instructional designers, education technology specialists
//     - Operations: Supply chain managers, logistics coordinators, project managers, operations analysts
//     - Consulting: Management consultants, strategy advisors, business analysts, process improvement specialists

//     **Platform Selection Criteria:**
//     - HIGH priority: Primary platforms where 70%+ of qualified candidates are likely found
//     - MEDIUM priority: Secondary platforms with 30-50% candidate likelihood
//     - LOW priority: Niche platforms with <30% but highly qualified candidates

//     Return ONLY a valid JSON object with comprehensive analysis:
//     {
//       "jobCategory": "Primary category (be very specific)",
//       "jobSubcategory": "Detailed subcategory with specialization",
//       "seniorityLevel": "Entry/Mid/Senior/Executive level analysis",
//       "recommendedPlatforms": [
//         {
//           "platform": "platform_name",
//           "priority": "high|medium|low",
//           "reason": "Detailed explanation of why this platform is optimal for this role",
//           "expectedCandidateVolume": "high|medium|low"
//         }
//       ],
//       "specializedSites": [
//         {
//           "site": "domain.com or site description",
//           "description": "What type of professionals and why relevant",
//           "searchApproach": "How to search this platform effectively"
//         }
//       ],
//       "searchKeywords": ["highly relevant keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
//       "alternativeJobTitles": ["alternative title1", "title2", "title3", "title4"],
//       "industrySpecificTerms": ["term1", "term2", "term3", "term4"],
//       "skillSynonyms": {
//         "primary_skill": ["synonym1", "synonym2"],
//         "secondary_skill": ["synonym1", "synonym2"]
//       },
//       "targetCompanyTypes": ["startup", "enterprise", "agency", "consulting"],
//       "searchComplexity": "simple|moderate|complex"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1500,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     })

//     const analysis = JSON.parse(response.choices[0].message.content)
//     console.log("🔍 Enhanced job analysis completed:", {
//       category: analysis.jobCategory,
//       subcategory: analysis.jobSubcategory,
//       platforms: analysis.recommendedPlatforms?.length,
//       complexity: analysis.searchComplexity,
//     })
//     return analysis
//   } catch (error) {
//     console.error("❌ Error analyzing job:", error.message)
//     return null
//   }
// }

// // Get cost estimate function
// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount = 10 } = req.query
//     const estimate = estimateSearchCost(Number.parseInt(candidateCount))
//     res.status(200).json({ success: true, estimate })
//   } catch (error) {
//     console.error("❌ Error calculating cost estimate:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Enhanced search query generation
// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 15 highly effective, diverse search queries to find top-tier candidates.

//     **Job Information:**
//     - Position: ${jobDescription.context}
//     - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
//     - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
//     - Seniority: ${jobAnalysis?.seniorityLevel || searchSettings.experienceLevel}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Alternative Titles: ${jobAnalysis?.alternativeJobTitles?.join(", ") || ""}
//     - Industry Terms: ${jobAnalysis?.industrySpecificTerms?.join(", ") || ""}
//     - Skill Synonyms: ${JSON.stringify(jobAnalysis?.skillSynonyms || {})}
//     - Target Companies: ${jobAnalysis?.targetCompanyTypes?.join(", ") || ""}

//     **Platform to Target:** ${platform}

//     **Platform-Specific Advanced Instructions:**
//     ${getPlatformInstructions(platform, jobAnalysis)}

//     **Advanced Query Generation Strategy:**
//     1. **Diversity is Key**: Create queries with different approaches - skills-based, title-based, company-based, project-based, certification-based
//     2. **Boolean Mastery**: Use advanced operators: AND, OR, NOT, parentheses for grouping, quotes for exact phrases
//     3. **Synonym Integration**: Include skill synonyms and alternative terminology
//     4. **Experience Targeting**: Tailor queries to the required seniority level
//     5. **Geographic Precision**: If location specified, use city, state, metro area, and remote variations
//     6. **Company Intelligence**: Target relevant company types and industry leaders
//     7. **Certification Focus**: Include relevant certifications and credentials
//     8. **Project-Based Search**: Look for specific project types and achievements

//     **Query Categories to Generate (15 total):**
//     - 4 Skill-focused queries (core skills + combinations)
//     - 3 Title-focused queries (exact titles + alternatives)  
//     - 2 Company-focused queries (target company types)
//     - 2 Location-focused queries (if applicable)
//     - 2 Experience-focused queries (seniority level)
//     - 1 Certification-focused query
//     - 1 Project-focused query

//     **Quality Standards:**
//     - Each query should be unique and approach candidate finding differently
//     - Queries should be 10-50 words long
//     - Focus on finding individual profiles, not company pages
//     - Include contact discovery elements where appropriate
//     - Balance broad reach with specific targeting

//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8", "query9", "query10", "query11", "query12", "query13", "query14", "query15"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.6,
//       response_format: { type: "json_object" },
//     })

//     const content = JSON.parse(response.choices[0].message.content)
//     const queries = content.queries || []
//     console.log(`🔍 Generated ${queries.length} enhanced queries for ${platform}`)
//     return queries.slice(0, 15) // Ensure we get exactly 15 queries
//   } catch (error) {
//     console.error("❌ Error generating search queries:", error.message)
//     return []
//   }
// }

// // Platform instructions helper
// function getPlatformInstructions(platform, jobAnalysis) {
//   const category = jobAnalysis?.jobCategory?.toLowerCase() || ""
//   const seniority = jobAnalysis?.seniorityLevel?.toLowerCase() || ""

//   switch (platform) {
//     case "linkedin":
//       return `
//         **LinkedIn Advanced Search Strategy:**
//         LinkedIn is the primary professional platform. Create sophisticated queries using:
        
//         **Boolean Search Mastery:**
//         - Use quotes for exact phrases: "Senior Software Engineer"
//         - Use parentheses for grouping: (Java OR Python OR JavaScript)
//         - Use AND/OR/NOT operators strategically
//         - Target current positions and past experience
        
//         **Targeting Strategies:**
//         - Seniority-based: "${seniority}" level professionals
//         - Company-based: Current/past employees of target companies
//         - Skills-based: Multiple skill combinations with AND/OR
//         - Industry-based: Specific industry experience
//         - Location-based: Current location + willing to relocate
//         - Education-based: Relevant degrees and universities
        
//         **Examples by Category:**
//         - Tech: "Senior Software Engineer" AND (Python OR Java) AND "San Francisco"
//         - Design: "UI/UX Designer" AND (Figma OR Sketch) AND "portfolio"
//         - Legal: ("Corporate Lawyer" OR "Legal Counsel") AND "Securities Law"
//         - Finance: "Investment Banker" AND "Mergers Acquisitions" AND CFA
//         - Healthcare: ("Physician" OR "Doctor") AND "Cardiology" AND "Board Certified"
        
//         **Contact Discovery:**
//         - Include "contact" OR "email" in some queries
//         - Target profiles with external contact information
//         - Look for profiles mentioning "open to opportunities"
//       `

//     case "github":
//       return `
//         **GitHub Advanced Search for Technical Talent:**
//         GitHub is perfect for technical roles. Create queries that target:
        
//         **Technical Depth:**
//         - Programming languages: language:Python language:JavaScript
//         - Framework expertise: React Vue.js Django Flask
//         - Location targeting: location:"San Francisco" location:"Remote"
//         - Activity level: followers:>100 repos:>10
//         - Recent activity: pushed:>2024-01-01
        
//         **Profile Intelligence:**
//         - Bio-based searches: Target user bios with role keywords
//         - Repository analysis: Specific project types and technologies
//         - Contribution patterns: Active contributors and maintainers
//         - Company affiliations: Current/past company mentions
        
//         **Examples:**
//         - "Senior Developer" location:"New York" language:Python
//         - "Machine Learning" "AI" followers:>50 repos:>5
//         - "Full Stack" React Node.js location:Remote
//         - "DevOps" Docker Kubernetes AWS location:"San Francisco"
        
//         **Only use for technical roles requiring programming skills.**
//       `

//     case "dribbble":
//       return `
//         **Dribbble Enhanced Search for Design Professionals:**
//         Dribbble is the premier platform for visual designers. Create targeted queries for:
        
//         **Design Specializations:**
//         - UI/UX Design: "UI Designer" "UX Designer" "Product Designer"
//         - Visual Design: "Graphic Designer" "Brand Designer" "Visual Designer"
//         - Mobile Design: "Mobile App Design" "iOS Design" "Android Design"
//         - Web Design: "Web Designer" "Landing Page" "Website Design"
        
//         **Skill-Based Targeting:**
//         - Tools: Figma Sketch Adobe Photoshop Illustrator
//         - Specialties: "Logo Design" "Branding" "Icon Design" "Illustration"
//         - Industries: "SaaS Design" "E-commerce Design" "Healthcare Design"
//         - Experience: "Senior Designer" "Lead Designer" "Design Director"
        
//         **Portfolio Intelligence:**
//         - Project types: "Dashboard Design" "Mobile App" "Website Redesign"
//         - Client work: "Client Work" "Freelance" "Agency Work"
//         - Awards: "Award Winning" "Featured" "Popular"
//         - Contact info: "Available for Work" "Contact" "Hire Me"
        
//         **Location & Availability:**
//         - Geographic: Location-specific searches if needed
//         - Availability: "Available" "Freelance" "Full-time" "Remote"
        
//         **Examples:**
//         - "UI Designer" Figma "San Francisco" "Available for Work"
//         - "Brand Designer" "Logo Design" Adobe Illustrator portfolio
//         - "UX Designer" "Mobile App" "Product Design" "Remote"
//         - "Senior Designer" "Dashboard Design" "SaaS" experience
        
//         **Only use for design and creative roles.**
//       `

//     case "behance":
//       return `
//         **Behance Advanced Search for Creative Professionals:**
//         Behance showcases creative portfolios. Create queries targeting:
        
//         **Creative Categories:**
//         - Graphic Design: "Graphic Designer" "Visual Identity" "Brand Design"
//         - Web Design: "Web Design" "Digital Design" "Interface Design"
//         - Photography: "Photographer" "Commercial Photography" "Product Photography"
//         - Illustration: "Illustrator" "Digital Art" "Character Design"
//         - Motion Graphics: "Motion Designer" "Animation" "Video Graphics"
        
//         **Professional Targeting:**
//         - Experience Level: "Senior" "Lead" "Creative Director" "Art Director"
//         - Industry Focus: "Advertising" "Marketing" "Publishing" "Entertainment"
//         - Software Skills: "Adobe Creative Suite" "After Effects" "Cinema 4D"
//         - Specializations: "Print Design" "Digital Marketing" "Package Design"
        
//         **Portfolio Analysis:**
//         - Project Types: "Campaign Design" "Brand Identity" "Website Design"
//         - Client Work: "Client Projects" "Commercial Work" "Published Work"
//         - Recognition: "Award Winning" "Featured" "Curated"
//         - Availability: "Available for Hire" "Freelance" "Contact"
        
//         **Contact Discovery:**
//         - Include "contact" "email" "hire" "available" in searches
//         - Look for external portfolio links and social media
//         - Target profiles with comprehensive contact information
        
//         **Examples:**
//         - "Brand Designer" "Visual Identity" "Available for Hire" Adobe
//         - "Creative Director" "Advertising" "Campaign Design" experience
//         - "Motion Designer" "After Effects" "Commercial Work" portfolio
//         - "Art Director" "Digital Marketing" "Creative Strategy" senior
        
//         **Only use for creative and artistic roles.**
//       `

//     case "google":
//       return `
//         **Google Advanced Search for Professional Discovery:**
//         Google provides access to resumes, portfolios, and professional websites across the internet.
        
//         **Search Strategies:**
//         - Resume Targeting: filetype:pdf "resume" OR "CV" + role keywords
//         - Portfolio Discovery: "portfolio" "work samples" "case studies"
//         - Professional Websites: "about me" "professional" personal websites
//         - Industry Directories: site:specific-industry-sites.com
//         - Conference Speakers: "speaker" "conference" "presentation"
//         - Company Alumni: "formerly at" "ex-" company names
        
//         **Advanced Operators:**
//         - Site-specific: site:company.com "software engineer"
//         - File types: filetype:pdf "data scientist resume"
//         - Exact phrases: "Senior Product Manager" "available"
//         - Exclusions: -jobs -hiring (avoid job postings)
//         - Time filters: Use recent content for active professionals
        
//         **Professional Platforms Integration:**
//         - site:medium.com technical articles + author profiles
//         - site:stackoverflow.com expert contributors
//         - site:kaggle.com data science competitions
//         - site:angel.co startup professionals
//         - Industry-specific platforms and communities
        
//         **Examples:**
//         - "software engineer" "San Francisco" filetype:pdf resume Python
//         - "marketing director" portfolio "case studies" "contact"
//         - site:medium.com "machine learning" author profile
//         - "UX designer" "portfolio" "available for hire" -jobs
//         - "financial analyst" "CFA" resume filetype:pdf "New York"
//       `

//     default:
//       return `Create platform-appropriate professional search queries with advanced targeting techniques.`
//   }
// }

// // Enhanced candidate extraction with AI
// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     You are an expert talent sourcer specializing in extracting professional information from ${platform} profiles. Your task is to comprehensively analyze this content and extract detailed candidate information with absolute accuracy.

//     **CRITICAL EXTRACTION REQUIREMENTS:**
//     1. **ZERO FABRICATION**: Only extract information explicitly present in the text
//     2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
//     3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional links
//     4. **EXACT TRANSCRIPTION**: Copy information exactly as written
//     5. **PLATFORM EXPERTISE**: Apply ${platform}-specific extraction intelligence

//     **Content Source:** ${url} (Platform: ${platform})
//     **Platform Context:** ${getPlatformExtractionContext(platform)}

//     **Text Content:**
//     ---
//     ${pageText.substring(0, 12000)}
//     ---

//     **REQUIRED EXTRACTION FIELDS:**
//     Extract the following information ONLY if clearly and explicitly present:

//     **Personal Information:**
//     - Full name (complete name as displayed)
//     - Email address (exact format, multiple if present)  
//     - Phone number (exact format with country code if shown)
//     - Current location (city, state, country as specified)

//     **Professional Information:**
//     - Current job title (exact title as stated)
//     - Current company (exact company name)
//     - Professional summary/bio (comprehensive if available)
//     - Years of experience (only if explicitly stated)
//     - Industry specialization

//     **Skills & Expertise:**
//     - Technical skills (programming languages, tools, software)
//     - Professional skills (management, communication, etc.)
//     - Certifications and credentials
//     - Specializations and expertise areas

//     **Work History:**
//     - Previous companies and roles
//     - Notable projects and achievements
//     - Portfolio work and case studies
//     - Client work and collaborations

//     **Education:**
//     - Degrees and institutions
//     - Relevant coursework and certifications
//     - Professional development

//     **Digital Presence:**
//     - All social media and professional links found
//     - Portfolio websites and personal sites
//     - Professional platform profiles
//     - Contact methods and availability status

//     **${platform}-Specific Intelligence:**
//     ${getPlatformSpecificExtractionInstructions(platform)}

//     **OUTPUT FORMAT:**
//     Return ONLY this JSON structure with extracted data or null values:
//     {
//       "candidateName": "Full name exactly as written or null",
//       "email": "primary.email@domain.com or null",
//       "alternateEmails": ["additional@emails.com"] or [],
//       "mobile": "exact phone number with formatting or null",
//       "currentJobTitle": "Exact current title or null", 
//       "currentCompany": "Exact company name or null",
//       "location": "Exact location string or null",
//       "skills": ["actual", "skills", "extracted"] or [],
//       "technicalSkills": ["programming", "tools", "software"] or [],
//       "summary": "Professional summary/bio from profile or null",
//       "experience": "Work experience description or null",
//       "yearsOfExperience": "X years (only if explicitly stated) or null",
//       "education": "Education information or null",
//       "certifications": ["actual", "certifications"] or [],
//       "projects": ["actual", "projects", "portfolio pieces"] or [],
//       "achievements": ["awards", "recognition", "notable work"] or [],
//       "industries": ["industry", "specializations"] or [],
//       "availabilityStatus": "availability status if mentioned or null",
//       "sourceInfo": {
//         "profileUrl": "${url}",
//         "linkedinProfileUrl": "found LinkedIn URL or null",
//         "githubProfileUrl": "found GitHub URL or null", 
//         "portfolioUrl": "found portfolio URL or null",
//         "dribbbleUrl": "found Dribbble URL or null",
//         "behanceUrl": "found Behance URL or null",
//         "twitterUrl": "found Twitter URL or null",
//         "mediumUrl": "found Medium URL or null",
//         "personalWebsite": "found personal website or null",
//         "contactMethods": ["all", "contact", "methods", "found"] or []
//       }
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 3000,
//       temperature: 0.05, // Very low temperature for accuracy
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)

//     // Validate that we have at least a name
//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from ${url}`)
//       return null
//     }

//     // Merge technical skills into main skills array
//     const allSkills = [...(result.skills || []), ...(result.technicalSkills || [])]

//     return {
//       id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       candidateName: result.candidateName,
//       email: result.email,
//       alternateEmails: result.alternateEmails || [],
//       mobile: result.mobile,
//       currentJobTitle: result.currentJobTitle,
//       currentCompany: result.currentCompany,
//       location: result.location,
//       skills: [...new Set(allSkills)], // Remove duplicates
//       summary: result.summary,
//       experience: result.experience,
//       yearsOfExperience: result.yearsOfExperience,
//       education: result.education,
//       certifications: result.certifications || [],
//       projects: result.projects || [],
//       achievements: result.achievements || [],
//       industries: result.industries || [],
//       availabilityStatus: result.availabilityStatus,
//       sourceInfo: {
//         platform,
//         profileUrl: url,
//         linkedinProfileUrl: result.sourceInfo?.linkedinProfileUrl,
//         githubProfileUrl: result.sourceInfo?.githubProfileUrl,
//         portfolioUrl: result.sourceInfo?.portfolioUrl,
//         dribbbleUrl: result.sourceInfo?.dribbbleUrl,
//         behanceUrl: result.sourceInfo?.behanceUrl,
//         twitterUrl: result.sourceInfo?.twitterUrl,
//         mediumUrl: result.sourceInfo?.mediumUrl,
//         personalWebsite: result.sourceInfo?.personalWebsite,
//         contactMethods: result.sourceInfo?.contactMethods || [],
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//       },
//       matchScore: 0,
//     }
//   } catch (error) {
//     console.error(`❌ Error extracting candidate from ${url}:`, error.message)
//     return null
//   }
// }

// // Platform extraction context helpers
// function getPlatformExtractionContext(platform) {
//   switch (platform) {
//     case "linkedin":
//       return "LinkedIn professional profile with work history, skills, education, and connections"
//     case "github":
//       return "GitHub developer profile with repositories, contributions, and technical projects"
//     case "dribbble":
//       return "Dribbble design portfolio with creative work, projects, and design skills"
//     case "behance":
//       return "Behance creative portfolio with artistic work, brand projects, and creative expertise"
//     case "google":
//       return "Web content including resumes, portfolios, personal websites, or professional profiles"
//     default:
//       return "Professional web content with career and contact information"
//   }
// }

// function getPlatformSpecificExtractionInstructions(platform) {
//   switch (platform) {
//     case "dribbble":
//       return `
//         **Dribbble-Specific Extraction:**
//         - Extract design software proficiency (Figma, Sketch, Adobe Creative Suite)
//         - Identify design specializations (UI/UX, branding, illustration, web design)
//         - Note client work vs. personal projects
//         - Extract design process information and methodologies
//         - Look for design awards, features, or recognition
//         - Identify collaboration experience and team projects
//         - Note availability for freelance/full-time work
//         - Extract creative brief understanding and problem-solving approaches
//       `
//     case "behance":
//       return `
//         **Behance-Specific Extraction:**
//         - Identify creative disciplines (graphic design, photography, motion graphics)
//         - Extract brand work and campaign experience
//         - Note commercial vs. personal creative projects
//         - Identify creative software expertise and workflow
//         - Look for published work and client testimonials
//         - Extract creative education and artistic background
//         - Note creative direction and conceptual thinking skills
//         - Identify cross-media experience (print, digital, video)
//       `
//     case "github":
//       return `
//         **GitHub-Specific Extraction:**
//         - Extract programming languages and frameworks from repositories
//         - Identify contribution patterns and open source involvement
//         - Note repository ownership vs. contributions to others' projects
//         - Extract README documentation and project descriptions
//         - Identify technical architecture and system design experience
//         - Look for code quality, testing, and documentation practices
//         - Note collaboration through pull requests and issues
//         - Extract technical leadership through repository management
//       `
//     case "linkedin":
//       return `
//         **LinkedIn-Specific Extraction:**
//         - Extract complete work history with date ranges
//         - Identify professional accomplishments and metrics
//         - Note recommendations and endorsements context
//         - Extract volunteer work and professional associations
//         - Identify leadership roles and team management experience
//         - Look for industry thought leadership through posts/articles
//         - Note professional development and continuous learning
//         - Extract networking strength through connections and activity
//       `
//     default:
//       return "Extract comprehensive professional information relevant to the platform context."
//   }
// }

// // Enhanced candidate evaluation
// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   // Only evaluate if we have sufficient candidate data
//   if (!candidate.candidateName) {
//     console.log("⚠️ Skipping evaluation - insufficient candidate data")
//     return null
//   }

//   const prompt = `
//     You are a senior technical recruiter and talent assessment expert with 20+ years of experience. Conduct a comprehensive evaluation of this candidate's fit for the position using rigorous assessment criteria.

//     **Job Requirements:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Candidate Profile:**
//     - Name: ${candidate.candidateName}
//     - Current Title: ${candidate.currentJobTitle || "Not specified"}
//     - Company: ${candidate.currentCompany || "Not specified"}  
//     - Location: ${candidate.location || "Not specified"}
//     - Skills: ${candidate.skills?.join(", ") || "Not specified"}
//     - Technical Skills: ${candidate.technicalSkills?.join(", ") || "Not specified"}
//     - Experience: ${candidate.yearsOfExperience || "Not specified"}
//     - Summary: ${candidate.summary || "Not available"}
//     - Education: ${candidate.education || "Not specified"}
//     - Certifications: ${candidate.certifications?.join(", ") || "Not specified"}
//     - Projects: ${candidate.projects?.join(", ") || "Not specified"}
//     - Achievements: ${candidate.achievements?.join(", ") || "Not specified"}
//     - Industries: ${candidate.industries?.join(", ") || "Not specified"}

//     **COMPREHENSIVE EVALUATION CRITERIA:**

//     **1. Skills Assessment (0-100):**
//     - Match required technical skills against candidate skills
//     - Consider skill depth and breadth
//     - Evaluate transferable skills and learning ability
//     - Account for emerging technologies and future requirements

//     **2. Experience Assessment (0-100):**
//     - Evaluate years of experience against requirements
//     - Assess relevance of previous roles and responsibilities
//     - Consider industry experience and domain knowledge
//     - Evaluate progression and career trajectory

//     **3. Education & Certifications Assessment (0-100):**
//     - Match educational background to requirements
//     - Evaluate relevant certifications and continuous learning
//     - Consider alternative education and self-directed learning
//     - Assess specialized training and professional development

//     **4. Cultural & Role Fit Assessment (0-100):**
//     - Evaluate role responsibilities alignment
//     - Consider company size and culture fit indicators
//     - Assess leadership potential and growth trajectory
//     - Evaluate communication and collaboration indicators

//     **ASSESSMENT GUIDELINES:**
//     - Be honest and realistic in scoring
//     - Consider both current capabilities and potential
//     - Account for missing information in your analysis
//     - Provide actionable insights for hiring decisions
//     - Consider market scarcity and candidate uniqueness

//     **SCORING METHODOLOGY:**
//     - 90-100: Exceptional match, rare find, immediate hire
//     - 80-89: Strong match, highly recommended
//     - 70-79: Good match, recommended with considerations
//     - 60-69: Moderate match, consider with reservations
//     - 50-59: Weak match, significant gaps exist
//     - Below 50: Poor match, not recommended

//     Return ONLY this JSON structure with thorough analysis:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100, detailed skills comparison),
//         "experienceMatch": number (0-100, experience relevance and depth),
//         "educationMatch": number (0-100, educational background relevance),
//         "culturalFitMatch": number (0-100, role and culture alignment),
//         "overallMatch": number (0-100, weighted comprehensive score)
//       },
//       "analysis": {
//         "skills": {
//           "candidateSkills": ["all", "candidate", "skills"],
//           "matched": ["skills", "that", "directly", "match"],
//           "notMatched": ["required", "skills", "missing"],
//           "transferableSkills": ["skills", "that", "could", "transfer"],
//           "skillGaps": ["critical", "gaps", "identified"],
//           "skillStrengths": ["standout", "skills", "and", "expertise"]
//         },
//         "experience": {
//           "relevantExperience": "detailed description of relevant experience or 'Limited information available'",
//           "yearsOfExperience": "exact years mentioned or 'Not specified'",
//           "careerProgression": "analysis of career growth and trajectory",
//           "industryExperience": "relevant industry background",
//           "roleRelevance": "how previous roles align with target position"
//         },
//         "education": {
//           "highestDegree": "actual degree or 'Not specified'",
//           "relevantCourses": ["relevant", "coursework"] or [],
//           "certifications": ["professional", "certifications"],
//           "continuousLearning": "evidence of ongoing professional development"
//         },
//         "projects": ["significant", "projects", "and", "achievements"],
//         "strengths": ["top", "candidate", "strengths"],
//         "concerns": ["potential", "concerns", "or", "risks"],
//         "recommendation": "detailed hiring recommendation with reasoning",
//         "comments": "comprehensive assessment including data gaps and assumptions",
//         "additionalNotes": "market insights, salary expectations, availability, unique value proposition"
//       },
//       "comment": "concise executive summary for hiring managers",
//       "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
//       "confidenceLevel": "High|Medium|Low (based on available information quality)",
//       "nextSteps": "recommended actions for recruitment process"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.1, // Low temperature for consistent evaluation
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)
//     console.log(`✅ Evaluated ${candidate.candidateName}: ${result.matchingScoreDetails?.overallMatch}/100`)
//     return result
//   } catch (error) {
//     console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, error.message)
//     return null
//   }
// }

// // Enhanced Google search with stop control
// async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
//   const candidates = new Map()
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!apiKey || !searchEngineId) {
//     console.warn("⚠️ Google Search API not configured. Skipping Google search.")
//     return []
//   }

//   const platform = siteFilter.includes("linkedin")
//     ? "linkedin"
//     : siteFilter.includes("github")
//       ? "github"
//       : siteFilter.includes("dribbble")
//         ? "dribbble"
//         : siteFilter.includes("behance")
//           ? "behance"
//           : "google"

//   let totalResults = 0
//   const maxResultsPerQuery = 10
//   const targetCandidates = Math.min(searchSettings.candidateCount * 3, 150)

//   console.log(`🔍 Starting enhanced Google search for ${platform} with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     // NEW: Check if search should be stopped
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search stopped by user request at query ${i + 1}`)
//       emitProgress(
//         searchId,
//         `🛑 Search stopped by user. Processing ${candidates.size} candidates found so far...`,
//         50,
//         candidates.size,
//         platform,
//         false,
//       )
//       break
//     }

//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim()
//       console.log(`🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`)

//       emitProgress(
//         searchId,
//         `Searching ${platform}: "${searchQuery.substring(0, 50)}..."`,
//         20 + (i / queries.length) * 25,
//         candidates.size,
//         platform,
//       )

//       const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
//         params: {
//           key: apiKey,
//           cx: searchEngineId,
//           q: searchQuery,
//           num: maxResultsPerQuery,
//           start: 1,
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`📊 Found ${response.data.items.length} results for query: ${searchQuery}`)

//         for (const item of response.data.items) {
//           // NEW: Check stop condition for each candidate
//           if (shouldStopSearch(searchId)) {
//             console.log(`🛑 Search stopped during candidate processing`)
//             break
//           }

//           if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
//             emitProgress(
//               searchId,
//               `Processing: ${item.title?.substring(0, 40)}...`,
//               22 + (i / queries.length) * 25,
//               candidates.size,
//               platform,
//             )

//             let candidate = null

//             // NEW: Use enhanced LinkedIn extraction for LinkedIn profiles
//             if (platform === "linkedin" && item.link.includes("linkedin.com/in/")) {
//               candidate = await extractLinkedInProfileWithFallback(item.link, searchId, platform)
//             } else {
//               candidate = await extractCandidateFromUrl(item.link, platform)
//             }

//             if (candidate && candidate.candidateName) {
//               candidates.set(item.link, candidate)
//               totalResults++
//               console.log(`✅ Extracted: ${candidate.candidateName} (${candidates.size} total)`)

//               emitProgress(
//                 searchId,
//                 `Found candidate: ${candidate.candidateName}`,
//                 25 + (i / queries.length) * 25,
//                 candidates.size,
//                 platform,
//               )

//               // NEW: Check if we've reached the target candidate count
//               if (candidates.size >= searchSettings.candidateCount) {
//                 console.log(`🎯 Reached target candidate count: ${searchSettings.candidateCount}`)
//                 emitProgress(
//                   searchId,
//                   `🎯 Target reached! Found ${candidates.size} candidates. Processing evaluations...`,
//                   50,
//                   candidates.size,
//                   platform,
//                   false,
//                 )
//                 break
//               }
//             } else {
//               console.log(`❌ Failed to extract candidate from: ${item.link}`)
//             }
//           }
//         }
//       }

//       // Respectful delay between requests
//       await new Promise((resolve) => setTimeout(resolve, 1200))
//     } catch (error) {
//       console.error(`❌ Search error for query "${query}":`, error.message)
//       if (error.response?.status === 429) {
//         console.log("⏳ Rate limited, waiting before retry...")
//         await new Promise((resolve) => setTimeout(resolve, 5000))
//       }
//     }
//   }

//   console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// // Extract candidate from URL
// async function extractCandidateFromUrl(url, platform) {
//   try {
//     console.log(`🔍 Extracting from: ${url}`)
//     const { data } = await axios.get(url, {
//       timeout: 25000,
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//         "Accept-Language": "en-US,en;q=0.5",
//         Connection: "keep-alive",
//         "Accept-Encoding": "gzip, deflate, br",
//       },
//     })

//     const $ = load(data)

//     // More comprehensive content cleaning
//     $("script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner, .popup, .modal, .overlay").remove()

//     const text = $("body").text().replace(/\s+/g, " ").trim()

//     if (text.length < 300) {
//       console.log(`❌ Insufficient content from ${url} (${text.length} chars)`)
//       return null
//     }

//     console.log(`📄 Extracted ${text.length} characters from ${url}`)
//     const candidate = await extractCandidateWithAI(text, url, platform)

//     if (candidate) {
//       console.log(`✅ Successfully extracted candidate: ${candidate.candidateName}`)
//     }

//     return candidate
//   } catch (error) {
//     console.error(`❌ Error extracting from ${url}:`, error.message)
//     return null
//   }
// }

// // LinkedIn search with enhanced fallback
// async function searchLinkedIn(queries, searchSettings, searchId) {
//   const apiKey = process.env.LINKEDIN_API_KEY
//   if (apiKey) {
//     console.log("🔑 LinkedIn API key found. Using API search.")
//     return await searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey)
//   } else {
//     console.log("🔍 No LinkedIn API key. Using Google search for LinkedIn profiles.")
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
//   }
// }

// async function searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey) {
//   console.log("🚀 --- Enhanced LinkedIn API Search ---")
//   const candidates = new Map()
//   const targetCandidates = Math.min(searchSettings.candidateCount * 2, 100)
//   const apiEndpoint = "https://nubela.co/proxycurl/api/v2/linkedin"

//   const linkedInUrls = new Set()
//   const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!googleApiKey || !searchEngineId) {
//     console.warn("⚠️ Google Search API not configured. Cannot find LinkedIn profiles to enrich.")
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
//   }

//   // Step 1: Find LinkedIn profile URLs using Google
//   for (const query of queries) {
//     if (linkedInUrls.size >= targetCandidates * 2) break

//     const searchQuery = `${query} site:linkedin.com/in/`
//     try {
//       const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
//         params: { key: googleApiKey, cx: searchEngineId, q: searchQuery, num: 10 },
//         timeout: 10000,
//       })

//       if (response.data.items) {
//         response.data.items.forEach((item) => {
//           if (item.link && item.link.includes("linkedin.com/in/")) {
//             linkedInUrls.add(item.link)
//           }
//         })
//       }
//     } catch (error) {
//       console.error(`❌ Error finding LinkedIn URLs with query "${query}":`, error.message)
//     }
//   }

//   console.log(`📊 Found ${linkedInUrls.size} LinkedIn profile URLs to enrich.`)

//   // Step 2: Enrich profiles using LinkedIn API
//   let processedCount = 0
//   for (const url of linkedInUrls) {
//     if (candidates.size >= targetCandidates) break

//     emitProgress(
//       searchId,
//       `Enriching LinkedIn profile ${processedCount + 1}/${linkedInUrls.size}...`,
//       50 + (processedCount / linkedInUrls.size) * 25,
//       candidates.size,
//       "linkedin-api",
//     )

//     try {
//       const response = await axios.get(apiEndpoint, {
//         headers: { Authorization: `Bearer ${apiKey}` },
//         params: {
//           url: url,
//           fallback_to_cache: "on-error",
//           use_cache: "if-present",
//           skills: "include",
//           inferred_salary: "include",
//           personal_email: "include",
//           personal_contact_number: "include",
//           twitter_profile_id: "include",
//           facebook_profile_id: "include",
//           github_profile_id: "include",
//           extra: "include",
//         },
//         timeout: 20000,
//       })

//       const profileData = response.data

//       if (profileData && profileData.public_identifier && !candidates.has(profileData.public_identifier)) {
//         const candidate = {
//           id: `linkedin_${profileData.public_identifier}`,
//           candidateName: `${profileData.first_name} ${profileData.last_name}`,
//           email: profileData.personal_email,
//           mobile: profileData.personal_contact_number,
//           currentJobTitle: profileData.occupation,
//           currentCompany: profileData.experiences?.[0]?.company,
//           location: `${profileData.city}, ${profileData.state}, ${profileData.country}`,
//           skills: profileData.skills || [],
//           summary: profileData.summary,
//           experience: profileData.experiences
//             ?.map(
//               (exp) =>
//                 `${exp.title} at ${exp.company} (${exp.starts_at?.year || "N/A"} - ${exp.ends_at?.year || "Present"})`,
//             )
//             .join("\n"),
//           yearsOfExperience: calculateExperienceYears(profileData.experiences),
//           education: profileData.education?.map((edu) => `${edu.degree_name}, ${edu.school}`).join("\n"),
//           sourceInfo: {
//             platform: "linkedin",
//             profileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             linkedinProfileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             githubProfileUrl: profileData.github_profile_id
//               ? `https://github.com/${profileData.github_profile_id}`
//               : null,
//             twitterUrl: profileData.twitter_profile_id ? `https://twitter.com/${profileData.twitter_profile_id}` : null,
//             hasEmail: !!profileData.personal_email,
//             hasPhone: !!profileData.personal_contact_number,
//             sourcedAt: new Date(),
//             aiModel: "linkedin-api",
//           },
//           matchScore: 0,
//         }

//         candidates.set(profileData.public_identifier, candidate)
//         console.log(`✅ Enriched via LinkedIn API: ${candidate.candidateName}`)
//       }
//     } catch (error) {
//       console.error(
//         `❌ Error enriching LinkedIn profile from ${url}:`,
//         error.response ? error.response.data : error.message,
//       )
//     }

//     processedCount++

//     // Rate limiting for API calls
//     await new Promise((resolve) => setTimeout(resolve, 1500))
//   }

//   console.log(`🎉 --- LinkedIn API search finished. Found ${candidates.size} candidates. ---`)
//   return Array.from(candidates.values())
// }

// // Helper function to calculate years of experience
// function calculateExperienceYears(experiences) {
//   if (!experiences || experiences.length === 0) return null

//   let totalMonths = 0
//   experiences.forEach((exp) => {
//     if (exp.starts_at && exp.starts_at.year) {
//       const startYear = exp.starts_at.year
//       const startMonth = exp.starts_at.month || 1
//       const endYear = exp.ends_at?.year || new Date().getFullYear()
//       const endMonth = exp.ends_at?.month || new Date().getMonth() + 1

//       const months = (endYear - startYear) * 12 + (endMonth - startMonth)
//       totalMonths += months
//     }
//   })

//   return totalMonths > 0 ? `${Math.round(totalMonths / 12)} years` : null
// }

// async function searchGitHub(queries, searchSettings, searchId) {
//   const token = process.env.GITHUB_TOKEN
//   if (!token) {
//     console.log("🔍 GitHub token not configured. Using Google search.")
//     return await searchGoogle(queries, searchSettings, "site:github.com", searchId)
//   }

//   const candidates = new Map()
//   let totalResults = 0
//   const maxResultsPerQuery = 15
//   const targetCandidates = Math.min(searchSettings.candidateCount * 3, 100)

//   console.log(`🚀 Starting enhanced GitHub search with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`)
//       emitProgress(
//         searchId,
//         `GitHub search: "${query.substring(0, 50)}..."`,
//         40 + (i / queries.length) * 25,
//         candidates.size,
//         "github",
//       )

//       const response = await axios.get(`https://api.github.com/search/users`, {
//         params: {
//           q: query,
//           per_page: maxResultsPerQuery,
//           sort: "repositories",
//           order: "desc",
//         },
//         headers: {
//           Authorization: `token ${token}`,
//           Accept: "application/vnd.github.v3+json",
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`📊 Found ${response.data.items.length} GitHub users`)

//         for (const user of response.data.items) {
//           if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
//             emitProgress(
//               searchId,
//               `Processing GitHub profile: ${user.login}`,
//               42 + (i / queries.length) * 25,
//               candidates.size,
//               "github",
//             )

//             const candidate = await extractCandidateFromUrl(user.html_url, "github")
//             if (candidate && candidate.candidateName) {
//               candidates.set(user.html_url, candidate)
//               totalResults++
//               console.log(`✅ GitHub candidate: ${candidate.candidateName}`)

//               emitProgress(
//                 searchId,
//                 `Found GitHub candidate: ${candidate.candidateName}`,
//                 45 + (i / queries.length) * 25,
//                 candidates.size,
//                 "github",
//               )
//             }
//           }
//         }
//       }

//       // Respect GitHub rate limits
//       await new Promise((resolve) => setTimeout(resolve, 1500))
//     } catch (error) {
//       console.error(`❌ GitHub search error:`, error.message)
//       if (error.response?.status === 403 || error.response?.status === 429) {
//         console.log("⏳ GitHub rate limited, waiting before retry...")
//         await new Promise((resolve) => setTimeout(resolve, 10000))
//       }
//     }
//   }

//   console.log(`🎉 GitHub search completed. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// async function searchDribbble(queries, searchSettings, searchId) {
//   console.log("🎨 Starting enhanced Dribbble search for design talent")
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
// }

// async function searchBehance(queries, searchSettings, searchId) {
//   console.log("🎭 Starting enhanced Behance search for creative professionals")
//   return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
// }

// // Cost estimation
// function estimateSearchCost(candidateCount) {
//   const tokensPerCandidate = 1200
//   const totalInputTokens = candidateCount * tokensPerCandidate
//   const totalOutputTokens = candidateCount * 700

//   const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000

//   return {
//     estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
//     model: "gpt-4o & gpt-4o-mini",
//     features: [
//       "Enhanced Job Analysis",
//       "AI Profile Extraction",
//       "Smart Platform Selection",
//       "Contact Discovery",
//       "Comprehensive Candidate Evaluation",
//       "Platform-Specific Intelligence",
//       "LinkedIn Profile Suggestions", // NEW
//       "Stop Control", // NEW
//     ],
//   }
// }

// // --- IMPROVED AI-POWERED DYNAMIC JOB ANALYSIS ---
// async function analyzeJobAndDeterminePlatforms(jobDescription, searchSettings) {
//   const prompt = `
//     You are an expert headhunter and recruitment strategist with 15+ years of experience. Analyze this job posting comprehensively and determine the optimal platforms and search strategies.

//     **Job Details:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Available Platforms:**
//     - linkedin: Professional networking, all industries, executives, managers
//     - github: Developers, engineers, technical roles, open source contributors
//     - google: General web search, resumes, portfolios, industry-specific sites, personal websites
//     - dribbble: UI/UX designers, visual designers, product designers, mobile app designers
//     - behance: Creative professionals, graphic designers, artists, brand designers, photographers

//     **Your Expert Analysis Task:**
//     1. Carefully analyze the job requirements to determine the primary job category and industry
//     2. Identify the most relevant platforms based on role type and industry
//     3. Suggest specialized websites or platforms that might contain relevant candidates
//     4. Determine search priorities based on candidate availability and platform relevance
//     5. Consider alternative job titles and industry-specific terminology

//     **Professional Categories to Consider:**
//     - Technology/Engineering: Software engineers, DevOps, data scientists, AI/ML engineers, full-stack developers, mobile developers, system architects
//     - Design/Creative: UI/UX designers, product designers, graphic designers, brand managers, creative directors, illustrators, photographers
//     - Legal: Corporate lawyers, litigation attorneys, paralegals, compliance officers, legal counsel
//     - Healthcare: Physicians, nurses, medical specialists, healthcare administrators, clinical researchers
//     - Finance: Financial analysts, investment bankers, accountants, financial advisors, risk managers, actuaries
//     - Marketing/Sales: Digital marketers, sales managers, content creators, SEO specialists, social media managers, PR professionals
//     - HR/Management: HR directors, talent acquisition specialists, organizational development, executive recruiters
//     - Education: Professors, teachers, instructional designers, education technology specialists
//     - Operations: Supply chain managers, logistics coordinators, project managers, operations analysts
//     - Consulting: Management consultants, strategy advisors, business analysts, process improvement specialists

//     **Platform Selection Criteria:**
//     - HIGH priority: Primary platforms where 70%+ of qualified candidates are likely found
//     - MEDIUM priority: Secondary platforms with 30-50% candidate likelihood
//     - LOW priority: Niche platforms with <30% but highly qualified candidates

//     Return ONLY a valid JSON object with comprehensive analysis:
//     {
//       "jobCategory": "Primary category (be very specific)",
//       "jobSubcategory": "Detailed subcategory with specialization",
//       "seniorityLevel": "Entry/Mid/Senior/Executive level analysis",
//       "recommendedPlatforms": [
//         {
//           "platform": "platform_name",
//           "priority": "high|medium|low",
//           "reason": "Detailed explanation of why this platform is optimal for this role",
//           "expectedCandidateVolume": "high|medium|low"
//         }
//       ],
//       "specializedSites": [
//         {
//           "site": "domain.com or site description",
//           "description": "What type of professionals and why relevant",
//           "searchApproach": "How to search this platform effectively"
//         }
//       ],
//       "searchKeywords": ["highly relevant keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
//       "alternativeJobTitles": ["alternative title1", "title2", "title3", "title4"],
//       "industrySpecificTerms": ["term1", "term2", "term3", "term4"],
//       "skillSynonyms": {
//         "primary_skill": ["synonym1", "synonym2"],
//         "secondary_skill": ["synonym1", "synonym2"]
//       },
//       "targetCompanyTypes": ["startup", "enterprise", "agency", "consulting"],
//       "searchComplexity": "simple|moderate|complex"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1500,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     })

//     const analysis = JSON.parse(response.choices[0].message.content)
//     console.log("🔍 Enhanced job analysis completed:", {
//       category: analysis.jobCategory,
//       subcategory: analysis.jobSubcategory,
//       platforms: analysis.recommendedPlatforms?.length,
//       complexity: analysis.searchComplexity,
//     })
//     return analysis
//   } catch (error) {
//     console.error("❌ Error analyzing job:", error.message)
//     return null
//   }
// }


// // Deduplication
// function deduplicateCandidates(candidates) {
//   const uniqueMap = new Map()

//   for (const candidate of candidates) {
//     const keys = []

//     if (candidate.email) {
//       keys.push(`email_${candidate.email.toLowerCase()}`)
//     }

//     if (candidate.candidateName) {
//       keys.push(`name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`)
//     }

//     if (candidate.sourceInfo?.linkedinProfileUrl) {
//       keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.githubProfileUrl) {
//       keys.push(`github_${candidate.sourceInfo.githubProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.profileUrl) {
//       keys.push(`profile_${candidate.sourceInfo.profileUrl}`)
//     }

//     if (candidate.mobile) {
//       keys.push(`mobile_${candidate.mobile.toString().replace(/\D/g, "")}`)
//     }

//     const existingKey = keys.find((key) => uniqueMap.has(key))

//     if (!existingKey) {
//       keys.forEach((key) => uniqueMap.set(key, candidate))
//     } else {
//       const existing = uniqueMap.get(existingKey)
//       mergeCandidateInfo(existing, candidate)
//     }
//   }

//   return Array.from(new Set(uniqueMap.values()))
// }

// function mergeCandidateInfo(existing, duplicate) {
//   if (!existing.email && duplicate.email) {
//     existing.email = duplicate.email
//   }

//   if (!existing.mobile && duplicate.mobile) {
//     existing.mobile = duplicate.mobile
//   }

//   if (duplicate.skills && duplicate.skills.length > 0) {
//     existing.skills = [...new Set([...(existing.skills || []), ...duplicate.skills])]
//   }

//   if (duplicate.sourceInfo) {
//     Object.keys(duplicate.sourceInfo).forEach((key) => {
//       if (duplicate.sourceInfo[key] && !existing.sourceInfo[key]) {
//         existing.sourceInfo[key] = duplicate.sourceInfo[key]
//       }
//     })
//   }

//   if (duplicate.summary && duplicate.summary.length > (existing.summary?.length || 0)) {
//     existing.summary = duplicate.summary
//   }

//   if (duplicate.experience && duplicate.experience.length > (existing.experience?.length || 0)) {
//     existing.experience = duplicate.experience
//   }

//   if (duplicate.projects && duplicate.projects.length > 0) {
//     existing.projects = [...new Set([...(existing.projects || []), ...duplicate.projects])]
//   }

//   if (duplicate.achievements && duplicate.achievements.length > 0) {
//     existing.achievements = [...new Set([...(existing.achievements || []), ...duplicate.achievements])]
//   }

//   if (duplicate.matchScore && duplicate.matchScore > (existing.matchScore || 0)) {
//     existing.matchScore = duplicate.matchScore
//     existing.matchingScoreDetails = duplicate.matchingScoreDetails
//     existing.analysis = duplicate.analysis
//     existing.recommendation = duplicate.recommendation
//   }
// }

// // Enhanced main search function with stop control
// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings, recruiterId } = req.body

//     if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
//       return res.status(400).json({
//         success: false,
//         error: "Missing required fields",
//       })
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const companyId = job.companyId
//     if (!companyId) {
//       return res.status(400).json({ success: false, error: "Company ID not found" })
//     }

//     const estimatedCost = estimateSearchCost(searchSettings.candidateCount)

//     const searchHistory = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       companyId,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "in_progress",
//       cost: {
//         estimatedCost: estimatedCost.estimatedCost,
//         actualCost: 0,
//         tokensUsed: 0,
//         apiCalls: 0,
//       },
//       linkedinProfiles: [], // NEW: Initialize LinkedIn profiles array
//     })

//     await searchHistory.save()

//     // NEW: Initialize search control
//     searchControlMap.set(searchHistory._id.toString(), { shouldStop: false })

//     res.status(200).json({
//       success: true,
//       message: "🚀 Enhanced AI headhunter search started!",
//       searchId: searchHistory._id,
//       estimatedCost: estimatedCost,
//     })

//     // Start the search process
//     performEnhancedDynamicSearch(searchHistory._id, job, searchSettings, recruiterId)
//   } catch (error) {
//     console.error("❌ Error starting search:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // Enhanced main search workflow with stop control
// async function performEnhancedDynamicSearch2(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0
//   let totalApiCalls = 0
//   let wasStopped = false

//   try {
//     console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`)

//     // Step 1: Enhanced job analysis
//     emitProgress(searchHistoryId, "🧠 Analyzing job requirements with AI intelligence...", 5, 0, "", true)

//     const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings)
//     totalApiCalls += 1
//     totalTokensUsed += 1200

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements")
//     }

//     console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)
//     emitProgress(
//       searchHistoryId,
//       `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Complexity: ${jobAnalysis.searchComplexity}`,
//       10,
//       0,
//       "",
//       true,
//     )

//     // Check for stop before continuing
//     if (shouldStopSearch(searchHistoryId)) {
//       wasStopped = true
//       throw new Error("Search stopped by user request")
//     }

//     // Step 2: Platform optimization
//     const availablePlatforms = searchSettings.platforms
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 }
//         return priorityOrder[b.priority] - priorityOrder[a.priority]
//       })

//     console.log(
//       "🎯 Optimized platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`),
//     )

//     const allCandidates = []

//     // Step 3: Enhanced platform searches with stop control
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       // Check for stop before each platform
//       if (shouldStopSearch(searchHistoryId)) {
//         console.log(`🛑 Search stopped before platform ${recommendedPlatforms[i].platform}`)
//         wasStopped = true
//         break
//       }

//       const platformInfo = recommendedPlatforms[i]
//       const platform = platformInfo.platform

//       emitProgress(
//         searchHistoryId,
//         `🔍 Generating enhanced search queries for ${platform}...`,
//         15 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       )

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis)
//       totalApiCalls += 1
//       totalTokensUsed += 1500

//       if (queries.length === 0) {
//         console.log(`⚠️ No queries generated for ${platform}`)
//         continue
//       }

//       emitProgress(
//         searchHistoryId,
//         `🚀 Searching ${platform} with ${queries.length} AI-optimized queries...`,
//         18 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       )

//       let platformCandidates = []

//       try {
//         switch (platform) {
//           case "google":
//             platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId)
//             break
//           case "linkedin":
//             platformCandidates = await searchLinkedIn(queries, searchSettings, searchHistoryId)
//             break
//           case "github":
//             platformCandidates = await searchGitHub(queries, searchSettings, searchHistoryId)
//             break
//           case "dribbble":
//             platformCandidates = await searchDribbble(queries, searchSettings, searchHistoryId)
//             break
//           case "behance":
//             platformCandidates = await searchBehance(queries, searchSettings, searchHistoryId)
//             break
//         }
//       } catch (platformError) {
//         console.error(`❌ Error searching ${platform}:`, platformError.message)
//         platformCandidates = []
//       }

//       totalApiCalls += platformCandidates.length * 2
//       totalTokensUsed += platformCandidates.length * 2000

//       console.log(`📊 Found ${platformCandidates.length} candidates on ${platform}`)
//       allCandidates.push(...platformCandidates)

//       emitProgress(
//         searchHistoryId,
//         `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
//         30 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       )

//       // NEW: Check if we've reached target or should stop
//       if (allCandidates.length >= searchSettings.candidateCount || shouldStopSearch(searchHistoryId)) {
//         if (shouldStopSearch(searchHistoryId)) {
//           console.log(`🛑 Search stopped after ${platform} search`)
//           wasStopped = true
//         } else {
//           console.log(`🎯 Reached target candidate count across platforms`)
//         }
//         break
//       }
//     }

//     console.log(`📊 Total candidates found across all platforms: ${allCandidates.length}`)

//     // Step 4: Fast processing when stopped or target reached
//     const processingMessage = wasStopped
//       ? `🛑 Search stopped! Fast-processing ${allCandidates.length} candidates found...`
//       : `🔄 Removing duplicate candidates with smart matching...`

//     emitProgress(searchHistoryId, processingMessage, 75, allCandidates.length, "", false)

//     const uniqueCandidates = deduplicateCandidates(allCandidates)
//     console.log(`🎯 After enhanced deduplication: ${uniqueCandidates.length} unique candidates`)

//     // Step 5: Fast candidate evaluation
//     emitProgress(
//       searchHistoryId,
//       `🧠 Fast evaluation of ${uniqueCandidates.length} candidates...`,
//       80,
//       uniqueCandidates.length,
//       "",
//       false,
//     )

//     const evaluatedCandidates = []

//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i]

//       // Faster evaluation progress updates
//       if (i % 2 === 0) {
//         emitProgress(
//           searchHistoryId,
//           `🔍 Evaluating candidate ${i + 1}/${uniqueCandidates.length}: ${candidate.candidateName}`,
//           80 + (i / uniqueCandidates.length) * 15,
//           uniqueCandidates.length,
//           "",
//           false,
//         )
//       }

//       const evaluation = await evaluateCandidateMatch(candidate, job, searchSettings)
//       if (evaluation) {
//         totalApiCalls += 1
//         totalTokensUsed += 1000

//         candidate.matchScore = evaluation.matchingScoreDetails.overallMatch
//         candidate.matchingScoreDetails = evaluation.matchingScoreDetails
//         candidate.analysis = evaluation.analysis
//         candidate.comment = evaluation.comment
//         candidate.recommendation = evaluation.recommendation
//         candidate.confidenceLevel = evaluation.confidenceLevel
//         candidate.nextSteps = evaluation.nextSteps
//       }

//       candidate.jobTitle = job._id
//       candidate.companyId = job.companyId
//       candidate.candidateStatus = "AI Sourced"
//       candidate.aiSourced = true
//       candidate.sourceInfo.sourcedAt = new Date()
//       candidate.sourceInfo.sourcedBy = recruiterId
//       candidate.sourceInfo.aiModel = "gpt-4o"

//       evaluatedCandidates.push(candidate)

//       // Save to Resume collection
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: job._id,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo?.profileUrl,
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || [],
//             matched: candidate.analysis?.skills?.matched || [],
//             notMatched: candidate.analysis?.skills?.notMatched || [],
//           },
//           experience: {
//             relevantExperience:
//               candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//             yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//           },
//           education: {
//             highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//             relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//           },
//           projects: candidate.analysis?.projects || candidate.projects || [],
//           recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//           comments: candidate.analysis?.comments || candidate.comment,
//           additionalNotes: candidate.analysis?.additionalNotes || "",
//         },
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         aiSourced: true,
//         sourceInfo: {
//           platform: candidate.sourceInfo?.platform,
//           profileUrl: candidate.sourceInfo?.profileUrl,
//           linkedinProfileUrl: candidate.sourceInfo?.linkedinProfileUrl,
//           portfolioUrl: candidate.sourceInfo?.portfolioUrl,
//           sourcedAt: candidate.sourceInfo?.sourcedAt,
//           sourcedBy: candidate.sourceInfo?.sourcedBy,
//           aiModel: candidate.sourceInfo?.aiModel,
//           hasEmail: candidate.sourceInfo?.hasEmail,
//         },
//         created_at: new Date(),
//       }

//       try {
//         const resume = new Resume(resumeData)
//         await resume.save()
//       } catch (saveError) {
//         console.error(`❌ Error saving resume for ${candidate.candidateName}:`, saveError.message)
//       }
//     }

//     // Step 6: Final candidate selection and ranking
//     emitProgress(
//       searchHistoryId,
//       "🎯 Finalizing candidate selection and ranking...",
//       95,
//       evaluatedCandidates.length,
//       "",
//       false,
//     )

//     const finalCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName)
//       .sort((a, b) => {
//         const scoreA = a.matchScore || 0
//         const scoreB = b.matchScore || 0
//         if (scoreB !== scoreA) return scoreB - scoreA

//         const confidenceOrder = { High: 3, Medium: 2, Low: 1 }
//         return (confidenceOrder[b.confidenceLevel] || 1) - (confidenceOrder[a.confidenceLevel] || 1)
//       })
//       .slice(0, searchSettings.candidateCount)

//     console.log(`🎯 Final selection: ${finalCandidates.length} top-ranked candidates`)

//     // Calculate actual cost
//     const actualCost = (totalTokensUsed * 0.0002) / 1000

//     // Determine final status
//     const finalStatus = wasStopped ? "stopped" : "completed"

//     // Update search history with results
//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: finalStatus,
//       completedAt: new Date(),
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     // Final progress update
//     const completionMessage = wasStopped
//       ? `🛑 Search stopped! Processed ${finalCandidates.length} candidates successfully`
//       : `🎉 Search completed! Found ${finalCandidates.length} high-quality candidates`

//     emitProgress(searchHistoryId, completionMessage, 100, finalCandidates.length, "", false)

//     // Emit completion event
//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: finalCandidates,
//       wasStopped,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         uniqueCandidatesAfterDedup: uniqueCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//         platformsUsed: recommendedPlatforms.map((p) => p.platform),
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//         wasStopped,
//       },
//     })

//     // Create success notification
//     const notificationMessage = wasStopped
//       ? `🛑 Search stopped! Processed ${finalCandidates.length} candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`
//       : `🎉 Enhanced search completed! Found ${finalCandidates.length} top candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`

//     const notification = new Notification({
//       message: notificationMessage,
//       recipientId: recruiterId,
//       jobId: job._id,
//     })
//     await notification.save()

//     io.emit("newNotification", notification)

//     // Clean up search control
//     searchControlMap.delete(searchHistoryId.toString())
//   } catch (error) {
//     console.error("❌ Enhanced search error:", error.message)

//     const partialCost = (totalTokensUsed * 0.0002) / 1000
//     const finalStatus = wasStopped ? "stopped" : "failed"

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: finalStatus,
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     const errorMessage = wasStopped ? "Search stopped by user request" : error.message

//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: errorMessage,
//       wasStopped,
//     })

//     // Create error notification
//     const errorNotification = new Notification({
//       message: wasStopped
//         ? `🛑 Search stopped for ${job.context}. Partial results may be available.`
//         : `❌ Search failed for ${job.context}. Error: ${error.message}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     })
//     await errorNotification.save()

//     io.emit("newNotification", errorNotification)

//     // Clean up search control
//     searchControlMap.delete(searchHistoryId.toString())
//   }
// }

// async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0;
//   let totalApiCalls = 0;
//   let wasStopped = false;

//   try {
//     console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`);

//     // Step 1: Enhanced job analysis
//     emitProgress(searchHistoryId, "🧠 Analyzing job requirements with AI intelligence...", 5, 0, "", true);

//     const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings);
//     totalApiCalls += 1;
//     totalTokensUsed += 1200;

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements");
//     }

//     console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`);
//     emitProgress(
//       searchHistoryId,
//       `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Complexity: ${jobAnalysis.searchComplexity}`,
//       10,
//       0,
//       "",
//       true,
//     );

//     // Check for stop before continuing
//     if (shouldStopSearch(searchHistoryId)) {
//       wasStopped = true;
//       throw new Error("Search stopped by user request");
//     }

//     // Step 2: Platform optimization
//     const availablePlatforms = searchSettings.platforms;
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 };
//         return priorityOrder[b.priority] - priorityOrder[a.priority];
//       });

//     console.log(
//       "🎯 Optimized platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`),
//     );

//     const allCandidates = [];

//     // Step 3: Enhanced platform searches with stop control
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       // Check for stop before each platform
//       if (shouldStopSearch(searchHistoryId)) {
//         console.log(`🛑 Search stopped before platform ${recommendedPlatforms[i].platform}`);
//         wasStopped = true;
//         break;
//       }

//       const platformInfo = recommendedPlatforms[i];
//       const platform = platformInfo.platform;

//       emitProgress(
//         searchHistoryId,
//         `🔍 Generating enhanced search queries for ${platform}...`,
//         15 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       );

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis);
//       totalApiCalls += 1;
//       totalTokensUsed += 1500;

//       if (queries.length === 0) {
//         console.log(`⚠️ No queries generated for ${platform}`);
//         continue;
//       }

//       emitProgress(
//         searchHistoryId,
//         `🚀 Searching ${platform} with ${queries.length} AI-optimized queries...`,
//         18 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       );

//       let platformCandidates = [];

//       try {
//         switch (platform) {
//           case "google":
//             platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId);
//             break;
//           case "linkedin":
//             platformCandidates = await searchLinkedIn(queries, searchSettings, searchHistoryId);
//             break;
//           case "github":
//             platformCandidates = await searchGitHub(queries, searchSettings, searchHistoryId);
//             break;
//           case "dribbble":
//             platformCandidates = await searchDribbble(queries, searchSettings, searchHistoryId);
//             break;
//           case "behance":
//             platformCandidates = await searchBehance(queries, searchSettings, searchHistoryId);
//             break;
//         }
//       } catch (platformError) {
//         console.error(`❌ Error searching ${platform}:`, platformError.message);
//         platformCandidates = [];
//       }

//       totalApiCalls += platformCandidates.length * 2;
//       totalTokensUsed += platformCandidates.length * 2000;

//       console.log(`📊 Found ${platformCandidates.length} candidates on ${platform}`);
//       allCandidates.push(...platformCandidates);

//       emitProgress(
//         searchHistoryId,
//         `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
//         30 + i * 20,
//         allCandidates.length,
//         platform,
//         true,
//       );

//       // Check if we've reached target or should stop
//       if (allCandidates.length >= searchSettings.candidateCount || shouldStopSearch(searchHistoryId)) {
//         if (shouldStopSearch(searchHistoryId)) {
//           console.log(`🛑 Search stopped after ${platform} search`);
//           wasStopped = true;
//         } else {
//           console.log(`🎯 Reached target candidate count across platforms`);
//         }
//         break;
//       }
//     }

//     console.log(`📊 Total candidates found across all platforms: ${allCandidates.length}`);

//     // Step 4: Fast processing when stopped or target reached
//     const processingMessage = wasStopped
//       ? `🛑 Search stopped! Fast-processing ${allCandidates.length} candidates found...`
//       : `🔄 Removing duplicate candidates with smart matching...`;

//     emitProgress(searchHistoryId, processingMessage, 75, allCandidates.length, "", false);

//     const uniqueCandidates = deduplicateCandidates(allCandidates);
//     console.log(`🎯 After enhanced deduplication: ${uniqueCandidates.length} unique candidates`);

//     // Step 5: Fast candidate evaluation
//     emitProgress(
//       searchHistoryId,
//       `🧠 Fast evaluation of ${uniqueCandidates.length} candidates...`,
//       80,
//       uniqueCandidates.length,
//       "",
//       false,
//     );

//     const evaluatedCandidates = [];

//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i];

//       // Faster evaluation progress updates
//       if (i % 2 === 0) {
//         emitProgress(
//           searchHistoryId,
//           `🔍 Evaluating candidate ${i + 1}/${uniqueCandidates.length}: ${candidate.candidateName}`,
//           80 + (i / uniqueCandidates.length) * 10,
//           uniqueCandidates.length,
//           "",
//           false,
//         );
//       }

//       const evaluation = await evaluateCandidateMatch(candidate, job, searchSettings);
//       if (evaluation) {
//         totalApiCalls += 1;
//         totalTokensUsed += 1000;

//         candidate.matchScore = evaluation.matchingScoreDetails.overallMatch;
//         candidate.matchingScoreDetails = evaluation.matchingScoreDetails;
//         candidate.analysis = evaluation.analysis;
//         candidate.comment = evaluation.comment;
//         candidate.recommendation = evaluation.recommendation;
//         candidate.confidenceLevel = evaluation.confidenceLevel;
//         candidate.nextSteps = evaluation.nextSteps;
//       }

//       candidate.jobTitle = job._id;
//       candidate.companyId = job.companyId;
//       candidate.candidateStatus = "AI Sourced";
//       candidate.aiSourced = true;
//       candidate.sourceInfo.sourcedAt = new Date();
//       candidate.sourceInfo.sourcedBy = recruiterId;
//       candidate.sourceInfo.aiModel = "gpt-4o";

//       evaluatedCandidates.push(candidate);
//     }

//     // Step 6: Final candidate selection and ranking
//     emitProgress(
//       searchHistoryId,
//       "🎯 Finalizing candidate selection and ranking...",
//       85,
//       evaluatedCandidates.length,
//       "",
//       false,
//     );

//     const finalCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName)
//       .sort((a, b) => {
//         const scoreA = a.matchScore || 0;
//         const scoreB = b.matchScore || 0;
//         if (scoreB !== scoreA) return scoreB - scoreA;

//         const confidenceOrder = { High: 3, Medium: 2, Low: 1 };
//         return (confidenceOrder[b.confidenceLevel] || 1) - (confidenceOrder[a.confidenceLevel] || 1);
//       })
//       .slice(0, searchSettings.candidateCount);

//     console.log(`🎯 Final selection: ${finalCandidates.length} top-ranked candidates`);

//     // Step 6.5: Save final candidates' resumes in bulk
//     emitProgress(
//       searchHistoryId,
//       `💾 Saving ${finalCandidates.length} final candidates' resumes to database...`,
//       90,
//       finalCandidates.length,
//       "",
//       false,
//     );

//     const resumeDataArray = finalCandidates.map(candidate => ({
//       candidateName: candidate.candidateName,
//       email: candidate.email,
//       mobile: candidate.mobile,
//       jobTitle: job._id,
//       companyId: job.companyId,
//       companyName: candidate.currentCompany,
//       resumeLink: candidate.sourceInfo?.profileUrl,
//       linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//       matchingScoreDetails: candidate.matchingScoreDetails,
//       analysis: {
//         skills: {
//           candidateSkills: candidate.skills || [],
//           matched: candidate.analysis?.skills?.matched || [],
//           notMatched: candidate.analysis?.skills?.notMatched || [],
//         },
//         experience: {
//           relevantExperience:
//             candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//           yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//         },
//         education: {
//           highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//           relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//         },
//         projects: candidate.analysis?.projects || candidate.projects || [],
//         recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//         comments: candidate.analysis?.comments || candidate.comment,
//         additionalNotes: candidate.analysis?.additionalNotes || "",
//       },
//       summary: candidate.summary,
//       candidateStatus: "AI Sourced",
//       aiSourced: true,
//       sourceInfo: {
//         platform: candidate.sourceInfo?.platform,
//         profileUrl: candidate.sourceInfo?.profileUrl,
//         linkedinProfileUrl: candidate.sourceInfo?.linkedinProfileUrl,
//         portfolioUrl: candidate.sourceInfo?.portfolioUrl,
//         sourcedAt: candidate.sourceInfo?.sourcedAt,
//         sourcedBy: candidate.sourceInfo?.sourcedBy,
//         aiModel: candidate.sourceInfo?.aiModel,
//         hasEmail: candidate.sourceInfo?.hasEmail,
//       },
//       created_at: new Date(),
//     }));

//     try {
//       const existingResumes = await Resume.find({
//         jobTitle: job._id,
//         companyId: job.companyId,
//         candidateName: { $in: resumeDataArray.map(r => r.candidateName) },
//       });
//       const existingNames = new Set(existingResumes.map(r => r.candidateName));
//       const newResumes = resumeDataArray.filter(r => !existingNames.has(r.candidateName));

//       if (newResumes.length > 0) {
//         await Resume.insertMany(newResumes, { ordered: false });
//         console.log(`✅ Saved ${newResumes.length} new resumes to database`);
//       } else {
//         console.log(`ℹ️ No new resumes to save (all final candidates already exist)`);
//       }
//     } catch (saveError) {
//       console.error(`❌ Error saving resumes:`, saveError.message);
//       const errorNotification = new Notification({
//         message: `❌ Failed to save resumes for ${job.context}. Error: ${saveError.message}`,
//         recipientId: recruiterId,
//         jobId: job._id,
//       });
//       await errorNotification.save();
//       io.emit("newNotification", errorNotification);
//     }

//     // Calculate actual cost
//     const actualCost = (totalTokensUsed * 0.0002) / 1000;

//     // Determine final status
//     const finalStatus = wasStopped ? "stopped" : "completed";

//     // Update search history with results
//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: finalStatus,
//       completedAt: new Date(),
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     });

//     // Final progress update
//     const completionMessage = wasStopped
//       ? `🛑 Search stopped! Processed ${finalCandidates.length} candidates successfully`
//       : `🎉 Search completed! Found ${finalCandidates.length} high-quality candidates`;

//     emitProgress(searchHistoryId, completionMessage, 100, finalCandidates.length, "", false);

//     // Emit completion event
//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: finalCandidates,
//       wasStopped,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         uniqueCandidatesAfterDedup: uniqueCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//         platformsUsed: recommendedPlatforms.map((p) => p.platform),
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//         wasStopped,
//       },
//     });

//     // Create success notification
//     const notificationMessage = wasStopped
//       ? `🛑 Search stopped! Processed ${finalCandidates.length} candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`
//       : `🎉 Enhanced search completed! Found ${finalCandidates.length} top candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`;

//     const notification = new Notification({
//       message: notificationMessage,
//       recipientId: recruiterId,
//       jobId: job._id,
//     });
//     await notification.save();

//     io.emit("newNotification", notification);

//     // Clean up search control
//     searchControlMap.delete(searchHistoryId.toString());
//   } catch (error) {
//     console.error("❌ Enhanced search error:", error.message);

//     const partialCost = (totalTokensUsed * 0.0002) / 1000;
//     const finalStatus = wasStopped ? "stopped" : "failed";

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: finalStatus,
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     });

//     const errorMessage = wasStopped ? "Search stopped by user request" : error.message;

//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: errorMessage,
//       wasStopped,
//     });

//     // Create error notification
//     const errorNotification = new Notification({
//       message: wasStopped
//         ? `🛑 Search stopped for ${job.context}. Partial results may be available.`
//         : `❌ Search failed for ${job.context}. Error: ${error.message}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     });
//     await errorNotification.save();

//     io.emit("newNotification", errorNotification);

//     // Clean up search control
//     searchControlMap.delete(searchHistoryId.toString());
//   }
// }

// // Enhanced get search results to include LinkedIn profiles
// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     const search = await SearchHistory.findById(searchId)

//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" })
//     }

//     res.status(200).json({
//       success: true,
//       results: search.results,
//       linkedinProfiles: search.linkedinProfiles || [], // NEW: Include LinkedIn profiles
//       searchDetails: search,
//     })
//   } catch (error) {
//     console.error("❌ Error fetching search results:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params
//     const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20)

//     res.status(200).json({ success: true, searches })
//   } catch (error) {
//     console.error("❌ Error fetching search history:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const addCandidatesToWorkflow = async (req, res) => {
//   try {
//     const { jobId, candidates, recruiterId } = req.body

//     if (!jobId || !candidates || !Array.isArray(candidates)) {
//       return res.status(400).json({ success: false, error: "Invalid request data" })
//     }

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const savedResumes = []

//     for (const candidate of candidates) {
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: jobId,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo?.profileUrl,
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || [],
//             matched: candidate.analysis?.skills?.matched || [],
//             notMatched: candidate.analysis?.skills?.notMatched || [],
//           },
//           experience: {
//             relevantExperience:
//               candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//             yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//           },
//           education: {
//             highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//             relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//           },
//           projects: candidate.analysis?.projects || candidate.projects || [],
//           recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//           comments: candidate.analysis?.comments || candidate.comment,
//           additionalNotes: candidate.analysis?.additionalNotes || "",
//         },
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo,
//         created_at: new Date(),
//       }

//       const resume = new Resume(resumeData)
//       await resume.save()
//       savedResumes.push(resume)
//     }

//     const notification = new Notification({
//       message: `✅ ${candidates.length} candidates successfully added to workflow for ${job.context}`,
//       recipientId: recruiterId,
//       jobId: jobId,
//     })
//     await notification.save()

//     res.status(200).json({
//       success: true,
//       message: `🎉 ${savedResumes.length} candidates successfully added to workflow.`,
//     })
//   } catch (error) {
//     console.error("❌ Error adding candidates to workflow:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export async function deleteSearchHistoryItem(req, res) {
//   const { searchId } = req.params
//   const { recruiterId } = req.body

//   try {
//     if (!mongoose.Types.ObjectId.isValid(searchId)) {
//       return res.status(400).json({ success: false, error: "Invalid search ID" })
//     }

//     if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
//       return res.status(400).json({ success: false, error: "Invalid recruiter ID" })
//     }

//     const search = await SearchHistory.findOneAndDelete({
//       _id: searchId,
//       recruiterId: recruiterId,
//     })

//     if (!search) {
//       return res.status(404).json({
//         success: false,
//         error: "Search history item not found",
//       })
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Search history item deleted successfully",
//     })
//   } catch (error) {
//     console.error("❌ Error deleting search history item:", error.message)
//     return res.status(500).json({ success: false, error: "Server error" })
//   }
// }


// ---- working code with data matched with resume data ------------------
// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Resume from "../../model/resumeModel.js"
// import Notification from "../../model/NotificationModal.js"
// import { io } from "../../index.js"
// import mongoose from "mongoose"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // --- SCHEMAS ---
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   results: [
//     {
//       candidateName: String,
//       email: String,
//       mobile: mongoose.Schema.Types.Mixed,
//       jobTitle: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "JobDescription",
//       },
//       companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//       currentCompany: String,
//       location: String,
//       skills: [String],
//       experience: String,
//       summary: String,
//       candidateStatus: String,
//       matchingScoreDetails: {
//         skillsMatch: Number,
//         experienceMatch: Number,
//         educationMatch: Number,
//         overallMatch: Number,
//       },
//       analysis: {
//         skills: {
//           candidateSkills: [String],
//           matched: [String],
//           notMatched: [String],
//         },
//         experience: {
//           relevantExperience: String,
//           yearsOfExperience: String,
//         },
//         education: {
//           highestDegree: String,
//           relevantCourses: [String],
//         },
//         projects: [String],
//         recommendation: String,
//         comments: String,
//         additionalNotes: String,
//       },
//       comment: String,
//       recommendation: {
//         type: String,
//         enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//       },
//       aiSourced: Boolean,
//       sourceInfo: {
//         platform: String,
//         profileUrl: String,
//         linkedinProfileUrl: String,
//         githubProfileUrl: String,
//         portfolioUrl: String,
//         dribbbleUrl: String,
//         behanceUrl: String,
//         mediumUrl: String,
//         twitterUrl: String,
//         personalWebsite: String,
//         sourcedAt: Date,
//         sourcedBy: mongoose.Schema.Types.ObjectId,
//         aiModel: String,
//         hasEmail: Boolean,
//         hasPhone: Boolean,
//       },
//     },
//   ],
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // --- UTILITY FUNCTIONS ---
// function cleanJsonResponse(responseText) {
//   const match = responseText.match(/```json([\s\S]*?)```/)
//   const cleanText = match ? match[1] : responseText
//   return cleanText
//     .replace(/```json\n|\n```/g, "")
//     .replace(/```/g, "")
//     .trim()
// }

// function isValidJson(str) {
//   try {
//     JSON.parse(str)
//     return true
//   } catch {
//     return false
//   }
// }

// // Enhanced progress emitter with more frequent updates
// function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "") {
//   const progressData = {
//     searchId,
//     status,
//     progress: Math.min(Math.max(progress, 0), 100),
//     candidatesFound,
//     platform,
//     timestamp: new Date().toISOString(),
//   }
//   console.log(`Progress Update [${searchId}]: ${progress}% - ${status} - ${candidatesFound} candidates`)
//   io.emit("searchProgress", progressData)
// }

// // NEW: Analyze job for optimal platform selection
// export const analyzeJobForPlatforms = async (jobDescription, searchSettings) => {
//   const prompt = `
//     You are an expert headhunter and recruitment strategist with 15+ years of experience. Analyze this job posting comprehensively and determine the optimal platforms and search strategies.

//     **Job Details:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Available Platforms:**
//     - linkedin: Professional networking, all industries, executives, managers
//     - github: Developers, engineers, technical roles, open source contributors
//     - google: General web search, resumes, portfolios, industry-specific sites, personal websites
//     - dribbble: UI/UX designers, visual designers, product designers, mobile app designers
//     - behance: Creative professionals, graphic designers, artists, brand designers, photographers

//     **Your Expert Analysis Task:**
//     1. Carefully analyze the job requirements to determine the primary job category and industry
//     2. Identify the most relevant platforms based on role type and industry
//     3. Suggest specialized websites or platforms that might contain relevant candidates
//     4. Determine search priorities based on candidate availability and platform relevance
//     5. Consider alternative job titles and industry-specific terminology

//     **Professional Categories to Consider:**
//     - Technology/Engineering: Software engineers, DevOps, data scientists, AI/ML engineers, full-stack developers, mobile developers, system architects
//     - Design/Creative: UI/UX designers, product designers, graphic designers, brand managers, creative directors, illustrators, photographers
//     - Legal: Corporate lawyers, litigation attorneys, paralegals, compliance officers, legal counsel
//     - Healthcare: Physicians, nurses, medical specialists, healthcare administrators, clinical researchers
//     - Finance: Financial analysts, investment bankers, accountants, financial advisors, risk managers, actuaries
//     - Marketing/Sales: Digital marketers, sales managers, content creators, SEO specialists, social media managers, PR professionals
//     - HR/Management: HR directors, talent acquisition specialists, organizational development, executive recruiters
//     - Education: Professors, teachers, instructional designers, education technology specialists
//     - Operations: Supply chain managers, logistics coordinators, project managers, operations analysts
//     - Consulting: Management consultants, strategy advisors, business analysts, process improvement specialists

//     **Platform Selection Criteria:**
//     - HIGH priority: Primary platforms where 70%+ of qualified candidates are likely found
//     - MEDIUM priority: Secondary platforms with 30-50% candidate likelihood
//     - LOW priority: Niche platforms with <30% but highly qualified candidates

//     Return ONLY a valid JSON object with comprehensive analysis:
//     {
//       "jobCategory": "Primary category (be very specific)",
//       "jobSubcategory": "Detailed subcategory with specialization",
//       "seniorityLevel": "Entry/Mid/Senior/Executive level analysis",
//       "recommendedPlatforms": [
//         {
//           "platform": "platform_name",
//           "priority": "high|medium|low",
//           "reason": "Detailed explanation of why this platform is optimal for this role",
//           "expectedCandidateVolume": "high|medium|low"
//         }
//       ],
//       "specializedSites": [
//         {
//           "site": "domain.com or site description",
//           "description": "What type of professionals and why relevant",
//           "searchApproach": "How to search this platform effectively"
//         }
//       ],
//       "searchKeywords": ["highly relevant keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
//       "alternativeJobTitles": ["alternative title1", "title2", "title3", "title4"],
//       "industrySpecificTerms": ["term1", "term2", "term3", "term4"],
//       "skillSynonyms": {
//         "primary_skill": ["synonym1", "synonym2"],
//         "secondary_skill": ["synonym1", "synonym2"]
//       },
//       "targetCompanyTypes": ["startup", "enterprise", "agency", "consulting"],
//       "searchComplexity": "simple|moderate|complex"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1500,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     })

//     const analysis = JSON.parse(response.choices[0].message.content)
//     console.log("🔍 Enhanced job analysis completed:", {
//       category: analysis.jobCategory,
//       subcategory: analysis.jobSubcategory,
//       platforms: analysis.recommendedPlatforms?.length,
//       complexity: analysis.searchComplexity,
//     })
//     return analysis
//   } catch (error) {
//     console.error("❌ Error analyzing job:", error.message)
//     return null
//   }
// }

// // NEW: Get cost estimate function
// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount = 10 } = req.query
//     const estimate = estimateSearchCost(Number.parseInt(candidateCount))
//     res.status(200).json({ success: true, estimate })
//   } catch (error) {
//     console.error("❌ Error calculating cost estimate:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // --- IMPROVED AI-POWERED DYNAMIC JOB ANALYSIS ---
// async function analyzeJobAndDeterminePlatforms(jobDescription, searchSettings) {
//   const prompt = `
//     You are an expert headhunter and recruitment strategist with 15+ years of experience. Analyze this job posting comprehensively and determine the optimal platforms and search strategies.

//     **Job Details:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Available Platforms:**
//     - linkedin: Professional networking, all industries, executives, managers
//     - github: Developers, engineers, technical roles, open source contributors
//     - google: General web search, resumes, portfolios, industry-specific sites, personal websites
//     - dribbble: UI/UX designers, visual designers, product designers, mobile app designers
//     - behance: Creative professionals, graphic designers, artists, brand designers, photographers

//     **Your Expert Analysis Task:**
//     1. Carefully analyze the job requirements to determine the primary job category and industry
//     2. Identify the most relevant platforms based on role type and industry
//     3. Suggest specialized websites or platforms that might contain relevant candidates
//     4. Determine search priorities based on candidate availability and platform relevance
//     5. Consider alternative job titles and industry-specific terminology

//     **Professional Categories to Consider:**
//     - Technology/Engineering: Software engineers, DevOps, data scientists, AI/ML engineers, full-stack developers, mobile developers, system architects
//     - Design/Creative: UI/UX designers, product designers, graphic designers, brand managers, creative directors, illustrators, photographers
//     - Legal: Corporate lawyers, litigation attorneys, paralegals, compliance officers, legal counsel
//     - Healthcare: Physicians, nurses, medical specialists, healthcare administrators, clinical researchers
//     - Finance: Financial analysts, investment bankers, accountants, financial advisors, risk managers, actuaries
//     - Marketing/Sales: Digital marketers, sales managers, content creators, SEO specialists, social media managers, PR professionals
//     - HR/Management: HR directors, talent acquisition specialists, organizational development, executive recruiters
//     - Education: Professors, teachers, instructional designers, education technology specialists
//     - Operations: Supply chain managers, logistics coordinators, project managers, operations analysts
//     - Consulting: Management consultants, strategy advisors, business analysts, process improvement specialists

//     **Platform Selection Criteria:**
//     - HIGH priority: Primary platforms where 70%+ of qualified candidates are likely found
//     - MEDIUM priority: Secondary platforms with 30-50% candidate likelihood
//     - LOW priority: Niche platforms with <30% but highly qualified candidates

//     Return ONLY a valid JSON object with comprehensive analysis:
//     {
//       "jobCategory": "Primary category (be very specific)",
//       "jobSubcategory": "Detailed subcategory with specialization",
//       "seniorityLevel": "Entry/Mid/Senior/Executive level analysis",
//       "recommendedPlatforms": [
//         {
//           "platform": "platform_name",
//           "priority": "high|medium|low",
//           "reason": "Detailed explanation of why this platform is optimal for this role",
//           "expectedCandidateVolume": "high|medium|low"
//         }
//       ],
//       "specializedSites": [
//         {
//           "site": "domain.com or site description",
//           "description": "What type of professionals and why relevant",
//           "searchApproach": "How to search this platform effectively"
//         }
//       ],
//       "searchKeywords": ["highly relevant keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
//       "alternativeJobTitles": ["alternative title1", "title2", "title3", "title4"],
//       "industrySpecificTerms": ["term1", "term2", "term3", "term4"],
//       "skillSynonyms": {
//         "primary_skill": ["synonym1", "synonym2"],
//         "secondary_skill": ["synonym1", "synonym2"]
//       },
//       "targetCompanyTypes": ["startup", "enterprise", "agency", "consulting"],
//       "searchComplexity": "simple|moderate|complex"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1500,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     })

//     const analysis = JSON.parse(response.choices[0].message.content)
//     console.log("🔍 Enhanced job analysis completed:", {
//       category: analysis.jobCategory,
//       subcategory: analysis.jobSubcategory,
//       platforms: analysis.recommendedPlatforms?.length,
//       complexity: analysis.searchComplexity,
//     })
//     return analysis
//   } catch (error) {
//     console.error("❌ Error analyzing job:", error.message)
//     return null
//   }
// }

// // --- IMPROVED SEARCH QUERY GENERATION ---
// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 15 highly effective, diverse search queries to find top-tier candidates.

//     **Job Information:**
//     - Position: ${jobDescription.context}
//     - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
//     - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
//     - Seniority: ${jobAnalysis?.seniorityLevel || searchSettings.experienceLevel}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Alternative Titles: ${jobAnalysis?.alternativeJobTitles?.join(", ") || ""}
//     - Industry Terms: ${jobAnalysis?.industrySpecificTerms?.join(", ") || ""}
//     - Skill Synonyms: ${JSON.stringify(jobAnalysis?.skillSynonyms || {})}
//     - Target Companies: ${jobAnalysis?.targetCompanyTypes?.join(", ") || ""}

//     **Platform to Target:** ${platform}

//     **Platform-Specific Advanced Instructions:**
//     ${getPlatformInstructions(platform, jobAnalysis)}

//     **Advanced Query Generation Strategy:**
//     1. **Diversity is Key**: Create queries with different approaches - skills-based, title-based, company-based, project-based, certification-based
//     2. **Boolean Mastery**: Use advanced operators: AND, OR, NOT, parentheses for grouping, quotes for exact phrases
//     3. **Synonym Integration**: Include skill synonyms and alternative terminology
//     4. **Experience Targeting**: Tailor queries to the required seniority level
//     5. **Geographic Precision**: If location specified, use city, state, metro area, and remote variations
//     6. **Company Intelligence**: Target relevant company types and industry leaders
//     7. **Certification Focus**: Include relevant certifications and credentials
//     8. **Project-Based Search**: Look for specific project types and achievements

//     **Query Categories to Generate (15 total):**
//     - 4 Skill-focused queries (core skills + combinations)
//     - 3 Title-focused queries (exact titles + alternatives)  
//     - 2 Company-focused queries (target company types)
//     - 2 Location-focused queries (if applicable)
//     - 2 Experience-focused queries (seniority level)
//     - 1 Certification-focused query
//     - 1 Project-focused query

//     **Quality Standards:**
//     - Each query should be unique and approach candidate finding differently
//     - Queries should be 10-50 words long
//     - Focus on finding individual profiles, not company pages
//     - Include contact discovery elements where appropriate
//     - Balance broad reach with specific targeting

//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8", "query9", "query10", "query11", "query12", "query13", "query14", "query15"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.6,
//       response_format: { type: "json_object" },
//     })

//     const content = JSON.parse(response.choices[0].message.content)
//     const queries = content.queries || []
//     console.log(`🔍 Generated ${queries.length} enhanced queries for ${platform}`)
//     return queries.slice(0, 15) // Ensure we get exactly 15 queries
//   } catch (error) {
//     console.error("❌ Error generating search queries:", error.message)
//     return []
//   }
// }

// // --- ENHANCED PLATFORM INSTRUCTIONS ---
// function getPlatformInstructions(platform, jobAnalysis) {
//   const category = jobAnalysis?.jobCategory?.toLowerCase() || ""
//   const seniority = jobAnalysis?.seniorityLevel?.toLowerCase() || ""

//   switch (platform) {
//     case "linkedin":
//       return `
//         **LinkedIn Advanced Search Strategy:**
//         LinkedIn is the primary professional platform. Create sophisticated queries using:
        
//         **Boolean Search Mastery:**
//         - Use quotes for exact phrases: "Senior Software Engineer"
//         - Use parentheses for grouping: (Java OR Python OR JavaScript)
//         - Use AND/OR/NOT operators strategically
//         - Target current positions and past experience
        
//         **Targeting Strategies:**
//         - Seniority-based: "${seniority}" level professionals
//         - Company-based: Current/past employees of target companies
//         - Skills-based: Multiple skill combinations with AND/OR
//         - Industry-based: Specific industry experience
//         - Location-based: Current location + willing to relocate
//         - Education-based: Relevant degrees and universities
        
//         **Examples by Category:**
//         - Tech: "Senior Software Engineer" AND (Python OR Java) AND "San Francisco"
//         - Design: "UI/UX Designer" AND (Figma OR Sketch) AND "portfolio"
//         - Legal: ("Corporate Lawyer" OR "Legal Counsel") AND "Securities Law"
//         - Finance: "Investment Banker" AND "Mergers Acquisitions" AND CFA
//         - Healthcare: ("Physician" OR "Doctor") AND "Cardiology" AND "Board Certified"
        
//         **Contact Discovery:**
//         - Include "contact" OR "email" in some queries
//         - Target profiles with external contact information
//         - Look for profiles mentioning "open to opportunities"
//       `

//     case "github":
//       return `
//         **GitHub Advanced Search for Technical Talent:**
//         GitHub is perfect for technical roles. Create queries that target:
        
//         **Technical Depth:**
//         - Programming languages: language:Python language:JavaScript
//         - Framework expertise: React Vue.js Django Flask
//         - Location targeting: location:"San Francisco" location:"Remote"
//         - Activity level: followers:>100 repos:>10
//         - Recent activity: pushed:>2024-01-01
        
//         **Profile Intelligence:**
//         - Bio-based searches: Target user bios with role keywords
//         - Repository analysis: Specific project types and technologies
//         - Contribution patterns: Active contributors and maintainers
//         - Company affiliations: Current/past company mentions
        
//         **Examples:**
//         - "Senior Developer" location:"New York" language:Python
//         - "Machine Learning" "AI" followers:>50 repos:>5
//         - "Full Stack" React Node.js location:Remote
//         - "DevOps" Docker Kubernetes AWS location:"San Francisco"
        
//         **Only use for technical roles requiring programming skills.**
//       `

//     case "dribbble":
//       return `
//         **Dribbble Enhanced Search for Design Professionals:**
//         Dribbble is the premier platform for visual designers. Create targeted queries for:
        
//         **Design Specializations:**
//         - UI/UX Design: "UI Designer" "UX Designer" "Product Designer"
//         - Visual Design: "Graphic Designer" "Brand Designer" "Visual Designer"
//         - Mobile Design: "Mobile App Design" "iOS Design" "Android Design"
//         - Web Design: "Web Designer" "Landing Page" "Website Design"
        
//         **Skill-Based Targeting:**
//         - Tools: Figma Sketch Adobe Photoshop Illustrator
//         - Specialties: "Logo Design" "Branding" "Icon Design" "Illustration"
//         - Industries: "SaaS Design" "E-commerce Design" "Healthcare Design"
//         - Experience: "Senior Designer" "Lead Designer" "Design Director"
        
//         **Portfolio Intelligence:**
//         - Project types: "Dashboard Design" "Mobile App" "Website Redesign"
//         - Client work: "Client Work" "Freelance" "Agency Work"
//         - Awards: "Award Winning" "Featured" "Popular"
//         - Contact info: "Available for Work" "Contact" "Hire Me"
        
//         **Location & Availability:**
//         - Geographic: Location-specific searches if needed
//         - Availability: "Available" "Freelance" "Full-time" "Remote"
        
//         **Examples:**
//         - "UI Designer" Figma "San Francisco" "Available for Work"
//         - "Brand Designer" "Logo Design" Adobe Illustrator portfolio
//         - "UX Designer" "Mobile App" "Product Design" "Remote"
//         - "Senior Designer" "Dashboard Design" "SaaS" experience
        
//         **Only use for design and creative roles.**
//       `

//     case "behance":
//       return `
//         **Behance Advanced Search for Creative Professionals:**
//         Behance showcases creative portfolios. Create queries targeting:
        
//         **Creative Categories:**
//         - Graphic Design: "Graphic Designer" "Visual Identity" "Brand Design"
//         - Web Design: "Web Design" "Digital Design" "Interface Design"
//         - Photography: "Photographer" "Commercial Photography" "Product Photography"
//         - Illustration: "Illustrator" "Digital Art" "Character Design"
//         - Motion Graphics: "Motion Designer" "Animation" "Video Graphics"
        
//         **Professional Targeting:**
//         - Experience Level: "Senior" "Lead" "Creative Director" "Art Director"
//         - Industry Focus: "Advertising" "Marketing" "Publishing" "Entertainment"
//         - Software Skills: "Adobe Creative Suite" "After Effects" "Cinema 4D"
//         - Specializations: "Print Design" "Digital Marketing" "Package Design"
        
//         **Portfolio Analysis:**
//         - Project Types: "Campaign Design" "Brand Identity" "Website Design"
//         - Client Work: "Client Projects" "Commercial Work" "Published Work"
//         - Recognition: "Award Winning" "Featured" "Curated"
//         - Availability: "Available for Hire" "Freelance" "Contact"
        
//         **Contact Discovery:**
//         - Include "contact" "email" "hire" "available" in searches
//         - Look for external portfolio links and social media
//         - Target profiles with comprehensive contact information
        
//         **Examples:**
//         - "Brand Designer" "Visual Identity" "Available for Hire" Adobe
//         - "Creative Director" "Advertising" "Campaign Design" experience
//         - "Motion Designer" "After Effects" "Commercial Work" portfolio
//         - "Art Director" "Digital Marketing" "Creative Strategy" senior
        
//         **Only use for creative and artistic roles.**
//       `

//     case "google":
//       return `
//         **Google Advanced Search for Professional Discovery:**
//         Google provides access to resumes, portfolios, and professional websites across the internet.
        
//         **Search Strategies:**
//         - Resume Targeting: filetype:pdf "resume" OR "CV" + role keywords
//         - Portfolio Discovery: "portfolio" "work samples" "case studies"
//         - Professional Websites: "about me" "professional" personal websites
//         - Industry Directories: site:specific-industry-sites.com
//         - Conference Speakers: "speaker" "conference" "presentation"
//         - Company Alumni: "formerly at" "ex-" company names
        
//         **Advanced Operators:**
//         - Site-specific: site:company.com "software engineer"
//         - File types: filetype:pdf "data scientist resume"
//         - Exact phrases: "Senior Product Manager" "available"
//         - Exclusions: -jobs -hiring (avoid job postings)
//         - Time filters: Use recent content for active professionals
        
//         **Professional Platforms Integration:**
//         - site:medium.com technical articles + author profiles
//         - site:stackoverflow.com expert contributors
//         - site:kaggle.com data science competitions
//         - site:angel.co startup professionals
//         - Industry-specific platforms and communities
        
//         **Examples:**
//         - "software engineer" "San Francisco" filetype:pdf resume Python
//         - "marketing director" portfolio "case studies" "contact"
//         - site:medium.com "machine learning" author profile
//         - "UX designer" "portfolio" "available for hire" -jobs
//         - "financial analyst" "CFA" resume filetype:pdf "New York"
//       `

//     default:
//       return `Create platform-appropriate professional search queries with advanced targeting techniques.`
//   }
// }

// // --- ENHANCED CANDIDATE EXTRACTION WITH PLATFORM-SPECIFIC LOGIC ---
// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     You are an expert talent sourcer specializing in extracting professional information from ${platform} profiles. Your task is to comprehensively analyze this content and extract detailed candidate information with absolute accuracy.

//     **CRITICAL EXTRACTION REQUIREMENTS:**
//     1. **ZERO FABRICATION**: Only extract information explicitly present in the text
//     2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
//     3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional links
//     4. **EXACT TRANSCRIPTION**: Copy information exactly as written
//     5. **PLATFORM EXPERTISE**: Apply ${platform}-specific extraction intelligence

//     **Content Source:** ${url} (Platform: ${platform})
//     **Platform Context:** ${getPlatformExtractionContext(platform)}

//     **Text Content:**
//     ---
//     ${pageText.substring(0, 12000)}
//     ---

//     **REQUIRED EXTRACTION FIELDS:**
//     Extract the following information ONLY if clearly and explicitly present:

//     **Personal Information:**
//     - Full name (complete name as displayed)
//     - Email address (exact format, multiple if present)  
//     - Phone number (exact format with country code if shown)
//     - Current location (city, state, country as specified)

//     **Professional Information:**
//     - Current job title (exact title as stated)
//     - Current company (exact company name)
//     - Professional summary/bio (comprehensive if available)
//     - Years of experience (only if explicitly stated)
//     - Industry specialization

//     **Skills & Expertise:**
//     - Technical skills (programming languages, tools, software)
//     - Professional skills (management, communication, etc.)
//     - Certifications and credentials
//     - Specializations and expertise areas

//     **Work History:**
//     - Previous companies and roles
//     - Notable projects and achievements
//     - Portfolio work and case studies
//     - Client work and collaborations

//     **Education:**
//     - Degrees and institutions
//     - Relevant coursework and certifications
//     - Professional development

//     **Digital Presence:**
//     - All social media and professional links found
//     - Portfolio websites and personal sites
//     - Professional platform profiles
//     - Contact methods and availability status

//     **${platform}-Specific Intelligence:**
//     ${getPlatformSpecificExtractionInstructions(platform)}

//     **OUTPUT FORMAT:**
//     Return ONLY this JSON structure with extracted data or null values:
//     {
//       "candidateName": "Full name exactly as written or null",
//       "email": "primary.email@domain.com or null",
//       "alternateEmails": ["additional@emails.com"] or [],
//       "mobile": "exact phone number with formatting or null",
//       "currentJobTitle": "Exact current title or null", 
//       "currentCompany": "Exact company name or null",
//       "location": "Exact location string or null",
//       "skills": ["actual", "skills", "extracted"] or [],
//       "technicalSkills": ["programming", "tools", "software"] or [],
//       "summary": "Professional summary/bio from profile or null",
//       "experience": "Work experience description or null",
//       "yearsOfExperience": "X years (only if explicitly stated) or null",
//       "education": "Education information or null",
//       "certifications": ["actual", "certifications"] or [],
//       "projects": ["actual", "projects", "portfolio pieces"] or [],
//       "achievements": ["awards", "recognition", "notable work"] or [],
//       "industries": ["industry", "specializations"] or [],
//       "availabilityStatus": "availability status if mentioned or null",
//       "sourceInfo": {
//         "profileUrl": "${url}",
//         "linkedinProfileUrl": "found LinkedIn URL or null",
//         "githubProfileUrl": "found GitHub URL or null", 
//         "portfolioUrl": "found portfolio URL or null",
//         "dribbbleUrl": "found Dribbble URL or null",
//         "behanceUrl": "found Behance URL or null",
//         "twitterUrl": "found Twitter URL or null",
//         "mediumUrl": "found Medium URL or null",
//         "personalWebsite": "found personal website or null",
//         "contactMethods": ["all", "contact", "methods", "found"] or []
//       }
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 3000,
//       temperature: 0.05, // Very low temperature for accuracy
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)

//     // Validate that we have at least a name
//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from ${url}`)
//       return null
//     }

//     // Merge technical skills into main skills array
//     const allSkills = [...(result.skills || []), ...(result.technicalSkills || [])]

//     return {
//       id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       candidateName: result.candidateName,
//       email: result.email,
//       alternateEmails: result.alternateEmails || [],
//       mobile: result.mobile,
//       currentJobTitle: result.currentJobTitle,
//       currentCompany: result.currentCompany,
//       location: result.location,
//       skills: [...new Set(allSkills)], // Remove duplicates
//       summary: result.summary,
//       experience: result.experience,
//       yearsOfExperience: result.yearsOfExperience,
//       education: result.education,
//       certifications: result.certifications || [],
//       projects: result.projects || [],
//       achievements: result.achievements || [],
//       industries: result.industries || [],
//       availabilityStatus: result.availabilityStatus,
//       sourceInfo: {
//         platform,
//         profileUrl: url,
//         linkedinProfileUrl: result.sourceInfo?.linkedinProfileUrl,
//         githubProfileUrl: result.sourceInfo?.githubProfileUrl,
//         portfolioUrl: result.sourceInfo?.portfolioUrl,
//         dribbbleUrl: result.sourceInfo?.dribbbleUrl,
//         behanceUrl: result.sourceInfo?.behanceUrl,
//         twitterUrl: result.sourceInfo?.twitterUrl,
//         mediumUrl: result.sourceInfo?.mediumUrl,
//         personalWebsite: result.sourceInfo?.personalWebsite,
//         contactMethods: result.sourceInfo?.contactMethods || [],
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//       },
//       matchScore: 0,
//     }
//   } catch (error) {
//     console.error(`❌ Error extracting candidate from ${url}:`, error.message)
//     return null
//   }
// }

// // --- PLATFORM-SPECIFIC EXTRACTION HELPERS ---
// function getPlatformExtractionContext(platform) {
//   switch (platform) {
//     case "linkedin":
//       return "LinkedIn professional profile with work history, skills, education, and connections"
//     case "github":
//       return "GitHub developer profile with repositories, contributions, and technical projects"
//     case "dribbble":
//       return "Dribbble design portfolio with creative work, projects, and design skills"
//     case "behance":
//       return "Behance creative portfolio with artistic work, brand projects, and creative expertise"
//     case "google":
//       return "Web content including resumes, portfolios, personal websites, or professional profiles"
//     default:
//       return "Professional web content with career and contact information"
//   }
// }

// function getPlatformSpecificExtractionInstructions(platform) {
//   switch (platform) {
//     case "dribbble":
//       return `
//         **Dribbble-Specific Extraction:**
//         - Extract design software proficiency (Figma, Sketch, Adobe Creative Suite)
//         - Identify design specializations (UI/UX, branding, illustration, web design)
//         - Note client work vs. personal projects
//         - Extract design process information and methodologies
//         - Look for design awards, features, or recognition
//         - Identify collaboration experience and team projects
//         - Note availability for freelance/full-time work
//         - Extract creative brief understanding and problem-solving approaches
//       `
//     case "behance":
//       return `
//         **Behance-Specific Extraction:**
//         - Identify creative disciplines (graphic design, photography, motion graphics)
//         - Extract brand work and campaign experience
//         - Note commercial vs. personal creative projects
//         - Identify creative software expertise and workflow
//         - Look for published work and client testimonials
//         - Extract creative education and artistic background
//         - Note creative direction and conceptual thinking skills
//         - Identify cross-media experience (print, digital, video)
//       `
//     case "github":
//       return `
//         **GitHub-Specific Extraction:**
//         - Extract programming languages and frameworks from repositories
//         - Identify contribution patterns and open source involvement
//         - Note repository ownership vs. contributions to others' projects
//         - Extract README documentation and project descriptions
//         - Identify technical architecture and system design experience
//         - Look for code quality, testing, and documentation practices
//         - Note collaboration through pull requests and issues
//         - Extract technical leadership through repository management
//       `
//     case "linkedin":
//       return `
//         **LinkedIn-Specific Extraction:**
//         - Extract complete work history with date ranges
//         - Identify professional accomplishments and metrics
//         - Note recommendations and endorsements context
//         - Extract volunteer work and professional associations
//         - Identify leadership roles and team management experience
//         - Look for industry thought leadership through posts/articles
//         - Note professional development and continuous learning
//         - Extract networking strength through connections and activity
//       `
//     default:
//       return "Extract comprehensive professional information relevant to the platform context."
//   }
// }

// // --- ENHANCED CANDIDATE EVALUATION ---
// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   // Only evaluate if we have sufficient candidate data
//   if (!candidate.candidateName) {
//     console.log("⚠️ Skipping evaluation - insufficient candidate data")
//     return null
//   }

//   const prompt = `
//     You are a senior technical recruiter and talent assessment expert with 20+ years of experience. Conduct a comprehensive evaluation of this candidate's fit for the position using rigorous assessment criteria.

//     **Job Requirements:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Candidate Profile:**
//     - Name: ${candidate.candidateName}
//     - Current Title: ${candidate.currentJobTitle || "Not specified"}
//     - Company: ${candidate.currentCompany || "Not specified"}  
//     - Location: ${candidate.location || "Not specified"}
//     - Skills: ${candidate.skills?.join(", ") || "Not specified"}
//     - Technical Skills: ${candidate.technicalSkills?.join(", ") || "Not specified"}
//     - Experience: ${candidate.yearsOfExperience || "Not specified"}
//     - Summary: ${candidate.summary || "Not available"}
//     - Education: ${candidate.education || "Not specified"}
//     - Certifications: ${candidate.certifications?.join(", ") || "Not specified"}
//     - Projects: ${candidate.projects?.join(", ") || "Not specified"}
//     - Achievements: ${candidate.achievements?.join(", ") || "Not specified"}
//     - Industries: ${candidate.industries?.join(", ") || "Not specified"}

//     **COMPREHENSIVE EVALUATION CRITERIA:**

//     **1. Skills Assessment (0-100):**
//     - Match required technical skills against candidate skills
//     - Consider skill depth and breadth
//     - Evaluate transferable skills and learning ability
//     - Account for emerging technologies and future requirements

//     **2. Experience Assessment (0-100):**
//     - Evaluate years of experience against requirements
//     - Assess relevance of previous roles and responsibilities
//     - Consider industry experience and domain knowledge
//     - Evaluate progression and career trajectory

//     **3. Education & Certifications Assessment (0-100):**
//     - Match educational background to requirements
//     - Evaluate relevant certifications and continuous learning
//     - Consider alternative education and self-directed learning
//     - Assess specialized training and professional development

//     **4. Cultural & Role Fit Assessment (0-100):**
//     - Evaluate role responsibilities alignment
//     - Consider company size and culture fit indicators
//     - Assess leadership potential and growth trajectory
//     - Evaluate communication and collaboration indicators

//     **ASSESSMENT GUIDELINES:**
//     - Be honest and realistic in scoring
//     - Consider both current capabilities and potential
//     - Account for missing information in your analysis
//     - Provide actionable insights for hiring decisions
//     - Consider market scarcity and candidate uniqueness

//     **SCORING METHODOLOGY:**
//     - 90-100: Exceptional match, rare find, immediate hire
//     - 80-89: Strong match, highly recommended
//     - 70-79: Good match, recommended with considerations
//     - 60-69: Moderate match, consider with reservations
//     - 50-59: Weak match, significant gaps exist
//     - Below 50: Poor match, not recommended

//     Return ONLY this JSON structure with thorough analysis:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100, detailed skills comparison),
//         "experienceMatch": number (0-100, experience relevance and depth),
//     Return ONLY this JSON structure with thorough analysis:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100, detailed skills comparison),
//         "experienceMatch": number (0-100, experience relevance and depth),
//         "educationMatch": number (0-100, educational background relevance),
//         "culturalFitMatch": number (0-100, role and culture alignment),
//         "overallMatch": number (0-100, weighted comprehensive score)
//       },
//       "analysis": {
//         "skills": {
//           "candidateSkills": ["all", "candidate", "skills"],
//           "matched": ["skills", "that", "directly", "match"],
//           "notMatched": ["required", "skills", "missing"],
//           "transferableSkills": ["skills", "that", "could", "transfer"],
//           "skillGaps": ["critical", "gaps", "identified"],
//           "skillStrengths": ["standout", "skills", "and", "expertise"]
//         },
//         "experience": {
//           "relevantExperience": "detailed description of relevant experience or 'Limited information available'",
//           "yearsOfExperience": "exact years mentioned or 'Not specified'",
//           "careerProgression": "analysis of career growth and trajectory",
//           "industryExperience": "relevant industry background",
//           "roleRelevance": "how previous roles align with target position"
//         },
//         "education": {
//           "highestDegree": "actual degree or 'Not specified'",
//           "relevantCourses": ["relevant", "coursework"] or [],
//           "certifications": ["professional", "certifications"],
//           "continuousLearning": "evidence of ongoing professional development"
//         },
//         "projects": ["significant", "projects", "and", "achievements"],
//         "strengths": ["top", "candidate", "strengths"],
//         "concerns": ["potential", "concerns", "or", "risks"],
//         "recommendation": "detailed hiring recommendation with reasoning",
//         "comments": "comprehensive assessment including data gaps and assumptions",
//         "additionalNotes": "market insights, salary expectations, availability, unique value proposition"
//       },
//       "comment": "concise executive summary for hiring managers",
//       "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
//       "confidenceLevel": "High|Medium|Low (based on available information quality)",
//       "nextSteps": "recommended actions for recruitment process"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.1, // Low temperature for consistent evaluation
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)
//     console.log(`✅ Evaluated ${candidate.candidateName}: ${result.matchingScoreDetails?.overallMatch}/100`)
//     return result
//   } catch (error) {
//     console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, error.message)
//     return null
//   }
// }

// // --- PLATFORM-SPECIFIC SEARCH FUNCTIONS ---
// async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
//   const candidates = new Map()
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!apiKey || !searchEngineId) {
//     console.warn("⚠️ Google Search API not configured. Skipping Google search.")
//     return []
//   }

//   const platform = siteFilter.includes("linkedin")
//     ? "linkedin"
//     : siteFilter.includes("github")
//       ? "github"
//       : siteFilter.includes("dribbble")
//         ? "dribbble"
//         : siteFilter.includes("behance")
//           ? "behance"
//           : "google"

//   let totalResults = 0
//   const maxResultsPerQuery = 10
//   const targetCandidates = Math.min(searchSettings.candidateCount * 3, 150) // Reasonable limit

//   console.log(`🔍 Starting enhanced Google search for ${platform} with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim()
//       console.log(`🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`)

//       // More frequent progress updates
//       emitProgress(
//         searchId,
//         `Searching ${platform}: "${searchQuery.substring(0, 50)}..."`,
//         20 + (i / queries.length) * 25,
//         candidates.size,
//         platform,
//       )

//       const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
//         params: {
//           key: apiKey,
//           cx: searchEngineId,
//           q: searchQuery,
//           num: maxResultsPerQuery,
//           start: 1,
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`📊 Found ${response.data.items.length} results for query: ${searchQuery}`)

//         for (const item of response.data.items) {
//           if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
//             // Update progress for each candidate being processed
//             emitProgress(
//               searchId,
//               `Processing: ${item.title?.substring(0, 40)}...`,
//               22 + (i / queries.length) * 25,
//               candidates.size,
//               platform,
//             )

//             const candidate = await extractCandidateFromUrl(item.link, platform)
//             if (candidate && candidate.candidateName) {
//               candidates.set(item.link, candidate)
//               totalResults++
//               console.log(`✅ Extracted: ${candidate.candidateName} (${candidates.size} total)`)

//               // Update progress with new candidate count
//               emitProgress(
//                 searchId,
//                 `Found candidate: ${candidate.candidateName}`,
//                 25 + (i / queries.length) * 25,
//                 candidates.size,
//                 platform,
//               )
//             } else {
//               console.log(`❌ Failed to extract candidate from: ${item.link}`)
//             }
//           }
//         }
//       }

//       // Respectful delay between requests
//       await new Promise((resolve) => setTimeout(resolve, 1200))
//     } catch (error) {
//       console.error(`❌ Search error for query "${query}":`, error.message)
//       if (error.response?.status === 429) {
//         console.log("⏳ Rate limited, waiting before retry...")
//         await new Promise((resolve) => setTimeout(resolve, 5000))
//       }
//     }
//   }

//   console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// async function searchLinkedIn(queries, searchSettings, searchId) {
//   const apiKey = process.env.LINKEDIN_API_KEY
//   if (apiKey) {
//     console.log("🔑 LinkedIn API key found. Using API search.")
//     return await searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey)
//   } else {
//     console.log("🔍 No LinkedIn API key. Using Google search for LinkedIn profiles.")
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
//   }
// }

// async function searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey) {
//   console.log("🚀 --- Enhanced LinkedIn API Search ---")
//   const candidates = new Map()
//   const targetCandidates = Math.min(searchSettings.candidateCount * 2, 100)
//   const apiEndpoint = "https://nubela.co/proxycurl/api/v2/linkedin"

//   const linkedInUrls = new Set()
//   const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!googleApiKey || !searchEngineId) {
//     console.warn("⚠️ Google Search API not configured. Cannot find LinkedIn profiles to enrich.")
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
//   }

//   // Step 1: Find LinkedIn profile URLs using Google
//   for (const query of queries) {
//     if (linkedInUrls.size >= targetCandidates * 2) break

//     const searchQuery = `${query} site:linkedin.com/in/`
//     try {
//       const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
//         params: { key: googleApiKey, cx: searchEngineId, q: searchQuery, num: 10 },
//         timeout: 10000,
//       })

//       if (response.data.items) {
//         response.data.items.forEach((item) => {
//           if (item.link && item.link.includes("linkedin.com/in/")) {
//             linkedInUrls.add(item.link)
//           }
//         })
//       }
//     } catch (error) {
//       console.error(`❌ Error finding LinkedIn URLs with query "${query}":`, error.message)
//     }
//   }

//   console.log(`📊 Found ${linkedInUrls.size} LinkedIn profile URLs to enrich.`)

//   // Step 2: Enrich profiles using LinkedIn API
//   let processedCount = 0
//   for (const url of linkedInUrls) {
//     if (candidates.size >= targetCandidates) break

//     emitProgress(
//       searchId,
//       `Enriching LinkedIn profile ${processedCount + 1}/${linkedInUrls.size}...`,
//       50 + (processedCount / linkedInUrls.size) * 25,
//       candidates.size,
//       "linkedin-api",
//     )

//     try {
//       const response = await axios.get(apiEndpoint, {
//         headers: { Authorization: `Bearer ${apiKey}` },
//         params: {
//           url: url,
//           fallback_to_cache: "on-error",
//           use_cache: "if-present",
//           skills: "include",
//           inferred_salary: "include",
//           personal_email: "include",
//           personal_contact_number: "include",
//           twitter_profile_id: "include",
//           facebook_profile_id: "include",
//           github_profile_id: "include",
//           extra: "include",
//         },
//         timeout: 20000,
//       })

//       const profileData = response.data

//       if (profileData && profileData.public_identifier && !candidates.has(profileData.public_identifier)) {
//         const candidate = {
//           id: `linkedin_${profileData.public_identifier}`,
//           candidateName: `${profileData.first_name} ${profileData.last_name}`,
//           email: profileData.personal_email,
//           mobile: profileData.personal_contact_number,
//           currentJobTitle: profileData.occupation,
//           currentCompany: profileData.experiences?.[0]?.company,
//           location: `${profileData.city}, ${profileData.state}, ${profileData.country}`,
//           skills: profileData.skills || [],
//           summary: profileData.summary,
//           experience: profileData.experiences
//             ?.map(
//               (exp) =>
//                 `${exp.title} at ${exp.company} (${exp.starts_at?.year || "N/A"} - ${exp.ends_at?.year || "Present"})`,
//             )
//             .join("\n"),
//           yearsOfExperience: calculateExperienceYears(profileData.experiences),
//           education: profileData.education?.map((edu) => `${edu.degree_name}, ${edu.school}`).join("\n"),
//           sourceInfo: {
//             platform: "linkedin",
//             profileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             linkedinProfileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             githubProfileUrl: profileData.github_profile_id
//               ? `https://github.com/${profileData.github_profile_id}`
//               : null,
//             twitterUrl: profileData.twitter_profile_id ? `https://twitter.com/${profileData.twitter_profile_id}` : null,
//             hasEmail: !!profileData.personal_email,
//             hasPhone: !!profileData.personal_contact_number,
//             sourcedAt: new Date(),
//             aiModel: "linkedin-api",
//           },
//           matchScore: 0,
//         }

//         candidates.set(profileData.public_identifier, candidate)
//         console.log(`✅ Enriched via LinkedIn API: ${candidate.candidateName}`)
//       }
//     } catch (error) {
//       console.error(
//         `❌ Error enriching LinkedIn profile from ${url}:`,
//         error.response ? error.response.data : error.message,
//       )
//     }

//     processedCount++

//     // Rate limiting for API calls
//     await new Promise((resolve) => setTimeout(resolve, 1500))
//   }

//   console.log(`🎉 --- LinkedIn API search finished. Found ${candidates.size} candidates. ---`)
//   return Array.from(candidates.values())
// }

// // Helper function to calculate years of experience
// function calculateExperienceYears(experiences) {
//   if (!experiences || experiences.length === 0) return null

//   let totalMonths = 0
//   experiences.forEach((exp) => {
//     if (exp.starts_at && exp.starts_at.year) {
//       const startYear = exp.starts_at.year
//       const startMonth = exp.starts_at.month || 1
//       const endYear = exp.ends_at?.year || new Date().getFullYear()
//       const endMonth = exp.ends_at?.month || new Date().getMonth() + 1

//       const months = (endYear - startYear) * 12 + (endMonth - startMonth)
//       totalMonths += months
//     }
//   })

//   return totalMonths > 0 ? `${Math.round(totalMonths / 12)} years` : null
// }

// async function searchGitHub(queries, searchSettings, searchId) {
//   const token = process.env.GITHUB_TOKEN
//   if (!token) {
//     console.log("🔍 GitHub token not configured. Using Google search.")
//     return await searchGoogle(queries, searchSettings, "site:github.com", searchId)
//   }

//   const candidates = new Map()
//   let totalResults = 0
//   const maxResultsPerQuery = 15
//   const targetCandidates = Math.min(searchSettings.candidateCount * 3, 100)

//   console.log(`🚀 Starting enhanced GitHub search with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`)
//       emitProgress(
//         searchId,
//         `GitHub search: "${query.substring(0, 50)}..."`,
//         40 + (i / queries.length) * 25,
//         candidates.size,
//         "github",
//       )

//       const response = await axios.get(`https://api.github.com/search/users`, {
//         params: {
//           q: query,
//           per_page: maxResultsPerQuery,
//           sort: "repositories",
//           order: "desc",
//         },
//         headers: {
//           Authorization: `token ${token}`,
//           Accept: "application/vnd.github.v3+json",
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`📊 Found ${response.data.items.length} GitHub users`)

//         for (const user of response.data.items) {
//           if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
//             emitProgress(
//               searchId,
//               `Processing GitHub profile: ${user.login}`,
//               42 + (i / queries.length) * 25,
//               candidates.size,
//               "github",
//             )

//             const candidate = await extractCandidateFromUrl(user.html_url, "github")
//             if (candidate && candidate.candidateName) {
//               candidates.set(user.html_url, candidate)
//               totalResults++
//               console.log(`✅ GitHub candidate: ${candidate.candidateName}`)

//               emitProgress(
//                 searchId,
//                 `Found GitHub candidate: ${candidate.candidateName}`,
//                 45 + (i / queries.length) * 25,
//                 candidates.size,
//                 "github",
//               )
//             }
//           }
//         }
//       }

//       // Respect GitHub rate limits
//       await new Promise((resolve) => setTimeout(resolve, 1500))
//     } catch (error) {
//       console.error(`❌ GitHub search error:`, error.message)
//       if (error.response?.status === 403 || error.response?.status === 429) {
//         console.log("⏳ GitHub rate limited, waiting before retry...")
//         await new Promise((resolve) => setTimeout(resolve, 10000))
//       }
//     }
//   }

//   console.log(`🎉 GitHub search completed. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// async function searchDribbble(queries, searchSettings, searchId) {
//   console.log("🎨 Starting enhanced Dribbble search for design talent")
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
// }

// async function searchBehance(queries, searchSettings, searchId) {
//   console.log("🎭 Starting enhanced Behance search for creative professionals")
//   return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
// }

// async function extractCandidateFromUrl(url, platform) {
//   try {
//     console.log(`🔍 Extracting from: ${url}`)
//     const { data } = await axios.get(url, {
//       timeout: 25000,
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//         "Accept-Language": "en-US,en;q=0.5",
//         Connection: "keep-alive",
//         "Accept-Encoding": "gzip, deflate, br",
//       },
//     })

//     const $ = load(data)

//     // More comprehensive content cleaning
//     $("script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner, .popup, .modal, .overlay").remove()

//     const text = $("body").text().replace(/\s+/g, " ").trim()

//     if (text.length < 300) {
//       console.log(`❌ Insufficient content from ${url} (${text.length} chars)`)
//       return null
//     }

//     console.log(`📄 Extracted ${text.length} characters from ${url}`)
//     const candidate = await extractCandidateWithAI(text, url, platform)

//     if (candidate) {
//       console.log(`✅ Successfully extracted candidate: ${candidate.candidateName}`)
//     }

//     return candidate
//   } catch (error) {
//     console.error(`❌ Error extracting from ${url}:`, error.message)
//     return null
//   }
// }

// // --- MAIN WORKFLOW ---
// function estimateSearchCost(candidateCount) {
//   const tokensPerCandidate = 1200 // Increased for enhanced prompts
//   const totalInputTokens = candidateCount * tokensPerCandidate
//   const totalOutputTokens = candidateCount * 700 // Increased for detailed analysis

//   const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000

//   return {
//     estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
//     model: "gpt-4o & gpt-4o-mini",
//     features: [
//       "Enhanced Job Analysis",
//       "AI Profile Extraction",
//       "Smart Platform Selection",
//       "Contact Discovery",
//       "Comprehensive Candidate Evaluation",
//       "Platform-Specific Intelligence",
//     ],
//   }
// }

// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings, recruiterId } = req.body

//     if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
//       return res.status(400).json({
//         success: false,
//         error: "Missing required fields",
//       })
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const companyId = job.companyId
//     if (!companyId) {
//       return res.status(400).json({ success: false, error: "Company ID not found" })
//     }

//     const estimatedCost = estimateSearchCost(searchSettings.candidateCount)

//     const searchHistory = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       companyId,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "in_progress",
//       cost: {
//         estimatedCost: estimatedCost.estimatedCost,
//         actualCost: 0,
//         tokensUsed: 0,
//         apiCalls: 0,
//       },
//     })

//     await searchHistory.save()

//     res.status(200).json({
//       success: true,
//       message: "🚀 Enhanced AI headhunter search started!",
//       searchId: searchHistory._id,
//       estimatedCost: estimatedCost,
//     })

//     // Start the search process
//     performEnhancedDynamicSearch(searchHistory._id, job, searchSettings, recruiterId)
//   } catch (error) {
//     console.error("❌ Error starting search:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// async function performEnhancedDynamicSearch2(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0
//   let totalApiCalls = 0

//   try {
//     console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`)

//     // Step 1: Enhanced job analysis
//     emitProgress(searchHistoryId, "🧠 Analyzing job requirements with AI intelligence...", 5, 0)

//     const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings)
//     totalApiCalls += 1
//     totalTokensUsed += 1200

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements")
//     }

//     console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)
//     emitProgress(
//       searchHistoryId,
//       `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Complexity: ${jobAnalysis.searchComplexity}`,
//       10,
//       0,
//     )

//     // Step 2: Platform optimization
//     const availablePlatforms = searchSettings.platforms
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 }
//         return priorityOrder[b.priority] - priorityOrder[a.priority]
//       })

//     console.log(
//       "🎯 Optimized platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`),
//     )

//     const allCandidates = []

//     // Step 3: Enhanced platform searches
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       const platformInfo = recommendedPlatforms[i]
//       const platform = platformInfo.platform

//       emitProgress(
//         searchHistoryId,
//         `🔍 Generating enhanced search queries for ${platform}...`,
//         15 + i * 20,
//         allCandidates.length,
//         platform,
//       )

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis)
//       totalApiCalls += 1
//       totalTokensUsed += 1500

//       if (queries.length === 0) {
//         console.log(`⚠️ No queries generated for ${platform}`)
//         continue
//       }

//       emitProgress(
//         searchHistoryId,
//         `🚀 Searching ${platform} with ${queries.length} AI-optimized queries...`,
//         18 + i * 20,
//         allCandidates.length,
//         platform,
//       )

//       let platformCandidates = []

//       try {
//         switch (platform) {
//           case "google":
//             platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId)
//             break
//           case "linkedin":
//             platformCandidates = await searchLinkedIn(queries, searchSettings, searchHistoryId)
//             break
//           case "github":
//             platformCandidates = await searchGitHub(queries, searchSettings, searchHistoryId)
//             break
//           case "dribbble":
//             platformCandidates = await searchDribbble(queries, searchSettings, searchHistoryId)
//             break
//           case "behance":
//             platformCandidates = await searchBehance(queries, searchSettings, searchHistoryId)
//             break
//         }
//       } catch (platformError) {
//         console.error(`❌ Error searching ${platform}:`, platformError.message)
//         platformCandidates = []
//       }

//       totalApiCalls += platformCandidates.length * 2 // Extraction + evaluation
//       totalTokensUsed += platformCandidates.length * 2000

//       console.log(`📊 Found ${platformCandidates.length} candidates on ${platform}`)
//       allCandidates.push(...platformCandidates)

//       emitProgress(
//         searchHistoryId,
//         `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
//         30 + i * 20,
//         allCandidates.length,
//         platform,
//       )
//     }

//     console.log(`📊 Total candidates found across all platforms: ${allCandidates.length}`)

//     // Step 4: Enhanced deduplication
//     emitProgress(searchHistoryId, "🔄 Removing duplicate candidates with smart matching...", 75, allCandidates.length)

//     const uniqueCandidates = deduplicateCandidates(allCandidates)
//     console.log(`🎯 After enhanced deduplication: ${uniqueCandidates.length} unique candidates`)

//     // Step 5: Comprehensive candidate evaluation
//     emitProgress(
//       searchHistoryId,
//       `🧠 Conducting comprehensive evaluation of ${uniqueCandidates.length} candidates...`,
//       80,
//       uniqueCandidates.length,
//     )

//     const evaluatedCandidates = []

//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i]

//       // More frequent evaluation progress updates
//       if (i % 3 === 0) {
//         emitProgress(
//           searchHistoryId,
//           `🔍 Evaluating candidate ${i + 1}/${uniqueCandidates.length}: ${candidate.candidateName}`,
//           80 + (i / uniqueCandidates.length) * 15,
//           uniqueCandidates.length,
//         )
//       }

//       const evaluation = await evaluateCandidateMatch(candidate, job, searchSettings)
//       if (evaluation) {
//         totalApiCalls += 1
//         totalTokensUsed += 1000

//         candidate.matchScore = evaluation.matchingScoreDetails.overallMatch
//         candidate.matchingScoreDetails = evaluation.matchingScoreDetails
//         candidate.analysis = evaluation.analysis
//         candidate.comment = evaluation.comment
//         candidate.recommendation = evaluation.recommendation
//         candidate.confidenceLevel = evaluation.confidenceLevel
//         candidate.nextSteps = evaluation.nextSteps
//       }

//       candidate.jobTitle = job._id
//       candidate.companyId = job.companyId
//       candidate.candidateStatus = "AI Sourced"
//       candidate.aiSourced = true
//       candidate.sourceInfo.sourcedAt = new Date()
//       candidate.sourceInfo.sourcedBy = recruiterId
//       candidate.sourceInfo.aiModel = "gpt-4o"

//       evaluatedCandidates.push(candidate)

//       // Save to Resume collection with FIXED SCHEMA MAPPING
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: job._id,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo?.profileUrl,
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//         // FIXED: Map skills correctly to analysis structure
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || [], // FIXED: Properly map to schema
//             matched: candidate.analysis?.skills?.matched || [],
//             notMatched: candidate.analysis?.skills?.notMatched || [],
//           },
//           experience: {
//             relevantExperience:
//               candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//             yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//           },
//           education: {
//             highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//             relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//           },
//           projects: candidate.analysis?.projects || candidate.projects || [],
//           recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//           comments: candidate.analysis?.comments || candidate.comment,
//           additionalNotes: candidate.analysis?.additionalNotes || "",
//         },
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         aiSourced: true,
//         sourceInfo: {
//           platform: candidate.sourceInfo?.platform,
//           profileUrl: candidate.sourceInfo?.profileUrl,
//           linkedinProfileUrl: candidate.sourceInfo?.linkedinProfileUrl,
//           portfolioUrl: candidate.sourceInfo?.portfolioUrl,
//           sourcedAt: candidate.sourceInfo?.sourcedAt,
//           sourcedBy: candidate.sourceInfo?.sourcedBy,
//           aiModel: candidate.sourceInfo?.aiModel,
//           hasEmail: candidate.sourceInfo?.hasEmail,
//         },
//         created_at: new Date(),
//       }

//       try {
//         const resume = new Resume(resumeData)
//         await resume.save()
//       } catch (saveError) {
//         console.error(`❌ Error saving resume for ${candidate.candidateName}:`, saveError.message)
//       }
//     }

//     // Step 6: Final candidate selection and ranking
//     emitProgress(searchHistoryId, "🎯 Finalizing candidate selection and ranking...", 95, evaluatedCandidates.length)

//     const finalCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName) // Only candidates with names
//       .sort((a, b) => {
//         // Sort by match score first, then by confidence level
//         const scoreA = a.matchScore || 0
//         const scoreB = b.matchScore || 0
//         if (scoreB !== scoreA) return scoreB - scoreA

//         // Secondary sort by confidence level
//         const confidenceOrder = { High: 3, Medium: 2, Low: 1 }
//         return (confidenceOrder[b.confidenceLevel] || 1) - (confidenceOrder[a.confidenceLevel] || 1)
//       })
//       .slice(0, searchSettings.candidateCount)

//     console.log(`🎯 Final selection: ${finalCandidates.length} top-ranked candidates`)

//     // Calculate actual cost
//     const actualCost = (totalTokensUsed * 0.0002) / 1000

//     // Update search history with results
//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: "completed",
//       completedAt: new Date(),
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     // Final progress update
//     emitProgress(
//       searchHistoryId,
//       `🎉 Search completed! Found ${finalCandidates.length} high-quality candidates`,
//       100,
//       finalCandidates.length,
//     )

//     // Emit completion event
//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: finalCandidates,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         uniqueCandidatesAfterDedup: uniqueCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//         platformsUsed: recommendedPlatforms.map((p) => p.platform),
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     // Create success notification
//     const notification = new Notification({
//       message: `🎉 Enhanced search completed! Found ${finalCandidates.length} top candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     })
//     await notification.save()

//     io.emit("newNotification", notification)
//   } catch (error) {
//     console.error("❌ Enhanced search error:", error.message)

//     const partialCost = (totalTokensUsed * 0.0002) / 1000

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: "failed",
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: error.message,
//     })

//     // Create error notification
//     const errorNotification = new Notification({
//       message: `❌ Search failed for ${job.context}. Error: ${error.message}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     })
//     await errorNotification.save()

//     io.emit("newNotification", errorNotification)
//   }
// }

// async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0;
//   let totalApiCalls = 0;

//   try {
//     console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`);

//     // Step 1: Enhanced job analysis
//     emitProgress(searchHistoryId, "🧠 Analyzing job requirements with AI intelligence...", 5, 0);

//     const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings);
//     totalApiCalls += 1;
//     totalTokensUsed += 1200;

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements");
//     }

//     console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`);
//     emitProgress(
//       searchHistoryId,
//       `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Complexity: ${jobAnalysis.searchComplexity}`,
//       10,
//       0,
//     );

//     // Step 2: Platform optimization
//     const availablePlatforms = searchSettings.platforms;
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 };
//         return priorityOrder[b.priority] - priorityOrder[a.priority];
//       });

//     console.log(
//       "🎯 Optimized platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`),
//     );

//     const allCandidates = [];

//     // Step 3: Enhanced platform searches
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       const platformInfo = recommendedPlatforms[i];
//       const platform = platformInfo.platform;

//       emitProgress(
//         searchHistoryId,
//         `🔍 Generating enhanced search queries for ${platform}...`,
//         15 + i * 20,
//         allCandidates.length,
//         platform,
//       );

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis);
//       totalApiCalls += 1;
//       totalTokensUsed += 1500;

//       if (queries.length === 0) {
//         console.log(`⚠️ No queries generated for ${platform}`);
//         continue;
//       }

//       emitProgress(
//         searchHistoryId,
//         `🚀 Searching ${platform} with ${queries.length} AI-optimized queries...`,
//         18 + i * 20,
//         allCandidates.length,
//         platform,
//       );

//       let platformCandidates = [];

//       try {
//         switch (platform) {
//           case "google":
//             platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId);
//             break;
//           case "linkedin":
//             platformCandidates = await searchLinkedIn(queries, searchSettings, searchHistoryId);
//             break;
//           case "github":
//             platformCandidates = await searchGitHub(queries, searchSettings, searchHistoryId);
//             break;
//           case "dribbble":
//             platformCandidates = await searchDribbble(queries, searchSettings, searchHistoryId);
//             break;
//           case "behance":
//             platformCandidates = await searchBehance(queries, searchSettings, searchHistoryId);
//             break;
//         }
//       } catch (platformError) {
//         console.error(`❌ Error searching ${platform}:`, platformError.message);
//         platformCandidates = [];
//       }

//       totalApiCalls += platformCandidates.length * 2; // Extraction + evaluation
//       totalTokensUsed += platformCandidates.length * 2000;

//       console.log(`📊 Found ${platformCandidates.length} candidates on ${platform}`);
//       allCandidates.push(...platformCandidates);

//       emitProgress(
//         searchHistoryId,
//         `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
//         30 + i * 20,
//         allCandidates.length,
//         platform,
//       );
//     }

//     console.log(`📊 Total candidates found across all platforms: ${allCandidates.length}`);

//     // Step 4: Enhanced deduplication
//     emitProgress(searchHistoryId, "🔄 Removing duplicate candidates with smart matching...", 75, allCandidates.length);

//     const uniqueCandidates = deduplicateCandidates(allCandidates);
//     console.log(`🎯 After enhanced deduplication: ${uniqueCandidates.length} unique candidates`);

//     // Step 5: Comprehensive candidate evaluation
//     emitProgress(
//       searchHistoryId,
//       `🧠 Conducting comprehensive evaluation of ${uniqueCandidates.length} candidates...`,
//       80,
//       uniqueCandidates.length,
//     );

//     const evaluatedCandidates = [];

//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i];

//       if (i % 3 === 0) {
//         emitProgress(
//           searchHistoryId,
//           `🔍 Evaluating candidate ${i + 1}/${uniqueCandidates.length}: ${candidate.candidateName}`,
//           80 + (i / uniqueCandidates.length) * 10,
//           uniqueCandidates.length,
//         );
//       }

//       const evaluation = await evaluateCandidateMatch(candidate, job, searchSettings);
//       if (evaluation) {
//         totalApiCalls += 1;
//         totalTokensUsed += 1000;

//         candidate.matchScore = evaluation.matchingScoreDetails.overallMatch;
//         candidate.matchingScoreDetails = evaluation.matchingScoreDetails;
//         candidate.analysis = evaluation.analysis;
//         candidate.comment = evaluation.comment;
//         candidate.recommendation = evaluation.recommendation;
//         candidate.confidenceLevel = evaluation.confidenceLevel;
//         candidate.nextSteps = evaluation.nextSteps;
//       }

//       candidate.jobTitle = job._id;
//       candidate.companyId = job.companyId;
//       candidate.candidateStatus = "AI Sourced";
//       candidate.aiSourced = true;
//       candidate.sourceInfo.sourcedAt = new Date();
//       candidate.sourceInfo.sourcedBy = recruiterId;
//       candidate.sourceInfo.aiModel = "gpt-4o";

//       evaluatedCandidates.push(candidate);
//     }

//     // Step 6: Final candidate selection and ranking
//     emitProgress(searchHistoryId, "🎯 Finalizing candidate selection and ranking...", 85, evaluatedCandidates.length);

//     const finalCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName)
//       .sort((a, b) => {
//         const scoreA = a.matchScore || 0;
//         const scoreB = b.matchScore || 0;
//         if (scoreB !== scoreA) return scoreB - scoreA;

//         const confidenceOrder = { High: 3, Medium: 2, Low: 1 };
//         return (confidenceOrder[b.confidenceLevel] || 1) - (confidenceOrder[a.confidenceLevel] || 1);
//       })
//       .slice(0, searchSettings.candidateCount);

//     console.log(`🎯 Final selection: ${finalCandidates.length} top-ranked candidates`);

//     // Step 6.5: Save final candidates' resumes in bulk
//     emitProgress(
//       searchHistoryId,
//       `💾 Saving ${finalCandidates.length} final candidates' resumes to database...`,
//       90,
//       finalCandidates.length,
//     );

//     const resumeDataArray = finalCandidates.map(candidate => ({
//       candidateName: candidate.candidateName,
//       email: candidate.email,
//       mobile: candidate.mobile,
//       jobTitle: job._id,
//       companyId: job.companyId,
//       companyName: candidate.currentCompany,
//       resumeLink: candidate.sourceInfo?.profileUrl,
//       linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//       matchingScoreDetails: candidate.matchingScoreDetails,
//       analysis: {
//         skills: {
//           candidateSkills: candidate.skills || [],
//           matched: candidate.analysis?.skills?.matched || [],
//           notMatched: candidate.analysis?.skills?.notMatched || [],
//         },
//         experience: {
//           relevantExperience:
//             candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//           yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//         },
//         education: {
//           highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//           relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//         },
//         projects: candidate.analysis?.projects || candidate.projects || [],
//         recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//         comments: candidate.analysis?.comments || candidate.comment,
//         additionalNotes: candidate.analysis?.additionalNotes || "",
//       },
//       summary: candidate.summary,
//       candidateStatus: "AI Sourced",
//       aiSourced: true,
//       sourceInfo: {
//         platform: candidate.sourceInfo?.platform,
//         profileUrl: candidate.sourceInfo?.profileUrl,
//         linkedinProfileUrl: candidate.sourceInfo?.linkedinProfileUrl,
//         portfolioUrl: candidate.sourceInfo?.portfolioUrl,
//         sourcedAt: candidate.sourceInfo?.sourcedAt,
//         sourcedBy: candidate.sourceInfo?.sourcedBy,
//         aiModel: candidate.sourceInfo?.aiModel,
//         hasEmail: candidate.sourceInfo?.hasEmail,
//       },
//       created_at: new Date(),
//     }));

//     try {
//       const existingResumes = await Resume.find({
//         jobTitle: job._id,
//         companyId: job.companyId,
//         candidateName: { $in: resumeDataArray.map(r => r.candidateName) },
//       });
//       const existingNames = new Set(existingResumes.map(r => r.candidateName));
//       const newResumes = resumeDataArray.filter(r => !existingNames.has(r.candidateName));

//       if (newResumes.length > 0) {
//         await Resume.insertMany(newResumes, { ordered: false });
//         console.log(`✅ Saved ${newResumes.length} new resumes to database`);
//       } else {
//         console.log(`ℹ️ No new resumes to save (all final candidates already exist)`);
//       }
//     } catch (saveError) {
//       console.error(`❌ Error saving resumes:`, saveError.message);
//       const errorNotification = new Notification({
//         message: `❌ Failed to save resumes for ${job.context}. Error: ${saveError.message}`,
//         recipientId: recruiterId,
//         jobId: job._id,
//       });
//       await errorNotification.save();
//       io.emit("newNotification", errorNotification);
//     }

//     // Calculate actual cost
//     const actualCost = (totalTokensUsed * 0.0002) / 1000;

//     // Update search history with results
//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: "completed",
//       completedAt: new Date(),
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     });

//     // Final progress update
//     emitProgress(
//       searchHistoryId,
//       `🎉 Search completed! Found ${finalCandidates.length} high-quality candidates`,
//       100,
//       finalCandidates.length,
//     );

//     // Emit completion event
//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: finalCandidates,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         uniqueCandidatesAfterDedup: uniqueCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//         platformsUsed: recommendedPlatforms.map((p) => p.platform),
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     });

//     // Create success notification
//     const notification = new Notification({
//       message: `🎉 Enhanced search completed! Found ${finalCandidates.length} top candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     });
//     await notification.save();

//     io.emit("newNotification", notification);
//   } catch (error) {
//     console.error("❌ Enhanced search error:", error.message);

//     const partialCost = (totalTokensUsed * 0.0002) / 1000;

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: "failed",
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     });

//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: error.message,
//     });

//     // Create error notification
//     const errorNotification = new Notification({
//       message: `❌ Search failed for ${job.context}. Error: ${error.message}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     });
//     await errorNotification.save();

//     io.emit("newNotification", errorNotification);
//   }
// }

// function deduplicateCandidates(candidates) {
//   const uniqueMap = new Map()

//   for (const candidate of candidates) {
//     const keys = []

//     // Create multiple identification keys for robust deduplication
//     if (candidate.email) {
//       keys.push(`email_${candidate.email.toLowerCase()}`)
//     }

//     if (candidate.candidateName) {
//       keys.push(`name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`)
//     }

//     if (candidate.sourceInfo?.linkedinProfileUrl) {
//       keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.githubProfileUrl) {
//       keys.push(`github_${candidate.sourceInfo.githubProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.profileUrl) {
//       keys.push(`profile_${candidate.sourceInfo.profileUrl}`)
//     }

//     if (candidate.mobile) {
//       keys.push(`mobile_${candidate.mobile.toString().replace(/\D/g, "")}`)
//     }

//     const existingKey = keys.find((key) => uniqueMap.has(key))

//     if (!existingKey) {
//       // New candidate, add all keys
//       keys.forEach((key) => uniqueMap.set(key, candidate))
//     } else {
//       // Duplicate found, merge information
//       const existing = uniqueMap.get(existingKey)
//       mergeCandidateInfo(existing, candidate)
//     }
//   }

//   return Array.from(new Set(uniqueMap.values()))
// }

// function mergeCandidateInfo(existing, duplicate) {
//   // Merge contact information
//   if (!existing.email && duplicate.email) {
//     existing.email = duplicate.email
//   }

//   if (!existing.mobile && duplicate.mobile) {
//     existing.mobile = duplicate.mobile
//   }

//   // Merge skills (remove duplicates)
//   if (duplicate.skills && duplicate.skills.length > 0) {
//     existing.skills = [...new Set([...(existing.skills || []), ...duplicate.skills])]
//   }

//   // Merge source information
//   if (duplicate.sourceInfo) {
//     Object.keys(duplicate.sourceInfo).forEach((key) => {
//       if (duplicate.sourceInfo[key] && !existing.sourceInfo[key]) {
//         existing.sourceInfo[key] = duplicate.sourceInfo[key]
//       }
//     })
//   }

//   // Use longer/more detailed summary
//   if (duplicate.summary && duplicate.summary.length > (existing.summary?.length || 0)) {
//     existing.summary = duplicate.summary
//   }

//   // Use more detailed experience
//   if (duplicate.experience && duplicate.experience.length > (existing.experience?.length || 0)) {
//     existing.experience = duplicate.experience
//   }

//   // Merge projects and achievements
//   if (duplicate.projects && duplicate.projects.length > 0) {
//     existing.projects = [...new Set([...(existing.projects || []), ...duplicate.projects])]
//   }

//   if (duplicate.achievements && duplicate.achievements.length > 0) {
//     existing.achievements = [...new Set([...(existing.achievements || []), ...duplicate.achievements])]
//   }

//   // Use higher match score
//   if (duplicate.matchScore && duplicate.matchScore > (existing.matchScore || 0)) {
//     existing.matchScore = duplicate.matchScore
//     existing.matchingScoreDetails = duplicate.matchingScoreDetails
//     existing.analysis = duplicate.analysis
//     existing.recommendation = duplicate.recommendation
//   }
// }

// // Keep existing exports with enhanced functionality
// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params
//     const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20)

//     res.status(200).json({ success: true, searches })
//   } catch (error) {
//     console.error("❌ Error fetching search history:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     const search = await SearchHistory.findById(searchId)

//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" })
//     }

//     res.status(200).json({
//       success: true,
//       results: search.results,
//       searchDetails: search,
//     })
//   } catch (error) {
//     console.error("❌ Error fetching search results:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const addCandidatesToWorkflow = async (req, res) => {
//   try {
//     const { jobId, candidates, recruiterId } = req.body

//     if (!jobId || !candidates || !Array.isArray(candidates)) {
//       return res.status(400).json({ success: false, error: "Invalid request data" })
//     }

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const savedResumes = []

//     for (const candidate of candidates) {
//       // FIXED SCHEMA MAPPING for workflow addition
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: jobId,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo?.profileUrl,
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         // FIXED: Properly structure analysis object
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || [],
//             matched: candidate.analysis?.skills?.matched || [],
//             notMatched: candidate.analysis?.skills?.notMatched || [],
//           },
//           experience: {
//             relevantExperience:
//               candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary,
//             yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || candidate.yearsOfExperience,
//           },
//           education: {
//             highestDegree: candidate.analysis?.education?.highestDegree || candidate.education,
//             relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//           },
//           projects: candidate.analysis?.projects || candidate.projects || [],
//           recommendation: candidate.analysis?.recommendation || candidate.recommendation,
//           comments: candidate.analysis?.comments || candidate.comment,
//           additionalNotes: candidate.analysis?.additionalNotes || "",
//         },
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo,
//         created_at: new Date(),
//       }

//       const resume = new Resume(resumeData)
//       await resume.save()
//       savedResumes.push(resume)
//     }

//     const notification = new Notification({
//       message: `✅ ${candidates.length} candidates successfully added to workflow for ${job.context}`,
//       recipientId: recruiterId,
//       jobId: jobId,
//     })
//     await notification.save()

//     res.status(200).json({
//       success: true,
//       message: `🎉 ${savedResumes.length} candidates successfully added to workflow.`,
//     })
//   } catch (error) {
//     console.error("❌ Error adding candidates to workflow:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export async function deleteSearchHistoryItem(req, res) {
//   const { searchId } = req.params
//   const { recruiterId } = req.body

//   try {
//     if (!mongoose.Types.ObjectId.isValid(searchId)) {
//       return res.status(400).json({ success: false, error: "Invalid search ID" })
//     }

//     if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
//       return res.status(400).json({ success: false, error: "Invalid recruiter ID" })
//     }

//     const search = await SearchHistory.findOneAndDelete({
//       _id: searchId,
//       recruiterId: recruiterId,
//     })

//     if (!search) {
//       return res.status(404).json({
//         success: false,
//         error: "Search history item not found",
//       })
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Search history item deleted successfully",
//     })
//   } catch (error) {
//     console.error("❌ Error deleting search history item:", error.message)
//     return res.status(500).json({ success: false, error: "Server error" })
//   }
// }



// ---- previous working code but had problem in data model. mismatch in skills saved in resume schema database --------------------
// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Resume from "../../model/resumeModel.js"
// import Notification from "../../model/NotificationModal.js"
// import { io } from "../../index.js"
// import mongoose from "mongoose"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // --- SCHEMAS ---
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   results: [
//     {
//       candidateName: String,
//       email: String,
//       mobile: mongoose.Schema.Types.Mixed,
//       jobTitle: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "JobDescription",
//       },
//       companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//       currentCompany: String,
//       location: String,
//       skills: [String],
//       experience: String,
//       summary: String,
//       candidateStatus: String,
//       matchingScoreDetails: {
//         skillsMatch: Number,
//         experienceMatch: Number,
//         educationMatch: Number,
//         overallMatch: Number,
//       },
//       analysis: {
//         skills: {
//           candidateSkills: [String],
//           matched: [String],
//           notMatched: [String],
//         },
//         experience: {
//           relevantExperience: String,
//           yearsOfExperience: String,
//         },
//         education: {
//           highestDegree: String,
//           relevantCourses: [String],
//         },
//         projects: [String],
//         recommendation: String,
//         comments: String,
//         additionalNotes: String,
//       },
//       comment: String,
//       recommendation: {
//         type: String,
//         enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//       },
//       aiSourced: Boolean,
//       sourceInfo: {
//         platform: String,
//         profileUrl: String,
//         linkedinProfileUrl: String,
//         githubProfileUrl: String,
//         portfolioUrl: String,
//         dribbbleUrl: String,
//         behanceUrl: String,
//         mediumUrl: String,
//         twitterUrl: String,
//         personalWebsite: String,
//         sourcedAt: Date,
//         sourcedBy: mongoose.Schema.Types.ObjectId,
//         aiModel: String,
//         hasEmail: Boolean,
//         hasPhone: Boolean,
//       },
//     },
//   ],
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // --- UTILITY FUNCTIONS ---
// function cleanJsonResponse(responseText) {
//   const match = responseText.match(/```json([\s\S]*?)```/)
//   const cleanText = match ? match[1] : responseText
//   return cleanText
//     .replace(/```json\n|\n```/g, "")
//     .replace(/```/g, "")
//     .trim()
// }

// function isValidJson(str) {
//   try {
//     JSON.parse(str)
//     return true
//   } catch {
//     return false
//   }
// }

// // Enhanced progress emitter with more frequent updates
// function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "") {
//   const progressData = {
//     searchId,
//     status,
//     progress: Math.min(Math.max(progress, 0), 100),
//     candidatesFound,
//     platform,
//     timestamp: new Date().toISOString(),
//   }

//   console.log(`Progress Update [${searchId}]: ${progress}% - ${status} - ${candidatesFound} candidates`)
//   io.emit("searchProgress", progressData)
// }

// // --- AI-POWERED DYNAMIC JOB ANALYSIS AND SEARCH ---
// async function analyzeJobAndDeterminePlatforms(jobDescription, searchSettings) {
//   const prompt = `
//     You are an expert headhunter and recruitment strategist. Analyze this job posting and determine the best platforms and search strategies.

//     **Job Details:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Available Platforms:**
//     - linkedin: Professional networking, all industries
//     - github: Developers, engineers, technical roles
//     - google: General web search, resumes, portfolios, industry-specific sites
//     - dribbble: UI/UX designers, visual designers
//     - behance: Creative professionals, graphic designers, artists

//     **Your Task:**
//     1. Analyze the job requirements and determine the job category/industry
//     2. Identify the most relevant platforms for finding candidates
//     3. Suggest specialized websites or platforms that might be relevant
//     4. Determine search priorities and strategies

//     **Categories to consider:**
//     - Technology/Engineering (software, hardware, data, AI, etc.)
//     - Design/Creative (UI/UX, graphic, product, brand, etc.)
//     - Legal (lawyers, paralegals, compliance, etc.)
//     - Healthcare (doctors, nurses, medical professionals, etc.)
//     - Finance (analysts, accountants, investment, banking, etc.)
//     - Marketing/Sales (digital marketing, sales, PR, etc.)
//     - HR/Management (recruiters, managers, executives, etc.)
//     - Education (teachers, professors, trainers, etc.)
//     - Operations (logistics, supply chain, project management, etc.)
//     - Other professional roles

//     Return ONLY a valid JSON object:
//     {
//       "jobCategory": "Primary category of the job",
//       "jobSubcategory": "More specific subcategory",
//       "recommendedPlatforms": [
//         {
//           "platform": "platform_name",
//           "priority": "high|medium|low",
//           "reason": "Why this platform is recommended"
//         }
//       ],
//       "specializedSites": [
//         {
//           "site": "site_name_or_domain",
//           "description": "What type of professionals are found here"
//         }
//       ],
//       "searchKeywords": ["keyword1", "keyword2", "keyword3"],
//       "alternativeJobTitles": ["title1", "title2", "title3"],
//       "industrySpecificTerms": ["term1", "term2", "term3"]
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1000,
//       temperature: 0.3,
//       response_format: { type: "json_object" },
//     })

//     const analysis = JSON.parse(response.choices[0].message.content)
//     console.log("Job analysis completed:", analysis)
//     return analysis
//   } catch (error) {
//     console.error("Error analyzing job:", error.message)
//     return null
//   }
// }

// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are an expert headhunter and sourcing specialist. Your task is to generate 12 diverse, high-yield search engine queries to find top candidates for the given job on the specified platform.

//     **Job Information:**
//     - Position: ${jobDescription.context}
//     - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
//     - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Alternative Titles: ${jobAnalysis?.alternativeJobTitles?.join(", ") || ""}
//     - Industry Terms: ${jobAnalysis?.industrySpecificTerms?.join(", ") || ""}

//     **Platform to Target:** ${platform}

//     **Platform-Specific Instructions:**
//     ${getPlatformInstructions(platform, jobAnalysis)}

//     **Your Task & Query Generation Strategy:**
//     1.  **Think Step-by-Step**: Analyze all the provided job details. Brainstorm a list of core concepts, synonyms, and related technologies.
//     2.  **Use Advanced Operators**: Construct queries using boolean operators (AND, OR, NOT, ()), exact phrases (""), and wildcards (*).
//     3.  **Be Diverse**: Create a mix of queries. Some should be broad, some very specific. Combine skills, titles, and locations in different ways.
//     4.  **Focus on People**: The queries should be designed to find individual people's profiles, portfolios, or resumes.
//     5.  **Location Variations**: If a location is specified, include queries with the city, state, and metropolitan area. Also include remote/anywhere if applicable.
//     6.  **Examples of Query Types to Generate**:
//         - (Job Title OR Alt Title) AND (Skill1 AND Skill2) AND (Location)
//         - "resume" OR "cv" AND (Job Title) AND (Skill3) filetype:pdf
//         - (Job Title) AND ("portfolio" OR "personal website") AND (Skill1)
//         - (Company Type e.g., "startup" OR "agency") AND (Job Title) AND (Location)
//         - (Certification) AND (Job Title)
//         - (Skill1) AND (Skill2) AND (Skill3) AND ("contact" OR "email")

//     **Output:**
//     Return ONLY a valid JSON object containing a list of 12 query strings.
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8", "query9", "query10", "query11", "query12"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.7,
//       response_format: { type: "json_object" },
//     })

//     const content = JSON.parse(response.choices[0].message.content)
//     const queries = content.queries || []
//     console.log(`Generated ${queries.length} queries for ${platform}`)
//     return queries
//   } catch (error) {
//     console.error("Error generating search queries:", error.message)
//     return []
//   }
// }

// function getPlatformInstructions(platform, jobAnalysis) {
//   const category = jobAnalysis?.jobCategory?.toLowerCase() || ""

//   switch (platform) {
//     case "linkedin":
//       return `
//         LinkedIn is the primary professional network. Create queries that:
//         - Use LinkedIn's boolean search syntax with quotes and operators
//         - Target specific job titles, companies, and industries
//         - Include skill-based searches and certifications
//         - Use location filters and remote work keywords
//         - Target different company sizes and types
//         - Include industry-specific groups and associations
        
//         Examples for different categories:
//         - Legal: "Attorney" OR "Lawyer" OR "Legal Counsel" AND "Corporate Law"
//         - Healthcare: "Physician" OR "Doctor" OR "MD" AND "Cardiology"
//         - Finance: "Financial Analyst" OR "Investment" AND "CFA"
//         - HR: "Human Resources" OR "Talent Acquisition" AND "SHRM"
//       `

//     case "github":
//       return `
//         GitHub is for technical professionals. Create queries that:
//         - Search user profiles, bios, and repository descriptions
//         - Use programming languages, frameworks, and technologies
//         - Include location, followers, and activity filters
//         - Target specific project types and contributions
//         - Look for open source contributors and maintainers
        
//         Only use if the job has technical requirements or programming skills.
//       `

//     case "google":
//       return `
//         Google search finds resumes, portfolios, and professional websites. Create queries that:
//         - Search for resumes and CVs with filetype:pdf
//         - Find professional portfolios and personal websites
//         - Target industry-specific directories and associations
//         - Search for conference speakers and thought leaders
//         - Include company alumni and professional bios
//         - Use site-specific searches for relevant platforms
        
//         Examples:
//         - Legal: "attorney resume" filetype:pdf "corporate law"
//         - Healthcare: "physician CV" "cardiology" site:healthgrades.com
//         - Finance: "financial analyst" portfolio "investment banking"
//       `

//     case "dribbble":
//       return `
//         Dribbble is for visual designers and creatives. Only use for design roles.
//         Create queries that search for:
//         - UI/UX designers and their portfolios
//         - Visual design work and case studies
//         - Design specializations and tools
//         - Location-based designer searches
//       `

//     case "behance":
//       return `
//         Behance is for creative professionals. Only use for creative/design roles.
//         Create queries that search for:
//         - Creative portfolios and project showcases
//         - Graphic designers, artists, and creative directors
//         - Brand design and visual identity work
//         - Creative industry professionals
//       `

//     default:
//       return `Create platform-appropriate professional search queries.`
//   }
// }

// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     You are an expert at extracting professional information from web content. Analyze this content and extract comprehensive candidate information.

//     **CRITICAL REQUIREMENTS:**
//     1. **NO FAKE DATA**: Only extract information that is actually present in the text
//     2. **NULL FOR MISSING**: If information is not found, return null - do not guess or create data
//     3. **COMPREHENSIVE EXTRACTION**: Find all contact information and professional links
//     4. **ACCURATE PARSING**: Extract exact information as written

//     **Content Source:** ${url} (Platform: ${platform})
    
//     **Text Content:**
//     ---
//     ${pageText.substring(0, 10000)}
//     ---

//     **Extract the following information ONLY if clearly present:**
//     - Full name (as written)
//     - Email address (exact format)
//     - Phone number (exact format)
//     - Current job title and company
//     - Location (city, state, country)
//     - Professional skills and technologies
//     - Work experience and background
//     - Education and certifications
//     - All professional URLs (LinkedIn, GitHub, portfolio, etc.)
//     - Projects and achievements

//     **Return ONLY this JSON structure with actual data or null:**
//     {
//       "candidateName": "Exact full name or null",
//       "email": "exact.email@domain.com or null",
//       "mobile": "exact phone number or null",
//       "currentJobTitle": "Exact current title or null",
//       "currentCompany": "Exact company name or null",
//       "location": "Exact location or null",
//       "skills": ["actual", "skills", "found"] or [],
//       "summary": "Professional summary based on actual content or null",
//       "experience": "Work experience description or null",
//       "yearsOfExperience": "X years (only if clearly stated) or null",
//       "education": "Actual education information or null",
//       "projects": ["actual", "projects"] or [],
//       "sourceInfo": {
//         "profileUrl": "${url}",
//         "linkedinProfileUrl": "actual LinkedIn URL found or null",
//         "githubProfileUrl": "actual GitHub URL found or null",
//         "portfolioUrl": "actual portfolio URL found or null",
//         "dribbbleUrl": "actual Dribbble URL found or null",
//         "behanceUrl": "actual Behance URL found or null",
//         "twitterUrl": "actual Twitter URL found or null",
//         "mediumUrl": "actual Medium URL found or null",
//         "personalWebsite": "actual personal website URL found or null"
//       }
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.1,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)

//     // Validate that we have at least a name
//     if (!result || !result.candidateName) {
//       console.log(`No valid candidate data extracted from ${url}`)
//       return null
//     }

//     return {
//       id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       candidateName: result.candidateName,
//       email: result.email,
//       mobile: result.mobile,
//       currentJobTitle: result.currentJobTitle,
//       currentCompany: result.currentCompany,
//       location: result.location,
//       skills: result.skills || [],
//       summary: result.summary,
//       experience: result.experience,
//       yearsOfExperience: result.yearsOfExperience,
//       education: result.education,
//       projects: result.projects || [],
//       sourceInfo: {
//         platform,
//         profileUrl: url,
//         linkedinProfileUrl: result.sourceInfo?.linkedinProfileUrl,
//         githubProfileUrl: result.sourceInfo?.githubProfileUrl,
//         portfolioUrl: result.sourceInfo?.portfolioUrl,
//         dribbbleUrl: result.sourceInfo?.dribbbleUrl,
//         behanceUrl: result.sourceInfo?.behanceUrl,
//         twitterUrl: result.sourceInfo?.twitterUrl,
//         mediumUrl: result.sourceInfo?.mediumUrl,
//         personalWebsite: result.sourceInfo?.personalWebsite,
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//       },
//       matchScore: 0,
//     }
//   } catch (error) {
//     console.error("Error extracting candidate with AI:", error.message)
//     return null
//   }
// }

// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   // Only evaluate if we have sufficient candidate data
//   if (!candidate.candidateName) {
//     console.log("Skipping evaluation - insufficient candidate data")
//     return null
//   }

//   const prompt = `
//     Evaluate this candidate's fit for the job position. Provide honest, accurate assessment based on available information.

//     **Job Requirements:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}

//     **Candidate Information:**
//     - Name: ${candidate.candidateName}
//     - Current Title: ${candidate.currentJobTitle || "Not specified"}
//     - Company: ${candidate.currentCompany || "Not specified"}
//     - Location: ${candidate.location || "Not specified"}
//     - Skills: ${candidate.skills?.join(", ") || "Not specified"}
//     - Experience: ${candidate.yearsOfExperience || "Not specified"}
//     - Summary: ${candidate.summary || "Not available"}
//     - Education: ${candidate.education || "Not specified"}

//     **IMPORTANT:** 
//     - Only provide scores based on actual information available
//     - If information is missing, note it in your analysis
//     - Be honest about gaps in candidate information
//     - Don't make assumptions about missing data

//     Return ONLY this JSON structure:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100, based on actual skill comparison),
//         "experienceMatch": number (0-100, based on actual experience data),
//         "educationMatch": number (0-100, based on actual education data),
//         "overallMatch": number (0-100, weighted average)
//       },
//       "analysis": {
//         "skills": {
//           "candidateSkills": ["actual", "skills", "listed"],
//           "matched": ["skills", "that", "match"],
//           "notMatched": ["required", "skills", "missing"]
//         },
//         "experience": {
//           "relevantExperience": "description of relevant experience or 'Not available'",
//           "yearsOfExperience": "actual years mentioned or 'Not specified'"
//         },
//         "education": {
//           "highestDegree": "actual degree or 'Not specified'",
//           "relevantCourses": ["actual", "courses"] or []
//         },
//         "projects": ["actual", "projects"] or [],
//         "recommendation": "Honest recommendation based on available data",
//         "comments": "Honest assessment including data gaps",
//         "additionalNotes": "Any other relevant observations"
//       },
//       "comment": "Brief honest assessment",
//       "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 800,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)
//     return result
//   } catch (error) {
//     console.error("Error evaluating candidate:", error.message)
//     return null
//   }
// }

// // --- PLATFORM-SPECIFIC SEARCH FUNCTIONS ---
// async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
//   const candidates = new Map()
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!apiKey || !searchEngineId) {
//     console.warn("Google Search API not configured. Skipping Google search.")
//     return []
//   }

//   const platform = siteFilter.includes("linkedin")
//     ? "linkedin"
//     : siteFilter.includes("github")
//       ? "github"
//       : siteFilter.includes("dribbble")
//         ? "dribbble"
//         : siteFilter.includes("behance")
//           ? "behance"
//           : "google"

//   let totalResults = 0
//   const maxResultsPerQuery = 10
//   const targetCandidates = Math.ceil(searchSettings.candidateCount * 4)

//   console.log(`Starting Google search for ${platform} with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim()
//       console.log(`Google search ${i + 1}/${queries.length}: ${searchQuery}`)

//       // More frequent progress updates
//       emitProgress(
//         searchId,
//         `Searching ${platform}: "${searchQuery.substring(0, 50)}..."`,
//         20 + (i / queries.length) * 25,
//         candidates.size,
//         platform,
//       )

//       const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
//         params: {
//           key: apiKey,
//           cx: searchEngineId,
//           q: searchQuery,
//           num: maxResultsPerQuery,
//           start: 1,
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`Found ${response.data.items.length} results`)

//         for (const item of response.data.items) {
//           if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
//             // Update progress for each candidate being processed
//             emitProgress(
//               searchId,
//               `Processing: ${item.title?.substring(0, 40)}...`,
//               22 + (i / queries.length) * 25,
//               candidates.size,
//               platform,
//             )

//             const candidate = await extractCandidateFromUrl(item.link, platform)
//             if (candidate && candidate.candidateName) {
//               candidates.set(item.link, candidate)
//               totalResults++
//               console.log(`✅ Extracted: ${candidate.candidateName} (${candidates.size} total)`)

//               // Update progress with new candidate count
//               emitProgress(
//                 searchId,
//                 `Found candidate: ${candidate.candidateName}`,
//                 25 + (i / queries.length) * 25,
//                 candidates.size,
//                 platform,
//               )
//             }
//           }
//         }
//       }

//       // Small delay between requests
//       await new Promise((resolve) => setTimeout(resolve, 800))
//     } catch (error) {
//       console.error(`Search error for query "${query}":`, error.message)
//     }
//   }

//   console.log(`Search completed for ${platform}. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// async function searchLinkedIn(queries, searchSettings, searchId) {
//   const apiKey = process.env.LINKEDIN_API_KEY
//   if (apiKey) {
//     console.log("LinkedIn API key found. Using API search.")
//     return await searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey)
//   } else {
//     console.log("No LinkedIn API key. Using Google search for LinkedIn profiles.")
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
//   }
// }

// async function searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey) {
//   // This function is designed to work with a third-party LinkedIn API provider.
//   // You will need to sign up for a service (e.g., ProxyCurl, BrightData, etc.)
//   // and get an API key. The following code is an EXAMPLE using a structure
//   // similar to what you might get from such a service.

//   // --- EXAMPLE: Using a third-party LinkedIn API ---
//   console.log("--- Using LinkedIn API Search ---");

//   const candidates = new Map();
//   const targetCandidates = Math.ceil(searchSettings.candidateCount * 2);
//   const apiEndpoint = 'https://nubela.co/proxycurl/api/v2/linkedin'; // Example endpoint

//   // The queries generated by the AI are for general search engines.
//   // For a direct LinkedIn API, you might need to adapt them or, more likely,
//   // use the API's specific search/lookup capabilities.
//   // This example will iterate through the Google-style queries and try to find
//   // profile URLs, then look them up. A more advanced integration would use
//   // the provider's own search endpoint.

//   // For this example, we'll first use Google to find profile URLs, then use the API
//   // to enrich them. This is a common hybrid approach.
//   const linkedInUrls = new Set();
//   const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

//   if (!googleApiKey || !searchEngineId) {
//     console.warn("Google Search API not configured. Cannot find LinkedIn profiles to enrich.");
//     // Fallback to basic google search if no API key for enrichment is present
//     return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId);
//   }

//   for (const query of queries) {
//     if (linkedInUrls.size >= targetCandidates * 2) break; // Limit the number of profiles to find

//     const searchQuery = `${query} site:linkedin.com/in/`;
//     try {
//       const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
//         params: { key: googleApiKey, cx: searchEngineId, q: searchQuery, num: 10 },
//       });
//       if (response.data.items) {
//         response.data.items.forEach(item => {
//           if (item.link && item.link.includes('linkedin.com/in/')) {
//             linkedInUrls.add(item.link);
//           }
//         });
//       }
//     } catch (error) {
//       console.error(`Error finding LinkedIn URLs with query "${query}":`, error.message);
//     }
//   }

//   console.log(`Found ${linkedInUrls.size} potential LinkedIn profile URLs to enrich.`);

//   let processedCount = 0;
//   for (const url of linkedInUrls) {
//     if (candidates.size >= targetCandidates) break;

//     emitProgress(
//       searchId,
//       `Enriching LinkedIn profile...`,
//       50 + (processedCount / linkedInUrls.size) * 25,
//       candidates.size,
//       "linkedin-api"
//     );

//     try {
//       const response = await axios.get(apiEndpoint, {
//         headers: { 'Authorization': `Bearer ${apiKey}` },
//         params: {
//           url: url,
//           fallback_to_cache: 'on-error',
//           use_cache: 'if-present',
//           skills: 'include',
//           inferred_salary: 'include',
//           personal_email: 'include',
//           personal_contact_number: 'include',
//           twitter_profile_id: 'include',
//           facebook_profile_id: 'include',
//           github_profile_id: 'include',
//           extra: 'include'
//         },
//         timeout: 20000,
//       });

//       const profileData = response.data;

//       // IMPORTANT: The structure of `profileData` will depend on your API provider.
//       // You MUST adapt the following mapping to match the response you receive.
//       if (profileData && profileData.public_identifier && !candidates.has(profileData.public_identifier)) {
//         const candidate = {
//           id: `linkedin_${profileData.public_identifier}`,
//           candidateName: `${profileData.first_name} ${profileData.last_name}`,
//           email: profileData.personal_email, // This is often a premium feature
//           mobile: profileData.personal_contact_number, // This is often a premium feature
//           currentJobTitle: profileData.occupation,
//           currentCompany: profileData.experiences?.[0]?.company,
//           location: profileData.city,
//           skills: profileData.skills || [],
//           summary: profileData.summary,
//           experience: profileData.experiences?.map(exp => `${exp.title} at ${exp.company}`).join('\n'),
//           education: profileData.education?.map(edu => `${edu.degree_name}, ${edu.school}`).join('\n'),
//           sourceInfo: {
//             platform: 'linkedin',
//             profileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             linkedinProfileUrl: `https://www.linkedin.com/in/${profileData.public_identifier}`,
//             githubProfileUrl: profileData.github_profile_id ? `https://github.com/${profileData.github_profile_id}` : null,
//             twitterUrl: profileData.twitter_profile_id ? `https://twitter.com/${profileData.twitter_profile_id}` : null,
//             hasEmail: !!profileData.personal_email,
//             hasPhone: !!profileData.personal_contact_number,
//           },
//           matchScore: 0, // Will be calculated later
//         };
//         candidates.set(profileData.public_identifier, candidate);
//         console.log(`✅ Enriched via API: ${candidate.candidateName}`);
//       }
//     } catch (error) {
//       console.error(`Error enriching profile from ${url}:`, error.response ? error.response.data : error.message);
//     }
//     processedCount++;
//   }

//   console.log(`--- LinkedIn API search finished. Found ${candidates.size} candidates. ---`);
//   return Array.from(candidates.values());
// }

// async function searchGitHub(queries, searchSettings, searchId) {
//   const token = process.env.GITHUB_TOKEN
//   if (!token) {
//     console.log("GitHub token not configured. Using Google search.")
//     return await searchGoogle(queries, searchSettings, "site:github.com", searchId)
//   }

//   const candidates = new Map()
//   let totalResults = 0
//   const maxResultsPerQuery = 15
//   const targetCandidates = Math.ceil(searchSettings.candidateCount * 4)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       console.log(`GitHub API search: ${query}`)

//       emitProgress(
//         searchId,
//         `GitHub search: "${query.substring(0, 50)}..."`,
//         40 + (i / queries.length) * 25,
//         candidates.size,
//         "github",
//       )

//       const response = await axios.get(`https://api.github.com/search/users`, {
//         params: {
//           q: query,
//           per_page: maxResultsPerQuery,
//           sort: "repositories",
//           order: "desc",
//         },
//         headers: {
//           Authorization: `token ${token}`,
//           Accept: "application/vnd.github.v3+json",
//         },
//         timeout: 10000,
//       })

//       if (response.data.items) {
//         for (const user of response.data.items) {
//           if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
//             emitProgress(
//               searchId,
//               `Processing GitHub profile: ${user.login}`,
//               42 + (i / queries.length) * 25,
//               candidates.size,
//               "github",
//             )

//             const candidate = await extractCandidateFromUrl(user.html_url, "github")
//             if (candidate && candidate.candidateName) {
//               candidates.set(user.html_url, candidate)
//               totalResults++
//               console.log(`✅ GitHub candidate: ${candidate.candidateName}`)

//               emitProgress(
//                 searchId,
//                 `Found GitHub candidate: ${candidate.candidateName}`,
//                 45 + (i / queries.length) * 25,
//                 candidates.size,
//                 "github",
//               )
//             }
//           }
//         }
//       }

//       await new Promise((resolve) => setTimeout(resolve, 1200))
//     } catch (error) {
//       console.error(`GitHub search error:`, error.message)
//       if (error.response?.status === 403) {
//         await new Promise((resolve) => setTimeout(resolve, 5000))
//       }
//     }
//   }

//   return Array.from(candidates.values())
// }

// async function searchDribbble(queries, searchSettings, searchId) {
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
// }

// async function searchBehance(queries, searchSettings, searchId) {
//   return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
// }

// async function extractCandidateFromUrl(url, platform) {
//   try {
//     console.log(`Extracting from: ${url}`)

//     const { data } = await axios.get(url, {
//       timeout: 20000,
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//         "Accept-Language": "en-US,en;q=0.5",
//         Connection: "keep-alive",
//       },
//     })

//     const $ = load(data)
//     $("script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner").remove()

//     const text = $("body").text().replace(/\s+/g, " ").trim()

//     if (text.length < 200) {
//       console.log(`Insufficient content from ${url}`)
//       return null
//     }

//     const candidate = await extractCandidateWithAI(text, url, platform)
//     return candidate
//   } catch (error) {
//     console.error(`Error extracting from ${url}:`, error.message)
//     return null
//   }
// }

// // --- MAIN WORKFLOW ---
// function estimateSearchCost(candidateCount) {
//   const tokensPerCandidate = 800
//   const totalInputTokens = candidateCount * tokensPerCandidate
//   const totalOutputTokens = candidateCount * 500
//   const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000

//   return {
//     estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
//     model: "gpt-4o & gpt-4o-mini",
//     features: ["Dynamic Job Analysis", "AI Profile Extraction", "Smart Platform Selection", "Real Contact Discovery"],
//   }
// }

// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount = 10 } = req.query
//     const estimate = estimateSearchCost(Number.parseInt(candidateCount))
//     res.status(200).json({ success: true, estimate })
//   } catch (error) {
//     console.error("Error calculating cost estimate:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings, recruiterId } = req.body

//     if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
//       return res.status(400).json({
//         success: false,
//         error: "Missing required fields",
//       })
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const companyId = job.companyId
//     if (!companyId) {
//       return res.status(400).json({ success: false, error: "Company ID not found" })
//     }

//     const estimatedCost = estimateSearchCost(searchSettings.candidateCount)

//     const searchHistory = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       companyId,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "in_progress",
//       cost: {
//         estimatedCost: estimatedCost.estimatedCost,
//         actualCost: 0,
//         tokensUsed: 0,
//         apiCalls: 0,
//       },
//     })

//     await searchHistory.save()

//     res.status(200).json({
//       success: true,
//       message: "AI headhunter search started!",
//       searchId: searchHistory._id,
//       estimatedCost: estimatedCost,
//     })

//     performDynamicSearch(searchHistory._id, job, searchSettings, recruiterId)
//   } catch (error) {
//     console.error("Error starting search:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// async function performDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0
//   let totalApiCalls = 0

//   try {
//     console.log(`Starting dynamic search for: ${job.context}`)

//     // Step 1: Analyze job and determine best platforms
//     emitProgress(searchHistoryId, "Analyzing job requirements and determining search strategy...", 5, 0)

//     const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings)
//     totalApiCalls += 1
//     totalTokensUsed += 800

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements")
//     }

//     console.log(`Job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)
//     emitProgress(searchHistoryId, `Job analyzed as ${jobAnalysis.jobCategory} role. Preparing search...`, 10, 0)

//     // Step 2: Filter platforms based on analysis
//     const availablePlatforms = searchSettings.platforms
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 }
//         return priorityOrder[b.priority] - priorityOrder[a.priority]
//       })

//     console.log(
//       "Recommended platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority})`),
//     )

//     const allCandidates = []

//     // Step 3: Search each platform
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       const platformInfo = recommendedPlatforms[i]
//       const platform = platformInfo.platform

//       emitProgress(
//         searchHistoryId,
//         `Generating search queries for ${platform}...`,
//         15 + i * 20,
//         allCandidates.length,
//         platform,
//       )

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis)
//       totalApiCalls += 1
//       totalTokensUsed += 1000

//       if (queries.length === 0) {
//         console.log(`No queries generated for ${platform}`)
//         continue
//       }

//       emitProgress(
//         searchHistoryId,
//         `Searching ${platform} with ${queries.length} optimized queries...`,
//         18 + i * 20,
//         allCandidates.length,
//         platform,
//       )

//       let platformCandidates = []

//       switch (platform) {
//         case "google":
//           platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId)
//           break
//         case "linkedin":
//           platformCandidates = await searchLinkedIn(queries, searchSettings, searchHistoryId)
//           break
//         case "github":
//           platformCandidates = await searchGitHub(queries, searchSettings, searchHistoryId)
//           break
//         case "dribbble":
//           platformCandidates = await searchDribbble(queries, searchSettings, searchHistoryId)
//           break
//         case "behance":
//           platformCandidates = await searchBehance(queries, searchSettings, searchHistoryId)
//           break
//       }

//       totalApiCalls += platformCandidates.length
//       totalTokensUsed += platformCandidates.length * 1500

//       console.log(`Found ${platformCandidates.length} candidates on ${platform}`)
//       allCandidates.push(...platformCandidates)

//       emitProgress(
//         searchHistoryId,
//         `Completed ${platform} search. Found ${platformCandidates.length} candidates.`,
//         30 + i * 20,
//         allCandidates.length,
//         platform,
//       )
//     }

//     console.log(`Total candidates found: ${allCandidates.length}`)

//     // Step 4: Deduplicate candidates
//     emitProgress(searchHistoryId, "Removing duplicate candidates...", 75, allCandidates.length)
//     const uniqueCandidates = deduplicateCandidates(allCandidates)
//     console.log(`After deduplication: ${uniqueCandidates.length} unique candidates`)

//     // Step 5: Evaluate candidates
//     emitProgress(searchHistoryId, `Evaluating ${uniqueCandidates.length} candidates...`, 80, uniqueCandidates.length)

//     const evaluatedCandidates = []

//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i]

//       // More frequent evaluation progress updates
//       if (i % 2 === 0) {
//         emitProgress(
//           searchHistoryId,
//           `Evaluating candidate ${i + 1}/${uniqueCandidates.length}: ${candidate.candidateName}`,
//           80 + (i / uniqueCandidates.length) * 15,
//           uniqueCandidates.length,
//         )
//       }

//       const evaluation = await evaluateCandidateMatch(candidate, job, searchSettings)

//       if (evaluation) {
//         totalApiCalls += 1
//         totalTokensUsed += 600

//         candidate.matchScore = evaluation.matchingScoreDetails.overallMatch
//         candidate.matchingScoreDetails = evaluation.matchingScoreDetails
//         candidate.analysis = evaluation.analysis
//         candidate.comment = evaluation.comment
//         candidate.recommendation = evaluation.recommendation
//       }

//       candidate.jobTitle = job._id
//       candidate.companyId = job.companyId
//       candidate.candidateStatus = "AI Sourced"
//       candidate.aiSourced = true
//       candidate.sourceInfo.sourcedAt = new Date()
//       candidate.sourceInfo.sourcedBy = recruiterId
//       candidate.sourceInfo.aiModel = "gpt-4o"

//       evaluatedCandidates.push(candidate)

//       // Save to Resume collection
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: job._id,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo.profileUrl,
//         linkedinLink: candidate.sourceInfo.linkedinProfileUrl,
//         skills: candidate.skills,
//         experience: candidate.experience || candidate.summary,
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: candidate.analysis,
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo,
//         created_at: new Date(),
//       }

//       const resume = new Resume(resumeData)
//       await resume.save()
//     }

//     // Step 6: Sort and select final candidates
//     emitProgress(searchHistoryId, "Finalizing candidate selection...", 95, evaluatedCandidates.length)

//     const finalCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName) // Only candidates with names
//       .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
//       .slice(0, searchSettings.candidateCount)

//     console.log(`Final selection: ${finalCandidates.length} candidates`)

//     const actualCost = (totalTokensUsed * 0.0002) / 1000

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: "completed",
//       completedAt: new Date(),
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     emitProgress(
//       searchHistoryId,
//       `✅ Search completed! Found ${finalCandidates.length} candidates`,
//       100,
//       finalCandidates.length,
//     )

//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: finalCandidates,
//     })

//     const notification = new Notification({
//       message: `Search completed! Found ${finalCandidates.length} candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     })
//     await notification.save()

//     io.emit("newNotification", notification)
//   } catch (error) {
//     console.error("Search error:", error.message)

//     const partialCost = (totalTokensUsed * 0.0002) / 1000

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: "failed",
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: error.message,
//     })
//   }
// }

// function deduplicateCandidates(candidates) {
//   const uniqueMap = new Map()

//   for (const candidate of candidates) {
//     const keys = []

//     if (candidate.email) {
//       keys.push(`email_${candidate.email.toLowerCase()}`)
//     }

//     if (candidate.candidateName) {
//       keys.push(`name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`)
//     }

//     if (candidate.sourceInfo?.linkedinProfileUrl) {
//       keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.githubProfileUrl) {
//       keys.push(`github_${candidate.sourceInfo.githubProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.profileUrl) {
//       keys.push(`profile_${candidate.sourceInfo.profileUrl}`)
//     }

//     const existingKey = keys.find((key) => uniqueMap.has(key))

//     if (!existingKey) {
//       keys.forEach((key) => uniqueMap.set(key, candidate))
//     } else {
//       const existing = uniqueMap.get(existingKey)
//       mergeCandidateInfo(existing, candidate)
//     }
//   }

//   return Array.from(new Set(uniqueMap.values()))
// }

// function mergeCandidateInfo(existing, duplicate) {
//   if (!existing.email && duplicate.email) {
//     existing.email = duplicate.email
//   }

//   if (!existing.mobile && duplicate.mobile) {
//     existing.mobile = duplicate.mobile
//   }

//   if (duplicate.skills && duplicate.skills.length > 0) {
//     existing.skills = [...new Set([...(existing.skills || []), ...duplicate.skills])]
//   }

//   if (duplicate.sourceInfo) {
//     Object.keys(duplicate.sourceInfo).forEach((key) => {
//       if (duplicate.sourceInfo[key] && !existing.sourceInfo[key]) {
//         existing.sourceInfo[key] = duplicate.sourceInfo[key]
//       }
//     })
//   }

//   if (duplicate.summary && duplicate.summary.length > (existing.summary?.length || 0)) {
//     existing.summary = duplicate.summary
//   }
// }

// // Keep existing exports
// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params
//     const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20)
//     res.status(200).json({ success: true, searches })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" })
//     }
//     res.status(200).json({
//       success: true,
//       results: search.results,
//       searchDetails: search,
//     })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const addCandidatesToWorkflow = async (req, res) => {
//   try {
//     const { jobId, candidates, recruiterId } = req.body
//     if (!jobId || !candidates || !Array.isArray(candidates)) {
//       return res.status(400).json({ success: false, error: "Invalid request data" })
//     }

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const savedResumes = []
//     for (const candidate of candidates) {
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: jobId,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo?.profileUrl,
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//         skills: candidate.skills || [],
//         experience: candidate.experience || candidate.summary,
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: candidate.analysis,
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo,
//         created_at: new Date(),
//       }

//       const resume = new Resume(resumeData)
//       await resume.save()
//       savedResumes.push(resume)
//     }

//     const notification = new Notification({
//       message: `${candidates.length} candidates added to workflow for ${job.context}`,
//       recipientId: recruiterId,
//       jobId: jobId,
//     })
//     await notification.save()

//     res.status(200).json({
//       success: true,
//       message: `${savedResumes.length} candidates successfully added to workflow.`,
//     })
//   } catch (error) {
//     console.error("Error adding candidates to workflow:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export async function deleteSearchHistoryItem(req, res) {
//   const { searchId } = req.params
//   const { recruiterId } = req.body

//   try {
//     if (!mongoose.Types.ObjectId.isValid(searchId)) {
//       return res.status(400).json({ success: false, error: "Invalid search ID" })
//     }
//     if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
//       return res.status(400).json({ success: false, error: "Invalid recruiter ID" })
//     }

//     const search = await SearchHistory.findOneAndDelete({
//       _id: searchId,
//       recruiterId: recruiterId,
//     })

//     if (!search) {
//       return res.status(404).json({
//         success: false,
//         error: "Search history item not found",
//       })
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Search history item deleted successfully",
//     })
//   } catch (error) {
//     console.error("Error deleting search history item:", error.message)
//     return res.status(500).json({ success: false, error: "Server error" })
//   }
// }


// ------------------ working code with new card design and UI UX search platform added ------
// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Resume from "../../model/resumeModel.js"
// import Notification from "../../model/NotificationModal.js"
// import { io } from "../../index.js"
// import mongoose from "mongoose"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // --- SCHEMAS ---
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   results: [
//     {
//       candidateName: String,
//       email: String,
//       mobile: mongoose.Schema.Types.Mixed,
//       jobTitle: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "JobDescription",
//       },
//       companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//       currentCompany: String,
//       location: String,
//       skills: [String],
//       experience: String,
//       summary: String,
//       candidateStatus: String,
//       matchingScoreDetails: {
//         skillsMatch: Number,
//         experienceMatch: Number,
//         educationMatch: Number,
//         overallMatch: Number,
//       },
//       analysis: {
//         skills: {
//           candidateSkills: [String],
//           matched: [String],
//           notMatched: [String],
//         },
//         experience: {
//           relevantExperience: String,
//           yearsOfExperience: String,
//         },
//         education: {
//           highestDegree: String,
//           relevantCourses: [String],
//         },
//         projects: [String],
//         recommendation: String,
//         comments: String,
//         additionalNotes: String,
//       },
//       comment: String,
//       recommendation: {
//         type: String,
//         enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//       },
//       aiSourced: Boolean,
//       sourceInfo: {
//         platform: String,
//         profileUrl: String,
//         linkedinProfileUrl: String,
//         githubProfileUrl: String,
//         portfolioUrl: String,
//         dribbbleUrl: String,
//         behanceUrl: String,
//         mediumUrl: String,
//         twitterUrl: String,
//         personalWebsite: String,
//         sourcedAt: Date,
//         sourcedBy: mongoose.Schema.Types.ObjectId,
//         aiModel: String,
//         hasEmail: Boolean,
//         hasPhone: Boolean,
//       },
//     },
//   ],
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // --- UTILITY FUNCTIONS ---
// function cleanJsonResponse(responseText) {
//   const match = responseText.match(/```json([\s\S]*?)```/)
//   const cleanText = match ? match[1] : responseText
//   return cleanText
//     .replace(/```json\n|\n```/g, "")
//     .replace(/```/g, "")
//     .trim()
// }

// function isValidJson(str) {
//   try {
//     JSON.parse(str)
//     return true
//   } catch {
//     return false
//   }
// }

// // --- AI-POWERED DYNAMIC JOB ANALYSIS AND SEARCH ---
// async function analyzeJobAndDeterminePlatforms(jobDescription, searchSettings) {
//   const prompt = `
//     You are an expert headhunter and recruitment strategist. Analyze this job posting and determine the best platforms and search strategies.

//     **Job Details:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Industry Focus: ${searchSettings.industryFocus || ""}

//     **Available Platforms:**
//     - linkedin: Professional networking, all industries
//     - github: Developers, engineers, technical roles
//     - google: General web search, resumes, portfolios, industry-specific sites
//     - dribbble: UI/UX designers, visual designers
//     - behance: Creative professionals, graphic designers, artists

//     **Your Task:**
//     1. Analyze the job requirements and determine the job category/industry
//     2. Identify the most relevant platforms for finding candidates
//     3. Suggest specialized websites or platforms that might be relevant
//     4. Determine search priorities and strategies

//     **Categories to consider:**
//     - Technology/Engineering (software, hardware, data, AI, etc.)
//     - Design/Creative (UI/UX, graphic, product, brand, etc.)
//     - Legal (lawyers, paralegals, compliance, etc.)
//     - Healthcare (doctors, nurses, medical professionals, etc.)
//     - Finance (analysts, accountants, investment, banking, etc.)
//     - Marketing/Sales (digital marketing, sales, PR, etc.)
//     - HR/Management (recruiters, managers, executives, etc.)
//     - Education (teachers, professors, trainers, etc.)
//     - Operations (logistics, supply chain, project management, etc.)
//     - Other professional roles

//     Return ONLY a valid JSON object:
//     {
//       "jobCategory": "Primary category of the job",
//       "jobSubcategory": "More specific subcategory",
//       "recommendedPlatforms": [
//         {
//           "platform": "platform_name",
//           "priority": "high|medium|low",
//           "reason": "Why this platform is recommended"
//         }
//       ],
//       "specializedSites": [
//         {
//           "site": "site_name_or_domain",
//           "description": "What type of professionals are found here"
//         }
//       ],
//       "searchKeywords": ["keyword1", "keyword2", "keyword3"],
//       "alternativeJobTitles": ["title1", "title2", "title3"],
//       "industrySpecificTerms": ["term1", "term2", "term3"]
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1000,
//       temperature: 0.3,
//       response_format: { type: "json_object" },
//     })

//     const analysis = JSON.parse(response.choices[0].message.content)
//     console.log("Job analysis completed:", analysis)
//     return analysis
//   } catch (error) {
//     console.error("Error analyzing job:", error.message)
//     return null
//   }
// }

// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are an expert headhunter. Generate 10-12 highly optimized search queries for finding candidates on ${platform}.

//     **Job Information:**
//     - Position: ${jobDescription.context}
//     - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
//     - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Alternative Titles: ${jobAnalysis?.alternativeJobTitles?.join(", ") || ""}
//     - Industry Terms: ${jobAnalysis?.industrySpecificTerms?.join(", ") || ""}

//     **Platform-Specific Instructions for ${platform}:**
//     ${getPlatformInstructions(platform, jobAnalysis)}

//     **Requirements:**
//     1. Create diverse, specific queries that will find real professionals
//     2. Use industry-specific terminology and variations
//     3. Include different experience levels and seniority
//     4. Use proper search operators for the platform
//     5. Include location variations if specified
//     6. Target different types of organizations (startups, enterprises, agencies, etc.)
//     7. Include certification and qualification variations
//     8. Use synonyms and related job titles

//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8", "query9", "query10"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.7,
//       response_format: { type: "json_object" },
//     })

//     const content = JSON.parse(response.choices[0].message.content)
//     const queries = content.queries || []
//     console.log(`Generated ${queries.length} queries for ${platform}`)
//     return queries
//   } catch (error) {
//     console.error("Error generating search queries:", error.message)
//     return []
//   }
// }

// function getPlatformInstructions(platform, jobAnalysis) {
//   const category = jobAnalysis?.jobCategory?.toLowerCase() || ""

//   switch (platform) {
//     case "linkedin":
//       return `
//         LinkedIn is the primary professional network. Create queries that:
//         - Use LinkedIn's boolean search syntax with quotes and operators
//         - Target specific job titles, companies, and industries
//         - Include skill-based searches and certifications
//         - Use location filters and remote work keywords
//         - Target different company sizes and types
//         - Include industry-specific groups and associations
        
//         Examples for different categories:
//         - Legal: "Attorney" OR "Lawyer" OR "Legal Counsel" AND "Corporate Law"
//         - Healthcare: "Physician" OR "Doctor" OR "MD" AND "Cardiology"
//         - Finance: "Financial Analyst" OR "Investment" AND "CFA"
//         - HR: "Human Resources" OR "Talent Acquisition" AND "SHRM"
//       `

//     case "github":
//       return `
//         GitHub is for technical professionals. Create queries that:
//         - Search user profiles, bios, and repository descriptions
//         - Use programming languages, frameworks, and technologies
//         - Include location, followers, and activity filters
//         - Target specific project types and contributions
//         - Look for open source contributors and maintainers
        
//         Only use if the job has technical requirements or programming skills.
//       `

//     case "google":
//       return `
//         Google search finds resumes, portfolios, and professional websites. Create queries that:
//         - Search for resumes and CVs with filetype:pdf
//         - Find professional portfolios and personal websites
//         - Target industry-specific directories and associations
//         - Search for conference speakers and thought leaders
//         - Include company alumni and professional bios
//         - Use site-specific searches for relevant platforms
        
//         Examples:
//         - Legal: "attorney resume" filetype:pdf "corporate law"
//         - Healthcare: "physician CV" "cardiology" site:healthgrades.com
//         - Finance: "financial analyst" portfolio "investment banking"
//       `

//     case "dribbble":
//       return `
//         Dribbble is for visual designers and creatives. Only use for design roles.
//         Create queries that search for:
//         - UI/UX designers and their portfolios
//         - Visual design work and case studies
//         - Design specializations and tools
//         - Location-based designer searches
//       `

//     case "behance":
//       return `
//         Behance is for creative professionals. Only use for creative/design roles.
//         Create queries that search for:
//         - Creative portfolios and project showcases
//         - Graphic designers, artists, and creative directors
//         - Brand design and visual identity work
//         - Creative industry professionals
//       `

//     default:
//       return `Create platform-appropriate professional search queries.`
//   }
// }

// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     You are an expert at extracting professional information from web content. Analyze this content and extract comprehensive candidate information.

//     **CRITICAL REQUIREMENTS:**
//     1. **NO FAKE DATA**: Only extract information that is actually present in the text
//     2. **NULL FOR MISSING**: If information is not found, return null - do not guess or create data
//     3. **COMPREHENSIVE EXTRACTION**: Find all contact information and professional links
//     4. **ACCURATE PARSING**: Extract exact information as written

//     **Content Source:** ${url} (Platform: ${platform})
    
//     **Text Content:**
//     ---
//     ${pageText.substring(0, 10000)}
//     ---

//     **Extract the following information ONLY if clearly present:**
//     - Full name (as written)
//     - Email address (exact format)
//     - Phone number (exact format)
//     - Current job title and company
//     - Location (city, state, country)
//     - Professional skills and technologies
//     - Work experience and background
//     - Education and certifications
//     - All professional URLs (LinkedIn, GitHub, portfolio, etc.)
//     - Projects and achievements

//     **Return ONLY this JSON structure with actual data or null:**
//     {
//       "candidateName": "Exact full name or null",
//       "email": "exact.email@domain.com or null",
//       "mobile": "exact phone number or null",
//       "currentJobTitle": "Exact current title or null",
//       "currentCompany": "Exact company name or null",
//       "location": "Exact location or null",
//       "skills": ["actual", "skills", "found"] or [],
//       "summary": "Professional summary based on actual content or null",
//       "experience": "Work experience description or null",
//       "yearsOfExperience": "X years (only if clearly stated) or null",
//       "education": "Actual education information or null",
//       "projects": ["actual", "projects"] or [],
//       "sourceInfo": {
//         "profileUrl": "${url}",
//         "linkedinProfileUrl": "actual LinkedIn URL found or null",
//         "githubProfileUrl": "actual GitHub URL found or null",
//         "portfolioUrl": "actual portfolio URL found or null",
//         "dribbbleUrl": "actual Dribbble URL found or null",
//         "behanceUrl": "actual Behance URL found or null",
//         "twitterUrl": "actual Twitter URL found or null",
//         "mediumUrl": "actual Medium URL found or null",
//         "personalWebsite": "actual personal website URL found or null"
//       }
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.1,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)

//     // Validate that we have at least a name
//     if (!result || !result.candidateName) {
//       console.log(`No valid candidate data extracted from ${url}`)
//       return null
//     }

//     return {
//       id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       candidateName: result.candidateName,
//       email: result.email,
//       mobile: result.mobile,
//       currentJobTitle: result.currentJobTitle,
//       currentCompany: result.currentCompany,
//       location: result.location,
//       skills: result.skills || [],
//       summary: result.summary,
//       experience: result.experience,
//       yearsOfExperience: result.yearsOfExperience,
//       education: result.education,
//       projects: result.projects || [],
//       sourceInfo: {
//         platform,
//         profileUrl: url,
//         linkedinProfileUrl: result.sourceInfo?.linkedinProfileUrl,
//         githubProfileUrl: result.sourceInfo?.githubProfileUrl,
//         portfolioUrl: result.sourceInfo?.portfolioUrl,
//         dribbbleUrl: result.sourceInfo?.dribbbleUrl,
//         behanceUrl: result.sourceInfo?.behanceUrl,
//         twitterUrl: result.sourceInfo?.twitterUrl,
//         mediumUrl: result.sourceInfo?.mediumUrl,
//         personalWebsite: result.sourceInfo?.personalWebsite,
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//       },
//       matchScore: 0,
//     }
//   } catch (error) {
//     console.error("Error extracting candidate with AI:", error.message)
//     return null
//   }
// }

// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   // Only evaluate if we have sufficient candidate data
//   if (!candidate.candidateName) {
//     console.log("Skipping evaluation - insufficient candidate data")
//     return null
//   }

//   const prompt = `
//     Evaluate this candidate's fit for the job position. Provide honest, accurate assessment based on available information.

//     **Job Requirements:**
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}

//     **Candidate Information:**
//     - Name: ${candidate.candidateName}
//     - Current Title: ${candidate.currentJobTitle || "Not specified"}
//     - Company: ${candidate.currentCompany || "Not specified"}
//     - Location: ${candidate.location || "Not specified"}
//     - Skills: ${candidate.skills?.join(", ") || "Not specified"}
//     - Experience: ${candidate.yearsOfExperience || "Not specified"}
//     - Summary: ${candidate.summary || "Not available"}
//     - Education: ${candidate.education || "Not specified"}

//     **IMPORTANT:** 
//     - Only provide scores based on actual information available
//     - If information is missing, note it in your analysis
//     - Be honest about gaps in candidate information
//     - Don't make assumptions about missing data

//     Return ONLY this JSON structure:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100, based on actual skill comparison),
//         "experienceMatch": number (0-100, based on actual experience data),
//         "educationMatch": number (0-100, based on actual education data),
//         "overallMatch": number (0-100, weighted average)
//       },
//       "analysis": {
//         "skills": {
//           "candidateSkills": ["actual", "skills", "listed"],
//           "matched": ["skills", "that", "match"],
//           "notMatched": ["required", "skills", "missing"]
//         },
//         "experience": {
//           "relevantExperience": "description of relevant experience or 'Not available'",
//           "yearsOfExperience": "actual years mentioned or 'Not specified'"
//         },
//         "education": {
//           "highestDegree": "actual degree or 'Not specified'",
//           "relevantCourses": ["actual", "courses"] or []
//         },
//         "projects": ["actual", "projects"] or [],
//         "recommendation": "Honest recommendation based on available data",
//         "comments": "Honest assessment including data gaps",
//         "additionalNotes": "Any other relevant observations"
//       },
//       "comment": "Brief honest assessment",
//       "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended"
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 800,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)
//     return result
//   } catch (error) {
//     console.error("Error evaluating candidate:", error.message)
//     return null
//   }
// }

// // --- PLATFORM-SPECIFIC SEARCH FUNCTIONS ---
// async function searchGoogle(queries, searchSettings, siteFilter = "") {
//   const candidates = new Map()
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

//   if (!apiKey || !searchEngineId) {
//     console.warn("Google Search API not configured. Skipping Google search.")
//     return []
//   }

//   const platform = siteFilter.includes("linkedin")
//     ? "linkedin"
//     : siteFilter.includes("github")
//       ? "github"
//       : siteFilter.includes("dribbble")
//         ? "dribbble"
//         : siteFilter.includes("behance")
//           ? "behance"
//           : "google"

//   let totalResults = 0
//   const maxResultsPerQuery = 10
//   const targetCandidates = Math.ceil(searchSettings.candidateCount * 2)

//   console.log(`Starting Google search for ${platform} with ${queries.length} queries`)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim()
//       console.log(`Google search ${i + 1}/${queries.length}: ${searchQuery}`)

//       io.emit("searchProgress", {
//         status: `Searching: "${searchQuery.substring(0, 60)}..."`,
//         progress: 20 + (i / queries.length) * 30,
//         candidatesFound: candidates.size,
//       })

//       const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
//         params: {
//           key: apiKey,
//           cx: searchEngineId,
//           q: searchQuery,
//           num: maxResultsPerQuery,
//           start: 1,
//         },
//         timeout: 15000,
//       })

//       if (response.data.items) {
//         console.log(`Found ${response.data.items.length} results`)

//         for (const item of response.data.items) {
//           if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
//             const candidate = await extractCandidateFromUrl(item.link, platform)
//             if (candidate && candidate.candidateName) {
//               candidates.set(item.link, candidate)
//               totalResults++
//               console.log(`✅ Extracted: ${candidate.candidateName} (${candidates.size} total)`)
//             }
//           }
//         }
//       }

//       await new Promise((resolve) => setTimeout(resolve, 1000))
//     } catch (error) {
//       console.error(`Search error for query "${query}":`, error.message)
//     }
//   }

//   console.log(`Search completed. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// async function searchLinkedIn(queries, searchSettings) {
//   console.log("Searching LinkedIn profiles...")
//   return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/")
// }

// async function searchGitHub(queries, searchSettings) {
//   const token = process.env.GITHUB_TOKEN
//   if (!token) {
//     console.log("GitHub token not configured. Using Google search.")
//     return await searchGoogle(queries, searchSettings, "site:github.com")
//   }

//   const candidates = new Map()
//   let totalResults = 0
//   const maxResultsPerQuery = 15
//   const targetCandidates = Math.ceil(searchSettings.candidateCount * 2)

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       console.log(`GitHub API search: ${query}`)

//       const response = await axios.get(`https://api.github.com/search/users`, {
//         params: {
//           q: query,
//           per_page: maxResultsPerQuery,
//           sort: "repositories",
//           order: "desc",
//         },
//         headers: {
//           Authorization: `token ${token}`,
//           Accept: "application/vnd.github.v3+json",
//         },
//         timeout: 10000,
//       })

//       if (response.data.items) {
//         for (const user of response.data.items) {
//           if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
//             const candidate = await extractCandidateFromUrl(user.html_url, "github")
//             if (candidate && candidate.candidateName) {
//               candidates.set(user.html_url, candidate)
//               totalResults++
//               console.log(`✅ GitHub candidate: ${candidate.candidateName}`)
//             }
//           }
//         }
//       }

//       await new Promise((resolve) => setTimeout(resolve, 1200))
//     } catch (error) {
//       console.error(`GitHub search error:`, error.message)
//       if (error.response?.status === 403) {
//         await new Promise((resolve) => setTimeout(resolve, 5000))
//       }
//     }
//   }

//   return Array.from(candidates.values())
// }

// async function searchDribbble(queries, searchSettings) {
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com")
// }

// async function searchBehance(queries, searchSettings) {
//   return await searchGoogle(queries, searchSettings, "site:behance.net")
// }

// async function extractCandidateFromUrl(url, platform) {
//   try {
//     console.log(`Extracting from: ${url}`)

//     const { data } = await axios.get(url, {
//       timeout: 20000,
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//         "Accept-Language": "en-US,en;q=0.5",
//         Connection: "keep-alive",
//       },
//     })

//     const $ = load(data)
//     $("script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner").remove()

//     const text = $("body").text().replace(/\s+/g, " ").trim()

//     if (text.length < 200) {
//       console.log(`Insufficient content from ${url}`)
//       return null
//     }

//     const candidate = await extractCandidateWithAI(text, url, platform)
//     return candidate
//   } catch (error) {
//     console.error(`Error extracting from ${url}:`, error.message)
//     return null
//   }
// }

// // --- MAIN WORKFLOW ---
// function estimateSearchCost(candidateCount) {
//   const tokensPerCandidate = 800
//   const totalInputTokens = candidateCount * tokensPerCandidate
//   const totalOutputTokens = candidateCount * 500
//   const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000

//   return {
//     estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
//     model: "gpt-4o & gpt-4o-mini",
//     features: ["Dynamic Job Analysis", "AI Profile Extraction", "Smart Platform Selection", "Real Contact Discovery"],
//   }
// }

// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount = 10 } = req.query
//     const estimate = estimateSearchCost(Number.parseInt(candidateCount))
//     res.status(200).json({ success: true, estimate })
//   } catch (error) {
//     console.error("Error calculating cost estimate:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings, recruiterId } = req.body

//     if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
//       return res.status(400).json({
//         success: false,
//         error: "Missing required fields",
//       })
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const companyId = job.companyId
//     if (!companyId) {
//       return res.status(400).json({ success: false, error: "Company ID not found" })
//     }

//     const estimatedCost = estimateSearchCost(searchSettings.candidateCount)

//     const searchHistory = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       companyId,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "in_progress",
//       cost: {
//         estimatedCost: estimatedCost.estimatedCost,
//         actualCost: 0,
//         tokensUsed: 0,
//         apiCalls: 0,
//       },
//     })

//     await searchHistory.save()

//     res.status(200).json({
//       success: true,
//       message: "AI headhunter search started!",
//       searchId: searchHistory._id,
//       estimatedCost: estimatedCost,
//     })

//     performDynamicSearch(searchHistory._id, job, searchSettings, recruiterId)
//   } catch (error) {
//     console.error("Error starting search:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// async function performDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0
//   let totalApiCalls = 0

//   try {
//     console.log(`Starting dynamic search for: ${job.context}`)

//     // Step 1: Analyze job and determine best platforms
//     io.emit("searchProgress", {
//       searchId: searchHistoryId,
//       status: "Analyzing job requirements and determining search strategy...",
//       progress: 5,
//       candidatesFound: 0,
//     })

//     const jobAnalysis = await analyzeJobAndDeterminePlatforms(job, searchSettings)
//     totalApiCalls += 1
//     totalTokensUsed += 800

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements")
//     }

//     console.log(`Job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)

//     // Step 2: Filter platforms based on analysis
//     const availablePlatforms = searchSettings.platforms
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 }
//         return priorityOrder[b.priority] - priorityOrder[a.priority]
//       })

//     console.log(
//       "Recommended platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority})`),
//     )

//     const allCandidates = []

//     // Step 3: Search each platform
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       const platformInfo = recommendedPlatforms[i]
//       const platform = platformInfo.platform

//       io.emit("searchProgress", {
//         searchId: searchHistoryId,
//         status: `Generating search queries for ${platform}...`,
//         progress: 10 + i * 30,
//         platform: platform,
//         candidatesFound: allCandidates.length,
//       })

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis)
//       totalApiCalls += 1
//       totalTokensUsed += 1000

//       if (queries.length === 0) {
//         console.log(`No queries generated for ${platform}`)
//         continue
//       }

//       io.emit("searchProgress", {
//         searchId: searchHistoryId,
//         status: `Searching ${platform} with ${queries.length} queries...`,
//         progress: 15 + i * 30,
//         platform: platform,
//         candidatesFound: allCandidates.length,
//       })

//       let platformCandidates = []

//       switch (platform) {
//         case "google":
//           platformCandidates = await searchGoogle(queries, searchSettings)
//           break
//         case "linkedin":
//           platformCandidates = await searchLinkedIn(queries, searchSettings)
//           break
//         case "github":
//           platformCandidates = await searchGitHub(queries, searchSettings)
//           break
//         case "dribbble":
//           platformCandidates = await searchDribbble(queries, searchSettings)
//           break
//         case "behance":
//           platformCandidates = await searchBehance(queries, searchSettings)
//           break
//       }

//       totalApiCalls += platformCandidates.length
//       totalTokensUsed += platformCandidates.length * 1500

//       console.log(`Found ${platformCandidates.length} candidates on ${platform}`)
//       allCandidates.push(...platformCandidates)

//       io.emit("searchProgress", {
//         searchId: searchHistoryId,
//         status: `Found ${platformCandidates.length} candidates on ${platform}`,
//         progress: 25 + i * 30,
//         candidatesFound: allCandidates.length,
//       })
//     }

//     console.log(`Total candidates found: ${allCandidates.length}`)

//     // Step 4: Deduplicate candidates
//     const uniqueCandidates = deduplicateCandidates(allCandidates)
//     console.log(`After deduplication: ${uniqueCandidates.length} unique candidates`)

//     // Step 5: Evaluate candidates
//     io.emit("searchProgress", {
//       searchId: searchHistoryId,
//       status: `Evaluating ${uniqueCandidates.length} candidates...`,
//       progress: 80,
//       candidatesFound: uniqueCandidates.length,
//     })

//     const evaluatedCandidates = []

//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i]

//       const evaluation = await evaluateCandidateMatch(candidate, job, searchSettings)

//       if (evaluation) {
//         totalApiCalls += 1
//         totalTokensUsed += 600

//         candidate.matchScore = evaluation.matchingScoreDetails.overallMatch
//         candidate.matchingScoreDetails = evaluation.matchingScoreDetails
//         candidate.analysis = evaluation.analysis
//         candidate.comment = evaluation.comment
//         candidate.recommendation = evaluation.recommendation
//       }

//       candidate.jobTitle = job._id
//       candidate.companyId = job.companyId
//       candidate.candidateStatus = "AI Sourced"
//       candidate.aiSourced = true
//       candidate.sourceInfo.sourcedAt = new Date()
//       candidate.sourceInfo.sourcedBy = recruiterId
//       candidate.sourceInfo.aiModel = "gpt-4o"

//       evaluatedCandidates.push(candidate)

//       // Save to Resume collection
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: job._id,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo.profileUrl,
//         linkedinLink: candidate.sourceInfo.linkedinProfileUrl,
//         skills: candidate.skills,
//         experience: candidate.experience || candidate.summary,
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: candidate.analysis,
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo,
//         created_at: new Date(),
//       }

//       const resume = new Resume(resumeData)
//       await resume.save()

//       if (i % 5 === 0) {
//         io.emit("searchProgress", {
//           searchId: searchHistoryId,
//           status: `Evaluated ${i + 1}/${uniqueCandidates.length} candidates`,
//           progress: 80 + (i / uniqueCandidates.length) * 15,
//           candidatesFound: uniqueCandidates.length,
//         })
//       }
//     }

//     // Step 6: Sort and select final candidates
//     const finalCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName) // Only candidates with names
//       .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
//       .slice(0, searchSettings.candidateCount)

//     console.log(`Final selection: ${finalCandidates.length} candidates`)

//     const actualCost = (totalTokensUsed * 0.0002) / 1000

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: "completed",
//       completedAt: new Date(),
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: finalCandidates,
//     })

//     const notification = new Notification({
//       message: `Search completed! Found ${finalCandidates.length} candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     })
//     await notification.save()

//     io.emit("newNotification", notification)
//   } catch (error) {
//     console.error("Search error:", error.message)

//     const partialCost = (totalTokensUsed * 0.0002) / 1000

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: "failed",
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     })

//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: error.message,
//     })
//   }
// }

// function deduplicateCandidates(candidates) {
//   const uniqueMap = new Map()

//   for (const candidate of candidates) {
//     const keys = []

//     if (candidate.email) {
//       keys.push(`email_${candidate.email.toLowerCase()}`)
//     }

//     if (candidate.candidateName) {
//       keys.push(`name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`)
//     }

//     if (candidate.sourceInfo?.linkedinProfileUrl) {
//       keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.githubProfileUrl) {
//       keys.push(`github_${candidate.sourceInfo.githubProfileUrl}`)
//     }

//     if (candidate.sourceInfo?.profileUrl) {
//       keys.push(`profile_${candidate.sourceInfo.profileUrl}`)
//     }

//     const existingKey = keys.find((key) => uniqueMap.has(key))

//     if (!existingKey) {
//       keys.forEach((key) => uniqueMap.set(key, candidate))
//     } else {
//       const existing = uniqueMap.get(existingKey)
//       mergeCandidateInfo(existing, candidate)
//     }
//   }

//   return Array.from(new Set(uniqueMap.values()))
// }

// function mergeCandidateInfo(existing, duplicate) {
//   if (!existing.email && duplicate.email) {
//     existing.email = duplicate.email
//   }

//   if (!existing.mobile && duplicate.mobile) {
//     existing.mobile = duplicate.mobile
//   }

//   if (duplicate.skills && duplicate.skills.length > 0) {
//     existing.skills = [...new Set([...(existing.skills || []), ...duplicate.skills])]
//   }

//   if (duplicate.sourceInfo) {
//     Object.keys(duplicate.sourceInfo).forEach((key) => {
//       if (duplicate.sourceInfo[key] && !existing.sourceInfo[key]) {
//         existing.sourceInfo[key] = duplicate.sourceInfo[key]
//       }
//     })
//   }

//   if (duplicate.summary && duplicate.summary.length > (existing.summary?.length || 0)) {
//     existing.summary = duplicate.summary
//   }
// }

// // Keep existing exports
// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params
//     const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20)
//     res.status(200).json({ success: true, searches })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" })
//     }
//     res.status(200).json({
//       success: true,
//       results: search.results,
//       searchDetails: search,
//     })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const addCandidatesToWorkflow = async (req, res) => {
//   try {
//     const { jobId, candidates, recruiterId } = req.body
//     if (!jobId || !candidates || !Array.isArray(candidates)) {
//       return res.status(400).json({ success: false, error: "Invalid request data" })
//     }

//     const job = await JobDescription.findById(jobId)
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" })
//     }

//     const savedResumes = []
//     for (const candidate of candidates) {
//       const resumeData = {
//         candidateName: candidate.candidateName,
//         email: candidate.email,
//         mobile: candidate.mobile,
//         jobTitle: jobId,
//         companyId: job.companyId,
//         companyName: candidate.currentCompany,
//         resumeLink: candidate.sourceInfo?.profileUrl,
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl,
//         skills: candidate.skills || [],
//         experience: candidate.experience || candidate.summary,
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         matchingScoreDetails: candidate.matchingScoreDetails,
//         analysis: candidate.analysis,
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo,
//         created_at: new Date(),
//       }

//       const resume = new Resume(resumeData)
//       await resume.save()
//       savedResumes.push(resume)
//     }

//     const notification = new Notification({
//       message: `${candidates.length} candidates added to workflow for ${job.context}`,
//       recipientId: recruiterId,
//       jobId: jobId,
//     })
//     await notification.save()

//     res.status(200).json({
//       success: true,
//       message: `${savedResumes.length} candidates successfully added to workflow.`,
//     })
//   } catch (error) {
//     console.error("Error adding candidates to workflow:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export async function deleteSearchHistoryItem(req, res) {
//   const { searchId } = req.params
//   const { recruiterId } = req.body

//   try {
//     if (!mongoose.Types.ObjectId.isValid(searchId)) {
//       return res.status(400).json({ success: false, error: "Invalid search ID" })
//     }
//     if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
//       return res.status(400).json({ success: false, error: "Invalid recruiter ID" })
//     }

//     const search = await SearchHistory.findOneAndDelete({
//       _id: searchId,
//       recruiterId: recruiterId,
//     })

//     if (!search) {
//       return res.status(404).json({
//         success: false,
//         error: "Search history item not found",
//       })
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Search history item deleted successfully",
//     })
//   } catch (error) {
//     console.error("Error deleting search history item:", error.message)
//     return res.status(500).json({ success: false, error: "Server error" })
//   }
// }



// ------- test code --------------------
// import { OpenAI } from "openai";
// import axios from "axios";
// import { load } from "cheerio";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import Resume from "../../model/resumeModel.js";
// import Notification from "../../model/NotificationModal.js";
// import { io } from "../../index.js";
// import mongoose from "mongoose";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // --- SCHEMAS ---
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   results: [
//     {
//       id: String,
//       name: String,
//       title: String,
//       company: String,
//       location: String,
//       skills: [String],
//       summary: String,
//       email: String,
//       phone: String,
//       linkedinProfileUrl: String,
//       portfolioUrl: String,
//       githubUrl: String,
//       profileUrl: String,
//       platform: String,
//       matchScore: Number,
//     },
//   ],
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
// });

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema);

// // --- UTILITY FUNCTIONS ---
// function cleanJsonResponse(responseText) {
//   const match = responseText.match(/```json([\s\S]*?)```/);
//   const cleanText = match ? match[1] : responseText;
//   return cleanText
//     .replace(/```json\n|\n```/g, "")
//     .replace(/```/g, "")
//     .trim();
// }

// function isValidJson(str) {
//   try {
//     JSON.parse(str);
//     return true;
//   } catch {
//     return false;
//   }
// }

// // --- AI-POWERED SEARCH & EXTRACTION ---
// async function generateSearchQueries(jobDescription, platform, searchSettings) {
//   const isTechJob = jobDescription.jobType === 'tech' || 
//     jobDescription.requiredSkills?.some(skill => 
//       ['javascript', 'python', 'java', 'react', 'node', 'aws', 'developer', 'engineer', 'programming'].some(techKeyword => 
//         skill.toLowerCase().includes(techKeyword)
//       )
//     ) ||
//     jobDescription.context.toLowerCase().includes('developer') ||
//     jobDescription.context.toLowerCase().includes('engineer') ||
//     jobDescription.context.toLowerCase().includes('programmer');

//   const prompt = `
//     You are an expert headhunter's assistant. Generate 8-10 highly optimized and diverse search queries for finding top candidates on ${platform}.

//     Job Details:
//     - Position: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || ""}
//     - Exclude Keywords: ${searchSettings.excludeKeywords || ""}
//     - Job Type: ${isTechJob ? "Technical" : "Non-Technical"}

//     Platform-Specific Instructions:
//     ${
//       isTechJob
//         ? `
//     ${platform === "linkedin" ? `- Use LinkedIn-friendly boolean search strings with variations. For example: '("Software Engineer" OR "Developer" OR "Programmer") AND ("Node.js" OR "JavaScript") AND "${searchSettings.location || "Remote"}"'` : ""}
//     ${platform === "github" ? `- Use GitHub search syntax with different combinations. Focus on user bios, locations, languages, and followers. For example: 'language:javascript location:"${searchSettings.location || "worldwide"}" followers:>10'` : ""}
//     ${platform === "google" ? `- Create diverse web search queries to find resumes, portfolios, and profiles. Use different file types and keywords. For example: '("${jobDescription.context}" OR "software developer") resume filetype:pdf "${searchSettings.location || ""}"'` : ""}
//     `
//         : `
//     ${platform === "linkedin" ? `- Use LinkedIn to find professionals. For a ${jobDescription.context} role, search for profiles with titles like "${jobDescription.context}", include relevant industry keywords and experience levels.` : ""}
//     ${platform === "google" ? `- Use Google to find industry-specific portfolios and resumes. For non-tech roles like marketing, legal, design, or sales, focus on:
//         - Marketing: "marketing manager" OR "digital marketing" OR "brand manager" resume filetype:pdf
//         - Legal: "attorney" OR "lawyer" OR "legal counsel" resume site:law.com OR site:martindale.com
//         - Design: "UI designer" OR "graphic designer" portfolio site:behance.net OR site:dribbble.com
//         - Sales: "sales director" OR "account manager" OR "business development" resume
//         - HR: "human resources" OR "HR manager" OR "talent acquisition" resume
//         - Finance: "financial analyst" OR "accountant" OR "controller" resume
//         - Operations: "operations manager" OR "project manager" OR "process improvement" resume` : ""}
//     `
//     }

//     Make queries diverse by:
//     1. Using different keyword combinations and synonyms.
//     2. Varying search operators and syntax.
//     3. Targeting different experience levels.
//     4. Including industry-specific terms.
//     5. Using different job title variations.
//     ${!isTechJob ? `6. For non-tech roles, include industry-specific websites and platforms where these professionals are commonly found.` : ""}

//     Return ONLY a valid JSON object with a "queries" key containing an array of strings. Example: {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8"]}
//   `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.7,
//       response_format: { type: "json_object" },
//     });

//     const content = JSON.parse(response.choices[0].message.content);
//     const queries = content.queries || [jobDescription.context];
//     console.log(`Generated ${queries.length} queries for ${platform}:`, queries);
//     return queries;
//   } catch (error) {
//     console.error("Error generating search queries:", error.message);
//     const fallbackQueries = [
//       `"${jobDescription.context}" ${searchSettings.location || ""}`,
//       `${jobDescription.context} ${searchSettings.keywords || ""}`,
//       `senior ${jobDescription.context.toLowerCase()}`,
//       `${jobDescription.context} ${searchSettings.experienceLevel}`,
//     ];
//     return fallbackQueries;
//   }
// }

// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     Analyze the following text from a professional profile/resume found at ${url} on ${platform}.
//     Extract the candidate's information into a structured JSON object.

//     **CRITICAL: For LinkedIn profiles, pay special attention to:**
//     1. **Email Extraction**: Look for email addresses in contact sections, about sections, or any visible text. Common patterns include:
//        - Direct email mentions: "Contact me at john@company.com"
//        - Email in bio: "Reach out: john.doe@email.com"
//        - Work email references: "john@company.com"
//     2. **LinkedIn URL**: Extract the actual LinkedIn profile URL if different from the source URL
//     3. **Contact Information**: Look for phone numbers, alternative contact methods

//     **Instructions:**
//     1. **Infer Information:** Intelligently infer the candidate's current title, company, and skills from the text.
//     2. **Find Contact Info:** Locate an email address and a phone number if available.
//     3. **Summarize:** Create a concise, professional summary (2-3 sentences) based on their experience.
//     4. **Find Specific URLs:** Look for:
//        - LinkedIn profile URL (https://linkedin.com/in/username or similar)
//        - Personal portfolio/website URL
//        - GitHub profile URL (https://github.com/username or similar)
//     5. **Be Accurate:** If a piece of information is not found, return null for that field. Do not invent data.
//     6. **Skills Extraction:** Extract relevant skills, tools, and qualifications. For non-tech roles, this could include certifications, legal specializations, or design software.
//     7. **Name Extraction:** Extract the full name, handle GitHub usernames or LinkedIn names appropriately.

//     **Text Content:**
//     ---
//     ${pageText.substring(0, 6000)}
//     ---

//     Return ONLY a valid JSON object with the following structure. Do not include any other text or markdown.
//     {
//       "name": "Full Name or Username",
//       "title": "Current Job Title or Role",
//       "company": "Current Company",
//       "location": "City, Country",
//       "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"],
//       "summary": "A 2-3 sentence professional summary highlighting key experience and expertise.",
//       "email": "email@domain.com",
//       "phone": "+1-555-555-5555",
//       "linkedinProfileUrl": "https://www.linkedin.com/in/username",
//       "portfolioUrl": "https://username.github.io",
//       "githubUrl": "https://github.com/username"
//     }
//   `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1500,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     });

//     const result = JSON.parse(response.choices[0].message.content);
//     if (result && (result.name || result.title)) {
//       return {
//         id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//         name: result.name || "Unknown",
//         title: result.title || "No title",
//         company: result.company || null,
//         location: result.location || null,
//         skills: result.skills || [],
//         summary: result.summary || "No summary available",
//         email: result.email || null,
//         phone: result.phone || null,
//         linkedinProfileUrl: result.linkedinProfileUrl || null,
//         portfolioUrl: result.portfolioUrl || null,
//         githubUrl: result.githubUrl || null,
//         profileUrl: url,
//         platform,
//         matchScore: 0,
//       };
//     }
//     return null;
//   } catch (error) {
//     console.error("Error extracting candidate with AI:", error.message);
//     return null;
//   }
// }

// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   const prompt = `
//     Evaluate how well this candidate profile matches the job requirements on a scale of 0-100.

//     **Job Requirements:**
//     - Title: ${jobDescription.context}
//     - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "N/A"}
//     - Experience Level: ${searchSettings.experienceLevel}
//     - Location: ${searchSettings.location || "Any"}
//     - Keywords: ${searchSettings.keywords || "N/A"}

//     **Candidate Profile:**
//     - Name: ${candidate.name}
//     - Title: ${candidate.title}
//     - Company: ${candidate.company || "N/A"}
//     - Location: ${candidate.location || "N/A"}
//     - Skills: ${candidate.skills?.join(", ") || "N/A"}
//     - Summary: ${candidate.summary}

//     **Evaluation Criteria:**
//     - Skills Match (40%): How well do the candidate's skills align with the required skills?
//     - Experience & Title Match (30%): Does their title and summary reflect the required experience level?
//     - Location Match (15%): Is the candidate in or willing to relocate to the specified location?
//     - Overall Profile Quality (15%): General impression of the candidate's background and experience depth.

//     Consider:
//     - Exact skill matches should score higher.
//     - Related/transferable skills should get partial credit.
//     - For non-tech roles, consider portfolio quality, case studies, or relevant experience.

//     Return ONLY a single number (the match score) and nothing else.
//   `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 10,
//       temperature: 0.1,
//     });

//     const score = Number.parseInt(response.choices[0].message.content.trim());
//     return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
//   } catch (error) {
//     console.error("Error evaluating candidate:", error.message);
//     return 50;
//   }
// }

// // --- PLATFORM-SPECIFIC SEARCH FUNCTIONS ---
// async function searchGoogle(queries, searchSettings, siteFilter = "") {
//   const candidates = new Map();
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

//   if (!apiKey || !searchEngineId) {
//     console.warn("Google Search API not configured. Skipping Google search.");
//     return [];
//   }

//   const platform = siteFilter.includes("linkedin") ? "linkedin" : "google";
//   let totalResults = 0;
//   const maxResultsPerQuery = 10;
//   const targetCandidates = Math.ceil(searchSettings.candidateCount * 1.5);

//   console.log(
//     `Starting Google search for ${platform} with ${queries.length} queries, targeting ${targetCandidates} candidates`,
//   );

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i];
//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim();
//       console.log(`Google search ${i + 1}/${queries.length}: ${searchQuery}`);

//       io.emit("searchProgress", {
//         status: `Google search ${i + 1}/${queries.length}: "${searchQuery.substring(0, 50)}..."`,
//         progress: 20 + (i / queries.length) * 30,
//         candidatesFound: candidates.size,
//       });

//       const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
//         params: {
//           key: apiKey,
//           cx: searchEngineId,
//           q: searchQuery,
//           num: maxResultsPerQuery,
//           start: 1,
//         },
//         timeout: 10000,
//       });

//       if (response.data.items) {
//         console.log(`Found ${response.data.items.length} results for query: ${searchQuery}`);

//         for (const item of response.data.items) {
//           if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
//             io.emit("searchProgress", {
//               status: `Processing: ${item.title?.substring(0, 50)}...`,
//               progress: 25 + (i / queries.length) * 30,
//               candidatesFound: candidates.size,
//             });

//             const candidate = await extractCandidateFromUrl(item.link, platform);
//             if (candidate && candidate.name && candidate.name !== "Unknown") {
//               candidates.set(item.link, candidate);
//               totalResults++;
//               console.log(`✅ Extracted candidate: ${candidate.name} from ${platform} (${candidates.size} total)`);
//             } else {
//               console.log(`❌ Failed to extract valid candidate from ${item.link}`);
//             }
//           }
//         }
//       } else {
//         console.log(`No results found for query: ${searchQuery}`);
//       }

//       await new Promise((resolve) => setTimeout(resolve, 1000));
//     } catch (error) {
//       console.error(`Google search error for query "${query}":`, error.message);
//     }
//   }

//   console.log(`Google search completed for ${platform}. Found ${candidates.size} unique candidates.`);
//   return Array.from(candidates.values());
// }

// async function searchLinkedIn(queries, searchSettings) {
//   console.log("LinkedIn search: Using enhanced Google search for LinkedIn profiles");
  
//   // Enhanced LinkedIn-specific queries with better extraction
//   const linkedinQueries = queries.map((query) => {
//     return `${query} site:linkedin.com/in/ -site:linkedin.com/company/`;
//   });

//   // Add additional specific LinkedIn searches
//   const enhancedQueries = [
//     ...linkedinQueries,
//     `"${searchSettings.keywords}" site:linkedin.com/in/ ${searchSettings.location}`,
//     `"${searchSettings.experienceLevel}" "${queries[0]}" site:linkedin.com/in/`,
//   ].filter(Boolean);

//   return await searchGoogle(enhancedQueries, searchSettings, "");
// }

// async function searchGitHub(queries, searchSettings) {
//   const candidates = new Map();
//   const token = process.env.GITHUB_TOKEN;

//   if (!token) {
//     console.warn("GitHub token not configured. Skipping GitHub search.");
//     return [];
//   }

//   let totalResults = 0;
//   const maxResultsPerQuery = 20;
//   const targetCandidates = Math.ceil(searchSettings.candidateCount * 1.5);

//   console.log(`Starting GitHub search with ${queries.length} queries, targeting ${targetCandidates} candidates`);

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i];
//     try {
//       console.log(`GitHub search ${i + 1}/${queries.length}: ${query}`);

//       io.emit("searchProgress", {
//         status: `GitHub search ${i + 1}/${queries.length}: "${query.substring(0, 50)}..."`,
//         progress: 40 + (i / queries.length) * 30,
//         candidatesFound: candidates.size,
//       });

//       const response = await axios.get(`https://api.github.com/search/users`, {
//         params: {
//           q: query,
//           per_page: maxResultsPerQuery,
//           sort: "repositories",
//           order: "desc",
//         },
//         headers: {
//           Authorization: `token ${token}`,
//           Accept: "application/vnd.github.v3+json",
//         },
//         timeout: 10000,
//       });

//       if (response.data.items) {
//         console.log(`Found ${response.data.items.length} GitHub users for query: ${query}`);

//         for (const user of response.data.items) {
//           if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
//             io.emit("searchProgress", {
//               status: `Processing GitHub profile: ${user.login}`,
//               progress: 45 + (i / queries.length) * 30,
//               candidatesFound: candidates.size,
//             });

//             const candidate = await extractCandidateFromUrl(user.html_url, "github");
//             if (candidate && candidate.name && candidate.name !== "Unknown") {
//               candidates.set(user.html_url, candidate);
//               totalResults++;
//               console.log(`✅ Extracted GitHub candidate: ${candidate.name} (${candidates.size} total)`);
//             } else {
//               console.log(`❌ Failed to extract valid candidate from ${user.html_url}`);
//             }
//           }
//         }
//       } else {
//         console.log(`No GitHub users found for query: ${query}`);
//       }

//       await new Promise((resolve) => setTimeout(resolve, 1200));
//     } catch (error) {
//       console.error(`GitHub search error for query "${query}":`, error.message);
//       if (error.response?.status === 403) {
//         console.log("GitHub rate limit hit, waiting longer...");
//         await new Promise((resolve) => setTimeout(resolve, 5000));
//       }
//     }
//   }

//   console.log(`GitHub search completed. Found ${candidates.size} unique candidates.`);
//   return Array.from(candidates.values());
// }

// async function extractCandidateFromUrl(url, platform) {
//   try {
//     console.log(`Extracting candidate from: ${url}`);

//     const { data } = await axios.get(url, {
//       timeout: 15000,
//       headers: {
//         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
//         Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
//         "Accept-Language": "en-US,en;q=0.5",
//         "Accept-Encoding": "gzip, deflate",
//         Connection: "keep-alive",
//       },
//     });

//     const $ = load(data);

//     // Remove script and style elements
//     $("script, style, nav, footer, .sidebar").remove();

//     const text = $("body").text().replace(/\s+/g, " ").trim();

//     if (text.length < 100) {
//       console.log(`Skipping ${url} - insufficient content (${text.length} chars)`);
//       return null;
//     }

//     const candidate = await extractCandidateWithAI(text, url, platform);
//     if (candidate) {
//       console.log(`Successfully extracted: ${candidate.name} from ${platform}`);
//     }
//     return candidate;
//   } catch (error) {
//     console.error(`Error scraping URL ${url}:`, error.message);
//     return null;
//   }
// }

// // --- MAIN WORKFLOW & EXPORTS ---
// function estimateSearchCost(candidateCount) {
//   const tokensPerCandidate = 400;
//   const totalInputTokens = candidateCount * tokensPerCandidate;
//   const totalOutputTokens = candidateCount * 250;
//   const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000;

//   return {
//     estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
//     model: "gpt-4o-mini & gpt-4o",
//     features: ["Multi-Platform Search", "AI Profile Extraction", "Smart Matching"],
//   };
// }

// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount = 10 } = req.query;
//     const estimate = estimateSearchCost(Number.parseInt(candidateCount));
//     res.status(200).json({ success: true, estimate });
//   } catch (error) {
//     console.error("Error calculating cost estimate:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings, recruiterId } = req.body;

//     console.log("Starting headhunter search with settings:", searchSettings);

//     if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
//       return res.status(400).json({
//         success: false,
//         error: "Missing required fields, including at least one platform.",
//       });
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50);

//     const job = await JobDescription.findById(jobId);
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" });
//     }

//     const estimatedCost = estimateSearchCost(searchSettings.candidateCount);

//     const searchHistory = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       companyId: job.companyId,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "in_progress",
//       cost: {
//         estimatedCost: estimatedCost.estimatedCost,
//         actualCost: 0,
//         tokensUsed: 0,
//         apiCalls: 0,
//       },
//     });

//     await searchHistory.save();

//     res.status(200).json({
//       success: true,
//       message: "AI headhunter search initiated!",
//       searchId: searchHistory._id,
//       estimatedCost: estimatedCost,
//     });

//     performSearch(searchHistory._id, job, searchSettings, recruiterId);
//   } catch (error) {
//     console.error("Error starting headhunter search:", error.message);
//     res.status(500).json({ success: false, error: "Internal server error starting search." });
//   }
// };

// async function performSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0;
//   let totalApiCalls = 0;

//   try {
//     console.log(`Starting search for job: ${job.context} with settings:`, searchSettings);

//     io.emit("searchProgress", {
//       searchId: searchHistoryId,
//       status: "Initializing search...",
//       progress: 5,
//       current: 0,
//       total: searchSettings.platforms.length,
//       candidatesFound: 0,
//     });

//     const allCandidates = [];
//     const platforms = searchSettings.platforms;

//     for (let i = 0; i < platforms.length; i++) {
//       const platform = platforms[i];

//       io.emit("searchProgress", {
//         searchId: searchHistoryId,
//         status: `Generating intelligent queries for ${platform}...`,
//         progress: 10 + i * 25,
//         current: i,
//         total: platforms.length,
//         platform: platform,
//         candidatesFound: allCandidates.length,
//       });

//       const queries = await generateSearchQueries(job, platform, searchSettings);
//       totalApiCalls += 1;
//       totalTokensUsed += 800;
//       console.log(`Generated ${queries.length} queries for ${platform}`);

//       io.emit("searchProgress", {
//         searchId: searchHistoryId,
//         status: `Searching ${platform} with ${queries.length} queries...`,
//         progress: 15 + i * 25,
//         current: i,
//         total: platforms.length,
//         platform: platform,
//         candidatesFound: allCandidates.length,
//       });

//       let platformCandidates = [];
//       switch (platform) {
//         case "google":
//           platformCandidates = await searchGoogle(queries, searchSettings);
//           break;
//         case "linkedin":
//           platformCandidates = await searchLinkedIn(queries, searchSettings);
//           break;
//         case "github":
//           platformCandidates = await searchGitHub(queries, searchSettings);
//           break;
//       }

//       totalApiCalls += platformCandidates.length;
//       totalTokensUsed += platformCandidates.length * 1200;

//       console.log(`Found ${platformCandidates.length} candidates on ${platform}`);

//       io.emit("searchProgress", {
//         searchId: searchHistoryId,
//         status: `Found ${platformCandidates.length} candidates on ${platform}`,
//         progress: 25 + i * 25,
//         current: i + 1,
//         total: platforms.length,
//         platform: platform,
//         candidatesFound: allCandidates.length + platformCandidates.length,
//       });

//       allCandidates.push(...platformCandidates);
//     }

//     console.log(`Total candidates found across all platforms: ${allCandidates.length}`);

//     io.emit("searchProgress", {
//       searchId: searchHistoryId,
//       status: `Found ${allCandidates.length} total candidates. Evaluating matches...`,
//       progress: 80,
//       current: platforms.length,
//       total: platforms.length,
//       candidatesFound: allCandidates.length,
//     });

//     const uniqueCandidates = Array.from(
//       new Map(allCandidates.map((c) => [`${c.profileUrl}_${c.name?.toLowerCase()}`, c])).values(),
//     );

//     console.log(`After deduplication: ${uniqueCandidates.length} unique candidates`);

//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i];
//       candidate.matchScore = await evaluateCandidateMatch(candidate, job, searchSettings);
//       totalApiCalls += 1;
//       totalTokensUsed += 300;

//       if (i % 3 === 0) {
//         io.emit("searchProgress", {
//           searchId: searchHistoryId,
//           status: `Evaluating candidate ${i + 1}/${uniqueCandidates.length}: ${candidate.name}`,
//           progress: 80 + (i / uniqueCandidates.length) * 15,
//           candidatesFound: uniqueCandidates.length,
//         });
//       }
//     }

//     const sortedCandidates = uniqueCandidates
//       .sort((a, b) => b.matchScore - a.matchScore)
//       .slice(0, searchSettings.candidateCount);

//     console.log(`Final result: ${sortedCandidates.length} candidates selected`);

//     const actualCost = (totalTokensUsed * 0.0002) / 1000;

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: sortedCandidates,
//       candidatesFound: sortedCandidates.length,
//       status: "completed",
//       completedAt: new Date(),
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: actualCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     });

//     // Also save candidates to Resume collection for workflow integration
//     for (const candidate of sortedCandidates) {
//       const resumeData = {
//         candidateName: candidate.name,
//         email: candidate.email || "Not Available",
//         mobile: candidate.phone || "Not Available",
//         jobTitle: job._id,
//         skills: candidate.skills || [],
//         experience: candidate.summary,
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         linkedinLink: candidate.linkedinProfileUrl,
//         matchingScoreDetails: {
//           overallMatch: candidate.matchScore || 75,
//         },
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || [],
//             matched: candidate.skills || [],
//             notMatched: [],
//           },
//           experience: {
//             relevantExperience: candidate.summary,
//             yearsOfExperience: "To be determined",
//           },
//           education: {
//             highestDegree: "Not specified",
//             relevantCourses: [],
//           },
//           projects: [],
//           recommendation: `AI-sourced candidate with ${candidate.matchScore}% match score`,
//           comments: `Found via ${candidate.platform} search`,
//           additionalNotes: `Profile URL: ${candidate.profileUrl}`,
//         },
//       };

//       // Check if candidate already exists to avoid duplicates
//       const existingCandidate = await Resume.findOne({
//         candidateName: candidate.name,
//         email: candidate.email,
//         jobTitle: job._id,
//       });

//       if (!existingCandidate) {
//         const resume = new Resume(resumeData);
//         await resume.save();
//         console.log(`Saved candidate ${candidate.name} to Resume collection`);
//       }
//     }

//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: sortedCandidates,
//     });

//     const notification = new Notification({
//       message: `Search complete! Found ${sortedCandidates.length} top candidates for ${job.context}. Cost: $${actualCost.toFixed(4)}`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     });
//     await notification.save();

//     io.emit("newNotification", notification);
//   } catch (error) {
//     console.error("Search process error:", error.message);

//     const partialCost = (totalTokensUsed * 0.0002) / 1000;

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       status: "failed",
//       cost: {
//         estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
//         actualCost: partialCost,
//         tokensUsed: totalTokensUsed,
//         apiCalls: totalApiCalls,
//       },
//     });

//     io.emit("searchError", {
//       searchId: searchHistoryId,
//       message: "An error occurred during the search process.",
//     });
//   }
// }

// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params;
//     const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20);

//     res.status(200).json({ success: true, searches });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params;
//     const search = await SearchHistory.findById(searchId);

//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" });
//     }

//     res.status(200).json({
//       success: true,
//       results: search.results,
//       searchDetails: search,
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// export const addCandidatesToWorkflow = async (req, res) => {
//   try {
//     const { jobId, candidates, recruiterId } = req.body;

//     if (!jobId || !candidates || !Array.isArray(candidates)) {
//       return res.status(400).json({ success: false, error: "Invalid request data" });
//     }

//     const job = await JobDescription.findById(jobId);
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" });
//     }

//     const savedResumes = [];
//     for (const candidate of candidates) {
//       const resumeData = {
//         candidateName: candidate.name,
//         email: candidate.email || "Not Available",
//         mobile: candidate.phone || "Not Available",
//         jobTitle: jobId,
//         skills: candidate.skills || [],
//         experience: candidate.summary,
//         summary: candidate.summary,
//         companyId: job.companyId,
//         candidateStatus: "AI Sourced",
//         linkedinLink: candidate.linkedinProfileUrl,
//         matchingScoreDetails: {
//           overallMatch: candidate.matchScore || 75,
//         },
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || [],
//             matched: candidate.skills || [],
//             notMatched: [],
//           },
//           experience: {
//             relevantExperience: candidate.summary,
//             yearsOfExperience: "To be determined",
//           },
//           education: {
//             highestDegree: "Not specified",
//             relevantCourses: [],
//           },
//           projects: [],
//           recommendation: `AI-sourced candidate with ${candidate.matchScore}% match score - Added to workflow`,
//           comments: `Found via ${candidate.platform} search - Manually selected for workflow`,
//           additionalNotes: `Profile URL: ${candidate.profileUrl}, GitHub: ${candidate.githubUrl || 'N/A'}, Portfolio: ${candidate.portfolioUrl || 'N/A'}`,
//         },
//       };

//       // Check if candidate already exists
//       const existingCandidate = await Resume.findOne({
//         candidateName: candidate.name,
//         email: candidate.email,
//         jobTitle: jobId,
//       });

//       if (!existingCandidate) {
//         const resume = new Resume(resumeData);
//         await resume.save();
//         savedResumes.push(resume);
//       } else {
//         // Update existing candidate status
//         existingCandidate.candidateStatus = "AI Sourced - Workflow Added";
//         await existingCandidate.save();
//         savedResumes.push(existingCandidate);
//       }
//     }

//     const notification = new Notification({
//       message: `${candidates.length} candidates added to workflow for ${job.context}`,
//       recipientId: recruiterId,
//       jobId: jobId,
//     });
//     await notification.save();

//     res.status(200).json({
//       success: true,
//       message: `${savedResumes.length} candidates successfully added to workflow.`,
//     });
//   } catch (error) {
//     console.error("Error adding candidates to workflow:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// --------------working code without linkedin serach impiementation-----------------
// This code is part of the Headhunter AI Interview module, which automates candidate sourcing
// and evaluation for recruiters using AI. It includes functionality for starting searches,
// import { OpenAI } from "openai";
// import axios from "axios";
// import { load } from "cheerio";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import Resume from "../../model/headHunterResumeModel.js";
// import Notification from "../../model/NotificationModal.js";
// import { io } from "../../index.js";
// import mongoose from "mongoose";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // --- SCHEMAS ---

// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
//   results: [
//     {
//       id: String,
//       name: String,
//       title: String,
//       company: String,
//       location: String,
//       skills: [String],
//       summary: String,
//       profileUrl: String,
//       platform: String,
//       matchScore: Number,
//       email: String,
//       phone: String,
//       aiAnalysis: Object,
//     },
//   ],
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
// });

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema);

// const quotaSchema = new mongoose.Schema({
//   api: { type: String, required: true },
//   date: { type: Date, required: true, default: Date.now },
//   queryCount: { type: Number, default: 0 },
// });

// const Quota = mongoose.model("Quota", quotaSchema);

// // GPT-4o-mini pricing for cost estimation
// const GPT_4_MINI_COSTS = {
//   input: 0.00015 / 1000, // $0.00015 per 1K input tokens
//   output: 0.0006 / 1000, // $0.0006 per 1K output tokens
// };

// // --- UTILITY FUNCTIONS ---

// function cleanJsonResponse(responseText) {
//   const match = responseText.match(/```json([\s\S]*?)```/);
//   const cleanText = match ? match[1] : responseText;
//   return cleanText.replace(/```json\n|\n```/g, "").replace(/```/g, "").trim();
// }

// function isValidJson(str) {
//   try {
//     JSON.parse(str);
//     return true;
//   } catch {
//     return false;
//   }
// }

// // --- AI-POWERED SEARCH & EXTRACTION ---

// async function generateSearchQueries(jobDescription, platform, searchSettings) {
//   const prompt = `\n    You are an expert headhunter's assistant. Generate 2-3 highly optimized search queries for finding top candidates on ${platform}.\n\n    Job Details:\n    - Position: ${jobDescription.context}\n    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}\n    - Experience Level: ${searchSettings.experienceLevel}\n    - Location: ${searchSettings.location || "Any"}\n    - Keywords: ${searchSettings.keywords || ""}\n    - Exclude Keywords: ${searchSettings.excludeKeywords || ""}\n\n    Platform-Specific Instructions:\n    ${platform === "linkedin" ? `- Use Google's "site:linkedin.com/in/" search operator. Focus on creating boolean search strings. For example: '("Software Engineer" OR "Developer") AND "Node.js" AND "React" site:linkedin.com/in/'` : ""}\n    ${platform === "github" ? `- Use GitHub search syntax. Focus on user bios, locations, and languages. For example: 'language:javascript location:"New York" followers:>50'` : ""}\n    ${platform === "google" ? `- Create general web search queries to find resumes or portfolios. For example: '("data scientist" OR "machine learning engineer") resume filetype:pdf "San Francisco"'` : ""}\n\n    Return ONLY a valid JSON array of strings. Example: ["query1", "query2"]\n  `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 500,
//       temperature: 0.4,
//       response_format: { type: "json_object" },
//     });

//     const content = JSON.parse(response.choices[0].message.content);
//     return content.queries || [jobDescription.context]; // Fallback
//   } catch (error) {
//     console.error("Error generating search queries:", error.message);
//     return [`"${jobDescription.context}" ${searchSettings.location || ""}`];
//   }
// }

// async function extractCandidateWithAI(pageText, url, platform) {
//     const prompt = `\n    Analyze the following text from a professional profile/resume found at ${url} on ${platform}.\n    Extract the candidate's information into a structured JSON object.\n\n    **Instructions:**\n    1.  **Infer Information:** Intelligently infer the candidate's current title, company, and skills from the text.\n    2.  **Find Contact Info:** Locate an email address and a phone number if available.\n    3.  **Summarize:** Create a concise, professional summary (2-3 sentences) based on their experience.\n    4.  **Be Accurate:** If a piece of information (like email or phone) is not found, return null for that field. Do not invent data.\n\n    **Text Content:**\n    ---\n    ${pageText.substring(0, 3000)}\n    ---\n\n    Return ONLY a valid JSON object with the following structure. Do not include any other text or markdown.\n    {\n      "name": "Full Name",\n      "title": "Current Job Title",\n      "company": "Current Company",\n      "location": "City, Country",\n      "skills": ["Skill 1", "Skill 2", "Skill 3"],\n      "summary": "A 2-3 sentence professional summary.",\n      "email": "email@domain.com",\n      "phone": "+1-555-555-5555"\n    }\n  `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 800,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     });

//     const result = JSON.parse(response.choices[0].message.content);

//     if (result && result.name) {
//       return {
//         id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//         ...result,
//         profileUrl: url,
//         platform,
//         matchScore: 0, // Will be evaluated later
//       };
//     }
//     return null;
//   } catch (error) {
//     console.error("Error extracting candidate with AI:", error.message);
//     return null;
//   }
// }

// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   const prompt = `\n    Evaluate how well this candidate profile matches the job requirements on a scale of 0-100.\n\n    **Job Requirements:**\n    - Title: ${jobDescription.context}\n    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "N/A"}\n    - Experience Level: ${searchSettings.experienceLevel}\n    - Location: ${searchSettings.location || "Any"}\n\n    **Candidate Profile:**\n    - Name: ${candidate.name}\n    - Title: ${candidate.title}\n    - Location: ${candidate.location}\n    - Skills: ${candidate.skills.join(", ")}\n    - Summary: ${candidate.summary}\n\n    **Evaluation Criteria:**\n    - Skills Match (40%): How well do the candidate's skills align with the required skills?\n    - Experience & Title Match (30%): Does their title and summary reflect the required experience level?\n    - Location Match (15%): Is the candidate in or willing to relocate to the specified location? (Assume remote is flexible if location is "Any" or "Remote").\n    - Overall Profile (15%): General impression of the candidate's background from their summary.\n\n    Return ONLY a single number (the match score) and nothing else.\n  `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 10,
//       temperature: 0.1,
//     });

//     const score = Number.parseInt(response.choices[0].message.content.trim());
//     return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
//   } catch (error) {
//     console.error("Error evaluating candidate:", error.message);
//     return 50; // Return a neutral score on error
//   }
// }

// --- PLATFORM-SPECIFIC SEARCH FUNCTIONS ---

// async function searchGoogle(queries, searchSettings, siteFilter = "") {
//   const candidates = new Map();
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
//   const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

//   if (!apiKey || !searchEngineId) {
//     console.warn("Google Search API not configured. Skipping Google search.");
//     return [];
//   }

//   const platform = siteFilter.includes("linkedin") ? "linkedin" : "google";

//   for (const query of queries) {
//     try {
//       const searchQuery = `${query} ${siteFilter}`;
//       io.emit("searchProgress", { status: `Executing Google search: "${searchQuery.substring(0, 50)}..."` });

//       const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
//         params: { key: apiKey, cx: searchEngineId, q: searchQuery, num: 5 },
//       });

//       if (response.data.items) {
//         for (const item of response.data.items) {
//           if (item.link && !candidates.has(item.link)) {
//             io.emit("searchProgress", { status: `Found potential profile: ${item.title}` });
//             const candidate = await extractCandidateFromUrl(item.link, platform);
//             if (candidate) {
//               candidates.set(item.link, candidate);
//             }
//           }
//         }
//       }
//     } catch (error) {
//       console.error(`Google search error for query "${query}":`, error.message);
//     }
//   }

//   return Array.from(candidates.values());
// }

// async function searchGitHub(queries, searchSettings) {
//     const candidates = new Map();
//     const token = process.env.GITHUB_TOKEN;

//     if (!token) {
//         console.warn("GitHub token not configured. Skipping GitHub search.");
//         return [];
//     }

//     for (const query of queries) {
//         try {
//             io.emit("searchProgress", { status: `Executing GitHub search: "${query.substring(0, 50)}..."` });
//             const response = await axios.get(`https://api.github.com/search/users`, {
//                 params: { q: query, per_page: 10 },
//                 headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
//             });

//             if (response.data.items) {
//                 for (const user of response.data.items) {
//                     if (user.html_url && !candidates.has(user.html_url)) {
//                         io.emit("searchProgress", { status: `Found potential profile: ${user.login}` });
//                         const candidate = await extractCandidateFromUrl(user.html_url, "github");
//                         if (candidate) {
//                             candidates.set(user.html_url, candidate);
//                         }
//                     }
//                 }
//             }
//         } catch (error) {
//             console.error(`GitHub search error for query "${query}":`, error.message);
//         }
//     }
//     return Array.from(candidates.values());
// }

// async function extractCandidateFromUrl(url, platform) {
//   try {
//     const { data } = await axios.get(url, {
//       timeout: 10000,
//       headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36)" },
//     });
//     const $ = load(data);
//     const text = $("body").text();

//     if (text.length < 100) return null; // Skip empty or invalid pages

//     return await extractCandidateWithAI(text, url, platform);
//   } catch (error) {
//     console.error(`Error scraping URL ${url}:`, error.message);
//     return null;
//   }
// }

// // --- MAIN WORKFLOW & EXPORTS ---

// function estimateSearchCost(candidateCount) {
//   const tokensPerCandidate = 200; // A rough estimate
//   const totalInputTokens = candidateCount * tokensPerCandidate;
//   const totalOutputTokens = candidateCount * 150;
//   const estimatedCost = totalInputTokens * GPT_4_MINI_COSTS.input + totalOutputTokens * GPT_4_MINI_COSTS.output;

//   return {
//     estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
//     model: "gpt-4o-mini & gpt-4o",
//     features: ["Multi-Platform Search", "AI Profile Extraction", "Smart Matching"],
//   };
// }

// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount = 10 } = req.query;
//     const estimate = estimateSearchCost(Number.parseInt(candidateCount));
//     res.status(200).json({ success: true, estimate });
//   } catch (error) {
//     console.error("Error calculating cost estimate:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings, recruiterId } = req.body;

//     if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
//       return res.status(400).json({ success: false, error: "Missing required fields, including at least one platform." });
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50);

//     const job = await JobDescription.findById(jobId);
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" });
//     }

//     const searchHistory = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "in_progress",
//     });
//     await searchHistory.save();

//     res.status(200).json({
//       success: true,
//       message: "🚀 Real-world headhunter search initiated!",
//       searchId: searchHistory._id,
//       estimatedCost: estimateSearchCost(searchSettings.candidateCount),
//     });

//     // Start background search
//     performSearch(searchHistory._id, job, searchSettings, recruiterId);

//   } catch (error) {
//     console.error("Error starting headhunter search:", error.message);
//     res.status(500).json({ success: false, error: "Internal server error starting search." });
//   }
// };

// async function performSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   try {
//     io.emit("searchProgress", { searchId: searchHistoryId, status: "🔥 Kicking off the search...", progress: 5 });

//     let allCandidates = [];
//     const platforms = searchSettings.platforms;

//     for (const platform of platforms) {
//         io.emit("searchProgress", { searchId: searchHistoryId, status: `🧠 Generating intelligent queries for ${platform}...`, progress: allCandidates.length / searchSettings.candidateCount * 100 });
//         const queries = await generateSearchQueries(job, platform, searchSettings);

//         let platformCandidates = [];
//         switch (platform) {
//             case "google":
//                 platformCandidates = await searchGoogle(queries, searchSettings);
//                 break;
//             case "linkedin":
//                 platformCandidates = await searchGoogle(queries, searchSettings, "site:linkedin.com/in/");
//                 break;
//             case "github":
//                 platformCandidates = await searchGitHub(queries, searchSettings);
//                 break;
//         }
//         allCandidates.push(...platformCandidates);
//     }

//     io.emit("searchProgress", { searchId: searchHistoryId, status: `Found ${allCandidates.length} potential candidates. Evaluating matches...`, progress: 80 });

//     // Evaluate and score all unique candidates
//     const uniqueCandidates = Array.from(new Map(allCandidates.map(c => [c.profileUrl, c])).values());
//     for (const candidate of uniqueCandidates) {
//         candidate.matchScore = await evaluateCandidateMatch(candidate, job, searchSettings);
//     }

//     const sortedCandidates = uniqueCandidates.sort((a, b) => b.matchScore - a.matchScore).slice(0, searchSettings.candidateCount);

//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       results: sortedCandidates,
//       candidatesFound: sortedCandidates.length,
//       status: "completed",
//       completedAt: new Date(),
//     });

//     io.emit("searchComplete", {
//       searchId: searchHistoryId,
//       candidates: sortedCandidates,
//     });

//     const notification = new Notification({
//       message: `✅ Headhunter search complete! Found ${sortedCandidates.length} top candidates for ${job.context}.`,
//       recipientId: recruiterId,
//       jobId: job._id,
//     });
//     await notification.save();
//     io.emit("newNotification", notification);

//   } catch (error) {
//     console.error("Search process error:", error.message);
//     await SearchHistory.findByIdAndUpdate(searchHistoryId, { status: "failed" });
//     io.emit("searchError", { searchId: searchHistoryId, message: "An error occurred during the search process." });
//   }
// }

// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params;
//     const searches = await SearchHistory.find({ recruiterId })
//       .populate("jobId", "context")
//       .sort({ createdAt: -1 })
//       .limit(20);
//     res.status(200).json({ success: true, searches });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// export const getSearchResults = async (req, res) => {
//     try {
//         const { searchId } = req.params;
//         const search = await SearchHistory.findById(searchId);
//         if (!search) {
//             return res.status(404).json({ success: false, error: "Search not found" });
//         }
//         res.status(200).json({ success: true, results: search.results });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// };

// export const addCandidatesToWorkflow = async (req, res) => {
//   try {
//     const { jobId, candidates, recruiterId } = req.body;

//     if (!jobId || !candidates || !Array.isArray(candidates)) {
//       return res.status(400).json({ success: false, error: "Invalid request data" });
//     }

//     const job = await JobDescription.findById(jobId);
//     if (!job) {
//       return res.status(404).json({ success: false, error: "Job not found" });
//     }

//     const savedResumes = [];
//     for (const candidate of candidates) {
//       const resumeData = {
//         candidateName: candidate.name,
//         email: candidate.email || "Not Available",
//         phone: candidate.phone || "Not Available",
//         jobId: jobId,
//         jobTitle: job.context,
//         skills: candidate.skills || [],
//         experience: candidate.summary,
//         summary: candidate.summary,
//         candidateStatus: "AI Sourced",
//         matchingScoreDetails: {
//           overallMatch: candidate.matchScore || 75,
//         },
//         aiSourced: true,
//         sourceInfo: {
//           platform: candidate.platform,
//           profileUrl: candidate.profileUrl,
//           sourcedAt: new Date(),
//           sourcedBy: recruiterId,
//           aiModel: "gpt-4o",
//           hasEmail: !!candidate.email,
//         },
//       };

//       const resume = new Resume(resumeData);
//       await resume.save();
//       savedResumes.push(resume);
//     }

//     const notification = new Notification({
//       message: `${candidates.length} candidates added to workflow for ${job.context}`,
//       recipientId: recruiterId,
//       jobId: jobId,
//     });
//     await notification.save();

//     res.status(200).json({
//       success: true,
//       message: `${savedResumes.length} candidates successfully added to workflow.`,
//     });
//   } catch (error) {
//     console.error("Error adding candidates to workflow:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };
