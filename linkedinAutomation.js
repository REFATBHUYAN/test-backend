import { chromium } from "playwright"
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import dotenv from "dotenv"
dotenv.config()

const BROWSER_CONFIG = {
  development: {
    headless: false,
    slowMo: 10,
    devtools: true,
  },
  production: {
    headless: false,
    slowMo: 10,
    devtools: true,
  },
}

console.log("OPENAI_API_KEY: page 2", process.env.OPENAI_API_KEY);

class EnhancedLinkedInAutomation {
  constructor() {
    this.browser = null
    this.context = null
    this.page = null
    this.isLoggedIn = false
  }

  async initializeBrowser(env = "production") {
    try {
      const config = BROWSER_CONFIG[env] || BROWSER_CONFIG.development

      console.log(`🚀 Initializing browser in ${env} mode`)

      this.browser = await chromium.launch({
        headless: config.headless,
        slowMo: config.slowMo,
        devtools: config.devtools,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
        ],
      })

      this.context = await this.browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1366, height: 768 },
        locale: "en-US",
        timezoneId: "America/New_York",
      })

      this.page = await this.context.newPage()
      
      // Only block heavy media, keep CSS for better extraction
      await this.page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2}", (route) => route.abort())

      console.log("✅ Browser initialized successfully")
      return true
    } catch (error) {
      console.error("❌ Error initializing browser:", error.message)
      return false
    }
  }

  async loginToLinkedIn(email, password) {
    try {
      if (!this.page) {
        throw new Error("Browser not initialized")
      }

      console.log("🔐 Attempting LinkedIn login...")

      await this.page.goto("https://www.linkedin.com/login", {
        waitUntil: "networkidle",
        timeout: 30000,
      })

      await this.page.waitForSelector("#username", { timeout: 10000 })
      await this.page.fill("#username", email)
      await this.page.fill("#password", password)
      await this.page.click('button[type="submit"]')
      await this.page.waitForTimeout(3000)

      const currentUrl = this.page.url()

      if (currentUrl.includes("/challenge/")) {
        console.log("⚠️ LinkedIn security challenge detected")
        await this.handleSecurityChallenge()
      } else if (currentUrl.includes("/feed/") || currentUrl.includes("/in/")) {
        console.log("✅ Successfully logged into LinkedIn")
        this.isLoggedIn = true
        return { success: true, message: "Logged in successfully" }
      } else {
        console.log("❌ Login failed - unexpected redirect")
        return { success: false, message: "Login failed - unexpected redirect" }
      }

      return { success: true, message: "Login completed" }
    } catch (error) {
      console.error("❌ Login error:", error.message)
      return { success: false, message: `Login failed: ${error.message}` }
    }
  }

  async handleSecurityChallenge() {
    try {
      console.log("🛡️ Handling LinkedIn security challenge...")

      const emailVerification = await this.page.locator('[data-test-id="email-pin-challenge"]').isVisible()
      if (emailVerification) {
        console.log("📧 Email verification required. Please check your email and manually enter the code.")
        if (!BROWSER_CONFIG.production.headless) {
          await this.page.waitForTimeout(60000)
        }
      }

      const phoneVerification = await this.page.locator('[data-test-id="phone-pin-challenge"]').isVisible()
      if (phoneVerification) {
        console.log("📱 Phone verification required. Please check your phone and manually enter the code.")
        if (!BROWSER_CONFIG.production.headless) {
          await this.page.waitForTimeout(60000)
        }
      }
    } catch (error) {
      console.error("❌ Error handling security challenge:", error.message)
    }
  }

  // Extract all text content from the page
  async extractAllPageText() {
    return await this.page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, noscript')
      scripts.forEach(el => el.remove())
      
      // Get all visible text
      return document.body.innerText || document.body.textContent || ''
    })
  }

  // Navigate to detailed sections and extract content
  async extractDetailedContent(profileUrl) {
    const detailedContent = {
      mainProfile: '',
      skills: '',
      experience: '',
      education: '',
      projects: '',
      certifications: '',
      volunteering: '',
      recommendations: ''
    }

    try {
      // Extract main profile content
      await this.page.goto(profileUrl, { waitUntil: "networkidle", timeout: 60000 })
      await this.page.waitForSelector("main", { timeout: 60000 })
      detailedContent.mainProfile = await this.extractAllPageText()

      // Extract detailed skills
      detailedContent.skills = await this.extractDetailedSkills(profileUrl)

      // Extract detailed experience
      detailedContent.experience = await this.extractDetailedExperience(profileUrl)

      // Extract detailed education  
      detailedContent.education = await this.extractDetailedEducation(profileUrl)

      // Extract projects
      detailedContent.projects = await this.extractDetailedProjects(profileUrl)

      // Extract certifications
      detailedContent.certifications = await this.extractDetailedCertifications(profileUrl)

      // Extract volunteering
      detailedContent.volunteering = await this.extractDetailedVolunteering(profileUrl)

      // Extract recommendations
      detailedContent.recommendations = await this.extractDetailedRecommendations(profileUrl)

      return detailedContent

    } catch (error) {
      console.error("Error extracting detailed content:", error.message)
      return detailedContent
    }
  }

  async extractDetailedSkills(profileUrl) {
    try {
      // Look for skills detail link
      const skillsSelectors = [
        'a[href*="/details/skills/"]',
        '#navigation-index-Show-all-skills',
        '.pvs-list__footer-wrapper a[href*="skills"]'
      ]

      for (const selector of skillsSelectors) {
        try {
          const skillsLink = await this.page.locator(selector).first()
          if (await skillsLink.isVisible()) {
            console.log("📊 Navigating to skills detail page...")
            await skillsLink.click()
            await this.page.waitForTimeout(3000)
            
            const skillsText = await this.extractAllPageText()
            
            // Navigate back using browser back button
            await this.goBackToProfile(profileUrl)
            return skillsText
          }
        } catch (e) {
          continue
        }
      }

      console.log("No detailed skills page found, using main page skills")
      return ""
    } catch (error) {
      console.error("Error extracting detailed skills:", error.message)
      return ""
    }
  }

  async extractDetailedExperience(profileUrl) {
    try {
      const experienceSelectors = [
        'a[href*="/details/experience/"]',
        '#navigation-index-see-all-experience',
        '.pvs-list__footer-wrapper a[href*="experience"]'
      ]

      for (const selector of experienceSelectors) {
        try {
          const experienceLink = await this.page.locator(selector).first()
          if (await experienceLink.isVisible()) {
            console.log("💼 Navigating to experience detail page...")
            await experienceLink.click()
            await this.page.waitForTimeout(3000)
            
            const experienceText = await this.extractAllPageText()
            
            await this.goBackToProfile(profileUrl)
            return experienceText
          }
        } catch (e) {
          continue
        }
      }

      return ""
    } catch (error) {
      console.error("Error extracting detailed experience:", error.message)
      return ""
    }
  }

  async extractDetailedEducation(profileUrl) {
    try {
      const educationSelectors = [
        'a[href*="/details/education/"]',
        '#navigation-index-see-all-education',
        '.pvs-list__footer-wrapper a[href*="education"]'
      ]

      for (const selector of educationSelectors) {
        try {
          const educationLink = await this.page.locator(selector).first()
          if (await educationLink.isVisible()) {
            console.log("🎓 Navigating to education detail page...")
            await educationLink.click()
            await this.page.waitForTimeout(3000)
            
            const educationText = await this.extractAllPageText()
            
            await this.goBackToProfile(profileUrl)
            return educationText
          }
        } catch (e) {
          continue
        }
      }

      return ""
    } catch (error) {
      console.error("Error extracting detailed education:", error.message)
      return ""
    }
  }

  async extractDetailedProjects(profileUrl) {
    try {
      const projectsSelectors = [
        'a[href*="/details/projects/"]',
        '#navigation-index-see-all-projects',
        '.pvs-list__footer-wrapper a[href*="projects"]'
      ]

      for (const selector of projectsSelectors) {
        try {
          const projectsLink = await this.page.locator(selector).first()
          if (await projectsLink.isVisible()) {
            console.log("📁 Navigating to projects detail page...")
            await projectsLink.click()
            await this.page.waitForTimeout(3000)
            
            const projectsText = await this.extractAllPageText()
            
            await this.goBackToProfile(profileUrl)
            return projectsText
          }
        } catch (e) {
          continue
        }
      }

      return ""
    } catch (error) {
      console.error("Error extracting detailed projects:", error.message)
      return ""
    }
  }

  async extractDetailedCertifications(profileUrl) {
    try {
      const certificationSelectors = [
        'a[href*="/details/certifications/"]',
        'a[href*="/details/licenses-and-certifications/"]',
        '.pvs-list__footer-wrapper a[href*="certifications"]'
      ]

      for (const selector of certificationSelectors) {
        try {
          const certLink = await this.page.locator(selector).first()
          if (await certLink.isVisible()) {
            console.log("🏆 Navigating to certifications detail page...")
            await certLink.click()
            await this.page.waitForTimeout(3000)
            
            const certText = await this.extractAllPageText()
            
            await this.goBackToProfile(profileUrl)
            return certText
          }
        } catch (e) {
          continue
        }
      }

      return ""
    } catch (error) {
      console.error("Error extracting detailed certifications:", error.message)
      return ""
    }
  }

  async extractDetailedVolunteering(profileUrl) {
    try {
      const volunteeringSelectors = [
        'a[href*="/details/volunteering-experiences/"]',
        'a[href*="/details/volunteering/"]',
        '.pvs-list__footer-wrapper a[href*="volunteering"]'
      ]

      for (const selector of volunteeringSelectors) {
        try {
          const volunteeringLink = await this.page.locator(selector).first()
          if (await volunteeringLink.isVisible()) {
            console.log("🤝 Navigating to volunteering detail page...")
            await volunteeringLink.click()
            await this.page.waitForTimeout(3000)
            
            const volunteeringText = await this.extractAllPageText()
            
            await this.goBackToProfile(profileUrl)
            return volunteeringText
          }
        } catch (e) {
          continue
        }
      }

      return ""
    } catch (error) {
      console.error("Error extracting detailed volunteering:", error.message)
      return ""
    }
  }

  async extractDetailedRecommendations(profileUrl) {
    try {
      const recommendationsSelectors = [
        'a[href*="/details/recommendations/"]',
        '.pvs-list__footer-wrapper a[href*="recommendations"]'
      ]

      for (const selector of recommendationsSelectors) {
        try {
          const recLink = await this.page.locator(selector).first()
          if (await recLink.isVisible()) {
            console.log("💬 Navigating to recommendations detail page...")
            await recLink.click()
            await this.page.waitForTimeout(3000)
            
            const recText = await this.extractAllPageText()
            
            await this.goBackToProfile(profileUrl)
            return recText
          }
        } catch (e) {
          continue
        }
      }

      return ""
    } catch (error) {
      console.error("Error extracting detailed recommendations:", error.message)
      return ""
    }
  }

  async goBackToProfile(profileUrl) {
    try {
      // Try clicking back button first
      const backButtonSelectors = [
        'button[aria-label*="Back"]',
        'a[aria-label*="Back"]',
        '.artdeco-button--back',
        'svg[data-test-icon="arrow-left-small"]'
      ]

      for (const selector of backButtonSelectors) {
        try {
          const backButton = await this.page.locator(selector).first()
          if (await backButton.isVisible()) {
            await backButton.click()
            await this.page.waitForTimeout(2000)
            return
          }
        } catch (e) {
          continue
        }
      }

      // Fallback: navigate directly back to profile
      console.log("Back button not found, navigating directly to profile...")
      await this.page.goto(profileUrl, { waitUntil: "networkidle", timeout: 30000 })
      await this.page.waitForTimeout(2000)
    } catch (error) {
      console.error("Error going back to profile:", error.message)
      // Force navigation back to profile as last resort
      await this.page.goto(profileUrl, { waitUntil: "networkidle", timeout: 30000 })
    }
  }

  async processWithAI2(textContent) {
    try {
      

      // Initialize the model
      const model = new ChatOpenAI({
        modelName: "gpt-4.1-2025-04-14",
        temperature: 0.1,
        maxTokens: 4000,
        openAIApiKey: process.env.OPENAI_API_KEY,
      });

      const systemPrompt = `You are an expert at analyzing LinkedIn profiles and extracting structured data. Always return valid JSON only, no additional text or formatting.`;

      const userPrompt = `
Please analyze the following LinkedIn profile text content and extract structured information. 
Return ONLY a valid JSON object with the following structure:

{
  "personalInfo": {
    "name": "",
    "headline": "",
    "location": "",
    "profileUrl": "",
    "website": "",
    "followerCount": "",
    "connectionCount": ""
  },
  "about": "",
  "experience": [
    {
      "title": "",
      "company": "",
      "companyUrl": "",
      "duration": "",
      "location": "",
      "description": "",
      "skills": []
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field": "",
      "duration": "",
      "grade": "",
      "activities": ""
    }
  ],
  "skills": [
    {
      "name": "",
      "endorsements": 0
    }
  ],
  "projects": [
    {
      "title": "",
      "description": "",
      "duration": "",
      "url": "",
      "skills": []
    }
  ],
  "certifications": [
    {
      "name": "",
      "issuer": "",
      "issueDate": "",
      "expirationDate": "",
      "credentialId": "",
      "credentialUrl": ""
    }
  ],
  "volunteering": [
    {
      "role": "",
      "organization": "",
      "duration": "",
      "cause": "",
      "description": ""
    }
  ],
  "recommendations": [
    {
      "recommender": "",
      "relationship": "",
      "text": ""
    }
  ],
  "languages": [
    {
      "language": "",
      "proficiency": ""
    }
  ]
}

LinkedIn Profile Text Content:
${textContent}

Remember: Return ONLY valid JSON, no additional text or formatting.
      `;

      // Create messages
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ];

      // Get response from OpenAI via LangChain
      const response = await model.invoke(messages);
      let responseText = response.content;

      // Clean up the response to extract JSON
      responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      try {
        return JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", parseError);
        console.log("Raw response:", responseText);
        return null;
      }

    } catch (error) {
      console.error("Error processing with LangChain OpenAI:", error.message);
      return null;
    }
  }
  async processWithAI(textContent) {
  try {
    // Check if API key exists
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY environment variable not found");
      return null;
    }

    // Initialize the model with explicit error handling
    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.1,
      // maxTokens: 4000,
      openAIApiKey: process.env.OPENAI_API_KEY,
      timeout: 60000, // 60 second timeout
    });

    const systemPrompt = `You are an expert at analyzing LinkedIn profiles and extracting structured data. Always return valid JSON only, no additional text or formatting.`;

    const userPrompt = `
Please analyze the following LinkedIn profile text content and extract structured information. 
Return ONLY a valid JSON object with the following structure:

{
  "personalInfo": {
    "name": "",
    "headline": "",
    "location": "",
    "profileUrl": "",
    "website": "",
    "followerCount": "",
    "connectionCount": ""
  },
  "about": "",
  "experience": [
    {
      "title": "",
      "company": "",
      "companyUrl": "",
      "duration": "",
      "location": "",
      "description": "",
      "skills": []
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field": "",
      "duration": "",
      "grade": "",
      "activities": ""
    }
  ],
  "skills": [
    {
      "name": "",
      "endorsements": 0
    }
  ],
  "projects": [
    {
      "title": "",
      "description": "",
      "duration": "",
      "url": "",
      "skills": []
    }
  ],
  "certifications": [
    {
      "name": "",
      "issuer": "",
      "issueDate": "",
      "expirationDate": "",
      "credentialId": "",
      "credentialUrl": ""
    }
  ],
  "volunteering": [
    {
      "role": "",
      "organization": "",
      "duration": "",
      "cause": "",
      "description": ""
    }
  ],
  "recommendations": [
    {
      "recommender": "",
      "relationship": "",
      "text": ""
    }
  ],
  "languages": [
    {
      "language": "",
      "proficiency": ""
    }
  ]
}

LinkedIn Profile Text Content:
${textContent}

Remember: Return ONLY valid JSON, no additional text or formatting.
    `;

    // Create messages
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ];

    console.log("🤖 Calling OpenAI via LangChain...");

    // Get response from OpenAI via LangChain
    const response = await model.invoke(messages);
    let responseText = response.content;

    // Clean up the response to extract JSON
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    try {
      const parsedData = JSON.parse(responseText);

      console.log("🤖 OpenAI response received and parsed", parsedData);
      console.log("✅ Successfully parsed AI response");
      return parsedData;
    } catch (parseError) {
      console.error("❌ Failed to parse AI response as JSON:", parseError);
      console.log("Raw response:", responseText);
      return null;
    }

  } catch (error) {
    console.error("❌ Error processing with LangChain OpenAI:", error.message);
    
    // More specific error handling
    if (error.message.includes('API key')) {
      console.error("🔑 OpenAI API Key issue. Please check your OPENAI_API_KEY environment variable");
    } else if (error.message.includes('timeout')) {
      console.error("⏰ Request timeout. The profile text might be too long or the API is slow");
    }
    
    return null;
  }
}

  async extractLinkedInProfile(profileUrl) {
    try {
      if (!this.isLoggedIn || !this.page) {
        throw new Error("Not logged in or browser not initialized")
      }

      console.log(`🔍 Starting comprehensive profile extraction: ${profileUrl}`)

      // Extract all detailed content
      const detailedContent = await this.extractDetailedContent(profileUrl)

      // Combine all text content
      const combinedText = Object.values(detailedContent)
        .filter(text => text && text.trim())
        .join('\n\n--- SECTION BREAK ---\n\n')

      console.log(`📝 Extracted ${combinedText.length} characters of text content`)

      // Process with AI
      console.log("🤖 Processing content with AI...")
      const structuredData = await this.processWithAI(combinedText)

      if (structuredData) {
        console.log("✅ Successfully processed profile with AI")
        console.log("Structured Data:", structuredData)
        return {
          success: true,
          message: "Profile extracted and processed successfully",
          data: structuredData,
          rawText: combinedText // Include raw text for debugging
        }
      } else {
        console.log("⚠️ AI processing failed, returning raw text")
        return {
          success: false,
          message: "AI processing failed",
          rawText: combinedText
        }
      }

    } catch (error) {
      console.error(`❌ Error during profile extraction: ${error.message}`)
      return {
        success: false,
        error: error.message,
        profileUrl: profileUrl
      }
    }
  }
  async extractMultipleProfiles(profileUrls, onProgress) {
  const results = []
  let processed = 0

  for (const url of profileUrls) {
    try {
      // Add delay between profiles to avoid rate limiting
      if (processed > 0) {
        await this.page.waitForTimeout(2000 + Math.random() * 3000) // 2-5 second delay
      }

      const result = await this.extractLinkedInProfile(url)
      results.push(result)
      processed++

      // Call progress callback if provided
      if (onProgress) {
        onProgress({
          processed,
          total: profileUrls.length,
          current: url,
          result,
        })
      }

      console.log(`Progress: ${processed}/${profileUrls.length} profiles processed`)
    } catch (error) {
      console.error(`Error processing ${url}:`, error.message)
      results.push({
        success: false,
        error: error.message,
        profileUrl: url,
      })
      processed++
    }
  }

  return results
}

