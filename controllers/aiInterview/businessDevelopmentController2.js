import { OpenAI } from "openai"
import axios from "axios"
import { load } from "cheerio"
import mongoose from "mongoose"
import BusinessLead from "../../model/BusinessLeadModel.js"
import BusinessSearch from "../../model/BusinessSearchModel.js"
import Notification from "../../model/NotificationModal.js"
import { io } from "../../index.js"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// In-memory controls
const searchControlMap = new Map()
const linkedinExtractionQueue = new Map()

// Progress emission helper
async function emitProgress(searchId, status, progress, phase = "searching", canStop = true, additionalData = {}) {
  try {
    const search = await BusinessSearch.findById(searchId)
    if (!search) return

    let accurateProgress = progress
    switch (phase) {
      case "initializing":
        accurateProgress = Math.min(progress, 10)
        break
      case "searching":
        accurateProgress = 10 + Math.min(progress, 40)
        break
      case "linkedin_extraction":
        accurateProgress = 50 + Math.min(progress, 20)
        break
      case "ai_analysis":
        accurateProgress = 70 + Math.min(progress, 15)
        break
      case "generating_outreach":
        accurateProgress = 85 + Math.min(progress, 10)
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
      rawLeadsFound: search.searchProgress.rawLeadsFound,
      linkedinProfilesFound: search.searchProgress.linkedinProfilesFound,
      linkedinProfilesProcessed: search.searchProgress.linkedinProfilesProcessed,
      leadsAnalyzed: search.searchProgress.leadsAnalyzed,
      finalLeadsSelected: search.searchProgress.finalLeadsSelected,
      currentPhase: phase,
      isLinkedinExtractionComplete: search.searchProgress.isLinkedinExtractionComplete,
      isAiAnalysisComplete: search.searchProgress.isAiAnalysisComplete,
      ...additionalData,
    }

    console.log(`Progress[${searchId}] ${progressData.progress}% ${phase} - ${status}`)
    io.emit("businessSearchProgress", progressData)
  } catch (err) {
    console.error("emitProgress error:", err.message)
  }
}

function shouldStopSearch(searchId) {
  const ctrl = searchControlMap.get(String(searchId))
  return !!(ctrl && ctrl.shouldStop)
}

// Save lead to search buffer
async function saveLeadToBuffer(searchId, lead, platform = "unknown") {
  try {
    const search = await BusinessSearch.findById(searchId)
    if (!search) return

    // Check for duplicates
    const isDuplicate = search.rawLeads.some((rawLead) => {
      if (lead.email && rawLead.email && rawLead.email.toLowerCase() === lead.email.toLowerCase()) return true
      if (lead.linkedinUrl && rawLead.linkedinUrl && rawLead.linkedinUrl === lead.linkedinUrl) return true
      if (lead.companyName && rawLead.companyName && 
          lead.personName && rawLead.personName &&
          rawLead.companyName.toLowerCase() === lead.companyName.toLowerCase() &&
          rawLead.personName.toLowerCase() === lead.personName.toLowerCase()) return true
      return false
    })

    if (isDuplicate) return

    const leadData = {
      personName: lead.personName || null,
      email: lead.email || null,
      mobile: lead.mobile || null,
      jobTitle: lead.jobTitle || null,
      companyName: lead.companyName || null,
      companySize: lead.companySize || null,
      industry: lead.industry || null,
      location: lead.location || null,
      linkedinUrl: lead.linkedinUrl || null,
      profileUrl: lead.profileUrl || null,
      portfolioUrl: lead.portfolioUrl || null,
      companyWebsite: lead.companyWebsite || null,
      sourceInfo: lead.sourceInfo || { profileUrl: lead.profileUrl || null },
      foundAt: new Date(),
      platformSource: platform,
    }

    await BusinessSearch.findByIdAndUpdate(searchId, {
      $push: { rawLeads: leadData },
      $inc: { "searchProgress.rawLeadsFound": 1 },
    })

    const updatedSearch = await BusinessSearch.findById(searchId)
    const platformCount = updatedSearch.rawLeads.filter((l) => l.platformSource === platform).length
    await BusinessSearch.findByIdAndUpdate(searchId, {
      [`platformProgress.${platform}.leadsFound`]: platformCount,
      [`platformProgress.${platform}.status`]: "active",
    })
  } catch (err) {
    console.error("saveLeadToBuffer error:", err.message)
  }
}

