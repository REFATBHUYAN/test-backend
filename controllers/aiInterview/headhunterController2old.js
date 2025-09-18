

// ----------- working code my be but without non coder candidate seach and other features -----------
import { OpenAI } from "openai"
import axios from "axios"
import { load } from "cheerio"
import JobDescription from "../../model/JobDescriptionModel.js"
import Resume from "../../model/resumeModel.js"
import Notification from "../../model/NotificationModal.js"
import { io } from "../../index.js"
import mongoose from "mongoose"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- SCHEMAS ---
const searchHistorySchema = new mongoose.Schema({
  recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
  jobTitle: String,
  platforms: [String],
  searchSettings: Object,
  candidatesFound: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "pending" },
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
      skills: [String],
      experience: String,
      summary: String,
      candidateStatus: String,
      matchingScoreDetails: {
        overallMatch: Number,
      },
      aiSourced: Boolean,
      sourceInfo: {
        platform: String,
        profileUrl: String,
        linkedinProfileUrl: String,
        portfolioUrl: String,
        sourcedAt: Date,
        sourcedBy: mongoose.Schema.Types.ObjectId,
        aiModel: String,
        hasEmail: Boolean,
      },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
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

// --- AI-POWERED SEARCH & EXTRACTION ---
async function generateSearchQueries(jobDescription, platform, searchSettings) {
  const isTechJob = jobDescription.jobType === 'tech';
  const prompt = `
    You are an expert headhunter's assistant. Generate 8-10 highly optimized and diverse search queries for finding top candidates on ${platform}.

    Job Details:
    - Position: ${jobDescription.context}
    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
    - Experience Level: ${searchSettings.experienceLevel}
    - Location: ${searchSettings.location || "Any"}
    - Keywords: ${searchSettings.keywords || ""}
    - Exclude Keywords: ${searchSettings.excludeKeywords || ""}
    - Job Type: ${isTechJob ? "Technical" : "Non-Technical"}

    Platform-Specific Instructions:
    ${
      isTechJob
        ? `
    ${platform === "linkedin" ? `- Use LinkedIn-friendly boolean search strings with variations. For example: '("Software Engineer" OR "Developer" OR "Programmer") AND ("Node.js" OR "JavaScript") AND "${searchSettings.location || "Remote"}"'` : ""}
    ${platform === "github" ? `- Use GitHub search syntax with different combinations. Focus on user bios, locations, languages, and followers. For example: 'language:javascript location:"${searchSettings.location || "worldwide"}" followers:>10'` : ""}
    ${platform === "google" ? `- Create diverse web search queries to find resumes, portfolios, and profiles. Use different file types and keywords. For example: '("${jobDescription.context}" OR "software developer") resume filetype:pdf "${searchSettings.location || ""}"'` : ""}
    `
        : `
    ${platform === "linkedin" ? `- Use LinkedIn to find professionals. For a ${jobDescription.context} role, you could search for profiles with titles like "${jobDescription.context}", "UI/UX Designer", or "Product Designer". Include keywords like "user research", "wireframing", and "prototyping".` : ""}
    ${platform === "google" ? `- Use Google to find portfolios and resumes. For a law position, you might search for '"legal counsel" resume filetype:pdf' or '"associate attorney" "case history"'.` : ""}
    `
    }

    Make queries diverse by:
    1. Using different keyword combinations and synonyms.
    2. Varying search operators and syntax.
    3. Targeting different experience levels.
    4. Including industry-specific terms.
    5. Using different job title variations.

    Return ONLY a valid JSON object with a "queries" key containing an array of strings. Example: {"queries": ["query1", "query2", "query3", "query4", "query5", "query6", "query7", "query8"]}
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 1200,
      temperature: 0.7,
      response_format: { type: "json_object" },
    })

    const content = JSON.parse(response.choices[0].message.content)
    const queries = content.queries || [jobDescription.context]
    console.log(`Generated ${queries.length} queries for ${platform}:`, queries)
    return queries
  } catch (error) {
    console.error("Error generating search queries:", error.message)
    const fallbackQueries = [
      `"${jobDescription.context}" ${searchSettings.location || ""}`,
      `${jobDescription.context} ${searchSettings.keywords || ""}`,
      `senior ${jobDescription.context.toLowerCase()}`,
      `${jobDescription.context} ${searchSettings.experienceLevel}`,
    ]
    return fallbackQueries
  }
}

async function extractCandidateWithAI(pageText, url, platform) {
  const prompt = `
    Analyze the following text from a professional profile/resume found at ${url} on ${platform}.
    Extract the candidate's information into a structured JSON object.

    **Instructions:**
    1. **Infer Information:** Intelligently infer the candidate's current title, company, and skills from the text.
    2. **Find Contact Info:** Locate an email address and a phone number if available.
    3. **Summarize:** Create a concise, professional summary (2-3 sentences) based on their experience.
    4. **Find Specific URLs:** Look for a separate LinkedIn profile URL and a personal portfolio/website URL within the text.
    5. **Be Accurate:** If a piece of information is not found, return null for that field. Do not invent data.
    6. **Skills Extraction:** Extract relevant skills, tools, and qualifications. For non-tech roles, this could include certifications, legal specializations, or design software.
    7. **Name Extraction:** Extract the full name, handle GitHub usernames or LinkedIn names appropriately.

    **Text Content:**
    ---
    ${pageText.substring(0, 5000)}
    ---

    Return ONLY a valid JSON object with the following structure. Do not include any other text or markdown.
    {
      "name": "Full Name or Username",
      "title": "Current Job Title or Role",
      "company": "Current Company",
      "location": "City, Country",
      "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"],
      "summary": "A 2-3 sentence professional summary highlighting key experience and expertise.",
      "email": "email@domain.com",
      "phone": "+1-555-555-5555",
      "linkedinProfileUrl": "https://www.linkedin.com/in/username",
      "portfolioUrl": "https://username.github.io"
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

    const result = JSON.parse(response.choices[0].message.content)
    if (result && (result.name || result.title)) {
      return {
        id: `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: result.name || "Unknown",
        title: result.title || "No title",
        company: result.company || null,
        location: result.location || null,
        skills: result.skills || [],
        summary: result.summary || "No summary available",
        email: result.email || null,
        phone: result.phone || null,
        linkedinProfileUrl: result.linkedinProfileUrl || null,
        portfolioUrl: result.portfolioUrl || null,
        profileUrl: url,
        platform,
        matchScore: 0,
      }
    }
    return null
  } catch (error) {
    console.error("Error extracting candidate with AI:", error.message)
    return null
  }
}

async function evaluateCandidateMatch(candidate, jobDescription, searchSettings) {
  const prompt = `
    Evaluate how well this candidate profile matches the job requirements on a scale of 0-100.

    **Job Requirements:**
    - Title: ${jobDescription.context}
    - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "N/A"}
    - Experience Level: ${searchSettings.experienceLevel}
    - Location: ${searchSettings.location || "Any"}
    - Keywords: ${searchSettings.keywords || "N/A"}

    **Candidate Profile:**
    - Name: ${candidate.name}
    - Title: ${candidate.title}
    - Company: ${candidate.company || "N/A"}
    - Location: ${candidate.location || "N/A"}
    - Skills: ${candidate.skills?.join(", ") || "N/A"}
    - Summary: ${candidate.summary}

    **Evaluation Criteria:**
    - Skills Match (40%): How well do the candidate's skills align with the required skills?
    - Experience & Title Match (30%): Does their title and summary reflect the required experience level?
    - Location Match (15%): Is the candidate in or willing to relocate to the specified location?
    - Overall Profile Quality (15%): General impression of the candidate's background and experience depth.

    Consider:
    - Exact skill matches should score higher.
    - Related/transferable skills should get partial credit.
    - For non-tech roles, consider portfolio quality, case studies, or relevant experience.

    Return ONLY a single number (the match score) and nothing else.
  `

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 10,
      temperature: 0.1,
    })

    const score = Number.parseInt(response.choices[0].message.content.trim())
    return isNaN(score) ? 50 : Math.max(0, Math.min(100, score))
  } catch (error) {
    console.error("Error evaluating candidate:", error.message)
    return 50
  }
}

// --- PLATFORM-SPECIFIC SEARCH FUNCTIONS ---
async function searchGoogle(queries, searchSettings, siteFilter = "") {
  const candidates = new Map()
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

  if (!apiKey || !searchEngineId) {
    console.warn("Google Search API not configured. Skipping Google search.")
    return []
  }

  const platform = siteFilter.includes("linkedin") ? "linkedin" : "google"
  let totalResults = 0
  const maxResultsPerQuery = 10
  const targetCandidates = Math.ceil(searchSettings.candidateCount * 1.5) // Get more than needed

  console.log(
    `Starting Google search for ${platform} with ${queries.length} queries, targeting ${targetCandidates} candidates`,
  )

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    const query = queries[i]
    try {
      const searchQuery = `${query} ${siteFilter}`.trim()
      console.log(`Google search ${i + 1}/${queries.length}: ${searchQuery}`)

      io.emit("searchProgress", {
        status: `Google search ${i + 1}/${queries.length}: "${searchQuery.substring(0, 50)}..."`,
        progress: 20 + (i / queries.length) * 30,
        candidatesFound: candidates.size,
      })

      const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
        params: {
          key: apiKey,
          cx: searchEngineId,
          q: searchQuery,
          num: maxResultsPerQuery,
          start: 1,
        },
        timeout: 10000,
      })

      if (response.data.items) {
        console.log(`Found ${response.data.items.length} results for query: ${searchQuery}`)

        for (const item of response.data.items) {
          if (item.link && !candidates.has(item.link) && totalResults < targetCandidates) {
            io.emit("searchProgress", {
              status: `Processing: ${item.title?.substring(0, 50)}...`,
              progress: 25 + (i / queries.length) * 30,
              candidatesFound: candidates.size,
            })

            const candidate = await extractCandidateFromUrl(item.link, platform)
            if (candidate && candidate.name && candidate.name !== "Unknown") {
              candidates.set(item.link, candidate)
              totalResults++
              console.log(`✅ Extracted candidate: ${candidate.name} from ${platform} (${candidates.size} total)`)
            } else {
              console.log(`❌ Failed to extract valid candidate from ${item.link}`)
            }
          }
        }
      } else {
        console.log(`No results found for query: ${searchQuery}`)
      }

      // Add delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`Google search error for query "${query}":`, error.message)
      // Continue with next query instead of failing completely
    }
  }

  console.log(`Google search completed for ${platform}. Found ${candidates.size} unique candidates.`)
  return Array.from(candidates.values())
}

async function searchLinkedIn(queries, searchSettings) {
  const apiKey = process.env.LINKEDIN_SCRAPER_API_KEY

  if (!apiKey) {
    console.warn("LinkedIn Scraper API Key not configured. Using Google search for LinkedIn profiles.")
    return await searchGoogle(queries, searchSettings, "site:linkedin.com/in/")
  }

  // If you have a LinkedIn scraper API, implement it here
  // For now, using Google search as fallback with better LinkedIn-specific queries
  const linkedinQueries = queries.map((query) => `${query} site:linkedin.com/in/`)
  return await searchGoogle(linkedinQueries, searchSettings, "")
}

async function searchGitHub(queries, searchSettings) {
  const candidates = new Map()
  const token = process.env.GITHUB_TOKEN

  if (!token) {
    console.warn("GitHub token not configured. Skipping GitHub search.")
    return []
  }

  let totalResults = 0
  const maxResultsPerQuery = 20 // Increased from 15
  const targetCandidates = Math.ceil(searchSettings.candidateCount * 1.5)

  console.log(`Starting GitHub search with ${queries.length} queries, targeting ${targetCandidates} candidates`)

  for (let i = 0; i < queries.length && totalResults < targetCandidates; i++) {
    const query = queries[i]
    try {
      console.log(`GitHub search ${i + 1}/${queries.length}: ${query}`)

      io.emit("searchProgress", {
        status: `GitHub search ${i + 1}/${queries.length}: "${query.substring(0, 50)}..."`,
        progress: 40 + (i / queries.length) * 30,
        candidatesFound: candidates.size,
      })

      const response = await axios.get(`https://api.github.com/search/users`, {
        params: {
          q: query,
          per_page: maxResultsPerQuery,
          sort: "repositories", // Changed from followers to repositories
          order: "desc",
        },
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
        timeout: 10000,
      })

      if (response.data.items) {
        console.log(`Found ${response.data.items.length} GitHub users for query: ${query}`)

        for (const user of response.data.items) {
          if (user.html_url && !candidates.has(user.html_url) && totalResults < targetCandidates) {
            io.emit("searchProgress", {
              status: `Processing GitHub profile: ${user.login}`,
              progress: 45 + (i / queries.length) * 30,
              candidatesFound: candidates.size,
            })

            const candidate = await extractCandidateFromUrl(user.html_url, "github")
            if (candidate && candidate.name && candidate.name !== "Unknown") {
              candidates.set(user.html_url, candidate)
              totalResults++
              console.log(`✅ Extracted GitHub candidate: ${candidate.name} (${candidates.size} total)`)
            } else {
              console.log(`❌ Failed to extract valid candidate from ${user.html_url}`)
            }
          }
        }
      } else {
        console.log(`No GitHub users found for query: ${query}`)
      }

      // Add delay between requests to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1200))
    } catch (error) {
      console.error(`GitHub search error for query "${query}":`, error.message)
      if (error.response?.status === 403) {
        console.log("GitHub rate limit hit, waiting longer...")
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  console.log(`GitHub search completed. Found ${candidates.size} unique candidates.`)
  return Array.from(candidates.values())
}

async function extractCandidateFromUrl(url, platform) {
  try {
    console.log(`Extracting candidate from: ${url}`)

    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
      },
    })

    const $ = load(data)

    // Remove script and style elements
    $("script, style, nav, footer, .sidebar").remove()

    const text = $("body").text().replace(/\s+/g, " ").trim()

    if (text.length < 100) {
      console.log(`Skipping ${url} - insufficient content (${text.length} chars)`)
      return null
    }

    const candidate = await extractCandidateWithAI(text, url, platform)
    if (candidate) {
      console.log(`Successfully extracted: ${candidate.name} from ${platform}`)
    }
    return candidate
  } catch (error) {
    console.error(`Error scraping URL ${url}:`, error.message)
    return null
  }
}