async waitForRateLimit() {
  // Add random delay between 1-3 seconds to avoid rate limiting
  const delay = 1000 + Math.random() * 2000;
  console.log(`⏳ Rate limiting delay: ${Math.round(delay)}ms`);
  await this.page.waitForTimeout(delay);
}

  async closeBrowser() {
    try {
      if (this.browser) {
        await this.browser.close()
        this.browser = null
        this.context = null
        this.page = null
        this.isLoggedIn = false
        console.log("🔒 Browser closed successfully")
      }
    } catch (error) {
      console.error("❌ Error closing browser:", error.message)
    }
  }
}

// LinkedIn automation controller functions
const linkedInAutomation = new EnhancedLinkedInAutomation()

export const initializeLinkedInAutomation = async (req, res) => {
  try {
    const { environment = "development" } = req.body

    const success = await linkedInAutomation.initializeBrowser(environment)

    if (success) {
      res.status(200).json({
        success: true,
        message: `LinkedIn automation initialized in ${environment} mode`,
        headless: BROWSER_CONFIG[environment]?.headless || false,
      })
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to initialize browser",
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

export const loginLinkedInAutomation = async (req, res) => {
  try {
    // You can uncomment these lines to use request body instead of hardcoded values
    // const { email, password } = req.body;
    const email = "Cunard.consulting.dev@gmail.com"
    const password = "D0ft67ju01$"

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      })
    }

    const result = await linkedInAutomation.loginToLinkedIn(email, password)

    res.status(result.success ? 200 : 400).json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

export const extractLinkedInProfileAutomation = async (req, res) => {
  try {
    // You can uncomment this line to use request body instead of hardcoded value
    // const { profileUrl } = req.body;
    const profileUrl = "https://www.linkedin.com/in/refat-bhuyan/"

    if (!profileUrl) {
      return res.status(400).json({
        success: false,
        error: "Profile URL is required",
      })
    }

    const result = await linkedInAutomation.extractLinkedInProfile(profileUrl)
    console.log("result", result)

    res.status(result.success ? 200 : 400).json(result)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

export const closeLinkedInAutomation = async (req, res) => {
  try {
    await linkedInAutomation.closeBrowser()

    res.status(200).json({
      success: true,
      message: "LinkedIn automation closed successfully",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

export default linkedInAutomation



// had issure of not getting user information
// import { chromium } from "playwright-extra";
// import StealthPlugin from "puppeteer-extra-plugin-stealth";

// chromium.use(StealthPlugin());

// // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // Configuration
// const BROWSER_CONFIG = {
//   development: {
//     headless: true,
//     slowMo: 800,
//     // slowMo: 2000,
//     devtools: false,
//   },
//   production: {
//     headless: true,
//     slowMo: 800,
//     devtools: false,
//   },
// }

// class LinkedInAutomation {
//   constructor() {
//     this.browser = null
//     this.context = null
//     this.page = null
//     this.isLoggedIn = false
//   }

//   async initializeBrowser3(env = "production") {
//     try {
//       const config = BROWSER_CONFIG[env] || BROWSER_CONFIG.development

//       console.log(`🚀 Initializing browser in ${env} mode (headless: ${config.headless})`)

//       this.browser = await chromium.launch({
//         headless: config.headless,
//         slowMo: config.slowMo,
//         devtools: config.devtools,
//         args: [
//           "--no-sandbox",
//           "--disable-setuid-sandbox",
//           "--disable-dev-shm-usage",
//           "--disable-accelerated-2d-canvas",
//           "--no-first-run",
//           "--no-zygote",
//           "--single-process",
//           "--disable-gpu",
//         ],
//       })

//       this.context = await this.browser.newContext({
//         userAgent:
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         viewport: { width: 1366, height: 768 },
//         locale: "en-US",
//         timezoneId: "America/New_York",
//       })

//       this.page = await this.context.newPage()

//       // Block unnecessary resources to speed up loading
//       await this.page.route("**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}", (route) => route.abort())

//       console.log("✅ Browser initialized successfully")
//       return true
//     } catch (error) {
//       console.error("❌ Error initializing browser:", error.message)
//       return false
//     }
//   }
//   // Replace initializeBrowser metho

// async initializeBrowser2(env = "production") {
//     try {
//       const config = BROWSER_CONFIG[env] || BROWSER_CONFIG.development;
      
//       console.log(`🚀 Initializing stealth browser in ${env} mode`);

//       // Launch browser with stealth plugin already applied
//       this.browser = await chromium.launch({
//         headless: config.headless,
//         slowMo: config.slowMo,
//         devtools: config.devtools,
//         args: [
//           "--no-sandbox",
//           "--disable-setuid-sandbox",
//           "--disable-dev-shm-usage",
//           "--disable-accelerated-2d-canvas",
//           "--no-first-run",
//           "--no-zygote",
//           "--disable-gpu",
//           // Anti-detection args
//           "--disable-blink-features=AutomationControlled",
//           "--disable-features=VizDisplayCompositor",
//           "--disable-ipc-flooding-protection",
//           "--disable-renderer-backgrounding",
//           "--disable-backgrounding-occluded-windows",
//           "--disable-field-trial-config",
//           "--disable-back-forward-cache",
//           "--disable-hang-monitor",
//           "--disable-prompt-on-repost",
//           "--disable-sync",
//           "--disable-extensions-file-access-check",
//           "--disable-extensions-http-throttling",
//           "--aggressive-cache-discard",
//           "--force-color-profile=srgb",
//           "--disable-component-extensions-with-background-pages",
//           "--no-default-browser-check",
//           "--no-pings",
//           "--password-store=basic",
//           "--use-mock-keychain",
//           "--disable-component-update",
//         ],
//       });

//       this.context = await this.browser.newContext({
//         userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//         viewport: { width: 1366, height: 768 },
//         locale: "en-US",
//         timezoneId: "America/New_York",
//         permissions: ["geolocation", "notifications"],
//         geolocation: { latitude: 40.7128, longitude: -74.0060 },
//         colorScheme: "light",
//         extraHTTPHeaders: {
//           'Accept-Language': 'en-US,en;q=0.9',
//           'Accept-Encoding': 'gzip, deflate, br',
//           'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
//           'Sec-Fetch-Dest': 'document',
//           'Sec-Fetch-Mode': 'navigate',
//           'Sec-Fetch-Site': 'none',
//           'Upgrade-Insecure-Requests': '1',
//         }
//       });

//       this.page = await this.context.newPage();

//       // Additional stealth measures (stealth plugin handles most of this automatically)
//       await this.page.addInitScript(() => {
//         // Override any remaining webdriver traces
//         Object.defineProperty(navigator, 'webdriver', {
//           get: () => undefined,
//         });
        
//         // Remove automation indicators
//         delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
//         delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
//         delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
//       });

//       console.log("✅ Stealth browser initialized successfully");
//       return true;
//     } catch (error) {
//       console.error("❌ Error initializing stealth browser:", error.message);
//       return false;
//     }
//   }

//   async initializeBrowser(env = "production") {
//     try {
//       const config = BROWSER_CONFIG[env] || BROWSER_CONFIG.development;
      
//       console.log(`🚀 Initializing stealth browser in ${env} mode`);

//       // Launch browser with stealth plugin already applied via chromium.use()
//       this.browser = await chromium.launch({
//         headless: config.headless,
//         slowMo: config.slowMo,
//         devtools: config.devtools,
//         args: [
//           "--no-sandbox",
//           "--disable-setuid-sandbox",
//           "--disable-dev-shm-usage",
//           "--disable-blink-features=AutomationControlled",
//           "--exclude-switches=enable-automation",
//           "--disable-extensions",
//           "--disable-web-security",
//           "--disable-features=VizDisplayCompositor",
//           "--disable-ipc-flooding-protection",
//           "--no-first-run",
//           "--no-default-browser-check",
//           "--disable-backgrounding-occluded-windows",
//           "--disable-renderer-backgrounding",
//           "--disable-field-trial-config",
//           "--disable-back-forward-cache",
//           "--disable-hang-monitor"
//         ],
//       });

//       this.context = await this.browser.newContext({
//         userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
//         viewport: { width: 1920, height: 1080 },
//         locale: "en-US",
//         timezoneId: "America/New_York",
//         permissions: [],
//         colorScheme: "light",
//         extraHTTPHeaders: {
//           'Accept-Language': 'en-US,en;q=0.9',
//           'Accept-Encoding': 'gzip, deflate, br',
//           'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
//           'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
//           'sec-ch-ua-mobile': '?0',
//           'sec-ch-ua-platform': '"Windows"'
//         }
//       });

//       this.page = await this.context.newPage();

//       // Additional stealth measures
//       await this.page.addInitScript(() => {
//         // Override webdriver property
//         Object.defineProperty(navigator, 'webdriver', {
//           get: () => undefined,
//         });
        
//         // Mock chrome object
//         window.chrome = {
//           runtime: {},
//           loadTimes: function() {},
//           csi: function() {},
//           app: {}
//         };

//         // Override permissions
//         const originalQuery = window.navigator.permissions.query;
//         window.navigator.permissions.query = (parameters) => (
//           parameters.name === 'notifications' ?
//             Promise.resolve({ state: Notification.permission }) :
//             originalQuery(parameters)
//         );

//         // Remove automation indicators
//         const toRemove = [
//           'cdc_adoQpoasnfa76pfcZLmcfl_Array',
//           'cdc_adoQpoasnfa76pfcZLmcfl_Promise', 
//           'cdc_adoQpoasnfa76pfcZLmcfl_Symbol'
//         ];
        
//         toRemove.forEach(prop => {
//           if (window[prop]) {
//             delete window[prop];
//           }
//         });
//       });

//       console.log("✅ Stealth browser initialized successfully");
//       return true;
//     } catch (error) {
//       console.error("❌ Error initializing stealth browser:", error.message);
//       return false;
//     }
//   }

// async humanDelay(min = 1000, max = 3000) {
//     const delay = Math.random() * (max - min) + min;
//     await this.page.waitForTimeout(delay);
//   }

//   async simulateHumanBehavior() {
//     // Random mouse movements
//     const viewport = this.page.viewportSize();
//     const x = Math.random() * viewport.width;
//     const y = Math.random() * viewport.height;
    
//     await this.page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
//     await this.humanDelay(200, 800);
    
//     // Occasional random scroll
//     if (Math.random() < 0.3) {
//       await this.page.evaluate(() => {
//         window.scrollBy(0, Math.random() * 300 - 150);
//       });
//       await this.humanDelay(500, 1000);
//     }
//   }


// async addStealthScripts() {
//   // Override webdriver detection
//   await this.page.addInitScript(() => {
//     Object.defineProperty(navigator, 'webdriver', {
//       get: () => undefined,
//     });
    
//     // Mock plugins
//     Object.defineProperty(navigator, 'plugins', {
//       get: () => [1, 2, 3, 4, 5],
//     });
    
//     // Mock languages
//     Object.defineProperty(navigator, 'languages', {
//       get: () => ['en-US', 'en'],
//     });
    
//     // Override permissions
//     const originalQuery = window.navigator.permissions.query;
//     window.navigator.permissions.query = (parameters) => (
//       parameters.name === 'notifications' ?
//         Promise.resolve({ state: Notification.permission }) :
//         originalQuery(parameters)
//     );

//     // Hide automation indicators
//     delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
//     delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
//     delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
//   });
// }


  

//   async loginToLinkedIn2(email, password) {
//     try {
//       if (!this.page) {
//         throw new Error("Browser not initialized")
//       }

//       console.log("🔐 Attempting LinkedIn login...")

//       await this.page.goto("https://www.linkedin.com/login", {
//         waitUntil: "networkidle",
//         timeout: 30000,
//       })

//       // Wait for login form
//       await this.page.waitForSelector("#username", { timeout: 10000 })

//       // Fill credentials
//       await this.page.fill("#username", email)
//       await this.page.fill("#password", password)

//       // Click login button
//       await this.page.click('button[type="submit"]')

//       // Wait for navigation or challenge
//       await this.page.waitForTimeout(3000)

//       // Check if we're logged in or facing a challenge
//       const currentUrl = this.page.url()

//       if (currentUrl.includes("/challenge/")) {
//         console.log("⚠️ LinkedIn security challenge detected")
//         // Handle security challenge if needed
//         await this.handleSecurityChallenge()
//       } else if (currentUrl.includes("/feed/") || currentUrl.includes("/in/")) {
//         console.log("✅ Successfully logged into LinkedIn")
//         this.isLoggedIn = true
//         return { success: true, message: "Logged in successfully" }
//       } else {
//         console.log("❌ Login failed - unexpected redirect")
//         return { success: false, message: "Login failed - unexpected redirect" }
//       }

//       return { success: true, message: "Login completed" }
//     } catch (error) {
//       console.error("❌ Login error:", error.message)
//       return { success: false, message: `Login failed: ${error.message}` }
//     }
//   }
//   async loginToLinkedIn(email, password) {
//     try {
//       if (!this.page) {
//         throw new Error("Browser not initialized");
//       }

//       console.log("🔐 Attempting stealth LinkedIn login...");
      
//       // Simulate human behavior before login
//       await this.simulateHumanBehavior();
      
//       await this.page.goto("https://www.linkedin.com/login", {
//         waitUntil: "networkidle",
//         timeout: 30000,
//       });

//       await this.humanDelay(3000, 5000);

//       // Wait for login form
//       await this.page.waitForSelector("#username", { timeout: 15000 });
      
//       // Human-like typing with realistic delays
//       await this.page.click("#username");
//       await this.humanDelay(500, 1200);
//       await this.page.type("#username", email, { delay: Math.random() * 100 + 50 });
      
//       await this.humanDelay(800, 1800);
      
//       await this.page.click("#password");
//       await this.humanDelay(400, 900);
//       await this.page.type("#password", password, { delay: Math.random() * 100 + 60 });

//       await this.humanDelay(1500, 2500);
//       await this.simulateHumanBehavior();

//       // Click login button
//       await this.page.click('button[type="submit"]');

//       // Wait for navigation or challenge
//       await this.page.waitForTimeout(8000);

//       const currentUrl = this.page.url();

//       if (currentUrl.includes("/challenge/")) {
//         console.log("⚠️ LinkedIn security challenge detected");
//         return await this.handleSecurityChallenge();
//       } else if (currentUrl.includes("/feed/") || currentUrl.includes("/in/")) {
//         console.log("✅ Successfully logged into LinkedIn");
//         this.isLoggedIn = true;
//         return { success: true, message: "Logged in successfully" };
//       } else {
//         console.log("❌ Login failed - unexpected redirect:", currentUrl);
//         return { success: false, message: "Login failed - unexpected redirect" };
//       }
//     } catch (error) {
//       console.error("❌ Login error:", error.message);
//       return { success: false, message: `Login failed: ${error.message}` };
//     }
//   }

//   async handleSecurityChallenge2() {
//     try {
//       console.log("🛡️ Handling LinkedIn security challenge...")

//       // Check for email verification
//       const emailVerification = await this.page.locator('[data-test-id="email-pin-challenge"]').isVisible()
//       if (emailVerification) {
//         console.log("📧 Email verification required. Please check your email and manually enter the code.")
//         // Wait for manual intervention in development mode
//         if (!BROWSER_CONFIG.production.headless) {
//           await this.page.waitForTimeout(60000) // Wait 1 minute for manual input
//         }
//       }

//       // Check for phone verification
//       const phoneVerification = await this.page.locator('[data-test-id="phone-pin-challenge"]').isVisible()
//       if (phoneVerification) {
//         console.log("📱 Phone verification required. Please check your phone and manually enter the code.")
//         if (!BROWSER_CONFIG.production.headless) {
//           await this.page.waitForTimeout(60000) // Wait 1 minute for manual input
//         }
//       }
//     } catch (error) {
//       console.error("❌ Error handling security challenge:", error.message)
//     }
//   }
//   async handleSecurityChallenge() {
//     try {
//       console.log("🛡️ Handling LinkedIn security challenge...");
      
//       // Check for email verification
//       const emailVerification = await this.page.locator('[data-test-id="email-pin-challenge"]').isVisible();
//       const phoneVerification = await this.page.locator('[data-test-id="phone-pin-challenge"]').isVisible();
      
//       if (emailVerification || phoneVerification) {
//         const verificationType = emailVerification ? "email" : "phone";
//         console.log(`📧 ${verificationType} verification required`);
        
//         // Import io here to avoid circular dependency
//         const { io } = await import("../../index.js");
        
//         return new Promise((resolve) => {
//           const verificationId = `verification_${Date.now()}`;
          
//           // Emit verification needed event to frontend
//           io.emit("linkedinVerificationNeeded", {
//             verificationType,
//             verificationId,
//             message: `LinkedIn requires ${verificationType} verification. Please check your ${verificationType} and enter the code.`
//           });
          
//           // Listen for verification code from frontend
//           const handleVerificationCode = async (data) => {
//             if (data.verificationId === verificationId) {
//               try {
//                 console.log(`🔑 Received verification code: ${data.code}`);
                
//                 // Find input field and enter code
//                 const inputSelector = 'input[name="pin"]';
                
//                 await this.page.waitForSelector(inputSelector, { timeout: 10000 });
//                 await this.page.fill(inputSelector, data.code);
                
//                 await this.humanDelay(1000, 2000);
                
//                 // Submit verification
//                 const submitButton = this.page.locator('button[type="submit"]');
//                 if (await submitButton.isVisible()) {
//                   await submitButton.click();
//                 }
                
//                 // Wait for verification result
//                 await this.page.waitForTimeout(5000);
                
//                 const newUrl = this.page.url();
                
//                 if (newUrl.includes("/feed/") || newUrl.includes("/in/")) {
//                   console.log("✅ Verification successful");
//                   this.isLoggedIn = true;
                  
//                   io.emit("linkedinVerificationResult", {
//                     verificationId,
//                     success: true,
//                     message: "Verification successful! Login completed."
//                   });
                  
//                   io.off("linkedinVerificationCode", handleVerificationCode);
//                   resolve({ success: true, message: "Login completed with verification" });
//                 } else {
//                   console.log("❌ Verification failed");
                  
//                   io.emit("linkedinVerificationResult", {
//                     verificationId,
//                     success: false,
//                     message: "Verification code incorrect. Please try again."
//                   });
//                 }
                
//               } catch (error) {
//                 console.error("❌ Error processing verification code:", error);
                
//                 io.emit("linkedinVerificationResult", {
//                   verificationId,
//                   success: false,
//                   message: `Verification error: ${error.message}`
//                 });
//               }
//             }
//           };
          
//           io.on("linkedinVerificationCode", handleVerificationCode);
          
//           // Timeout after 10 minutes
//           setTimeout(() => {
//             io.off("linkedinVerificationCode", handleVerificationCode);
//             io.emit("linkedinVerificationResult", {
//               verificationId,
//               success: false,
//               message: "Verification timeout. Please try logging in again."
//             });
//             resolve({ success: false, message: "Verification timeout" });
//           }, 10 * 60 * 1000);
//         });
//       }
      
//       return { success: false, message: "Unknown challenge type" };
      
//     } catch (error) {
//       console.error("❌ Error handling security challenge:", error.message);
//       return { success: false, message: `Challenge handling failed: ${error.message}` };
//     }
//   }
//   async extractLinkedInProfile2(profileUrl) {
//     try {
//       if (!this.isLoggedIn || !this.page) {
//         throw new Error("Not logged in or browser not initialized")
//       }

//       console.log(`🔍 Extracting profile: ${profileUrl}`)

//       await this.page.goto(profileUrl, {
//         waitUntil: "networkidle",
//         timeout: 60000,
//       })

//       // Wait for the main content area to ensure page is loaded
//       await this.page.waitForSelector("main", { timeout: 60000 })

//       const originalProfileUrl = profileUrl

//       // --- Click "See More" for About section ---
//       try {
//         const aboutSeeMoreButton = await this.page.locator("#about ~ .pv-profile-section__card-action-bar button")
//         if (await aboutSeeMoreButton.isVisible()) {
//           console.log('Clicking "See More" for About section...')
//           await aboutSeeMoreButton.click()
//           await this.page.waitForTimeout(1000)
//         }
//       } catch (e) {
//         console.log('No "See More" button for About section or error clicking:', e.message)
//       }

//       let allProjects = []
//       try {
//         // Try multiple selectors for "Show all projects" button
//         const showAllProjectsSelectors = [
//           "#navigation-index-see-all-projects",
//           'a[href*="/details/projects/"]',
//           'button:has-text("Show all") >> nth=0',
//           '.pvs-list__footer-wrapper a:has-text("Show all")',
//         ]

//         let projectsButtonFound = false
//         for (const selector of showAllProjectsSelectors) {
//           try {
//             const showAllProjectsButton = await this.page.locator(selector).first()
//             if (await showAllProjectsButton.isVisible({ timeout: 2000 })) {
//               console.log(`Clicking "Show all projects" using selector: ${selector}`)
//               await showAllProjectsButton.click()
//               await this.page.waitForTimeout(3000)
//               projectsButtonFound = true
//               break
//             }
//           } catch (e) {
//             continue
//           }
//         }

//         if (projectsButtonFound) {
//           // Extract projects from the "see all" page
//           allProjects = await this.extractProjectsFromAllPage()

//           // Navigate back to main profile
//           console.log("Navigating back to main profile...")
//           await this.page.goto(originalProfileUrl, { waitUntil: "networkidle", timeout: 30000 })
//           await this.page.waitForTimeout(2000)
//         }
//       } catch (e) {
//         console.log("Error handling projects:", e.message)
//         // Try to navigate back to profile if we're lost
//         try {
//           await this.page.goto(originalProfileUrl, { waitUntil: "networkidle", timeout: 30000 })
//         } catch (navError) {
//           console.log("Error navigating back to profile:", navError.message)
//         }
//       }

//       let allSkills = []
//       try {
//         // Try multiple selectors for "Show all skills" button
//         const showAllSkillsSelectors = [
//           "#navigation-index-Show-all-28-skills",
//           'a[href*="/details/skills/"]',
//           'button:has-text("Show all") >> nth=1',
//           '.pvs-list__footer-wrapper a:has-text("Show all skills")',
//           'a:has-text("Show all") >> nth=1',
//         ]

//         let skillsButtonFound = false
//         for (const selector of showAllSkillsSelectors) {
//           try {
//             const showAllSkillsButton = await this.page.locator(selector).first()
//             if (await showAllSkillsButton.isVisible({ timeout: 2000 })) {
//               console.log(`Clicking "Show all skills" using selector: ${selector}`)
//               await showAllSkillsButton.click()
//               await this.page.waitForTimeout(3000)
//               skillsButtonFound = true
//               break
//             }
//           } catch (e) {
//             continue
//           }
//         }

//         if (skillsButtonFound) {
//           // Extract skills from the "see all" page
//           allSkills = await this.extractSkillsFromAllPage()

//           // Navigate back to main profile
//           console.log("Navigating back to main profile...")
//           await this.page.goto(originalProfileUrl, { waitUntil: "networkidle", timeout: 30000 })
//           await this.page.waitForTimeout(2000)
//         }
//       } catch (e) {
//         console.log("Error handling skills:", e.message)
//         // Try to navigate back to profile if we're lost
//         try {
//           await this.page.goto(originalProfileUrl, { waitUntil: "networkidle", timeout: 30000 })
//         } catch (navError) {
//           console.log("Error navigating back to profile:", navError.message)
//         }
//       }

//       // Add a general wait to ensure DOM is settled
//       await this.page.waitForTimeout(1000)

//       const profileData = await this.page.evaluate(
//         (extractedProjects, extractedSkills) => {
//           const data = {
//             name: "",
//             headline: "",
//             location: "",
//             aboutText: "",
//             experience: [],
//             education: [],
//             skills: extractedSkills || [], // Use extracted skills first
//             projects: extractedProjects || [], // Use extracted projects first
//             profileUrl: window.location.href,
//             followerCount: "",
//             connectionCount: "",
//             missingFields: [],
//           }

//           const nameSelectors = [
//             "h1.text-heading-xlarge",
//             ".pv-text-details__left-panel h1",
//             '[data-anonymize="person-name"]',
//             ".cIHEZNEHiAPGXeBwbDitiwmhgEpNpYZAw",
//             'h1[class*="text-heading"]',
//             ".pv-top-card--list h1",
//           ]

//           for (const selector of nameSelectors) {
//             const nameElement = document.querySelector(selector)
//             if (nameElement && nameElement.textContent?.trim()) {
//               data.name = nameElement.textContent.trim()
//               break
//             }
//           }
//           if (!data.name) data.missingFields.push("name")

//           const headlineSelectors = [
//             ".text-body-medium.break-words",
//             ".pv-text-details__left-panel .text-body-medium",
//             '[data-generated-suggestion-target^="urn:li:fsu_profileActionDelegate:"]',
//             ".pv-top-card--list .text-body-medium",
//             ".pv-text-details__left-panel-item .text-body-medium",
//           ]

//           for (const selector of headlineSelectors) {
//             const headlineElement = document.querySelector(selector)
//             if (headlineElement && headlineElement.textContent?.trim()) {
//               data.headline = headlineElement.textContent.trim()
//               break
//             }
//           }
//           if (!data.headline) data.missingFields.push("headline")

//           const locationSelectors = [
//             ".text-body-small.inline.t-black--light.break-words",
//             ".pv-text-details__left-panel .text-body-small",
//             "span.text-body-small.inline.t-black--light.break-words",
//             ".pv-top-card--list .text-body-small",
//           ]

//           for (const selector of locationSelectors) {
//             const locationElement = document.querySelector(selector)
//             if (locationElement && locationElement.textContent?.trim()) {
//               data.location = locationElement.textContent.trim()
//               break
//             }
//           }
//           if (!data.location) data.missingFields.push("location")

//           // --- About section extraction ---
//           const aboutSection = document.querySelector("#about") || document.querySelector('[data-field="summary_info"]')
//           if (aboutSection) {
//             const aboutContent =
//               aboutSection.closest("section")?.querySelector(".pv-shared-text-with-see-more__expanded") ||
//               aboutSection.closest("section")?.querySelector(".pv-shared-text-with-see-more")
//             if (aboutContent) {
//               data.aboutText = aboutContent.textContent?.trim() || ""
//             } else {
//               data.missingFields.push("aboutText")
//             }
//           } else {
//             data.missingFields.push("aboutSection")
//           }

//           // --- Experience section extraction ---
//           const experienceSection =
//             document.querySelector("#experience") || document.querySelector('[data-field="experience_info"]')
//           if (experienceSection) {
//             const experienceEntries = experienceSection.closest("section")?.querySelectorAll(".pvs-list__item")
//             if (experienceEntries && experienceEntries.length > 0) {
//               experienceEntries.forEach((entry) => {
//                 const title = entry.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim() || ""
//                 const companyAndType =
//                   entry.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || ""
//                 const duration =
//                   entry
//                     .querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]:nth-child(1)')
//                     ?.textContent?.trim() || ""
//                 const location =
//                   entry
//                     .querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]:nth-child(2)')
//                     ?.textContent?.trim() || ""
//                 const description =
//                   entry.querySelector(".pvs-entity__sub-components .inline-show-more-text__expanded") ||
//                   entry.querySelector(".pvs-entity__sub-components .inline-show-more-text--is-collapsed")
//                 const descriptionText = description ? description.textContent?.trim() : ""

//                 const skillsElements = entry.querySelectorAll(
//                   '[data-field="position_contextual_skills_see_details"] strong',
//                 )
//                 const experienceSkills = Array.from(skillsElements)
//                   .map((el) => el.textContent?.trim().replace(/\s*and \+\d+ skills/, ""))
//                   .filter(Boolean)

//                 data.experience.push({
//                   title,
//                   companyAndType,
//                   duration,
//                   location,
//                   description: descriptionText,
//                   skills: experienceSkills,
//                 })
//               })
//             } else {
//               data.missingFields.push("experienceEntries")
//             }
//           } else {
//             data.missingFields.push("experienceSection")
//           }

//           // --- Education section extraction ---
//           const educationSection =
//             document.querySelector("#education") || document.querySelector('[data-field="education_info"]')
//           if (educationSection) {
//             const educationEntries = educationSection.closest("section")?.querySelectorAll(".pvs-list__item")
//             if (educationEntries && educationEntries.length > 0) {
//               educationEntries.forEach((entry) => {
//                 const institution = entry.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim() || ""
//                 const degreeAndField =
//                   entry.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || ""
//                 const duration =
//                   entry.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]')?.textContent?.trim() ||
//                   ""

//                 data.education.push({
//                   institution,
//                   degreeAndField,
//                   duration,
//                 })
//               })
//             } else {
//               data.missingFields.push("educationEntries")
//             }
//           } else {
//             data.missingFields.push("educationSection")
//           }

//           if (data.skills.length === 0) {
//             const skillsSection =
//               document.querySelector("#skills") || document.querySelector('[data-field="skill_info"]')
//             if (skillsSection) {
//               const skillSelectors = [
//                 '.pvs-list__item .hoverable-link-text.t-bold span[aria-hidden="true"]',
//                 '.pvs-list__item .t-bold span[aria-hidden="true"]',
//                 ".skill-category-entity__name",
//               ]

//               for (const selector of skillSelectors) {
//                 const skillElements = skillsSection.closest("section")?.querySelectorAll(selector)
//                 if (skillElements && skillElements.length > 0) {
//                   data.skills = Array.from(skillElements)
//                     .map((el) => el.textContent?.trim())
//                     .filter(Boolean)
//                   break
//                 }
//               }
//             }
//             if (data.skills.length === 0) data.missingFields.push("skills")
//           }

//           if (data.projects.length === 0) {
//             const projectsSection =
//               document.querySelector("#projects") || document.querySelector('[data-field="projects_info"]')
//             if (projectsSection) {
//               const projectEntries = projectsSection.closest("section")?.querySelectorAll(".pvs-list__item")
//               if (projectEntries && projectEntries.length > 0) {
//                 projectEntries.forEach((entry) => {
//                   const title = entry.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim() || ""
//                   const descriptionElement =
//                     entry.querySelector(".pvs-entity__sub-components .inline-show-more-text__expanded") ||
//                     entry.querySelector(".pvs-entity__sub-components .inline-show-more-text--is-collapsed")
//                   const description = descriptionElement ? descriptionElement.textContent?.trim() : ""
//                   const dateRange =
//                     entry.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || ""

//                   const skillsElements = entry.querySelectorAll(
//                     '[data-field="project_contextual_skills_see_details"] strong',
//                   )
//                   const projectSkills = Array.from(skillsElements)
//                     .map((el) => el.textContent?.trim().replace(/\s*and \+\d+ skills/, ""))
//                     .filter(Boolean)

//                   const projectUrlElement = entry.querySelector(".pvs-thumbnail__wrapper a")
//                   const projectUrl = projectUrlElement ? projectUrlElement.href : ""

//                   if (title) {
//                     data.projects.push({
//                       title,
//                       dateRange,
//                       description,
//                       skills: projectSkills,
//                       projectUrl,
//                     })
//                   }
//                 })
//               }
//             }
//             if (data.projects.length === 0) data.missingFields.push("projects")
//           }

//           // --- Follower and Connection Count ---
//           const followerCountElement = document.querySelector(
//             "ul.qAkcApNEvBoQunfsEzBveDvyHQkKLKHLME li.text-body-small.t-black--light span.t-bold",
//           )
//           if (followerCountElement) {
//             data.followerCount = followerCountElement.textContent?.trim() || ""
//           } else {
//             data.missingFields.push("followerCount")
//           }

//           const connectionCountElement = document.querySelector(
//             "ul.qAkcApNEvBoQunfsEzBveDvyHQkKLKHLME li.text-body-small a span.t-bold",
//           )
//           if (connectionCountElement) {
//             data.connectionCount = connectionCountElement.textContent?.trim() || ""
//           } else {
//             data.missingFields.push("connectionCount")
//           }

//           return data
//         },
//         allProjects,
//         allSkills,
//       )

//       // Instead of throwing an error, we check for critical missing fields
//       // but still return the data we have.
//       const hasCriticalMissingFields = profileData.name === "" // You can define what's "critical"

//       if (hasCriticalMissingFields) {
//         console.warn(
//           `⚠️ Profile extraction completed with missing critical data (e.g., name): ${profileData.missingFields.join(", ")}`,
//         )
//       } else {
//         console.log(`✅ Successfully extracted profile for: ${profileData.name}`)
//       }

//       console.log("Data Of profile", {
//         name: profileData.name,
//         headline: profileData.headline,
//         location: profileData.location,
//         aboutText: profileData.aboutText,
//         experience: profileData.experience,
//         education: profileData.education,
//         skills: profileData.skills,
//         projects: profileData.projects,
//         followerCount: profileData.followerCount,
//         connectionCount: profileData.connectionCount,
//         profileUrl: profileData.profileUrl,
//         missingFields: profileData.missingFields, // Include missing fields in the result
//       })

//       return {
//         success: !hasCriticalMissingFields, // success is false if critical fields are missing
//         message: hasCriticalMissingFields
//           ? `Profile extracted with missing critical data: ${profileData.missingFields.join(", ")}`
//           : "Profile extracted successfully",
//         data: {
//           name: profileData.name,
//           headline: profileData.headline,
//           location: profileData.location,
//           aboutText: profileData.aboutText,
//           experience: profileData.experience,
//           education: profileData.education,
//           skills: profileData.skills,
//           projects: profileData.projects,
//           followerCount: profileData.followerCount,
//           connectionCount: profileData.connectionCount,
//           profileUrl: profileData.profileUrl,
//           missingFields: profileData.missingFields, // Include missing fields in the result
//         },
//       }
//     } catch (error) {
//       console.error(`❌ Unexpected error during profile extraction for ${profileUrl}:`, error.message)
//       return {
//         success: false,
//         error: `Unexpected extraction error: ${error.message}`,
//         profileUrl: profileUrl,
//         partialData: {
//           name: "N/A",
//           headline: "N/A",
//         },
//       }
//     }
//   }

 
// async extractLinkedInProfile(profileUrl) {
//   try {
//     if (!this.isLoggedIn || !this.page) {
//       throw new Error("Not logged in or browser not initialized");
//     }

//     console.log(`🔍 Extracting profile: ${profileUrl}`);
    
//     await this.simulateHumanBehavior();
    
//     await this.page.goto(profileUrl, {
//       waitUntil: "networkidle",
//       timeout: 60000,
//     });

//     // Wait for profile to load and simulate reading behavior
//     await this.page.waitForSelector("main", { timeout: 60000 });
//     await this.humanDelay(3000, 6000);
    
//     // Scroll down to load dynamic content
//     await this.page.evaluate(() => {
//       window.scrollTo(0, document.body.scrollHeight / 3);
//     });
//     await this.humanDelay(2000, 4000);
    
//     await this.page.evaluate(() => {
//       window.scrollTo(0, document.body.scrollHeight * 2 / 3);
//     });
//     await this.humanDelay(2000, 4000);
    
//     // Enhanced data extraction with multiple selector fallbacks
//     const profileData = await this.page.evaluate(() => {
//       const data = {
//         name: "",
//         headline: "",
//         location: "",
//         aboutText: "",
//         experience: [],
//         education: [],
//         skills: [],
//         projects: [],
//         profileUrl: window.location.href,
//         followerCount: "",
//         connectionCount: "",
//         contactInfo: {
//           email: "",
//           phone: "",
//           websites: []
//         },
//         missingFields: [],
//       };

//       // Enhanced name extraction with multiple selectors
//       const nameSelectors = [
//         "h1.text-heading-xlarge",
//         ".pv-text-details__left-panel h1",
//         '[data-anonymize="person-name"]',
//         ".cIHEZNEHiAPGXeBwbDitiwmhgEpNpYZAw",
//         'h1[class*="text-heading"]',
//         ".pv-top-card--list h1",
//         ".ph5 h1",
//         ".pv-text-details__left-panel .text-heading-xlarge"
//       ];

//       for (const selector of nameSelectors) {
//         const nameElement = document.querySelector(selector);
//         if (nameElement && nameElement.textContent?.trim()) {
//           data.name = nameElement.textContent.trim();
//           break;
//         }
//       }

//       // Enhanced experience extraction
//       const experienceSection = document.querySelector("#experience") || 
//                               document.querySelector('[data-field="experience_info"]') ||
//                               document.querySelector('.pv-profile-section[id*="experience"]');
      
//       if (experienceSection) {
//         const experienceEntries = experienceSection.closest("section")?.querySelectorAll(".pvs-list__item") ||
//                                  experienceSection.querySelectorAll(".pv-entity__summary-info") ||
//                                  experienceSection.querySelectorAll(".pv-entity__position-group");
        
//         if (experienceEntries && experienceEntries.length > 0) {
//           experienceEntries.forEach((entry) => {
//             // Multiple selector strategies for experience data
//             const titleSelectors = [
//               '.t-bold span[aria-hidden="true"]',
//               '.pv-entity__summary-info-v2 h3',
//               '.t-16.t-black.t-bold',
//               'h3[data-field="position_title"]',
//               '.pv-entity__summary-info h3'
//             ];
            
//             let title = "";
//             for (const selector of titleSelectors) {
//               const titleEl = entry.querySelector(selector);
//               if (titleEl && titleEl.textContent?.trim()) {
//                 title = titleEl.textContent.trim();
//                 break;
//               }
//             }

//             const companySelectors = [
//               '.t-14.t-normal span[aria-hidden="true"]',
//               '.pv-entity__secondary-title',
//               'h4[data-field="company"]',
//               '.t-14.t-black--light.t-normal'
//             ];
            
//             let company = "";
//             for (const selector of companySelectors) {
//               const companyEl = entry.querySelector(selector);
//               if (companyEl && companyEl.textContent?.trim()) {
//                 company = companyEl.textContent.trim();
//                 break;
//               }
//             }

//             if (title) {
//               data.experience.push({
//                 title,
//                 company,
//                 duration: entry.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]')?.textContent?.trim() || "",
//                 description: entry.querySelector('.pv-entity__extra-details')?.textContent?.trim() || ""
//               });
//             }
//           });
//         }
//       }

//       // Contact information extraction (if available)
//       const contactSection = document.querySelector('[data-control-name="contact_see_more"]') ||
//                             document.querySelector('.pv-contact-info');
      
//       if (contactSection) {
//         // Try to extract email
//         const emailElements = contactSection.querySelectorAll('a[href^="mailto:"]');
//         if (emailElements.length > 0) {
//           data.contactInfo.email = emailElements[0].href.replace('mailto:', '');
//         }
        
//         // Try to extract phone
//         const phoneElements = contactSection.querySelectorAll('a[href^="tel:"], .ci-phone');
//         if (phoneElements.length > 0) {
//           data.contactInfo.phone = phoneElements[0].textContent?.trim() || phoneElements[0].href?.replace('tel:', '');
//         }
        
//         // Extract websites
//         const websiteElements = contactSection.querySelectorAll('a[href^="http"]');
//         websiteElements.forEach(el => {
//           if (el.href && !el.href.includes('linkedin.com')) {
//             data.contactInfo.websites.push(el.href);
//           }
//         });
//       }

//       console.log("profile data", data);

//       return data;
//     });

//     // Enhanced success validation
//     const hasCriticalData = profileData.name && profileData.name.trim() !== "";
    
//     if (!hasCriticalData) {
//       console.warn(`⚠️ Profile extraction incomplete: missing critical data`);
//     }

//     console.log(`✅ Profile extracted: ${profileData.name}`);
    
//     return {
//       success: hasCriticalData,
//       message: hasCriticalData 
//         ? "Profile extracted successfully"
//         : "Profile extracted with missing critical data",
//       data: profileData,
//     };
    
//   } catch (error) {
//     console.error(`❌ Profile extraction error for ${profileUrl}:`, error.message);
//     return {
//       success: false,
//       error: `Extraction error: ${error.message}`,
//       profileUrl: profileUrl,
//       partialData: { name: "N/A", headline: "N/A" },
//     };
//   }
// }

//   async extractProjectsFromAllPage() {
//     try {
//       console.log('Extracting projects from "see all" page...')

//       // Wait for the projects list to load
//       await this.page.waitForSelector("ul.ORngdJjvApwhHlNrrddVFYxheAlHSzYhmcgbBI", { timeout: 10000 })

//       const projects = await this.page.evaluate(() => {
//         const projectsList = []
//         const projectItems = document.querySelectorAll("li.pvs-list__paged-list-item")

//         projectItems.forEach((item) => {
//           // Extract project title
//           const titleElement =
//             item.querySelector('.hoverable-link-text.t-bold span[aria-hidden="true"]') ||
//             item.querySelector('.t-bold span[aria-hidden="true"]') ||
//             item.querySelector('[data-field*="project"] .t-bold span')
//           const title = titleElement ? titleElement.textContent?.trim() : ""

//           // Extract project description
//           const descriptionElement =
//             item.querySelector(".inline-show-more-text__expanded") ||
//             item.querySelector(".inline-show-more-text--is-collapsed") ||
//             item.querySelector(".pvs-entity__sub-components .t-14")
//           const description = descriptionElement ? descriptionElement.textContent?.trim() : ""

//           // Extract date range
//           const dateElement =
//             item.querySelector('.t-14.t-normal span[aria-hidden="true"]') ||
//             item.querySelector(".pvs-entity__caption-wrapper span")
//           const dateRange = dateElement ? dateElement.textContent?.trim() : ""

//           // Extract project URL if available
//           const urlElement = item.querySelector('a[href*="http"]')
//           const projectUrl = urlElement ? urlElement.href : ""

//           // Extract associated skills
//           const skillElements = item.querySelectorAll('[data-field*="skill"] strong, .skill-category-entity__name')
//           const skills = Array.from(skillElements)
//             .map((el) => el.textContent?.trim().replace(/\s*and \+\d+ skills/, ""))
//             .filter(Boolean)

//           if (title) {
//             projectsList.push({
//               title,
//               dateRange,
//               description,
//               skills,
//               projectUrl,
//             })
//           }
//         })

//         return projectsList
//       })

//       console.log(`✅ Extracted ${projects.length} projects from "see all" page`)
//       return projects
//     } catch (error) {
//       console.error('❌ Error extracting projects from "see all" page:', error.message)
//       return []
//     }
//   }

//   async extractSkillsFromAllPage() {
//     try {
//       console.log('Extracting skills from "see all" page...')

//       // Wait for the skills list to load
//       await this.page.waitForSelector("ul.ORngdJjvApwhHlNrrddVFYxheAlHSzYhmcgbBI", { timeout: 10000 })

//       const skills = await this.page.evaluate(() => {
//         const skillsList = []
//         const skillItems = document.querySelectorAll("li.pvs-list__paged-list-item")

//         skillItems.forEach((item) => {
//           // Extract skill name using multiple selectors
//           const skillElement =
//             item.querySelector('.hoverable-link-text.t-bold span[aria-hidden="true"]') ||
//             item.querySelector('[data-field="skill_page_skill_topic"] .t-bold span[aria-hidden="true"]') ||
//             item.querySelector('.t-bold span[aria-hidden="true"]') ||
//             item.querySelector(".skill-category-entity__name")

//           if (skillElement && skillElement.textContent?.trim()) {
//             const skillName = skillElement.textContent.trim()
//             if (skillName && !skillsList.includes(skillName)) {
//               skillsList.push(skillName)
//             }
//           }
//         })

//         return skillsList
//       })

//       console.log(`✅ Extracted ${skills.length} skills from "see all" page`)
//       return skills
//     } catch (error) {
//       console.error('❌ Error extracting skills from "see all" page:', error.message)
//       return []
//     }
//   }

//   async extractMultipleProfiles(profileUrls, onProgress) {
//     const results = []
//     let processed = 0

//     for (const url of profileUrls) {
//       try {
//         // Add delay between profiles to avoid rate limiting
//         if (processed > 0) {
//           await this.page.waitForTimeout(2000 + Math.random() * 3000) // 2-5 second delay
//         }

//         const result = await this.extractLinkedInProfile(url)
//         results.push(result)
//         processed++

//         // Call progress callback if provided
//         if (onProgress) {
//           onProgress({
//             processed,
//             total: profileUrls.length,
//             current: url,
//             result,
//           })
//         }

//         console.log(`📊 Progress: ${processed}/${profileUrls.length} profiles processed`)
//       } catch (error) {
//         console.error(`❌ Error processing ${url}:`, error.message)
//         results.push({
//           success: false,
//           error: error.message,
//           profileUrl: url,
//         })
//         processed++
//       }
//     }

//     return results
//   }

//   async closeBrowser() {
//     try {
//       if (this.browser) {
//         await this.browser.close()
//         this.browser = null
//         this.context = null
//         this.page = null
//         this.isLoggedIn = false
//         console.log("🔒 Browser closed successfully")
//       }
//     } catch (error) {
//       console.error("❌ Error closing browser:", error.message)
//     }
//   }
// }

// // LinkedIn automation controller functions
// const linkedInAutomation = new LinkedInAutomation()

// export const initializeLinkedInAutomation = async (req, res) => {
//   try {
//     const { environment = "development" } = req.body

//     const success = await linkedInAutomation.initializeBrowser(environment)

//     if (success) {
//       res.status(200).json({
//         success: true,
//         message: `LinkedIn automation initialized in ${environment} mode`,
//         headless: BROWSER_CONFIG[environment]?.headless || false,
//       })
//     } else {
//       res.status(500).json({
//         success: false,
//         error: "Failed to initialize browser",
//       })
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     })
//   }
// }

// export const loginLinkedInAutomation = async (req, res) => {
//   try {
//     // const { email, password } = req.body;
//     const email = "Cunard.consulting.dev@gmail.com";
//     const password = "D0ft67ju01$";
//     // const email = process.env.LINKEDIN_EMAIL
//     // const password = process.env.LINKEDIN_PASSWORD

//     if (!email || !password) {
//       return res.status(400).json({
//         success: false,
//         error: "Email and password are required",
//       })
//     }

//     const result = await linkedInAutomation.loginToLinkedIn(email, password)

//     res.status(result.success ? 200 : 400).json(result)
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     })
//   }
// }

// export const extractLinkedInProfileAutomation = async (req, res) => {
//   try {
//     const profileUrl = "https://www.linkedin.com/in/refat-bhuyan/";
//     // const { profileUrl } = req.body;

//     if (!profileUrl) {
//       return res.status(400).json({
//         success: false,
//         error: "Profile URL is required",
//       })
//     }

//     const result = await linkedInAutomation.extractLinkedInProfile(profileUrl)

//     res.status(result.success ? 200 : 400).json(result)
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     })
//   }
// }

// export const closeLinkedInAutomation = async (req, res) => {
//   try {
//     await linkedInAutomation.closeBrowser();

//     res.status(200).json({
//       success: true,
//       message: "LinkedIn automation closed successfully",
//     })
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     })
//   }
// }

