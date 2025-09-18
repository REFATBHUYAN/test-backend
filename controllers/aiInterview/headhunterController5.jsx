// // headhunterController.js
// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import mongoose from "mongoose"
// import JobDescription from "../../model/JobDescriptionModel.js"
// import Resume from "../../model/resumeModel.js"
// import Notification from "../../model/NotificationModal.js"
// import { io } from "../../index.js"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // In-memory controls/queues
// const searchControlMap = new Map() // searchId -> { shouldStop: boolean, stoppedBy }
// const linkedinExtractionQueue = new Map() // searchId -> { urls, processed, failed, timeoutId, status }

// // --- Mongoose Schema for SearchHistory (improved)
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 }, // final visible count
//   status: {
//     type: String,
//     enum: ["pending", "initializing", "searching", "extracting", "evaluating", "completed", "failed", "stopped"],
//     default: "pending",
//   },
//   rawCandidates: [
//     {
//       candidateName: String,
//       email: String,
//       mobile: mongoose.Schema.Types.Mixed,
//       currentJobTitle: String,
//       currentCompany: String,
//       location: String,
//       skills: [String],
//       experience: String,
//       summary: String,
//       sourceInfo: Object,
//       foundAt: { type: Date, default: Date.now },
//       platformSource: String,
//     },
//   ],
//   results: [Object], // final evaluated candidates
//   linkedinProfiles: [
//     {
//       profileUrl: String,
//       candidateName: String,
//       profileTitle: String,
//       location: String,
//       extractionStatus: {
//         type: String,
//         enum: ["pending", "processing", "success", "failed", "rate_limited", "blocked", "skipped"],
//         default: "pending",
//       },
//       errorCode: Number,
//       lastAttempted: { type: Date, default: Date.now },
//       retryCount: { type: Number, default: 0 },
//     },
//   ],
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   searchProgress: {
//     currentPhase: {
//       type: String,
//       enum: ["initializing", "searching", "linkedin_extraction", "ai_evaluation", "finalizing", "completed"],
//       default: "initializing",
//     },
//     platformsCompleted: { type: Number, default: 0 },
//     totalPlatforms: { type: Number, default: 0 },
//     rawCandidatesFound: { type: Number, default: 0 },
//     linkedinProfilesFound: { type: Number, default: 0 },
//     linkedinProfilesProcessed: { type: Number, default: 0 },
//     candidatesEvaluated: { type: Number, default: 0 },
//     finalCandidatesSelected: { type: Number, default: 0 },
//     isLinkedinExtractionComplete: { type: Boolean, default: false },
//     isAiEvaluationComplete: { type: Boolean, default: false },
//   },
//   platformProgress: {
//     google: { status: String, candidatesFound: Number, completed: Boolean },
//     linkedin: { status: String, candidatesFound: Number, completed: Boolean },
//     github: { status: String, candidatesFound: Number, completed: Boolean },
//     dribbble: { status: String, candidatesFound: Number, completed: Boolean },
//     behance: { status: String, candidatesFound: Number, completed: Boolean },
//   },
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
//   stoppedAt: Date,
//   stoppedBy: mongoose.Schema.Types.ObjectId,
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // --- Utility: emit progress to frontend via socket.io
// async function emitProgress(searchId, status, progress, phase = "searching", canStop = true, additionalData = {}) {
//   try {
//     const search = await SearchHistory.findById(searchId)
//     if (!search) return

//     // Map phase to a reasonable progress range
//     let accurateProgress = progress
//     switch (phase) {
//       case "initializing":
//         accurateProgress = Math.min(progress, 10)
//         break
//       case "searching":
//         accurateProgress = 10 + Math.min(progress, 50)
//         break
//       case "linkedin_extraction":
//         accurateProgress = 60 + Math.min(progress, 20)
//         break
//       case "ai_evaluation":
//         accurateProgress = 80 + Math.min(progress, 15)
//         break
//       case "finalizing":
//         accurateProgress = 95 + Math.min(progress, 5)
//         break
//       case "completed":
//         accurateProgress = 100
//         break
//     }

//     const pd = {
//       searchId,
//       status,
//       progress: Math.min(Math.max(accurateProgress, 0), 100),
//       phase,
//       timestamp: new Date().toISOString(),
//       canStop,
//       rawCandidatesFound: search.searchProgress.rawCandidatesFound,
//       linkedinProfilesFound: search.searchProgress.linkedinProfilesFound,
//       linkedinProfilesProcessed: search.searchProgress.linkedinProfilesProcessed,
//       candidatesEvaluated: search.searchProgress.candidatesEvaluated,
//       finalCandidatesSelected: search.searchProgress.finalCandidatesSelected,
//       currentPhase: phase,
//       isLinkedinExtractionComplete: search.searchProgress.isLinkedinExtractionComplete,
//       isAiEvaluationComplete: search.searchProgress.isAiEvaluationComplete,
//       ...additionalData,
//     }

//     console.log(`Progress[${searchId}] ${pd.progress}% ${phase} - ${status}`)
//     io.emit("searchProgress", pd)
//   } catch (err) {
//     console.error("emitProgress error:", err.message)
//   }
// }

// function shouldStopSearch(searchId) {
//   const ctrl = searchControlMap.get(String(searchId))
//   return !!(ctrl && ctrl.shouldStop)
// }

// // --- Save raw candidate to SearchHistory with dedupe checks
// async function saveCandidateToBuffer(searchId, candidate, platform = "unknown") {
//   try {
//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       console.warn("saveCandidateToBuffer: search not found", searchId)
//       return
//     }

//     // Duplicate checks against rawCandidates
//     const isDuplicate = search.rawCandidates.some((raw) => {
//       if (candidate.email && raw.email && raw.email.toLowerCase() === candidate.email.toLowerCase()) return true
//       if (candidate.sourceInfo?.linkedinProfileUrl && raw.sourceInfo?.linkedinProfileUrl && raw.sourceInfo.linkedinProfileUrl === candidate.sourceInfo.linkedinProfileUrl) return true
//       if (candidate.sourceInfo?.profileUrl && raw.sourceInfo?.profileUrl && raw.sourceInfo.profileUrl === candidate.sourceInfo.profileUrl) return true
//       if (candidate.mobile && raw.mobile && String(raw.mobile).replace(/\D/g, "") === String(candidate.mobile).replace(/\D/g, "")) return true
//       return false
//     })

//     if (isDuplicate) {
//       // console.log("Duplicate candidate skipped:", candidate.candidateName)
//       return
//     }

//     const candidateData = {
//       candidateName: candidate.candidateName || null,
//       email: candidate.email || null,
//       mobile: candidate.mobile || null,
//       currentJobTitle: candidate.currentJobTitle || candidate.headline || null,
//       currentCompany: candidate.currentCompany || null,
//       location: candidate.location || null,
//       skills: candidate.skills || [],
//       experience: candidate.experience || null,
//       summary: candidate.summary || null,
//       sourceInfo: candidate.sourceInfo || { profileUrl: candidate.sourceInfo?.profileUrl || null },
//       foundAt: new Date(),
//       platformSource: platform,
//     }

//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $push: { rawCandidates: candidateData },
//       $inc: { "searchProgress.rawCandidatesFound": 1 },
//     })

//     // update platform candidate count
//     const updatedSearch = await SearchHistory.findById(searchId)
//     const platformCount = updatedSearch.rawCandidates.filter((c) => c.platformSource === platform).length
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       [`platformProgress.${platform}.candidatesFound`]: platformCount,
//       [`platformProgress.${platform}.status`]: "active",
//     })
//   } catch (err) {
//     console.error("saveCandidateToBuffer error:", err.message)
//   }
// }

// // --- Stop search endpoint
// export const stopSearch = async (req, res) => {
//   try {
//     const { searchId, recruiterId } = req.body
//     if (!searchId || !recruiterId) return res.status(400).json({ success: false, error: "searchId and recruiterId required" })

//     searchControlMap.set(String(searchId), { shouldStop: true, stoppedBy: recruiterId })

//     await SearchHistory.findByIdAndUpdate(searchId, {
//       stoppedAt: new Date(),
//       stoppedBy: recruiterId,
//       status: "stopped",
//     })

//     await emitProgress(searchId, "Stop requested. Finishing current work...", 0, "finalizing", false)
//     res.json({ success: true, message: "Stop request accepted. Finalization will run." })

//     // Fire finalization soon (not blocking response)
//     setTimeout(() => finalizeSearchWithExistingCandidates(searchId, true).catch((e) => console.error(e)), 2000)
//     io.emit("searchStopping", { searchId, message: "Search stop requested." })
//   } catch (err) {
//     console.error("stopSearch error:", err.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // --- LinkedIn DOM processor (handles visible and background/offscreen extraction)
// export const processLinkedInDOMOffscreen = async (req, res) => {
//   try {
//     const { searchId, url, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
//     const finalUrl = profileUrl || url

//     // Visible tab (ad-hoc extraction) => not tied to a search
//     if (!searchId) {
//       if (!success || !domContent) {
//         return res.status(200).json({ success: true, message: "Visible tab extraction failed or empty", extractionType: "visible-tab" })
//       }
//       const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod || "visible-tab")
//       if (!candidate) return res.status(200).json({ success: false, message: "No data extracted", extractionType: "visible-tab" })
//       return res.status(200).json({ success: true, message: "Visible tab extracted", candidate: { name: candidate.candidateName, headline: candidate.headline, location: candidate.location }, extractionType: "visible-tab" })
//     }

//     // Background/offscreen tied to a search
//     if (!finalUrl) return res.status(400).json({ success: false, error: "profileUrl or url required" })

//     // Determine extractionStatus based on error string
//     let extractionStatus = success ? "processing" : "failed"
//     if (error && typeof error === "string") {
//       if (error.toLowerCase().includes("rate limit")) extractionStatus = "rate_limited"
//       if (error.toLowerCase().includes("security") || error.toLowerCase().includes("challenge")) extractionStatus = "blocked"
//     }

//     // Candidate name fallback
//     let candidateName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl)
//     // Update profile status in DB
//     await updateLinkedInProfileStatus(searchId, finalUrl, extractionStatus, candidateName)

//     if (!success || !domContent) {
//       // record failure and move on
//       await incrementLinkedInProcessed(searchId)
//       await checkLinkedInExtractionComplete(searchId)
//       return res.status(200).json({ success: true, message: "Background extraction recorded (failed)", extractionType: "background-tab" })
//     }

//     // Emit progress for extraction
//     const search = await SearchHistory.findById(searchId)
//     const processed = (search?.searchProgress?.linkedinProfilesProcessed || 0) + 1
//     const total = search?.searchProgress?.linkedinProfilesFound || 0
//     const progressPercent = total > 0 ? (processed / total) * 100 : 0
//     await emitProgress(searchId, `Extracting LinkedIn: ${candidateName} (${processed}/${total})`, progressPercent, "linkedin_extraction", true, { currentCandidate: candidateName })

//     // perform extraction
//     const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod || "background-tab")
//     if (candidate) {
//       await saveCandidateToBuffer(searchId, candidate, "linkedin-background")
//       await updateLinkedInProfileStatus(searchId, finalUrl, "success", candidate.candidateName)
//     } else {
//       await updateLinkedInProfileStatus(searchId, finalUrl, "failed", candidateName)
//     }

//     await incrementLinkedInProcessed(searchId)
//     await checkLinkedInExtractionComplete(searchId)

//     res.json({ success: true, message: "LinkedIn DOM processed", candidateExtracted: !!candidate, candidateName: candidate?.candidateName || null, extractionType: "background-tab" })
//   } catch (err) {
//     console.error("processLinkedInDOMOffscreen error:", err.message)
//     // attempt to mark processed if searchId present
//     if (req.body?.searchId) {
//       try {
//         await incrementLinkedInProcessed(req.body.searchId)
//         await checkLinkedInExtractionComplete(req.body.searchId)
//       } catch (e) {
//         console.error("error in error handler:", e.message)
//       }
//     }
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // --- helpers for LinkedIn profile tracking
// async function incrementLinkedInProcessed(searchId) {
//   try {
//     await SearchHistory.findByIdAndUpdate(searchId, { $inc: { "searchProgress.linkedinProfilesProcessed": 1 } })
//   } catch (err) {
//     console.error("incrementLinkedInProcessed error:", err.message)
//   }
// }

// async function updateLinkedInProfileStatus(searchId, profileUrl, status, candidateName = null) {
//   try {
//     const update = {
//       "linkedinProfiles.$.extractionStatus": status,
//       "linkedinProfiles.$.lastAttempted": new Date(),
//     }
//     if (candidateName) update["linkedinProfiles.$.candidateName"] = candidateName

//     await SearchHistory.findOneAndUpdate({ _id: searchId, "linkedinProfiles.profileUrl": profileUrl }, { $set: update })
//   } catch (err) {
//     console.error("updateLinkedInProfileStatus error:", err.message)
//   }
// }

// async function checkLinkedInExtractionComplete(searchId) {
//   try {
//     const search = await SearchHistory.findById(searchId)
//     if (!search) return

//     if (shouldStopSearch(searchId)) {
//       console.log("checkLinkedInExtractionComplete: search stopped; finalizing early")
//       await SearchHistory.findByIdAndUpdate(searchId, { "searchProgress.isLinkedinExtractionComplete": true })
//       await finalizeSearchWithExistingCandidates(searchId, true)
//       return
//     }

//     const total = search.searchProgress.linkedinProfilesFound || 0
//     const processed = search.searchProgress.linkedinProfilesProcessed || 0

//     if (total > 0 && processed >= total) {
//       // mark complete and start AI evaluation
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         "searchProgress.isLinkedinExtractionComplete": true,
//         "searchProgress.currentPhase": "ai_evaluation",
//         [`platformProgress.linkedin.status`]: "completed",
//         [`platformProgress.linkedin.completed`]: true,
//       })
//       await emitProgress(searchId, "LinkedIn extraction complete. Starting AI evaluation...", 100, "linkedin_extraction", false)
//       // kickoff evaluation
//       await finalizeSearchWithExistingCandidates(searchId, false)
//     } else {
//       // update progress
//       const percent = total > 0 ? (processed / total) * 100 : 0
//       await emitProgress(searchId, `LinkedIn extraction ${processed}/${total}`, percent, "linkedin_extraction", true)
//     }
//   } catch (err) {
//     console.error("checkLinkedInExtractionComplete error:", err.message)
//     // try to finalize to avoid hanging
//     await finalizeSearchWithExistingCandidates(searchId, false)
//   }
// }

// // --- Finalization and AI evaluation
// async function finalizeSearchWithExistingCandidates(searchId, wasStopped = false) {
//   try {
//     console.log("Finalizing search:", searchId, "wasStopped:", wasStopped)
//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       console.warn("finalize: search not found", searchId)
//       return
//     }
//     if (search.status === "completed" || search.status === "stopped") {
//       console.log("already finalized:", searchId, search.status)
//       return
//     }

//     const job = await JobDescription.findById(search.jobId)
//     if (!job) {
//       console.error("Job not found during finalize:", search.jobId)
//       await SearchHistory.findByIdAndUpdate(searchId, { status: "failed" })
//       return
//     }

//     // set status to evaluating
//     await SearchHistory.findByIdAndUpdate(searchId, { status: wasStopped ? "stopped" : "evaluating", "searchProgress.currentPhase": "ai_evaluation" })
//     const allCandidates = search.rawCandidates || []

//     if (!allCandidates.length) {
//       // nothing to evaluate
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         results: [],
//         candidatesFound: 0,
//         status: wasStopped ? "stopped" : "completed",
//         completedAt: new Date(),
//         "searchProgress.currentPhase": "completed",
//         "searchProgress.isAiEvaluationComplete": true,
//         "searchProgress.finalCandidatesSelected": 0,
//       })
//       await emitProgress(searchId, wasStopped ? "Search stopped - no candidates" : "Search completed - no candidates", 100, "completed", false)
//       io.emit("searchComplete", { searchId, candidates: [], wasStopped, summary: { totalRawCandidates: 0, finalCandidatesSelected: 0, message: "No candidates found" } })
//       searchControlMap.delete(String(searchId))
//       linkedinExtractionQueue.delete(String(searchId))
//       return
//     }

//     // emit starting eval
//     await emitProgress(searchId, `Starting AI evaluation of ${allCandidates.length} candidates...`, 5, "ai_evaluation", false)

//     // Deduplicate
//     const unique = deduplicateCandidates(allCandidates)
//     await emitProgress(searchId, `Evaluating ${unique.length} unique candidates...`, 10, "ai_evaluation", false)

//     const evaluated = []
//     for (let i = 0; i < unique.length; i++) {
//       const c = unique[i]
//       if (shouldStopSearch(searchId)) {
//         console.log("finalize: stop requested; breaking evaluation loop")
//         break
//       }

//       // progress update per candidate or every few candidates
//       if (i % 3 === 0 || i === unique.length - 1) {
//         const progress = Math.min(80, 10 + (i / unique.length) * 70)
//         await emitProgress(searchId, `AI evaluating ${c.candidateName || "Unknown"} (${i + 1}/${unique.length})`, progress, "ai_evaluation", false, { currentCandidate: c.candidateName })
//         await SearchHistory.findByIdAndUpdate(searchId, { "searchProgress.candidatesEvaluated": i + 1 })
//       }

//       try {
//         const evaluation = await evaluateCandidateMatch(c, job, search.searchSettings || {})
//         if (evaluation) {
//           c.matchScore = evaluation.matchingScoreDetails?.overallMatch || 0
//           c.matchingScoreDetails = evaluation.matchingScoreDetails || {}
//           c.analysis = evaluation.analysis || {}
//           c.comment = evaluation.comment || ""
//           c.recommendation = evaluation.recommendation || "Consider"
//           c.confidenceLevel = evaluation.confidenceLevel || "Medium"
//         } else {
//           c.matchScore = 0
//         }
//       } catch (err) {
//         console.error("evaluateCandidateMatch error:", err.message)
//         c.matchScore = 0
//       }

//       // set some default meta
//       c.jobTitle = job._id
//       c.companyId = job.companyId
//       c.candidateStatus = "AI Sourced"
//       c.aiSourced = true

//       evaluated.push(c)
//     }

//     // Sort by matchScore desc
//     const ranked = evaluated.filter((r) => r.candidateName).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))

//     const targetCount = (search.searchSettings && search.searchSettings.candidateCount) ? search.searchSettings.candidateCount : 10
//     const finalCandidates = wasStopped ? ranked : ranked.slice(0, targetCount)

//     // Save selected resumes to Resume DB and update search history
//     await emitProgress(searchId, `Saving ${finalCandidates.length} top candidates...`, 95, "finalizing", false)
//     await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId)

//     // Save results
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: wasStopped ? "stopped" : "completed",
//       completedAt: new Date(),
//       "searchProgress.currentPhase": "completed",
//       "searchProgress.isAiEvaluationComplete": true,
//       "searchProgress.finalCandidatesSelected": finalCandidates.length,
//     })

//     await emitProgress(searchId, wasStopped ? `Search stopped. ${finalCandidates.length} saved.` : `Search completed. ${finalCandidates.length} candidates selected.`, 100, "completed", false)

//     io.emit("searchComplete", {
//       searchId,
//       candidates: finalCandidates,
//       wasStopped,
//       summary: {
//         totalRawCandidates: allCandidates.length,
//         uniqueCandidatesEvaluated: unique.length,
//         finalCandidatesSelected: finalCandidates.length,
//         message: `AI evaluation complete`,
//       },
//     })

//     const note = new Notification({
//       message: `${wasStopped ? "🛑 Search stopped" : "🎉 Search completed"}! Found ${finalCandidates.length} candidates for ${job.context}.`,
//       recipientId: search.recruiterId,
//       jobId: job._id,
//     })
//     await note.save()
//     io.emit("newNotification", note)

//     // cleanup
//     searchControlMap.delete(String(searchId))
//     linkedinExtractionQueue.delete(String(searchId))
//     console.log("finalize done for", searchId)
//   } catch (err) {
//     console.error("finalizeSearchWithExistingCandidates error:", err.message)
//     // mark search failed
//     try {
//       await SearchHistory.findByIdAndUpdate(searchId, { status: "failed", completedAt: new Date(), "searchProgress.currentPhase": "completed" })
//       io.emit("searchError", { searchId, message: `Search processing failed: ${err.message}` })
//     } catch (e) {
//       console.error("finalize post-error update failed:", e.message)
//     } finally {
//       searchControlMap.delete(String(searchId))
//       linkedinExtractionQueue.delete(String(searchId))
//     }
//   }
// }

// // --- Google search helper (uses Google Custom Search API if configured)
// async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
//   const apiKey = process.env.GOOGLE_SEARCH_API_KEY
//   const cx = process.env.GOOGLE_SEARCH_ENGINE_ID
//   if (!apiKey || !cx) {
//     console.warn("Google search keys not set. Skipping google search.")
//     return []
//   }

//   const platform = siteFilter.includes("linkedin") ? "linkedin" : siteFilter.includes("github") ? "github" : "google"
//   await SearchHistory.findByIdAndUpdate(searchId, { [`platformProgress.${platform}.status`]: "searching", [`platformProgress.${platform}.completed`]: false })

//   const found = []
//   const linkedinUrls = new Set()
//   const maxPerQuery = 10
//   const target = Math.min((searchSettings.candidateCount || 10) * 3, 150)

//   for (let i = 0; i < queries.length && found.length < target; i++) {
//     if (shouldStopSearch(searchId)) break
//     const q = `${queries[i]} ${siteFilter}`.trim()
//     try {
//       await emitProgress(searchId, `Searching ${platform}: ${q.substring(0, 60)}...`, (i / queries.length) * 100, "searching", true)
//       const resp = await axios.get("https://www.googleapis.com/customsearch/v1", {
//         params: { key: apiKey, cx, q, num: maxPerQuery },
//         timeout: 15000,
//       })
//       const items = resp.data.items || []
//       for (const it of items) {
//         if (shouldStopSearch(searchId)) break
//         const link = it.link
//         if (!link) continue
//         if (link.includes("linkedin.com/in/") && platform === "linkedin") {
//           linkedinUrls.add(link)
//           continue
//         }
//         const candidate = await extractCandidateFromUrl(link, platform)
//         if (candidate && candidate.candidateName) {
//           found.push(candidate)
//           await saveCandidateToBuffer(searchId, candidate, platform)
//         }
//       }
//       // small delay
//       await new Promise((r) => setTimeout(r, 1200))
//     } catch (err) {
//       console.error("searchGoogle error:", err.message)
//       // backoff on 429
//       if (err.response?.status === 429) await new Promise((r) => setTimeout(r, 5000))
//     }
//   }

//   // handle linkedin urls
//   if (linkedinUrls.size > 0 && platform === "linkedin") {
//     await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
//   }

//   await SearchHistory.findByIdAndUpdate(searchId, { [`platformProgress.${platform}.status`]: "completed", [`platformProgress.${platform}.completed`]: true })
//   return found
// }

// // --- When LinkedIn URLs are found, save to SearchHistory and emit to frontend for browser extraction
// async function handleLinkedInUrls(searchId, linkedinUrls) {
//   try {
//     const top = linkedinUrls.slice(0, 50)
//     const profiles = top.map((u) => ({ profileUrl: u, candidateName: extractNameFromLinkedInUrl(u), extractionStatus: "pending", lastAttempted: new Date(), retryCount: 0 }))
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $push: { linkedinProfiles: { $each: profiles } },
//       status: "extracting",
//       "searchProgress.currentPhase": "linkedin_extraction",
//       "searchProgress.linkedinProfilesFound": top.length,
//       "searchProgress.linkedinProfilesProcessed": 0,
//       "searchProgress.isLinkedinExtractionComplete": false,
//     })

//     io.emit("linkedinUrlsForExtraction", { searchId, urls: top, message: `Found ${top.length} LinkedIn profiles` })
//     await emitProgress(searchId, `LinkedIn extraction starting: 0/${top.length}`, 0, "linkedin_extraction", true)

//     // start a timeout in case front-end extraction never completes
//     const timeoutId = setTimeout(async () => {
//       const qi = linkedinExtractionQueue.get(String(searchId))
//       if (qi && qi.status === "active") {
//         console.log("LinkedIn extraction timeout, finalizing with existing candidates:", searchId)
//         await SearchHistory.findByIdAndUpdate(searchId, { "searchProgress.isLinkedinExtractionComplete": true })
//         linkedinExtractionQueue.set(String(searchId), { ...qi, status: "timeout" })
//         await finalizeSearchWithExistingCandidates(searchId, false)
//       }
//     }, 8 * 60 * 1000) // 8 minutes

//     linkedinExtractionQueue.set(String(searchId), { urls: top, processed: [], failed: [], startTime: new Date(), status: "active", timeoutId })
//   } catch (err) {
//     console.error("handleLinkedInUrls error:", err.message)
//   }
// }

// function extractNameFromLinkedInUrl(url) {
//   try {
//     const parts = url.split("/").filter(Boolean)
//     const last = parts[parts.length - 1] || parts[parts.length - 2] || ""
//     return last.replace(/[-_]/g, " ").replace(/\d+/g, "").trim().split(" ").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") || "LinkedIn Profile"
//   } catch {
//     return "LinkedIn Profile"
//   }
// }

// // --- AI extraction from LinkedIn DOM
// async function extractCandidateFromLinkedInDOM(domContent, profileUrl, profileInfo = {}, extractionMethod = "browser-dom") {
//   // build a careful prompt; instruct zero fabrication and JSON-only output
//   const prompt = `
// You are a LinkedIn profile extractor. Extract explicit fields only. If a field isn't present, return null.
// Profile URL: ${profileUrl}
// DOM snippet:
// ---
// ${String(domContent).substring(0, 14000)}
// ---
// Return EXACTLY valid JSON with keys:
// candidateName,email,mobile,currentJobTitle,currentCompany,location,headline,summary,skills (array),experience,education,certifications (array),languages (array),publications (array),yearsOfExperience,industries (array)
// `

//   try {
//     // NOTE: this uses the older chat completion shape. Adjust per your OpenAI SDK version.
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.0,
//       response_format: { type: "json_object" },
//     })

//     const text = response.choices?.[0]?.message?.content
//     if (!text) return null

//     let parsed
//     try {
//       parsed = typeof text === "string" ? JSON.parse(text) : text
//     } catch (e) {
//       // if the assistant wrapped JSON in markdown, extract the JSON block
//       const jsonMatch = String(text).match(/\{[\s\S]*\}$/)
//       parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
//     }
//     if (!parsed || !parsed.candidateName) return null

//     const candidate = {
//       id: `linkedin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
//       candidateName: parsed.candidateName,
//       email: parsed.email || null,
//       mobile: parsed.mobile || null,
//       currentJobTitle: parsed.currentJobTitle || parsed.headline || null,
//       currentCompany: parsed.currentCompany || null,
//       location: parsed.location || null,
//       headline: parsed.headline || null,
//       summary: parsed.summary || null,
//       skills: parsed.skills || [],
//       experience: parsed.experience || null,
//       education: parsed.education || null,
//       certifications: parsed.certifications || [],
//       languages: parsed.languages || [],
//       publications: parsed.publications || [],
//       yearsOfExperience: parsed.yearsOfExperience || null,
//       industries: parsed.industries || [],
//       sourceInfo: {
//         platform: "linkedin",
//         profileUrl,
//         linkedinProfileUrl: profileUrl,
//         extractionMethod,
//         hasEmail: !!parsed.email,
//         hasPhone: !!parsed.mobile,
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//         ...profileInfo,
//       },
//       matchScore: 0,
//     }
//     return candidate
//   } catch (err) {
//     console.error("extractCandidateFromLinkedInDOM error:", err.message)
//     return null
//   }
// }

// // --- Generic URL extraction using Cheerio -> AI
// async function extractCandidateFromUrl(url, platform = "web") {
//   try {
//     const resp = await axios.get(url, {
//       timeout: 20000,
//       headers: {
//         "User-Agent": "Mozilla/5.0 (compatible; headhunter-bot/1.0)",
//         Accept: "text/html,application/xhtml+xml",
//       },
//     })

//     const $ = load(resp.data)
//     // remove common noisy elements
//     $("script, style, nav, footer, .sidebar, .ads, .cookie-banner, .popup, .modal, .overlay").remove()
//     const text = $("body").text().replace(/\s+/g, " ").trim()

//     if (!text || text.length < 200) return null

//     return await extractCandidateWithAI(text, url, platform)
//   } catch (err) {
//     console.error("extractCandidateFromUrl error:", err.message)
//     return null
//   }
// }

// // --- Use AI to parse a page text into candidate JSON
// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
// You are an extraction assistant. From the content below extract explicit candidate fields only. If a field is not present return null. Output exactly JSON.

// Source: ${url}
// Platform: ${platform}
// Content snippet:
// ---
// ${String(pageText).substring(0, 12000)}
// ---
// Return JSON keys:
// candidateName,email,mobile,currentJobTitle,currentCompany,location,skills (array),summary,experience,yearsOfExperience,education,certifications (array),projects (array),achievements (array),industries (array)
// `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1800,
//       temperature: 0.0,
//       response_format: { type: "json_object" },
//     })

//     const text = response.choices?.[0]?.message?.content
//     if (!text) return null

//     let parsed
//     try {
//       parsed = typeof text === "string" ? JSON.parse(text) : text
//     } catch (e) {
//       const jsonMatch = String(text).match(/\{[\s\S]*\}$/)
//       parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
//     }
//     if (!parsed || !parsed.candidateName) return null

//     return {
//       id: `${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
//       candidateName: parsed.candidateName,
//       email: parsed.email || null,
//       mobile: parsed.mobile || null,
//       currentJobTitle: parsed.currentJobTitle || null,
//       currentCompany: parsed.currentCompany || null,
//       location: parsed.location || null,
//       skills: parsed.skills || [],
//       summary: parsed.summary || null,
//       experience: parsed.experience || null,
//       yearsOfExperience: parsed.yearsOfExperience || null,
//       education: parsed.education || null,
//       certifications: parsed.certifications || [],
//       projects: parsed.projects || [],
//       achievements: parsed.achievements || [],
//       industries: parsed.industries || [],
//       sourceInfo: {
//         platform,
//         profileUrl: url,
//         hasEmail: !!parsed.email,
//         hasPhone: !!parsed.mobile,
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//       },
//       matchScore: 0,
//     }
//   } catch (err) {
//     console.error("extractCandidateWithAI error:", err.message)
//     return null
//   }
// }

// // --- Evaluate candidate fit using AI
// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings = {}) {
//   if (!candidate || !candidate.candidateName) return null

//   // Build a concise evaluation prompt
//   const prompt = `
// You are a senior recruiter. Evaluate the fit of this candidate for the role.

// Job:
// - Position: ${jobDescription?.context || "Unknown"}
// - Required Skills: ${Array.isArray(jobDescription?.requiredSkills) ? jobDescription.requiredSkills.join(", ") : (jobDescription?.requiredSkills || "Not specified")}
// - Experience Level: ${searchSettings.experienceLevel || "Not specified"}
// - Location: ${searchSettings.location || "Any"}

// Candidate:
// - Name: ${candidate.candidateName}
// - Current Title: ${candidate.currentJobTitle || "Not specified"}
// - Company: ${candidate.currentCompany || "Not specified"}
// - Location: ${candidate.location || "Not specified"}
// - Skills: ${Array.isArray(candidate.skills) ? candidate.skills.join(", ") : (candidate.skills || "Not specified")}
// - Experience: ${candidate.experience || candidate.yearsOfExperience || "Not specified"}
// Return EXACT JSON with:
// {
//   "matchingScoreDetails": {
//     "skillsMatch": number,
//     "experienceMatch": number,
//     "educationMatch": number,
//     "culturalFitMatch": number,
//     "overallMatch": number
//   },
//   "analysis": { "skills": {}, "experience": {}, "education": {}, "projects": [], "strengths": [], "concerns": [], "recommendation": "", "comments": "" },
//   "comment": "short summary",
//   "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
//   "confidenceLevel": "High|Medium|Low"
// }
// `
//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.05,
//       response_format: { type: "json_object" },
//     })
//     const text = response.choices?.[0]?.message?.content
//     if (!text) return null
//     let parsed
//     try {
//       parsed = typeof text === "string" ? JSON.parse(text) : text
//     } catch (e) {
//       const jsonMatch = String(text).match(/\{[\s\S]*\}$/)
//       parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
//     }
//     return parsed
//   } catch (err) {
//     console.error("evaluateCandidateMatch error:", err.message)
//     return null
//   }
// }

// // --- Save final candidates to Resume collection
// async function saveCandidatesToResumeDatabase(candidates, job, recruiterId) {
//   try {
//     if (!candidates || candidates.length === 0) return

//     const docs = candidates.map((c) => ({
//       candidateName: c.candidateName,
//       email: c.email,
//       mobile: c.mobile,
//       jobTitle: job._id,
//       companyId: job.companyId,
//       companyName: c.currentCompany,
//       resumeLink: c.sourceInfo?.profileUrl || null,
//       linkedinLink: c.sourceInfo?.linkedinProfileUrl || null,
//       matchingScoreDetails: c.matchingScoreDetails || {},
//       analysis: c.analysis || {},
//       summary: c.summary || "",
//       candidateStatus: "AI Sourced",
//       aiSourced: true,
//       sourceInfo: c.sourceInfo || {},
//       created_at: new Date(),
//     }))

//     // Avoid duplicates by candidateName + jobTitle
//     const existing = await Resume.find({ jobTitle: job._id, candidateName: { $in: docs.map((d) => d.candidateName) } })
//     const existingNames = new Set(existing.map((e) => e.candidateName))
//     const toInsert = docs.filter((d) => !existingNames.has(d.candidateName))

//     if (toInsert.length) {
//       await Resume.insertMany(toInsert, { ordered: false })
//       console.log(`Saved ${toInsert.length} new resumes.`)
//     } else {
//       console.log("No new resumes to save.")
//     }
//   } catch (err) {
//     console.error("saveCandidatesToResumeDatabase error:", err.message)
//   }
// }

// // --- Deduplicate candidates: merge by email, linkedin url, name, mobile
// function deduplicateCandidates(candidates) {
//   const map = new Map()

//   for (const candidate of candidates) {
//     const keys = []
//     if (candidate.email) keys.push(`email:${String(candidate.email).toLowerCase()}`)
//     if (candidate.candidateName) keys.push(`name:${String(candidate.candidateName).toLowerCase().replace(/\s+/g, "_")}`)
//     if (candidate.sourceInfo?.linkedinProfileUrl) keys.push(`linkedin:${candidate.sourceInfo.linkedinProfileUrl}`)
//     if (candidate.sourceInfo?.profileUrl) keys.push(`profile:${candidate.sourceInfo.profileUrl}`)
//     if (candidate.mobile) keys.push(`mobile:${String(candidate.mobile).replace(/\D/g, "")}`)

//     const foundKey = keys.find((k) => map.has(k))
//     if (!foundKey) {
//       // pick first key or generate id
//       const primaryKey = keys[0] || `id:${Math.random().toString(36).slice(2)}`
//       map.set(primaryKey, { ...candidate })
//       // ensure all other keys point to same record
//       keys.forEach((k) => map.set(k, map.get(primaryKey)))
//     } else {
//       const existing = map.get(foundKey)
//       mergeCandidateInfo(existing, candidate)
//     }
//   }

//   // unique set of objects
//   return Array.from(new Set(map.values()))
// }

// function mergeCandidateInfo(existing, duplicate) {
//   if (!existing.email && duplicate.email) existing.email = duplicate.email
//   if (!existing.mobile && duplicate.mobile) existing.mobile = duplicate.mobile
//   if (duplicate.skills && duplicate.skills.length) existing.skills = Array.from(new Set([...(existing.skills || []), ...duplicate.skills]))
//   if (duplicate.sourceInfo) {
//     existing.sourceInfo = existing.sourceInfo || {}
//     for (const k of Object.keys(duplicate.sourceInfo)) {
//       if (!existing.sourceInfo[k] && duplicate.sourceInfo[k]) existing.sourceInfo[k] = duplicate.sourceInfo[k]
//     }
//   }
//   if (duplicate.summary && duplicate.summary.length > (existing.summary?.length || 0)) existing.summary = duplicate.summary
//   if (duplicate.experience && duplicate.experience.length > (existing.experience?.length || 0)) existing.experience = duplicate.experience
//   if (duplicate.projects && duplicate.projects.length) existing.projects = Array.from(new Set([...(existing.projects || []), ...duplicate.projects]))
//   if (duplicate.achievements && duplicate.achievements.length) existing.achievements = Array.from(new Set([...(existing.achievements || []), ...duplicate.achievements]))
//   if (duplicate.matchScore && duplicate.matchScore > (existing.matchScore || 0)) {
//     existing.matchScore = duplicate.matchScore
//     existing.matchingScoreDetails = duplicate.matchingScoreDetails || existing.matchingScoreDetails
//     existing.analysis = duplicate.analysis || existing.analysis
//     existing.recommendation = duplicate.recommendation || existing.recommendation
//   }
// }

// // --- Top-level: start headhunter search endpoint
// export const startHeadhunterSearch = async (req, res) => {
//   try {
//     const { jobId, searchSettings = {}, recruiterId } = req.body
//     if (!jobId || !recruiterId || !searchSettings.platforms || !searchSettings.platforms.length) {
//       return res.status(400).json({ success: false, error: "Missing required fields" })
//     }

//     searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)

//     const job = await JobDescription.findById(jobId)
//     if (!job) return res.status(404).json({ success: false, error: "Job not found" })

//     const companyId = job.companyId
//     if (!companyId) return res.status(400).json({ success: false, error: "Company ID not found" })

//     // estimate cost (simple)
//     const estimate = estimateSearchCost(searchSettings.candidateCount)

//     const search = new SearchHistory({
//       recruiterId,
//       jobId,
//       jobTitle: job.context,
//       companyId,
//       platforms: searchSettings.platforms,
//       searchSettings,
//       status: "searching",
//       cost: { estimatedCost: estimate.estimatedCost, actualCost: 0, tokensUsed: 0, apiCalls: 0 },
//       rawCandidates: [],
//       linkedinProfiles: [],
//       searchProgress: {
//         currentPhase: "initializing",
//         platformsCompleted: 0,
//         totalPlatforms: searchSettings.platforms.length,
//         rawCandidatesFound: 0,
//         linkedinProfilesFound: 0,
//         linkedinProfilesProcessed: 0,
//         candidatesEvaluated: 0,
//         finalCandidatesSelected: 0,
//         isLinkedinExtractionComplete: false,
//         isAiEvaluationComplete: false,
//       },
//       platformProgress: {
//         google: { status: "pending", candidatesFound: 0, completed: false },
//         linkedin: { status: "pending", candidatesFound: 0, completed: false },
//         github: { status: "pending", candidatesFound: 0, completed: false },
//         dribbble: { status: "pending", candidatesFound: 0, completed: false },
//         behance: { status: "pending", candidatesFound: 0, completed: false },
//       },
//     })

//     await search.save()
//     searchControlMap.set(String(search._id), { shouldStop: false })

//     res.status(200).json({ success: true, message: "Search started", searchId: search._id, estimatedCost: estimate })

//     // run background search
//     performEnhancedDynamicSearch(search._id, job, searchSettings, recruiterId).catch((err) => {
//       console.error("performEnhancedDynamicSearch error:", err.message)
//     })
//   } catch (err) {
//     console.error("startHeadhunterSearch error:", err.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // --- Core multi-platform search workflow (simplified)
// async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0
//   let totalApiCalls = 0
//   let wasStopped = false

//   try {
//     await emitProgress(searchHistoryId, "Analyzing job", 5, "initializing", true)
//     const jobAnalysis = await analyzeJobForPlatformsInternal(job, searchSettings)
//     totalApiCalls++
//     totalTokensUsed += 500

//     await emitProgress(searchHistoryId, "Starting platform searches", 10, "searching", true)
//     if (shouldStopSearch(searchHistoryId)) {
//       wasStopped = true
//       throw new Error("Stopped before platform searches")
//     }

//     // pick platforms
//     const platforms = searchSettings.platforms || []
//     for (let i = 0; i < platforms.length; i++) {
//       if (shouldStopSearch(searchHistoryId)) {
//         wasStopped = true
//         break
//       }
//       const p = platforms[i]
//       await emitProgress(searchHistoryId, `Searching ${p}`, 15 + i * 10, "searching", true)
//       let platformCandidates = []
//       try {
//         switch (p) {
//           case "google":
//             // build a few queries
//             const queries = await generateSearchQueries(job, p, searchSettings, jobAnalysis)
//             platformCandidates = await searchGoogle(queries, searchSettings, "", searchHistoryId)
//             break
//           case "linkedin":
//             const q2 = await generateSearchQueries(job, p, searchSettings, jobAnalysis)
//             // if LinkedIn API configured you could call it, else use google site:linkedin
//             platformCandidates = await searchGoogle(q2, searchSettings, "site:linkedin.com/in/", searchHistoryId)
//             break
//           case "github":
//             const qg = await generateSearchQueries(job, p, searchSettings, jobAnalysis)
//             // fallback to google
//             platformCandidates = await searchGoogle(qg, searchSettings, "site:github.com", searchHistoryId)
//             break
//           case "dribbble":
//           case "behance":
//             // use google fallback to gather profile links
//             const qd = await generateSearchQueries(job, p, searchSettings, jobAnalysis)
//             platformCandidates = await searchGoogle(qd, searchSettings, `site:${p}.com`, searchHistoryId)
//             break
//           default:
//             const qdft = await generateSearchQueries(job, p, searchSettings, jobAnalysis)
//             platformCandidates = await searchGoogle(qdft, searchSettings, "", searchHistoryId)
//         }
//       } catch (err) {
//         console.error(`Error searching ${p}`, err.message)
//       }
//       totalApiCalls += 1
//       totalTokensUsed += (platformCandidates.length || 0) * 50
//       await SearchHistory.findByIdAndUpdate(searchHistoryId, { $inc: { "searchProgress.platformsCompleted": 1 } })
//     }

//     // After platform searches, check for LinkedIn extraction pending
//     const after = await SearchHistory.findById(searchHistoryId)
//     if ((after.linkedinProfiles?.length || 0) > 0 && !after.searchProgress.isLinkedinExtractionComplete) {
//       await emitProgress(searchHistoryId, "LinkedIn extraction in progress", 0, "linkedin_extraction", true)
//       // keep waiting: finalize will be triggered by checkLinkedInExtractionComplete when extraction finishes.
//       return
//     }

//     // No LinkedIn pending; finalize immediately
//     await finalizeSearchWithExistingCandidates(searchHistoryId, wasStopped)
//   } catch (err) {
//     console.error("performEnhancedDynamicSearch error:", err.message)
//     // mark failure
//     try {
//       const partialCost = (totalTokensUsed * 0.0002) / 1000
//       await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//         status: wasStopped ? "stopped" : "failed",
//         cost: { estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost, actualCost: partialCost, tokensUsed: totalTokensUsed, apiCalls: totalApiCalls },
//         "searchProgress.currentPhase": "completed",
//       })
//       io.emit("searchError", { searchId: searchHistoryId, message: err.message, wasStopped })
//       const n = new Notification({ message: `Search failed: ${err.message}`, recipientId: recruiterId, jobId: job._id })
//       await n.save()
//       io.emit("newNotification", n)
//     } catch (e) {
//       console.error("error handling performEnhancedDynamicSearch failure:", e.message)
//     } finally {
//       searchControlMap.delete(String(searchHistoryId))
//       linkedinExtractionQueue.delete(String(searchHistoryId))
//     }
//   }
// }

// // --- Lightweight helpers & stubs

// function estimateSearchCost(candidateCount = 10) {
//   // crude estimate: cost scales with candidateCount
//   const estimatedTokens = candidateCount * 2000
//   return { estimatedCost: (estimatedTokens * 0.00015) / 1000, estimatedTokens }
// }

// async function analyzeJobForPlatformsInternal(job, searchSettings) {
//   // Basic job analysis fallback. You can replace with an AI job analyzer
//   return {
//     jobCategory: job.context || "Unknown",
//     jobSubcategory: job.context || "General",
//     recommendedPlatforms: (searchSettings.platforms || []).map((p) => ({ platform: p, priority: "medium" })),
//     searchComplexity: "medium",
//   }
// }
// export const analyzeJobForPlatforms = analyzeJobForPlatformsInternal

// async function generateSearchQueries(job, platform, searchSettings, jobAnalysis) {
//   // Generate a few simple queries based on job title, location, skills
//   const title = (job.context || "").replace(/\s+/g, " ").trim()
//   const skills = (job.requiredSkills || []).slice(0, 5).join(" ")
//   const location = searchSettings.location || ""
//   const base = `${title} ${skills} ${location}`.trim()
//   // create small variations
//   if (!base) return ["\"" + (job.context || "candidate") + "\""]
//   return [base, `${title} ${skills}`, `${title} ${location}`].filter(Boolean)
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

// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params
//     const searches = await SearchHistory.find({ recruiterId })
//       .select("-results -rawCandidates")
//       .sort({ createdAt: -1 })
//       .limit(20)

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
//       results: search.results || [],
//       rawCandidates: search.rawCandidates || [],
//       linkedinProfiles: search.linkedinProfiles || [],
//       platformProgress: search.platformProgress || {},
//       searchProgress: search.searchProgress || {},
//       searchDetails: search,
//     })
//   } catch (error) {
//     console.error("❌ Error fetching search results:", error.message)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// export const notifyManualExtraction = async (req, res) => {
//   try {
//     const { searchId, urlCount } = req.body
//     if (!searchId) {
//       return res.status(400).json({ success: false, error: "Search ID required" })
//     }

//     console.log(`📱 Manual extraction started for ${urlCount} URLs in search ${searchId}`)

//     await emitProgress(
//       searchId,
//       `👤 Manual extraction: Opening ${urlCount} LinkedIn profiles...`,
//       0,
//       "linkedin_extraction",
//       true,
//     )

//     res.status(200).json({
//       success: true,
//       message: "Manual extraction notification received",
//     })
//   } catch (error) {
//     console.error("❌ Error in manual extraction notification:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// Export endpoints & helpers you might need
// export {
//   startHeadhunterSearch,
//   stopSearch,
//   processLinkedInDOMOffscreen,
//   // other helpers could be exported if needed
// }


// FIXED HEADHUNTER CONTROLLER - Proper Progress Flow and User Experience
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

// LinkedIn extraction queue - FIXED: Better state management
const linkedinExtractionQueue = new Map()

// ENHANCED SCHEMA with proper progress tracking
const searchHistorySchema = new mongoose.Schema({
  recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
  jobTitle: String,
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  platforms: [String],
  searchSettings: Object,
  candidatesFound: { type: Number, default: 0 }, // FIXED: Only final evaluated candidates
  status: {
    type: String,
    enum: ["pending", "searching", "extracting", "evaluating", "completed", "failed", "stopped"],
    default: "pending",
  },

  // CRITICAL FIX: Separate raw candidates from final results
  rawCandidates: [
    {
      candidateName: String,
      email: String,
      mobile: mongoose.Schema.Types.Mixed,
      currentJobTitle: String,
      currentCompany: String,
      location: String,
      skills: [String],
      experience: String,
      summary: String,
      sourceInfo: {
        platform: String,
        profileUrl: String,
        linkedinProfileUrl: String,
        extractionMethod: String,
        sourcedAt: Date,
        aiModel: String,
        hasEmail: Boolean,
        hasPhone: Boolean,
      },
      foundAt: { type: Date, default: Date.now },
      platformSource: String,
    },
  ],

  // FINAL evaluated candidates (what users actually see)
  results: [
    {
      candidateName: String,
      email: String,
      mobile: mongoose.Schema.Types.Mixed,
      jobTitle: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription" },
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
        culturalFitMatch: Number,
      },
      analysis: {
        skills: {
          candidateSkills: [String],
          matched: [String],
          notMatched: [String],
          transferableSkills: [String],
          skillGaps: [String],
          skillStrengths: [String],
        },
        experience: {
          relevantExperience: String,
          yearsOfExperience: String,
          careerProgression: String,
          industryExperience: String,
          roleRelevance: String,
        },
        education: {
          highestDegree: String,
          relevantCourses: [String],
          certifications: [String],
          continuousLearning: String,
        },
        projects: [String],
        strengths: [String],
        concerns: [String],
        recommendation: String,
        comments: String,
        additionalNotes: String,
      },
      comment: String,
      recommendation: {
        type: String,
        enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
      },
      confidenceLevel: String,
      aiSourced: Boolean,
      sourceInfo: {
        platform: String,
        profileUrl: String,
        linkedinProfileUrl: String,
        extractionMethod: String,
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

  cost: {
    estimatedCost: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
    tokensUsed: { type: Number, default: 0 },
    apiCalls: { type: Number, default: 0 },
  },

  // CRITICAL FIX: Better progress tracking
  searchProgress: {
    currentPhase: {
      type: String,
      enum: ["initializing", "searching", "linkedin_extraction", "ai_evaluation", "finalizing", "completed"],
      default: "initializing",
    },
    platformsCompleted: { type: Number, default: 0 },
    totalPlatforms: { type: Number, default: 0 },
    rawCandidatesFound: { type: Number, default: 0 },
    linkedinProfilesFound: { type: Number, default: 0 },
    linkedinProfilesProcessed: { type: Number, default: 0 },
    candidatesEvaluated: { type: Number, default: 0 },
    finalCandidatesSelected: { type: Number, default: 0 },
    isLinkedinExtractionComplete: { type: Boolean, default: false },
    isAiEvaluationComplete: { type: Boolean, default: false },
  },

  platformProgress: {
    google: { status: String, candidatesFound: Number, completed: Boolean },
    linkedin: { status: String, candidatesFound: Number, completed: Boolean },
    github: { status: String, candidatesFound: Number, completed: Boolean },
    dribbble: { status: String, candidatesFound: Number, completed: Boolean },
    behance: { status: String, candidatesFound: Number, completed: Boolean },
  },

  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
  stoppedAt: Date,
  stoppedBy: mongoose.Schema.Types.ObjectId,
})

const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// CRITICAL FIX: Proper progress emission with accurate phases
async function emitProgress(searchId, status, progress, phase = "searching", canStop = true, additionalData = {}) {
  try {
    const search = await SearchHistory.findById(searchId)
    if (!search) return

    // Calculate accurate progress based on phase
    let accurateProgress = progress
    const searchProgress = search.searchProgress

    switch (phase) {
      case "initializing":
        accurateProgress = Math.min(progress, 10)
        break
      case "searching":
        accurateProgress = 10 + Math.min(progress, 50) // 10-60%
        break
      case "linkedin_extraction":
        accurateProgress = 60 + Math.min(progress, 20) // 60-80%
        break
      case "ai_evaluation":
        accurateProgress = 80 + Math.min(progress, 15) // 80-95%
        break
      case "finalizing":
        accurateProgress = 95 + Math.min(progress, 5) // 95-100%
        break
      case "completed":
        accurateProgress = 100
        break
    }

    const progressData = {
      searchId,
      status,
      progress: Math.min(Math.max(accurateProgress, 0), 100),
      phase,
      timestamp: new Date().toISOString(),
      canStop,

      // CRITICAL: Accurate candidate counts based on phase
      rawCandidatesFound: searchProgress.rawCandidatesFound,
      linkedinProfilesFound: searchProgress.linkedinProfilesFound,
      linkedinProfilesProcessed: searchProgress.linkedinProfilesProcessed,
      candidatesEvaluated: searchProgress.candidatesEvaluated,
      finalCandidatesSelected: searchProgress.finalCandidatesSelected,

      // Phase-specific information
      currentPhase: phase,
      isLinkedinExtractionComplete: searchProgress.isLinkedinExtractionComplete,
      isAiEvaluationComplete: searchProgress.isAiEvaluationComplete,

      ...additionalData,
    }

    console.log(`📡 Progress [${searchId}]: ${accurateProgress.toFixed(1)}% - ${phase} - ${status}`)
    console.log(
      `   Raw: ${searchProgress.rawCandidatesFound}, LinkedIn: ${searchProgress.linkedinProfilesProcessed}/${searchProgress.linkedinProfilesFound}, Final: ${searchProgress.finalCandidatesSelected}`,
    )

    io.emit("searchProgress", progressData)
  } catch (error) {
    console.error("❌ Error emitting progress:", error.message)
  }
}

// Check if search should be stopped
function shouldStopSearch(searchId) {
  const control = searchControlMap.get(searchId.toString())
  return control?.shouldStop || false
}

// CRITICAL FIX: Save candidates to buffer with proper progress tracking
async function saveCandidateToBuffer(searchId, candidate, platform) {
  try {
    const candidateData = {
      candidateName: candidate.candidateName,
      email: candidate.email,
      mobile: candidate.mobile,
      currentJobTitle: candidate.currentJobTitle,
      currentCompany: candidate.currentCompany,
      location: candidate.location,
      skills: candidate.skills || [],
      experience: candidate.experience,
      summary: candidate.summary,
      sourceInfo: candidate.sourceInfo || {},
      foundAt: new Date(),
      platformSource: platform,
    }

    const search = await SearchHistory.findById(searchId)
    if (!search) {
      console.error(`❌ Search ${searchId} not found for saving candidate.`)
      return
    }

    // Check for duplicates
    const isDuplicate = search.rawCandidates.some(
      (raw) =>
        (raw.email && raw.email.toLowerCase() === candidate.email?.toLowerCase()) ||
        (raw.sourceInfo?.linkedinProfileUrl &&
          raw.sourceInfo.linkedinProfileUrl === candidate.sourceInfo?.linkedinProfileUrl) ||
        (raw.sourceInfo?.profileUrl && raw.sourceInfo.profileUrl === candidate.sourceInfo?.profileUrl),
    )

    if (isDuplicate) {
      console.log(`ℹ️ Candidate ${candidate.candidateName} from ${platform} is a duplicate, skipping.`)
      return
    }

    // Save candidate and update progress
    await SearchHistory.findByIdAndUpdate(
      searchId,
      {
        $push: { rawCandidates: candidateData },
        $inc: {
          "searchProgress.rawCandidatesFound": 1,
        },
      },
      { new: true },
    )

    // Update platform progress
    const updatedSearch = await SearchHistory.findById(searchId)
    const totalForPlatform = updatedSearch.rawCandidates.filter((c) => c.platformSource === platform).length

    await SearchHistory.findByIdAndUpdate(searchId, {
      [`platformProgress.${platform}.candidatesFound`]: totalForPlatform,
      [`platformProgress.${platform}.status`]: "active",
    })

    console.log(
      `💾 Raw candidate saved: ${candidate.candidateName} from ${platform} (Total raw: ${updatedSearch.searchProgress.rawCandidatesFound})`,
    )

    // CRITICAL: Don't emit "candidates found" progress here - this is just raw data collection
  } catch (error) {
    console.error(`❌ Error saving candidate to buffer:`, error.message)
  }
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
      status: "stopped",
    })

    console.log(`🛑 Search ${searchId} stop requested by ${recruiterId}`)

    await emitProgress(searchId, "🛑 Stopping search... Processing current candidates...", 0, "finalizing", false)

    res.status(200).json({
      success: true,
      message: "Search stop requested. Processing current candidates...",
    })

    // Trigger immediate finalization
    setTimeout(async () => {
      await finalizeSearchWithExistingCandidates(searchId, true)
    }, 2000)

    io.emit("searchStopping", {
      searchId,
      message: "Search stopping... Processing current candidates.",
    })
  } catch (error) {
    console.error("❌ Error stopping search:", error.message)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// CRITICAL FIX: LinkedIn DOM processing with proper progress tracking
export const processLinkedInDOMOffscreen2 = async (req, res) => {
  try {
    const { searchId, url, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body

    const finalUrl = profileUrl || url
    console.log("Processing LinkedIn DOM:", { searchId, finalUrl, success })

    // Handle visible tab extractions (when searchId is null)
    if (!searchId) {
      console.log(`📥 Processing LinkedIn DOM from visible tab: ${finalUrl}`)

      if (!success || !domContent) {
        return res.status(200).json({
          success: true,
          message: "Failed visible tab extraction recorded",
          extractionType: "visible-tab",
        })
      }

      const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod)
      if (candidate) {
        return res.status(200).json({
          success: true,
          message: "LinkedIn profile extracted successfully from visible tab",
          candidate: {
            name: candidate.candidateName,
            headline: candidate.headline,
            location: candidate.location,
          },
          extractionType: "visible-tab",
        })
      } else {
        return res.status(200).json({
          success: false,
          message: "Failed to extract candidate data from visible tab",
          extractionType: "visible-tab",
        })
      }
    }

    // Handle background tab extractions (with searchId)
    if (!finalUrl) {
      return res.status(400).json({ success: false, error: "Profile URL is required" })
    }

    console.log(`📥 Processing LinkedIn DOM (background tab) for: ${finalUrl}`)

    // Update LinkedIn profile status
    await updateLinkedInProfileStatus(searchId, finalUrl, success ? "processing" : "failed", profileInfo?.name)

    if (!success || !domContent) {
      console.log(`❌ Failed to extract DOM from background tab: ${finalUrl}. Reason: ${error}`)
      await incrementLinkedInProcessed(searchId)
      await checkLinkedInExtractionComplete(searchId)
      return res.status(200).json({
        success: true,
        message: "Failed background tab extraction recorded",
        extractionType: "background-tab",
      })
    }

    const candidateName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl)

    // CRITICAL: Proper progress update for LinkedIn extraction phase
    const search = await SearchHistory.findById(searchId)
    const processed = search.searchProgress.linkedinProfilesProcessed + 1
    const total = search.searchProgress.linkedinProfilesFound
    const progressPercent = total > 0 ? (processed / total) * 100 : 0

    await emitProgress(
      searchId,
      `🔍 Extracting LinkedIn: ${candidateName} (${processed}/${total})`,
      progressPercent,
      "linkedin_extraction",
      true,
      { currentCandidate: candidateName },
    )

    const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod)

    if (candidate) {
      console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`)
      await saveCandidateToBuffer(searchId, candidate, "linkedin-background-tab")
      await updateLinkedInProfileStatus(searchId, finalUrl, "success", candidate.candidateName)
    } else {
      console.log(`❌ AI failed to extract candidate data from: ${finalUrl}`)
      await updateLinkedInProfileStatus(searchId, finalUrl, "failed")
    }

    // Update processed count and check completion
    await incrementLinkedInProcessed(searchId)
    await checkLinkedInExtractionComplete(searchId)

    res.status(200).json({
      success: true,
      message: "LinkedIn DOM processed",
      candidateExtracted: !!candidate,
      candidateName: candidate?.candidateName,
      extractionType: "background-tab",
    })
  } catch (error) {
    console.error("❌ Error processing LinkedIn DOM:", error.message)
    if (req.body.searchId) {
      await incrementLinkedInProcessed(req.body.searchId)
      await checkLinkedInExtractionComplete(req.body.searchId)
    }
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}
export const processLinkedInDOMOffscreen = async (req, res) => {
  try {
    const { searchId, url, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
    const finalUrl = profileUrl || url
    console.log("Processing LinkedIn DOM:", { searchId, finalUrl, success, extractionMethod })

    // Validate extraction method
    const validExtractionMethods = ["background-tab-improved", "visible-tab-improved", "sequential-window"];
    if (!validExtractionMethods.includes(extractionMethod)) {
      console.warn(`⚠️ Unexpected extraction method: ${extractionMethod}`);
    }

    // Handle visible tab extractions (when searchId is null)
    if (!searchId) {
      console.log(`📥 Processing LinkedIn DOM from visible tab: ${finalUrl}`)

      if (!success || !domContent) {
        return res.status(200).json({
          success: true,
          message: "Failed visible tab extraction recorded",
          extractionType: "visible-tab",
        })
      }

      const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod)
      if (candidate) {
        return res.status(200).json({
          success: true,
          message: "LinkedIn profile extracted successfully from visible tab",
          candidate: {
            name: candidate.candidateName,
            headline: candidate.headline,
            location: candidate.location,
          },
          extractionType: "visible-tab",
        })
      } else {
        return res.status(200).json({
          success: false,
          message: "Failed to extract candidate data from visible tab",
          extractionType: "visible-tab",
        })
      }
    }

    // Handle background tab extractions (with searchId)
    if (!finalUrl) {
      return res.status(400).json({ success: false, error: "Profile URL is required" })
    }

    console.log(`📥 Processing LinkedIn DOM (background tab) for: ${finalUrl}`);

    // Determine extraction status based on error
    let extractionStatus = success ? "processing" : "failed";
    if (error && error.includes("rate limit")) {
      extractionStatus = "rate_limited";
    } else if (error && error.includes("security challenge")) {
      extractionStatus = "blocked";
    }

    // Fallback for candidate name if profileInfo.name is missing
    let candidateName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl);
    if (!candidateName && domContent) {
      const $ = load(domContent);
      const nameElement = $('h1.text-heading-xlarge') || $('h1[class*="text-heading-xlarge"]') || $('h1');
      candidateName = nameElement?.text()?.trim() || extractNameFromLinkedInUrl(finalUrl);
    }

    // Update LinkedIn profile status
    await updateLinkedInProfileStatus(searchId, finalUrl, extractionStatus, candidateName);

    if (!success || !domContent) {
      console.log(`❌ Failed to extract DOM from background tab: ${finalUrl}. Reason: ${error}`);
      await incrementLinkedInProcessed(searchId);
      await checkLinkedInExtractionComplete(searchId);
      return res.status(200).json({
        success: true,
        message: "Failed background tab extraction recorded",
        extractionType: "background-tab",
      })
    }

    // Check for duplicate candidates
    const search = await SearchHistory.findById(searchId);
    const isDuplicate = search.rawCandidates.some(
      (raw) =>
        (raw.sourceInfo?.linkedinProfileUrl && raw.sourceInfo.linkedinProfileUrl === finalUrl) ||
        (raw.candidateName && raw.candidateName.toLowerCase() === candidateName.toLowerCase())
    );
    if (isDuplicate) {
      console.log(`ℹ️ Candidate ${candidateName} from ${finalUrl} is a duplicate, skipping.`);
      await updateLinkedInProfileStatus(searchId, finalUrl, "skipped", candidateName);
      await incrementLinkedInProcessed(searchId);
      await checkLinkedInExtractionComplete(searchId);
      return res.status(200).json({
        success: true,
        message: "Duplicate candidate skipped",
        extractionType: "background-tab",
      });
    }

    // CRITICAL: Proper progress update for LinkedIn extraction phase
    const processed = search.searchProgress.linkedinProfilesProcessed + 1;
    const total = search.searchProgress.linkedinProfilesFound;
    const progressPercent = total > 0 ? (processed / total) * 20 : 0; // Scale to 0-20% of linkedin_extraction phase

    await emitProgress(
      searchId,
      `🔍 Extracting LinkedIn: ${candidateName} (${processed}/${total})`,
      60 + progressPercent, // linkedin_extraction phase is 60-80%
      "linkedin_extraction",
      true,
      { currentCandidate: candidateName, currentUrl: finalUrl }
    );

    // Check for stalled extraction (per-profile timeout)
    const startTime = Date.now();
    const MAX_PROFILE_PROCESSING_TIME = 60000; // 60 seconds
    const timeoutCheck = setTimeout(async () => {
      console.log(`⏰ Profile processing timeout for ${finalUrl}`);
      await updateLinkedInProfileStatus(searchId, finalUrl, "failed", candidateName);
      await incrementLinkedInProcessed(searchId);
      await checkLinkedInExtractionComplete(searchId);
    }, MAX_PROFILE_PROCESSING_TIME);

    const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod);

    clearTimeout(timeoutCheck); // Clear timeout if extraction completes

    // Update cost tracking for OpenAI call
    const estimatedTokens = 15000 + 3000; // Approximate input + output tokens for extractCandidateFromLinkedInDOM
    await SearchHistory.findByIdAndUpdate(searchId, {
      $inc: {
        "cost.tokensUsed": estimatedTokens,
        "cost.apiCalls": 1,
        "cost.actualCost": (estimatedTokens * 0.00015) / 1000, // Approximate cost for gpt-4o
      },
    });

    if (candidate) {
      console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`);
      await saveCandidateToBuffer(searchId, candidate, "linkedin-background-tab");
      await updateLinkedInProfileStatus(searchId, finalUrl, "success", candidate.candidateName);
    } else {
      console.log(`❌ AI failed to extract candidate data from: ${finalUrl}`);
      await updateLinkedInProfileStatus(searchId, finalUrl, "failed", candidateName);
    }

    // Update processed count and check completion
    await incrementLinkedInProcessed(searchId);
    await checkLinkedInExtractionComplete(searchId);

    res.status(200).json({
      success: true,
      message: "LinkedIn DOM processed",
      candidateExtracted: !!candidate,
      candidateName: candidate?.candidateName,
      extractionType: "background-tab",
    });
  } catch (error) {
    console.error("❌ Error processing LinkedIn DOM:", error.message);
    if (req.body.searchId) {
      await incrementLinkedInProcessed(req.body.searchId);
      await checkLinkedInExtractionComplete(req.body.searchId);
      // Clean up stale queue entry
      const queueItem = linkedinExtractionQueue.get(req.body.searchId);
      if (queueItem) {
        if (queueItem.timeoutId) clearTimeout(queueItem.timeoutId);
        linkedinExtractionQueue.delete(req.body.searchId);
      }
    }
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Helper function to increment LinkedIn processed count
async function incrementLinkedInProcessed(searchId) {
  await SearchHistory.findByIdAndUpdate(searchId, {
    $inc: { "searchProgress.linkedinProfilesProcessed": 1 },
  })
}

// Update LinkedIn profile extraction status
async function updateLinkedInProfileStatus(searchId, profileUrl, status, candidateName = null) {
  try {
    const updateData = {
      "linkedinProfiles.$.extractionStatus": status,
      "linkedinProfiles.$.lastAttempted": new Date(),
    }
    if (candidateName) {
      updateData["linkedinProfiles.$.candidateName"] = candidateName
    }

    await SearchHistory.findOneAndUpdate(
      {
        _id: searchId,
        "linkedinProfiles.profileUrl": profileUrl,
      },
      { $set: updateData },
    )
  } catch (error) {
    console.error("❌ Error updating LinkedIn profile status:", error.message)
  }
}

// CRITICAL FIX: Better LinkedIn extraction completion check
async function checkLinkedInExtractionComplete(searchId) {
  try {
    const search = await SearchHistory.findById(searchId)
    if (!search) return

    // Check if search was stopped
    if (shouldStopSearch(searchId)) {
      console.log(`🛑 Search ${searchId} was stopped. Finalizing immediately.`)
      await SearchHistory.findByIdAndUpdate(searchId, {
        "searchProgress.isLinkedinExtractionComplete": true,
      })
      await finalizeSearchWithExistingCandidates(searchId, true)
      return
    }

    const totalLinkedIn = search.searchProgress.linkedinProfilesFound
    const processedLinkedIn = search.searchProgress.linkedinProfilesProcessed

    console.log(`📊 LinkedIn extraction check: ${processedLinkedIn}/${totalLinkedIn} processed`)

    if (processedLinkedIn >= totalLinkedIn) {
      console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`)

      // Mark LinkedIn extraction as complete
      await SearchHistory.findByIdAndUpdate(searchId, {
        "searchProgress.isLinkedinExtractionComplete": true,
        "searchProgress.currentPhase": "ai_evaluation",
        [`platformProgress.linkedin.status`]: "completed",
        [`platformProgress.linkedin.completed`]: true,
      })

      // Clear timeout if exists
      const queueItem = linkedinExtractionQueue.get(searchId)
      if (queueItem && queueItem.timeoutId) {
        clearTimeout(queueItem.timeoutId)
      }

      await emitProgress(
        searchId,
        "✅ LinkedIn extraction complete. Starting AI evaluation...",
        100,
        "linkedin_extraction",
        false,
      )

      // Start AI evaluation phase
      await finalizeSearchWithExistingCandidates(searchId, false)
    } else {
      // Update progress
      const progressPercent = totalLinkedIn > 0 ? (processedLinkedIn / totalLinkedIn) * 100 : 0
      await emitProgress(
        searchId,
        `LinkedIn extraction: ${processedLinkedIn}/${totalLinkedIn} profiles processed`,
        progressPercent,
        "linkedin_extraction",
        true,
      )
    }
  } catch (error) {
    console.error("❌ Error checking LinkedIn extraction completion:", error.message)
    await finalizeSearchWithExistingCandidates(searchId, false)
  }
}

// CRITICAL FIX: Proper search finalization with clear phases
async function finalizeSearchWithExistingCandidates(searchId, wasStopped = false) {
  try {
    console.log(`🏁 Finalizing search ${searchId} (stopped=${wasStopped})`)

    const search = await SearchHistory.findById(searchId)
    if (!search) {
      console.error("❌ Search not found:", searchId)
      return
    }

    // Prevent multiple finalizations
    if (search.status === "completed" || search.status === "stopped") {
      console.log(`ℹ️ Search ${searchId} already finalized with status: ${search.status}`)
      return
    }

    const job = await JobDescription.findById(search.jobId)
    if (!job) {
      console.error("❌ Job not found:", search.jobId)
      return
    }

    // Update status to prevent multiple finalizations
    await SearchHistory.findByIdAndUpdate(searchId, {
      status: wasStopped ? "stopped" : "evaluating",
      "searchProgress.currentPhase": "ai_evaluation",
    })

    const allCandidates = search.rawCandidates || []
    console.log(`📊 Starting AI evaluation of ${allCandidates.length} raw candidates`)

    if (allCandidates.length === 0) {
      console.log("⚠️ No candidates found")
      await SearchHistory.findByIdAndUpdate(searchId, {
        results: [],
        candidatesFound: 0,
        status: wasStopped ? "stopped" : "completed",
        completedAt: new Date(),
        "searchProgress.currentPhase": "completed",
        "searchProgress.isAiEvaluationComplete": true,
        "searchProgress.finalCandidatesSelected": 0,
      })

      await emitProgress(
        searchId,
        wasStopped ? "🛑 Search stopped - No candidates found" : "⚠️ Search completed - No candidates found",
        100,
        "completed",
        false,
      )

      io.emit("searchComplete", {
        searchId: searchId,
        candidates: [],
        wasStopped: wasStopped,
        summary: {
          totalRawCandidates: 0,
          finalCandidatesSelected: 0,
          message: "No candidates found",
        },
      })

      searchControlMap.delete(searchId.toString())
      linkedinExtractionQueue.delete(searchId)
      return
    }

    // Phase 1: AI Evaluation
    await emitProgress(
      searchId,
      `🧠 Starting AI evaluation of ${allCandidates.length} candidates...`,
      5,
      "ai_evaluation",
      false,
    )

    // Deduplicate candidates
    const uniqueCandidates = deduplicateCandidates(allCandidates)
    console.log(`🎯 After deduplication: ${uniqueCandidates.length} unique candidates`)

    await emitProgress(
      searchId,
      `🧠 AI evaluating ${uniqueCandidates.length} unique candidates...`,
      10,
      "ai_evaluation",
      false,
    )

    // Evaluate candidates with AI
    const evaluatedCandidates = []
    for (let i = 0; i < uniqueCandidates.length; i++) {
      const candidate = uniqueCandidates[i]

      // Progress update every 3 candidates
      if (i % 3 === 0 || i === uniqueCandidates.length - 1) {
        const progressPercent = (i / uniqueCandidates.length) * 80 // 0-80% of AI evaluation phase
        await emitProgress(
          searchId,
          `🧠 AI evaluating: ${candidate.candidateName || "Unknown"} (${i + 1}/${uniqueCandidates.length})`,
          progressPercent,
          "ai_evaluation",
          false,
          { currentCandidate: candidate.candidateName },
        )

        // Update progress in database
        await SearchHistory.findByIdAndUpdate(searchId, {
          "searchProgress.candidatesEvaluated": i + 1,
        })
      }

      try {
        const evaluation = await evaluateCandidateMatch(candidate, job, search.searchSettings)
        if (evaluation) {
          candidate.matchScore = evaluation.matchingScoreDetails.overallMatch
          candidate.matchingScoreDetails = evaluation.matchingScoreDetails
          candidate.analysis = evaluation.analysis
          candidate.comment = evaluation.comment
          candidate.recommendation = evaluation.recommendation
          candidate.confidenceLevel = evaluation.confidenceLevel
        }

        // Set required fields
        candidate.jobTitle = job._id
        candidate.companyId = job.companyId
        candidate.candidateStatus = "AI Sourced"
        candidate.aiSourced = true
        evaluatedCandidates.push(candidate)
      } catch (evalError) {
        console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, evalError.message)
        // Add candidate without evaluation
        candidate.matchScore = 0
        candidate.jobTitle = job._id
        candidate.companyId = job.companyId
        candidate.candidateStatus = "AI Sourced"
        candidate.aiSourced = true
        evaluatedCandidates.push(candidate)
      }
    }

    // Phase 2: Final Selection
    await emitProgress(
      searchId,
      `🎯 Selecting top candidates from ${evaluatedCandidates.length} evaluated...`,
      85,
      "ai_evaluation",
      false,
    )

    // Filter and rank candidates
    const rankedCandidates = evaluatedCandidates
      .filter((c) => c.candidateName && c.candidateName.trim() !== "")
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))

    // Select final candidates
    const targetCount = search.searchSettings.candidateCount || 10
    const finalCandidates = wasStopped ? rankedCandidates : rankedCandidates.slice(0, targetCount)

    console.log(`🎯 Final selection: ${finalCandidates.length} candidates (target: ${targetCount})`)

    // Phase 3: Saving to Database
    await emitProgress(
      searchId,
      `💾 Saving ${finalCandidates.length} top candidates to database...`,
      95,
      "finalizing",
      false,
    )

    // Save candidates to Resume database
    await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId)

    // Update search history with final results
    await SearchHistory.findByIdAndUpdate(searchId, {
      results: finalCandidates,
      candidatesFound: finalCandidates.length, // CRITICAL: This is the final count users see
      status: wasStopped ? "stopped" : "completed",
      completedAt: new Date(),
      "searchProgress.currentPhase": "completed",
      "searchProgress.isAiEvaluationComplete": true,
      "searchProgress.finalCandidatesSelected": finalCandidates.length,
    })

    const completionMessage = wasStopped
      ? `🛑 Search stopped! Found ${finalCandidates.length} qualified candidates.`
      : `🎉 Search completed! Found ${finalCandidates.length} qualified candidates.`

    await emitProgress(searchId, completionMessage, 100, "completed", false)

    // CRITICAL: Final results emission
    io.emit("searchComplete", {
      searchId: searchId,
      candidates: finalCandidates,
      wasStopped: wasStopped,
      summary: {
        totalRawCandidates: allCandidates.length,
        uniqueCandidatesEvaluated: uniqueCandidates.length,
        finalCandidatesSelected: finalCandidates.length,
        message: `AI evaluation complete: ${finalCandidates.length} qualified candidates selected from ${allCandidates.length} profiles found.`,
      },
    })

    // Create notification
    const notification = new Notification({
      message: `${wasStopped ? "🛑 Search stopped" : "🎉 Search completed"}! Found ${finalCandidates.length} qualified candidates for ${job.context}.`,
      recipientId: search.recruiterId,
      jobId: job._id,
    })
    await notification.save()
    io.emit("newNotification", notification)

    // Clean up
    searchControlMap.delete(searchId.toString())
    linkedinExtractionQueue.delete(searchId)

    console.log("✅ Search finalization completed successfully")
  } catch (error) {
    console.error("❌ Error in finalizeSearchWithExistingCandidates:", error.message)

    // Emergency cleanup
    try {
      await SearchHistory.findByIdAndUpdate(searchId, {
        status: "failed",
        completedAt: new Date(),
        "searchProgress.currentPhase": "completed",
      })

      io.emit("searchError", {
        searchId: searchId,
        message: `Search processing failed: ${error.message}`,
        wasStopped: false,
      })

      searchControlMap.delete(searchId.toString())
      linkedinExtractionQueue.delete(searchId)
    } catch (cleanupError) {
      console.error("❌ Error in emergency cleanup:", cleanupError.message)
    }
  }
}

// CRITICAL FIX: Enhanced Google search with proper progress tracking
async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
  const candidates = new Map()
  const linkedinUrls = new Set()
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

  console.log(`🔍 Starting Google search for ${platform} with ${queries.length} queries`)

  // Mark platform as active
  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.${platform}.status`]: "searching",
    [`platformProgress.${platform}.completed`]: false,
  })

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    if (shouldStopSearch(searchId)) {
      console.log(`🛑 Search stopped by user request at query ${i + 1}`)
      break
    }

    const query = queries[i]
    if (!query || query.trim() === "") continue

    try {
      const searchQuery = `${query} ${siteFilter}`.trim()
      console.log(`🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`)

      // CRITICAL: Proper progress update for searching phase
      const progressPercent = (i / queries.length) * 100
      await emitProgress(
        searchId,
        `Searching ${platform}: "${query.substring(0, 30)}..."`,
        progressPercent,
        "searching",
        true,
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
            // Check if it's a LinkedIn profile URL
            if (item.link.includes("linkedin.com/in/") && platform === "linkedin") {
              linkedinUrls.add(item.link)
              console.log(`🔗 Collected LinkedIn URL: ${item.link}`)
              continue
            }

            const candidate = await extractCandidateFromUrl(item.link, platform)
            if (candidate && candidate.candidateName) {
              candidates.set(item.link, candidate)
              totalResults++

              // Save candidate immediately
              await saveCandidateToBuffer(searchId, candidate, platform)
              console.log(`✅ Extracted & saved: ${candidate.candidateName} from ${platform}`)
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

  // Mark platform as completed
  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.${platform}.status`]: "completed",
    [`platformProgress.${platform}.completed`]: true,
    $inc: { "searchProgress.platformsCompleted": 1 },
  })

  // Handle LinkedIn URLs if found
  if (linkedinUrls.size > 0 && platform === "linkedin") {
    console.log(`🔗 Found ${linkedinUrls.size} LinkedIn URLs. Sending to browser for extraction...`)
    await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
  }

  console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} direct candidates.`)
  return Array.from(candidates.values())
}

// CRITICAL FIX: Enhanced LinkedIn URL handling with proper progress tracking
async function handleLinkedInUrls(searchId, linkedinUrls) {
  try {
    // Limit to top 25 LinkedIn URLs for performance
    const topUrls = linkedinUrls.slice(0, 25)
    console.log(`📤 Sending ${topUrls.length} LinkedIn URLs to frontend for browser extraction`)

    // Store LinkedIn URLs in search history for tracking
    const linkedinProfiles = topUrls.map((url) => ({
      profileUrl: url,
      candidateName: extractNameFromLinkedInUrl(url),
      extractionStatus: "pending",
      lastAttempted: new Date(),
      retryCount: 0,
    }))

    await SearchHistory.findByIdAndUpdate(searchId, {
      $push: { linkedinProfiles: { $each: linkedinProfiles } },
      status: "extracting",
      "searchProgress.currentPhase": "linkedin_extraction",
      "searchProgress.linkedinProfilesFound": topUrls.length,
      "searchProgress.linkedinProfilesProcessed": 0,
      "searchProgress.isLinkedinExtractionComplete": false,
    })

    // Emit LinkedIn URLs to frontend for browser extraction
    io.emit("linkedinUrlsForExtraction", {
      searchId: searchId,
      urls: topUrls,
      message: `Found ${topUrls.length} LinkedIn profiles. Starting browser extraction...`,
    })

    await emitProgress(
      searchId,
      `📤 LinkedIn extraction starting: 0/${topUrls.length} profiles`,
      0,
      "linkedin_extraction",
      true,
    )

    // Set timeout to prevent infinite waiting
    const timeoutId = setTimeout(
      async () => {
        const queueItem = linkedinExtractionQueue.get(searchId)
        if (queueItem && queueItem.status === "active") {
          console.log(`⏰ LinkedIn extraction timeout for search ${searchId}. Finalizing with existing results.`)

          await SearchHistory.findByIdAndUpdate(searchId, {
            "searchProgress.isLinkedinExtractionComplete": true,
          })

          linkedinExtractionQueue.set(searchId, { ...queueItem, status: "timeout" })
          await finalizeSearchWithExistingCandidates(searchId, false)
        }
      },
      8 * 60 * 1000,
    ) // 8 minutes timeout

    // Update the queue item with the timeout ID
    linkedinExtractionQueue.set(searchId, {
      urls: topUrls,
      processed: [],
      failed: [],
      startTime: new Date(),
      status: "active",
      timeoutId: timeoutId,
    })
  } catch (error) {
    console.error("❌ Error handling LinkedIn URLs:", error.message)
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

// Extract candidate from LinkedIn DOM using AI
async function extractCandidateFromLinkedInDOM(
  domContent,
  profileUrl,
  profileInfo = {},
  extractionMethod = "browser-dom",
) {
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
    ${domContent.substring(0, 15000)}
    ---

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
      "industries": ["industry1", "industry2"] or []
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
    if (!result || !result.candidateName) {
      console.log(`❌ No valid candidate data extracted from LinkedIn DOM`)
      return null
    }

    const candidate = {
      id: `${extractionMethod}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        extractionMethod: extractionMethod,
        hasEmail: !!result.email,
        hasPhone: !!result.mobile,
        hasContactInfo: !!(result.email || result.mobile),
        sourcedAt: new Date(),
        aiModel: "gpt-4o",
        ...profileInfo,
      },
      matchScore: 0,
    }

    return candidate
  } catch (error) {
    console.error(`❌ Error extracting candidate from LinkedIn DOM:`, error.message)
    return null
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

// Enhanced candidate extraction with AI
async function extractCandidateWithAI(pageText, url, platform) {
  const prompt = `
    You are an expert talent sourcer specializing in extracting professional information from ${platform} profiles.

    **CRITICAL EXTRACTION REQUIREMENTS:**
    1. **ZERO FABRICATION**: Only extract information explicitly present in the text
    2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
    3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional links
    4. **EXACT TRANSCRIPTION**: Copy information exactly as written

    **Content Source:** ${url} (Platform: ${platform})

    **Text Content:**
    ---
    ${pageText.substring(0, 12000)}
    ---

    **OUTPUT FORMAT:**
    Return ONLY this JSON structure with extracted data or null values:
    {
      "candidateName": "Full name exactly as written or null",
      "email": "primary.email@domain.com or null",
      "mobile": "exact phone number with formatting or null",
      "currentJobTitle": "Exact current title or null",
      "currentCompany": "Exact company name or null",
      "location": "Exact location string or null",
      "skills": ["actual", "skills", "extracted"] or [],
      "summary": "Professional summary/bio from profile or null",
      "experience": "Work experience description or null",
      "yearsOfExperience": "X years (only if explicitly stated) or null",
      "education": "Education information or null",
      "certifications": ["actual", "certifications"] or [],
      "projects": ["actual", "projects", "portfolio pieces"] or [],
      "achievements": ["awards", "recognition", "notable work"] or [],
      "industries": ["industry", "specializations"] or []
    }
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 2500,
      temperature: 0.05,
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)
    if (!result || !result.candidateName) {
      console.log(`❌ No valid candidate data extracted from ${url}`)
      return null
    }

    return {
      id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      candidateName: result.candidateName,
      email: result.email,
      mobile: result.mobile,
      currentJobTitle: result.currentJobTitle,
      currentCompany: result.currentCompany,
      location: result.location,
      skills: result.skills || [],
      summary: result.summary,
      experience: result.experience,
      yearsOfExperience: result.yearsOfExperience,
      education: result.education,
      certifications: result.certifications || [],
      projects: result.projects || [],
      achievements: result.achievements || [],
      industries: result.industries || [],
      sourceInfo: {
        platform,
        profileUrl: url,
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

// Enhanced candidate evaluation
async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
  if (!candidate.candidateName) {
    console.log("⚠️ Skipping evaluation - insufficient candidate data")
    return null
  }

  const prompt = `
    You are a senior technical recruiter and talent assessment expert with 20+ years of experience.
    Conduct a comprehensive evaluation of this candidate's fit for the position using rigorous assessment criteria.

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
    - Experience: ${candidate.yearsOfExperience || "Not specified"}
    - Summary: ${candidate.summary || "Not available"}
    - Education: ${candidate.education || "Not specified"}
    - Certifications: ${candidate.certifications?.join(", ") || "Not specified"}
    - Projects: ${candidate.projects?.join(", ") || "Not specified"}
    - Achievements: ${candidate.achievements?.join(", ") || "Not specified"}
    - Industries: ${candidate.industries?.join(", ") || "Not specified"}

    Return ONLY this JSON structure with thorough analysis:
    {
      "matchingScoreDetails": {
        "skillsMatch": number (0-100),
        "experienceMatch": number (0-100),
        "educationMatch": number (0-100),
        "culturalFitMatch": number (0-100),
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
          "relevantExperience": "detailed description or 'Limited information available'",
          "yearsOfExperience": "exact years mentioned or 'Not specified'",
          "careerProgression": "analysis of career growth",
          "industryExperience": "relevant industry background",
          "roleRelevance": "how previous roles align with target position"
        },
        "education": {
          "highestDegree": "actual degree or 'Not specified'",
          "relevantCourses": ["relevant", "coursework"] or [],
          "certifications": ["professional", "certifications"],
          "continuousLearning": "evidence of ongoing development"
        },
        "projects": ["significant", "projects", "and", "achievements"],
        "strengths": ["top", "candidate", "strengths"],
        "concerns": ["potential", "concerns", "or", "risks"],
        "recommendation": "detailed hiring recommendation with reasoning",
        "comments": "comprehensive assessment including data gaps",
        "additionalNotes": "market insights and unique value proposition"
      },
      "comment": "concise executive summary for hiring managers",
      "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
      "confidenceLevel": "High|Medium|Low (based on available information quality)"
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

// Save candidates to Resume database
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
      sourceInfo: candidate.sourceInfo,
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

// Deduplication function
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

// Enhanced main search function
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
      status: "searching",
      cost: {
        estimatedCost: estimatedCost.estimatedCost,
        actualCost: 0,
        tokensUsed: 0,
        apiCalls: 0,
      },
      rawCandidates: [],
      linkedinProfiles: [],
      searchProgress: {
        currentPhase: "initializing",
        platformsCompleted: 0,
        totalPlatforms: searchSettings.platforms.length,
        rawCandidatesFound: 0,
        linkedinProfilesFound: 0,
        linkedinProfilesProcessed: 0,
        candidatesEvaluated: 0,
        finalCandidatesSelected: 0,
        isLinkedinExtractionComplete: false,
        isAiEvaluationComplete: false,
      },
      platformProgress: {
        google: { status: "pending", candidatesFound: 0, completed: false },
        linkedin: { status: "pending", candidatesFound: 0, completed: false },
        github: { status: "pending", candidatesFound: 0, completed: false },
        dribbble: { status: "pending", candidatesFound: 0, completed: false },
        behance: { status: "pending", candidatesFound: 0, completed: false },
      },
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

// CRITICAL FIX: Enhanced main search workflow with proper phase management
async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
  let totalTokensUsed = 0
  let totalApiCalls = 0
  let wasStopped = false

  try {
    console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`)

    // Phase 1: Job Analysis
    await emitProgress(
      searchHistoryId,
      "🧠 Analyzing job requirements with AI intelligence...",
      5,
      "initializing",
      true,
    )

    const jobAnalysis = await analyzeJobForPlatformsInternal(job, searchSettings)
    totalApiCalls += 1
    totalTokensUsed += 1200

    if (!jobAnalysis) {
      throw new Error("Failed to analyze job requirements")
    }

    console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)

    await emitProgress(
      searchHistoryId,
      `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Starting platform searches...`,
      10,
      "searching",
      true,
    )

    // Check for stop before continuing
    if (shouldStopSearch(searchHistoryId)) {
      wasStopped = true
      throw new Error("Search stopped by user request")
    }

    // Phase 2: Platform Searches
    await SearchHistory.findByIdAndUpdate(searchHistoryId, {
      "searchProgress.currentPhase": "searching",
    })

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

    // Execute platform searches
    for (let i = 0; i < recommendedPlatforms.length; i++) {
      if (shouldStopSearch(searchHistoryId)) {
        console.log(`🛑 Search stopped before platform ${recommendedPlatforms[i].platform}`)
        wasStopped = true
        break
      }

      const platformInfo = recommendedPlatforms[i]
      const platform = platformInfo.platform

      await emitProgress(
        searchHistoryId,
        `🔍 Generating search queries for ${platform}...`,
        15 + i * 15,
        "searching",
        true,
      )

      const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis)
      totalApiCalls += 1
      totalTokensUsed += 1500

      if (queries.length === 0) {
        console.log(`⚠️ No queries generated for ${platform}`)
        continue
      }

      await emitProgress(
        searchHistoryId,
        `🚀 Searching ${platform} with ${queries.length} optimized queries...`,
        20 + i * 15,
        "searching",
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

      console.log(`📊 Platform ${platform} completed: ${platformCandidates.length} direct candidates`)

      // Check if we should stop or continue
      const currentSearch = await SearchHistory.findById(searchHistoryId)
      const totalRawFound = currentSearch.searchProgress.rawCandidatesFound

      if (shouldStopSearch(searchHistoryId)) {
        console.log(`🛑 Search stopped after ${platform} search`)
        wasStopped = true
        break
      }
    }

    // Phase 3: Check LinkedIn Extraction Status
    const searchAfterPlatforms = await SearchHistory.findById(searchHistoryId)
    const hasLinkedInProfiles = searchAfterPlatforms.linkedinProfiles.length > 0
    const isLinkedInComplete = searchAfterPlatforms.searchProgress.isLinkedinExtractionComplete

    if (hasLinkedInProfiles && !isLinkedInComplete) {
      console.log(`⏳ LinkedIn extraction in progress. Waiting for completion...`)

      await emitProgress(
        searchHistoryId,
        `⏳ LinkedIn extraction in progress: ${searchAfterPlatforms.searchProgress.linkedinProfilesProcessed}/${searchAfterPlatforms.searchProgress.linkedinProfilesFound} profiles`,
        0,
        "linkedin_extraction",
        true,
      )

      // The search will continue when LinkedIn extraction completes
      return
    }

    // Phase 4: Immediate AI Evaluation (no LinkedIn extraction needed)
    console.log(`🏁 All platform searches complete. Starting AI evaluation...`)
    await finalizeSearchWithExistingCandidates(searchHistoryId, wasStopped)
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
      "searchProgress.currentPhase": "completed",
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

    // Clean up
    searchControlMap.delete(searchHistoryId.toString())
    linkedinExtractionQueue.delete(searchHistoryId)
  }
}

// Platform search functions
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

  console.log(`🚀 Starting GitHub search with ${queries.length} queries`)

  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.github.status`]: "searching",
    [`platformProgress.github.completed`]: false,
  })

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    const query = queries[i]
    if (!query || query.trim() === "" || shouldStopSearch(searchId)) continue

    try {
      console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`)

      const progressPercent = (i / queries.length) * 100
      await emitProgress(searchId, `GitHub search: "${query.substring(0, 50)}..."`, progressPercent, "searching", true)

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
            const candidate = await extractCandidateFromUrl(user.html_url, "github")
            if (candidate && candidate.candidateName) {
              candidates.set(user.html_url, candidate)
              totalResults++

              await saveCandidateToBuffer(searchId, candidate, "github")
              console.log(`✅ GitHub candidate saved: ${candidate.candidateName}`)
            }
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1500))
    } catch (error) {
      console.error(`❌ GitHub search error:`, error.message)
      if (error.response?.status === 403 || error.response?.status === 429) {
        console.log("⏳ GitHub rate limited, waiting...")
        await new Promise((resolve) => setTimeout(resolve, 10000))
      }
    }
  }

  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.github.status`]: "completed",
    [`platformProgress.github.completed`]: true,
    $inc: { "searchProgress.platformsCompleted": 1 },
  })

  console.log(`🎉 GitHub search completed. Found ${candidates.size} candidates.`)
  return Array.from(candidates.values())
}

async function searchDribbble(queries, searchSettings, searchId) {
  console.log("🎨 Starting Dribbble search for design talent")
  return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
}

async function searchBehance(queries, searchSettings, searchId) {
  console.log("🎭 Starting Behance search for creative professionals")
  return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
}

// LinkedIn API search implementation
async function searchLinkedInWithApiKey(queries, searchSettings, searchId, apiKey) {
  console.log("🚀 LinkedIn API Search Starting")
  const candidates = new Map()
  const targetCandidates = Math.min(searchSettings.candidateCount * 2, 100)
  const apiEndpoint = "https://nubela.co/proxycurl/api/v2/linkedin"
  const linkedInUrls = new Set()
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

  if (!googleApiKey || !searchEngineId) {
    console.warn("⚠️ Google Search API not configured. Cannot find LinkedIn profiles.")
    return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/", searchId)
  }

  // Find LinkedIn URLs using Google
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
      console.error(`❌ Error finding LinkedIn URLs:`, error.message)
    }
  }

  console.log(`📊 Found ${linkedInUrls.size} LinkedIn URLs for API enrichment.`)

  // Enrich profiles using LinkedIn API
  let processedCount = 0
  for (const url of linkedInUrls) {
    if (candidates.size >= targetCandidates || shouldStopSearch(searchId)) break

    const progressPercent = (processedCount / linkedInUrls.size) * 100
    await emitProgress(
      searchId,
      `Enriching LinkedIn profile ${processedCount + 1}/${linkedInUrls.size}...`,
      progressPercent,
      "searching",
      true,
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
            hasEmail: !!profileData.personal_email,
            hasPhone: !!profileData.personal_contact_number,
            sourcedAt: new Date(),
            aiModel: "linkedin-api",
          },
          matchScore: 0,
        }

        candidates.set(profileData.public_identifier, candidate)
        await saveCandidateToBuffer(searchId, candidate, "linkedin-api")
        console.log(`✅ LinkedIn API candidate saved: ${candidate.candidateName}`)
      }
    } catch (error) {
      console.error(`❌ Error enriching LinkedIn profile:`, error.message)
    }

    processedCount++
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  console.log(`🎉 LinkedIn API search completed. Found ${candidates.size} candidates.`)
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

// Query generation
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

    **Platform to Target:** ${platform}

    **Query Generation Strategy:**
    - Create 5–7 broad queries to maximize candidate matches.
    - Combine core skills, primary job titles, and location (if specified) in each query.
    - Use Boolean operators (AND, OR, quotes) for broad reach.
    - Avoid overly specific queries; focus on high-volume candidate pools.
    - Include alternative job titles and skill synonyms where relevant.

    Return ONLY a valid JSON object:
    {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7"]}
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 800,
      temperature: 0.4,
      response_format: { type: "json_object" },
    })

    const content = JSON.parse(response.choices[0].message.content)
    const queries = content.queries || []
    console.log(`🔍 Generated ${queries.length} queries for ${platform}`)
    return queries.slice(0, 7)
  } catch (error) {
    console.error("❌ Error generating search queries:", error.message)
    return []
  }
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
      "Proper Progress Tracking",
    ],
  }
}

// Job analysis function
async function analyzeJobForPlatformsInternal(jobDescription, searchSettings) {
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
    - google: General web search, resumes, portfolios, industry-specific sites
    - dribbble: UI/UX designers, visual designers, product designers
    - behance: Creative professionals, graphic designers, artists, brand designers

    Return ONLY a valid JSON object with comprehensive analysis:
    {
      "jobCategory": "Primary category (be very specific)",
      "jobSubcategory": "Detailed subcategory with specialization",
      "seniorityLevel": "Entry/Mid/Senior/Executive level analysis",
      "recommendedPlatforms": [
        {
          "platform": "platform_name",
          "priority": "high|medium|low",
          "reason": "Detailed explanation of why this platform is optimal",
          "expectedCandidateVolume": "high|medium|low"
        }
      ],
      "searchKeywords": ["highly relevant keyword1", "keyword2", "keyword3"],
      "alternativeJobTitles": ["alternative title1", "title2", "title3"],
      "industrySpecificTerms": ["term1", "term2", "term3"],
      "skillSynonyms": {
        "primary_skill": ["synonym1", "synonym2"],
        "secondary_skill": ["synonym1", "synonym2"]
      },
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
    console.log("🔍 Job analysis completed:", {
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

export const analyzeJobForPlatforms = analyzeJobForPlatformsInternal

// API endpoint implementations
export const getSearchResults = async (req, res) => {
  try {
    const { searchId } = req.params
    const search = await SearchHistory.findById(searchId)

    if (!search) {
      return res.status(404).json({ success: false, error: "Search not found" })
    }

    res.status(200).json({
      success: true,
      results: search.results || [],
      rawCandidates: search.rawCandidates || [],
      linkedinProfiles: search.linkedinProfiles || [],
      platformProgress: search.platformProgress || {},
      searchProgress: search.searchProgress || {},
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
    const searches = await SearchHistory.find({ recruiterId })
      .select("-results -rawCandidates")
      .sort({ createdAt: -1 })
      .limit(20)

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

// Manual extraction notification endpoint
export const notifyManualExtraction = async (req, res) => {
  try {
    const { searchId, urlCount } = req.body
    if (!searchId) {
      return res.status(400).json({ success: false, error: "Search ID required" })
    }

    console.log(`📱 Manual extraction started for ${urlCount} URLs in search ${searchId}`)

    await emitProgress(
      searchId,
      `👤 Manual extraction: Opening ${urlCount} LinkedIn profiles...`,
      0,
      "linkedin_extraction",
      true,
    )

    res.status(200).json({
      success: true,
      message: "Manual extraction notification received",
    })
  } catch (error) {
    console.error("❌ Error in manual extraction notification:", error.message)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// Visible tab LinkedIn processing
export const processLinkedInDOM = async (req, res) => {
  try {
    const { url, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
    const finalUrl = profileUrl || url

    console.log(`📥 Processing LinkedIn DOM from visible tab: ${finalUrl}`)

    if (!success || !domContent) {
      console.log(`❌ Failed to extract DOM from visible tab: ${finalUrl}. Reason: ${error}`)
      return res.status(200).json({
        success: false,
        message: "Failed visible tab extraction",
        error: error,
      })
    }

    const candidateName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl)
    console.log(`✅ Successfully extracted LinkedIn profile from visible tab: ${candidateName}`)

    const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod)

    if (candidate) {
      console.log(`✅ Successfully processed LinkedIn candidate from visible tab: ${candidate.candidateName}`)

      return res.status(200).json({
        success: true,
        message: "LinkedIn profile extracted successfully from visible tab",
        candidate: {
          name: candidate.candidateName,
          headline: candidate.headline,
          location: candidate.location,
        },
      })
    } else {
      console.log(`❌ AI failed to extract candidate data from visible tab: ${finalUrl}`)
      return res.status(200).json({
        success: false,
        message: "Failed to extract candidate data from visible tab",
      })
    }
  } catch (error) {
    console.error("❌ Error processing LinkedIn DOM from visible tab:", error.message)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}



// FIXED HEADHUNTER CONTROLLER - ADDRESSING ALL CRITICAL ISSUES
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

// // LinkedIn extraction queue and results - FIXED: Better state management
// // This map will now primarily track the *status* of the offscreen extraction, not the candidates themselves.
// const linkedinExtractionQueue = new Map() // searchId -> { urls: [], processed: [], failed: [], status: 'active' }

// // ENHANCED SCHEMA - CRITICAL FIX: Store candidates immediately as they're found
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: {
//     type: String,
//     enum: ["pending", "in_progress", "completed", "failed", "stopped", "linkedin_extracting"],
//     default: "pending"
//   },
//   // CRITICAL FIX: Store all found candidates immediately (before AI evaluation)
//   rawCandidates: [{
//     candidateName: String,
//     email: String,
//     mobile: mongoose.Schema.Types.Mixed,
//     currentJobTitle: String,
//     currentCompany: String,
//     location: String,
//     skills: [String],
//     experience: String,
//     summary: String,
//     sourceInfo: {
//       platform: String,
//       profileUrl: String,
//       linkedinProfileUrl: String,
//       githubProfileUrl: String,
//       portfolioUrl: String,
//       dribbbleUrl: String,
//       behanceUrl: String,
//       mediumUrl: String,
//       twitterUrl: String,
//       personalWebsite: String,
//       extractionMethod: String,
//       sourcedAt: Date,
//       aiModel: String,
//       hasEmail: Boolean,
//       hasPhone: Boolean,
//     },
//     foundAt: { type: Date, default: Date.now },
//     platformSource: String,
//   }],
//   // Final evaluated candidates (after AI processing)
//   results: [{
//     candidateName: String,
//     email: String,
//     mobile: mongoose.Schema.Types.Mixed,
//     jobTitle: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription" },
//     companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//     currentCompany: String,
//     location: String,
//     skills: [String],
//     experience: String,
//     summary: String,
//     candidateStatus: String,
//     matchingScoreDetails: {
//       skillsMatch: Number,
//       experienceMatch: Number,
//       educationMatch: Number,
//       overallMatch: Number,
//       culturalFitMatch: Number,
//     },
//     analysis: {
//       skills: {
//         candidateSkills: [String],
//         matched: [String],
//         notMatched: [String],
//         transferableSkills: [String],
//         skillGaps: [String],
//         skillStrengths: [String],
//       },
//       experience: {
//         relevantExperience: String,
//         yearsOfExperience: String,
//         careerProgression: String,
//         industryExperience: String,
//         roleRelevance: String,
//       },
//       education: {
//         highestDegree: String,
//         relevantCourses: [String],
//         certifications: [String],
//         continuousLearning: String,
//       },
//       projects: [String],
//       strengths: [String],
//       concerns: [String],
//       recommendation: String,
//       comments: String,
//       additionalNotes: String,
//     },
//     comment: String,
//     recommendation: {
//       type: String,
//       enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//     },
//     confidenceLevel: String,
//     aiSourced: Boolean,
//     sourceInfo: {
//       platform: String,
//       profileUrl: String,
//       linkedinProfileUrl: String,
//       githubProfileUrl: String,
//       portfolioUrl: String,
//       dribbbleUrl: String,
//       behanceUrl: String,
//       mediumUrl: String,
//       twitterUrl: String,
//       personalWebsite: String,
//       extractionMethod: String,
//       sourcedAt: Date,
//       sourcedBy: mongoose.Schema.Types.ObjectId,
//       aiModel: String,
//       hasEmail: Boolean,
//       hasPhone: Boolean,
//     },
//   }],
//   linkedinProfiles: [{
//     profileUrl: String,
//     candidateName: String,
//     profileTitle: String,
//     location: String,
//     extractionStatus: {
//       type: String,
//       enum: ["pending", "processing", "success", "failed", "rate_limited", "blocked"],
//       default: "pending",
//     },
//     errorCode: Number,
//     lastAttempted: { type: Date, default: Date.now },
//     retryCount: { type: Number, default: 0 },
//   }],
//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },
//   // CRITICAL: Track platform progress
//   platformProgress: {
//     google: { status: String, candidatesFound: Number, completed: Boolean },
//     linkedin: { status: String, candidatesFound: Number, completed: Boolean },
//     github: { status: String, candidatesFound: Number, completed: Boolean },
//     dribbble: { status: String, candidatesFound: Number, completed: Boolean },
//     behance: { status: String, candidatesFound: Number, completed: Boolean },
//   },
//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
//   stoppedAt: Date,
//   stoppedBy: mongoose.Schema.Types.ObjectId,
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // CRITICAL FIX: Enhanced progress emission with proper state tracking
// async function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "", canStop = true, currentCandidate = "") {
//   const search = await SearchHistory.findById(searchId);
//   if (!search) return;

//   const progressData = {
//     searchId,
//     status,
//     progress: Math.min(Math.max(progress, 0), 100),
//     candidatesFound,
//     platform,
//     timestamp: new Date().toISOString(),
//     canStop,
//     currentCandidate,
//     // CRITICAL: Add total candidates across all platforms from rawCandidates
//     totalCandidatesFound: search.rawCandidates.length,
//   }

//   console.log(`📡 Progress Update [${searchId}]: ${progress.toFixed(1)}% - ${status} - ${candidatesFound} candidates - Platform: ${platform} - Total: ${progressData.totalCandidatesFound}`)
//   io.emit("searchProgress", progressData)
// }

// // Check if search should be stopped
// function shouldStopSearch(searchId) {
//   const control = searchControlMap.get(searchId.toString())
//   return control?.shouldStop || false
// }

// // CRITICAL FIX: Save candidates immediately as they're found
// async function saveCandidateToBuffer(searchId, candidate, platform) {
//   try {
//     // CRITICAL: Save to database immediately
//     const candidateData = {
//       candidateName: candidate.candidateName,
//       email: candidate.email,
//       mobile: candidate.mobile,
//       currentJobTitle: candidate.currentJobTitle,
//       currentCompany: candidate.currentCompany,
//       location: candidate.location,
//       skills: candidate.skills || [],
//       experience: candidate.experience,
//       summary: candidate.summary,
//       sourceInfo: candidate.sourceInfo || {},
//       foundAt: new Date(),
//       platformSource: platform,
//     }

//     const search = await SearchHistory.findById(searchId);
//     if (!search) {
//       console.error(`❌ Search ${searchId} not found for saving candidate.`)
//       return;
//     }

//     // Check for duplicates before pushing to rawCandidates
//     const isDuplicate = search.rawCandidates.some(
//       (raw) =>
//         (raw.email && raw.email.toLowerCase() === candidate.email?.toLowerCase()) ||
//         (raw.sourceInfo?.linkedinProfileUrl && raw.sourceInfo.linkedinProfileUrl === candidate.sourceInfo?.linkedinProfileUrl) ||
//         (raw.sourceInfo?.profileUrl && raw.sourceInfo.profileUrl === candidate.sourceInfo?.profileUrl)
//     );

//     if (isDuplicate) {
//       console.log(`ℹ️ Candidate ${candidate.candidateName} from ${platform} is a duplicate, skipping save to rawCandidates.`)
//       return;
//     }

//     await SearchHistory.findByIdAndUpdate(
//       searchId,
//       {
//         $push: { rawCandidates: candidateData },
//         $inc: { candidatesFound: 1 } // This will count all raw candidates
//       },
//       { new: true }
//     )

//     // Update platform progress
//     // This requires iterating through rawCandidates to count for the specific platform
//     const updatedSearch = await SearchHistory.findById(searchId);
//     const totalForPlatform = updatedSearch.rawCandidates.filter(c => c.platformSource === platform).length;

//     await SearchHistory.findByIdAndUpdate(searchId, {
//       [`platformProgress.${platform}.candidatesFound`]: totalForPlatform,
//       [`platformProgress.${platform}.status`]: "active"
//     })

//     console.log(`💾 Candidate saved: ${candidate.candidateName} from ${platform} (Total raw candidates: ${updatedSearch.rawCandidates.length})`)
//   } catch (error) {
//     console.error(`❌ Error saving candidate to buffer:`, error.message)
//   }
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
//       status: "stopped"
//     })
//     console.log(`🛑 Search ${searchId} stop requested by ${recruiterId}`)
//     res.status(200).json({
//       success: true,
//       message: "Search stop requested. Processing current candidates...",
//     })
//     // CRITICAL: Trigger immediate finalization with existing candidates
//     setTimeout(async () => {
//       await finalizeSearchWithExistingCandidates(searchId, true)
//     }, 2000) // 2 second delay to allow current operations to complete
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

// // CRITICAL FIX: Process LinkedIn DOM with immediate saving (for visible content script)
// export const processLinkedInDOM2 = async (req, res) => {
//   try {
//     const { searchId, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
//     if (!searchId || !profileUrl) {
//       return res.status(400).json({ success: false, error: "Search ID and profile URL are required" })
//     }
//     console.log(`📥 Processing LinkedIn DOM (visible) for: ${profileUrl} (Success: ${success})`)

//     // Update status in linkedinProfiles array in SearchHistory
//     await updateLinkedInProfileStatus(searchId, profileUrl, success ? "processing" : "failed", profileInfo?.name);

//     if (!success || !domContent) {
//       console.log(`❌ Failed to extract DOM from: ${profileUrl}. Reason: ${error}`)
//       await checkLinkedInExtractionComplete(searchId)
//       return res.status(200).json({ success: true, message: "Failed extraction recorded" })
//     }

//     // Extract candidate name from URL for progress tracking
//     const candidateName = profileInfo?.name || extractNameFromLinkedInUrl(profileUrl)

//     // Emit progress with current candidate
//     const search = await SearchHistory.findById(searchId);
//     emitProgress(
//       searchId,
//       `🔍 Extracting: ${candidateName}`,
//       65,
//       search.rawCandidates.length,
//       "linkedin-browser",
//       true,
//       candidateName
//     )

//     // Extract candidate data using AI
//     const candidate = await extractCandidateFromLinkedInDOM(domContent, profileUrl, profileInfo, extractionMethod)
//     if (candidate) {
//       console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`)

