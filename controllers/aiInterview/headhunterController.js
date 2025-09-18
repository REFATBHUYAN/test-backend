import { OpenAI } from "openai";
import axios from "axios";
import { load } from "cheerio";
import JobDescription from "../../model/JobDescriptionModel.js";
import Resume from "../../model/resumeModel.js";
import Notification from "../../model/NotificationModal.js";
import { io } from "../../index.js";
import mongoose from "mongoose";
import EnhancedLinkedInAutomation from "./linkedinAutomationController.js";
// import { extractLinkedInProfilesWithPlaywright } from "./linkedinAutomationController.js";
import dotenv from "dotenv"
dotenv.config()

const USE_PLAYWRIGHT_AUTOMATION =
  process.env.USE_PLAYWRIGHT_LINKEDIN === "true";
const LINKEDIN_CREDENTIALS = {
  email: "Cunard.consulting.dev@gmail.com",
  password: "D0ft67ju01$",
};
// const LINKEDIN_CREDENTIALS = {
//   email: process.env.LINKEDIN_EMAIL,
//   password: process.env.LINKEDIN_PASSWORD,
// };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Global search control map
const searchControlMap = new Map();
const linkedinExtractionQueue = new Map();
const candidateBuffer = new Map(); // ✅ Buffer for all raw candidates

// ENHANCED SCHEMA with proper progress tracking
const searchHistorySchema = new mongoose.Schema({
  recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JobDescription",
    required: true,
  },
  jobTitle: String,
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  platforms: [String],
  searchSettings: Object,
  candidatesFound: { type: Number, default: 0 }, // FIXED: Only final evaluated candidates
  status: {
    type: String,
    enum: [
      "pending",
      "searching",
      "extracting",
      "evaluating",
      "completed",
      "failed",
      "stopped",
    ],
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
        enum: [
          "Highly Recommended",
          "Recommended",
          "Consider",
          "Not Recommended",
        ],
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
        enum: [
          "pending",
          "processing",
          "success",
          "failed",
          "rate_limited",
          "blocked",
        ],
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
      enum: [
        "initializing",
        "searching",
        "linkedin_extraction",
        "ai_evaluation",
        "finalizing",
        "completed",
      ],
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
});

const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema);

// LinkedIn automation instance management
let linkedinAutomationInstance = null;

async function getLinkedInAutomationInstance() {
  if (!linkedinAutomationInstance) {
    linkedinAutomationInstance = new EnhancedLinkedInAutomation();
    await linkedinAutomationInstance.initializeBrowser("production");

    // Login with credentials
    const loginResult = await linkedinAutomationInstance.loginToLinkedIn(
      LINKEDIN_CREDENTIALS.email,
      LINKEDIN_CREDENTIALS.password
    );

    if (!loginResult.success) {
      console.error("❌ Failed to login to LinkedIn:", loginResult.message);
      linkedinAutomationInstance = null;
      throw new Error("LinkedIn login failed");
    }

    console.log("✅ LinkedIn automation instance ready");
  }

  return linkedinAutomationInstance;
}

// Cleanup function for automation instance
async function cleanupLinkedInAutomation() {
  if (linkedinAutomationInstance) {
    await linkedinAutomationInstance.closeBrowser();
    linkedinAutomationInstance = null;
  }
}

// CRITICAL FIX: Proper progress emission with accurate phases
async function emitProgress(
  searchId,
  status,
  progress,
  phase = "searching",
  canStop = true,
  additionalData = {}
) {
  try {
    const search = await SearchHistory.findById(searchId);
    if (!search) return;

    // Calculate accurate progress based on phase
    let accurateProgress = progress;
    const searchProgress = search.searchProgress;

    switch (phase) {
      case "initializing":
        accurateProgress = Math.min(progress, 10);
        break;
      case "searching":
        accurateProgress = 10 + Math.min(progress, 50); // 10-60%
        break;
      case "linkedin_extraction":
        accurateProgress = 60 + Math.min(progress, 20); // 60-80%
        break;
      case "ai_evaluation":
        accurateProgress = 80 + Math.min(progress, 15); // 80-95%
        break;
      case "finalizing":
        accurateProgress = 95 + Math.min(progress, 5); // 95-100%
        break;
      case "completed":
        accurateProgress = 100;
        break;
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
    };

    console.log(
      `📡 Progress [${searchId}]: ${accurateProgress.toFixed(
        1
      )}% - ${phase} - ${status}`
    );
    console.log(
      `   Raw: ${searchProgress.rawCandidatesFound}, LinkedIn: ${searchProgress.linkedinProfilesProcessed}/${searchProgress.linkedinProfilesFound}, Final: ${searchProgress.finalCandidatesSelected}`
    );

    io.emit("searchProgress", progressData);
  } catch (error) {
    console.error("❌ Error emitting progress:", error.message);
  }
}

// Check if search should be stopped
function shouldStopSearch(searchId) {
  const control = searchControlMap.get(searchId.toString());
  return control?.shouldStop || false;
}
// Save candidate temporarily – no emit, no finalize
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
    };

    const search = await SearchHistory.findById(searchId);
    if (!search) {
      console.error(`❌ Search ${searchId} not found for saving candidate.`);
      return;
    }

    // Avoid duplicates
    const isDuplicate = (search.rawCandidates || []).some(
      (raw) =>
        (raw.email &&
          raw.email.toLowerCase() === (candidate.email || "").toLowerCase()) ||
        (raw.sourceInfo?.linkedinProfileUrl &&
          raw.sourceInfo.linkedinProfileUrl ===
            candidate.sourceInfo?.linkedinProfileUrl) ||
        (raw.sourceInfo?.profileUrl &&
          raw.sourceInfo.profileUrl === candidate.sourceInfo?.profileUrl)
    );
    if (isDuplicate) return;

    // Save candidate
    const updated = await SearchHistory.findByIdAndUpdate(
      searchId,
      {
        $push: { rawCandidates: candidateData },
        $inc: { "searchProgress.rawCandidatesFound": 1 },
        $set: {
          [`platformProgress.${platform}.status`]: "active",
        },
      },
      { new: true }
    );

    // Track platform stats
    const totalForPlatform = (updated?.rawCandidates || []).filter(
      (c) => c.platformSource === platform
    ).length;

    await SearchHistory.findByIdAndUpdate(searchId, {
      $set: {
        [`platformProgress.${platform}.candidatesFound`]: totalForPlatform,
      },
    });
  } catch (err) {
    console.error("❌ Error saving candidate to buffer:", err.message);
  }
}