// // Internal function for use in existing controller
// export const extractLinkedInProfilesWithPlaywright = async (profileUrls, searchId, credentials) => {
//   try {
//     console.log(`🎭 Starting Playwright extraction for ${profileUrls.length} profiles`)

//     // Initialize browser in production mode for internal use
//     const automation = new LinkedInAutomation()
//     const initialized = await automation.initializeBrowser("production")

//     if (!initialized) {
//       throw new Error("Failed to initialize browser for LinkedIn extraction")
//     }

//     // Login with provided credentials
//     const loginResult = await automation.loginToLinkedIn(credentials.email, credentials.password)
//     if (!loginResult.success) {
//       throw new Error(`Login failed: ${loginResult.message}`)
//     }

//     // Extract profiles with progress callback
//     const results = await automation.extractMultipleProfiles(profileUrls, (progress) => {
//       console.log(`📈 Playwright extraction progress: ${progress.processed}/${progress.total}`)

//       // Emit progress to frontend if searchId provided
//       if (searchId && progress.result.success) {
//         // This would integrate with your existing progress emission
//         // You can call your existing processLinkedInDOM equivalent here
//         processPlaywrightResult(searchId, progress.result)
//       }
//     })

//     // Close browser
//     await automation.closeBrowser()

//     console.log(
//       `✅ Playwright extraction completed: ${results.filter((r) => r.success).length}/${results.length} successful`,
//     )