// Start business development search
export const startBusinessDevelopmentSearch = async (req, res) => {
  try {
    const { searchCriteria, userId } = req.body
    
    if (!searchCriteria || !userId) {
      return res.status(400).json({ success: false, error: "Missing required fields" })
    }

    searchCriteria.leadCount = Math.min(searchCriteria.leadCount || 20, 100)

    const search = new BusinessSearch({
      userId,
      searchName: searchCriteria.searchName || `${searchCriteria.targetIndustry} Search`,
      targetIndustry: searchCriteria.targetIndustry,
      targetLocation: searchCriteria.targetLocation || '',
      companySize: searchCriteria.companySize || '',
      jobTitles: searchCriteria.jobTitles || [],
      technologies: searchCriteria.technologies || [],
      keywords: searchCriteria.keywords || [],
      excludeKeywords: searchCriteria.excludeKeywords || [],
      platforms: searchCriteria.platforms || ['google', 'linkedin'],
      leadCount: searchCriteria.leadCount,
      searchRadius: searchCriteria.searchRadius || '',
      status: "searching",
      rawLeads: [],
      linkedinProfiles: [],
      searchProgress: {
        currentPhase: "initializing",
        platformsCompleted: 0,
        totalPlatforms: searchCriteria.platforms?.length || 2,
        rawLeadsFound: 0,
        linkedinProfilesFound: 0,
        linkedinProfilesProcessed: 0,
        leadsAnalyzed: 0,
        finalLeadsSelected: 0,
        isLinkedinExtractionComplete: false,
        isAiAnalysisComplete: false,
      },
      platformProgress: {
        google: { status: "pending", leadsFound: 0, completed: false },
        linkedin: { status: "pending", leadsFound: 0, completed: false },
        crunchbase: { status: "pending", leadsFound: 0, completed: false },
        apollo: { status: "pending", leadsFound: 0, completed: false },
        zoominfo: { status: "pending", leadsFound: 0, completed: false },
      },
      cost: { estimatedCost: estimateSearchCost(searchCriteria.leadCount).estimatedCost, actualCost: 0, tokensUsed: 0, apiCalls: 0 },
    })

    await search.save()
    searchControlMap.set(String(search._id), { shouldStop: false })

    res.status(200).json({ 
      success: true, 
      message: "Business development search started", 
      searchId: search._id,
      estimatedCost: estimateSearchCost(searchCriteria.leadCount)
    })

    // Start background search
    performBusinessDevelopmentSearch(search._id, searchCriteria, userId).catch((err) => {
      console.error("performBusinessDevelopmentSearch error:", err.message)
    })
  } catch (err) {
    console.error("startBusinessDevelopmentSearch error:", err.message)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// Stop business development search
export const stopBusinessDevelopmentSearch = async (req, res) => {
  try {
    const { searchId, userId } = req.body
    if (!searchId || !userId) return res.status(400).json({ success: false, error: "searchId and userId required" })

    searchControlMap.set(String(searchId), { shouldStop: true, stoppedBy: userId })

    await BusinessSearch.findByIdAndUpdate(searchId, {
      stoppedAt: new Date(),
      stoppedBy: userId,
      status: "stopped",
    })

    await emitProgress(searchId, "Stop requested. Finishing current work...", 0, "finalizing", false)
    res.json({ success: true, message: "Stop request accepted. Finalization will run." })

    setTimeout(() => finalizeBusinessSearch(searchId, true).catch((e) => console.error(e)), 2000)
    io.emit("businessSearchStopping", { searchId, message: "Business search stop requested." })
  } catch (err) {
    console.error("stopBusinessDevelopmentSearch error:", err.message)
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// Main search workflow
async function performBusinessDevelopmentSearch(searchId, searchCriteria, userId) {
  let totalTokensUsed = 0
  let totalApiCalls = 0
  let wasStopped = false

  try {
    await emitProgress(searchId, "Analyzing search criteria", 5, "initializing", true)
    
    // Generate search queries
    const queries = generateBusinessSearchQueries(searchCriteria)
    totalApiCalls++
    
    await emitProgress(searchId, "Starting platform searches", 10, "searching", true)
    
    const platforms = searchCriteria.platforms || ['google', 'linkedin']
    for (let i = 0; i < platforms.length; i++) {
      if (shouldStopSearch(searchId)) {
        wasStopped = true
        break
      }
      
      const platform = platforms[i]
      await emitProgress(searchId, `Searching ${platform}`, 15 + i * 15, "searching", true)
      
      try {
        switch (platform) {
          case "google":
            await searchGoogleForBusinessLeads(queries, searchCriteria, searchId)
            break
          case "linkedin":
            await searchGoogleForBusinessLeads(queries, searchCriteria, searchId, "site:linkedin.com/in/")
            break
          case "crunchbase":
            await searchGoogleForBusinessLeads(queries, searchCriteria, searchId, "site:crunchbase.com")
            break
          default:
            await searchGoogleForBusinessLeads(queries, searchCriteria, searchId)
        }
      } catch (err) {
        console.error(`Error searching ${platform}`, err.message)
      }
      
      totalApiCalls += 1
      await BusinessSearch.findByIdAndUpdate(searchId, { $inc: { "searchProgress.platformsCompleted": 1 } })
    }

    // Check for LinkedIn extraction
    const search = await BusinessSearch.findById(searchId)
    if ((search.linkedinProfiles?.length || 0) > 0 && !search.searchProgress.isLinkedinExtractionComplete) {
      await emitProgress(searchId, "LinkedIn extraction in progress", 0, "linkedin_extraction", true)
      return // Wait for extraction to complete
    }

    // Finalize search
    await finalizeBusinessSearch(searchId, wasStopped)
  } catch (err) {
    console.error("performBusinessDevelopmentSearch error:", err.message)
    try {
      await BusinessSearch.findByIdAndUpdate(searchId, {
        status: wasStopped ? "stopped" : "failed",
        "searchProgress.currentPhase": "completed",
      })
      io.emit("businessSearchError", { searchId, message: err.message, wasStopped })
    } catch (e) {
      console.error("error handling failure:", e.message)
    } finally {
      searchControlMap.delete(String(searchId))
      linkedinExtractionQueue.delete(String(searchId))
    }
  }
}

// Google search for business leads
async function searchGoogleForBusinessLeads(queries, searchCriteria, searchId, siteFilter = "") {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID
  if (!apiKey || !cx) {
    console.warn("Google search keys not set. Skipping google search.")
    return []
  }

  const platform = siteFilter.includes("linkedin") ? "linkedin" : 
                  siteFilter.includes("crunchbase") ? "crunchbase" : "google"
  
  await BusinessSearch.findByIdAndUpdate(searchId, { 
    [`platformProgress.${platform}.status`]: "searching", 
    [`platformProgress.${platform}.completed`]: false 
  })

  const found = []
  const linkedinUrls = new Set()
  const maxPerQuery = 10
  const target = Math.min((searchCriteria.leadCount || 20) * 2, 100)

  for (let i = 0; i < queries.length && found.length < target; i++) {
    if (shouldStopSearch(searchId)) break
    
    const query = `${queries[i]} ${siteFilter}`.trim()
    
    try {
      await emitProgress(searchId, `Searching ${platform}: ${query.substring(0, 60)}...`, (i / queries.length) * 100, "searching", true)
      
      const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
        params: { key: apiKey, cx, q: query, num: maxPerQuery },
        timeout: 15000,
      })
      
      const items = response.data.items || []
      for (const item of items) {
        if (shouldStopSearch(searchId)) break
        
        const link = item.link
        if (!link) continue
        
        if (link.includes("linkedin.com/in/") && platform === "linkedin") {
          linkedinUrls.add(link)
          continue
        }
        
        const lead = await extractBusinessLeadFromUrl(link, platform, searchCriteria)
        if (lead && lead.personName && lead.companyName) {
          found.push(lead)
          await saveLeadToBuffer(searchId, lead, platform)
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1200))
    } catch (err) {
      console.error("searchGoogleForBusinessLeads error:", err.message)
      if (err.response?.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  // Handle LinkedIn URLs
  if (linkedinUrls.size > 0 && platform === "linkedin") {
    await handleLinkedInUrlsForBusiness(searchId, Array.from(linkedinUrls))
  }

  await BusinessSearch.findByIdAndUpdate(searchId, { 
    [`platformProgress.${platform}.status`]: "completed", 
    [`platformProgress.${platform}.completed`]: true 
  })
  
  return found
}

// Handle LinkedIn URLs for business extraction
async function handleLinkedInUrlsForBusiness(searchId, linkedinUrls) {
  try {
    const top = linkedinUrls.slice(0, 30) // Limit LinkedIn profiles
    const profiles = top.map(url => ({
      profileUrl: url,
      personName: extractNameFromLinkedInUrl(url),
      extractionStatus: "pending",
      lastAttempted: new Date(),
      retryCount: 0
    }))
    
    await BusinessSearch.findByIdAndUpdate(searchId, {
      $push: { linkedinProfiles: { $each: profiles } },
      status: "analyzing",
      "searchProgress.currentPhase": "linkedin_extraction",
      "searchProgress.linkedinProfilesFound": top.length,
      "searchProgress.linkedinProfilesProcessed": 0,
      "searchProgress.isLinkedinExtractionComplete": false,
    })

    io.emit("businessLinkedinUrlsForExtraction", { 
      searchId, 
      urls: top, 
      message: `Found ${top.length} LinkedIn profiles for business extraction` 
    })
    
    await emitProgress(searchId, `LinkedIn extraction starting: 0/${top.length}`, 0, "linkedin_extraction", true)

    // Timeout for extraction
    const timeoutId = setTimeout(async () => {
      const qi = linkedinExtractionQueue.get(String(searchId))
      if (qi && qi.status === "active") {
        console.log("LinkedIn extraction timeout, finalizing:", searchId)
        await BusinessSearch.findByIdAndUpdate(searchId, { "searchProgress.isLinkedinExtractionComplete": true })
        linkedinExtractionQueue.set(String(searchId), { ...qi, status: "timeout" })
        await finalizeBusinessSearch(searchId, false)
      }
    }, 8 * 60 * 1000)

    linkedinExtractionQueue.set(String(searchId), { 
      urls: top, 
      processed: [], 
      failed: [], 
      startTime: new Date(), 
      status: "active", 
      timeoutId 
    })
  } catch (err) {
    console.error("handleLinkedInUrlsForBusiness error:", err.message)
  }
}

function extractNameFromLinkedInUrl(url) {
  try {
    const parts = url.split("/").filter(Boolean)
    const last = parts[parts.length - 1] || parts[parts.length - 2] || ""
    return last.replace(/[-_]/g, " ").replace(/\d+/g, "").trim()
      .split(" ").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ") || "LinkedIn Profile"
  } catch {
    return "LinkedIn Profile"
  }
}

// Process LinkedIn DOM for business leads
export const processBusinessLinkedInDOM = async (req, res) => {
  try {
    const { searchId, url, profileUrl, domContent, success, error, profileInfo, extractionMethod } = req.body
    const finalUrl = profileUrl || url

    if (!searchId) {
      if (!success || !domContent) {
        return res.status(200).json({ success: true, message: "Visible tab extraction failed", extractionType: "visible-tab" })
      }
      const lead = await extractBusinessLeadFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod || "visible-tab")
      if (!lead) return res.status(200).json({ success: false, message: "No data extracted", extractionType: "visible-tab" })
      return res.status(200).json({ success: true, message: "Visible tab extracted", lead: { name: lead.personName, company: lead.companyName, title: lead.jobTitle }, extractionType: "visible-tab" })
    }

    if (!finalUrl) return res.status(400).json({ success: false, error: "profileUrl or url required" })

    let extractionStatus = success ? "processing" : "failed"
    if (error && typeof error === "string") {
      if (error.toLowerCase().includes("rate limit")) extractionStatus = "rate_limited"
      if (error.toLowerCase().includes("security") || error.toLowerCase().includes("challenge")) extractionStatus = "blocked"
    }

    let personName = profileInfo?.name || extractNameFromLinkedInUrl(finalUrl)
    await updateBusinessLinkedInProfileStatus(searchId, finalUrl, extractionStatus, personName)

    if (!success || !domContent) {
      await incrementBusinessLinkedInProcessed(searchId)
      await checkBusinessLinkedInExtractionComplete(searchId)
      return res.status(200).json({ success: true, message: "Background extraction recorded (failed)", extractionType: "background-tab" })
    }

    const search = await BusinessSearch.findById(searchId)
    const processed = (search?.searchProgress?.linkedinProfilesProcessed || 0) + 1
    const total = search?.searchProgress?.linkedinProfilesFound || 0
    const progressPercent = total > 0 ? (processed / total) * 100 : 0
    await emitProgress(searchId, `Extracting LinkedIn: ${personName} (${processed}/${total})`, progressPercent, "linkedin_extraction", true, { currentLead: personName })

    const lead = await extractBusinessLeadFromLinkedInDOM(domContent, finalUrl, profileInfo, extractionMethod || "background-tab")
    if (lead) {
      await saveLeadToBuffer(searchId, lead, "linkedin-background")
      await updateBusinessLinkedInProfileStatus(searchId, finalUrl, "success", lead.personName)
    } else {
      await updateBusinessLinkedInProfileStatus(searchId, finalUrl, "failed", personName)
    }

    await incrementBusinessLinkedInProcessed(searchId)
    await checkBusinessLinkedInExtractionComplete(searchId)

    res.json({ success: true, message: "LinkedIn DOM processed", leadExtracted: !!lead, personName: lead?.personName || null, extractionType: "background-tab" })
  } catch (err) {
    console.error("processBusinessLinkedInDOM error:", err.message)
    if (req.body?.searchId) {
      try {
        await incrementBusinessLinkedInProcessed(req.body.searchId)
        await checkBusinessLinkedInExtractionComplete(req.body.searchId)
      } catch (e) {
        console.error("error in error handler:", e.message)
      }
    }
    res.status(500).json({ success: false, error: "Internal server error" })
  }
}

// Helper functions for LinkedIn processing
async function incrementBusinessLinkedInProcessed(searchId) {
  try {
    await BusinessSearch.findByIdAndUpdate(searchId, { $inc: { "searchProgress.linkedinProfilesProcessed": 1 } })
  } catch (err) {
    console.error("incrementBusinessLinkedInProcessed error:", err.message)
  }
}

async function updateBusinessLinkedInProfileStatus(searchId, profileUrl, status, personName = null) {
  try {
    const update = {
      "linkedinProfiles.$.extractionStatus": status,
      "linkedinProfiles.$.lastAttempted": new Date(),
    }
    if (personName) update["linkedinProfiles.$.personName"] = personName

    await BusinessSearch.findOneAndUpdate(
      { _id: searchId, "linkedinProfiles.profileUrl": profileUrl }, 
      { $set: update }
    )
  } catch (err) {
    console.error("updateBusinessLinkedInProfileStatus error:", err.message)
  }
}

async function checkBusinessLinkedInExtractionComplete(searchId) {
  try {
    const search = await BusinessSearch.findById(searchId)
    if (!search) return

    if (shouldStopSearch(searchId)) {
      console.log("checkBusinessLinkedInExtractionComplete: search stopped; finalizing early")
      await BusinessSearch.findByIdAndUpdate(searchId, { "searchProgress.isLinkedinExtractionComplete": true })
      await finalizeBusinessSearch(searchId, true)
      return
    }

    const total = search.searchProgress.linkedinProfilesFound || 0
    const processed = search.searchProgress.linkedinProfilesProcessed || 0

    if (total > 0 && processed >= total) {
      await BusinessSearch.findByIdAndUpdate(searchId, {
        "searchProgress.isLinkedinExtractionComplete": true,
        "searchProgress.currentPhase": "ai_analysis",
        [`platformProgress.linkedin.status`]: "completed",
        [`platformProgress.linkedin.completed`]: true,
      })
      await emitProgress(searchId, "LinkedIn extraction complete. Starting AI analysis...", 100, "linkedin_extraction", false)
      await finalizeBusinessSearch(searchId, false)
    } else {
      const percent = total > 0 ? (processed / total) * 100 : 0
      await emitProgress(searchId, `LinkedIn extraction ${processed}/${total}`, percent, "linkedin_extraction", true)
    }
  } catch (err) {
    console.error("checkBusinessLinkedInExtractionComplete error:", err.message)
    await finalizeBusinessSearch(searchId, false)
  }
}

// Extract business lead from URL
async function extractBusinessLeadFromUrl(url, platform = "web", searchCriteria) {
  try {
    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; business-dev-bot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    })

    const $ = load(response.data)
    $("script, style, nav, footer, .sidebar, .ads, .cookie-banner, .popup, .modal, .overlay").remove()
    const text = $("body").text().replace(/\s+/g, " ").trim()

    if (!text || text.length < 200) return null

    return await extractBusinessLeadWithAI(text, url, platform, searchCriteria)
  } catch (err) {
    console.error("extractBusinessLeadFromUrl error:", err.message)
    return null
  }
}

// Extract business lead from LinkedIn DOM
async function extractBusinessLeadFromLinkedInDOM(domContent, profileUrl, profileInfo = {}, extractionMethod = "browser-dom") {
  const prompt = `
You are a business lead extractor. Extract explicit business-related fields only. If a field isn't present, return null.
Focus on decision makers, executives, and people in positions to make business decisions.

Profile URL: ${profileUrl}
DOM content:
---
${String(domContent).substring(0, 14000)}
---

Return EXACTLY valid JSON with keys:
personName,email,mobile,jobTitle,companyName,companySize,industry,location,linkedinUrl,technologies,businessRule,painPoints,companyWebsite

Where businessRule is one of: "Decision Maker", "Influencer", "End User", "Gatekeeper"
`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 2000,
      temperature: 0.0,
      response_format: { type: "json_object" },
    })

    const text = response.choices?.[0]?.message?.content
    if (!text) return null

    let parsed
    try {
      parsed = typeof text === "string" ? JSON.parse(text) : text
    } catch (e) {
      const jsonMatch = String(text).match(/\{[\s\S]*\}$/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    }
    
    if (!parsed || !parsed.personName || !parsed.companyName) return null

    const lead = {
      id: `linkedin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      personName: parsed.personName,
      email: parsed.email || null,
      mobile: parsed.mobile || null,
      jobTitle: parsed.jobTitle || null,
      companyName: parsed.companyName,
      companySize: parsed.companySize || null,
      industry: parsed.industry || null,
      location: parsed.location || null,
      linkedinUrl: profileUrl,
      profileUrl: profileUrl,
      companyWebsite: parsed.companyWebsite || null,
      technologies: parsed.technologies ? (Array.isArray(parsed.technologies) ? parsed.technologies : [parsed.technologies]) : [],
      businessRule: parsed.businessRule || "End User",
      painPoints: parsed.painPoints ? (Array.isArray(parsed.painPoints) ? parsed.painPoints : [parsed.painPoints]) : [],
      sourceInfo: {
        platform: "linkedin",
        profileUrl,
        linkedinProfileUrl: profileUrl,
        extractionMethod,
        hasEmail: !!parsed.email,
        hasPhone: !!parsed.mobile,
        sourcedAt: new Date(),
        aiModel: "gpt-4o",
        ...profileInfo,
      },
    }
    
    return lead
  } catch (err) {
    console.error("extractBusinessLeadFromLinkedInDOM error:", err.message)
    return null
  }
}

// Extract business lead with AI
async function extractBusinessLeadWithAI(pageText, url, platform, searchCriteria) {
  const prompt = `
You are a business lead extraction assistant. From the content below, extract explicit business lead information only.
Focus on people who could be potential business prospects based on these criteria:
Target Industry: ${searchCriteria.targetIndustry}
Target Job Titles: ${searchCriteria.jobTitles?.join(", ") || "Decision makers, executives"}
Technologies: ${searchCriteria.technologies?.join(", ") || "Any"}

Source: ${url}
Platform: ${platform}
Content:
---
${String(pageText).substring(0, 12000)}
---

Return JSON with keys:
personName,email,mobile,jobTitle,companyName,companySize,industry,location,technologies,businessRule,painPoints,companyWebsite

Where businessRule is one of: "Decision Maker", "Influencer", "End User", "Gatekeeper"
`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 1800,
      temperature: 0.0,
      response_format: { type: "json_object" },
    })

    const text = response.choices?.[0]?.message?.content
    if (!text) return null

    let parsed
    try {
      parsed = typeof text === "string" ? JSON.parse(text) : text
    } catch (e) {
      const jsonMatch = String(text).match(/\{[\s\S]*\}$/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    }
    
    if (!parsed || !parsed.personName || !parsed.companyName) return null

    return {
      id: `${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      personName: parsed.personName,
      email: parsed.email || null,
      mobile: parsed.mobile || null,
      jobTitle: parsed.jobTitle || null,
      companyName: parsed.companyName,
      companySize: parsed.companySize || null,
      industry: parsed.industry || null,
      location: parsed.location || null,
      linkedinUrl: parsed.linkedinUrl || null,
      profileUrl: url,
      companyWebsite: parsed.companyWebsite || null,
      technologies: parsed.technologies ? (Array.isArray(parsed.technologies) ? parsed.technologies : [parsed.technologies]) : [],
      businessRule: parsed.businessRule || "End User",
      painPoints: parsed.painPoints ? (Array.isArray(parsed.painPoints) ? parsed.painPoints : [parsed.painPoints]) : [],
      sourceInfo: {
        platform,
        profileUrl: url,
        hasEmail: !!parsed.email,
        hasPhone: !!parsed.mobile,
        sourcedAt: new Date(),
        aiModel: "gpt-4o",
      },
    }
  } catch (err) {
    console.error("extractBusinessLeadWithAI error:", err.message)
    return null
  }
}

// Generate business search queries
function generateBusinessSearchQueries(searchCriteria) {
  const industry = searchCriteria.targetIndustry || ""
  const location = searchCriteria.targetLocation || ""
  const jobTitles = searchCriteria.jobTitles || ["CEO", "CTO", "Manager"]
  const technologies = searchCriteria.technologies || []
  const keywords = searchCriteria.keywords || []
  
  const queries = []
  
  // Job title + industry queries
  jobTitles.forEach(title => {
    queries.push(`"${title}" "${industry}" ${location}`.trim())
  })
  
  // Technology + industry queries
  technologies.forEach(tech => {
    queries.push(`"${tech}" "${industry}" decision maker ${location}`.trim())
  })
  
  // Keyword combinations
  if (keywords.length > 0) {
    queries.push(`${keywords.join(" ")} "${industry}" ${location}`.trim())
  }
  
  // Fallback query
  if (queries.length === 0) {
    queries.push(`"${industry}" executive manager ${location}`.trim())
  }
  
  return queries.slice(0, 5) // Limit queries
}

// Finalize business search
async function finalizeBusinessSearch(searchId, wasStopped = false) {
  try {
    console.log("Finalizing business search:", searchId, "wasStopped:", wasStopped)
    
    const search = await BusinessSearch.findById(searchId)
    if (!search) return

    if (search.status === "completed" || search.status === "stopped") {
      console.log("already finalized:", searchId, search.status)
      return
    }

    await BusinessSearch.findByIdAndUpdate(searchId, { 
      status: wasStopped ? "stopped" : "analyzing", 
      "searchProgress.currentPhase": "ai_analysis" 
    })
    
    const allLeads = search.rawLeads || []

    if (!allLeads.length) {
      await BusinessSearch.findByIdAndUpdate(searchId, {
        results: [],
        leadsFound: 0,
        status: wasStopped ? "stopped" : "completed",
        completedAt: new Date(),
        "searchProgress.currentPhase": "completed",
        "searchProgress.isAiAnalysisComplete": true,
        "searchProgress.finalLeadsSelected": 0,
      })
      await emitProgress(searchId, wasStopped ? "Search stopped - no leads" : "Search completed - no leads", 100, "completed", false)
      io.emit("businessSearchComplete", { 
        searchId, 
        leads: [], 
        wasStopped, 
        summary: { totalRawLeads: 0, finalLeadsSelected: 0, message: "No leads found" } 
      })
      searchControlMap.delete(String(searchId))
      linkedinExtractionQueue.delete(String(searchId))
      return
    }

    await emitProgress(searchId, `Starting AI analysis of ${allLeads.length} leads...`, 5, "ai_analysis", false)

    // Deduplicate leads
    const uniqueLeads = deduplicateBusinessLeads(allLeads)
    await emitProgress(searchId, `Analyzing ${uniqueLeads.length} unique leads...`, 10, "ai_analysis", false)

    // AI analysis and scoring
    const analyzed = []
    for (let i = 0; i < uniqueLeads.length; i++) {
      const lead = uniqueLeads[i]
      if (shouldStopSearch(searchId)) break

      if (i % 3 === 0 || i === uniqueLeads.length - 1) {
        const progress = Math.min(70, 10 + (i / uniqueLeads.length) * 60)
        await emitProgress(searchId, `AI analyzing ${lead.personName || "Unknown"} (${i + 1}/${uniqueLeads.length})`, progress, "ai_analysis", false, { currentLead: lead.personName })
        await BusinessSearch.findByIdAndUpdate(searchId, { "searchProgress.leadsAnalyzed": i + 1 })
      }

      try {
        const analysis = await analyzeBusinessLead(lead, search)
        if (analysis) {
          lead.matchScore = analysis.matchScore || 0
          lead.recommendation = analysis.recommendation || "Consider"
          lead.confidenceLevel = analysis.confidenceLevel || "Medium"
          lead.aiThoughts = analysis.aiThoughts || ""
          lead.outreachMessage = analysis.outreachMessage || ""
          lead.outreachSubject = analysis.outreachSubject || ""
          lead.bestContactMethod = analysis.bestContactMethod || "email"
          lead.priority = analysis.priority || "medium"
        }
      } catch (err) {
        console.error("analyzeBusinessLead error:", err.message)
        lead.matchScore = 0
      }

      analyzed.push(lead)
    }

    // Generate outreach messages
    await emitProgress(searchId, "Generating personalized outreach messages...", 80, "generating_outreach", false)
    
    for (let i = 0; i < analyzed.length; i++) {
      if (shouldStopSearch(searchId)) break
      const lead = analyzed[i]
      if (!lead.outreachMessage && lead.matchScore > 30) {
        try {
          const outreach = await generateOutreachMessage(lead, search)
          if (outreach) {
            lead.outreachMessage = outreach.message
            lead.outreachSubject = outreach.subject
          }
        } catch (err) {
          console.error("generateOutreachMessage error:", err.message)
        }
      }
    }

    // Sort by match score and select final leads
    const ranked = analyzed.filter(l => l.personName && l.companyName).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    const targetCount = search.leadCount || 20
    const finalLeads = wasStopped ? ranked : ranked.slice(0, targetCount)

    // Save to BusinessLead collection
    await emitProgress(searchId, `Saving ${finalLeads.length} qualified leads...`, 95, "finalizing", false)
    await saveLeadsToDatabase(finalLeads, search)

    // Update search results
    await BusinessSearch.findByIdAndUpdate(searchId, {
      results: finalLeads,
      leadsFound: finalLeads.length,
      status: wasStopped ? "stopped" : "completed",
      completedAt: new Date(),
      "searchProgress.currentPhase": "completed",
      "searchProgress.isAiAnalysisComplete": true,
      "searchProgress.finalLeadsSelected": finalLeads.length,
    })

    await emitProgress(searchId, wasStopped ? `Search stopped. ${finalLeads.length} leads saved.` : `Search completed. ${finalLeads.length} leads found.`, 100, "completed", false)

    io.emit("businessSearchComplete", {
      searchId,
      leads: finalLeads,
      wasStopped,
      summary: {
        totalRawLeads: allLeads.length,
        uniqueLeadsAnalyzed: uniqueLeads.length,
        finalLeadsSelected: finalLeads.length,
        message: `AI analysis complete`,
      },
    })

    // Send notification
    const note = new Notification({
      message: `${wasStopped ? "🛑 Business search stopped" : "🎉 Business search completed"}! Found ${finalLeads.length} qualified leads for ${search.targetIndustry}.`,
      recipientId: search.userId,
    })
    await note.save()
    io.emit("newNotification", note)

    searchControlMap.delete(String(searchId))
    linkedinExtractionQueue.delete(String(searchId))
    console.log("Business search finalized:", searchId)
  } catch (err) {
    console.error("finalizeBusinessSearch error:", err.message)
    try {
      await BusinessSearch.findByIdAndUpdate(searchId, { 
        status: "failed", 
        completedAt: new Date(), 
        "searchProgress.currentPhase": "completed" 
      })
      io.emit("businessSearchError", { searchId, message: `Search processing failed: ${err.message}` })
    } catch (e) {
      console.error("finalize post-error update failed:", e.message)
    } finally {
      searchControlMap.delete(String(searchId))
      linkedinExtractionQueue.delete(String(searchId))
    }
  }
}

// Analyze business lead with AI
async function analyzeBusinessLead(lead, search) {
  if (!lead || !lead.personName) return null

  const prompt = `
You are a business development analyst. Analyze this lead's potential for business opportunities.

Search Context:
- Target Industry: ${search.targetIndustry}
- Target Location: ${search.targetLocation || "Any"}
- Target Job Titles: ${search.jobTitles?.join(", ") || "Decision makers"}
- Technologies: ${search.technologies?.join(", ") || "Any"}

Lead Information:
- Name: ${lead.personName}
- Job Title: ${lead.jobTitle || "Not specified"}
- Company: ${lead.companyName || "Not specified"}
- Industry: ${lead.industry || "Not specified"}
- Location: ${lead.location || "Not specified"}
- Business Rule: ${lead.businessRule || "Unknown"}
- Company Size: ${lead.companySize || "Not specified"}
- Technologies: ${lead.technologies?.join(", ") || "Not specified"}

Return EXACT JSON with:
{
  "matchScore": number (0-100),
  "recommendation": "Hot Lead|Warm Lead|Cold Lead|Not Qualified",
  "confidenceLevel": "High|Medium|Low",
  "priority": "high|medium|low",
  "aiThoughts": "detailed analysis of why this is a good/bad lead",
  "bestContactMethod": "email|linkedin|phone",
  "qualificationReason": "why qualified or not qualified"
}
`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 800,
      temperature: 0.1,
      response_format: { type: "json_object" },
    })
    
    const text = response.choices?.[0]?.message?.content
    if (!text) return null
    
    let parsed
    try {
      parsed = typeof text === "string" ? JSON.parse(text) : text
    } catch (e) {
      const jsonMatch = String(text).match(/\{[\s\S]*\}$/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    }
    
    return parsed
  } catch (err) {
    console.error("analyzeBusinessLead error:", err.message)
    return null
  }
}