//       // CRITICAL: Save immediately to buffer and database
//       await saveCandidateToBuffer(searchId, candidate, 'linkedin-browser')

//       await updateLinkedInProfileStatus(searchId, profileUrl, "success", candidate.candidateName)

//       // Emit progress with successful extraction
//       const updatedSearch = await SearchHistory.findById(searchId);
//       emitProgress(
//         searchId,
//         `✅ Extracted: ${candidate.candidateName}`,
//         70,
//         updatedSearch.rawCandidates.length,
//         "linkedin-browser",
//         true,
//         candidate.candidateName
//       )
//     } else {
//       console.log(`❌ AI failed to extract candidate data from: ${profileUrl}`)
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed")
//     }

//     // Check if extraction is complete
//     await checkLinkedInExtractionComplete(searchId)
//     res.status(200).json({
//       success: true,
//       message: "LinkedIn DOM processed",
//       candidateExtracted: !!candidate,
//       candidateName: candidate?.candidateName,
//       totalCandidates: (await SearchHistory.findById(searchId)).rawCandidates.length
//     })
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn DOM:", error.message)
//     if (req.body.searchId) {
//       await checkLinkedInExtractionComplete(req.body.searchId)
//     }
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // NEW ENDPOINT: CRITICAL FIX: Process LinkedIn DOM from Offscreen Document
// export const processLinkedInDOMOffscreen2 = async (req, res) => {
//   try {
//     const { searchId, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
//     console.log( "request body", req.body)
//     console.log("searchid",searchId, "url", profileUrl )
//     if (!searchId || !profileUrl) {
//       return res.status(400).json({ success: false, error: "Search ID and profile URL are required" })
//     }
//     console.log(`📥 Processing LinkedIn DOM (offscreen) for: ${profileUrl} (Success: ${success})`)