//     return results
//   } catch (error) {
//     console.error("❌ Playwright extraction error:", error.message)
//     throw error
//   }
// }

// // Helper function to process results similar to existing processLinkedInDOM
// async function processPlaywrightResult(searchId, extractionResult) {
//   try {
//     if (!extractionResult.success || !extractionResult.data) {
//       return
//     }

//     const profileData = extractionResult.data

//     console.log(`✅ Processed candidate via Playwright: ${profileData.name}`)
//   } catch (error) {
//     console.error("❌ Error processing Playwright result:", error.message)
//   }
// }

// export default linkedInAutomation




// comment on 1 september
// import { chromium } from 'playwright';
// import { OpenAI } from "openai";

// // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // Configuration
// const BROWSER_CONFIG = {
//   development: {
//     headless: false,
//     slowMo: 1000, // Slow down operations for development
//     devtools: true,
//   },
//   production: {
//     headless: true,
//     slowMo: 0,
//     devtools: false,
//   }
// };

// class LinkedInAutomation {
//   constructor() {
//     this.browser = null;
//     this.context = null;
//     this.page = null;
//     this.isLoggedIn = false;
//   }

//   async initializeBrowser(env = 'production') {
//     try {
//       const config = BROWSER_CONFIG[env] || BROWSER_CONFIG.development;
      