// Generate outreach message
async function generateOutreachMessage(lead, search) {
  const prompt = `
You are a business development expert. Create a personalized outreach message for this lead.

Lead Details:
- Name: ${lead.personName}
- Title: ${lead.jobTitle}
- Company: ${lead.companyName}
- Industry: ${lead.industry || search.targetIndustry}
- AI Analysis: ${lead.aiThoughts || "Potential prospect"}

Context: We are reaching out for business development opportunities in ${search.targetIndustry}.

Create a professional but friendly outreach message that:
1. Is personalized to their role and company
2. Mentions a relevant pain point or opportunity
3. Suggests a brief conversation
4. Is concise (under 150 words)

Return EXACT JSON with:
{
  "subject": "compelling email subject line",
  "message": "personalized outreach message body"
}
`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: "json_object" },
    })
    
    const text = response.choices?.[0]?.message?.content
    if (!text) return null
    
    let parsed
    try {
      parsed = typeof text === "string" ? JSON.parse(text) : text
    } catch (e) {
      const jsonMatch = String(text).match(/\{[\s\S]*\}$/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    }
    
    return parsed
  } catch (err) {
    console.error("generateOutreachMessage error:", err.message)
    return null
  }
}

// Save leads to database
async function saveLeadsToDatabase(leads, search) {
  try {
    if (!leads || leads.length === 0) return

    const docs = leads.map(lead => ({
      personName: lead.personName,
      email: lead.email,
      mobile: lead.mobile,
      jobTitle: lead.jobTitle,
      companyName: lead.companyName,
      companySize: lead.companySize,
      industry: lead.industry,
      location: lead.location,
      linkedinUrl: lead.linkedinUrl,
      profileUrl: lead.profileUrl,
      portfolioUrl: lead.portfolioUrl,
      companyWebsite: lead.companyWebsite,
      targetIndustry: search.targetIndustry,
      businessRule: lead.businessRule,
      technologies: lead.technologies || [],
      painPoints: lead.painPoints || [],
      aiThoughts: lead.aiThoughts,
      recommendation: lead.recommendation,
      matchScore: lead.matchScore || 0,
      confidenceLevel: lead.confidenceLevel,
      outreachMessage: lead.outreachMessage,
      outreachSubject: lead.outreachSubject,
      bestContactMethod: lead.bestContactMethod,
      sourceInfo: lead.sourceInfo || {},
      leadStatus: 'new',
      priority: lead.priority || 'medium',
      tags: [search.targetIndustry, search.targetLocation].filter(Boolean),
      created_at: new Date(),
    }))

    // Avoid duplicates by personName + companyName
    const existing = await BusinessLead.find({ 
      $or: docs.map(d => ({ 
        personName: d.personName, 
        companyName: d.companyName 
      }))
    })
    
    const existingKeys = new Set(existing.map(e => `${e.personName}_${e.companyName}`))
    const toInsert = docs.filter(d => !existingKeys.has(`${d.personName}_${d.companyName}`))

    if (toInsert.length) {
      await BusinessLead.insertMany(toInsert, { ordered: false })
      console.log(`Saved ${toInsert.length} new business leads.`)
    } else {
      console.log("No new business leads to save.")
    }
  } catch (err) {
    console.error("saveLeadsToDatabase error:", err.message)
  }
}

