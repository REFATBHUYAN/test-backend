// linkedinHeadhunterController.js
import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { OpenAI } from "openai";
import mongoose from "mongoose";
import { io } from "../../index.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// LinkedIn Headhunter Schema
const linkedinSearchSchema = new mongoose.Schema({
  recruiterId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", required: true },
  searchQuery: String,
  status: {
    type: String,
    enum: ["pending", "searching", "extracting", "evaluating", "completed", "failed", "stopped"],
    default: "pending"
  },
  candidates: [{
    name: String,
    title: String,
    company: String,
    location: String,
    profileUrl: String,
    summary: String,
    experience: String,
    skills: [String],
    education: String,
    connectionLevel: String,
    profileImage: String,
    matchScore: Number,
    evaluation: {
      skillsMatch: Number,
      experienceMatch: Number,
      overallMatch: Number,
      recommendation: String,
      reasoning: String
    },
    extractedAt: { type: Date, default: Date.now }
  }],
  searchSettings: Object,
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
});

const LinkedinSearch = mongoose.model("LinkedinSearch", linkedinSearchSchema);

class LinkedInHeadhunter {
  constructor() {
    this.driver = null;
    this.isLoggedIn = false;
    this.searchInProgress = false;
  }

  // Initialize Chrome driver with stealth options
  async initializeDriver() {
    try {
      const chromeOptions = new chrome.Options();
      
      // Stealth options to avoid detection
      chromeOptions.addArguments([
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1366,768',
        '--start-maximized'
      ]);

      // Remove automation indicators
      chromeOptions.setUserPreferences({
        'profile.default_content_setting_values.notifications': 2,
        'profile.managed_default_content_settings.images': 2
      });

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(chromeOptions)
        .build();

      // Execute script to remove webdriver property
      await this.driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
      
      console.log("Chrome driver initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize Chrome driver:", error.message);
      return false;
    }
  }

  // Login to LinkedIn
  async loginToLinkedIn(email, password) {
    try {
      if (!this.driver) {
        throw new Error("Driver not initialized");
      }

      console.log("Navigating to LinkedIn login page...");
      await this.driver.get('https://www.linkedin.com/login');
      
      // Wait for page load
      await this.driver.sleep(2000 + Math.random() * 2000);

      // Find and fill email
      const emailField = await this.driver.wait(
        until.elementLocated(By.id('username')), 
        10000
      );
      await this.humanTypeText(emailField, email);

      // Find and fill password
      const passwordField = await this.driver.findElement(By.id('password'));
      await this.humanTypeText(passwordField, password);

      // Click login button
      const loginButton = await this.driver.findElement(By.css('button[type="submit"]'));
      await this.humanClick(loginButton);

      // Wait for login to complete
      await this.driver.sleep(3000 + Math.random() * 2000);

      // Check if login was successful
      const currentUrl = await this.driver.getCurrentUrl();
      if (currentUrl.includes('/feed/') || currentUrl.includes('/in/')) {
        console.log("LinkedIn login successful");
        this.isLoggedIn = true;
        return true;
      } else {
        // Handle potential 2FA or security checks
        console.log("Login may require additional verification");
        await this.driver.sleep(5000);
        
        const finalUrl = await this.driver.getCurrentUrl();
        if (finalUrl.includes('/feed/') || finalUrl.includes('/in/')) {
          this.isLoggedIn = true;
          return true;
        }
        
        throw new Error("Login failed - please check credentials or handle security verification");
      }
    } catch (error) {
      console.error("LinkedIn login failed:", error.message);
      this.isLoggedIn = false;
      return false;
    }
  }

  // Human-like typing simulation
  async humanTypeText(element, text) {
    await element.clear();
    for (let char of text) {
      await element.sendKeys(char);
      await this.driver.sleep(50 + Math.random() * 150); // Random delay between keystrokes
    }
  }