//       console.log(`🚀 Initializing browser in ${env} mode (headless: ${config.headless})`);
      
//       this.browser = await chromium.launch({
//         headless: config.headless,
//         slowMo: config.slowMo,
//         devtools: config.devtools,
//         args: [
//           '--no-sandbox',
//           '--disable-setuid-sandbox',
//           '--disable-dev-shm-usage',
//           '--disable-accelerated-2d-canvas',
//           '--no-first-run',
//           '--no-zygote',
//           '--single-process',
//           '--disable-gpu'
//         ]
//       });

//       this.context = await this.browser.newContext({
//         userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//         viewport: { width: 1366, height: 768 },
//         locale: 'en-US',
//         timezoneId: 'America/New_York',
//       });

//       this.page = await this.context.newPage();
      
//       // Block unnecessary resources to speed up loading
//       await this.page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
      
//       console.log('✅ Browser initialized successfully');
//       return true;
//     } catch (error) {
//       console.error('❌ Error initializing browser:', error.message);
//       return false;
//     }
//   }

//   async loginToLinkedIn(email, password) {
//     try {
//       if (!this.page) {
//         throw new Error('Browser not initialized');
//       }

//       console.log('🔐 Attempting LinkedIn login...');
      
//       await this.page.goto('https://www.linkedin.com/login', { 
//         waitUntil: 'networkidle',
//         timeout: 30000 
//       });