// --- MAIN WORKFLOW & EXPORTS ---
function estimateSearchCost(candidateCount) {
  const tokensPerCandidate = 400 // Increased estimate
  const totalInputTokens = candidateCount * tokensPerCandidate
  const totalOutputTokens = candidateCount * 250
  const estimatedCost = (totalInputTokens * 0.00015) / 1000 + (totalOutputTokens * 0.0006) / 1000

  return {
    estimatedCost: Number.parseFloat(estimatedCost.toFixed(4)),
    model: "gpt-4o-mini & gpt-4o",
    features: ["Multi-Platform Search", "AI Profile Extraction", "Smart Matching"],
  }
}

export const getCostEstimate = async (req, res) => {
  try {
    const { candidateCount = 10 } = req.query
    const estimate = estimateSearchCost(Number.parseInt(candidateCount))
    res.status(200).json({ success: true, estimate })
  } catch (error) {
    console.error("Error calculating cost estimate:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

export const startHeadhunterSearch = async (req, res) => {
  try {
    const { jobId, searchSettings, recruiterId } = req.body

    console.log("Starting headhunter search with settings:", searchSettings)

    if (!jobId || !searchSettings || !recruiterId || !searchSettings.platforms?.length) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields, including at least one platform.",
      })
    }

    // Ensure reasonable candidate count
    searchSettings.candidateCount = Math.min(searchSettings.candidateCount || 10, 50)

    const job = await JobDescription.findById(jobId)
    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" })
    }

    const estimatedCost = estimateSearchCost(searchSettings.candidateCount)

    const searchHistory = new SearchHistory({
      recruiterId,
      jobId,
      jobTitle: job.context,
      platforms: searchSettings.platforms,
      searchSettings,
      status: "in_progress",
      cost: {
        estimatedCost: estimatedCost.estimatedCost,
        actualCost: 0,
        tokensUsed: 0,
        apiCalls: 0,
      },
    })

    await searchHistory.save()

    res.status(200).json({
      success: true,
      message: "AI headhunter search initiated!",
      searchId: searchHistory._id,
      estimatedCost: estimatedCost,
    })

    // Start background search
    performSearch(searchHistory._id, job, searchSettings, recruiterId)
  } catch (error) {
    console.error("Error starting headhunter search:", error.message)
    res.status(500).json({ success: false, error: "Internal server error starting search." })
  }
}