  // Human-like clicking with random delays
  async humanClick(element) {
    await this.driver.sleep(500 + Math.random() * 1000);
    await this.driver.executeScript("arguments[0].scrollIntoView(true);", element);
    await this.driver.sleep(200 + Math.random() * 300);
    await element.click();
  }

  // Generate LinkedIn boolean search query using AI
  async generateLinkedInSearchQuery(jobDescription, searchSettings) {
    const prompt = `
      Create a highly effective LinkedIn boolean search query for finding candidates.
      
      **Job Details:**
      - Position: ${jobDescription.context}
      - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "N/A"}
      - Top Skills: ${jobDescription.topskills?.join(", ") || "N/A"}
      - Experience Level: ${searchSettings.experienceLevel || "Any"}
      - Location: ${searchSettings.location || "Any"}
      
      **LinkedIn Boolean Search Rules:**
      - Use AND, OR, NOT operators
      - Use quotes for exact phrases
      - Use parentheses for grouping
      - Target current and past job titles
      - Include relevant skills and keywords
      - Consider location if specified
      - Avoid overly restrictive queries
      
      **Examples:**
      - ("Software Engineer" OR "Senior Developer") AND (Python OR Java) AND "San Francisco"
      - "Product Manager" AND ("B2B SaaS" OR "Enterprise Software") AND ("5 years" OR "Senior")
      
      Generate ONE optimized LinkedIn boolean search query (max 200 characters):
      
      Return only the search query without explanations.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: prompt }],
        max_tokens: 100,
        temperature: 0.3
      });

      const searchQuery = response.choices[0].message.content.trim();
      console.log("Generated LinkedIn search query:", searchQuery);
      return searchQuery;
    } catch (error) {
      console.error("Error generating search query:", error.message);
      // Fallback query
      return `"${jobDescription.context}" AND "${searchSettings.location || 'United States'}"`;
    }
  }

  // Perform LinkedIn search
  async performLinkedInSearch(searchQuery, maxResults = 25) {
    try {
      if (!this.isLoggedIn) {
        throw new Error("Not logged in to LinkedIn");
      }

      console.log(`Performing LinkedIn search: ${searchQuery}`);
      
      // Navigate to LinkedIn search
      await this.driver.get('https://www.linkedin.com/search/results/people/');
      await this.driver.sleep(2000 + Math.random() * 1000);

      // Find search box and enter query
      const searchBox = await this.driver.wait(
        until.elementLocated(By.css('input[placeholder*="Search"]')),
        10000
      );
      
      await this.humanTypeText(searchBox, searchQuery);
      await searchBox.sendKeys(Key.RETURN);
      
      // Wait for search results
      await this.driver.sleep(3000 + Math.random() * 2000);

      const candidates = [];
      let currentPage = 1;
      const maxPages = Math.ceil(maxResults / 10);

      while (candidates.length < maxResults && currentPage <= maxPages) {
        console.log(`Scraping page ${currentPage}...`);
        
        // Wait for results to load
        await this.driver.wait(
          until.elementsLocated(By.css('.reusable-search__result-container')),
          10000
        );

        // Extract candidate information from current page
        const pageResults = await this.extractCandidatesFromPage();
        candidates.push(...pageResults);

        console.log(`Found ${pageResults.length} candidates on page ${currentPage}`);

        // Check if there's a next page
        if (candidates.length < maxResults && currentPage < maxPages) {
          const nextButton = await this.driver.findElements(
            By.css('button[aria-label="Next"]')
          );
          
          if (nextButton.length > 0 && await nextButton[0].isEnabled()) {
            await this.humanClick(nextButton[0]);
            await this.driver.sleep(3000 + Math.random() * 2000);
            currentPage++;
          } else {
            break; // No more pages
          }
        } else {
          break;
        }
      }

      console.log(`LinkedIn search completed. Found ${candidates.length} candidates.`);
      return candidates.slice(0, maxResults);
    } catch (error) {
      console.error("LinkedIn search failed:", error.message);
      return [];
    }
  }

  // Extract candidate information from search results page
  async extractCandidatesFromPage() {
    try {
      const candidates = [];
      const resultContainers = await this.driver.findElements(
        By.css('.reusable-search__result-container')
      );

      for (let i = 0; i < resultContainers.length; i++) {
        try {
          const container = resultContainers[i];
          
          // Extract candidate information
          const candidate = await this.extractCandidateInfo(container);
          if (candidate && candidate.name) {
            candidates.push(candidate);
          }
          
          // Random delay between extractions
          await this.driver.sleep(200 + Math.random() * 500);
        } catch (error) {
          console.error(`Error extracting candidate ${i}:`, error.message);
          continue;
        }
      }

      return candidates;
    } catch (error) {
      console.error("Error extracting candidates from page:", error.message);
      return [];
    }
  }

  // Extract individual candidate information
  async extractCandidateInfo(container) {
    try {
      const candidate = {
        name: null,
        title: null,
        company: null,
        location: null,
        profileUrl: null,
        summary: null,
        connectionLevel: null,
        profileImage: null
      };

      // Extract name and profile URL
      try {
        const nameElement = await container.findElement(
          By.css('.entity-result__title-text a span[aria-hidden="true"]')
        );
        candidate.name = await nameElement.getText();
        
        const profileLink = await container.findElement(
          By.css('.entity-result__title-text a')
        );
        candidate.profileUrl = await profileLink.getAttribute('href');
      } catch (e) {
        console.log("Could not extract name/URL");
      }

      // Extract current title and company
      try {
        const titleElement = await container.findElement(
          By.css('.entity-result__primary-subtitle')
        );
        const titleText = await titleElement.getText();
        candidate.title = titleText;

        // Try to separate title and company
        const titleParts = titleText.split(' at ');
        if (titleParts.length > 1) {
          candidate.title = titleParts[0].trim();
          candidate.company = titleParts[1].trim();
        }
      } catch (e) {
        console.log("Could not extract title/company");
      }

      // Extract location
      try {
        const locationElement = await container.findElement(
          By.css('.entity-result__secondary-subtitle')
        );
        candidate.location = await locationElement.getText();
      } catch (e) {
        console.log("Could not extract location");
      }

      // Extract connection level
      try {
        const connectionElement = await container.findElement(
          By.css('.entity-result__badge-text')
        );
        candidate.connectionLevel = await connectionElement.getText();
      } catch (e) {
        // Connection level not always available
      }

      // Extract profile image
      try {
        const imageElement = await container.findElement(
          By.css('.entity-result__item img')
        );
        candidate.profileImage = await imageElement.getAttribute('src');
      } catch (e) {
        // Profile image not always available
      }

      // Extract summary (if available)
      try {
        const summaryElement = await container.findElement(
          By.css('.entity-result__summary')
        );
        candidate.summary = await summaryElement.getText();
      } catch (e) {
        // Summary not always available in search results
      }

      return candidate;
    } catch (error) {
      console.error("Error extracting candidate info:", error.message);
      return null;
    }
  }

  // Get detailed candidate profile information
  async getDetailedCandidateInfo(candidate) {
    try {
      if (!candidate.profileUrl) {
        return candidate;
      }

      console.log(`Getting detailed info for: ${candidate.name}`);
      
      // Navigate to profile page
      await this.driver.get(candidate.profileUrl);
      await this.driver.sleep(2000 + Math.random() * 2000);

      // Extract additional information from profile page
      const detailedInfo = { ...candidate };

      // Extract experience
      try {
        const experienceSection = await this.driver.findElements(
          By.css('#experience ~ .pvs-list__container .pvs-list__item-wrapper')
        );
        
        const experiences = [];
        for (let i = 0; i < Math.min(3, experienceSection.length); i++) {
          try {
            const expElement = experienceSection[i];
            const expText = await expElement.getText();
            experiences.push(expText);
          } catch (e) {
            continue;
          }
        }
        detailedInfo.experience = experiences.join('\n---\n');
      } catch (e) {
        console.log("Could not extract experience");
      }

      // Extract skills
      try {
        const skillsElements = await this.driver.findElements(
          By.css('#skills ~ .pvs-list__container .pvs-list__item-wrapper')
        );
        
        const skills = [];
        for (let i = 0; i < Math.min(10, skillsElements.length); i++) {
          try {
            const skillElement = skillsElements[i];
            const skillText = await skillElement.getText();
            const skillName = skillText.split('\n')[0]; // Get first line which is usually the skill name
            skills.push(skillName);
          } catch (e) {
            continue;
          }
        }
        detailedInfo.skills = skills;
      } catch (e) {
        console.log("Could not extract skills");
      }

      // Extract education
      try {
        const educationSection = await this.driver.findElements(
          By.css('#education ~ .pvs-list__container .pvs-list__item-wrapper')
        );
        
        const educations = [];
        for (let i = 0; i < Math.min(2, educationSection.length); i++) {
          try {
            const eduElement = educationSection[i];
            const eduText = await eduElement.getText();
            educations.push(eduText);
          } catch (e) {
            continue;
          }
        }
        detailedInfo.education = educations.join('\n---\n');
      } catch (e) {
        console.log("Could not extract education");
      }

      // Random delay before returning to search results
      await this.driver.sleep(1000 + Math.random() * 2000);
      
      return detailedInfo;
    } catch (error) {
      console.error(`Error getting detailed info for ${candidate.name}:`, error.message);
      return candidate; // Return basic info if detailed extraction fails
    }
  }

  // Evaluate candidate match using AI
  async evaluateCandidate(candidate, jobDescription, searchSettings) {
    const prompt = `
      Evaluate this LinkedIn candidate for the job position.
      
      **Job Requirements:**
      - Position: ${jobDescription.context}
      - Required Skills: ${jobDescription.requiredSkills?.join(", ") || "N/A"}
      - Top Skills: ${jobDescription.topskills?.join(", ") || "N/A"}
      - Experience Level: ${searchSettings.experienceLevel || "Any"}
      - Location: ${searchSettings.location || "Any"}
      
      **Candidate Information:**
      - Name: ${candidate.name}
      - Current Title: ${candidate.title || "N/A"}
      - Company: ${candidate.company || "N/A"}
      - Location: ${candidate.location || "N/A"}
      - Skills: ${candidate.skills?.join(", ") || "N/A"}
      - Experience: ${candidate.experience || "N/A"}
      - Education: ${candidate.education || "N/A"}
      - Summary: ${candidate.summary || "N/A"}
      
      Rate the candidate on a scale of 0-100 for:
      1. Skills Match
      2. Experience Match
      3. Overall Match
      
      Provide a recommendation: "Highly Recommended", "Recommended", "Consider", or "Not Recommended"
      
      Return ONLY a JSON object:
      {
        "skillsMatch": 0-100,
        "experienceMatch": 0-100,
        "overallMatch": 0-100,
        "recommendation": "recommendation here",
        "reasoning": "brief explanation"
      }
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: prompt }],
        max_tokens: 500,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const evaluation = JSON.parse(response.choices[0].message.content);
      
      return {
        skillsMatch: evaluation.skillsMatch || 0,
        experienceMatch: evaluation.experienceMatch || 0,
        overallMatch: evaluation.overallMatch || 0,
        recommendation: evaluation.recommendation || "Not Recommended",
        reasoning: evaluation.reasoning || "Unable to evaluate"
      };
    } catch (error) {
      console.error("Error evaluating candidate:", error.message);
      return {
        skillsMatch: 0,
        experienceMatch: 0,
        overallMatch: 0,
        recommendation: "Not Recommended",
        reasoning: "Evaluation failed"
      };
    }
  }

  // Clean up driver
  async cleanup() {
    try {
      if (this.driver) {
        await this.driver.quit();
        this.driver = null;
        this.isLoggedIn = false;
        console.log("Chrome driver cleaned up");
      }
    } catch (error) {
      console.error("Error cleaning up driver:", error.message);
    }
  }
}