//       // Wait for login form
//       await this.page.waitForSelector('#username', { timeout: 10000 });
      
//       // Fill credentials
//       await this.page.fill('#username', email);
//       await this.page.fill('#password', password);
      
//       // Click login button
//       await this.page.click('button[type="submit"]');
      
//       // Wait for navigation or challenge
//       await this.page.waitForTimeout(3000);
      
//       // Check if we're logged in or facing a challenge
//       const currentUrl = this.page.url();
      
//       if (currentUrl.includes('/challenge/')) {
//         console.log('⚠️ LinkedIn security challenge detected');
//         // Handle security challenge if needed
//         await this.handleSecurityChallenge();
//       } else if (currentUrl.includes('/feed/') || currentUrl.includes('/in/')) {
//         console.log('✅ Successfully logged into LinkedIn');
//         this.isLoggedIn = true;
//         return { success: true, message: 'Logged in successfully' };
//       } else {
//         console.log('❌ Login failed - unexpected redirect');
//         return { success: false, message: 'Login failed - unexpected redirect' };
//       }
      
//       return { success: true, message: 'Login completed' };
//     } catch (error) {
//       console.error('❌ Login error:', error.message);
//       return { success: false, message: `Login failed: ${error.message}` };
//     }
//   }

//   async handleSecurityChallenge() {
//     try {
//       console.log('🛡️ Handling LinkedIn security challenge...');
      
//       // Check for email verification
//       const emailVerification = await this.page.locator('[data-test-id="email-pin-challenge"]').isVisible();
//       if (emailVerification) {
//         console.log('📧 Email verification required. Please check your email and manually enter the code.');
//         // Wait for manual intervention in development mode
//         if (!BROWSER_CONFIG.production.headless) {
//           await this.page.waitForTimeout(60000); // Wait 1 minute for manual input
//         }
//       }
      
//       // Check for phone verification
//       const phoneVerification = await this.page.locator('[data-test-id="phone-pin-challenge"]').isVisible();
//       if (phoneVerification) {
//         console.log('📱 Phone verification required. Please check your phone and manually enter the code.');
//         if (!BROWSER_CONFIG.production.headless) {
//           await this.page.waitForTimeout(60000); // Wait 1 minute for manual input
//         }
//       }
      
//     } catch (error) {
//       console.error('❌ Error handling security challenge:', error.message);
//     }
//   }

//   async extractLinkedInProfile(profileUrl) {
//     try {
//       if (!this.isLoggedIn || !this.page) {
//         throw new Error('Not logged in or browser not initialized');
//       }

//       console.log(`🔍 Extracting profile: ${profileUrl}`);

//       await this.page.goto(profileUrl, {
//         waitUntil: 'networkidle',
//         timeout: 60000 // Increased timeout for potentially slower pages
//       });

//       // Wait for the main content area to ensure page is loaded
//       await this.page.waitForSelector('main', { timeout: 60000 });

//       // --- Click "See More" for About section ---
//       try {
//         const aboutSeeMoreButton = await this.page.locator('#about ~ .pv-profile-section__card-action-bar button');
//         if (await aboutSeeMoreButton.isVisible()) {
//           console.log('Clicking "See More" for About section...');
//           await aboutSeeMoreButton.click();
//           await this.page.waitForTimeout(1000); // Give it a moment to expand
//         }
//       } catch (e) {
//         console.log('No "See More" button for About section or error clicking:', e.message);
//       }

//       // --- Click "Show all projects" button ---
//       try {
//         const showAllProjectsButton = await this.page.locator('#navigation-index-see-all-projects');
//         if (await showAllProjectsButton.isVisible()) {
//           console.log('Clicking "Show all projects"...');
//           await showAllProjectsButton.click();
//           await this.page.waitForTimeout(2000); // Give it time to load the overlay/new page
//         } else {
//             console.log('No "Show all projects" button found.');
//         }
//       } catch (e) {
//         console.log('Error clicking "Show all projects":', e.message);
//       }

//       // --- Click "Show all skills" button ---
//       try {
//         const showAllSkillsButton = await this.page.locator('#navigation-index-Show-all-28-skills');
//         if (await showAllSkillsButton.isVisible()) {
//           console.log('Clicking "Show all skills"...');
//           await showAllSkillsButton.click();
//           await this.page.waitForTimeout(2000); // Give it time to load the overlay/new page
//         } else {
//             console.log('No "Show all skills" button found.');
//         }
//       } catch (e) {
//         console.log('Error clicking "Show all skills":', e.message);
//       }
      
//       // Add a general wait after all clicks to ensure DOM is settled
//       await this.page.waitForTimeout(1000);

//       const profileData = await this.page.evaluate(() => {
//         const data = {
//           name: '',
//           headline: '',
//           location: '',
//           aboutText: '',
//           experience: [], // Array to hold detailed experience
//           education: [], // Array to hold detailed education
//           skills: [],
//           projects: [], // Array to hold detailed projects
//           profileUrl: window.location.href,
//           followerCount: '',
//           connectionCount: '',
//           missingFields: [] // To track which fields were not found
//         };

//         // --- Name Extraction (more robust) ---
//         const nameElement = document.querySelector('h1.text-heading-xlarge') ||
//                            document.querySelector('.pv-text-details__left-panel h1') ||
//                            document.querySelector('[data-anonymize="person-name"]') ||
//                            document.querySelector('.cIHEZNEHiAPGXeBwbDitiwmhgEpNpYZAw'); // From your provided DOM
//         if (nameElement) {
//           data.name = nameElement.textContent?.trim() || '';
//         } else {
//           data.missingFields.push('name');
//         }

//         // --- Headline Extraction (more robust) ---
//         const headlineElement = document.querySelector('.text-body-medium.break-words') ||
//                                document.querySelector('.pv-text-details__left-panel .text-body-medium') ||
//                                document.querySelector('[data-generated-suggestion-target^="urn:li:fsu_profileActionDelegate:"]'); // From your provided DOM
//         if (headlineElement) {
//           data.headline = headlineElement.textContent?.trim() || '';
//         } else {
//           data.missingFields.push('headline');
//         }

//         // --- Location Extraction (more robust) ---
//         const locationElement = document.querySelector('.text-body-small.inline.t-black--light.break-words') ||
//                                document.querySelector('.pv-text-details__left-panel .text-body-small') ||
//                                document.querySelector('span.text-body-small.inline.t-black--light.break-words'); // From your provided DOM
//         if (locationElement) {
//           data.location = locationElement.textContent?.trim() || '';
//         } else {
//           data.missingFields.push('location');
//         }

//         // --- About section extraction ---
//         const aboutSection = document.querySelector('#about') ||
//                             document.querySelector('[data-field="summary_info"]');
//         if (aboutSection) {
//           const aboutContent = aboutSection.closest('section')?.querySelector('.pv-shared-text-with-see-more__expanded') ||
//                                aboutSection.closest('section')?.querySelector('.pv-shared-text-with-see-more');
//           if (aboutContent) {
//             data.aboutText = aboutContent.textContent?.trim() || '';
//           } else {
//             data.missingFields.push('aboutText');
//           }
//         } else {
//           data.missingFields.push('aboutSection');
//         }

//         // --- Experience section extraction ---
//         const experienceSection = document.querySelector('#experience') ||
//                                  document.querySelector('[data-field="experience_info"]');
//         if (experienceSection) {
//           const experienceEntries = experienceSection.closest('section')?.querySelectorAll('.pvs-list__item');
//           if (experienceEntries && experienceEntries.length > 0) {
//             experienceEntries.forEach(entry => {
//               const title = entry.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim() || '';
//               const companyAndType = entry.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || '';
//               const duration = entry.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]:nth-child(1)')?.textContent?.trim() || '';
//               const location = entry.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]:nth-child(2)')?.textContent?.trim() || '';
//               const description = entry.querySelector('.pvs-entity__sub-components .inline-show-more-text__expanded') || entry.querySelector('.pvs-entity__sub-components .inline-show-more-text--is-collapsed');
//               const descriptionText = description ? description.textContent?.trim() : '';

//               const skillsElements = entry.querySelectorAll('[data-field="position_contextual_skills_see_details"] strong');
//               const experienceSkills = Array.from(skillsElements).map(el => el.textContent?.trim().replace(/\s*and \+\d+ skills/, '')).filter(Boolean);

//               data.experience.push({
//                 title,
//                 companyAndType,
//                 duration,
//                 location,
//                 description: descriptionText,
//                 skills: experienceSkills
//               });
//             });
//           } else {
//             data.missingFields.push('experienceEntries');
//           }
//         } else {
//           data.missingFields.push('experienceSection');
//         }


//         // --- Education section extraction ---
//         const educationSection = document.querySelector('#education') ||
//                                 document.querySelector('[data-field="education_info"]');
//         if (educationSection) {
//           const educationEntries = educationSection.closest('section')?.querySelectorAll('.pvs-list__item');
//           if (educationEntries && educationEntries.length > 0) {
//             educationEntries.forEach(entry => {
//               const institution = entry.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim() || '';
//               const degreeAndField = entry.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || '';
//               const duration = entry.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]')?.textContent?.trim() || '';

//               data.education.push({
//                 institution,
//                 degreeAndField,
//                 duration
//               });
//             });
//           } else {
//             data.missingFields.push('educationEntries');
//           }
//         } else {
//           data.missingFields.push('educationSection');
//         }

//         // --- Skills section extraction ---
//         const skillsSection = document.querySelector('#skills') ||
//                              document.querySelector('[data-field="skill_info"]');
//         if (skillsSection) {
//           const skillElements = skillsSection.closest('section')?.querySelectorAll('.pvs-list__item .hoverable-link-text.t-bold span[aria-hidden="true"]');
//           if (skillElements && skillElements.length > 0) {
//             data.skills = Array.from(skillElements).map(el => el.textContent?.trim()).filter(Boolean);
//           } else {
//             data.missingFields.push('skillsList');
//           }
//         } else {
//           data.missingFields.push('skillsSection');
//         }

//         // --- Projects section extraction ---
//         const projectsSection = document.querySelector('#projects') ||
//                                 document.querySelector('[data-field="projects_info"]');
//         if (projectsSection) {
//             const projectEntries = projectsSection.closest('section')?.querySelectorAll('.pvs-list__item');
//             if (projectEntries && projectEntries.length > 0) {
//                 projectEntries.forEach(entry => {
//                     const title = entry.querySelector('.t-bold span[aria-hidden="true"]')?.textContent?.trim() || '';
//                     const descriptionElement = entry.querySelector('.pvs-entity__sub-components .inline-show-more-text__expanded') || entry.querySelector('.pvs-entity__sub-components .inline-show-more-text--is-collapsed');
//                     const description = descriptionElement ? descriptionElement.textContent?.trim() : '';
//                     const dateRange = entry.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent?.trim() || '';

//                     const skillsElements = entry.querySelectorAll('[data-field="project_contextual_skills_see_details"] strong');
//                     const projectSkills = Array.from(skillsElements).map(el => el.textContent?.trim().replace(/\s*and \+\d+ skills/, '')).filter(Boolean);

//                     const projectUrlElement = entry.querySelector('.pvs-thumbnail__wrapper a');
//                     const projectUrl = projectUrlElement ? projectUrlElement.href : '';

//                     data.projects.push({
//                         title,
//                         dateRange,
//                         description,
//                         skills: projectSkills,
//                         projectUrl
//                     });
//                 });
//             } else {
//               data.missingFields.push('projectsList');
//             }
//         } else {
//           data.missingFields.push('projectsSection');
//         }

//         // --- Follower and Connection Count ---
//         const followerCountElement = document.querySelector('ul.qAkcApNEvBoQunfsEzBveDvyHQkKLKHLME li.text-body-small.t-black--light span.t-bold');
//         if (followerCountElement) {
//             data.followerCount = followerCountElement.textContent?.trim() || '';
//         } else {
//           data.missingFields.push('followerCount');
//         }

//         const connectionCountElement = document.querySelector('ul.qAkcApNEvBoQunfsEzBveDvyHQkKLKHLME li.text-body-small a span.t-bold');
//         if (connectionCountElement) {
//             data.connectionCount = connectionCountElement.textContent?.trim() || '';
//         } else {
//           data.missingFields.push('connectionCount');
//         }

//         return data;
//       });

//       // Instead of throwing an error, we check for critical missing fields
//       // but still return the data we have.
//       const hasCriticalMissingFields = profileData.name === ''; // You can define what's "critical"

//       if (hasCriticalMissingFields) {
//         console.warn(`⚠️ Profile extraction completed with missing critical data (e.g., name): ${profileData.missingFields.join(', ')}`);
//       } else {
//         console.log(`✅ Successfully extracted profile for: ${profileData.name}`);
//       }

//       console.log("Data Of profile", {
//           name: profileData.name,
//           headline: profileData.headline,
//           location: profileData.location,
//           aboutText: profileData.aboutText,
//           experience: profileData.experience,
//           education: profileData.education,
//           skills: profileData.skills,
//           projects: profileData.projects,
//           followerCount: profileData.followerCount,
//           connectionCount: profileData.connectionCount,
//           profileUrl: profileData.profileUrl,
//           missingFields: profileData.missingFields // Include missing fields in the result
//         })
      