async function performSearch(searchHistoryId, job, searchSettings, recruiterId) {
  let totalTokensUsed = 0
  let totalApiCalls = 0

  try {
    console.log(`Starting search for job: ${job.context} with settings:`, searchSettings)

    io.emit("searchProgress", {
      searchId: searchHistoryId,
      status: "Initializing search...",
      progress: 5,
      current: 0,
      total: searchSettings.platforms.length,
      candidatesFound: 0,
    })

    const allCandidates = []
    const platforms = searchSettings.platforms

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i]

      io.emit("searchProgress", {
        searchId: searchHistoryId,
        status: `Generating intelligent queries for ${platform}...`,
        progress: 10 + i * 25,
        current: i,
        total: platforms.length,
        platform: platform,
        candidatesFound: allCandidates.length,
      })

      const queries = await generateSearchQueries(job, platform, searchSettings)
      totalApiCalls += 1 // Query generation API call
      totalTokensUsed += 800 // Estimated tokens for query generation
      console.log(`Generated ${queries.length} queries for ${platform}`)

      io.emit("searchProgress", {
        searchId: searchHistoryId,
        status: `Searching ${platform} with ${queries.length} queries...`,
        progress: 15 + i * 25,
        current: i,
        total: platforms.length,
        platform: platform,
        candidatesFound: allCandidates.length,
      })

      let platformCandidates = []
      switch (platform) {
        case "google":
          platformCandidates = await searchGoogle(queries, searchSettings)
          break
        case "linkedin":
          platformCandidates = await searchLinkedIn(queries, searchSettings)
          break
        case "github":
          platformCandidates = await searchGitHub(queries, searchSettings)
          break
      }

      // Count API calls for candidate extraction
      totalApiCalls += platformCandidates.length
      totalTokensUsed += platformCandidates.length * 1200 // Estimated tokens per extraction

      console.log(`Found ${platformCandidates.length} candidates on ${platform}`)

      io.emit("searchProgress", {
        searchId: searchHistoryId,
        status: `Found ${platformCandidates.length} candidates on ${platform}`,
        progress: 25 + i * 25,
        current: i + 1,
        total: platforms.length,
        platform: platform,
        candidatesFound: allCandidates.length + platformCandidates.length,
      })

      allCandidates.push(...platformCandidates)
    }

    console.log(`Total candidates found across all platforms: ${allCandidates.length}`)

    io.emit("searchProgress", {
      searchId: searchHistoryId,
      status: `Found ${allCandidates.length} total candidates. Evaluating matches...`,
      progress: 80,
      current: platforms.length,
      total: platforms.length,
      candidatesFound: allCandidates.length,
    })

    // Remove duplicates based on profile URL and name
    const uniqueCandidates = Array.from(
      new Map(allCandidates.map((c) => [`${c.profileUrl}_${c.name?.toLowerCase()}`, c])).values(),
    )

    console.log(`After deduplication: ${uniqueCandidates.length} unique candidates`)

    // Evaluate candidates in batches to show progress
    for (let i = 0; i < uniqueCandidates.length; i++) {
      const candidate = uniqueCandidates[i]
      candidate.matchScore = await evaluateCandidateMatch(candidate, job, searchSettings)
      totalApiCalls += 1 // Match evaluation API call
      totalTokensUsed += 300 // Estimated tokens per evaluation

      if (i % 3 === 0) {
        // Update progress every 3 candidates
        io.emit("searchProgress", {
          searchId: searchHistoryId,
          status: `Evaluating candidate ${i + 1}/${uniqueCandidates.length}: ${candidate.name}`,
          progress: 80 + (i / uniqueCandidates.length) * 15,
          candidatesFound: uniqueCandidates.length,
        })
      }
    }

    // Sort by match score and limit to requested count
    const sortedCandidates = uniqueCandidates
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, searchSettings.candidateCount)

    console.log(`Final result: ${sortedCandidates.length} candidates selected`)

    // Calculate actual cost
    const actualCost = (totalTokensUsed * 0.0002) / 1000 // Rough estimate based on token usage

    await SearchHistory.findByIdAndUpdate(searchHistoryId, {
      results: sortedCandidates,
      candidatesFound: sortedCandidates.length,
      status: "completed",
      completedAt: new Date(),
      cost: {
        estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
        actualCost: actualCost,
        tokensUsed: totalTokensUsed,
        apiCalls: totalApiCalls,
      },
    })

    io.emit("searchComplete", {
      searchId: searchHistoryId,
      candidates: sortedCandidates,
    })

    const notification = new Notification({
      message: `Search complete! Found ${sortedCandidates.length} top candidates for ${job.context}. Cost: ${actualCost.toFixed(4)}`,
      recipientId: recruiterId,
      jobId: job._id,
    })
    await notification.save()

    io.emit("newNotification", notification)
  } catch (error) {
    console.error("Search process error:", error.message)

    // Calculate partial cost even on failure
    const partialCost = (totalTokensUsed * 0.0002) / 1000

    await SearchHistory.findByIdAndUpdate(searchHistoryId, {
      status: "failed",
      cost: {
        estimatedCost: (await SearchHistory.findById(searchHistoryId)).cost.estimatedCost,
        actualCost: partialCost,
        tokensUsed: totalTokensUsed,
        apiCalls: totalApiCalls,
      },
    })

    io.emit("searchError", {
      searchId: searchHistoryId,
      message: "An error occurred during the search process.",
    })
  }
}