//     // Update status in linkedinProfiles array in SearchHistory
//     await updateLinkedInProfileStatus(searchId, profileUrl, success ? "processing" : "failed", profileInfo?.name);

//     if (!success || !domContent) {
//       console.log(`❌ Failed to extract DOM from offscreen: ${profileUrl}. Reason: ${error}`)
//       await checkLinkedInExtractionComplete(searchId)
//       return res.status(200).json({ success: true, message: "Failed offscreen extraction recorded" })
//     }

//     const candidateName = profileInfo?.name || extractNameFromLinkedInUrl(profileUrl)

//     const search = await SearchHistory.findById(searchId);
//     emitProgress(
//       searchId,
//       `🔍 Extracting (Offscreen): ${candidateName}`,
//       65,
//       search.rawCandidates.length,
//       "linkedin-offscreen",
//       true,
//       candidateName
//     )

//     const candidate = await extractCandidateFromLinkedInDOM(domContent, profileUrl, profileInfo, extractionMethod)
//     if (candidate) {
//       console.log(`✅ Successfully extracted LinkedIn candidate (offscreen): ${candidate.candidateName}`)
//       await saveCandidateToBuffer(searchId, candidate, 'linkedin-offscreen')
//       await updateLinkedInProfileStatus(searchId, profileUrl, "success", candidate.candidateName)