// Main controller functions
export const startLinkedInHeadhunterSearch = async (req, res) => {
  try {
    const { jobId, searchSettings, recruiterId, linkedinCredentials } = req.body;

    if (!jobId || !searchSettings || !recruiterId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    if (!linkedinCredentials?.email || !linkedinCredentials?.password) {
      return res.status(400).json({
        success: false,
        error: "LinkedIn credentials are required"
      });
    }

    // Get job description
    const JobDescription = mongoose.model('JobDescription');
    const job = await JobDescription.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found"
      });
    }

    // Create search record
    const linkedinSearch = new LinkedinSearch({
      recruiterId,
      jobId,
      searchSettings,
      status: "pending"
    });
    await linkedinSearch.save();

    res.status(200).json({
      success: true,
      message: "LinkedIn headhunter search started",
      searchId: linkedinSearch._id
    });

    // Start the search process asynchronously
    performLinkedInHeadhunterSearch(linkedinSearch._id, job, searchSettings, linkedinCredentials);
  } catch (error) {
    console.error("Error starting LinkedIn search:", error.message);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Main search execution function
async function performLinkedInHeadhunterSearch(searchId, job, searchSettings, linkedinCredentials) {
  const headhunter = new LinkedInHeadhunter();
  
  try {
    // Update status
    await LinkedinSearch.findByIdAndUpdate(searchId, { status: "pending" });
    
    // Emit progress
    io.emit("linkedinSearchProgress", {
      searchId,
      status: "Initializing LinkedIn headhunter...",
      progress: 10
    });

    // Initialize driver
    const driverInitialized = await headhunter.initializeDriver();
    if (!driverInitialized) {
      throw new Error("Failed to initialize Chrome driver");
    }

    io.emit("linkedinSearchProgress", {
      searchId,
      status: "Logging in to LinkedIn...",
      progress: 20
    });

    // Login to LinkedIn
    const loginSuccess = await headhunter.loginToLinkedIn(
      linkedinCredentials.email,
      linkedinCredentials.password
    );
    
    if (!loginSuccess) {
      throw new Error("LinkedIn login failed");
    }

    io.emit("linkedinSearchProgress", {
      searchId,
      status: "Generating AI-powered search query...",
      progress: 30
    });

    // Generate search query
    const searchQuery = await headhunter.generateLinkedInSearchQuery(job, searchSettings);
    
    // Update search record with query
    await LinkedinSearch.findByIdAndUpdate(searchId, { 
      searchQuery,
      status: "searching"
    });

    io.emit("linkedinSearchProgress", {
      searchId,
      status: `Searching LinkedIn: "${searchQuery}"`,
      progress: 40
    });

    // Perform search
    const maxResults = Math.min(searchSettings.candidateCount || 25, 50);
    const candidates = await headhunter.performLinkedInSearch(searchQuery, maxResults);

    if (candidates.length === 0) {
      throw new Error("No candidates found");
    }

    io.emit("linkedinSearchProgress", {
      searchId,
      status: `Found ${candidates.length} candidates. Extracting detailed information...`,
      progress: 60
    });

    // Update status
    await LinkedinSearch.findByIdAndUpdate(searchId, { status: "extracting" });

    // Get detailed information for top candidates
    const detailedCandidates = [];
    for (let i = 0; i < Math.min(candidates.length, maxResults); i++) {
      const candidate = candidates[i];
      
      try {
        // Get detailed profile information
        const detailedCandidate = await headhunter.getDetailedCandidateInfo(candidate);
        detailedCandidates.push(detailedCandidate);

        // Emit progress
        if (i % 3 === 0 || i === candidates.length - 1) {
          io.emit("linkedinSearchProgress", {
            searchId,
            status: `Processing candidate ${i + 1}/${candidates.length}: ${candidate.name}`,
            progress: 60 + ((i / candidates.length) * 20)
          });
        }
      } catch (error) {
        console.error(`Error processing candidate ${candidate.name}:`, error.message);
        detailedCandidates.push(candidate); // Add basic info if detailed extraction fails
      }
    }

    io.emit("linkedinSearchProgress", {
      searchId,
      status: "AI evaluating candidates...",
      progress: 80
    });

    // Update status
    await LinkedinSearch.findByIdAndUpdate(searchId, { status: "evaluating" });

    // Evaluate candidates with AI
    const evaluatedCandidates = [];
    for (let i = 0; i < detailedCandidates.length; i++) {
      const candidate = detailedCandidates[i];
      
      try {
        const evaluation = await headhunter.evaluateCandidate(candidate, job, searchSettings);
        
        const evaluatedCandidate = {
          ...candidate,
          matchScore: evaluation.overallMatch,
          evaluation
        };
        
        evaluatedCandidates.push(evaluatedCandidate);

        // Emit progress
        if (i % 2 === 0 || i === detailedCandidates.length - 1) {
          io.emit("linkedinSearchProgress", {
            searchId,
            status: `AI evaluating candidate ${i + 1}/${detailedCandidates.length}`,
            progress: 80 + ((i / detailedCandidates.length) * 15)
          });
        }
      } catch (error) {
        console.error(`Error evaluating candidate ${candidate.name}:`, error.message);
        evaluatedCandidates.push({
          ...candidate,
          matchScore: 0,
          evaluation: {
            skillsMatch: 0,
            experienceMatch: 0,
            overallMatch: 0,
            recommendation: "Not Recommended",
            reasoning: "Evaluation failed"
          }
        });
      }
    }

    // Sort by match score
    evaluatedCandidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // Save results
    await LinkedinSearch.findByIdAndUpdate(searchId, {
      candidates: evaluatedCandidates,
      status: "completed",
      completedAt: new Date()
    });

    io.emit("linkedinSearchProgress", {
      searchId,
      status: "LinkedIn search completed!",
      progress: 100
    });

    // Emit completion
    io.emit("linkedinSearchComplete", {
      searchId,
      candidates: evaluatedCandidates,
      message: `Found ${evaluatedCandidates.length} candidates from LinkedIn`
    });

    console.log(`LinkedIn search completed successfully. Found ${evaluatedCandidates.length} candidates.`);
  } catch (error) {
    console.error("LinkedIn search failed:", error.message);
    
    // Update status
    await LinkedinSearch.findByIdAndUpdate(searchId, {
      status: "failed",
      completedAt: new Date()
    });

    // Emit error
    io.emit("linkedinSearchError", {
      searchId,
      error: error.message
    });
  } finally {
    // Always cleanup the driver
    await headhunter.cleanup();
  }
}

// Get LinkedIn search results
export const getLinkedInSearchResults = async (req, res) => {
  try {
    const { searchId } = req.params;
    
    const search = await LinkedinSearch.findById(searchId);
    if (!search) {
      return res.status(404).json({
        success: false,
        error: "Search not found"
      });
    }

    res.status(200).json({
      success: true,
      search: {
        id: search._id,
        status: search.status,
        searchQuery: search.searchQuery,
        candidates: search.candidates,
        createdAt: search.createdAt,
        completedAt: search.completedAt
      }
    });
  } catch (error) {
    console.error("Error getting LinkedIn search results:", error.message);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// Stop LinkedIn search
export const stopLinkedInSearch = async (req, res) => {
  try {
    const { searchId } = req.body;
    
    await LinkedinSearch.findByIdAndUpdate(searchId, {
      status: "stopped",
      completedAt: new Date()
    });

    io.emit("linkedinSearchStopped", { searchId });

    res.status(200).json({
      success: true,
      message: "LinkedIn search stopped"
    });
  } catch (error) {
    console.error("Error stopping LinkedIn search:", error.message);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

export default LinkedInHeadhunter;