// 5. FIXED: Stop search to process all found candidates
export const stopSearch = async (req, res) => {
  try {
    const { searchId, recruiterId } = req.body;
    if (!searchId || !recruiterId) {
      return res.status(400).json({
        success: false,
        error: "Search ID and recruiter ID are required",
      });
    }

    console.log(
      `🛑 Stop requested for search ${searchId} by recruiter ${recruiterId}`
    );

    // Set stop flag
    searchControlMap.set(searchId.toString(), {
      shouldStop: true,
      stoppedBy: recruiterId,
    });

    // Update search history
    await SearchHistory.findByIdAndUpdate(searchId, {
      stoppedAt: new Date(),
      stoppedBy: recruiterId,
      status: "stopped",
    });

    // Clear any LinkedIn extraction timeout
    const queueItem = linkedinExtractionQueue.get(searchId);
    if (queueItem && queueItem.timeoutId) {
      clearTimeout(queueItem.timeoutId);
      console.log(
        `🧹 Cleared LinkedIn extraction timeout for stopped search ${searchId}`
      );
    }

    await emitProgress(
      searchId,
      "🛑 Stopping search... Processing all found candidates...",
      95,
      "finalizing",
      false
    );

    res.status(200).json({
      success: true,
      message: "Search stop requested. Processing all found candidates...",
    });

    // Emit stopping notification
    io.emit("searchStopping", {
      searchId,
      message: "Search stopping... Processing all found candidates.",
    });

    // CRITICAL: Process all found candidates immediately
    setTimeout(async () => {
      await finalizeSearchWithExistingCandidates(searchId, true);
    }, 1000); // Short delay to ensure stop flag is set
  } catch (error) {
    console.error("❌ Error stopping search:", error.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 3. FIXED: Process LinkedIn DOM with better error handling
export const processLinkedInDOM = async (req, res) => {
  try {
    const { searchId, profileData, success, error, extractionMethod } =
      req.body;
    const finalUrl =
      profileData?.profileUrl || req.body.url || req.body.profileUrl;

    console.log("🔄 Processing LinkedIn Data:", {
      searchId,
      finalUrl,
      success,
      extractionMethod,
    });

    // Handle data from visible tabs (no searchId)
    if (!searchId) {
      console.log(
        `🔥 Data received from visible tab without searchId: ${finalUrl}`
      );
      return res
        .status(200)
        .json({ success: true, message: "Data from visible tab received." });
    }

    if (!finalUrl) {
      return res
        .status(400)
        .json({ success: false, error: "Profile URL is required" });
    }

    const search = await SearchHistory.findById(searchId);
    if (!search) {
      return res
        .status(404)
        .json({ success: false, error: "Search session not found" });
    }

    // CRITICAL FIX: Better profile tracking
    let profileIndex = search.linkedinProfiles.findIndex(
      (p) => p.profileUrl === finalUrl
    );

    if (profileIndex === -1) {
      // Profile not found in database - this shouldn't happen but handle gracefully
      console.warn(
        `⚠️ Profile ${finalUrl} not found in search ${searchId} LinkedIn profiles list`
      );

      // Add it to prevent crashes, but don't increment total count
      const newProfile = {
        profileUrl: finalUrl,
        candidateName: extractNameFromLinkedInUrl(finalUrl),
        extractionStatus: "pending",
        lastAttempted: new Date(),
        retryCount: 0,
      };

      await SearchHistory.findByIdAndUpdate(searchId, {
        $push: { linkedinProfiles: newProfile },
      });

      profileIndex = search.linkedinProfiles.length; // Will be the new index
      console.log(`➕ Added unexpected LinkedIn profile: ${finalUrl}`);
    }

    const profileInDb = search.linkedinProfiles[profileIndex];

    // Skip if already processed
    if (
      profileInDb &&
      !["pending", "processing"].includes(profileInDb.extractionStatus)
    ) {
      console.warn(
        `⚠️ Skipping already processed profile: ${finalUrl} (status: ${profileInDb.extractionStatus})`
      );
      return res
        .status(200)
        .json({ success: true, message: "Profile already processed." });
    }

    // Handle extraction failure
    if (!success || !profileData) {
      console.log(
        `❌ Extraction failed for: ${finalUrl}. Reason: ${error || "Unknown"}`
      );
      await updateLinkedInProfileStatus(
        searchId,
        finalUrl,
        "failed",
        extractNameFromLinkedInUrl(finalUrl)
      );
      await incrementLinkedInProcessed(searchId);
      await checkLinkedInExtractionComplete(searchId);
      return res
        .status(200)
        .json({ success: true, message: "Failed extraction recorded" });
    }

    const candidateName =
      profileData.name || extractNameFromLinkedInUrl(finalUrl);
    await updateLinkedInProfileStatus(
      searchId,
      finalUrl,
      "processing",
      candidateName
    );

    // Check for duplicates in raw candidates
    const isDuplicate = search.rawCandidates.some(
      (raw) =>
        raw.sourceInfo?.linkedinProfileUrl === finalUrl ||
        (raw.candidateName &&
          candidateName &&
          raw.candidateName.toLowerCase() === candidateName.toLowerCase())
    );

    if (isDuplicate) {
      console.log(
        `ℹ️ Duplicate candidate found, skipping AI processing: ${candidateName}`
      );
      await updateLinkedInProfileStatus(
        searchId,
        finalUrl,
        "success",
        candidateName
      );
      await incrementLinkedInProcessed(searchId);
      await checkLinkedInExtractionComplete(searchId);
      return res
        .status(200)
        .json({ success: true, message: "Duplicate candidate skipped." });
    }

    // Show progress
    const currentSearch = await SearchHistory.findById(searchId);
    const processedCount =
      currentSearch.searchProgress.linkedinProfilesProcessed + 1;
    const totalCount = currentSearch.searchProgress.linkedinProfilesFound;

    await emitProgress(
      searchId,
      `🧠 AI processing: ${candidateName} (${processedCount}/${totalCount})`,
      (processedCount / totalCount) * 100,
      "linkedin_extraction",
      true,
      { currentCandidate: candidateName }
    );

    // Extract candidate with AI
    const candidate = await extractCandidateFromStructuredData(
      profileData,
      extractionMethod
    );

    if (candidate) {
      console.log(
        `✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`
      );
      await saveCandidateToBuffer(searchId, candidate, "linkedin-structured");
      await updateLinkedInProfileStatus(
        searchId,
        finalUrl,
        "success",
        candidate.candidateName
      );
    } else {
      console.log(`❌ AI failed to structure data for: ${finalUrl}`);
      await updateLinkedInProfileStatus(
        searchId,
        finalUrl,
        "failed",
        candidateName
      );
    }

    // CRITICAL: Always increment processed count
    await incrementLinkedInProcessed(searchId);
    await checkLinkedInExtractionComplete(searchId);

    res.status(200).json({
      success: true,
      message: "LinkedIn data processed",
      candidateExtracted: !!candidate,
    });
  } catch (error) {
    console.error("❌ Error processing LinkedIn data:", error.message);

    // CRITICAL: Always increment on error to prevent hanging
    if (req.body.searchId) {
      await incrementLinkedInProcessed(req.body.searchId);
      await checkLinkedInExtractionComplete(req.body.searchId);
    }

    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Helper function to increment LinkedIn processed count
async function incrementLinkedInProcessed(searchId) {
  await SearchHistory.findByIdAndUpdate(searchId, {
    $inc: { "searchProgress.linkedinProfilesProcessed": 1 },
  });
}

// Update LinkedIn profile extraction status
async function updateLinkedInProfileStatus(
  searchId,
  profileUrl,
  status,
  candidateName = null
) {
  try {
    const updateData = {
      "linkedinProfiles.$.extractionStatus": status,
      "linkedinProfiles.$.lastAttempted": new Date(),
    };
    if (candidateName) {
      updateData["linkedinProfiles.$.candidateName"] = candidateName;
    }

    await SearchHistory.findOneAndUpdate(
      {
        _id: searchId,
        "linkedinProfiles.profileUrl": profileUrl,
      },
      { $set: updateData }
    );
  } catch (error) {
    console.error("❌ Error updating LinkedIn profile status:", error.message);
  }
}

async function checkLinkedInExtractionComplete(searchId) {
  try {
    const search = await SearchHistory.findById(searchId);
    if (!search) return;

    // Check if search was stopped
    if (shouldStopSearch(searchId)) {
      console.log(`🛑 Search ${searchId} was stopped. Finalizing immediately.`);
      await SearchHistory.findByIdAndUpdate(searchId, {
        "searchProgress.isLinkedinExtractionComplete": true,
      });
      await finalizeSearchWithExistingCandidates(searchId, true);
      return;
    }

    const sp = search.searchProgress || {};
    const totalLinkedIn = sp.linkedinProfilesFound || 0;
    const processedLinkedIn = sp.linkedinProfilesProcessed || 0;
    const expectLinkedIn = !!sp.expectLinkedInExtraction;

    // If we never expected LinkedIn extraction, skip this check
    if (!expectLinkedIn) {
      console.log(`ℹ️ No LinkedIn extraction expected for search ${searchId}`);
      return;
    }

    // SAFEGUARD: Prevent count overflow
    if (processedLinkedIn > totalLinkedIn) {
      console.error(
        `🚨 CRITICAL ERROR: Processed count (${processedLinkedIn}) exceeds total count (${totalLinkedIn}) for search ${searchId}`
      );
      // Fix the count
      await SearchHistory.findByIdAndUpdate(searchId, {
        "searchProgress.linkedinProfilesProcessed": totalLinkedIn,
      });
      console.log(`🔧 Fixed processed count to match total: ${totalLinkedIn}`);
      processedLinkedIn = totalLinkedIn; // Update local variable
    }

    console.log(
      `📊 LinkedIn extraction check: ${processedLinkedIn}/${totalLinkedIn} processed`
    );

    // FIXED: Check completion condition
    const isComplete = totalLinkedIn > 0 && processedLinkedIn >= totalLinkedIn;

    if (isComplete) {
      console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`);

      // Mark LinkedIn extraction as complete
      await SearchHistory.findByIdAndUpdate(searchId, {
        "searchProgress.isLinkedinExtractionComplete": true,
        "searchProgress.currentPhase": "ai_evaluation",
        [`platformProgress.linkedin.status`]: "completed",
        [`platformProgress.linkedin.completed`]: true,
      });

      // Clear timeout if exists
      const queueItem = linkedinExtractionQueue.get(searchId);
      if (queueItem && queueItem.timeoutId) {
        clearTimeout(queueItem.timeoutId);
        console.log(
          `🧹 Cleared LinkedIn extraction timeout for search ${searchId}`
        );
      }

      await emitProgress(
        searchId,
        "✅ LinkedIn extraction complete. Starting AI evaluation...",
        100,
        "linkedin_extraction",
        false
      );

      // Start AI evaluation phase
      await finalizeSearchWithExistingCandidates(searchId, false);
    } else {
      // Update progress
      const progressPercent =
        totalLinkedIn > 0 ? (processedLinkedIn / totalLinkedIn) * 100 : 0;
      await emitProgress(
        searchId,
        `LinkedIn extraction: ${processedLinkedIn}/${totalLinkedIn} profiles processed`,
        progressPercent,
        "linkedin_extraction",
        true
      );
    }
  } catch (error) {
    console.error(
      "❌ Error checking LinkedIn extraction completion:",
      error.message
    );
  }
}

// 2. FIX: Proper finalization that preserves all candidate data
async function finalizeSearchWithExistingCandidates(
  searchId,
  wasStopped = false
) {
  try {
    const search = await SearchHistory.findById(searchId);
    if (!search) {
      console.error(`❌ Search ${searchId} not found for finalization`);
      return;
    }

    // Prevent multiple finalizations
    if (["completed", "stopped", "evaluating"].includes(search.status)) {
      console.log(
        `ℹ️ Search ${searchId} already finalized with status: ${search.status}`
      );
      return;
    }

    console.log(
      `🔄 Starting finalization for search ${searchId} (stopped: ${wasStopped})`
    );

    // Get all candidates from BOTH buffer and database
    const buffered = candidateBuffer.get(searchId) || [];
    const fromDb = search.rawCandidates || [];
    const allCandidates = [...fromDb, ...buffered];

    console.log(
      `📊 Finalization stats: DB=${fromDb.length}, Buffer=${buffered.length}, Total=${allCandidates.length}`
    );

    if (!allCandidates.length) {
      await SearchHistory.findByIdAndUpdate(searchId, {
        results: [],
        candidatesFound: 0,
        status: wasStopped ? "stopped" : "completed",
        completedAt: new Date(),
        "searchProgress.currentPhase": "completed",
        "searchProgress.isAiEvaluationComplete": true,
      });

      io.emit("searchComplete", { searchId, candidates: [], wasStopped });
      candidateBuffer.delete(searchId);
      searchControlMap.delete(searchId.toString());
      return;
    }

    // Update status to prevent race conditions
    await SearchHistory.findByIdAndUpdate(searchId, {
      status: "evaluating",
      "searchProgress.currentPhase": "ai_evaluation",
    });

    const job = await JobDescription.findById(search.jobId);
    if (!job) {
      console.error(`❌ Job ${search.jobId} not found for search ${searchId}`);
      return;
    }

    // Deduplicate candidates first
    const uniqueCandidates = deduplicateCandidates(allCandidates);
    console.log(
      `🎯 After deduplication: ${uniqueCandidates.length} unique candidates`
    );

    const evaluated = [];
    for (let i = 0; i < uniqueCandidates.length; i++) {
      const candidate = uniqueCandidates[i];

      if (i % 3 === 0 || i === uniqueCandidates.length - 1) {
        const progressPercent = (i / uniqueCandidates.length) * 100;
        await emitProgress(
          searchId,
          `🧠 AI evaluating: ${candidate.candidateName || "Unknown"} (${
            i + 1
          }/${uniqueCandidates.length})`,
          progressPercent,
          "ai_evaluation",
          false,
          { currentCandidate: candidate.candidateName }
        );
      }

      try {
        const evaluation = await evaluateCandidateMatch(
          candidate,
          job,
          search.searchSettings
        );

        // CRITICAL FIX: Preserve ALL original candidate data + add evaluation
        const evaluatedCandidate = {
          // Preserve original candidate data
          id:
            candidate.id ||
            `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          candidateName: candidate.candidateName,
          email: candidate.email,
          mobile: candidate.mobile,
          currentJobTitle: candidate.currentJobTitle,
          currentCompany: candidate.currentCompany,
          location: candidate.location,
          skills: candidate.skills || [],
          experience: candidate.experience,
          summary: candidate.summary,
          education: candidate.education,
          certifications: candidate.certifications || [],
          projects: candidate.projects || [],
          achievements: candidate.achievements || [],

          // Add required schema fields
          jobTitle: job._id,
          companyId: job.companyId,
          candidateStatus: "AI Sourced",
          aiSourced: true,

          // Add evaluation results
          matchingScoreDetails: evaluation.matchingScoreDetails,
          analysis: evaluation.analysis,
          comment: evaluation.comment,
          recommendation: evaluation.recommendation,
          confidenceLevel: evaluation.confidenceLevel,

          // Preserve source info
          sourceInfo: candidate.sourceInfo || {},
        };

        evaluated.push(evaluatedCandidate);
      } catch (evalError) {
        console.error(
          `❌ Error evaluating ${candidate.candidateName}:`,
          evalError.message
        );

        // CRITICAL: Even on error, preserve the candidate data
        evaluated.push({
          ...candidate,
          id:
            candidate.id ||
            `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          jobTitle: job._id,
          companyId: job.companyId,
          candidateStatus: "AI Sourced",
          aiSourced: true,
          matchingScoreDetails: { overallMatch: 0 },
          analysis: { skills: { candidateSkills: candidate.skills || [] } },
          recommendation: "Not Recommended",
          comment: "Evaluation failed",
          confidenceLevel: "Low",
          sourceInfo: candidate.sourceInfo || {},
        });
      }
    }

    // Sort by overall match score
    const ranked = evaluated.sort(
      (a, b) =>
        (b.matchingScoreDetails?.overallMatch || 0) -
        (a.matchingScoreDetails?.overallMatch || 0)
    );

    const limit = search.searchSettings?.candidateCount || 10;
    const finalCandidates = ranked.slice(0, limit);

    console.log(
      `🎯 Final selection: ${finalCandidates.length} candidates (target: ${limit})`
    );

    // Save results to SearchHistory
    await SearchHistory.findByIdAndUpdate(searchId, {
      results: finalCandidates,
      candidatesFound: finalCandidates.length,
      status: wasStopped ? "stopped" : "completed",
      completedAt: new Date(),
      "searchProgress.currentPhase": "completed",
      "searchProgress.isAiEvaluationComplete": true,
      "searchProgress.finalCandidatesSelected": finalCandidates.length,
    });

    // Save to Resume database
    await saveCandidatesToResumeDatabase(
      finalCandidates,
      job,
      search.recruiterId
    );

    const completionMessage = wasStopped
      ? `🛑 Search stopped! Found ${finalCandidates.length} qualified candidates.`
      : `🎉 Search completed! Found ${finalCandidates.length} qualified candidates.`;

    await emitProgress(searchId, completionMessage, 100, "completed", false);

    // CRITICAL: Emit the SAME data that was saved to database
    io.emit("searchComplete", {
      searchId,
      candidates: finalCandidates, // This should match what's in the database
      job,
      wasStopped,
      summary: {
        total: allCandidates.length,
        final: finalCandidates.length,
        message: `Found ${finalCandidates.length} qualified candidates from ${allCandidates.length} profiles`,
      },
    });

    // Cleanup
    candidateBuffer.delete(searchId);
    searchControlMap.delete(searchId.toString());
    linkedinExtractionQueue.delete(searchId);

    console.log(`✅ Search ${searchId} finalization completed successfully`);
  } catch (error) {
    console.error(
      "❌ Error in finalizeSearchWithExistingCandidates:",
      error.message
    );
    // Emergency cleanup and error handling...
  }
}

// CRITICAL FIX: Enhanced Google search with proper progress tracking
async function searchGoogle(
  queries,
  searchSettings,
  siteFilter = "",
  searchId
) {
  const candidates = new Map();
  const linkedinUrls = new Set();
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    console.warn(
      "⚠️ Google Search API not configured. Skipping Google search."
    );
    return [];
  }

  const platform = siteFilter.includes("linkedin")
    ? "linkedin"
    : siteFilter.includes("github")
    ? "github"
    : siteFilter.includes("dribbble")
    ? "dribbble"
    : siteFilter.includes("behance")
    ? "behance"
    : "google";

  let totalResults = 0;
  const maxResultsPerQuery = 10;
  const targetCandidates = Math.min(searchSettings.candidateCount * 3, 150);

  console.log(
    `🔍 Starting Google search for ${platform} with ${queries.length} queries`
  );

  // Mark platform as active
  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.${platform}.status`]: "searching",
    [`platformProgress.${platform}.completed`]: false,
  });

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    if (shouldStopSearch(searchId)) {
      console.log(`🛑 Search stopped by user request at query ${i + 1}`);
      break;
    }

    const query = queries[i];
    if (!query || query.trim() === "") continue;

    try {
      const searchQuery = `${query} ${siteFilter}`.trim();
      console.log(
        `🔍 Google search ${i + 1}/${queries.length}: ${searchQuery}`
      );

      // CRITICAL: Proper progress update for searching phase
      const progressPercent = (i / queries.length) * 100;
      await emitProgress(
        searchId,
        `Searching ${platform}: "${query.substring(0, 30)}..."`,
        progressPercent,
        "searching",
        true
      );

      const response = await axios.get(
        `https://www.googleapis.com/customsearch/v1`,
        {
          params: {
            key: apiKey,
            cx: searchEngineId,
            q: searchQuery,
            num: maxResultsPerQuery,
            start: 1,
          },
          timeout: 15000,
        }
      );

      if (response.data.items) {
        console.log(
          `📊 Found ${response.data.items.length} results for query: ${searchQuery}`
        );

        for (const item of response.data.items) {
          if (shouldStopSearch(searchId)) {
            console.log(`🛑 Search stopped during candidate processing`);
            break;
          }

          if (
            item.link &&
            !candidates.has(item.link) &&
            totalResults < targetCandidates
          ) {
            // Check if it's a LinkedIn profile URL
            if (
              item.link.includes("linkedin.com/in/") &&
              platform === "linkedin"
            ) {
              linkedinUrls.add(item.link);
              console.log(`🔗 Collected LinkedIn URL: ${item.link}`);
              continue;
            }

            const candidate = await extractCandidateFromUrl(
              item.link,
              platform
            );
            if (candidate && candidate.candidateName) {
              candidates.set(item.link, candidate);
              totalResults++;

              // Save candidate immediately
              await saveCandidateToBuffer(searchId, candidate, platform);
              console.log(
                `✅ Extracted & saved: ${candidate.candidateName} from ${platform}`
              );
            }
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch (error) {
      console.error(`❌ Search error for query "${query}":`, error.message);
      if (error.response?.status === 429) {
        console.log("⏳ Rate limited, waiting before retry...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  // Mark platform as completed
  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.${platform}.status`]: "completed",
    [`platformProgress.${platform}.completed`]: true,
    $inc: { "searchProgress.platformsCompleted": 1 },
  });

  // Handle LinkedIn URLs if found
  if (linkedinUrls.size > 0 && platform === "linkedin") {
    console.log(
      `🔗 Found ${linkedinUrls.size} LinkedIn URLs. Sending to browser for extraction...`
    );
    await handleLinkedInUrls(searchId, Array.from(linkedinUrls));
  }

  console.log(
    `🎉 Search completed for ${platform}. Found ${candidates.size} direct candidates.`
  );
  return Array.from(candidates.values());
}

async function handleLinkedInUrls(searchId, linkedinUrls) {
  try {
    // Limit to top 10 LinkedIn URLs as mentioned
    const topUrls = linkedinUrls.slice(0, 20);
    console.log(`🔤 Processing ${topUrls.length} LinkedIn URLs...`);

    // Store LinkedIn URLs in search history for tracking
    const linkedinProfiles = topUrls.map((url) => ({
      profileUrl: url,
      candidateName: extractNameFromLinkedInUrl(url),
      extractionStatus: "pending",
      lastAttempted: new Date(),
      retryCount: 0,
    }));

    // CRITICAL FIX: Set the total count correctly and mark that LinkedIn extraction is expected
    await SearchHistory.findByIdAndUpdate(searchId, {
      $push: { linkedinProfiles: { $each: linkedinProfiles } },
      status: "extracting",
      "searchProgress.currentPhase": "linkedin_extraction",
      "searchProgress.linkedinProfilesFound": topUrls.length,
      "searchProgress.linkedinProfilesProcessed": 0,
      "searchProgress.isLinkedinExtractionComplete": false,
      "searchProgress.expectLinkedInExtraction": true,
    });

    // NEW: Check if Playwright automation should be used
    if (
      USE_PLAYWRIGHT_AUTOMATION &&
      LINKEDIN_CREDENTIALS.email &&
      LINKEDIN_CREDENTIALS.password
    ) {
      console.log(`🎭 Using Playwright automation for LinkedIn extraction`);

      await emitProgress(
        searchId,
        `🎭 Starting automated LinkedIn extraction: 0/${topUrls.length} profiles`,
        0,
        "linkedin_extraction",
        true
      );

      try {
        // Use enhanced LinkedIn automation
        const automation = await getLinkedInAutomationInstance();

        let successCount = 0;
        for (let i = 0; i < topUrls.length; i++) {
          const url = topUrls[i];

          if (shouldStopSearch(searchId)) {
            console.log(
              `🛑 Search stopped during LinkedIn extraction at ${i}/${topUrls.length}`
            );
            break;
          }

          await emitProgress(
            searchId,
            `🎭 Extracting LinkedIn profile: ${i + 1}/${topUrls.length}`,
            (i / topUrls.length) * 100,
            "linkedin_extraction",
            true
          );

          try {
            const result = await automation.extractLinkedInProfile(url);

            if (result.success && result.data) {
              // Convert structured data to candidate format
              const candidate = await convertLinkedInDataToCandidate(
                result.data,
                url
              );

              if (candidate) {
                await saveCandidateToBuffer(
                  searchId,
                  candidate,
                  "linkedin-automation"
                );
                await updateLinkedInProfileStatus(
                  searchId,
                  url,
                  "success",
                  candidate.candidateName
                );
                successCount++;
                console.log(
                  `✅ Successfully extracted: ${candidate.candidateName}`
                );
              } else {
                await updateLinkedInProfileStatus(
                  searchId,
                  url,
                  "failed",
                  extractNameFromLinkedInUrl(url)
                );
              }
            } else {
              console.log(
                `❌ Failed to extract: ${url} - ${
                  result.error || result.message
                }`
              );
              await updateLinkedInProfileStatus(
                searchId,
                url,
                "failed",
                extractNameFromLinkedInUrl(url)
              );
            }
          } catch (profileError) {
            console.error(
              `❌ Error extracting profile ${url}:`,
              profileError.message
            );
            await updateLinkedInProfileStatus(
              searchId,
              url,
              "failed",
              extractNameFromLinkedInUrl(url)
            );
          }

          await incrementLinkedInProcessed(searchId);
          await automation.waitForRateLimit();

          // Small delay between profiles to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        console.log(
          `🎭 LinkedIn automation completed: ${successCount}/${topUrls.length} successful`
        );

        // Mark extraction as complete
        await SearchHistory.findByIdAndUpdate(searchId, {
          "searchProgress.isLinkedinExtractionComplete": true,
        });

        // Continue with finalization
        await finalizeSearchWithExistingCandidates(searchId, false);
      } catch (automationError) {
        console.error(
          `❌ Enhanced LinkedIn automation failed:`,
          automationError.message
        );
        console.log(`📧 Falling back to browser extension method`);

        // Reset extraction status and fall back to browser extension
        await SearchHistory.findByIdAndUpdate(searchId, {
          "searchProgress.linkedinProfilesProcessed": 0,
        });

        // Reset all profiles to pending
        await SearchHistory.updateOne(
          { _id: searchId },
          { $set: { "linkedinProfiles.$[].extractionStatus": "pending" } }
        );

        // Fall back to original browser extension method
        await handleLinkedInUrlsWithBrowserExtension(searchId, topUrls);
        // await finalizeSearchWithExistingCandidates(searchId, false);
      }
    } else {
      console.log(`📧 Using browser extension method for LinkedIn extraction`);
      // await handleLinkedInUrlsWithBrowserExtension(searchId, topUrls);
      // await finalizeSearchWithExistingCandidates(searchId, false);
    }
  } catch (error) {
    console.error("❌ Error handling LinkedIn URLs:", error.message);
  }
}

// Convert LinkedIn structured data to candidate format
async function convertLinkedInDataToCandidate(linkedinData, profileUrl) {
  try {
    if (!linkedinData.personalInfo?.name) {
      return null;
    }

    const candidate = {
      id: `linkedin_auto_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      candidateName: linkedinData.personalInfo.name,
      email: linkedinData.personalInfo.email || null,
      mobile: linkedinData.personalInfo.mobile || null,
      currentJobTitle:
        linkedinData.experience?.[0]?.title ||
        linkedinData.personalInfo.headline ||
        null,
      currentCompany: linkedinData.experience?.[0]?.company || null,
      location: linkedinData.personalInfo.location,
      headline: linkedinData.personalInfo.headline,
      summary: linkedinData.about || null,
      skills:
        linkedinData.skills?.map((s) => (typeof s === "string" ? s : s.name)) ||
        [],
      experience:
        linkedinData.experience
          ?.map((exp) => `${exp.title} at ${exp.company} (${exp.duration})`)
          .join("; ") || null,
      education:
        linkedinData.education
          ?.map(
            (edu) => `${edu.degree} from ${edu.institution} (${edu.duration})`
          )
          .join("; ") || null,
      certifications:
        linkedinData.certifications?.map((cert) => cert.name) || [],
      projects: linkedinData.projects?.map((proj) => proj.title) || [],
      sourceInfo: {
        platform: "linkedin",
        profileUrl: profileUrl,
        linkedinProfileUrl: profileUrl,
        extractionMethod: "playwright-automation",
        hasEmail: !!linkedinData.personalInfo.email,
        hasPhone: !!linkedinData.personalInfo.mobile,
        sourcedAt: new Date(),
        aiModel: "structured-extraction",
      },
    };

    return candidate;
  } catch (error) {
    console.error(`❌ Error converting LinkedIn data:`, error.message);
    return null;
  }
}

async function handleLinkedInUrlsWithBrowserExtension(searchId, topUrls) {
  try {
    console.log(
      `📧 Sending ${topUrls.length} LinkedIn URLs to frontend for browser extraction`
    );

    // Emit LinkedIn URLs to frontend for browser extraction
    io.emit("linkedinUrlsForExtraction", {
      searchId: searchId,
      urls: topUrls,
      message: `Found ${topUrls.length} LinkedIn profiles. Starting browser extraction...`,
    });

    await emitProgress(
      searchId,
      `🔤 LinkedIn extraction starting: 0/${topUrls.length} profiles`,
      0,
      "linkedin_extraction",
      true
    );

    // FIXED: Set timeout with better error handling
    const timeoutId = setTimeout(
      async () => {
        console.log(
          `⏰ LinkedIn extraction timeout for search ${searchId}. Processing with current results.`
        );

        const search = await SearchHistory.findById(searchId);
        if (search && !search.searchProgress.isLinkedinExtractionComplete) {
          const pendingCount = search.linkedinProfiles.filter(
            (p) => p.extractionStatus === "pending"
          ).length;

          if (pendingCount > 0) {
            console.log(
              `⚠️ Timing out ${pendingCount} pending LinkedIn profiles`
            );

            // Mark remaining as failed and update processed count
            await SearchHistory.updateOne(
              { _id: searchId },
              {
                $set: { "linkedinProfiles.$[elem].extractionStatus": "failed" },
                $inc: {
                  "searchProgress.linkedinProfilesProcessed": pendingCount,
                },
              },
              { arrayFilters: [{ "elem.extractionStatus": "pending" }] }
            );
          }

          // Force completion
          await SearchHistory.findByIdAndUpdate(searchId, {
            "searchProgress.isLinkedinExtractionComplete": true,
          });

          // Continue with finalization
          await finalizeSearchWithExistingCandidates(searchId, false);
        }
      },
      10 * 60 * 1000 // 10 minutes timeout
    );

    // Store timeout reference
    linkedinExtractionQueue.set(searchId, {
      urls: topUrls,
      processed: [],
      failed: [],
      startTime: new Date(),
      status: "active",
      timeoutId: timeoutId,
      expectedCount: topUrls.length,
    });
  } catch (error) {
    console.error(
      "❌ Error in browser extension LinkedIn handling:",
      error.message
    );
  }
}

function extractNameFromLinkedInUrl(url) {
  try {
    const urlParts = url.split("/");
    const profileId =
      urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
    return (
      profileId
        .replace(/-/g, " ")
        .replace(/\d+/g, "")
        .trim()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ") || "LinkedIn Profile"
    );
  } catch (error) {
    return "LinkedIn Profile";
  }
}

// New function to process structured data from the content script
async function extractCandidateFromStructuredData(
  profileData,
  extractionMethod
) {
  const {
    name,
    headline,
    location,
    aboutHtml,
    experienceHtml,
    educationHtml,
    skills,
    profileUrl,
  } = profileData;

  const prompt = `
    You are a meticulous data extraction expert. Your task is to synthesize professional information from the provided structured data, which was scraped from a LinkedIn profile.

    **CRITICAL RULES:**
    1.  **NO FABRICATION**: Do not invent information not present in the provided data.
    2.  **NULL FOR MISSING DATA**: Use \`null\` for any information you cannot find.
    3.  **SUMMARIZE HTML**: 'experienceHtml' and 'educationHtml' are raw HTML. Summarize the key information from them concisely. For experience, list job titles, companies, and durations. For education, list degrees and institutions.
    4.  **USE PROVIDED DATA**: Use the provided data as the single source of truth.

    **Provided Structured Data:**
    - Name: ${name}
    - Headline: ${headline}
    - Location: ${location}
    - Profile URL: ${profileUrl}
    - Skills List: ${skills.join(", ")}
    - About Section HTML: ${aboutHtml ? aboutHtml.substring(0, 2000) : "N/A"}
    - Experience Section HTML: ${
      experienceHtml ? experienceHtml.substring(0, 4000) : "N/A"
    }
    - Education Section HTML: ${
      educationHtml ? educationHtml.substring(0, 2000) : "N/A"
    }

    **OUTPUT FORMAT (Strict JSON):**
    Return ONLY a single JSON object. Use \`null\` for any fields you cannot find.
    {
      "candidateName": "${name}",
      "email": "email if visible in the data or null",
      "mobile": "phone number if visible in the data or null",
      "currentJobTitle": "Current position title from the headline or experience, or null",
      "currentCompany": "Current company name from experience, or null",
      "location": "${location}",
      "headline": "${headline}",
      "summary": "A clean text summary of the 'About Section HTML' or null",
      "skills": ${JSON.stringify(skills)},
      "experience": "A concise text summary of the 'Experience Section HTML', listing roles, companies, and dates.",
      "education": "A concise text summary of the 'Education Section HTML', listing degrees and schools."
    }
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);
    if (!result || !result.candidateName) {
      console.log(`❌ AI failed to structure data for ${profileUrl}`);
      return null;
    }

    return {
      id: `${extractionMethod}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      ...result,
      sourceInfo: {
        platform: "linkedin",
        profileUrl: profileUrl,
        linkedinProfileUrl: profileUrl,
        extractionMethod: extractionMethod,
        hasEmail: !!result.email,
        hasPhone: !!result.mobile,
        sourcedAt: new Date(),
        aiModel: "gpt-4o",
      },
      matchScore: 0,
    };
  } catch (error) {
    console.error(
      `❌ Error in AI structuring for ${profileUrl}:`,
      error.message
    );
    return null;
  }
}

// Extract candidate from URL
async function extractCandidateFromUrl(url, platform) {
  try {
    console.log(`🔍 Extracting from: ${url}`);
    const { data } = await axios.get(url, {
      timeout: 25000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });

    const $ = load(data);
    $(
      "script, style, nav, footer, .sidebar, .ads, .advertisement, .cookie-banner, .popup, .modal, .overlay"
    ).remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (text.length < 300) {
      console.log(`❌ Insufficient content from ${url} (${text.length} chars)`);
      return null;
    }

    console.log(`📄 Extracted ${text.length} characters from ${url}`);
    const candidate = await extractCandidateWithAI(text, url, platform);

    if (candidate) {
      console.log(
        `✅ Successfully extracted candidate: ${candidate.candidateName}`
      );
    }

    return candidate;
  } catch (error) {
    console.error(`❌ Error extracting from ${url}:`, error.message);
    return null;
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
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 2500,
      temperature: 0.05,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);
    if (!result || !result.candidateName) {
      console.log(`❌ No valid candidate data extracted from ${url}`);
      return null;
    }

    return {
      id: `${platform}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
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
    };
  } catch (error) {
    console.error(`❌ Error extracting candidate from ${url}:`, error.message);
    return null;
  }
}

// 1. FIX: Proper candidate evaluation that preserves original data
async function evaluateCandidateMatch(
  candidate,
  jobDescription,
  searchSettings
) {
  if (!candidate?.candidateName) {
    console.log("⚠️ Skipping evaluation - missing candidate name");
    return {
      matchingScoreDetails: { overallMatch: 0 },
      analysis: { skills: { candidateSkills: [] } },
      recommendation: "Not Recommended",
      comment: "Insufficient candidate data",
      confidenceLevel: "Low",
    };
  }

  const prompt = `
You are a world-class senior technical recruiter. Score and analyze the candidate strictly against the role.

<job>
${JSON.stringify(
  {
    context: jobDescription?.context || "",
    requiredSkills:
      jobDescription?.requiredSkills || jobDescription?.topskills || [],
    location: searchSettings?.location || "",
    experienceLevel: searchSettings?.experienceLevel || "",
  },
  null,
  2
)}
</job>

<candidate>
${JSON.stringify(
  {
    name: candidate.candidateName,
    currentJobTitle: candidate.currentJobTitle,
    currentCompany: candidate.currentCompany,
    location: candidate.location,
    skills: candidate.skills || [],
    experience: candidate.experience || "",
    summary: candidate.summary || "",
    education: candidate.education || "",
  },
  null,
  2
)}
</candidate>

Return ONLY valid JSON with this exact shape:
{
  "matchingScoreDetails": {
    "skillsMatch": 0-100,
    "experienceMatch": 0-100,
    "educationMatch": 0-100,
    "overallMatch": 0-100
  },
  "analysis": {
    "skills": {
      "candidateSkills": ["..."],
      "matched": ["..."],
      "notMatched": ["..."],
      "transferableSkills": ["..."],
      "skillGaps": ["..."],
      "skillStrengths": ["..."]
    },
    "experience": {
      "relevantExperience": "...",
      "yearsOfExperience": "..."
    },
    "education": {
      "highestDegree": "...",
      "relevantCourses": ["..."],
      "certifications": ["..."]
    },
    "projects": ["..."],
    "recommendation": "...",
    "comments": "...",
    "additionalNotes": "..."
  },
  "comment": "...",
  "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
  "confidenceLevel": "High|Medium|Low"
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 1200,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const evaluation = JSON.parse(response.choices[0].message.content);

    // CRITICAL: Ensure all required fields exist
    return {
      matchingScoreDetails: {
        skillsMatch: evaluation.matchingScoreDetails?.skillsMatch || 0,
        experienceMatch: evaluation.matchingScoreDetails?.experienceMatch || 0,
        educationMatch: evaluation.matchingScoreDetails?.educationMatch || 0,
        overallMatch: evaluation.matchingScoreDetails?.overallMatch || 0,
      },
      analysis: {
        skills: {
          candidateSkills:
            evaluation.analysis?.skills?.candidateSkills ||
            candidate.skills ||
            [],
          matched: evaluation.analysis?.skills?.matched || [],
          notMatched: evaluation.analysis?.skills?.notMatched || [],
          transferableSkills:
            evaluation.analysis?.skills?.transferableSkills || [],
          skillGaps: evaluation.analysis?.skills?.skillGaps || [],
          skillStrengths: evaluation.analysis?.skills?.skillStrengths || [],
        },
        experience: {
          relevantExperience:
            evaluation.analysis?.experience?.relevantExperience ||
            candidate.experience ||
            "",
          yearsOfExperience:
            evaluation.analysis?.experience?.yearsOfExperience ||
            "Not specified",
        },
        education: {
          highestDegree:
            evaluation.analysis?.education?.highestDegree ||
            candidate.education ||
            "Not specified",
          relevantCourses:
            evaluation.analysis?.education?.relevantCourses || [],
          certifications: evaluation.analysis?.education?.certifications || [],
        },
        projects: evaluation.analysis?.projects || candidate.projects || [],
        recommendation:
          evaluation.analysis?.recommendation ||
          evaluation.recommendation ||
          "Not Recommended",
        comments: evaluation.analysis?.comments || evaluation.comment || "",
        additionalNotes: evaluation.analysis?.additionalNotes || "",
      },
      comment: evaluation.comment || "No evaluation comment provided",
      recommendation: evaluation.recommendation || "Not Recommended",
      confidenceLevel: evaluation.confidenceLevel || "Low",
    };
  } catch (error) {
    console.error(
      `❌ Error evaluating candidate ${candidate.candidateName}:`,
      error.message
    );
    return {
      matchingScoreDetails: { overallMatch: 0 },
      analysis: { skills: { candidateSkills: candidate.skills || [] } },
      recommendation: "Not Recommended",
      comment: "Evaluation failed due to system error",
      confidenceLevel: "Low",
    };
  }
}

// 5. FIX: Enhanced saveCandidatesToResumeDatabase with better data mapping
async function saveCandidatesToResumeDatabase(candidates, job, recruiterId) {
  try {
    console.log(
      `💾 Saving ${candidates.length} candidates to Resume database...`
    );

    const resumeDataArray = candidates.map((candidate) => {
      // CRITICAL: Ensure all required fields are properly mapped
      return {
        candidateName: candidate.candidateName || "Unknown Candidate",
        email: candidate.email || "",
        mobile: candidate.mobile || "",
        jobTitle: job._id, // This should be the job's ObjectId
        companyId: job.companyId,
        companyName: candidate.currentCompany || "",
        resumeLink: candidate.sourceInfo?.profileUrl || "",
        linkedinLink: candidate.sourceInfo?.linkedinProfileUrl || "",

        // Ensure matchingScoreDetails exists
        matchingScoreDetails: {
          skillsMatch: candidate.matchingScoreDetails?.skillsMatch || 0,
          experienceMatch: candidate.matchingScoreDetails?.experienceMatch || 0,
          educationMatch: candidate.matchingScoreDetails?.educationMatch || 0,
          overallMatch: candidate.matchingScoreDetails?.overallMatch || 0,
          culturalFitMatch:
            candidate.matchingScoreDetails?.culturalFitMatch || 0,
        },

        // Ensure analysis object exists
        analysis: {
          skills: {
            candidateSkills:
              candidate.skills || candidate.analysis?.skills?.matched || [],
            matched: candidate.analysis?.skills?.matched || [],
            notMatched: candidate.analysis?.skills?.notMatched || [],
            transferableSkills:
              candidate.analysis?.skills?.transferableSkills || [],
            skillGaps: candidate.analysis?.skills?.skillGaps || [],
            skillStrengths: candidate.analysis?.skills?.skillStrengths || [],
          },
          experience: {
            relevantExperience:
              candidate.analysis?.experience?.relevantExperience ||
              candidate.experience ||
              candidate.summary ||
              "",
            yearsOfExperience:
              candidate.analysis?.experience?.yearsOfExperience ||
              "Not specified",
            careerProgression:
              candidate.analysis?.experience?.careerProgression || "",
            industryExperience:
              candidate.analysis?.experience?.industryExperience || "",
            roleRelevance: candidate.analysis?.experience?.roleRelevance || "",
          },
          education: {
            highestDegree:
              candidate.analysis?.education?.highestDegree ||
              candidate.education ||
              "Not specified",
            relevantCourses:
              candidate.analysis?.education?.relevantCourses || [],
            certifications:
              candidate.analysis?.education?.certifications ||
              candidate.certifications ||
              [],
            continuousLearning:
              candidate.analysis?.education?.continuousLearning || "",
          },
          projects: candidate.analysis?.projects || candidate.projects || [],
          strengths: candidate.analysis?.strengths || [],
          concerns: candidate.analysis?.concerns || [],
          recommendation:
            candidate.analysis?.recommendation ||
            candidate.recommendation ||
            "",
          comments: candidate.analysis?.comments || candidate.comment || "",
          additionalNotes: candidate.analysis?.additionalNotes || "",
        },

        summary: candidate.summary || "",
        candidateStatus: "AI Sourced",
        aiSourced: true,
        sourceInfo: candidate.sourceInfo || {},
        created_at: new Date(),
      };
    });

    // Check for existing candidates to avoid duplicates
    const existingResumes = await Resume.find({
      jobTitle: job._id,
      companyId: job.companyId,
      candidateName: { $in: resumeDataArray.map((r) => r.candidateName) },
    });

    const existingNames = new Set(existingResumes.map((r) => r.candidateName));
    const newResumes = resumeDataArray.filter(
      (r) => !existingNames.has(r.candidateName)
    );

    if (newResumes.length > 0) {
      await Resume.insertMany(newResumes, { ordered: false });
      console.log(
        `✅ Successfully saved ${newResumes.length} new candidates to Resume database`
      );
    } else {
      console.log(
        `ℹ️ All candidates already exist in database, no new records saved`
      );
    }

    console.log(`📊 Database save summary:`);
    console.log(`   - Total candidates processed: ${candidates.length}`);
    console.log(`   - Existing candidates found: ${existingNames.size}`);
    console.log(`   - New candidates saved: ${newResumes.length}`);
  } catch (error) {
    console.error(
      `❌ Error saving candidates to Resume database:`,
      error.message
    );
    console.error("Error details:", error);
  }
}

// 3. FIX: Improved deduplication that preserves the best data
function deduplicateCandidates(candidates) {
  const uniqueMap = new Map();

  for (const candidate of candidates) {
    if (!candidate.candidateName && !candidate.email) {
      console.log("⚠️ Skipping candidate with no name or email");
      continue;
    }

    const keys = [];

    // Create multiple possible keys for matching
    if (candidate.email) {
      keys.push(`email_${candidate.email.toLowerCase()}`);
    }
    if (candidate.candidateName) {
      keys.push(
        `name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`
      );
    }
    if (candidate.sourceInfo?.linkedinProfileUrl) {
      keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`);
    }
    if (candidate.sourceInfo?.profileUrl) {
      keys.push(`profile_${candidate.sourceInfo.profileUrl}`);
    }

    // Check if we already have this candidate
    const existingKey = keys.find((key) => uniqueMap.has(key));

    if (!existingKey) {
      // New candidate - add all keys pointing to this candidate
      keys.forEach((key) => uniqueMap.set(key, candidate));
    } else {
      // Duplicate found - merge the data intelligently
      const existing = uniqueMap.get(existingKey);
      const merged = mergeCandidateInfo(existing, candidate);

      // Update all keys to point to the merged candidate
      keys.forEach((key) => uniqueMap.set(key, merged));
    }
  }

  return Array.from(new Set(uniqueMap.values()));
}

// 4. FIX: Improved merging that preserves the most complete data
function mergeCandidateInfo(existing, duplicate) {
  // Helper to choose the better value (longer, more complete)
  const chooseBetter = (val1, val2) => {
    if (!val1) return val2;
    if (!val2) return val1;
    if (typeof val1 === "string" && typeof val2 === "string") {
      return val1.length > val2.length ? val1 : val2;
    }
    return val1;
  };

  // Helper to merge arrays uniquely
  const mergeArrays = (arr1, arr2) => {
    const combined = [...(arr1 || []), ...(arr2 || [])];
    return Array.from(new Set(combined.filter(Boolean)));
  };

  return {
    // Use the most complete ID
    id: existing.id || duplicate.id || `merged_${Date.now()}`,

    // Merge primitive fields - choose the better value
    candidateName: chooseBetter(
      existing.candidateName,
      duplicate.candidateName
    ),
    email: chooseBetter(existing.email, duplicate.email),
    mobile: chooseBetter(existing.mobile, duplicate.mobile),
    currentJobTitle: chooseBetter(
      existing.currentJobTitle,
      duplicate.currentJobTitle
    ),
    currentCompany: chooseBetter(
      existing.currentCompany,
      duplicate.currentCompany
    ),
    location: chooseBetter(existing.location, duplicate.location),
    experience: chooseBetter(existing.experience, duplicate.experience),
    summary: chooseBetter(existing.summary, duplicate.summary),
    education: chooseBetter(existing.education, duplicate.education),

    // Merge arrays
    skills: mergeArrays(existing.skills, duplicate.skills),
    certifications: mergeArrays(
      existing.certifications,
      duplicate.certifications
    ),
    projects: mergeArrays(existing.projects, duplicate.projects),
    achievements: mergeArrays(existing.achievements, duplicate.achievements),

    // Preserve evaluation data (prefer existing if it has better scores)
    matchingScoreDetails:
      (existing.matchingScoreDetails?.overallMatch || 0) >
      (duplicate.matchingScoreDetails?.overallMatch || 0)
        ? existing.matchingScoreDetails
        : duplicate.matchingScoreDetails,

    analysis:
      (existing.analysis?.skills?.candidateSkills?.length || 0) >
      (duplicate.analysis?.skills?.candidateSkills?.length || 0)
        ? existing.analysis
        : duplicate.analysis,

    recommendation: existing.recommendation || duplicate.recommendation,
    comment: chooseBetter(existing.comment, duplicate.comment),
    confidenceLevel: existing.confidenceLevel || duplicate.confidenceLevel,

    // Merge source info
    sourceInfo: {
      ...duplicate.sourceInfo,
      ...existing.sourceInfo, // Existing takes precedence
    },

    // Preserve other fields
    jobTitle: existing.jobTitle || duplicate.jobTitle,
    companyId: existing.companyId || duplicate.companyId,
    candidateStatus:
      existing.candidateStatus || duplicate.candidateStatus || "AI Sourced",
    aiSourced: existing.aiSourced || duplicate.aiSourced || true,
  };
}

// Enhanced main search function
export const startHeadhunterSearch = async (req, res) => {
  try {
    const { jobId, searchSettings, recruiterId } = req.body;

    if (
      !jobId ||
      !searchSettings ||
      !recruiterId ||
      !searchSettings.platforms?.length
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    searchSettings.candidateCount = Math.min(
      searchSettings.candidateCount || 10,
      50
    );

    const job = await JobDescription.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    const companyId = job.companyId;
    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, error: "Company ID not found" });
    }

    const estimatedCost = estimateSearchCost(searchSettings.candidateCount);

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
    });

    await searchHistory.save();

    // Initialize search control
    searchControlMap.set(searchHistory._id.toString(), { shouldStop: false });

    res.status(200).json({
      success: true,
      message: "🚀 Enhanced AI headhunter search started!",
      searchId: searchHistory._id,
      estimatedCost: estimatedCost,
    });

    // Start the search process
    performEnhancedDynamicSearch(
      searchHistory._id,
      job,
      searchSettings,
      recruiterId
    );
  } catch (error) {
    console.error("❌ Error starting search:", error.message);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// CRITICAL FIX: Enhanced main search workflow with proper phase management
async function performEnhancedDynamicSearch(
  searchHistoryId,
  job,
  searchSettings,
  recruiterId
) {
  let totalTokensUsed = 0;
  let totalApiCalls = 0;
  let wasStopped = false;

  try {
    console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`);

    // Phase 1: Job Analysis
    await emitProgress(
      searchHistoryId,
      "🧠 Analyzing job requirements with AI intelligence...",
      5,
      "initializing",
      true
    );

    const jobAnalysis = await analyzeJobForPlatformsInternal(
      job,
      searchSettings
    );
    totalApiCalls += 1;
    totalTokensUsed += 1200;

    if (!jobAnalysis) {
      throw new Error("Failed to analyze job requirements");
    }

    console.log(
      `🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`
    );

    await emitProgress(
      searchHistoryId,
      `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Starting platform searches...`,
      10,
      "searching",
      true
    );

    // Check for stop before continuing
    if (shouldStopSearch(searchHistoryId)) {
      wasStopped = true;
      throw new Error("Search stopped by user request");
    }

    // Phase 2: Platform Searches
    await SearchHistory.findByIdAndUpdate(searchHistoryId, {
      "searchProgress.currentPhase": "searching",
    });

    const availablePlatforms = searchSettings.platforms;
    const recommendedPlatforms = jobAnalysis.recommendedPlatforms
      .filter((p) => availablePlatforms.includes(p.platform))
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

    console.log(
      "🎯 Optimized platforms:",
      recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`)
    );

    // Execute platform searches in parallel
    const platformPromises = recommendedPlatforms.map(async (platformInfo) => {
      if (shouldStopSearch(searchHistoryId)) {
        console.log(
          `🛑 Search stopped before platform ${platformInfo.platform}`
        );
        wasStopped = true;
        return;
      }

      const platform = platformInfo.platform;

      await emitProgress(
        searchHistoryId,
        `🔍 Generating search queries for ${platform}...`,
        15,
        "searching",
        true
      );

      const queries = await generateSearchQueries(
        job,
        platform,
        searchSettings,
        jobAnalysis
      );
      totalApiCalls += 1;
      totalTokensUsed += 1500;

      if (queries.length === 0) {
        console.log(`⚠️ No queries generated for ${platform}`);
        return;
      }

      await emitProgress(
        searchHistoryId,
        `🚀 Searching ${platform} with ${queries.length} optimized queries...`,
        20,
        "searching",
        true
      );

      let platformCandidates = [];
      try {
        switch (platform) {
          case "google":
            platformCandidates = await searchGoogle(
              queries,
              searchSettings,
              "",
              searchHistoryId
            );
            break;
          case "linkedin":
            platformCandidates = await searchLinkedIn(
              queries,
              searchSettings,
              searchHistoryId
            );
            break;
          case "github":
            platformCandidates = await searchGitHub(
              queries,
              searchSettings,
              searchHistoryId
            );
            break;
          case "dribbble":
            platformCandidates = await searchDribbble(
              queries,
              searchSettings,
              searchHistoryId
            );
            break;
          case "behance":
            platformCandidates = await searchBehance(
              queries,
              searchSettings,
              searchHistoryId
            );
            break;
        }
      } catch (platformError) {
        console.error(`❌ Error searching ${platform}:`, platformError.message);
        platformCandidates = [];
      }

      totalApiCalls += platformCandidates.length * 2;
      totalTokensUsed += platformCandidates.length * 2000;

      console.log(
        `📊 Platform ${platform} completed: ${platformCandidates.length} direct candidates`
      );
    });

    // Wait for all platform searches to complete
    await Promise.all(platformPromises);

    if (shouldStopSearch(searchHistoryId)) {
      console.log(`🛑 Search stopped after platform searches.`);
      wasStopped = true;
    }

    // Phase 3: Check if we need to wait for LinkedIn Extraction
    const searchAfterPlatforms = await SearchHistory.findById(searchHistoryId);

    // CRITICAL FIX: Check if 'linkedin' was a selected platform and if extraction is not yet complete.
    const linkedinWasSearched =
      searchAfterPlatforms.platforms.includes("linkedin");
    const isLinkedInComplete =
      searchAfterPlatforms.searchProgress.isLinkedinExtractionComplete;

    if (linkedinWasSearched && !isLinkedInComplete && !wasStopped) {
      console.log(
        `⏳ LinkedIn was part of the search. Waiting for browser extraction to complete...`
      );

      // The process will now pause here.
      // Finalization will be triggered later by checkLinkedInExtractionComplete().
      return;
    }

    // Phase 4: Finalize search (if LinkedIn was not a factor or is already complete)
    console.log(
      `🏁 All platform searches are complete. Starting final AI evaluation...`
    );
    await finalizeSearchWithExistingCandidates(searchHistoryId, wasStopped);
  } catch (error) {
    console.error("❌ Enhanced search error:", error.message);

    const partialCost = (totalTokensUsed * 0.0002) / 1000;
    const finalStatus = wasStopped ? "stopped" : "failed";

    await SearchHistory.findByIdAndUpdate(searchHistoryId, {
      status: finalStatus,
      cost: {
        estimatedCost: (
          await SearchHistory.findById(searchHistoryId)
        ).cost.estimatedCost,
        actualCost: partialCost,
        tokensUsed: totalTokensUsed,
        apiCalls: totalApiCalls,
      },
      "searchProgress.currentPhase": "completed",
    });

    const errorMessage = wasStopped
      ? "Search stopped by user request"
      : error.message;

    io.emit("searchError", {
      searchId: searchHistoryId,
      message: errorMessage,
      wasStopped,
    });

    // Create error notification
    const errorNotification = new Notification({
      message: wasStopped
        ? `🛑 Search stopped for ${job.context}. Partial results may be available.`
        : `❌ Search failed for ${job.context}. Error: ${error.message}`,
      recipientId: recruiterId,
      jobId: job._id,
    });
    await errorNotification.save();
    io.emit("newNotification", errorNotification);

    // Clean up
    searchControlMap.delete(searchHistoryId.toString());
    linkedinExtractionQueue.delete(searchHistoryId);
  }
}

// Platform search functions
async function searchLinkedIn(queries, searchSettings, searchId) {
  const apiKey = process.env.LINKEDIN_API_KEY;
  if (apiKey) {
    console.log("🔑 LinkedIn API key found. Using API search.");
    return await searchLinkedInWithApiKey(
      queries,
      searchSettings,
      searchId,
      apiKey
    );
  } else {
    console.log(
      "🔍 No LinkedIn API key. Using Google search for LinkedIn profiles."
    );
    return await searchGoogle(
      queries,
      searchSettings,
      "site:linkedin.com/in/",
      searchId
    );
  }
}

async function searchGitHub(queries, searchSettings, searchId) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("🔍 GitHub token not configured. Using Google search.");
    return await searchGoogle(
      queries,
      searchSettings,
      "site:github.com",
      searchId
    );
  }

  const candidates = new Map();
  let totalResults = 0;
  const maxResultsPerQuery = 15;
  const targetCandidates = Math.min(searchSettings.candidateCount * 3, 100);

  console.log(`🚀 Starting GitHub search with ${queries.length} queries`);

  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.github.status`]: "searching",
    [`platformProgress.github.completed`]: false,
  });

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    const query = queries[i];
    if (!query || query.trim() === "" || shouldStopSearch(searchId)) continue;

    try {
      console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`);

      const response = await axios.get("https://api.github.com/search/users", {
        headers: { Authorization: `token ${token}` },
        params: { q: query, per_page: maxResultsPerQuery },
      });

      if (response.data && Array.isArray(response.data.items)) {
        console.log(
          `📊 Found ${response.data.items.length} results for query: ${query}`
        );
        for (const item of response.data.items) {
          if (shouldStopSearch(searchId)) break;
          if (item.html_url && !candidates.has(item.html_url)) {
            const candidate = await extractCandidateFromUrl(
              item.html_url,
              "github"
            );
            if (candidate && candidate.candidateName) {
              candidates.set(item.html_url, candidate);
              totalResults++;
              await saveCandidateToBuffer(searchId, candidate, "github");
              console.log(
                `✅ Extracted & saved: ${candidate.candidateName} from github`
              );
            }
          }
        }
      } else {
        console.log(
          `⚠️ No items found in GitHub API response for query: ${query}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1500)); // Rate limiting
    } catch (error) {
      console.error(
        `❌ GitHub search error for query "${query}":`,
        error.message
      );
    }
  }

  await SearchHistory.findByIdAndUpdate(searchId, {
    [`platformProgress.github.status`]: "completed",
    [`platformProgress.github.completed`]: true,
    $inc: { "searchProgress.platformsCompleted": 1 },
  });

  console.log(
    `🎉 Search completed for github. Found ${candidates.size} direct candidates.`
  );
  return Array.from(candidates.values());
}

async function searchDribbble(queries, searchSettings, searchId) {
  return await searchGoogle(
    queries,
    searchSettings,
    "site:dribbble.com",
    searchId
  );
}

async function searchBehance(queries, searchSettings, searchId) {
  return await searchGoogle(
    queries,
    searchSettings,
    "site:behance.net",
    searchId
  );
}

// AI-powered job analysis
export const analyzeJobForPlatforms = async (req, res) => {
  try {
    const { jobDescription, searchSettings } = req.body;
    if (!jobDescription || !jobDescription.context) {
      return res.status(400).json({
        success: false,
        error: "Job description is required",
      });
    }
    const analysis = await analyzeJobForPlatformsInternal(
      jobDescription,
      searchSettings
    );
    if (!analysis) {
      return res.status(500).json({
        success: false,
        error: "Failed to analyze job",
      });
    }
    res.status(200).json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Error in job analysis route:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// AI-powered job analysis
async function analyzeJobForPlatformsInternal(job, searchSettings) {
  const prompt = `
    Analyze the following job description to extract key information for a candidate search.

    **Job Description:**
    - Title: ${job.context}
    - Top Skills: ${job.topskills?.join(", ") || "N/A"}
    - Description: ${job.description || "N/A"}

    **Search Settings:**
    - Experience Level: ${searchSettings.experienceLevel || "Any"}
    - Location: ${searchSettings.location || "Any"}

    **Your Task:**
    Return a JSON object with the following structure:
    {
      "jobCategory": "<e.g., Software Development, Design, Marketing>",
      "jobSubcategory": "<e.g., Frontend, UI/UX, SEO>",
      "primarySkills": ["<list of 3-5 most critical skills>"],
      "secondarySkills": ["<list of nice-to-have skills>"],
      "alternativeTitles": ["<list of 3-4 alternative job titles for this role>"],
      "searchKeywords": ["<list of 5-7 keywords for boolean search strings>"],
      "recommendedPlatforms": [
        { "platform": "linkedin", "priority": "high" },
        { "platform": "github", "priority": "<'high'|'medium'|'low'>" },
        { "platform": "google", "priority": "medium" },
        { "platform": "dribbble", "priority": "<'high'|'medium'|'low' based on role>" },
        { "platform": "behance", "priority": "<'high'|'medium'|'low' based on role>" }
      ]
    }

    **Instructions:**
    - Base the platform priority on the job type. For example, GitHub is high priority for developers, Dribbble/Behance for designers.
    - The keywords should be concise and effective for building search queries.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 1000,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    console.log("✅ AI Job Analysis complete:", analysis);
    return analysis;
  } catch (error) {
    console.error("❌ Error in AI Job Analysis:", error.message);
    // Fallback to a default analysis on error
    return {
      jobCategory: "Unknown",
      jobSubcategory: "Unknown",
      primarySkills: job.topskills || [],
      secondarySkills: [],
      alternativeTitles: [job.context],
      searchKeywords: job.topskills || [],
      recommendedPlatforms: [
        { platform: "linkedin", priority: "high" },
        { platform: "google", priority: "medium" },
      ],
    };
  }
}

// AI-powered search query generation

async function generateSearchQueries(
  jobDescription,
  platform,
  searchSettings,
  jobAnalysis
) {
  const prompt = `
    You are a world-class sourcing expert specializing in ${platform} recruitment. Generate exactly 5 broad, high-yield search queries to maximize candidate discovery, with location as a mandatory component in each query.

    **Job Information:**
    - Position: ${jobDescription.context}
    - Job Category: ${jobAnalysis?.jobCategory || "Professional"}
    - Job Subcategory: ${jobAnalysis?.jobSubcategory || ""}
    - Seniority: ${
      jobAnalysis?.seniorityLevel || searchSettings.experienceLevel
    }
    - Required Skills: ${
      jobDescription.requiredSkills?.join(", ") || "Not specified"
    }
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
    - Generate exactly 5 broad queries to maximize candidate matches.
    - Include the specified location in EVERY query to ensure location relevance.
    - Combine core skills, primary job titles, and location in each query.
    - Use Boolean operators (AND, OR, quotes) for broad reach.
    - Avoid overly specific queries; focus on high-volume candidate pools.
    - Include alternative job titles and skill synonyms where relevant.
    - Target active profiles with contact information where possible.

    **Query Categories (exactly 5 total):**
    - 2 Skill + Title + Location queries (core skills + primary/alternative titles + location)
    - 1 Location + Title query (primary title + location)
    - 1 Experience + Skill + Location query (seniority + key skills + location)
    - 1 General keyword-based + Location query (broad industry/role terms + location)

    **Quality Standards:**
    - Queries should be 10–30 words long.
    - Prioritize individual profiles over company pages.
    - Balance broad reach with relevance.
    - Location must be explicitly included in each query.

    Return ONLY a valid JSON object:
    {"queries": ["query1", "query2", "query3", "query4", "query5"]}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 600, // Reduced tokens for 5 queries
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const content = JSON.parse(response.choices[0].message.content);
    const queries = content.queries || [];
    console.log(`🔍 Generated ${queries.length} broad queries for ${platform}`);
    return queries.slice(0, 5); // Ensure exactly 5 queries
  } catch (error) {
    console.error("❌ Error generating search queries:", error.message);
    return [];
  }
}

function getPlatformInstructions(platform, jobAnalysis) {
  const category = jobAnalysis?.jobCategory?.toLowerCase() || "";
  const seniority = jobAnalysis?.seniorityLevel?.toLowerCase() || "";

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
      `;

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
      `;

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
      `;

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
      `;

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
      `;

    default:
      return `Create platform-appropriate professional search queries with advanced targeting techniques.`;
  }
}

// Placeholder for cost estimation
export const estimateSearchCost = (candidateCount) => {
  return {
    estimatedCost: 0.05 * candidateCount,
    model: "gpt-4o",
    features: [
      "AI Job Analysis",
      "Multi-platform Search",
      "Candidate Evaluation",
    ],
  };
};

// Placeholder for getting search history
export const getSearchHistory = async (req, res) => {
  try {
    const { recruiterId } = req.params;
    const searches = await SearchHistory.find({ recruiterId }).sort({
      createdAt: -1,
    });
    res.status(200).json({ success: true, searches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Placeholder for getting search results
export const getSearchResults = async (req, res) => {
  try {
    const { searchId } = req.params;
    const search = await SearchHistory.findById(searchId);
    if (!search) {
      return res
        .status(404)
        .json({ success: false, error: "Search not found" });
    }
    res.status(200).json({
      success: true,
      results: search.results,
      linkedinProfiles: search.linkedinProfiles,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Placeholder for deleting search history
export const deleteSearchHistoryItem = async (req, res) => {
  try {
    const { searchId } = req.params;
    await SearchHistory.findByIdAndDelete(searchId);
    res
      .status(200)
      .json({ success: true, message: "Search history item deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Placeholder for manual extraction notification
export const notifyManualExtraction = async (req, res) => {
  // This function might not be needed with the new robust sequential extraction
  res.status(200).json({ success: true, message: "Noted" });
};
export const getCostEstimate = async (req, res) => {
  try {
    const { candidateCount } = req.query;
    const estimate = estimateSearchCost(parseInt(candidateCount, 10) || 10);
    res.status(200).json({ success: true, estimate });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const handleLinkedInVerification = (socket) => {
  socket.on("linkedinVerificationCode", async (data) => {
    try {
      console.log(`📧 Verification code received: ${data.verificationId}`);

      // The verification handling is done in the Playwright automation
      // This is just for logging/monitoring
    } catch (error) {
      console.error("Error handling verification code:", error);

      socket.emit("linkedinVerificationResult", {
        verificationId: data.verificationId,
        success: false,
        message: "Server error processing verification code",
      });
    }
  });
};

// // Add this to your socket connection handler
// io.on("connection", (socket) => {
//   // ... existing socket handlers ...

//   handleLinkedInVerification(socket);

//   // ... rest of socket handlers ...
// });
// Replace the existing process handlers with this improved version
let isShuttingDown = false;

process.on("SIGINT", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Cleaning up LinkedIn automation...");
  try {
    await cleanupLinkedInAutomation();
  } catch (error) {
    console.error("Error during cleanup:", error.message);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Cleaning up LinkedIn automation...");
  try {
    await cleanupLinkedInAutomation();
  } catch (error) {
    console.error("Error during cleanup:", error.message);
  }
  process.exit(0);
});

// ----- last working code --------------------
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
// const searchControlMap = new Map();
// const linkedinExtractionQueue = new Map();
// const candidateBuffer = new Map(); // ✅ Buffer for all raw candidates

// // ENHANCED SCHEMA with proper progress tracking
// const searchHistorySchema = new mongoose.Schema({
//   recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
//   jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
//   jobTitle: String,
//   companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
//   platforms: [String],
//   searchSettings: Object,
//   candidatesFound: { type: Number, default: 0 }, // FIXED: Only final evaluated candidates
//   status: {
//     type: String,
//     enum: ["pending", "searching", "extracting", "evaluating", "completed", "failed", "stopped"],
//     default: "pending",
//   },

//   // CRITICAL FIX: Separate raw candidates from final results
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
//       sourceInfo: {
//         platform: String,
//         profileUrl: String,
//         linkedinProfileUrl: String,
//         extractionMethod: String,
//         sourcedAt: Date,
//         aiModel: String,
//         hasEmail: Boolean,
//         hasPhone: Boolean,
//       },
//       foundAt: { type: Date, default: Date.now },
//       platformSource: String,
//     },
//   ],

//   // FINAL evaluated candidates (what users actually see)
//   results: [
//     {
//       candidateName: String,
//       email: String,
//       mobile: mongoose.Schema.Types.Mixed,
//       jobTitle: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription" },
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
//         culturalFitMatch: Number,
//       },
//       analysis: {
//         skills: {
//           candidateSkills: [String],
//           matched: [String],
//           notMatched: [String],
//           transferableSkills: [String],
//           skillGaps: [String],
//           skillStrengths: [String],
//         },
//         experience: {
//           relevantExperience: String,
//           yearsOfExperience: String,
//           careerProgression: String,
//           industryExperience: String,
//           roleRelevance: String,
//         },
//         education: {
//           highestDegree: String,
//           relevantCourses: [String],
//           certifications: [String],
//           continuousLearning: String,
//         },
//         projects: [String],
//         strengths: [String],
//         concerns: [String],
//         recommendation: String,
//         comments: String,
//         additionalNotes: String,
//       },
//       comment: String,
//       recommendation: {
//         type: String,
//         enum: ["Highly Recommended", "Recommended", "Consider", "Not Recommended"],
//       },
//       confidenceLevel: String,
//       aiSourced: Boolean,
//       sourceInfo: {
//         platform: String,
//         profileUrl: String,
//         linkedinProfileUrl: String,
//         extractionMethod: String,
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

//   cost: {
//     estimatedCost: { type: Number, default: 0 },
//     actualCost: { type: Number, default: 0 },
//     tokensUsed: { type: Number, default: 0 },
//     apiCalls: { type: Number, default: 0 },
//   },

//   // CRITICAL FIX: Better progress tracking
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

// // CRITICAL FIX: Proper progress emission with accurate phases
// async function emitProgress(searchId, status, progress, phase = "searching", canStop = true, additionalData = {}) {
//   try {
//     const search = await SearchHistory.findById(searchId)
//     if (!search) return

//     // Calculate accurate progress based on phase
//     let accurateProgress = progress
//     const searchProgress = search.searchProgress

//     switch (phase) {
//       case "initializing":
//         accurateProgress = Math.min(progress, 10)
//         break
//       case "searching":
//         accurateProgress = 10 + Math.min(progress, 50) // 10-60%
//         break
//       case "linkedin_extraction":
//         accurateProgress = 60 + Math.min(progress, 20) // 60-80%
//         break
//       case "ai_evaluation":
//         accurateProgress = 80 + Math.min(progress, 15) // 80-95%
//         break
//       case "finalizing":
//         accurateProgress = 95 + Math.min(progress, 5) // 95-100%
//         break
//       case "completed":
//         accurateProgress = 100
//         break
//     }

//     const progressData = {
//       searchId,
//       status,
//       progress: Math.min(Math.max(accurateProgress, 0), 100),
//       phase,
//       timestamp: new Date().toISOString(),
//       canStop,

//       // CRITICAL: Accurate candidate counts based on phase
//       rawCandidatesFound: searchProgress.rawCandidatesFound,
//       linkedinProfilesFound: searchProgress.linkedinProfilesFound,
//       linkedinProfilesProcessed: searchProgress.linkedinProfilesProcessed,
//       candidatesEvaluated: searchProgress.candidatesEvaluated,
//       finalCandidatesSelected: searchProgress.finalCandidatesSelected,

//       // Phase-specific information
//       currentPhase: phase,
//       isLinkedinExtractionComplete: searchProgress.isLinkedinExtractionComplete,
//       isAiEvaluationComplete: searchProgress.isAiEvaluationComplete,

//       ...additionalData,
//     }

//     console.log(`📡 Progress [${searchId}]: ${accurateProgress.toFixed(1)}% - ${phase} - ${status}`)
//     console.log(
//       `   Raw: ${searchProgress.rawCandidatesFound}, LinkedIn: ${searchProgress.linkedinProfilesProcessed}/${searchProgress.linkedinProfilesFound}, Final: ${searchProgress.finalCandidatesSelected}`,
//     )

//     io.emit("searchProgress", progressData)
//   } catch (error) {
//     console.error("❌ Error emitting progress:", error.message)
//   }
// }

// // Check if search should be stopped
// function shouldStopSearch(searchId) {
//   const control = searchControlMap.get(searchId.toString())
//   return control?.shouldStop || false
// }
// // Save candidate temporarily – no emit, no finalize
// async function saveCandidateToBuffer(searchId, candidate, platform) {
//   try {
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
//     };

//     const search = await SearchHistory.findById(searchId);
//     if (!search) {
//       console.error(`❌ Search ${searchId} not found for saving candidate.`);
//       return;
//     }

//     // Avoid duplicates
//     const isDuplicate = (search.rawCandidates || []).some(raw =>
//       (raw.email && raw.email.toLowerCase() === (candidate.email || "").toLowerCase()) ||
//       (raw.sourceInfo?.linkedinProfileUrl && raw.sourceInfo.linkedinProfileUrl === candidate.sourceInfo?.linkedinProfileUrl) ||
//       (raw.sourceInfo?.profileUrl && raw.sourceInfo.profileUrl === candidate.sourceInfo?.profileUrl)
//     );
//     if (isDuplicate) return;

//     // Save candidate
//     const updated = await SearchHistory.findByIdAndUpdate(
//       searchId,
//       {
//         $push: { rawCandidates: candidateData },
//         $inc: { "searchProgress.rawCandidatesFound": 1 },
//         $set: {
//           [`platformProgress.${platform}.status`]: "active",
//         },
//       },
//       { new: true }
//     );

//     // Track platform stats
//     const totalForPlatform = (updated?.rawCandidates || []).filter(
//       c => c.platformSource === platform
//     ).length;

//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $set: {
//         [`platformProgress.${platform}.candidatesFound`]: totalForPlatform,
//       },
//     });

//   } catch (err) {
//     console.error("❌ Error saving candidate to buffer:", err.message);
//   }
// }

// // 5. FIXED: Stop search to process all found candidates
// export const stopSearch = async (req, res) => {
//   try {
//     const { searchId, recruiterId } = req.body;
//     if (!searchId || !recruiterId) {
//       return res.status(400).json({
//         success: false,
//         error: "Search ID and recruiter ID are required",
//       });
//     }

//     console.log(`🛑 Stop requested for search ${searchId} by recruiter ${recruiterId}`);

//     // Set stop flag
//     searchControlMap.set(searchId.toString(), { shouldStop: true, stoppedBy: recruiterId });

//     // Update search history
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       stoppedAt: new Date(),
//       stoppedBy: recruiterId,
//       status: "stopped",
//     });

//     // Clear any LinkedIn extraction timeout
//     const queueItem = linkedinExtractionQueue.get(searchId);
//     if (queueItem && queueItem.timeoutId) {
//       clearTimeout(queueItem.timeoutId);
//       console.log(`🧹 Cleared LinkedIn extraction timeout for stopped search ${searchId}`);
//     }

//     await emitProgress(searchId, "🛑 Stopping search... Processing all found candidates...", 95, "finalizing", false);

//     res.status(200).json({
//       success: true,
//       message: "Search stop requested. Processing all found candidates...",
//     });

//     // Emit stopping notification
//     io.emit("searchStopping", {
//       searchId,
//       message: "Search stopping... Processing all found candidates.",
//     });

//     // CRITICAL: Process all found candidates immediately
//     setTimeout(async () => {
//       await finalizeSearchWithExistingCandidates(searchId, true);
//     }, 1000); // Short delay to ensure stop flag is set

//   } catch (error) {
//     console.error("❌ Error stopping search:", error.message);
//     res.status(500).json({ success: false, error: "Internal server error" });
//   }
// };

// // 3. FIXED: Process LinkedIn DOM with better error handling
// export const processLinkedInDOM = async (req, res) => {
//   try {
//     const { searchId, profileData, success, error, extractionMethod } = req.body;
//     const finalUrl = profileData?.profileUrl || req.body.url || req.body.profileUrl;

//     console.log("🔄 Processing LinkedIn Data:", { searchId, finalUrl, success, extractionMethod });

//     // Handle data from visible tabs (no searchId)
//     if (!searchId) {
//       console.log(`🔥 Data received from visible tab without searchId: ${finalUrl}`);
//       return res.status(200).json({ success: true, message: "Data from visible tab received." });
//     }

//     if (!finalUrl) {
//       return res.status(400).json({ success: false, error: "Profile URL is required" });
//     }

//     const search = await SearchHistory.findById(searchId);
//     if (!search) {
//       return res.status(404).json({ success: false, error: "Search session not found" });
//     }

//     // CRITICAL FIX: Better profile tracking
//     let profileIndex = search.linkedinProfiles.findIndex(p => p.profileUrl === finalUrl);

//     if (profileIndex === -1) {
//       // Profile not found in database - this shouldn't happen but handle gracefully
//       console.warn(`⚠️ Profile ${finalUrl} not found in search ${searchId} LinkedIn profiles list`);

//       // Add it to prevent crashes, but don't increment total count
//       const newProfile = {
//         profileUrl: finalUrl,
//         candidateName: extractNameFromLinkedInUrl(finalUrl),
//         extractionStatus: 'pending',
//         lastAttempted: new Date(),
//         retryCount: 0,
//       };

//       await SearchHistory.findByIdAndUpdate(searchId, {
//         $push: { linkedinProfiles: newProfile }
//       });

//       profileIndex = search.linkedinProfiles.length; // Will be the new index
//       console.log(`➕ Added unexpected LinkedIn profile: ${finalUrl}`);
//     }

//     const profileInDb = search.linkedinProfiles[profileIndex];

//     // Skip if already processed
//     if (profileInDb && !['pending', 'processing'].includes(profileInDb.extractionStatus)) {
//       console.warn(`⚠️ Skipping already processed profile: ${finalUrl} (status: ${profileInDb.extractionStatus})`);
//       return res.status(200).json({ success: true, message: "Profile already processed." });
//     }

//     // Handle extraction failure
//     if (!success || !profileData) {
//       console.log(`❌ Extraction failed for: ${finalUrl}. Reason: ${error || 'Unknown'}`);
//       await updateLinkedInProfileStatus(searchId, finalUrl, "failed", extractNameFromLinkedInUrl(finalUrl));
//       await incrementLinkedInProcessed(searchId);
//       await checkLinkedInExtractionComplete(searchId);
//       return res.status(200).json({ success: true, message: "Failed extraction recorded" });
//     }

//     const candidateName = profileData.name || extractNameFromLinkedInUrl(finalUrl);
//     await updateLinkedInProfileStatus(searchId, finalUrl, "processing", candidateName);

//     // Check for duplicates in raw candidates
//     const isDuplicate = search.rawCandidates.some(
//       raw => (raw.sourceInfo?.linkedinProfileUrl === finalUrl) ||
//              (raw.candidateName && candidateName &&
//               raw.candidateName.toLowerCase() === candidateName.toLowerCase())
//     );

//     if (isDuplicate) {
//       console.log(`ℹ️ Duplicate candidate found, skipping AI processing: ${candidateName}`);
//       await updateLinkedInProfileStatus(searchId, finalUrl, "success", candidateName);
//       await incrementLinkedInProcessed(searchId);
//       await checkLinkedInExtractionComplete(searchId);
//       return res.status(200).json({ success: true, message: "Duplicate candidate skipped." });
//     }

//     // Show progress
//     const currentSearch = await SearchHistory.findById(searchId);
//     const processedCount = currentSearch.searchProgress.linkedinProfilesProcessed + 1;
//     const totalCount = currentSearch.searchProgress.linkedinProfilesFound;

//     await emitProgress(
//       searchId,
//       `🧠 AI processing: ${candidateName} (${processedCount}/${totalCount})`,
//       (processedCount / totalCount) * 100,
//       "linkedin_extraction",
//       true,
//       { currentCandidate: candidateName }
//     );

//     // Extract candidate with AI
//     const candidate = await extractCandidateFromStructuredData(profileData, extractionMethod);

//     if (candidate) {
//       console.log(`✅ Successfully extracted LinkedIn candidate: ${candidate.candidateName}`);
//       await saveCandidateToBuffer(searchId, candidate, "linkedin-structured");
//       await updateLinkedInProfileStatus(searchId, finalUrl, "success", candidate.candidateName);
//     } else {
//       console.log(`❌ AI failed to structure data for: ${finalUrl}`);
//       await updateLinkedInProfileStatus(searchId, finalUrl, "failed", candidateName);
//     }

//     // CRITICAL: Always increment processed count
//     await incrementLinkedInProcessed(searchId);
//     await checkLinkedInExtractionComplete(searchId);

//     res.status(200).json({
//       success: true,
//       message: "LinkedIn data processed",
//       candidateExtracted: !!candidate,
//     });
//   } catch (error) {
//     console.error("❌ Error processing LinkedIn data:", error.message);

//     // CRITICAL: Always increment on error to prevent hanging
//     if (req.body.searchId) {
//       await incrementLinkedInProcessed(req.body.searchId);
//       await checkLinkedInExtractionComplete(req.body.searchId);
//     }

//     res.status(500).json({ success: false, error: "Internal server error" });
//   }
// };

// // Helper function to increment LinkedIn processed count
// async function incrementLinkedInProcessed(searchId) {
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     $inc: { "searchProgress.linkedinProfilesProcessed": 1 },
//   })
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
//       { $set: updateData },
//     )
//   } catch (error) {
//     console.error("❌ Error updating LinkedIn profile status:", error.message)
//   }
// }

// async function checkLinkedInExtractionComplete(searchId) {
//   try {
//     const search = await SearchHistory.findById(searchId);
//     if (!search) return;

//     // Check if search was stopped
//     if (shouldStopSearch(searchId)) {
//       console.log(`🛑 Search ${searchId} was stopped. Finalizing immediately.`)
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         "searchProgress.isLinkedinExtractionComplete": true,
//       })
//       await finalizeSearchWithExistingCandidates(searchId, true)
//       return
//     }

//     const sp = search.searchProgress || {};
//     const totalLinkedIn = sp.linkedinProfilesFound || 0;
//     const processedLinkedIn = sp.linkedinProfilesProcessed || 0;
//     const expectLinkedIn = !!sp.expectLinkedInExtraction;

//     // If we never expected LinkedIn extraction, skip this check
//     if (!expectLinkedIn) {
//       console.log(`ℹ️ No LinkedIn extraction expected for search ${searchId}`);
//       return;
//     }

//     // SAFEGUARD: Prevent count overflow
//     if (processedLinkedIn > totalLinkedIn) {
//       console.error(`🚨 CRITICAL ERROR: Processed count (${processedLinkedIn}) exceeds total count (${totalLinkedIn}) for search ${searchId}`);
//       // Fix the count
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         "searchProgress.linkedinProfilesProcessed": totalLinkedIn,
//       });
//       console.log(`🔧 Fixed processed count to match total: ${totalLinkedIn}`);
//       processedLinkedIn = totalLinkedIn; // Update local variable
//     }

//     console.log(`📊 LinkedIn extraction check: ${processedLinkedIn}/${totalLinkedIn} processed`)

//     // FIXED: Check completion condition
//     const isComplete = totalLinkedIn > 0 && processedLinkedIn >= totalLinkedIn;

//     if (isComplete) {
//       console.log(`🎉 All LinkedIn profiles processed for search ${searchId}`)

//       // Mark LinkedIn extraction as complete
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         "searchProgress.isLinkedinExtractionComplete": true,
//         "searchProgress.currentPhase": "ai_evaluation",
//         [`platformProgress.linkedin.status`]: "completed",
//         [`platformProgress.linkedin.completed`]: true,
//       })

//       // Clear timeout if exists
//       const queueItem = linkedinExtractionQueue.get(searchId)
//       if (queueItem && queueItem.timeoutId) {
//         clearTimeout(queueItem.timeoutId)
//         console.log(`🧹 Cleared LinkedIn extraction timeout for search ${searchId}`);
//       }

//       await emitProgress(
//         searchId,
//         "✅ LinkedIn extraction complete. Starting AI evaluation...",
//         100,
//         "linkedin_extraction",
//         false,
//       )

//       // Start AI evaluation phase
//       await finalizeSearchWithExistingCandidates(searchId, false)
//     } else {
//       // Update progress
//       const progressPercent = totalLinkedIn > 0 ? (processedLinkedIn / totalLinkedIn) * 100 : 0
//       await emitProgress(
//         searchId,
//         `LinkedIn extraction: ${processedLinkedIn}/${totalLinkedIn} profiles processed`,
//         progressPercent,
//         "linkedin_extraction",
//         true,
//       )
//     }
//   } catch (error) {
//     console.error("❌ Error checking LinkedIn extraction completion:", error.message)
//   }
// }

// // 2. FIX: Proper finalization that preserves all candidate data
// async function finalizeSearchWithExistingCandidates(searchId, wasStopped = false) {
//   try {
//     const search = await SearchHistory.findById(searchId);
//     if (!search) {
//       console.error(`❌ Search ${searchId} not found for finalization`);
//       return;
//     }

//     // Prevent multiple finalizations
//     if (["completed", "stopped", "evaluating"].includes(search.status)) {
//       console.log(`ℹ️ Search ${searchId} already finalized with status: ${search.status}`);
//       return;
//     }

//     console.log(`🔄 Starting finalization for search ${searchId} (stopped: ${wasStopped})`);

//     // Get all candidates from BOTH buffer and database
//     const buffered = candidateBuffer.get(searchId) || [];
//     const fromDb = search.rawCandidates || [];
//     const allCandidates = [...fromDb, ...buffered];

//     console.log(`📊 Finalization stats: DB=${fromDb.length}, Buffer=${buffered.length}, Total=${allCandidates.length}`);

//     if (!allCandidates.length) {
//       await SearchHistory.findByIdAndUpdate(searchId, {
//         results: [],
//         candidatesFound: 0,
//         status: wasStopped ? "stopped" : "completed",
//         completedAt: new Date(),
//         "searchProgress.currentPhase": "completed",
//         "searchProgress.isAiEvaluationComplete": true,
//       });

//       io.emit("searchComplete", { searchId, candidates: [], wasStopped });
//       candidateBuffer.delete(searchId);
//       searchControlMap.delete(searchId.toString());
//       return;
//     }

//     // Update status to prevent race conditions
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       status: "evaluating",
//       "searchProgress.currentPhase": "ai_evaluation",
//     });

//     const job = await JobDescription.findById(search.jobId);
//     if (!job) {
//       console.error(`❌ Job ${search.jobId} not found for search ${searchId}`);
//       return;
//     }

//     // Deduplicate candidates first
//     const uniqueCandidates = deduplicateCandidates(allCandidates);
//     console.log(`🎯 After deduplication: ${uniqueCandidates.length} unique candidates`);

//     const evaluated = [];
//     for (let i = 0; i < uniqueCandidates.length; i++) {
//       const candidate = uniqueCandidates[i];

//       if (i % 3 === 0 || i === uniqueCandidates.length - 1) {
//         const progressPercent = (i / uniqueCandidates.length) * 100;
//         await emitProgress(
//           searchId,
//           `🧠 AI evaluating: ${candidate.candidateName || "Unknown"} (${i + 1}/${uniqueCandidates.length})`,
//           progressPercent,
//           "ai_evaluation",
//           false,
//           { currentCandidate: candidate.candidateName }
//         );
//       }

//       try {
//         const evaluation = await evaluateCandidateMatch(candidate, job, search.searchSettings);

//         // CRITICAL FIX: Preserve ALL original candidate data + add evaluation
//         const evaluatedCandidate = {
//           // Preserve original candidate data
//           id: candidate.id || `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//           candidateName: candidate.candidateName,
//           email: candidate.email,
//           mobile: candidate.mobile,
//           currentJobTitle: candidate.currentJobTitle,
//           currentCompany: candidate.currentCompany,
//           location: candidate.location,
//           skills: candidate.skills || [],
//           experience: candidate.experience,
//           summary: candidate.summary,
//           education: candidate.education,
//           certifications: candidate.certifications || [],
//           projects: candidate.projects || [],
//           achievements: candidate.achievements || [],

//           // Add required schema fields
//           jobTitle: job._id,
//           companyId: job.companyId,
//           candidateStatus: "AI Sourced",
//           aiSourced: true,

//           // Add evaluation results
//           matchingScoreDetails: evaluation.matchingScoreDetails,
//           analysis: evaluation.analysis,
//           comment: evaluation.comment,
//           recommendation: evaluation.recommendation,
//           confidenceLevel: evaluation.confidenceLevel,

//           // Preserve source info
//           sourceInfo: candidate.sourceInfo || {},
//         };

//         evaluated.push(evaluatedCandidate);
//       } catch (evalError) {
//         console.error(`❌ Error evaluating ${candidate.candidateName}:`, evalError.message);

//         // CRITICAL: Even on error, preserve the candidate data
//         evaluated.push({
//           ...candidate,
//           id: candidate.id || `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//           jobTitle: job._id,
//           companyId: job.companyId,
//           candidateStatus: "AI Sourced",
//           aiSourced: true,
//           matchingScoreDetails: { overallMatch: 0 },
//           analysis: { skills: { candidateSkills: candidate.skills || [] } },
//           recommendation: "Not Recommended",
//           comment: "Evaluation failed",
//           confidenceLevel: "Low",
//           sourceInfo: candidate.sourceInfo || {},
//         });
//       }
//     }

//     // Sort by overall match score
//     const ranked = evaluated.sort(
//       (a, b) => (b.matchingScoreDetails?.overallMatch || 0) - (a.matchingScoreDetails?.overallMatch || 0)
//     );

//     const limit = search.searchSettings?.candidateCount || 10;
//     const finalCandidates = ranked.slice(0, limit);

//     console.log(`🎯 Final selection: ${finalCandidates.length} candidates (target: ${limit})`);

//     // Save results to SearchHistory
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       results: finalCandidates,
//       candidatesFound: finalCandidates.length,
//       status: wasStopped ? "stopped" : "completed",
//       completedAt: new Date(),
//       "searchProgress.currentPhase": "completed",
//       "searchProgress.isAiEvaluationComplete": true,
//       "searchProgress.finalCandidatesSelected": finalCandidates.length,
//     });

//     // Save to Resume database
//     await saveCandidatesToResumeDatabase(finalCandidates, job, search.recruiterId);

//     const completionMessage = wasStopped
//       ? `🛑 Search stopped! Found ${finalCandidates.length} qualified candidates.`
//       : `🎉 Search completed! Found ${finalCandidates.length} qualified candidates.`;

//     await emitProgress(searchId, completionMessage, 100, "completed", false);

//     // CRITICAL: Emit the SAME data that was saved to database
//     io.emit("searchComplete", {
//       searchId,
//       candidates: finalCandidates, // This should match what's in the database
//       job,
//       wasStopped,
//       summary: {
//         total: allCandidates.length,
//         final: finalCandidates.length,
//         message: `Found ${finalCandidates.length} qualified candidates from ${allCandidates.length} profiles`,
//       },
//     });

//     // Cleanup
//     candidateBuffer.delete(searchId);
//     searchControlMap.delete(searchId.toString());
//     linkedinExtractionQueue.delete(searchId);

//     console.log(`✅ Search ${searchId} finalization completed successfully`);
//   } catch (error) {
//     console.error("❌ Error in finalizeSearchWithExistingCandidates:", error.message);
//     // Emergency cleanup and error handling...
//   }
// }

// // CRITICAL FIX: Enhanced Google search with proper progress tracking
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

//   console.log(`🔍 Starting Google search for ${platform} with ${queries.length} queries`)

//   // Mark platform as active
//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.${platform}.status`]: "searching",
//     [`platformProgress.${platform}.completed`]: false,
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

//       // CRITICAL: Proper progress update for searching phase
//       const progressPercent = (i / queries.length) * 100
//       await emitProgress(
//         searchId,
//         `Searching ${platform}: "${query.substring(0, 30)}..."`,
//         progressPercent,
//         "searching",
//         true,
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

//               // Save candidate immediately
//               await saveCandidateToBuffer(searchId, candidate, platform)
//               console.log(`✅ Extracted & saved: ${candidate.candidateName} from ${platform}`)
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
//     $inc: { "searchProgress.platformsCompleted": 1 },
//   })

//   // Handle LinkedIn URLs if found
//   if (linkedinUrls.size > 0 && platform === "linkedin") {
//     console.log(`🔗 Found ${linkedinUrls.size} LinkedIn URLs. Sending to browser for extraction...`)
//     await handleLinkedInUrls(searchId, Array.from(linkedinUrls))
//   }

//   console.log(`🎉 Search completed for ${platform}. Found ${candidates.size} direct candidates.`)
//   return Array.from(candidates.values())
// }

// // 1. FIXED: LinkedIn URL handling with proper count management
// async function handleLinkedInUrls(searchId, linkedinUrls) {
//   try {
//     // Limit to top 10 LinkedIn URLs as mentioned
//     const topUrls = linkedinUrls.slice(0, 10)
//     console.log(`🔤 Sending ${topUrls.length} LinkedIn URLs to frontend for browser extraction`)

//     // Store LinkedIn URLs in search history for tracking
//     const linkedinProfiles = topUrls.map((url) => ({
//       profileUrl: url,
//       candidateName: extractNameFromLinkedInUrl(url),
//       extractionStatus: "pending",
//       lastAttempted: new Date(),
//       retryCount: 0,
//     }))

//     // CRITICAL FIX: Set the total count correctly and mark that LinkedIn extraction is expected
//     await SearchHistory.findByIdAndUpdate(searchId, {
//       $push: { linkedinProfiles: { $each: linkedinProfiles } },
//       status: "extracting",
//       "searchProgress.currentPhase": "linkedin_extraction",
//       "searchProgress.linkedinProfilesFound": topUrls.length, // FIXED: Set exact count
//       "searchProgress.linkedinProfilesProcessed": 0, // Reset to 0
//       "searchProgress.isLinkedinExtractionComplete": false,
//       "searchProgress.expectLinkedInExtraction": true, // CRITICAL: Flag that we expect LinkedIn
//     })

//     // Emit LinkedIn URLs to frontend for browser extraction
//     io.emit("linkedinUrlsForExtraction", {
//       searchId: searchId,
//       urls: topUrls,
//       message: `Found ${topUrls.length} LinkedIn profiles. Starting browser extraction...`,
//     })

//     await emitProgress(
//       searchId,
//       `🔤 LinkedIn extraction starting: 0/${topUrls.length} profiles`,
//       0,
//       "linkedin_extraction",
//       true,
//     )

//     // FIXED: Set timeout with better error handling
//     const timeoutId = setTimeout(
//       async () => {
//         console.log(`⏰ LinkedIn extraction timeout for search ${searchId}. Processing with current results.`);

//         const search = await SearchHistory.findById(searchId);
//         if (search && !search.searchProgress.isLinkedinExtractionComplete) {
//           const pendingCount = search.linkedinProfiles.filter(p => p.extractionStatus === 'pending').length;

//           if (pendingCount > 0) {
//             console.log(`⚠️ Timing out ${pendingCount} pending LinkedIn profiles`);

//             // Mark remaining as failed and update processed count
//             await SearchHistory.updateOne(
//               { _id: searchId },
//               {
//                 $set: { "linkedinProfiles.$[elem].extractionStatus": "failed" },
//                 $inc: { "searchProgress.linkedinProfilesProcessed": pendingCount }
//               },
//               { arrayFilters: [{ "elem.extractionStatus": "pending" }] }
//             );
//           }

//           // Force completion
//           await SearchHistory.findByIdAndUpdate(searchId, {
//             "searchProgress.isLinkedinExtractionComplete": true,
//           });

//           // Continue with finalization
//           await finalizeSearchWithExistingCandidates(searchId, false);
//         }
//       },
//       10 * 60 * 1000, // 10 minutes timeout (reduced from 15)
//     )

//     // Store timeout reference
//     linkedinExtractionQueue.set(searchId, {
//       urls: topUrls,
//       processed: [],
//       failed: [],
//       startTime: new Date(),
//       status: "active",
//       timeoutId: timeoutId,
//       expectedCount: topUrls.length, // CRITICAL: Store expected count
//     })
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

// // New function to process structured data from the content script
// async function extractCandidateFromStructuredData(profileData, extractionMethod) {
//   const { name, headline, location, aboutHtml, experienceHtml, educationHtml, skills, profileUrl } = profileData;

//   const prompt = `
//     You are a meticulous data extraction expert. Your task is to synthesize professional information from the provided structured data, which was scraped from a LinkedIn profile.

//     **CRITICAL RULES:**
//     1.  **NO FABRICATION**: Do not invent information not present in the provided data.
//     2.  **NULL FOR MISSING DATA**: Use \`null\` for any information you cannot find.
//     3.  **SUMMARIZE HTML**: 'experienceHtml' and 'educationHtml' are raw HTML. Summarize the key information from them concisely. For experience, list job titles, companies, and durations. For education, list degrees and institutions.
//     4.  **USE PROVIDED DATA**: Use the provided data as the single source of truth.

//     **Provided Structured Data:**
//     - Name: ${name}
//     - Headline: ${headline}
//     - Location: ${location}
//     - Profile URL: ${profileUrl}
//     - Skills List: ${skills.join(', ')}
//     - About Section HTML: ${aboutHtml ? aboutHtml.substring(0, 2000) : 'N/A'}
//     - Experience Section HTML: ${experienceHtml ? experienceHtml.substring(0, 4000) : 'N/A'}
//     - Education Section HTML: ${educationHtml ? educationHtml.substring(0, 2000) : 'N/A'}

//     **OUTPUT FORMAT (Strict JSON):**
//     Return ONLY a single JSON object. Use \`null\` for any fields you cannot find.
//     {
//       "candidateName": "${name}",
//       "email": "email if visible in the data or null",
//       "mobile": "phone number if visible in the data or null",
//       "currentJobTitle": "Current position title from the headline or experience, or null",
//       "currentCompany": "Current company name from experience, or null",
//       "location": "${location}",
//       "headline": "${headline}",
//       "summary": "A clean text summary of the 'About Section HTML' or null",
//       "skills": ${JSON.stringify(skills)},
//       "experience": "A concise text summary of the 'Experience Section HTML', listing roles, companies, and dates.",
//       "education": "A concise text summary of the 'Education Section HTML', listing degrees and schools."
//     }
//   `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 2000,
//       temperature: 0.3,
//       response_format: { type: "json_object" },
//     });

//     const result = JSON.parse(response.choices[0].message.content);
//     if (!result || !result.candidateName) {
//       console.log(`❌ AI failed to structure data for ${profileUrl}`);
//       return null;
//     }

//     return {
//       id: `${extractionMethod}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       ...result,
//       sourceInfo: {
//         platform: "linkedin",
//         profileUrl: profileUrl,
//         linkedinProfileUrl: profileUrl,
//         extractionMethod: extractionMethod,
//         hasEmail: !!result.email,
//         hasPhone: !!result.mobile,
//         sourcedAt: new Date(),
//         aiModel: "gpt-4o",
//       },
//       matchScore: 0,
//     };
//   } catch (error) {
//     console.error(`❌ Error in AI structuring for ${profileUrl}:`, error.message);
//     return null;
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

// // Enhanced candidate extraction with AI
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

// // 1. FIX: Proper candidate evaluation that preserves original data
// async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
//   if (!candidate?.candidateName) {
//     console.log("⚠️ Skipping evaluation - missing candidate name");
//     return {
//       matchingScoreDetails: { overallMatch: 0 },
//       analysis: { skills: { candidateSkills: [] } },
//       recommendation: "Not Recommended",
//       comment: "Insufficient candidate data",
//       confidenceLevel: "Low"
//     };
//   }

//   const prompt = `
// You are a world-class senior technical recruiter. Score and analyze the candidate strictly against the role.

// <job>
// ${JSON.stringify({
//   context: jobDescription?.context || "",
//   requiredSkills: jobDescription?.requiredSkills || jobDescription?.topskills || [],
//   location: searchSettings?.location || "",
//   experienceLevel: searchSettings?.experienceLevel || "",
// }, null, 2)}
// </job>

// <candidate>
// ${JSON.stringify({
//   name: candidate.candidateName,
//   currentJobTitle: candidate.currentJobTitle,
//   currentCompany: candidate.currentCompany,
//   location: candidate.location,
//   skills: candidate.skills || [],
//   experience: candidate.experience || "",
//   summary: candidate.summary || "",
//   education: candidate.education || "",
// }, null, 2)}
// </candidate>

// Return ONLY valid JSON with this exact shape:
// {
//   "matchingScoreDetails": {
//     "skillsMatch": 0-100,
//     "experienceMatch": 0-100,
//     "educationMatch": 0-100,
//     "overallMatch": 0-100
//   },
//   "analysis": {
//     "skills": {
//       "candidateSkills": ["..."],
//       "matched": ["..."],
//       "notMatched": ["..."],
//       "transferableSkills": ["..."],
//       "skillGaps": ["..."],
//       "skillStrengths": ["..."]
//     },
//     "experience": {
//       "relevantExperience": "...",
//       "yearsOfExperience": "..."
//     },
//     "education": {
//       "highestDegree": "...",
//       "relevantCourses": ["..."],
//       "certifications": ["..."]
//     },
//     "projects": ["..."],
//     "recommendation": "...",
//     "comments": "...",
//     "additionalNotes": "..."
//   },
//   "comment": "...",
//   "recommendation": "Highly Recommended|Recommended|Consider|Not Recommended",
//   "confidenceLevel": "High|Medium|Low"
// }
// `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1200,
//       temperature: 0.1,
//       response_format: { type: "json_object" },
//     });

//     const evaluation = JSON.parse(response.choices[0].message.content);

//     // CRITICAL: Ensure all required fields exist
//     return {
//       matchingScoreDetails: {
//         skillsMatch: evaluation.matchingScoreDetails?.skillsMatch || 0,
//         experienceMatch: evaluation.matchingScoreDetails?.experienceMatch || 0,
//         educationMatch: evaluation.matchingScoreDetails?.educationMatch || 0,
//         overallMatch: evaluation.matchingScoreDetails?.overallMatch || 0,
//       },
//       analysis: {
//         skills: {
//           candidateSkills: evaluation.analysis?.skills?.candidateSkills || candidate.skills || [],
//           matched: evaluation.analysis?.skills?.matched || [],
//           notMatched: evaluation.analysis?.skills?.notMatched || [],
//           transferableSkills: evaluation.analysis?.skills?.transferableSkills || [],
//           skillGaps: evaluation.analysis?.skills?.skillGaps || [],
//           skillStrengths: evaluation.analysis?.skills?.skillStrengths || [],
//         },
//         experience: {
//           relevantExperience: evaluation.analysis?.experience?.relevantExperience || candidate.experience || "",
//           yearsOfExperience: evaluation.analysis?.experience?.yearsOfExperience || "Not specified",
//         },
//         education: {
//           highestDegree: evaluation.analysis?.education?.highestDegree || candidate.education || "Not specified",
//           relevantCourses: evaluation.analysis?.education?.relevantCourses || [],
//           certifications: evaluation.analysis?.education?.certifications || [],
//         },
//         projects: evaluation.analysis?.projects || candidate.projects || [],
//         recommendation: evaluation.analysis?.recommendation || evaluation.recommendation || "Not Recommended",
//         comments: evaluation.analysis?.comments || evaluation.comment || "",
//         additionalNotes: evaluation.analysis?.additionalNotes || "",
//       },
//       comment: evaluation.comment || "No evaluation comment provided",
//       recommendation: evaluation.recommendation || "Not Recommended",
//       confidenceLevel: evaluation.confidenceLevel || "Low",
//     };
//   } catch (error) {
//     console.error(`❌ Error evaluating candidate ${candidate.candidateName}:`, error.message);
//     return {
//       matchingScoreDetails: { overallMatch: 0 },
//       analysis: { skills: { candidateSkills: candidate.skills || [] } },
//       recommendation: "Not Recommended",
//       comment: "Evaluation failed due to system error",
//       confidenceLevel: "Low"
//     };
//   }
// }

// // 5. FIX: Enhanced saveCandidatesToResumeDatabase with better data mapping
// async function saveCandidatesToResumeDatabase(candidates, job, recruiterId) {
//   try {
//     console.log(`💾 Saving ${candidates.length} candidates to Resume database...`);

//     const resumeDataArray = candidates.map((candidate) => {
//       // CRITICAL: Ensure all required fields are properly mapped
//       return {
//         candidateName: candidate.candidateName || "Unknown Candidate",
//         email: candidate.email || "",
//         mobile: candidate.mobile || "",
//         jobTitle: job._id, // This should be the job's ObjectId
//         companyId: job.companyId,
//         companyName: candidate.currentCompany || "",
//         resumeLink: candidate.sourceInfo?.profileUrl || "",
//         linkedinLink: candidate.sourceInfo?.linkedinProfileUrl || "",

//         // Ensure matchingScoreDetails exists
//         matchingScoreDetails: {
//           skillsMatch: candidate.matchingScoreDetails?.skillsMatch || 0,
//           experienceMatch: candidate.matchingScoreDetails?.experienceMatch || 0,
//           educationMatch: candidate.matchingScoreDetails?.educationMatch || 0,
//           overallMatch: candidate.matchingScoreDetails?.overallMatch || 0,
//           culturalFitMatch: candidate.matchingScoreDetails?.culturalFitMatch || 0,
//         },

//         // Ensure analysis object exists
//         analysis: {
//           skills: {
//             candidateSkills: candidate.skills || candidate.analysis?.skills?.matched || [],
//             matched: candidate.analysis?.skills?.matched || [],
//             notMatched: candidate.analysis?.skills?.notMatched || [],
//             transferableSkills: candidate.analysis?.skills?.transferableSkills || [],
//             skillGaps: candidate.analysis?.skills?.skillGaps || [],
//             skillStrengths: candidate.analysis?.skills?.skillStrengths || [],
//           },
//           experience: {
//             relevantExperience: candidate.analysis?.experience?.relevantExperience || candidate.experience || candidate.summary || "",
//             yearsOfExperience: candidate.analysis?.experience?.yearsOfExperience || "Not specified",
//             careerProgression: candidate.analysis?.experience?.careerProgression || "",
//             industryExperience: candidate.analysis?.experience?.industryExperience || "",
//             roleRelevance: candidate.analysis?.experience?.roleRelevance || "",
//           },
//           education: {
//             highestDegree: candidate.analysis?.education?.highestDegree || candidate.education || "Not specified",
//             relevantCourses: candidate.analysis?.education?.relevantCourses || [],
//             certifications: candidate.analysis?.education?.certifications || candidate.certifications || [],
//             continuousLearning: candidate.analysis?.education?.continuousLearning || "",
//           },
//           projects: candidate.analysis?.projects || candidate.projects || [],
//           strengths: candidate.analysis?.strengths || [],
//           concerns: candidate.analysis?.concerns || [],
//           recommendation: candidate.analysis?.recommendation || candidate.recommendation || "",
//           comments: candidate.analysis?.comments || candidate.comment || "",
//           additionalNotes: candidate.analysis?.additionalNotes || "",
//         },

//         summary: candidate.summary || "",
//         candidateStatus: "AI Sourced",
//         aiSourced: true,
//         sourceInfo: candidate.sourceInfo || {},
//         created_at: new Date(),
//       };
//     });

//     // Check for existing candidates to avoid duplicates
//     const existingResumes = await Resume.find({
//       jobTitle: job._id,
//       companyId: job.companyId,
//       candidateName: { $in: resumeDataArray.map((r) => r.candidateName) },
//     });

//     const existingNames = new Set(existingResumes.map((r) => r.candidateName));
//     const newResumes = resumeDataArray.filter((r) => !existingNames.has(r.candidateName));

//     if (newResumes.length > 0) {
//       await Resume.insertMany(newResumes, { ordered: false });
//       console.log(`✅ Successfully saved ${newResumes.length} new candidates to Resume database`);
//     } else {
//       console.log(`ℹ️ All candidates already exist in database, no new records saved`);
//     }

//     console.log(`📊 Database save summary:`);
//     console.log(`   - Total candidates processed: ${candidates.length}`);
//     console.log(`   - Existing candidates found: ${existingNames.size}`);
//     console.log(`   - New candidates saved: ${newResumes.length}`);
//   } catch (error) {
//     console.error(`❌ Error saving candidates to Resume database:`, error.message);
//     console.error("Error details:", error);
//   }
// }

// // 3. FIX: Improved deduplication that preserves the best data
// function deduplicateCandidates(candidates) {
//   const uniqueMap = new Map();

//   for (const candidate of candidates) {
//     if (!candidate.candidateName && !candidate.email) {
//       console.log("⚠️ Skipping candidate with no name or email");
//       continue;
//     }

//     const keys = [];

//     // Create multiple possible keys for matching
//     if (candidate.email) {
//       keys.push(`email_${candidate.email.toLowerCase()}`);
//     }
//     if (candidate.candidateName) {
//       keys.push(`name_${candidate.candidateName.toLowerCase().replace(/\s+/g, "_")}`);
//     }
//     if (candidate.sourceInfo?.linkedinProfileUrl) {
//       keys.push(`linkedin_${candidate.sourceInfo.linkedinProfileUrl}`);
//     }
//     if (candidate.sourceInfo?.profileUrl) {
//       keys.push(`profile_${candidate.sourceInfo.profileUrl}`);
//     }

//     // Check if we already have this candidate
//     const existingKey = keys.find((key) => uniqueMap.has(key));

//     if (!existingKey) {
//       // New candidate - add all keys pointing to this candidate
//       keys.forEach((key) => uniqueMap.set(key, candidate));
//     } else {
//       // Duplicate found - merge the data intelligently
//       const existing = uniqueMap.get(existingKey);
//       const merged = mergeCandidateInfo(existing, candidate);

//       // Update all keys to point to the merged candidate
//       keys.forEach((key) => uniqueMap.set(key, merged));
//     }
//   }

//   return Array.from(new Set(uniqueMap.values()));
// }

// // 4. FIX: Improved merging that preserves the most complete data
// function mergeCandidateInfo(existing, duplicate) {
//   // Helper to choose the better value (longer, more complete)
//   const chooseBetter = (val1, val2) => {
//     if (!val1) return val2;
//     if (!val2) return val1;
//     if (typeof val1 === 'string' && typeof val2 === 'string') {
//       return val1.length > val2.length ? val1 : val2;
//     }
//     return val1;
//   };

//   // Helper to merge arrays uniquely
//   const mergeArrays = (arr1, arr2) => {
//     const combined = [...(arr1 || []), ...(arr2 || [])];
//     return Array.from(new Set(combined.filter(Boolean)));
//   };

//   return {
//     // Use the most complete ID
//     id: existing.id || duplicate.id || `merged_${Date.now()}`,

//     // Merge primitive fields - choose the better value
//     candidateName: chooseBetter(existing.candidateName, duplicate.candidateName),
//     email: chooseBetter(existing.email, duplicate.email),
//     mobile: chooseBetter(existing.mobile, duplicate.mobile),
//     currentJobTitle: chooseBetter(existing.currentJobTitle, duplicate.currentJobTitle),
//     currentCompany: chooseBetter(existing.currentCompany, duplicate.currentCompany),
//     location: chooseBetter(existing.location, duplicate.location),
//     experience: chooseBetter(existing.experience, duplicate.experience),
//     summary: chooseBetter(existing.summary, duplicate.summary),
//     education: chooseBetter(existing.education, duplicate.education),

//     // Merge arrays
//     skills: mergeArrays(existing.skills, duplicate.skills),
//     certifications: mergeArrays(existing.certifications, duplicate.certifications),
//     projects: mergeArrays(existing.projects, duplicate.projects),
//     achievements: mergeArrays(existing.achievements, duplicate.achievements),

//     // Preserve evaluation data (prefer existing if it has better scores)
//     matchingScoreDetails: (existing.matchingScoreDetails?.overallMatch || 0) > (duplicate.matchingScoreDetails?.overallMatch || 0)
//       ? existing.matchingScoreDetails
//       : duplicate.matchingScoreDetails,

//     analysis: (existing.analysis?.skills?.candidateSkills?.length || 0) > (duplicate.analysis?.skills?.candidateSkills?.length || 0)
//       ? existing.analysis
//       : duplicate.analysis,

//     recommendation: existing.recommendation || duplicate.recommendation,
//     comment: chooseBetter(existing.comment, duplicate.comment),
//     confidenceLevel: existing.confidenceLevel || duplicate.confidenceLevel,

//     // Merge source info
//     sourceInfo: {
//       ...duplicate.sourceInfo,
//       ...existing.sourceInfo, // Existing takes precedence
//     },

//     // Preserve other fields
//     jobTitle: existing.jobTitle || duplicate.jobTitle,
//     companyId: existing.companyId || duplicate.companyId,
//     candidateStatus: existing.candidateStatus || duplicate.candidateStatus || "AI Sourced",
//     aiSourced: existing.aiSourced || duplicate.aiSourced || true,
//   };
// }

// // Enhanced main search function
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
//       status: "searching",
//       cost: {
//         estimatedCost: estimatedCost.estimatedCost,
//         actualCost: 0,
//         tokensUsed: 0,
//         apiCalls: 0,
//       },
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

// // CRITICAL FIX: Enhanced main search workflow with proper phase management
// async function performEnhancedDynamicSearch(searchHistoryId, job, searchSettings, recruiterId) {
//   let totalTokensUsed = 0;
//   let totalApiCalls = 0;
//   let wasStopped = false;

//   try {
//     console.log(`🚀 Starting enhanced dynamic search for: ${job.context}`);

//     // Phase 1: Job Analysis
//     await emitProgress(
//       searchHistoryId,
//       "🧠 Analyzing job requirements with AI intelligence...",
//       5,
//       "initializing",
//       true
//     );

//     const jobAnalysis = await analyzeJobForPlatformsInternal(job, searchSettings);
//     totalApiCalls += 1;
//     totalTokensUsed += 1200;

//     if (!jobAnalysis) {
//       throw new Error("Failed to analyze job requirements");
//     }

//     console.log(`🎯 Enhanced job analysis: ${jobAnalysis.jobCategory} - ${jobAnalysis.jobSubcategory}`);

//     await emitProgress(
//       searchHistoryId,
//       `📊 Job analyzed: ${jobAnalysis.jobCategory} role. Starting platform searches...`,
//       10,
//       "searching",
//       true
//     );

//     // Check for stop before continuing
//     if (shouldStopSearch(searchHistoryId)) {
//       wasStopped = true;
//       throw new Error("Search stopped by user request");
//     }

//     // Phase 2: Platform Searches
//     await SearchHistory.findByIdAndUpdate(searchHistoryId, {
//       "searchProgress.currentPhase": "searching",
//     });

//     const availablePlatforms = searchSettings.platforms;
//     const recommendedPlatforms = jobAnalysis.recommendedPlatforms
//       .filter((p) => availablePlatforms.includes(p.platform))
//       .sort((a, b) => {
//         const priorityOrder = { high: 3, medium: 2, low: 1 };
//         return priorityOrder[b.priority] - priorityOrder[a.priority];
//       });

//     console.log(
//       "🎯 Optimized platforms:",
//       recommendedPlatforms.map((p) => `${p.platform} (${p.priority} priority)`)
//     );

//     // Execute platform searches in parallel
//     const platformPromises = recommendedPlatforms.map(async (platformInfo) => {
//       if (shouldStopSearch(searchHistoryId)) {
//         console.log(`🛑 Search stopped before platform ${platformInfo.platform}`);
//         wasStopped = true;
//         return;
//       }

//       const platform = platformInfo.platform;

//       await emitProgress(
//         searchHistoryId,
//         `🔍 Generating search queries for ${platform}...`,
//         15,
//         "searching",
//         true
//       );

//       const queries = await generateSearchQueries(job, platform, searchSettings, jobAnalysis);
//       totalApiCalls += 1;
//       totalTokensUsed += 1500;

//       if (queries.length === 0) {
//         console.log(`⚠️ No queries generated for ${platform}`);
//         return;
//       }

//       await emitProgress(
//         searchHistoryId,
//         `🚀 Searching ${platform} with ${queries.length} optimized queries...`,
//         20,
//         "searching",
//         true
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

//       console.log(`📊 Platform ${platform} completed: ${platformCandidates.length} direct candidates`);
//     });

//     // Wait for all platform searches to complete
//     await Promise.all(platformPromises);

//     if (shouldStopSearch(searchHistoryId)) {
//       console.log(`🛑 Search stopped after platform searches.`);
//       wasStopped = true;
//     }

//     // Phase 3: Check if we need to wait for LinkedIn Extraction
//     const searchAfterPlatforms = await SearchHistory.findById(searchHistoryId);

//     // CRITICAL FIX: Check if 'linkedin' was a selected platform and if extraction is not yet complete.
//     const linkedinWasSearched = searchAfterPlatforms.platforms.includes("linkedin");
//     const isLinkedInComplete = searchAfterPlatforms.searchProgress.isLinkedinExtractionComplete;

//     if (linkedinWasSearched && !isLinkedInComplete && !wasStopped) {
//       console.log(`⏳ LinkedIn was part of the search. Waiting for browser extraction to complete...`);

//       // The process will now pause here.
//       // Finalization will be triggered later by checkLinkedInExtractionComplete().
//       return;
//     }

//     // Phase 4: Finalize search (if LinkedIn was not a factor or is already complete)
//     console.log(`🏁 All platform searches are complete. Starting final AI evaluation...`);
//     await finalizeSearchWithExistingCandidates(searchHistoryId, wasStopped);
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
//       "searchProgress.currentPhase": "completed",
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

//     // Clean up
//     searchControlMap.delete(searchHistoryId.toString());
//     linkedinExtractionQueue.delete(searchHistoryId);
//   }
// }

// // Platform search functions
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
//   const token = process.env.GITHUB_TOKEN;
//   if (!token) {
//     console.log("🔍 GitHub token not configured. Using Google search.");
//     return await searchGoogle(queries, searchSettings, "site:github.com", searchId);
//   }

//   const candidates = new Map();
//   let totalResults = 0;
//   const maxResultsPerQuery = 15;
//   const targetCandidates = Math.min(searchSettings.candidateCount * 3, 100);

//   console.log(`🚀 Starting GitHub search with ${queries.length} queries`);

//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.github.status`]: "searching",
//     [`platformProgress.github.completed`]: false,
//   });

//   for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
//     const query = queries[i];
//     if (!query || query.trim() === "" || shouldStopSearch(searchId)) continue;

//     try {
//       console.log(`🔍 GitHub API search ${i + 1}/${queries.length}: ${query}`);

//       const response = await axios.get('https://api.github.com/search/users', {
//         headers: { 'Authorization': `token ${token}` },
//         params: { q: query, per_page: maxResultsPerQuery }
//       });

//       if (response.data && Array.isArray(response.data.items)) {
//         console.log(`📊 Found ${response.data.items.length} results for query: ${query}`);
//         for (const item of response.data.items) {
//           if (shouldStopSearch(searchId)) break;
//           if (item.html_url && !candidates.has(item.html_url)) {
//             const candidate = await extractCandidateFromUrl(item.html_url, 'github');
//             if (candidate && candidate.candidateName) {
//               candidates.set(item.html_url, candidate);
//               totalResults++;
//               await saveCandidateToBuffer(searchId, candidate, 'github');
//               console.log(`✅ Extracted & saved: ${candidate.candidateName} from github`);
//             }
//           }
//         }
//       } else {
//         console.log(`⚠️ No items found in GitHub API response for query: ${query}`);
//       }

//       await new Promise(resolve => setTimeout(resolve, 1500)); // Rate limiting
//     } catch (error) {
//       console.error(`❌ GitHub search error for query "${query}":`, error.message);
//     }
//   }

//   await SearchHistory.findByIdAndUpdate(searchId, {
//     [`platformProgress.github.status`]: "completed",
//     [`platformProgress.github.completed`]: true,
//     $inc: { "searchProgress.platformsCompleted": 1 },
//   });

//   console.log(`🎉 Search completed for github. Found ${candidates.size} direct candidates.`);
//   return Array.from(candidates.values());
// }

// async function searchDribbble(queries, searchSettings, searchId) {
//   return await searchGoogle(queries, searchSettings, "site:dribbble.com", searchId)
// }

// async function searchBehance(queries, searchSettings, searchId) {
//   return await searchGoogle(queries, searchSettings, "site:behance.net", searchId)
// }

// // AI-powered job analysis
// export const analyzeJobForPlatforms = async (req, res) => {
//   try {
//     const { jobDescription, searchSettings } = req.body;
//     if (!jobDescription || !jobDescription.context) {
//       return res.status(400).json({
//         success: false,
//         error: "Job description is required",
//       });
//     }
//     const analysis = await analyzeJobForPlatformsInternal(jobDescription, searchSettings);
//     if (!analysis) {
//       return res.status(500).json({
//         success: false,
//         error: "Failed to analyze job",
//       });
//     }
//     res.status(200).json({
//       success: true,
//       analysis,
//     });
//   } catch (error) {
//     console.error("Error in job analysis route:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// };

// // AI-powered job analysis
// async function analyzeJobForPlatformsInternal(job, searchSettings) {
//   const prompt = `
//     Analyze the following job description to extract key information for a candidate search.

//     **Job Description:**
//     - Title: ${job.context}
//     - Top Skills: ${job.topskills?.join(", ") || "N/A"}
//     - Description: ${job.description || "N/A"}

//     **Search Settings:**
//     - Experience Level: ${searchSettings.experienceLevel || "Any"}
//     - Location: ${searchSettings.location || "Any"}

//     **Your Task:**
//     Return a JSON object with the following structure:
//     {
//       "jobCategory": "<e.g., Software Development, Design, Marketing>",
//       "jobSubcategory": "<e.g., Frontend, UI/UX, SEO>",
//       "primarySkills": ["<list of 3-5 most critical skills>"],
//       "secondarySkills": ["<list of nice-to-have skills>"],
//       "alternativeTitles": ["<list of 3-4 alternative job titles for this role>"],
//       "searchKeywords": ["<list of 5-7 keywords for boolean search strings>"],
//       "recommendedPlatforms": [
//         { "platform": "linkedin", "priority": "high" },
//         { "platform": "github", "priority": "<'high'|'medium'|'low'>" },
//         { "platform": "google", "priority": "medium" },
//         { "platform": "dribbble", "priority": "<'high'|'medium'|'low' based on role>" },
//         { "platform": "behance", "priority": "<'high'|'medium'|'low' based on role>" }
//       ]
//     }

//     **Instructions:**
//     - Base the platform priority on the job type. For example, GitHub is high priority for developers, Dribbble/Behance for designers.
//     - The keywords should be concise and effective for building search queries.
//   `;

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 1000,
//       temperature: 0.2,
//       response_format: { type: "json_object" },
//     });

//     const analysis = JSON.parse(response.choices[0].message.content);
//     console.log("✅ AI Job Analysis complete:", analysis);
//     return analysis;
//   } catch (error) {
//     console.error("❌ Error in AI Job Analysis:", error.message);
//     // Fallback to a default analysis on error
//     return {
//       jobCategory: "Unknown",
//       jobSubcategory: "Unknown",
//       primarySkills: job.topskills || [],
//       secondarySkills: [],
//       alternativeTitles: [job.context],
//       searchKeywords: job.topskills || [],
//       recommendedPlatforms: [
//         { platform: "linkedin", priority: "high" },
//         { platform: "google", priority: "medium" },
//       ],
//     };
//   }
// }

// // AI-powered search query generation

// async function generateSearchQueries2(jobDescription, platform, searchSettings, jobAnalysis) {
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

// async function generateSearchQueries(jobDescription, platform, searchSettings, jobAnalysis) {
//   const prompt = `
//     You are a world-class sourcing expert specializing in ${platform} recruitment. Generate exactly 5 broad, high-yield search queries to maximize candidate discovery, with location as a mandatory component in each query.

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
//     - Generate exactly 5 broad queries to maximize candidate matches.
//     - Include the specified location in EVERY query to ensure location relevance.
//     - Combine core skills, primary job titles, and location in each query.
//     - Use Boolean operators (AND, OR, quotes) for broad reach.
//     - Avoid overly specific queries; focus on high-volume candidate pools.
//     - Include alternative job titles and skill synonyms where relevant.
//     - Target active profiles with contact information where possible.

//     **Query Categories (exactly 5 total):**
//     - 2 Skill + Title + Location queries (core skills + primary/alternative titles + location)
//     - 1 Location + Title query (primary title + location)
//     - 1 Experience + Skill + Location query (seniority + key skills + location)
//     - 1 General keyword-based + Location query (broad industry/role terms + location)

//     **Quality Standards:**
//     - Queries should be 10–30 words long.
//     - Prioritize individual profiles over company pages.
//     - Balance broad reach with relevance.
//     - Location must be explicitly included in each query.

//     Return ONLY a valid JSON object:
//     {"queries": ["query1", "query2", "query3", "query4", "query5"]}
//   `

//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 600, // Reduced tokens for 5 queries
//       temperature: 0.4,
//       response_format: { type: "json_object" },
//     });

//     const content = JSON.parse(response.choices[0].message.content);
//     const queries = content.queries || [];
//     console.log(`🔍 Generated ${queries.length} broad queries for ${platform}`);
//     return queries.slice(0, 5); // Ensure exactly 5 queries
//   } catch (error) {
//     console.error("❌ Error generating search queries:", error.message);
//     return [];
//   }
// }

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

// // Placeholder for cost estimation
// export const estimateSearchCost = (candidateCount) => {
//   return {
//     estimatedCost: 0.05 * candidateCount,
//     model: "gpt-4o",
//     features: ["AI Job Analysis", "Multi-platform Search", "Candidate Evaluation"],
//   }
// }

// // Placeholder for getting search history
// export const getSearchHistory = async (req, res) => {
//   try {
//     const { recruiterId } = req.params
//     const searches = await SearchHistory.find({ recruiterId }).sort({ createdAt: -1 })
//     res.status(200).json({ success: true, searches })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Placeholder for getting search results
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
//       linkedinProfiles: search.linkedinProfiles,
//     })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Placeholder for deleting search history
// export const deleteSearchHistoryItem = async (req, res) => {
//   try {
//     const { searchId } = req.params
//     await SearchHistory.findByIdAndDelete(searchId)
//     res.status(200).json({ success: true, message: "Search history item deleted" })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Placeholder for job analysis route
// export const analyzeJobForPlatforms2 = async (req, res) => {
//   try {
//     const { jobDescription, searchSettings } = req.body
//     const analysis = await analyzeJobForPlatformsInternal(jobDescription, searchSettings)
//     res.status(200).json({ success: true, analysis })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Placeholder for manual extraction notification
// export const notifyManualExtraction = async (req, res) => {
//   // This function might not be needed with the new robust sequential extraction
//   res.status(200).json({ success: true, message: "Noted" })
// }
// export const getCostEstimate = async (req, res) => {
//   try {
//     const { candidateCount } = req.query
//     const estimate = estimateSearchCost(parseInt(candidateCount, 10) || 10)
//     res.status(200).json({ success: true, estimate })
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message })
//   }
// }