//       const updatedSearch = await SearchHistory.findById(searchId);
//       emitProgress(
//         searchId,
//         `✅ Extracted (Offscreen): ${candidate.candidateName}`,
//         70,
//         updatedSearch.rawCandidates.length,
//         "linkedin-offscreen",
//         true,
//         candidate.candidateName
//       )
//     } else {
//       console.log(`❌ AI failed to extract candidate data from offscreen: ${profileUrl}`)
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed")
//     }

//     await checkLinkedInExtractionComplete(searchId)
//     res.status(200).json({
//       success: true,
//       message: "LinkedIn DOM (offscreen) processed",
//       candidateExtracted: !!candidate,
//       candidateName: candidate?.candidateName,
//       totalCandidates: (await SearchHistory.findById(searchId)).rawCandidates.length
//     })
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn DOM (offscreen):", error.message)
//     if (req.body.searchId) {
//       await checkLinkedInExtractionComplete(req.body.searchId)
//     }
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // Updated backend controller to handle both background tab and visible tab extractions

// export const processLinkedInDOMOffscreen = async (req, res) => {
//   try {
//     const { searchId, url, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
//     console.log("request body", req.body)
    
//     const finalUrl = profileUrl || url
//     console.log("searchId:", searchId, "profileUrl:", finalUrl)
    