// Deduplicate business leads
function deduplicateBusinessLeads(leads) {
  const map = new Map()

  for (const lead of leads) {
    const keys = []
    if (lead.email) keys.push(`email:${String(lead.email).toLowerCase()}`)
    if (lead.linkedinUrl) keys.push(`linkedin:${lead.linkedinUrl}`)
    if (lead.personName && lead.companyName) {
      keys.push(`person_company:${String(lead.personName).toLowerCase()}_${String(lead.companyName).toLowerCase()}`)
    }
    if (lead.mobile) keys.push(`mobile:${String(lead.mobile).replace(/\D/g, "")}`)

    const foundKey = keys.find(k => map.has(k))
    if (!foundKey) {
      const primaryKey = keys[0] || `id:${Math.random().toString(36).slice(2)}`
      map.set(primaryKey, { ...lead })
      keys.forEach(k => map.set(k, map.get(primaryKey)))
    } else {
      const existing = map.get(foundKey)
      mergeBusinessLeadInfo(existing, lead)
    }
  }

  return Array.from(new Set(map.values()))
}

function mergeBusinessLeadInfo(existing, duplicate) {
  if (!existing.email && duplicate.email) existing.email = duplicate.email
  if (!existing.mobile && duplicate.mobile) existing.mobile = duplicate.mobile
  if (!existing.linkedinUrl && duplicate.linkedinUrl) existing.linkedinUrl = duplicate.linkedinUrl
  if (!existing.companyWebsite && duplicate.companyWebsite) existing.companyWebsite = duplicate.companyWebsite
  if (duplicate.technologies && duplicate.technologies.length) {
    existing.technologies = Array.from(new Set([...(existing.technologies || []), ...duplicate.technologies]))
  }
  if (duplicate.painPoints && duplicate.painPoints.length) {
    existing.painPoints = Array.from(new Set([...(existing.painPoints || []), ...duplicate.painPoints]))
  }
  if (duplicate.sourceInfo) {
    existing.sourceInfo = existing.sourceInfo || {}
    for (const k of Object.keys(duplicate.sourceInfo)) {
      if (!existing.sourceInfo[k] && duplicate.sourceInfo[k]) {
        existing.sourceInfo[k] = duplicate.sourceInfo[k]
      }
    }
  }
}