export const getSearchHistory = async (req, res) => {
  try {
    const { recruiterId } = req.params
    const searches = await SearchHistory.find({ recruiterId }).select("-results").sort({ createdAt: -1 }).limit(20)

    res.status(200).json({ success: true, searches })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}

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
      searchDetails: search,
    })
  } catch (error) {
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
        candidateName: candidate.name,
        email: candidate.email || "Not Available",
        mobile: candidate.phone || "Not Available",
        jobTitle: jobId,
        skills: candidate.skills || [],
        experience: candidate.summary,
        summary: candidate.summary,
        candidateStatus: "AI Sourced",
        matchingScoreDetails: {
          overallMatch: candidate.matchScore || 75,
        },
        aiSourced: true,
        sourceInfo: {
          platform: candidate.platform,
          profileUrl: candidate.profileUrl,
          linkedinProfileUrl: candidate.linkedinProfileUrl,
          portfolioUrl: candidate.portfolioUrl,
          sourcedAt: new Date(),
          sourcedBy: recruiterId,
          aiModel: "gpt-4o",
          hasEmail: !!candidate.email,
        },
      }

      const resume = new Resume(resumeData)
      await resume.save()
      savedResumes.push(resume)
    }

    const notification = new Notification({
      message: `${candidates.length} candidates added to workflow for ${job.context}`,
      recipientId: recruiterId,
      jobId: jobId,
    })
    await notification.save()

    res.status(200).json({
      success: true,
      message: `${savedResumes.length} candidates successfully added to workflow.`,
    })
  } catch (error) {
    console.error("Error adding candidates to workflow:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
}

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