//     // Handle visible tab extractions (when searchId is null)
//     if (!searchId) {
//       console.log(`📥 Processing LinkedIn DOM from visible tab: ${finalUrl} (Success: ${success})`)
      
//       if (!success || !domContent) {
//         console.log(`❌ Failed to extract DOM from visible tab: ${finalUrl}. Reason: ${error}`)
//         return res.status(200).json({ 
//           success: true, 
//           message: "Failed visible tab extraction recorded",
//           extractionType: "visible-tab"
//         })
//       }
      
//       const candidateName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl)
//       console.log(`✅ Successfully extracted LinkedIn profile from visible tab: ${candidateName}`)
      
//       const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod)
//       if (candidate) {
//         console.log(`✅ Successfully processed LinkedIn candidate from visible tab: ${candidate.candidateName}`)
//         // For visible tab extractions, you might want to save directly or handle differently
//         // This depends on your application flow
//         return res.status(200).json({
//           success: true,
//           message: "LinkedIn DOM from visible tab processed successfully",
//           candidateExtracted: true,
//           candidateName: candidate.candidateName,
//           extractionType: "visible-tab"
//         })
//       } else {
//         console.log(`❌ AI failed to extract candidate data from visible tab: ${finalUrl}`)
//         return res.status(200).json({
//           success: false,
//           message: "Failed to extract candidate data from visible tab",
//           extractionType: "visible-tab"
//         })
//       }
//     }
    
//     // Handle background tab extractions (original logic with searchId)
//     if (!finalUrl) {
//       return res.status(400).json({ success: false, error: "Search ID and profile URL are required" })
//     }

//     console.log(`📥 Processing LinkedIn DOM (background tab) for: ${finalUrl} (Success: ${success})`)

//     // Update status in linkedinProfiles array in SearchHistory
//     await updateLinkedInProfileStatus(searchId, finalUrl, success ? "processing" : "failed", profileInfo?.name);

//     if (!success || !domContent) {
//       console.log(`❌ Failed to extract DOM from background tab: ${finalUrl}. Reason: ${error}`)
//       await checkLinkedInExtractionComplete(searchId)
//       return res.status(200).json({ 
//         success: true, 
//         message: "Failed background tab extraction recorded",
//         extractionType: "background-tab"
//       })
//     }

//     const candidateName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl)

//     const search = await SearchHistory.findById(searchId);
//     emitProgress(
//       searchId,
//       `🔍 Extracting (Background Tab): ${candidateName}`,
//       65,
//       search.rawCandidates.length,
//       "linkedin-background-tab",
//       true,
//       candidateName
//     )

//     const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod)
//     if (candidate) {
//       console.log(`✅ Successfully extracted LinkedIn candidate (background tab): ${candidate.candidateName}`)
//       await saveCandidateToBuffer(searchId, candidate, 'linkedin-background-tab')
//       await updateLinkedInProfileStatus(searchId, finalUrl, "success", candidate.candidateName)

//       const updatedSearch = await SearchHistory.findById(searchId);
//       emitProgress(
//         searchId,
//         `✅ Extracted (Background Tab): ${candidate.candidateName}`,
//         70,
//         updatedSearch.rawCandidates.length,
//         "linkedin-background-tab",
//         true,
//         candidate.candidateName
//       )
//     } else {
//       console.log(`❌ AI failed to extract candidate data from background tab: ${finalUrl}`)
//       await updateLinkedInProfileStatus(searchId, finalUrl, "failed")
//     }

//     await checkLinkedInExtractionComplete(searchId)
//     res.status(200).json({
//       success: true,
//       message: "LinkedIn DOM (background tab) processed",
//       candidateExtracted: !!candidate,
//       candidateName: candidate?.candidateName,
//       totalCandidates: (await SearchHistory.findById(searchId)).rawCandidates.length,
//       extractionType: "background-tab"
//     })
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn DOM:", error.message)
//     if (req.body.searchId) {
//       await checkLinkedInExtractionComplete(req.body.searchId)
//     }
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // You might also want to add a separate endpoint for visible tab extractions
// export const processLinkedInDOM = async (req, res) => {
//   try {
//     const { url, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
//     const finalUrl = profileUrl || url
    
//     console.log(`📥 Processing LinkedIn DOM from visible tab: ${finalUrl} (Success: ${success})`)
    
//     if (!success || !domContent) {
//       console.log(`❌ Failed to extract DOM from visible tab: ${finalUrl}. Reason: ${error}`)
//       return res.status(200).json({ 
//         success: false, 
//         message: "Failed visible tab extraction",
//         error: error
//       })
//     }
    
//     const candidateName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl)
//     console.log(`✅ Successfully extracted LinkedIn profile from visible tab: ${candidateName}`)
    
//     const candidate = await extractCandidateFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod)
//     if (candidate) {
//       console.log(`✅ Successfully processed LinkedIn candidate from visible tab: ${candidate.candidateName}`)
      
//       // For visible tab extractions, you might want to save to a different collection
//       // or handle differently based on your application needs
      
//       return res.status(200).json({
//         success: true,
//         message: "LinkedIn profile extracted successfully from visible tab",
//         candidate: {
//           name: candidate.candidateName,
//           headline: candidate.headline,
//           location: candidate.location,
//           // Add other relevant fields
//         }
//       })
//     } else {
//       console.log(`❌ AI failed to extract candidate data from visible tab: ${finalUrl}`)
//       return res.status(200).json({
//         success: false,
//         message: "Failed to extract candidate data from visible tab"
//       })
//     }
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn DOM from visible tab:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }


// // Update LinkedIn profile extraction status
// async function updateLinkedInProfileStatus(searchId, profileUrl, status, candidateName = null) {
//   try {
//     const updateData = {
//       "linkedinProfiles.$.extractionStatus": status,
//       "linkedinProfiles.$.lastAttempted": new Date(),
//     }
//     if (candidateName) {
//       updateData["linkedinProfiles.$.candidateName"] = candidateName
//     }
//     await SearchHistory.findOneAndUpdate(
//       {
//         _id: searchId,
//         "linkedinProfiles.profileUrl": profileUrl,
//       },
//       {
//         $set: updateData,
//       }
//     )
//   } catch (error) {
//     console.error("❌ Error updating LinkedIn profile status:", error.message)
//   }
// }

// // CRITICAL FIX: Better extraction completion check
// async function checkLinkedInExtractionComplete(searchId) {
//   try {
//     const search = await SearchHistory.findById(searchId)
//     if (!search) return

//     // Check if the search has been stopped by the user
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search ${searchId} was stopped. Finalizing immediately.`)
//       await finalizeSearchWithExistingCandidates(searchId, true)
//       return
//     }

//     const pendingProfiles = search.linkedinProfiles.filter(
//       (profile) => profile.extractionStatus === "pending" || profile.extractionStatus === "processing"
//     )
//     console.log(`📊 LinkedIn extraction check: ${pendingProfiles.length} pending profiles remaining`)

//     if (pendingProfiles.length === 0) {
//       console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`)
//       // Mark LinkedIn platform as completed
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         [`platformProgress.linkedin-browser.status`]: "completed",
//         [`platformProgress.linkedin-browser.completed`]: true,
//       });

//       // Clear the timeout for this search if it exists
//       const queueItem = linkedinExtractionQueue.get(searchId);
//       if (queueItem && queueItem.timeoutId) {
//         clearTimeout(queueItem.timeoutId);
//         queueItem.timeoutId = null; // Clear the ID
//       }

//       await finalizeSearchWithExistingCandidates(searchId, false)
//     } else {
//       // Emit progress update
//       const totalProfiles = search.linkedinProfiles.length
//       const processedProfiles = totalProfiles - pendingProfiles.length
//       const progressPercentage = totalProfiles > 0 ? (processedProfiles / totalProfiles) * 100 : 0

//       emitProgress(
//         searchId,
//         `LinkedIn: ${processedProfiles}/${totalProfiles} processed`,
//         60 + (progressPercentage * 0.2), // 60-80% range
//         search.rawCandidates.length, // Use rawCandidates length for total
//         "linkedin-browser",
//         true,
//         `Processing profile ${processedProfiles + 1}...`
//       )
//     }
//   } catch (error) {
//     console.error("❌ Error checking LinkedIn extraction completion:", error.message)
//     // Finalize with existing candidates on error
//     await finalizeSearchWithExistingCandidates(searchId, false)
//   }
// }

// // CRITICAL FIX: New function to finalize search with existing candidates
// async function finalizeSearchWithExistingCandidates(searchId, wasStopped = false) {
//   try {
//     console.log(`🏁 Finalizing search ${searchId} (stopped=${wasStopped})`)
//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       console.error("❌ Search not found:", searchId)
//       return
//     }
//     const job = await JobDescription.findById(search.jobId)
//     if (!job) {
//       console.error("❌ Job not found:", search.jobId)
//       return
//     }

//     // CRITICAL: Get ALL candidates from database (rawCandidates)
//     const allCandidates = search.rawCandidates || []

//     console.log(`📊 Total candidates for processing: ${allCandidates.length}`)

//     if (allCandidates.length === 0) {
//       console.log("⚠️ No candidates found")

//       await SearchHistory.findByIdAndUpdate(searchId, {
//         results: [],
//         candidatesFound: 0,
//         status: wasStopped ? "stopped" : "completed",
//         completedAt: new Date(),
//       })
//       io.emit("searchComplete", {
//         searchId: searchId,
//         candidates: [],
//         wasStopped: wasStopped,
//         summary: {
//           totalCandidatesFound: 0,
//           finalCandidatesSelected: 0,
//           message: "No candidates found"
//         },
//       })
//       searchControlMap.delete(searchId.toString())
//       linkedinExtractionQueue.delete(searchId) // Clean up queue status
//       return
//     }

//     emitProgress(
//       searchId,
//       `🔄 Processing ${allCandidates.length} candidates...`,
//       85,
//       allCandidates.length,
//       "processing",
//       false
//     )

//     // Deduplicate candidates
//     const uniqueCandidates = deduplicateCandidates(allCandidates)
//     console.log(`🎯 After deduplication: ${uniqueCandidates.length} unique candidates`)

//     emitProgress(
//       searchId,
//       `🧠 AI evaluation of ${uniqueCandidates.length} candidates...`,
//       90,
//       uniqueCandidates.length,
//       "evaluating",
//       false
//     )

//     // Evaluate candidates with AI matching
//     const evaluatedCandidates = []
//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i]

//       // Progress update every 5 candidates
//       if (i % 5 === 0) {
//         emitProgress(
//           searchId,
//           `🧠 Evaluating: ${candidate.candidateName || 'Unknown'}`,
//           90 + ((i / uniqueCandidates.length) * 8), // 90-98%
//           evaluatedCandidates.length,
//           "ai-evaluation",
//           false,
//           candidate.candidateName
//         )
//       }
//       try {
//         const evaluation = await evaluateCandidateMatch(candidate, job, search.searchSettings)
//         if (evaluation) {
//           candidate.matchScore = evaluation.matchingScoreDetails.overallMatch
//           candidate.matchingScoreDetails = evaluation.matchingScoreDetails
//           candidate.analysis = evaluation.analysis
//           candidate.comment = evaluation.comment
//           candidate.recommendation = evaluation.recommendation
//           candidate.confidenceLevel = evaluation.confidenceLevel
//         }

//         // Set required fields
//         candidate.jobTitle = job._id
//         candidate.companyId = job.companyId
//         candidate.candidateStatus = "AI Sourced"
//         candidate.aiSourced = true

//         evaluatedCandidates.push(candidate)
//       } catch (evalError) {
//         console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, evalError.message)
//         // Add candidate without evaluation
//         candidate.matchScore = 0
//         candidate.jobTitle = job._id
//         candidate.companyId = job.companyId
//         candidate.candidateStatus = "AI Sourced"
//         candidate.aiSourced = true
//         evaluatedCandidates.push(candidate)
//       }
//     }

//     // Filter and rank candidates
//     const rankedCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName && c.candidateName.trim() !== "")
//       .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))

//     // Select final candidates
//     const targetCount = search.searchSettings.candidateCount || 10
//     const finalCandidates = wasStopped ? rankedCandidates : rankedCandidates.slice(0, targetCount)
//     console.log(`🎯 Final selection: ${finalCandidates.length} candidates (target: ${targetCount})`)

//     emitProgress(
//       searchId,
//       `💾 Saving ${finalCandidates.length} top candidates...`,
//       98,
//       finalCandidates.length,
//       "saving",
//       false
//     )

//     // Save candidates to Resume database
//     await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId)

//     // CRITICAL: Remove non-selected candidates from rawCandidates to save space
//     const selectedCandidateUrls = new Set(finalCandidates.map(c => c.sourceInfo?.linkedinProfileUrl || c.sourceInfo?.profileUrl).filter(Boolean));
//     const filteredRawCandidates = search.rawCandidates.filter(raw =>
//       selectedCandidateUrls.has(raw.sourceInfo?.linkedinProfileUrl) ||
//       selectedCandidateUrls.has(raw.sourceInfo?.profileUrl)
//     );

//     // Update search history with final results
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       results: finalCandidates,
//       rawCandidates: filteredRawCandidates, // Keep only selected candidates
//       candidatesFound: finalCandidates.length,
//       status: wasStopped ? "stopped" : "completed",
//       completedAt: new Date(),
//     })

//     const completionMessage = wasStopped
//       ? `🛑 Search stopped! Saved ${finalCandidates.length} candidates.`
//       : `🎉 Search completed! Found ${finalCandidates.length} candidates.`

//     emitProgress(searchId, completionMessage, 100, finalCandidates.length, "completed", false)

//     // Emit final results
//     io.emit("searchComplete", {
//       searchId: searchId,
//       candidates: finalCandidates,
//       wasStopped: wasStopped,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//         evaluatedCandidates: evaluatedCandidates.length,
//       },
//     })

//     // Create notification
//     const notification = new Notification({
//       message: `${wasStopped ? '🛑 Search stopped' : '🎉 Search completed'}! Found ${finalCandidates.length} candidates for ${job.context}.`,
//       recipientId: search.recruiterId,
//       jobId: job._id,
//     })
//     await notification.save()
//     io.emit("newNotification", notification)