//       return {
//         success: !hasCriticalMissingFields, // success is false if critical fields are missing
//         message: hasCriticalMissingFields ? `Profile extracted with missing critical data: ${profileData.missingFields.join(', ')}` : 'Profile extracted successfully',
//         data: {
//           name: profileData.name,
//           headline: profileData.headline,
//           location: profileData.location,
//           aboutText: profileData.aboutText,
//           experience: profileData.experience,
//           education: profileData.education,
//           skills: profileData.skills,
//           projects: profileData.projects,
//           followerCount: profileData.followerCount,
//           connectionCount: profileData.connectionCount,
//           profileUrl: profileData.profileUrl,
//           missingFields: profileData.missingFields // Include missing fields in the result
//         }
//       };

//     } catch (error) {
//       console.error(`❌ Unexpected error during profile extraction for ${profileUrl}:`, error.message);
//       // On an unexpected error (e.g., page navigation failed completely),
//       // still return a structure that indicates failure.
//       return {
//         success: false,
//         error: `Unexpected extraction error: ${error.message}`,
//         profileUrl: profileUrl,
//         partialData: {
//             name: 'N/A',
//             headline: 'N/A',
//             // You can add more fallback data here if needed
//         }
//       };
//     }
//   }

//   async extractMultipleProfiles(profileUrls, onProgress) {
//     const results = [];
//     let processed = 0;

//     for (const url of profileUrls) {
//       try {
//         // Add delay between profiles to avoid rate limiting
//         if (processed > 0) {
//           await this.page.waitForTimeout(2000 + Math.random() * 3000); // 2-5 second delay
//         }

//         const result = await this.extractLinkedInProfile(url);
//         results.push(result);
//         processed++;

//         // Call progress callback if provided
//         if (onProgress) {
//           onProgress({
//             processed,
//             total: profileUrls.length,
//             current: url,
//             result
//           });
//         }

//         console.log(`📊 Progress: ${processed}/${profileUrls.length} profiles processed`);

//       } catch (error) {
//         console.error(`❌ Error processing ${url}:`, error.message);
//         results.push({
//           success: false,
//           error: error.message,
//           profileUrl: url
//         });
//         processed++;
//       }
//     }

//     return results;
//   }

//   async closeBrowser() {
//     try {
//       if (this.browser) {
//         await this.browser.close();
//         this.browser = null;
//         this.context = null;
//         this.page = null;
//         this.isLoggedIn = false;
//         console.log('🔒 Browser closed successfully');
//       }
//     } catch (error) {
//       console.error('❌ Error closing browser:', error.message);
//     }
//   }
// }

// // LinkedIn automation controller functions
// const linkedInAutomation = new LinkedInAutomation();

// export const initializeLinkedInAutomation = async (req, res) => {
//   try {
//     const { environment = 'development' } = req.body;
    
//     const success = await linkedInAutomation.initializeBrowser(environment);
    