// Utility functions
function estimateSearchCost(leadCount = 20) {
  const estimatedTokens = leadCount * 3000
  return { 
    estimatedCost: (estimatedTokens * 0.00015) / 1000,
    estimatedTokens,
    model: "gpt-4o",
    features: ["AI Lead Analysis", "Outreach Generation", "LinkedIn Extraction", "Real-time Progress"]
  }
}

// Get search history
export const getBusinessSearchHistory = async (req, res) => {
  try {
    const { userId } = req.params
    const searches = await BusinessSearch.find({ userId })
      .select("-results -rawLeads")
      .sort({ createdAt: -1 })
      .limit(20)

    res.status(200).json({ success: true, searches })
  } catch (error) {
    console.error("Error fetching business search history:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Get search results
export const getBusinessSearchResults = async (req, res) => {
  try {
    const { searchId } = req.params
    const search = await BusinessSearch.findById(searchId)

    if (!search) {
      return res.status(404).json({ success: false, error: "Search not found" })
    }

    res.status(200).json({
      success: true,
      results: search.results || [],
      rawLeads: search.rawLeads || [],
      linkedinProfiles: search.linkedinProfiles || [],
      platformProgress: search.platformProgress || {},
      searchProgress: search.searchProgress || {},
      searchDetails: search,
    })
  } catch (error) {
    console.error("Error fetching business search results:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Delete search history
export const deleteBusinessSearchHistory = async (req, res) => {
  const { searchId } = req.params
  const { userId } = req.body

  try {
    if (!mongoose.Types.ObjectId.isValid(searchId)) {
      return res.status(400).json({ success: false, error: "Invalid search ID" })
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" })
    }

    const search = await BusinessSearch.findOneAndDelete({
      _id: searchId,
      userId: userId,
    })

    if (!search) {
      return res.status(404).json({
        success: false,
        error: "Search history item not found",
      })
    }

    return res.status(200).json({
      success: true,
      message: "Business search history item deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting business search history:", error.message)
    return res.status(500).json({ success: false, error: "Server error" })
  }
}

// Get cost estimate
export const getBusinessSearchCostEstimate = async (req, res) => {
  try {
    const { leadCount = 20 } = req.query
    const estimate = estimateSearchCost(Number.parseInt(leadCount))
    res.status(200).json({ success: true, estimate })
  } catch (error) {
    console.error("Error calculating cost estimate:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Get business leads
export const getBusinessLeads = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, industry } = req.query
    const query = {}
    
    if (status) query.leadStatus = status
    if (priority) query.priority = priority  
    if (industry) query.industry = new RegExp(industry, 'i')

    const leads = await BusinessLead.find(query)
      .sort({ created_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec()

    const total = await BusinessLead.countDocuments(query)

    res.status(200).json({
      success: true,
      leads,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    })
  } catch (error) {
    console.error("Error fetching business leads:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Update business lead
export const updateBusinessLead = async (req, res) => {
  try {
    const { leadId } = req.params
    const updateData = req.body

    const lead = await BusinessLead.findByIdAndUpdate(
      leadId,
      { ...updateData, updated_at: new Date() },
      { new: true }
    )

    if (!lead) {
      return res.status(404).json({ success: false, error: "Lead not found" })
    }

    res.status(200).json({ success: true, lead })
  } catch (error) {
    console.error("Error updating business lead:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}