//     // Clean up memory
//     searchControlMap.delete(searchId.toString())
//     linkedinExtractionQueue.delete(searchId) // Clean up queue status
//     console.log("✅ Search finalization completed successfully")
//   } catch (error) {
//     console.error("❌ Error in finalizeSearchWithExistingCandidates:", error.message)

//     // Emergency cleanup
//     try {
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         status: "failed",
//         completedAt: new Date(),
//       })
//       io.emit("searchError", {
//         searchId: searchId,
//         message: `Search processing failed: ${error.message}`,
//         wasStopped: false,
//       })
//       // Clean up memory
//       searchControlMap.delete(searchId.toString())
//       linkedinExtractionQueue.delete(searchId)
//     } catch (cleanupError) {
//       console.error("❌ Error in emergency cleanup:", cleanupError.message)
//     }
//   }
// }

// // CRITICAL FIX: Enhanced Google search with immediate candidate saving
// async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
//   const candidates = new Map() // This is a temporary map for this function's scope
//   const linkedinUrls = new Set()
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
//   // Mark platform as active
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.${platform}.status`]: "searching",
//     [`platformProgress.${platform}.completed`]: false
//   })
//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search stopped by user request at query ${i + 1}`)
//       break
//     }
//     const query = queries[i]
//     if (!query || query.trim() === "") continue
//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim()
//       console.log(`🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`)

//       const search = await SearchHistory.findById(searchId);
//       emitProgress(
//         searchId,
//         `Searching ${platform}: "${query.substring(0, 30)}..."`,
//         20 + (i / queries.length) * 25,
//         search.rawCandidates.length,
//         platform,
//         true
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
//             // Check if it's a LinkedIn profile URL
//             if (item.link.includes("linkedin.com/in/") && platform === "linkedin") {
//               linkedinUrls.add(item.link)
//               console.log(`🔗 Collected LinkedIn URL: ${item.link}`)
//               continue
//             }
//             const candidate = await extractCandidateFromUrl(item.link, platform)
//             if (candidate && candidate.candidateName) {
//               candidates.set(item.link, candidate)
//               totalResults++

//               // CRITICAL: Save candidate immediately
//               await saveCandidateToBuffer(searchId, candidate, platform)

//               console.log(`✅ Extracted & saved: ${candidate.candidateName} from ${platform}`)
//               const updatedSearch = await SearchHistory.findById(searchId);
//               emitProgress(
//                 searchId,
//                 `Found: ${candidate.candidateName}`,
//                 25 + (i / queries.length) * 25,
//                 updatedSearch.rawCandidates.length,
//                 platform,
//                 true,
//                 candidate.candidateName
//               )
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
//   // Mark platform as completed
//   const finalSearchState = await SearchHistory.findById(searchId);
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.${platform}.status`]: "completed",
//     [`platformProgress.${platform}.completed`]: true,
//     [`platformProgress.${platform}.candidatesFound`]: finalSearchState.rawCandidates.filter(c => c.platformSource === platform).length
//   })
//   // Handle LinkedIn URLs if found
//   if (linkedinUrls.size > 0 && platform === "linkedin") {
//     console.log(`🔗 Found ${linkedinUrls.size} LinkedIn URLs. Sending to browser for extraction...`)
//     await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
//   }
//   console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values()) // This return is mostly for logging/tracking, candidates are already saved
// }

// // CRITICAL FIX: Enhanced LinkedIn URL handling
// async function handleLinkedInUrls(searchId, linkedinUrls) {
//   try {
//     // Limit to top 25 LinkedIn URLs for performance
//     const topUrls = linkedinUrls.slice(0, 25)
//     console.log(`📤 Sending ${topUrls.length} LinkedIn URLs to frontend for browser extraction`)

//     // Store LinkedIn URLs in search history for tracking status
//     const linkedinProfiles = topUrls.map((url) => ({
//       profileUrl: url,
//       candidateName: extractNameFromLinkedInUrl(url),
//       extractionStatus: "pending",
//       lastAttempted: new Date(),
//       retryCount: 0,
//     }))
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $push: { linkedinProfiles: { $each: linkedinProfiles } },
//       status: "linkedin_extracting"
//     })

//     // Emit LinkedIn URLs to frontend for browser extraction
//     io.emit("linkedinUrlsForExtraction", {
//       searchId: searchId,
//       urls: topUrls,
//       message: `Found ${topUrls.length} LinkedIn profiles. Starting browser extraction...`,
//     })

//     const search = await SearchHistory.findById(searchId);
//     emitProgress(
//       searchId,
//       `📤 LinkedIn extraction: 0/${topUrls.length} profiles`,
//       60,
//       search.rawCandidates.length,
//       "linkedin-browser",
//       true
//     )

//     // CRITICAL: Set timeout to prevent infinite waiting
//     const timeoutId = setTimeout(async () => {
//       const queueItem = linkedinExtractionQueue.get(searchId)
//       if (queueItem && queueItem.status === 'active') {
//         console.log(`⏰ LinkedIn extraction timeout for search ${searchId}. Finalizing with existing results.`)
//         // Mark as timeout and finalize
//         linkedinExtractionQueue.set(searchId, { ...queueItem, status: 'timeout' })
//         await finalizeSearchWithExistingCandidates(searchId, false)
//       }
//     }, 8 * 60 * 1000) // 8 minutes timeout

//     // Update the queue item with the timeout ID
//     linkedinExtractionQueue.set(searchId, {
//       urls: topUrls,
//       processed: [],
//       failed: [],
//       startTime: new Date(),
//       status: 'active',
//       timeoutId: timeoutId // Store the timeout ID
//     });

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

// // Extract candidate from LinkedIn DOM using AI
// async function extractCandidateFromLinkedInDOM(domContent, profileUrl, profileInfo = {}, extractionMethod = "browser-dom") {
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
//     ${domContent.substring(0, 15000)}
//     ---

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
//       "industries": ["industry1", "industry2"] or []
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
//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from LinkedIn DOM`)
//       return null
//     }
//     const candidate = {
//       id: `${extractionMethod}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
//         extractionMethod: extractionMethod,
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//         hasContactInfo: !!(result.email || result.mobile),
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//         ...profileInfo // Include any info passed from the extension
//       },
//       matchScore: 0,
//     }
//     return candidate
//   } catch (error) {
//     console.error(`❌ Error extracting candidate from LinkedIn DOM:`, error.message)
//     return null
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

// // Enhanced candidate extraction with AI (keeping existing implementation)
// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     You are an expert talent sourcer specializing in extracting professional information from ${platform} profiles.
//     **CRITICAL EXTRACTION REQUIREMENTS:**
//     1. **ZERO FABRICATION**: Only extract information explicitly present in the text
//     2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
//     3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional links
//     4. **EXACT TRANSCRIPTION**: Copy information exactly as written
//     **Content Source:** ${url} (Platform: ${platform})
//     **Text Content:**
//     ---
//     ${pageText.substring(0, 12000)}
//     ---
//     **OUTPUT FORMAT:**
//     Return ONLY this JSON structure with extracted data or null values:
//     {
//       "candidateName": "Full name exactly as written or null",
//       "email": "primary.email@domain.com or null",
//       "mobile": "exact phone number with formatting or null",
//       "currentJobTitle": "Exact current title or null",
//       "currentCompany": "Exact company name or null",
//       "location": "Exact location string or null",
//       "skills": ["actual", "skills", "extracted"] or [],
//       "summary": "Professional summary/bio from profile or null",
//       "experience": "Work experience description or null",
//       "yearsOfExperience": "X years (only if explicitly stated) or null",
//       "education": "Education information or null",
//       "certifications": ["actual", "certifications"] or [],
//       "projects": ["actual", "projects", "portfolio pieces"] or [],
//       "achievements": ["awards", "recognition", "notable work"] or [],
//       "industries": ["industry", "specializations"] or []
//     }
//   `
//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2500,
//       temperature: 0.05,
//       response_format: { type: "json_object" },
//     })
//     const result = JSON.parse(response.choices[0].message.content)
//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from ${url}`)
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
//       certifications: result.certifications || [],
//       projects: result.projects || [],
//       achievements: result.achievements || [],
//       industries: result.industries || [],
//       sourceInfo: {
//         platform,
//         profileUrl: url,
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

// // Enhanced candidate evaluation (keeping existing implementation)
// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   if (!candidate.candidateName) {
//     console.log("⚠️ Skipping evaluation - insufficient candidate data")
//     return null
//   }
//   const prompt = `
//     You are a senior technical recruiter and talent assessment expert with 20+ years of experience.
//     Conduct a comprehensive evaluation of this candidate's fit for the position using rigorous assessment criteria.
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
//     - Experience: ${candidate.yearsOfExperience || "Not specified"}
//     - Summary: ${candidate.summary || "Not available"}
//     - Education: ${candidate.education || "Not specified"}
//     - Certifications: ${candidate.certifications?.join(", ") || "Not specified"}
//     - Projects: ${candidate.projects?.join(", ") || "Not specified"}
//     - Achievements: ${candidate.achievements?.join(", ") || "Not specified"}
//     - Industries: ${candidate.industries?.join(", ") || "Not specified"}
//     Return ONLY this JSON structure with thorough analysis:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100),
//         "experienceMatch": number (0-100),
//         "educationMatch": number (0-100),
//         "culturalFitMatch": number (0-100),
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
//           "relevantExperience": "detailed description or 'Limited information available'",
//           "yearsOfExperience": "exact years mentioned or 'Not specified'",
//           "careerProgression": "analysis of career growth",
//           "industryExperience": "relevant industry background",
//           "roleRelevance": "how previous roles align with target position"
//         },
//         "education": {
//           "highestDegree": "actual degree or 'Not specified'",
//           "relevantCourses": ["relevant", "coursework"] or [],
//           "certifications": ["professional", "certifications"],
//           "continuousLearning": "evidence of ongoing development"
//         },
//         "projects": ["significant", "projects", "and", "achievements"],
//         "strengths": ["top", "candidate", "strengths"],
//         "concerns": ["potential", "concerns", "or", "risks"],
//         "recommendation": "detailed hiring recommendation with reasoning",
//         "comments": "comprehensive assessment including data gaps",
//         "additionalNotes": "market insights and unique value proposition"
//       },
//       "comment": "concise executive summary for hiring managers",
//       "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
//       "confidenceLevel": "High|Medium|Low (based on available information quality)"
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

// // Save candidates to Resume database
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
//       sourceInfo: candidate.sourceInfo,
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

// // Deduplication function
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

// // Manual extraction notification endpoint
// export const notifyManualExtraction = async (req, res) => {
//   try {
//     const { searchId, urlCount } = req.body

//     if (!searchId) {
//       return res.status(400).json({ success: false, error: "Search ID required" })
//     }
//     console.log(`📱 Manual extraction started for ${urlCount} URLs in search ${searchId}`)

//     const search = await SearchHistory.findById(searchId);
//     emitProgress(
//       searchId,
//       `👤 Manual extraction: Opening ${urlCount} LinkedIn profiles...`,
//       65,
//       search.rawCandidates.length,
//       "linkedin-manual",
//       true
//     )
//     res.status(200).json({
//       success: true,
//       message: "Manual extraction notification received"
//     })
//   } catch (error) {
//     console.error("❌ Error in manual extraction notification:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // Platform-specific search functions (GitHub, LinkedIn, etc.) - keeping existing implementations
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
//   // Mark platform as active
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.github.status`]: "searching",
//     [`platformProgress.github.completed`]: false
//   })
//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "" || shouldStopSearch(searchId)) continue
//     try {
//       console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`)
//       const search = await SearchHistory.findById(searchId);
//       emitProgress(
//         searchId,
//         `GitHub search: "${query.substring(0, 50)}..."`,
//         40 + (i / queries.length) * 25,
//         search.rawCandidates.length,
//         "github",
//         true
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
//             const candidate = await extractCandidateFromUrl(user.html_url, "github")
//             if (candidate && candidate.candidateName) {
//               candidates.set(user.html_url, candidate)
//               totalResults++

//               // Save candidate immediately
//               await saveCandidateToBuffer(searchId, candidate, "github")

//               console.log(`✅ GitHub candidate saved: ${candidate.candidateName}`)
//               const updatedSearch = await SearchHistory.findById(searchId);
//               emitProgress(
//                 searchId,
//                 `Found GitHub: ${candidate.candidateName}`,
//                 45 + (i / queries.length) * 25,
//                 updatedSearch.rawCandidates.length,
//                 "github",
//                 true,
//                 candidate.candidateName
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
//   // Mark platform as completed
//   const finalSearchState = await SearchHistory.findById(searchId);
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.github.status`]: "completed",
//     [`platformProgress.github.completed`]: true,
//     [`platformProgress.github.candidatesFound`]: finalSearchState.rawCandidates.filter(c => c.platformSource === "github").length
//   })
//   console.log(`🎉 GitHub search completed. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// // Enhanced main search function with immediate candidate saving
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
//       rawCandidates: [],
//       linkedinProfiles: [],
//       platformProgress: {
//         google: { status: "pending", candidatesFound: 0, completed: false },
//         linkedin: { status: "pending", candidatesFound: 0, completed: false },
//         github: { status: "pending", candidatesFound: 0, completed: false },
//         dribbble: { status: "pending", candidatesFound: 0, completed: false },
//         behance: { status: "pending", candidatesFound: 0, completed: false },
//       },
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

// // CRITICAL FIX: Enhanced main search workflow with immediate candidate saving
// async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0
//   let totalApiCalls = 0
//   let wasStopped = false
//   try {
//     console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`)
//     // Step 1: Enhanced job analysis
//     await emitProgress(searchHistoryId, "🧠 Analyzing job requirements with AI intelligence...", 5, 0, "", true)
//     const jobAnalysis = await analyzeJobForPlatformsInternal(job, searchSettings) // Call the internal function
//     totalApiCalls += 1
//     totalTokensUsed += 1200
//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements")
//     }
//     console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`)
//     const search = await SearchHistory.findById(searchHistoryId);
//     await emitProgress(
//       searchHistoryId,
//       `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Complexity: ${jobAnalysis.searchComplexity}`,
//       10,
//       search.rawCandidates.length,
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
//     // Step 3: Enhanced platform searches with stop control and immediate saving
//     for (let i = 0; i < recommendedPlatforms.length; i++) {
//       // Check for stop before each platform
//       if (shouldStopSearch(searchHistoryId)) {
//         console.log(`🛑 Search stopped before platform ${recommendedPlatforms[i].platform}`)
//         wasStopped = true
//         break
//       }
//       const platformInfo = recommendedPlatforms[i]
//       const platform = platformInfo.platform
//       const currentSearch = await SearchHistory.findById(searchHistoryId);
//       await emitProgress(
//         searchHistoryId,
//         `🔍 Generating enhanced search queries for ${platform}...`,
//         15 + i * 20,
//         currentSearch.rawCandidates.length,
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
//       const currentSearch2 = await SearchHistory.findById(searchHistoryId);
//       await emitProgress(
//         searchHistoryId,
//         `🚀 Searching ${platform} with ${queries.length} AI-optimized queries...`,
//         18 + i * 20,
//         currentSearch2.rawCandidates.length,
//         platform,
//         true,
//       )
//       let platformCandidates = [] // This is just for local tracking, candidates are saved in saveCandidateToBuffer
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
//       totalApiCalls += platformCandidates.length * 2 // This might need adjustment based on actual API calls
//       totalTokensUsed += platformCandidates.length * 2000 // This might need adjustment based on actual token usage
//       console.log(`📊 Found ${platformCandidates.length} candidates on ${platform} (via direct search/API)`)
//       const currentSearch3 = await SearchHistory.findById(searchHistoryId);
//       await emitProgress(
//         searchHistoryId,
//         `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
//         30 + i * 20,
//         currentSearch3.rawCandidates.length,
//         platform,
//         true,
//       )
//       // Check if we've reached target or should stop
//       const totalFound = (await SearchHistory.findById(searchHistoryId)).rawCandidates.length;
//       if (totalFound >= searchSettings.candidateCount || shouldStopSearch(searchHistoryId)) {
//         if (shouldStopSearch(searchHistoryId)) {
//           console.log(`🛑 Search stopped after ${platform} search`)
//           wasStopped = true
//         } else {
//           console.log(`🎯 Reached target candidate count: ${totalFound}`)
//         }
//         break
//       }
//     }
//     const finalTotalCandidates = (await SearchHistory.findById(searchHistoryId)).rawCandidates.length;
//     console.log(`📊 Total candidates found across all platforms: ${finalTotalCandidates}`)

//     // Check if we have LinkedIn URLs pending extraction
//     const extractionQueue = linkedinExtractionQueue.get(searchHistoryId)
//     const searchAfterPlatformSearches = await SearchHistory.findById(searchHistoryId);
//     const pendingLinkedInProfiles = searchAfterPlatformSearches.linkedinProfiles.filter(
//       (profile) => profile.extractionStatus === "pending" || profile.extractionStatus === "processing"
//     );

//     if (pendingLinkedInProfiles.length > 0 && extractionQueue && extractionQueue.status === 'active') {
//       console.log(`⏳ Waiting for LinkedIn browser extraction to complete...`)
//       await emitProgress(
//         searchHistoryId,
//         `⏳ LinkedIn extraction: Processing ${pendingLinkedInProfiles.length} profiles...`,
//         70,
//         finalTotalCandidates,
//         "linkedin-browser",
//         true,
//       )
//       // The search will continue in finalizeSearchWithExistingCandidates when LinkedIn extraction completes
//       return
//     }

//     // If no LinkedIn extraction needed or it's already completed/timed out, finalize immediately
//     console.log(`🏁 No LinkedIn extraction pending or it's completed. Finalizing search...`)
//     await finalizeSearchWithExistingCandidates(searchHistoryId, wasStopped)
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
//     linkedinExtractionQueue.delete(searchHistoryId)
//   }
// }

// // Remaining platform search functions
// async function searchDribbble(queries, searchSettings, searchId) {
//   console.log("🎨 Starting enhanced Dribbble search for design talent")
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
// }

// async function searchBehance(queries, searchSettings, searchId) {
//   console.log("🎭 Starting enhanced Behance search for creative professionals")
//   return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
// }

// // LinkedIn API search implementation
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
//     if (candidates.size >= targetCandidates || shouldStopSearch(searchId)) break

//     const search = await SearchHistory.findById(searchId);
//     emitProgress(
//       searchId,
//       `Enriching LinkedIn profile ${processedCount + 1}/${linkedInUrls.size}...`,
//       50 + (processedCount / linkedInUrls.size) * 25,
//       search.rawCandidates.length,
//       "linkedin-api",
//       true
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

//         // Save candidate immediately
//         await saveCandidateToBuffer(searchId, candidate, "linkedin-api")

//         console.log(`✅ Enriched & saved via LinkedIn API: ${candidate.candidateName}`)
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

// // Query generation and other utility functions
// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 5–7 broad, high-yield search queries to maximize candidate discovery.
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
//     **Platform to Target:** ${platform}
//     **Query Generation Strategy:**
//     - Create 5–7 broad queries to maximize candidate matches.
//     - Combine core skills, primary job titles, and location (if specified) in each query.
//     - Use Boolean operators (AND, OR, quotes) for broad reach.
//     - Avoid overly specific queries; focus on high-volume candidate pools.
//     - Include alternative job titles and skill synonyms where relevant.
//     **Query Categories (5–7 total):**
//     - 2–3 Skill + Title queries (core skills + primary/alternative titles)
//     - 1–2 Location + Title queries (if location specified)
//     - 1–2 Experience + Skill queries (seniority + key skills)
//     - 1 General keyword-based query (broad industry/role terms)
//     **Quality Standards:**
//     - Queries should be 10–30 words long.
//     - Prioritize individual profiles over company pages.
//     - Balance broad reach with relevance.
//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7"]}
//   `
//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 800,
//       temperature: 0.4,
//       response_format: { type: "json_object" },
//     })
//     const content = JSON.parse(response.choices[0].message.content)
//     const queries = content.queries || []
//     console.log(`🔍 Generated ${queries.length} broad queries for ${platform}`)
//     return queries.slice(0, 7)
//   } catch (error) {
//     console.error("❌ Error generating search queries:", error.message)
//     return []
//   }
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
//       "LinkedIn Browser Extraction",
//       "Stop Control",
//       "Resume Database Integration",
//       "Immediate Candidate Saving",
//     ],
//   }
// }

// // Analyze job for optimal platform selection (internal function)
// async function analyzeJobForPlatformsInternal(jobDescription, searchSettings) {
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

// // Export the correct function name
// export const analyzeJobForPlatforms = analyzeJobForPlatformsInternal;

// // API endpoint implementations
// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" })
//     }
//     res.status(200).json({
//       success: true,
//       results: search.results || [],
//       rawCandidates: search.rawCandidates || [], // Include raw candidates
//       linkedinProfiles: search.linkedinProfiles || [],
//       platformProgress: search.platformProgress || {},
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
//     const searches = await SearchHistory.find({ recruiterId })
//       .select("-results -rawCandidates") // Exclude heavy data for list view
//       .sort({ createdAt: -1 })
//       .limit(20)
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



// FIXED HEADHUNTER CONTROLLER - ADDRESSING ALL CRITICAL ISSUES

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

// // LinkedIn extraction queue and results - FIXED: Better state management
// const linkedinExtractionQueue = new Map() // searchId -> { urls: [], processed: [], failed: [], status: 'active' }
// const linkedinExtractionResults = new Map() // searchId -> extracted candidates
// const searchCandidateBuffer = new Map() // searchId -> { platform: candidates[] } - STORE ALL CANDIDATES

// // ENHANCED SCHEMA - CRITICAL FIX: Store candidates immediately as they're found
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 },
//   status: { 
//     type: String, 
//     enum: ["pending", "in_progress", "completed", "failed", "stopped", "linkedin_extracting"], 
//     default: "pending" 
//   },
  
//   // CRITICAL FIX: Store all found candidates immediately (before AI evaluation)
//   rawCandidates: [{
//     candidateName: String,
//     email: String,
//     mobile: mongoose.Schema.Types.Mixed,
//     currentJobTitle: String,
//     currentCompany: String,
//     location: String,
//     skills: [String],
//     experience: String,
//     summary: String,
//     sourceInfo: {
//       platform: String,
//       profileUrl: String,
//       linkedinProfileUrl: String,
//       githubProfileUrl: String,
//       portfolioUrl: String,
//       dribbbleUrl: String,
//       behanceUrl: String,
//       mediumUrl: String,
//       twitterUrl: String,
//       personalWebsite: String,
//       extractionMethod: String,
//       sourcedAt: Date,
//       aiModel: String,
//       hasEmail: Boolean,
//       hasPhone: Boolean,
//     },
//     foundAt: { type: Date, default: Date.now },
//     platformSource: String,
//   }],
  
//   // Final evaluated candidates (after AI processing)
//   results: [{
//     candidateName: String,
//     email: String,
//     mobile: mongoose.Schema.Types.Mixed,
//     jobTitle: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription" },
//     companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
//     currentCompany: String,
//     location: String,
//     skills: [String],
//     experience: String,
//     summary: String,
//     candidateStatus: String,
//     matchingScoreDetails: {
//       skillsMatch: Number,
//       experienceMatch: Number,
//       educationMatch: Number,
//       overallMatch: Number,
//       culturalFitMatch: Number,
//     },
//     analysis: {
//       skills: {
//         candidateSkills: [String],
//         matched: [String],
//         notMatched: [String],
//         transferableSkills: [String],
//         skillGaps: [String],
//         skillStrengths: [String],
//       },
//       experience: {
//         relevantExperience: String,
//         yearsOfExperience: String,
//         careerProgression: String,
//         industryExperience: String,
//         roleRelevance: String,
//       },
//       education: {
//         highestDegree: String,
//         relevantCourses: [String],
//         certifications: [String],
//         continuousLearning: String,
//       },
//       projects: [String],
//       strengths: [String],
//       concerns: [String],
//       recommendation: String,
//       comments: String,
//       additionalNotes: String,
//     },
//     comment: String,
//     recommendation: {
//       type: String,
//       enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//     },
//     confidenceLevel: String,
//     aiSourced: Boolean,
//     sourceInfo: {
//       platform: String,
//       profileUrl: String,
//       linkedinProfileUrl: String,
//       githubProfileUrl: String,
//       portfolioUrl: String,
//       dribbbleUrl: String,
//       behanceUrl: String,
//       mediumUrl: String,
//       twitterUrl: String,
//       personalWebsite: String,
//       extractionMethod: String,
//       sourcedAt: Date,
//       sourcedBy: mongoose.Schema.Types.ObjectId,
//       aiModel: String,
//       hasEmail: Boolean,
//       hasPhone: Boolean,
//     },
//   }],

//   linkedinProfiles: [{
//     profileUrl: String,
//     candidateName: String,
//     profileTitle: String,
//     location: String,
//     extractionStatus: {
//       type: String,
//       enum: ["pending", "processing", "success", "failed", "rate_limited", "blocked"],
//       default: "pending",
//     },
//     errorCode: Number,
//     lastAttempted: { type: Date, default: Date.now },
//     retryCount: { type: Number, default: 0 },
//   }],

//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },

//   // CRITICAL: Track platform progress
//   platformProgress: {
//     google: { status: String, candidatesFound: Number, completed: Boolean },
//     linkedin: { status: String, candidatesFound: Number, completed: Boolean },
//     github: { status: String, candidatesFound: Number, completed: Boolean },
//     dribbble: { status: String, candidatesFound: Number, completed: Boolean },
//     behance: { status: String, candidatesFound: Number, completed: Boolean },
//   },