//     if (success) {
//       res.status(200).json({
//         success: true,
//         message: `LinkedIn automation initialized in ${environment} mode`,
//         headless: BROWSER_CONFIG[environment]?.headless || false
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         error: 'Failed to initialize browser'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export const loginLinkedInAutomation = async (req, res) => {
//   try {
//     // const { email, password } = req.body;
//     const email="refatbubt@gmail.com";
//     const password="6:!g9e#j2eBJMti";
    
//     if (!email || !password) {
//       return res.status(400).json({
//         success: false,
//         error: 'Email and password are required'
//       });
//     }

//     const result = await linkedInAutomation.loginToLinkedIn(email, password);
    
//     res.status(result.success ? 200 : 400).json(result);
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export const extractLinkedInProfileAutomation = async (req, res) => {
//   try {
//     const  profileUrl  = "https://www.linkedin.com/in/refat-bhuyan/";
//     // const { profileUrl } = req.body;
    
//     if (!profileUrl) {
//       return res.status(400).json({
//         success: false,
//         error: 'Profile URL is required'
//       });
//     }

//     const result = await linkedInAutomation.extractLinkedInProfile(profileUrl);
    
//     res.status(result.success ? 200 : 400).json(result);
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export const closeLinkedInAutomation = async (req, res) => {
//   try {
//     // await linkedInAutomation.closeBrowser();
    
//     res.status(200).json({
//       success: true,
//       message: 'LinkedIn automation closed successfully'
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// // Internal function for use in existing controller
// export const extractLinkedInProfilesWithPlaywright = async (profileUrls, searchId, credentials) => {
//   try {
//     console.log(`🎭 Starting Playwright extraction for ${profileUrls.length} profiles`);
    
//     // Initialize browser in production mode for internal use
//     const automation = new LinkedInAutomation();
//     const initialized = await automation.initializeBrowser('production');
    
//     if (!initialized) {
//       throw new Error('Failed to initialize browser for LinkedIn extraction');
//     }

//     // Login with provided credentials
//     const loginResult = await automation.loginToLinkedIn(credentials.email, credentials.password);
//     if (!loginResult.success) {
//       throw new Error(`Login failed: ${loginResult.message}`);
//     }

//     // Extract profiles with progress callback
//     const results = await automation.extractMultipleProfiles(profileUrls, (progress) => {
//       console.log(`📈 Playwright extraction progress: ${progress.processed}/${progress.total}`);
      
//       // Emit progress to frontend if searchId provided
//       if (searchId && progress.result.success) {
//         // This would integrate with your existing progress emission
//         // You can call your existing processLinkedInDOM equivalent here
//         processPlaywrightResult(searchId, progress.result);
//       }
//     });

//     // Close browser
//     await automation.closeBrowser();

//     console.log(`✅ Playwright extraction completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    
//     return results;

//   } catch (error) {
//     console.error('❌ Playwright extraction error:', error.message);
//     throw error;
//   }
// };

// // Helper function to process results similar to existing processLinkedInDOM
// async function processPlaywrightResult(searchId, extractionResult) {
//   try {
//     if (!extractionResult.success || !extractionResult.data) {
//       return;
//     }

//     const profileData = extractionResult.data;
    
//     // Use your existing extractCandidateFromStructuredData function
//     const candidate = await extractCandidateFromStructuredData(profileData, 'playwright-automation');
    
//     if (candidate) {
//       // Use your existing saveCandidateToBuffer function
//       await saveCandidateToBuffer(searchId, candidate, "linkedin-playwright");
//       console.log(`✅ Processed candidate via Playwright: ${candidate.candidateName}`);
//     }
    
//   } catch (error) {
//     console.error('❌ Error processing Playwright result:', error.message);
//   }
// }

// export default linkedInAutomation;



// // dynamicLinkedInExtractor.js
// import { chromium } from 'playwright';
// import { OpenAI } from "openai";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// // Configuration
// const BROWSER_CONFIG = {
//   development: {
//     headless: false,
//     slowMo: 1000,
//     devtools: true,
//   },
//   production: {
//     headless: true,
//     slowMo: 0,
//     devtools: false,
//   }
// };

// class DynamicLinkedInExtractor {
//   constructor() {
//     this.browser = null;
//     this.context = null;
//     this.page = null;
//     this.isLoggedIn = false;
//   }

//   async initializeBrowser(env = 'development') {
//     try {
//       const config = BROWSER_CONFIG[env] || BROWSER_CONFIG.development;
      
//       console.log(`🚀 Initializing browser in ${env} mode (headless: ${config.headless})`);
      
//       this.browser = await chromium.launch({
//         headless: config.headless,
//         slowMo: config.slowMo,
//         devtools: config.devtools,
//         args: [
//           '--no-sandbox',
//           '--disable-setuid-sandbox',
//           '--disable-dev-shm-usage',
//           '--disable-accelerated-2d-canvas',
//           '--no-first-run',
//           '--no-zygote',
//           '--single-process',
//           '--disable-gpu'
//         ]
//       });

//       this.context = await this.browser.newContext({
//         userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//         viewport: { width: 1366, height: 768 },
//         locale: 'en-US',
//         timezoneId: 'America/New_York',
//       });

//       this.page = await this.context.newPage();
      
//       // Block unnecessary resources to speed up loading
//       await this.page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
      
//       console.log('✅ Browser initialized successfully');
//       return true;
//     } catch (error) {
//       console.error('❌ Error initializing browser:', error.message);
//       return false;
//     }
//   }

//   async loginToLinkedIn(email, password) {
//     try {
//       if (!this.page) {
//         throw new Error('Browser not initialized');
//       }

//       console.log('🔐 Attempting LinkedIn login...');
      
//       await this.page.goto('https://www.linkedin.com/login', { 
//         waitUntil: 'networkidle',
//         timeout: 30000 
//       });

//       await this.page.waitForSelector('#username', { timeout: 10000 });
      
//       await this.page.fill('#username', email);
//       await this.page.fill('#password', password);
//       await this.page.click('button[type="submit"]');
//       await this.page.waitForTimeout(3000);
      
//       const currentUrl = this.page.url();
      
//       if (currentUrl.includes('/challenge/')) {
//         console.log('⚠️ LinkedIn security challenge detected');
//         await this.handleSecurityChallenge();
//       } else if (currentUrl.includes('/feed/') || currentUrl.includes('/in/')) {
//         console.log('✅ Successfully logged into LinkedIn');
//         this.isLoggedIn = true;
//         return { success: true, message: 'Logged in successfully' };
//       } else {
//         console.log('❌ Login failed - unexpected redirect');
//         return { success: false, message: 'Login failed - unexpected redirect' };
//       }
      
//       return { success: true, message: 'Login completed' };
//     } catch (error) {
//       console.error('❌ Login error:', error.message);
//       return { success: false, message: `Login failed: ${error.message}` };
//     }
//   }

//   async handleSecurityChallenge() {
//     try {
//       console.log('🛡️ Handling LinkedIn security challenge...');
      
//       const emailVerification = await this.page.locator('[data-test-id="email-pin-challenge"]').isVisible();
//       if (emailVerification) {
//         console.log('📧 Email verification required. Please check your email and manually enter the code.');
//         if (!BROWSER_CONFIG.production.headless) {
//           await this.page.waitForTimeout(60000);
//         }
//       }
      
//       const phoneVerification = await this.page.locator('[data-test-id="phone-pin-challenge"]').isVisible();
//       if (phoneVerification) {
//         console.log('📱 Phone verification required. Please check your phone and manually enter the code.');
//         if (!BROWSER_CONFIG.production.headless) {
//           await this.page.waitForTimeout(60000);
//         }
//       }
      
//     } catch (error) {
//       console.error('❌ Error handling security challenge:', error.message);
//     }
//   }

//   async waitForPageLoad() {
//     try {
//       // Wait for multiple possible indicators that the page has loaded
//       const selectors = [
//         'main',
//         '[data-view-name="profile-component-entity"]',
//         '.pv-top-card',
//         '.profile-top-card',
//         '.pv-text-details__left-panel',
//         '.ph5'
//       ];

//       for (const selector of selectors) {
//         try {
//           await this.page.waitForSelector(selector, { timeout: 5000 });
//           console.log(`✅ Page loaded - detected: ${selector}`);
//           return true;
//         } catch (e) {
//           continue;
//         }
//       }

//       console.log('⚠️ No standard selectors found, waiting for network idle');
//       await this.page.waitForLoadState('networkidle');
//       return true;
//     } catch (error) {
//       console.log('⚠️ Page load timeout, continuing anyway');
//       return false;
//     }
//   }

//   async expandAllSections() {
//     try {
//       console.log('🔄 Attempting to expand all profile sections...');
      
//       // Comprehensive list of possible expand/show more selectors
//       const expandSelectors = [
//         // Show more text buttons
//         'button[data-control-name*="see_more"]',
//         'button[data-control-name*="show_more"]',
//         '.inline-show-more-text__button',
//         '.pv-shared-text-with-see-more button',
//         'button:has-text("see more")',
//         'button:has-text("Show more")',
//         'button.artdeco-button:has-text("more")',
        
//         // Section navigation buttons
//         'a[href*="details/skills"]',
//         'a[href*="details/projects"]',
//         'a[href*="details/experience"]',
//         'a[href*="details/education"]',
//         'a[id*="Show-all"]',
//         'a[id*="see-all"]',
        
//         // Generic expand buttons
//         '.pvs-navigation__text',
//         '[aria-label*="Show all"]',
//         '[aria-label*="See all"]'
//       ];

//       let expandedCount = 0;
//       for (const selector of expandSelectors) {
//         try {
//           const elements = await this.page.locator(selector).all();
//           for (const element of elements) {
//             try {
//               if (await element.isVisible() && await element.isEnabled()) {
//                 await element.click();
//                 await this.page.waitForTimeout(1500);
//                 expandedCount++;
//                 console.log(`✅ Expanded content using: ${selector}`);
//               }
//             } catch (clickError) {
//               continue;
//             }
//           }
//         } catch (selectorError) {
//           continue;
//         }
//       }
      
//       console.log(`✅ Expanded ${expandedCount} sections`);
//     } catch (error) {
//       console.log('⚠️ Error expanding sections:', error.message);
//     }
//   }

//   async extractProfileData() {
//     return await this.page.evaluate(() => {
//       const data = {
//         name: '',
//         headline: '',
//         location: '',
//         aboutText: '',
//         experience: [],
//         education: [],
//         skills: [],
//         projects: [],
//         connections: '',
//         profileUrl: window.location.href
//       };

//       // Dynamic name extraction with comprehensive selectors
//       const nameSelectors = [
//         'h1.text-heading-xlarge',
//         'h1[class*="inline t-24"]',
//         'h1[class*="break-words"]',
//         '.pv-text-details__left-panel h1',
//         '[data-anonymize="person-name"]',
//         '.ph5 h1',
//         'h1.cIHEZNEHiAPGXeBwbDitiwmhgEpNpYZAw',
//         '.pv-top-card--photo h1',
//         'main h1',
//         '.profile-top-card h1'
//       ];
      
//       for (const selector of nameSelectors) {
//         try {
//           const elements = document.querySelectorAll(selector);
//           for (const element of elements) {
//             const text = element.textContent?.trim();
//             if (text && text.length > 2 && !text.includes('LinkedIn') && !text.includes('Profile')) {
//               data.name = text;
//               break;
//             }
//           }
//           if (data.name) break;
//         } catch (e) {
//           continue;
//         }
//       }

//       // Dynamic headline extraction
//       const headlineSelectors = [
//         '.text-body-medium.break-words',
//         '.pv-text-details__left-panel .text-body-medium',
//         '[data-generated-suggestion-target] .text-body-medium',
//         '.ph5 .text-body-medium.break-words',
//         '.pv-top-card .text-body-medium',
//         '.profile-top-card .text-body-medium'
//       ];
      
//       for (const selector of headlineSelectors) {
//         try {
//           const element = document.querySelector(selector);
//           if (element) {
//             const text = element.textContent?.trim();
//             if (text && !text.includes('connection') && !text.includes('followers')) {
//               data.headline = text;
//               break;
//             }
//           }
//         } catch (e) {
//           continue;
//         }
//       }

//       // Dynamic location extraction
//       const locationSelectors = [
//         '.text-body-small.inline.t-black--light.break-words',
//         '.pv-text-details__left-panel .text-body-small',
//         'span.text-body-small.inline.t-black--light',
//         '.ph5 .text-body-small',
//         '.pv-top-card .text-body-small'
//       ];
      
//       for (const selector of locationSelectors) {
//         try {
//           const elements = document.querySelectorAll(selector);
//           for (const element of elements) {
//             const text = element.textContent?.trim();
//             if (text && 
//                 !text.includes('connection') && 
//                 !text.includes('Contact info') && 
//                 !text.includes('follower') &&
//                 !text.includes('mutual') &&
//                 text.length > 3) {
//               data.location = text;
//               break;
//             }
//           }
//           if (data.location) break;
//         } catch (e) {
//           continue;
//         }
//       }

//       // Extract about section
//       const aboutSelectors = ['#about', '[data-field="summary_info"]', 'section[data-section="summary"]'];
//       for (const selector of aboutSelectors) {
//         try {
//           const aboutSection = document.querySelector(selector);
//           if (aboutSection) {
//             const aboutContent = aboutSection.closest('section')?.querySelector(
//               '.pv-shared-text-with-see-more, .inline-show-more-text, .display-flex'
//             );
//             if (aboutContent) {
//               data.aboutText = aboutContent.textContent?.trim() || '';
//               break;
//             }
//           }
//         } catch (e) {
//           continue;
//         }
//       }

//       // Dynamic experience extraction
//       const experienceElements = document.querySelectorAll('[data-view-name="profile-component-entity"]');
//       experienceElements.forEach(element => {
//         try {
//           const titleElement = element.querySelector('.t-bold span[aria-hidden="true"]');
//           const companyElements = element.querySelectorAll('.t-14.t-normal span[aria-hidden="true"]');
//           const durationElement = element.querySelector('.t-14.t-normal.t-black--light .pvs-entity__caption-wrapper, .t-14.t-normal.t-black--light span[aria-hidden="true"]');
//           const locationElement = element.querySelector('.t-14.t-normal.t-black--light:last-child span[aria-hidden="true"]');
//           const descriptionElement = element.querySelector('.inline-show-more-text span[aria-hidden="true"], .pv-shared-text-with-see-more span');
          
//           if (titleElement && titleElement.textContent?.trim()) {
//             const title = titleElement.textContent.trim();
//             let company = '';
//             let employmentType = '';
            
//             // Extract company and employment type from multiple elements
//             companyElements.forEach(el => {
//               const text = el.textContent?.trim();
//               if (text && text.includes('·')) {
//                 const parts = text.split('·').map(p => p.trim());
//                 company = parts[0] || company;
//                 employmentType = parts[1] || employmentType;
//               } else if (text && !company) {
//                 company = text;
//               }
//             });
            
//             const experienceItem = {
//               title: title,
//               company: company,
//               employmentType: employmentType,
//               duration: durationElement?.textContent?.trim() || '',
//               location: locationElement?.textContent?.trim() || '',
//               description: descriptionElement?.textContent?.trim() || ''
//             };
            
//             data.experience.push(experienceItem);
//           }
//         } catch (e) {
//           // Skip invalid experience items
//         }
//       });

//       // Extract skills dynamically
//       const skillsSelectors = [
//         '[data-field="skill_card_skill_topic"] .t-bold span[aria-hidden="true"]',
//         '.hoverable-link-text.t-bold span[aria-hidden="true"]',
//         '.mr1.t-bold span[aria-hidden="true"]'
//       ];
      
//       const skillsSet = new Set();
      
//       skillsSelectors.forEach(selector => {
//         try {
//           const elements = document.querySelectorAll(selector);
//           elements.forEach(element => {
//             const skillText = element.textContent?.trim();
//             if (skillText && 
//                 skillText.length > 1 &&
//                 !skillText.includes('endorsement') && 
//                 !skillText.includes('connection') &&
//                 !skillText.includes('Show all') &&
//                 !skillText.includes('skills') &&
//                 !skillText.includes('projects')) {
//               skillsSet.add(skillText);
//             }
//           });
//         } catch (e) {
//           // Continue with next selector
//         }
//       });
      
//       // Extract skills from experience descriptions (e.g., "nextjs, Redux.js and +11 skills")
//       document.querySelectorAll('strong').forEach(element => {
//         try {
//           const text = element.textContent?.trim();
//           if (text && text.includes(' and +') && text.includes('skills')) {
//             const skillsText = text.replace(/ and \+\d+ skills.*/, '');
//             const individualSkills = skillsText.split(',').map(s => s.trim());
//             individualSkills.forEach(skill => {
//               if (skill && skill.length > 1) {
//                 skillsSet.add(skill);
//               }
//             });
//           }
//         } catch (e) {
//           // Continue
//         }
//       });
      
//       data.skills = Array.from(skillsSet);

//       // Extract projects
//       const projectElements = document.querySelectorAll('[data-view-name="profile-component-entity"]');
//       projectElements.forEach(element => {
//         try {
//           const titleElement = element.querySelector('.t-bold.break-words span[aria-hidden="true"]');
//           const descriptionElement = element.querySelector('.inline-show-more-text span[aria-hidden="true"]');
//           const linkElement = element.querySelector('a[href*=".app"], a[href*=".com"]:not([href*="linkedin.com"])');
//           const dateElement = element.querySelector('.t-14.t-normal:not(.t-black--light) span[aria-hidden="true"]');
          
//           if (titleElement) {
//             const title = titleElement.textContent?.trim();
//             // Filter out experience items that aren't projects
//             if (title && !data.experience.some(exp => exp.title.includes(title))) {
//               const project = {
//                 title: title,
//                 description: descriptionElement?.textContent?.trim() || '',
//                 link: linkElement?.href || '',
//                 date: dateElement?.textContent?.trim() || ''
//               };
//               data.projects.push(project);
//             }
//           }
//         } catch (e) {
//           // Continue
//         }
//       });

//       // Extract education
//       const educationSelectors = [
//         '.education-item',
//         '[data-field*="education"]',
//         '.pvs-entity:has([alt*="logo"])'
//       ];
      
//       educationSelectors.forEach(selector => {
//         try {
//           const elements = document.querySelectorAll(selector);
//           elements.forEach(element => {
//             const schoolElement = element.querySelector('.t-bold, .hoverable-link-text');
//             const degreeElement = element.querySelector('.t-14.t-normal');
            
//             if (schoolElement) {
//               const school = schoolElement.textContent?.trim();
//               if (school && !data.education.some(edu => edu.school === school)) {
//                 data.education.push({
//                   school: school,
//                   degree: degreeElement?.textContent?.trim() || '',
//                   duration: ''
//                 });
//               }
//             }
//           });
//         } catch (e) {
//           // Continue
//         }
//       });

//       // Extract connections count
//       try {
//         const connectionElements = document.querySelectorAll('.t-bold');
//         connectionElements.forEach(element => {
//           const text = element.textContent?.trim();
//           if (text && (text.includes('connections') || text.includes('followers'))) {
//             data.connections = element.parentElement?.textContent?.trim() || text;
//           }
//         });
//       } catch (e) {
//         // Connections not critical
//       }

//       return data;
//     });
//   }

//   async extractLinkedInProfile(profileUrl) {
//     try {
//       if (!this.isLoggedIn || !this.page) {
//         throw new Error('Not logged in or browser not initialized');
//       }

//       console.log(`🔍 Extracting profile: ${profileUrl}`);
      
//       await this.page.goto(profileUrl, { 
//         waitUntil: 'networkidle',
//         timeout: 30000 
//       });

//       // Wait for page to load dynamically
//       await this.waitForPageLoad();
      
//       // Expand all sections
//       await this.expandAllSections();
      
//       // Extract profile data
//       const profileData = await this.extractProfileData();

//       // Enhanced validation with detailed feedback
//       const validationResults = {
//         name: !!profileData.name,
//         headline: !!profileData.headline,
//         location: !!profileData.location,
//         experience: profileData.experience.length > 0,
//         skills: profileData.skills.length > 0,
//         projects: profileData.projects.length > 0,
//         education: profileData.education.length > 0
//       };

//       const validationScore = Object.values(validationResults).filter(Boolean).length;
//       const totalFields = Object.keys(validationResults).length;

//       console.log(`✅ Extraction completed for: ${profileData.name || 'Unknown Profile'}`);
//       console.log(`📊 Data quality: ${validationScore}/${totalFields} fields extracted`);
//       console.log(`📋 Fields found:`, validationResults);
      
//       return {
//         success: true,
//         data: {
//           name: profileData.name,
//           headline: profileData.headline,
//           location: profileData.location,
//           aboutHtml: profileData.aboutText,
//           experience: profileData.experience,
//           education: profileData.education,
//           skills: profileData.skills,
//           projects: profileData.projects,
//           connections: profileData.connections,
//           profileUrl: profileData.profileUrl
//         },
//         extractionQuality: {
//           score: validationScore,
//           total: totalFields,
//           fieldsFound: validationResults
//         }
//       };

//     } catch (error) {
//       console.error(`❌ Error extracting profile ${profileUrl}:`, error.message);
//       return {
//         success: false,
//         error: error.message,
//         profileUrl: profileUrl,
//         extractedData: null
//       };
//     }
//   }

//   async extractMultipleProfiles(profileUrls, onProgress) {
//     const results = [];
//     let processed = 0;

//     for (const url of profileUrls) {
//       try {
//         if (processed > 0) {
//           await this.page.waitForTimeout(2000 + Math.random() * 3000);
//         }

//         const result = await this.extractLinkedInProfile(url);
//         results.push(result);
//         processed++;

//         if (onProgress) {
//           onProgress({
//             processed,
//             total: profileUrls.length,
//             current: url,
//             result
//           });
//         }

//         console.log(`📊 Progress: ${processed}/${profileUrls.length} profiles processed`);

//       } catch (error) {
//         console.error(`❌ Error processing ${url}:`, error.message);
//         results.push({
//           success: false,
//           error: error.message,
//           profileUrl: url
//         });
//         processed++;
//       }
//     }

//     return results;
//   }

//   async closeBrowser() {
//     try {
//       if (this.browser) {
//         await this.browser.close();
//         this.browser = null;
//         this.context = null;
//         this.page = null;
//         this.isLoggedIn = false;
//         console.log('🔒 Browser closed successfully');
//       }
//     } catch (error) {
//       console.error('❌ Error closing browser:', error.message);
//     }
//   }
// }

// // Enhanced controller functions
// const linkedInExtractor = new DynamicLinkedInExtractor();

// export const initializeLinkedInAutomation = async (req, res) => {
//   try {
//     const { environment = 'development' } = req.body;
    
//     const success = await linkedInExtractor.initializeBrowser(environment);
    
//     if (success) {
//       res.status(200).json({
//         success: true,
//         message: `LinkedIn automation initialized in ${environment} mode`,
//         headless: BROWSER_CONFIG[environment]?.headless || false
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         error: 'Failed to initialize browser'
//       });
//     }
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export const loginLinkedInAutomation = async (req, res) => {
//   try {
//     const email = "refatbubt@gmail.com";
//     const password = "6:!g9e#j2eBJMti";
    
//     const result = await linkedInExtractor.loginToLinkedIn(email, password);
    
//     res.status(result.success ? 200 : 400).json(result);
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export const extractLinkedInProfileAutomation = async (req, res) => {
//   try {
//     const { profileUrl } = req.body;
    
//     if (!profileUrl) {
//       return res.status(400).json({
//         success: false,
//         error: 'Profile URL is required'
//       });
//     }

//     // Validate LinkedIn URL
//     if (!profileUrl.includes('linkedin.com/in/')) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid LinkedIn profile URL format'
//       });
//     }

//     const result = await linkedInExtractor.extractLinkedInProfile(profileUrl);
    
//     res.status(result.success ? 200 : 400).json(result);
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export const extractMultipleProfilesAutomation = async (req, res) => {
//   try {
//     const { profileUrls } = req.body;
    
//     if (!profileUrls || !Array.isArray(profileUrls) || profileUrls.length === 0) {
//       return res.status(400).json({
//         success: false,
//         error: 'Profile URLs array is required'
//       });
//     }

//     // Validate all URLs
//     const invalidUrls = profileUrls.filter(url => !url.includes('linkedin.com/in/'));
//     if (invalidUrls.length > 0) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid LinkedIn URLs found',
//         invalidUrls
//       });
//     }

//     const results = await linkedInExtractor.extractMultipleProfiles(profileUrls);
    
//     const successCount = results.filter(r => r.success).length;
    
//     res.status(200).json({
//       success: true,
//       message: `Processed ${results.length} profiles, ${successCount} successful`,
//       results,
//       summary: {
//         total: results.length,
//         successful: successCount,
//         failed: results.length - successCount
//       }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export const closeLinkedInAutomation = async (req, res) => {
//   try {
//     await linkedInExtractor.closeBrowser();
    
//     res.status(200).json({
//       success: true,
//       message: 'LinkedIn automation closed successfully'
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// };

// export default linkedInExtractor;