//   createdAt: { type: Date, default: Date.now },
//   completedAt: Date,
//   stoppedAt: Date,
//   stoppedBy: mongoose.Schema.Types.ObjectId,
// })

// const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema)

// // CRITICAL FIX: Enhanced progress emission with proper state tracking
// function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "", canStop = true, currentCandidate = "") {
//   const progressData = {
//     searchId,
//     status,
//     progress: Math.min(Math.max(progress, 0), 100),
//     candidatesFound,
//     platform,
//     timestamp: new Date().toISOString(),
//     canStop,
//     currentCandidate,
//     // CRITICAL: Add total candidates across all platforms
//     totalCandidatesFound: getTotalCandidatesFound(searchId),
//   }
  
//   console.log(`📡 Progress Update [${searchId}]: ${progress.toFixed(1)}% - ${status} - ${candidatesFound} candidates - Platform: ${platform} - Total: ${progressData.totalCandidatesFound}`)
//   io.emit("searchProgress", progressData)
// }

// // CRITICAL FIX: Track total candidates across all platforms and extraction
// function getTotalCandidatesFound(searchId) {
//   const buffer = searchCandidateBuffer.get(searchId) || {}
//   const linkedinCandidates = linkedinExtractionResults.get(searchId) || []
  
//   let total = linkedinCandidates.length
//   Object.values(buffer).forEach(candidates => {
//     total += candidates.length
//   })
  
//   return total
// }

// // Check if search should be stopped
// function shouldStopSearch(searchId) {
//   const control = searchControlMap.get(searchId.toString())
//   return control?.shouldStop || false
// }

// // CRITICAL FIX: Save candidates immediately as they're found
// async function saveCandidateToBuffer(searchId, candidate, platform) {
//   try {
//     // Add to memory buffer
//     const buffer = searchCandidateBuffer.get(searchId) || {}
//     if (!buffer[platform]) buffer[platform] = []
//     buffer[platform].push(candidate)
//     searchCandidateBuffer.set(searchId, buffer)

//     // CRITICAL: Save to database immediately
//     const candidateData = {
//       candidateName: candidate.candidateName,
//       email: candidate.email,
//       mobile: candidate.mobile,
//       currentJobTitle: candidate.currentJobTitle,
//       currentCompany: candidate.currentCompany,
//       location: candidate.location,
//       skills: candidate.skills || [],
//       experience: candidate.experience,
//       summary: candidate.summary,
//       sourceInfo: candidate.sourceInfo || {},
//       foundAt: new Date(),
//       platformSource: platform,
//     }

//     await SearchHistory.findByIdAndUpdate(
//       searchId,
//       {
//         $push: { rawCandidates: candidateData },
//         $inc: { candidatesFound: 1 }
//       },
//       { new: true }
//     )

//     // Update platform progress
//     const totalForPlatform = buffer[platform].length
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       [`platformProgress.${platform}.candidatesFound`]: totalForPlatform,
//       [`platformProgress.${platform}.status`]: "active"
//     })

//     console.log(`💾 Candidate saved: ${candidate.candidateName} from ${platform} (Total: ${getTotalCandidatesFound(searchId)})`)
//   } catch (error) {
//     console.error(`❌ Error saving candidate to buffer:`, error.message)
//   }
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
//       status: "stopped"
//     })

//     console.log(`🛑 Search ${searchId} stop requested by ${recruiterId}`)
//     res.status(200).json({
//       success: true,
//       message: "Search stop requested. Processing current candidates...",
//     })

//     // CRITICAL: Trigger immediate finalization with existing candidates
//     setTimeout(async () => {
//       await finalizeSearchWithExistingCandidates(searchId, true)
//     }, 2000) // 2 second delay to allow current operations to complete

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

// // CRITICAL FIX: Process LinkedIn DOM with immediate saving
// export const processLinkedInDOM = async (req, res) => {
//   try {
//     const { searchId, profileUrl, domContent, success, error } = req.body

//     if (!searchId || !profileUrl) {
//       return res.status(400).json({ success: false, error: "Search ID and profile URL are required" })
//     }

//     console.log(`📥 Processing LinkedIn DOM for: ${profileUrl} (Success: ${success})`)

//     if (!success || !domContent) {
//       console.log(`❌ Failed to extract DOM from: ${profileUrl}. Reason: ${error}`)
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed")
//       await checkLinkedInExtractionComplete(searchId)
//       return res.status(200).json({ success: true, message: "Failed extraction recorded" })
//     }

//     // Update status to processing
//     await updateLinkedInProfileStatus(searchId, profileUrl, "processing")

//     // Extract candidate name from URL for progress tracking
//     const candidateName = extractNameFromLinkedInUrl(profileUrl)

//     // Emit progress with current candidate
//     emitProgress(
//       searchId,
//       `🔍 Extracting: ${candidateName}`,
//       65,
//       getTotalCandidatesFound(searchId),
//       "linkedin-browser",
//       true,
//       candidateName
//     )

//     // Extract candidate data using AI
//     const candidate = await extractCandidateFromLinkedInDOM(domContent, profileUrl)

//     if (candidate) {
//       console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`)
      
//       // CRITICAL: Save immediately to buffer and database
//       await saveCandidateToBuffer(searchId, candidate, 'linkedin-browser')
      
//       // Store in extraction results for processing
//       const existingResults = linkedinExtractionResults.get(searchId) || []
//       existingResults.push(candidate)
//       linkedinExtractionResults.set(searchId, existingResults)

//       await updateLinkedInProfileStatus(searchId, profileUrl, "success", candidate.candidateName)
      
//       // Emit progress with successful extraction
//       emitProgress(
//         searchId,
//         `✅ Extracted: ${candidate.candidateName}`,
//         70,
//         getTotalCandidatesFound(searchId),
//         "linkedin-browser",
//         true,
//         candidate.candidateName
//       )
//     } else {
//       console.log(`❌ AI failed to extract candidate data from: ${profileUrl}`)
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed")
//     }

//     // Check if extraction is complete
//     await checkLinkedInExtractionComplete(searchId)

//     res.status(200).json({
//       success: true,
//       message: "LinkedIn DOM processed",
//       candidateExtracted: !!candidate,
//       candidateName: candidate?.candidateName,
//       totalCandidates: getTotalCandidatesFound(searchId)
//     })
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn DOM:", error.message)
    
//     if (req.body.searchId) {
//       await checkLinkedInExtractionComplete(req.body.searchId)
//     }
    
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // Update LinkedIn profile extraction status
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
//       }
//     )
//   } catch (error) {
//     console.error("❌ Error updating LinkedIn profile status:", error.message)
//   }
// }

// // CRITICAL FIX: Better extraction completion check
// async function checkLinkedInExtractionComplete(searchId) {
//   try {
//     const search = await SearchHistory.findById(searchId)
//     if (!search) return

//     // Check if the search has been stopped by the user
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search ${searchId} was stopped. Finalizing immediately.`)
//       await finalizeSearchWithExistingCandidates(searchId, true)
//       return
//     }

//     const pendingProfiles = search.linkedinProfiles.filter(
//       (profile) => profile.extractionStatus === "pending" || profile.extractionStatus === "processing"
//     )

//     console.log(`📊 LinkedIn extraction check: ${pendingProfiles.length} pending profiles remaining`)

//     if (pendingProfiles.length === 0) {
//       console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`)
//       await finalizeSearchWithExistingCandidates(searchId, false)
//     } else {
//       // Emit progress update
//       const totalProfiles = search.linkedinProfiles.length
//       const processedProfiles = totalProfiles - pendingProfiles.length
//       const progressPercentage = totalProfiles > 0 ? (processedProfiles / totalProfiles) * 100 : 0
      
//       emitProgress(
//         searchId,
//         `LinkedIn: ${processedProfiles}/${totalProfiles} processed`,
//         60 + (progressPercentage * 0.2), // 60-80% range
//         getTotalCandidatesFound(searchId),
//         "linkedin-browser",
//         true,
//         `Processing profile ${processedProfiles + 1}...`
//       )
//     }
//   } catch (error) {
//     console.error("❌ Error checking LinkedIn extraction completion:", error.message)
//     // Finalize with existing candidates on error
//     await finalizeSearchWithExistingCandidates(searchId, false)
//   }
// }

// // CRITICAL FIX: New function to finalize search with existing candidates
// async function finalizeSearchWithExistingCandidates(searchId, wasStopped = false) {
//   try {
//     console.log(`🏁 Finalizing search ${searchId} (stopped=${wasStopped})`)

//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       console.error("❌ Search not found:", searchId)
//       return
//     }

//     const job = await JobDescription.findById(search.jobId)
//     if (!job) {
//       console.error("❌ Job not found:", search.jobId)
//       return
//     }

//     // CRITICAL: Get ALL candidates from database (rawCandidates) + LinkedIn extraction results
//     const rawCandidates = search.rawCandidates || []
//     const linkedinCandidates = linkedinExtractionResults.get(searchId) || []
    
//     console.log(`📊 Raw candidates from database: ${rawCandidates.length}`)
//     console.log(`📊 LinkedIn extraction candidates: ${linkedinCandidates.length}`)

//     // Convert raw candidates to standard format
//     const formattedRawCandidates = rawCandidates.map(raw => ({
//       id: `raw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       candidateName: raw.candidateName,
//       email: raw.email,
//       mobile: raw.mobile,
//       currentJobTitle: raw.currentJobTitle,
//       currentCompany: raw.currentCompany,
//       location: raw.location,
//       skills: raw.skills || [],
//       summary: raw.summary,
//       experience: raw.experience,
//       sourceInfo: raw.sourceInfo || {},
//       matchScore: 0,
//     }))

//     // Combine all candidates
//     const allCandidates = [...formattedRawCandidates, ...linkedinCandidates]
//     console.log(`📊 Total candidates for processing: ${allCandidates.length}`)

//     if (allCandidates.length === 0) {
//       console.log("⚠️ No candidates found")
      
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         results: [],
//         candidatesFound: 0,
//         status: wasStopped ? "stopped" : "completed",
//         completedAt: new Date(),
//       })

//       io.emit("searchComplete", {
//         searchId: searchId,
//         candidates: [],
//         wasStopped: wasStopped,
//         summary: {
//           totalCandidatesFound: 0,
//           linkedinCandidatesExtracted: linkedinCandidates.length,
//           finalCandidatesSelected: 0,
//           message: "No candidates found"
//         },
//       })

//       searchControlMap.delete(searchId.toString())
//       return
//     }

//     emitProgress(
//       searchId,
//       `🔄 Processing ${allCandidates.length} candidates...`,
//       85,
//       allCandidates.length,
//       "processing",
//       false
//     )

//     // Deduplicate candidates
//     const uniqueCandidates = deduplicateCandidates(allCandidates)
//     console.log(`🎯 After deduplication: ${uniqueCandidates.length} unique candidates`)

//     emitProgress(
//       searchId,
//       `🧠 AI evaluation of ${uniqueCandidates.length} candidates...`,
//       90,
//       uniqueCandidates.length,
//       "evaluating",
//       false
//     )

//     // Evaluate candidates with AI matching
//     const evaluatedCandidates = []
//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i]
      
//       // Progress update every 5 candidates
//       if (i % 5 === 0) {
//         emitProgress(
//           searchId,
//           `🧠 Evaluating: ${candidate.candidateName || 'Unknown'}`,
//           90 + ((i / uniqueCandidates.length) * 8), // 90-98%
//           evaluatedCandidates.length,
//           "ai-evaluation",
//           false,
//           candidate.candidateName
//         )
//       }

//       try {
//         const evaluation = await evaluateCandidateMatch(candidate, job, search.searchSettings)
//         if (evaluation) {
//           candidate.matchScore = evaluation.matchingScoreDetails.overallMatch
//           candidate.matchingScoreDetails = evaluation.matchingScoreDetails
//           candidate.analysis = evaluation.analysis
//           candidate.comment = evaluation.comment
//           candidate.recommendation = evaluation.recommendation
//           candidate.confidenceLevel = evaluation.confidenceLevel
//         }
        
//         // Set required fields
//         candidate.jobTitle = job._id
//         candidate.companyId = job.companyId
//         candidate.candidateStatus = "AI Sourced"
//         candidate.aiSourced = true
        
//         evaluatedCandidates.push(candidate)
//       } catch (evalError) {
//         console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, evalError.message)
//         // Add candidate without evaluation
//         candidate.matchScore = 0
//         candidate.jobTitle = job._id
//         candidate.companyId = job.companyId
//         candidate.candidateStatus = "AI Sourced"
//         candidate.aiSourced = true
//         evaluatedCandidates.push(candidate)
//       }
//     }

//     // Filter and rank candidates
//     const rankedCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName && c.candidateName.trim() !== "")
//       .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))

//     // Select final candidates
//     const targetCount = search.searchSettings.candidateCount || 10
//     const finalCandidates = wasStopped ? rankedCandidates : rankedCandidates.slice(0, targetCount)

//     console.log(`🎯 Final selection: ${finalCandidates.length} candidates (target: ${targetCount})`)

//     emitProgress(
//       searchId,
//       `💾 Saving ${finalCandidates.length} top candidates...`,
//       98,
//       finalCandidates.length,
//       "saving",
//       false
//     )

//     // Save candidates to Resume database
//     await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId)

//     // CRITICAL: Remove non-selected candidates from rawCandidates to save space
//     const selectedCandidateNames = new Set(finalCandidates.map(c => c.candidateName))
//     const filteredRawCandidates = search.rawCandidates.filter(raw => 
//       selectedCandidateNames.has(raw.candidateName)
//     )

//     // Update search history with final results
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       results: finalCandidates,
//       rawCandidates: filteredRawCandidates, // Keep only selected candidates
//       candidatesFound: finalCandidates.length,
//       status: wasStopped ? "stopped" : "completed",
//       completedAt: new Date(),
//     })

//     const completionMessage = wasStopped
//       ? `🛑 Search stopped! Saved ${finalCandidates.length} candidates.`
//       : `🎉 Search completed! Found ${finalCandidates.length} candidates.`
      
//     emitProgress(searchId, completionMessage, 100, finalCandidates.length, "completed", false)

//     // Emit final results
//     io.emit("searchComplete", {
//       searchId: searchId,
//       candidates: finalCandidates,
//       wasStopped: wasStopped,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         linkedinCandidatesExtracted: linkedinCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//         evaluatedCandidates: evaluatedCandidates.length,
//       },
//     })

//     // Create notification
//     const notification = new Notification({
//       message: `${wasStopped ? '🛑 Search stopped' : '🎉 Search completed'}! Found ${finalCandidates.length} candidates for ${job.context}.`,
//       recipientId: search.recruiterId,
//       jobId: job._id,
//     })
//     await notification.save()
//     io.emit("newNotification", notification)

//     // Clean up memory
//     searchControlMap.delete(searchId.toString())
//     linkedinExtractionQueue.delete(searchId)
//     linkedinExtractionResults.delete(searchId)
//     searchCandidateBuffer.delete(searchId)
    
//     console.log("✅ Search finalization completed successfully")
//   } catch (error) {
//     console.error("❌ Error in finalizeSearchWithExistingCandidates:", error.message)
    
//     // Emergency cleanup
//     try {
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         status: "failed",
//         completedAt: new Date(),
//       })

//       io.emit("searchError", {
//         searchId: searchId,
//         message: `Search processing failed: ${error.message}`,
//         wasStopped: false,
//       })

//       // Clean up memory
//       searchControlMap.delete(searchId.toString())
//       linkedinExtractionQueue.delete(searchId)
//       linkedinExtractionResults.delete(searchId)
//       searchCandidateBuffer.delete(searchId)
//     } catch (cleanupError) {
//       console.error("❌ Error in emergency cleanup:", cleanupError.message)
//     }
//   }
// }

// // CRITICAL FIX: Enhanced Google search with immediate candidate saving
// async function searchGoogle(queries, searchSettings, siteFilter = "", searchId) {
//   const candidates = new Map()
//   const linkedinUrls = new Set()
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

//   // Mark platform as active
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.${platform}.status`]: "searching",
//     [`platformProgress.${platform}.completed`]: false
//   })

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search stopped by user request at query ${i + 1}`)
//       break
//     }

//     const query = queries[i]
//     if (!query || query.trim() === "") continue

//     try {
//       const searchQuery = `${query} ${siteFilter}`.trim()
//       console.log(`🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`)
      
//       emitProgress(
//         searchId,
//         `Searching ${platform}: "${query.substring(0, 30)}..."`,
//         20 + (i / queries.length) * 25,
//         getTotalCandidatesFound(searchId),
//         platform,
//         true
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
//             // Check if it's a LinkedIn profile URL
//             if (item.link.includes("linkedin.com/in/") && platform === "linkedin") {
//               linkedinUrls.add(item.link)
//               console.log(`🔗 Collected LinkedIn URL: ${item.link}`)
//               continue
//             }

//             const candidate = await extractCandidateFromUrl(item.link, platform)

//             if (candidate && candidate.candidateName) {
//               candidates.set(item.link, candidate)
//               totalResults++
              
//               // CRITICAL: Save candidate immediately
//               await saveCandidateToBuffer(searchId, candidate, platform)
              
//               console.log(`✅ Extracted & saved: ${candidate.candidateName} from ${platform}`)
              
//               emitProgress(
//                 searchId,
//                 `Found: ${candidate.candidateName}`,
//                 25 + (i / queries.length) * 25,
//                 getTotalCandidatesFound(searchId),
//                 platform,
//                 true,
//                 candidate.candidateName
//               )
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

//   // Mark platform as completed
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.${platform}.status`]: "completed",
//     [`platformProgress.${platform}.completed`]: true,
//     [`platformProgress.${platform}.candidatesFound`]: candidates.size
//   })

//   // Handle LinkedIn URLs if found
//   if (linkedinUrls.size > 0 && platform === "linkedin") {
//     console.log(`🔗 Found ${linkedinUrls.size} LinkedIn URLs. Sending to browser for extraction...`)
//     await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
//   }

//   console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }

// // CRITICAL FIX: Enhanced LinkedIn URL handling
// async function handleLinkedInUrls(searchId, linkedinUrls) {
//   try {
//     // Limit to top 25 LinkedIn URLs for performance
//     const topUrls = linkedinUrls.slice(0, 25)
//     console.log(`📤 Sending ${topUrls.length} LinkedIn URLs to frontend for browser extraction`)

//     // Store LinkedIn URLs in extraction queue
//     linkedinExtractionQueue.set(searchId, {
//       urls: topUrls,
//       processed: [],
//       failed: [],
//       startTime: new Date(),
//       status: 'active'
//     })

//     // Save LinkedIn URLs to search history
//     const linkedinProfiles = topUrls.map((url) => ({
//       profileUrl: url,
//       candidateName: extractNameFromLinkedInUrl(url),
//       extractionStatus: "pending",
//       lastAttempted: new Date(),
//       retryCount: 0,
//     }))

//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $push: { linkedinProfiles: { $each: linkedinProfiles } },
//       status: "linkedin_extracting"
//     })

//     // Emit LinkedIn URLs to frontend for browser extraction
//     io.emit("linkedinUrlsForExtraction", {
//       searchId: searchId,
//       urls: topUrls,
//       message: `Found ${topUrls.length} LinkedIn profiles. Starting browser extraction...`,
//     })

//     emitProgress(
//       searchId,
//       `📤 LinkedIn extraction: 0/${topUrls.length} profiles`,
//       60,
//       getTotalCandidatesFound(searchId),
//       "linkedin-browser",
//       true
//     )

//     // CRITICAL: Set timeout to prevent infinite waiting
//     setTimeout(async () => {
//       const queueItem = linkedinExtractionQueue.get(searchId)
//       if (queueItem && queueItem.status === 'active') {
//         console.log(`⏰ LinkedIn extraction timeout for search ${searchId}. Finalizing with existing results.`)
        
//         // Mark as timeout and finalize
//         linkedinExtractionQueue.set(searchId, { ...queueItem, status: 'timeout' })
//         await finalizeSearchWithExistingCandidates(searchId, false)
//       }
//     }, 8 * 60 * 1000) // 8 minutes timeout
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

// // Extract candidate from LinkedIn DOM using AI
// async function extractCandidateFromLinkedInDOM(domContent, profileUrl) {
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
//     ${domContent.substring(0, 15000)}
//     ---
    
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
//       "industries": ["industry1", "industry2"] or []
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

//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from LinkedIn DOM`)
//       return null
//     }

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

// // Enhanced candidate extraction with AI (keeping existing implementation)
// async function extractCandidateWithAI(pageText, url, platform) {
//   const prompt = `
//     You are an expert talent sourcer specializing in extracting professional information from ${platform} profiles.

//     **CRITICAL EXTRACTION REQUIREMENTS:**
//     1. **ZERO FABRICATION**: Only extract information explicitly present in the text
//     2. **NULL FOR MISSING**: Return null for any information not found - never guess or invent
//     3. **COMPREHENSIVE ANALYSIS**: Extract ALL available contact information and professional links
//     4. **EXACT TRANSCRIPTION**: Copy information exactly as written

//     **Content Source:** ${url} (Platform: ${platform})

//     **Text Content:**
//     ---
//     ${pageText.substring(0, 12000)}
//     ---

//     **OUTPUT FORMAT:**
//     Return ONLY this JSON structure with extracted data or null values:
//     {
//       "candidateName": "Full name exactly as written or null",
//       "email": "primary.email@domain.com or null",
//       "mobile": "exact phone number with formatting or null",
//       "currentJobTitle": "Exact current title or null",
//       "currentCompany": "Exact company name or null",
//       "location": "Exact location string or null",
//       "skills": ["actual", "skills", "extracted"] or [],
//       "summary": "Professional summary/bio from profile or null",
//       "experience": "Work experience description or null",
//       "yearsOfExperience": "X years (only if explicitly stated) or null",
//       "education": "Education information or null",
//       "certifications": ["actual", "certifications"] or [],
//       "projects": ["actual", "projects", "portfolio pieces"] or [],
//       "achievements": ["awards", "recognition", "notable work"] or [],
//       "industries": ["industry", "specializations"] or []
//     }
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2500,
//       temperature: 0.05,
//       response_format: { type: "json_object" },
//     })

//     const result = JSON.parse(response.choices[0].message.content)

//     if (!result || !result.candidateName) {
//       console.log(`❌ No valid candidate data extracted from ${url}`)
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
//       certifications: result.certifications || [],
//       projects: result.projects || [],
//       achievements: result.achievements || [],
//       industries: result.industries || [],
//       sourceInfo: {
//         platform,
//         profileUrl: url,
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

// // Enhanced candidate evaluation (keeping existing implementation)
// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   if (!candidate.candidateName) {
//     console.log("⚠️ Skipping evaluation - insufficient candidate data")
//     return null
//   }

//   const prompt = `
//     You are a senior technical recruiter and talent assessment expert with 20+ years of experience. 
//     Conduct a comprehensive evaluation of this candidate's fit for the position using rigorous assessment criteria.

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
//     - Experience: ${candidate.yearsOfExperience || "Not specified"}
//     - Summary: ${candidate.summary || "Not available"}
//     - Education: ${candidate.education || "Not specified"}
//     - Certifications: ${candidate.certifications?.join(", ") || "Not specified"}
//     - Projects: ${candidate.projects?.join(", ") || "Not specified"}
//     - Achievements: ${candidate.achievements?.join(", ") || "Not specified"}
//     - Industries: ${candidate.industries?.join(", ") || "Not specified"}

//     Return ONLY this JSON structure with thorough analysis:
//     {
//       "matchingScoreDetails": {
//         "skillsMatch": number (0-100),
//         "experienceMatch": number (0-100),
//         "educationMatch": number (0-100),
//         "culturalFitMatch": number (0-100),
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
//           "relevantExperience": "detailed description or 'Limited information available'",
//           "yearsOfExperience": "exact years mentioned or 'Not specified'",
//           "careerProgression": "analysis of career growth",
//           "industryExperience": "relevant industry background",
//           "roleRelevance": "how previous roles align with target position"
//         },
//         "education": {
//           "highestDegree": "actual degree or 'Not specified'",
//           "relevantCourses": ["relevant", "coursework"] or [],
//           "certifications": ["professional", "certifications"],
//           "continuousLearning": "evidence of ongoing development"
//         },
//         "projects": ["significant", "projects", "and", "achievements"],
//         "strengths": ["top", "candidate", "strengths"],
//         "concerns": ["potential", "concerns", "or", "risks"],
//         "recommendation": "detailed hiring recommendation with reasoning",
//         "comments": "comprehensive assessment including data gaps",
//         "additionalNotes": "market insights and unique value proposition"
//       },
//       "comment": "concise executive summary for hiring managers",
//       "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
//       "confidenceLevel": "High|Medium|Low (based on available information quality)"
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

// // Save candidates to Resume database
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

// // Deduplication function
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

// // Manual extraction notification endpoint
// export const notifyManualExtraction = async (req, res) => {
//   try {
//     const { searchId, urlCount } = req.body
    
//     if (!searchId) {
//       return res.status(400).json({ success: false, error: "Search ID required" })
//     }

//     console.log(`📱 Manual extraction started for ${urlCount} URLs in search ${searchId}`)
    
//     emitProgress(
//       searchId,
//       `👤 Manual extraction: Opening ${urlCount} LinkedIn profiles...`,
//       65,
//       getTotalCandidatesFound(searchId),
//       "linkedin-manual",
//       true
//     )

//     res.status(200).json({ 
//       success: true, 
//       message: "Manual extraction notification received" 
//     })
//   } catch (error) {
//     console.error("❌ Error in manual extraction notification:", error.message)
//     res.status(500).json({ success: false, error: "Internal server error" })
//   }
// }

// // Platform-specific search functions (GitHub, LinkedIn, etc.) - keeping existing implementations
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

//   // Mark platform as active
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.github.status`]: "searching",
//     [`platformProgress.github.completed`]: false
//   })

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i]
//     if (!query || query.trim() === "" || shouldStopSearch(searchId)) continue

//     try {
//       console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`)
//       emitProgress(
//         searchId,
//         `GitHub search: "${query.substring(0, 50)}..."`,
//         40 + (i / queries.length) * 25,
//         getTotalCandidatesFound(searchId),
//         "github",
//         true
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
//             const candidate = await extractCandidateFromUrl(user.html_url, "github")
//             if (candidate && candidate.candidateName) {
//               candidates.set(user.html_url, candidate)
//               totalResults++
              
//               // Save candidate immediately
//               await saveCandidateToBuffer(searchId, candidate, "github")
              
//               console.log(`✅ GitHub candidate saved: ${candidate.candidateName}`)
//               emitProgress(
//                 searchId,
//                 `Found GitHub: ${candidate.candidateName}`,
//                 45 + (i / queries.length) * 25,
//                 getTotalCandidatesFound(searchId),
//                 "github",
//                 true,
//                 candidate.candidateName
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

//   // Mark platform as completed
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.github.status`]: "completed",
//     [`platformProgress.github.completed`]: true,
//     [`platformProgress.github.candidatesFound`]: candidates.size
//   })

//   console.log(`🎉 GitHub search completed. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }


// // Enhanced main search function with immediate candidate saving
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
//       rawCandidates: [],
//       linkedinProfiles: [],
//       platformProgress: {
//         google: { status: "pending", candidatesFound: 0, completed: false },
//         linkedin: { status: "pending", candidatesFound: 0, completed: false },
//         github: { status: "pending", candidatesFound: 0, completed: false },
//         dribbble: { status: "pending", candidatesFound: 0, completed: false },
//         behance: { status: "pending", candidatesFound: 0, completed: false },
//       },
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

// // CRITICAL FIX: Enhanced main search workflow with immediate candidate saving
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

//     // Step 3: Enhanced platform searches with stop control and immediate saving
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
//         getTotalCandidatesFound(searchHistoryId),
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
//         getTotalCandidatesFound(searchHistoryId),
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

//       emitProgress(
//         searchHistoryId,
//         `✅ Completed ${platform} search: ${platformCandidates.length} candidates found`,
//         30 + i * 20,
//         getTotalCandidatesFound(searchHistoryId),
//         platform,
//         true,
//       )

//       // Check if we've reached target or should stop
//       const totalFound = getTotalCandidatesFound(searchHistoryId)
//       if (totalFound >= searchSettings.candidateCount || shouldStopSearch(searchHistoryId)) {
//         if (shouldStopSearch(searchHistoryId)) {
//           console.log(`🛑 Search stopped after ${platform} search`)
//           wasStopped = true
//         } else {
//           console.log(`🎯 Reached target candidate count: ${totalFound}`)
//         }
//         break
//       }
//     }

//     console.log(`📊 Total candidates found across all platforms: ${getTotalCandidatesFound(searchHistoryId)}`)

//     // Check if we have LinkedIn URLs pending extraction
//     const extractionQueue = linkedinExtractionQueue.get(searchHistoryId)
//     if (extractionQueue && extractionQueue.urls.length > 0 && extractionQueue.status === 'active') {
//       console.log(`⏳ Waiting for LinkedIn browser extraction to complete...`)
//       emitProgress(
//         searchHistoryId,
//         `⏳ LinkedIn extraction: Processing ${extractionQueue.urls.length} profiles...`,
//         70,
//         getTotalCandidatesFound(searchHistoryId),
//         "linkedin-browser",
//         true,
//       )

//       // The search will continue in finalizeSearchWithExistingCandidates when LinkedIn extraction completes
//       return
//     }

//     // If no LinkedIn extraction needed, finalize immediately
//     console.log(`🏁 No LinkedIn extraction needed. Finalizing search...`)
//     await finalizeSearchWithExistingCandidates(searchHistoryId, wasStopped)

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
//     linkedinExtractionQueue.delete(searchHistoryId)
//     linkedinExtractionResults.delete(searchHistoryId)
//     searchCandidateBuffer.delete(searchHistoryId)
//   }
// }

// // Remaining platform search functions
// async function searchDribbble(queries, searchSettings, searchId) {
//   console.log("🎨 Starting enhanced Dribbble search for design talent")
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
// }

// async function searchBehance(queries, searchSettings, searchId) {
//   console.log("🎭 Starting enhanced Behance search for creative professionals")
//   return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
// }

// // LinkedIn API search implementation
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
//     if (candidates.size >= targetCandidates || shouldStopSearch(searchId)) break
    
//     emitProgress(
//       searchId,
//       `Enriching LinkedIn profile ${processedCount + 1}/${linkedInUrls.size}...`,
//       50 + (processedCount / linkedInUrls.size) * 25,
//       getTotalCandidatesFound(searchId),
//       "linkedin-api",
//       true
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
        
//         // Save candidate immediately
//         await saveCandidateToBuffer(searchId, candidate, "linkedin-api")
        
//         console.log(`✅ Enriched & saved via LinkedIn API: ${candidate.candidateName}`)
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

// // Query generation and other utility functions
// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 5–7 broad, high-yield search queries to maximize candidate discovery.

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

//     **Platform to Target:** ${platform}

//     **Query Generation Strategy:**
//     - Create 5–7 broad queries to maximize candidate matches.
//     - Combine core skills, primary job titles, and location (if specified) in each query.
//     - Use Boolean operators (AND, OR, quotes) for broad reach.
//     - Avoid overly specific queries; focus on high-volume candidate pools.
//     - Include alternative job titles and skill synonyms where relevant.

//     **Query Categories (5–7 total):**
//     - 2–3 Skill + Title queries (core skills + primary/alternative titles)
//     - 1–2 Location + Title queries (if location specified)
//     - 1–2 Experience + Skill queries (seniority + key skills)
//     - 1 General keyword-based query (broad industry/role terms)

//     **Quality Standards:**
//     - Queries should be 10–30 words long.
//     - Prioritize individual profiles over company pages.
//     - Balance broad reach with relevance.

//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 800,
//       temperature: 0.4,
//       response_format: { type: "json_object" },
//     })

//     const content = JSON.parse(response.choices[0].message.content)
//     const queries = content.queries || []
//     console.log(`🔍 Generated ${queries.length} broad queries for ${platform}`)
//     return queries.slice(0, 7)
//   } catch (error) {
//     console.error("❌ Error generating search queries:", error.message)
//     return []
//   }
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
//       "LinkedIn Browser Extraction",
//       "Stop Control",
//       "Resume Database Integration",
//       "Immediate Candidate Saving",
//     ],
//   }
// }

// // Job analysis function
// async function analyzeJobAndDeterminePlatforms(jobDescription, searchSettings) {
//   try {
//     const analysis = await analyzeJobForPlatforms(jobDescription, searchSettings)
//     return analysis
//   } catch (error) {
//     console.error("❌ Error analyzing job for platforms:", error.message)
//     return null
//   }
// }

// // API endpoint implementations
// export const getSearchResults = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     const search = await SearchHistory.findById(searchId)
//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search not found" })
//     }

//     res.status(200).json({
//       success: true,
//       results: search.results || [],
//       rawCandidates: search.rawCandidates || [], // Include raw candidates
//       linkedinProfiles: search.linkedinProfiles || [],
//       platformProgress: search.platformProgress || {},
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
//     const searches = await SearchHistory.find({ recruiterId })
//       .select("-results -rawCandidates") // Exclude heavy data for list view
//       .sort({ createdAt: -1 })
//       .limit(20)
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

// Export additional necessary functions and keep existing API endpoints
// export {
//   startHeadhunterSearch,
//   getSearchResults,
//   getSearchHistory,
//   addCandidatesToWorkflow,
//   deleteSearchHistoryItem,
//   getCostEstimate,
//   analyzeJobForPlatforms,
// }

// // --- half working code ------------
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


// // / Fixed: Better progress emission with candidate details
// function emitProgress(searchId, status, progress, candidatesFound = 0, platform = "", canStop = true, currentCandidate = "") {
//   const progressData = {
//     searchId,
//     status,
//     progress: Math.min(Math.max(progress, 0), 100),
//     candidatesFound,
//     platform,
//     timestamp: new Date().toISOString(),
//     canStop,
//     currentCandidate, // Add current candidate info
//   };
  
//   console.log(`📡 Progress Update [${searchId}]: ${progress.toFixed(1)}% - ${status} - ${candidatesFound} candidates - Platform: ${platform}`);
//   io.emit("searchProgress", progressData);
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
// // Fixed: processLinkedInDOM with better progress tracking
// export const processLinkedInDOM = async (req, res) => {
//   try {
//     const { searchId, profileUrl, domContent, success, error } = req.body;

//     if (!searchId || !profileUrl) {
//       return res.status(400).json({ success: false, error: "Search ID and profile URL are required" });
//     }

//     console.log(`📥 Processing LinkedIn DOM for: ${profileUrl} (Success: ${success})`);

//     if (!success || !domContent) {
//       console.log(`❌ Failed to extract DOM from: ${profileUrl}. Reason: ${error}`);
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed");
//       await checkLinkedInExtractionComplete(searchId);
//       return res.status(200).json({ success: true, message: "Failed extraction recorded" });
//     }

//     // Update status to processing
//     await updateLinkedInProfileStatus(searchId, profileUrl, "processing");

//     // Extract candidate name from URL for progress tracking
//     const candidateName = extractNameFromLinkedInUrl(profileUrl);

//     // Emit progress with current candidate
//     emitProgress(
//       searchId,
//       `🔍 Extracting data from LinkedIn profile...`,
//       65,
//       0,
//       "linkedin-browser",
//       true,
//       candidateName
//     );

//     // Extract candidate data using AI
//     const candidate = await extractCandidateFromLinkedInDOM(domContent, profileUrl);

//     if (candidate) {
//       console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`);
      
//       // Store in extraction results
//       const existingResults = linkedinExtractionResults.get(searchId) || [];
//       existingResults.push(candidate);
//       linkedinExtractionResults.set(searchId, existingResults);

//       await updateLinkedInProfileStatus(searchId, profileUrl, "success", candidate.candidateName);
      
//       // Emit progress with successful extraction
//       emitProgress(
//         searchId,
//         `✅ Extracted: ${candidate.candidateName}`,
//         70,
//         existingResults.length,
//         "linkedin-browser",
//         true,
//         candidate.candidateName
//       );
//     } else {
//       console.log(`❌ AI failed to extract candidate data from: ${profileUrl}`);
//       await updateLinkedInProfileStatus(searchId, profileUrl, "failed");
//     }

//     // Check if extraction is complete
//     await checkLinkedInExtractionComplete(searchId);

//     res.status(200).json({
//       success: true,
//       message: "LinkedIn DOM processed",
//       candidateExtracted: !!candidate,
//       candidateName: candidate?.candidateName
//     });
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn DOM:", error.message);
    
//     if (req.body.searchId) {
//       await checkLinkedInExtractionComplete(req.body.searchId);
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

// // NEW: Check if LinkedIn extraction is complete or stopped
// async function checkLinkedInExtractionComplete(searchId) {
//   try {
//     const search = await SearchHistory.findById(searchId);
//     if (!search) return;

//     // Check if the search has been stopped by the user
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search ${searchId} was stopped. Finalizing with extracted candidates.`);
//       const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
//       await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, true);
      
//       // Clean up
//       linkedinExtractionQueue.delete(searchId);
//       linkedinExtractionResults.delete(searchId);
//       return;
//     }

//     const pendingProfiles = search.linkedinProfiles.filter(
//       (profile) => profile.extractionStatus === "pending" || profile.extractionStatus === "processing"
//     );

//     console.log(`📊 LinkedIn extraction check: ${pendingProfiles.length} pending profiles remaining`);

//     if (pendingProfiles.length === 0) {
//       console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`);
//       const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
//       await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, false);

//       // Clean up
//       linkedinExtractionQueue.delete(searchId);
//       linkedinExtractionResults.delete(searchId);
//     } else {
//       // Emit progress update
//       const totalProfiles = search.linkedinProfiles.length;
//       const processedProfiles = totalProfiles - pendingProfiles.length;
//       const progressPercentage = totalProfiles > 0 ? (processedProfiles / totalProfiles) * 100 : 0;
      
//       emitProgress(
//         searchId,
//         `Processing LinkedIn profiles: ${processedProfiles}/${totalProfiles}`,
//         60 + (progressPercentage * 0.2), // 60-80% range
//         linkedinExtractionResults.get(searchId)?.length || 0,
//         "linkedin-browser",
//         true
//       );
//     }
//   } catch (error) {
//     console.error("❌ Error checking LinkedIn extraction completion:", error.message);
//     // Continue with existing candidates on error
//     const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
//     await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, false);
    
//     // Clean up
//     linkedinExtractionQueue.delete(searchId);
//     linkedinExtractionResults.delete(searchId);
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


// // Fixed: Prevent premature search completion
// async function continueSearchAfterLinkedInExtraction(searchId, linkedinCandidates, wasStopped = false) {
//   try {
//     console.log(`🔄 Continuing search after LinkedIn extraction (stopped=${wasStopped}). LinkedIn candidates: ${linkedinCandidates.length}`);

//     const search = await SearchHistory.findById(searchId);
//     if (!search) {
//       console.error("❌ Search not found:", searchId);
//       return;
//     }

//     const job = await JobDescription.findById(search.jobId);
//     if (!job) {
//       console.error("❌ Job not found:", search.jobId);
//       return;
//     }

//     // Get existing candidates from other platforms (CRITICAL FIX)
//     const existingCandidates = search.results || [];
//     console.log(`📊 Existing candidates from other platforms: ${existingCandidates.length}`);
//     console.log(`📊 LinkedIn candidates to add: ${linkedinCandidates.length}`);

//     // Combine all candidates
//     const allCandidates = [...existingCandidates, ...linkedinCandidates];
//     console.log(`📊 Total candidates before deduplication: ${allCandidates.length}`);

//     emitProgress(
//       searchId,
//       `🔄 Processing ${allCandidates.length} total candidates (${existingCandidates.length} from search + ${linkedinCandidates.length} from LinkedIn)...`,
//       85,
//       allCandidates.length,
//       "processing",
//       false
//     );

//     // Deduplicate candidates
//     const uniqueCandidates = deduplicateCandidates(allCandidates);
//     console.log(`🎯 After deduplication: ${uniqueCandidates.length} unique candidates`);

//     if (uniqueCandidates.length === 0) {
//       console.log("⚠️ No candidates found after processing");
      
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         results: [],
//         candidatesFound: 0,
//         status: wasStopped ? "stopped" : "completed",
//         completedAt: new Date(),
//       });

//       io.emit("searchComplete", {
//         searchId: searchId,
//         candidates: [],
//         wasStopped: wasStopped,
//         summary: {
//           totalCandidatesFound: allCandidates.length,
//           linkedinCandidatesExtracted: linkedinCandidates.length,
//           finalCandidatesSelected: 0,
//           message: "No candidates found matching the criteria"
//         },
//       });

//       searchControlMap.delete(searchId.toString());
//       return;
//     }

//     emitProgress(
//       searchId,
//       `🧠 Evaluating ${uniqueCandidates.length} candidates with AI matching...`,
//       90,
//       uniqueCandidates.length,
//       "evaluating",
//       false
//     );

//     // Evaluate candidates with AI matching (with progress tracking)
//     const evaluatedCandidates = [];
//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i];
      
//       // Emit progress for evaluation
//       if (i % 5 === 0) { // Update every 5 candidates
//         emitProgress(
//           searchId,
//           `🧠 AI evaluation: ${i + 1}/${uniqueCandidates.length} candidates...`,
//           90 + ((i / uniqueCandidates.length) * 8), // 90-98%
//           evaluatedCandidates.length,
//           "ai-evaluation",
//           false
//         );
//       }

//       try {
//         const evaluation = await evaluateCandidateMatch(candidate, job, search.searchSettings);
//         if (evaluation) {
//           candidate.matchScore = evaluation.matchingScoreDetails.overallMatch;
//           candidate.matchingScoreDetails = evaluation.matchingScoreDetails;
//           candidate.analysis = evaluation.analysis;
//           candidate.comment = evaluation.comment;
//           candidate.recommendation = evaluation.recommendation;
//           candidate.confidenceLevel = evaluation.confidenceLevel;
//         }
        
//         // Set required fields
//         candidate.jobTitle = job._id;
//         candidate.companyId = job.companyId;
//         candidate.candidateStatus = "AI Sourced";
//         candidate.aiSourced = true;
        
//         evaluatedCandidates.push(candidate);
//       } catch (evalError) {
//         console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, evalError.message);
//         // Add candidate without evaluation
//         candidate.matchScore = 0;
//         candidate.jobTitle = job._id;
//         candidate.companyId = job.companyId;
//         candidate.candidateStatus = "AI Sourced";
//         candidate.aiSourced = true;
//         evaluatedCandidates.push(candidate);
//       }
//     }

//     console.log(`✅ Evaluation completed. ${evaluatedCandidates.length} candidates evaluated`);

//     // Filter and rank candidates
//     const rankedCandidates = evaluatedCandidates
//       .filter((c) => c.candidateName && c.candidateName.trim() !== "")
//       .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

//     console.log(`📊 Ranked candidates: ${rankedCandidates.length}`);

//     // Select final candidates
//     const targetCount = search.searchSettings.candidateCount || 10;
//     const finalCandidates = wasStopped ? rankedCandidates : rankedCandidates.slice(0, targetCount);

//     console.log(`🎯 Final selection: ${finalCandidates.length} candidates (target: ${targetCount})`);

//     emitProgress(
//       searchId,
//       `💾 Saving ${finalCandidates.length} candidates to database...`,
//       98,
//       finalCandidates.length,
//       "saving",
//       false
//     );

//     // Save candidates to Resume database
//     await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId);

//     // Update search history with final results
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: wasStopped ? "stopped" : "completed",
//       completedAt: new Date(),
//     });

//     const completionMessage = wasStopped
//       ? `🛑 Search stopped! Saved ${finalCandidates.length} candidates.`
//       : `🎉 Search completed! Found ${finalCandidates.length} high-quality candidates.`;
      
//     emitProgress(searchId, completionMessage, 100, finalCandidates.length, "completed", false);

//     // Emit final results
//     io.emit("searchComplete", {
//       searchId: searchId,
//       candidates: finalCandidates,
//       wasStopped: wasStopped,
//       summary: {
//         totalCandidatesFound: allCandidates.length,
//         linkedinCandidatesExtracted: linkedinCandidates.length,
//         finalCandidatesSelected: finalCandidates.length,
//         evaluatedCandidates: evaluatedCandidates.length,
//       },
//     });

//     // Create notification
//     const notification = new Notification({
//       message: `${wasStopped ? '🛑 Search stopped' : '🎉 Enhanced search completed'}! Found ${finalCandidates.length} candidates for ${job.context}.`,
//       recipientId: search.recruiterId,
//       jobId: job._id,
//     });
//     await notification.save();
//     io.emit("newNotification", notification);

//     // Clean up search control
//     searchControlMap.delete(searchId.toString());
    
//     console.log("✅ Search completion process finished successfully");
//   } catch (error) {
//     console.error("❌ Error in continueSearchAfterLinkedInExtraction:", error.message);
    
//     // Emergency cleanup
//     try {
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         status: "failed",
//         completedAt: new Date(),
//       });

//       io.emit("searchError", {
//         searchId: searchId,
//         message: `Search processing failed: ${error.message}`,
//         wasStopped: false,
//       });

//       searchControlMap.delete(searchId.toString());
//     } catch (cleanupError) {
//       console.error("❌ Error in emergency cleanup:", cleanupError.message);
//     }
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



// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are a world-class sourcing expert specializing in ${platform} recruitment. Generate 5–7 broad, high-yield search queries to maximize candidate discovery.

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

//     **Platform to Target:** ${platform}

//     **Platform-Specific Instructions:**
//     ${getPlatformInstructions(platform, jobAnalysis)}

//     **Query Generation Strategy:**
//     - Create 5–7 broad queries to maximize candidate matches.
//     - Combine core skills, primary job titles, and location (if specified) in each query.
//     - Use Boolean operators (AND, OR, quotes) for broad reach.
//     - Avoid overly specific queries; focus on high-volume candidate pools.
//     - Include alternative job titles and skill synonyms where relevant.
//     - Target active profiles with contact information where possible.

//     **Query Categories (5–7 total):**
//     - 2–3 Skill + Title queries (core skills + primary/alternative titles)
//     - 1–2 Location + Title queries (if location specified)
//     - 1–2 Experience + Skill queries (seniority + key skills)
//     - 1 General keyword-based query (broad industry/role terms)

//     **Quality Standards:**
//     - Queries should be 10–30 words long.
//     - Prioritize individual profiles over company pages.
//     - Balance broad reach with relevance.

//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini", // Use lighter model for faster processing
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 800, // Reduced tokens for faster response
//       temperature: 0.4, // Slightly lower for consistent but broader queries
//       response_format: { type: "json_object" },
//     });

//     const content = JSON.parse(response.choices[0].message.content);
//     const queries = content.queries || [];
//     console.log(`🔍 Generated ${queries.length} broad queries for ${platform}`);
//     return queries.slice(0, 7); // Ensure max 7 queries
//   } catch (error) {
//     console.error("❌ Error generating search queries:", error.message);
//     return [];
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

// // NEW: Enhanced Google search with LinkedIn URL collection
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
//             // NEW: Check if it's a LinkedIn profile URL
//             if (item.link.includes("linkedin.com/in/") && platform === "linkedin") {
//               linkedinUrls.add(item.link)
//               console.log(`🔗 Collected LinkedIn URL: ${item.link}`)
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

//   // NEW: Handle LinkedIn URLs if found
//   if (linkedinUrls.size > 0 && platform === "linkedin") {
//     console.log(`🔗 Found ${linkedinUrls.size} LinkedIn URLs. Sending to browser for extraction...`)
//     await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
//   }

//   console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} candidates.`)
//   return Array.from(candidates.values())
// }


// async function handleLinkedInUrls(searchId, linkedinUrls) {
//   try {
//     // Limit to top 20 LinkedIn URLs for performance
//     const topUrls = linkedinUrls.slice(0, 20);
//     console.log(`📤 Sending ${topUrls.length} LinkedIn URLs to frontend for browser extraction`);

//     // Store LinkedIn URLs in extraction queue
//     linkedinExtractionQueue.set(searchId, {
//       urls: topUrls,
//       processed: [],
//       failed: [],
//       startTime: new Date()
//     });

//     // Save LinkedIn URLs to search history
//     const linkedinProfiles = topUrls.map((url) => ({
//       profileUrl: url,
//       candidateName: extractNameFromLinkedInUrl(url),
//       extractionStatus: "pending",
//       lastAttempted: new Date(),
//       retryCount: 0,
//     }));

//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $push: { linkedinProfiles: { $each: linkedinProfiles } },
//     });

//     // Emit LinkedIn URLs to frontend for browser extraction
//     io.emit("linkedinUrlsForExtraction", {
//       searchId: searchId,
//       urls: topUrls,
//       message: `Found ${topUrls.length} LinkedIn profiles. Starting browser extraction...`,
//     });

//     emitProgress(
//       searchId,
//       `📤 Sent ${topUrls.length} LinkedIn URLs to browser for extraction...`,
//       60,
//       0,
//       "linkedin-browser",
//       true, // Can stop during LinkedIn extraction
//     );

//     // Set timeout to continue search if extraction takes too long (5 minutes)
//     setTimeout(async () => {
//       const queueItem = linkedinExtractionQueue.get(searchId);
//       if (queueItem && queueItem.startTime) {
//         console.log(`⏰ LinkedIn extraction timeout for search ${searchId}. Continuing with existing results.`);
//         const extractedCandidates = linkedinExtractionResults.get(searchId) || [];
//         await continueSearchAfterLinkedInExtraction(searchId, extractedCandidates, false);
        
//         // Clean up
//         linkedinExtractionQueue.delete(searchId);
//         linkedinExtractionResults.delete(searchId);
//       }
//     }, 5 * 60 * 1000); // 5 minutes timeout
//   } catch (error) {
//     console.error("❌ Error handling LinkedIn URLs:", error.message);
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
//       "LinkedIn Browser Extraction",
//       "Stop Control",
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
//         false,
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

// // Add manual extraction notification endpoint
// export const notifyManualExtraction = async (req, res) => {
//   try {
//     const { searchId, urlCount } = req.body;
    
//     if (!searchId) {
//       return res.status(400).json({ success: false, error: "Search ID required" });
//     }

//     console.log(`📱 Manual extraction started for ${urlCount} URLs in search ${searchId}`);
    
//     emitProgress(
//       searchId,
//       `👤 Manual extraction: Opening ${urlCount} LinkedIn profiles...`,
//       65,
//       0,
//       "linkedin-manual",
//       true
//     );

//     res.status(200).json({ 
//       success: true, 
//       message: "Manual extraction notification received" 
//     });
//   } catch (error) {
//     console.error("❌ Error in manual extraction notification:", error.message);
//     res.status(500).json({ success: false, error: "Internal server error" });
//   }
// };
