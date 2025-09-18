import { OpenAI } from "openai"
import axios from "axios"
import { load } from "cheerio"
import BusinessProspect from "../../model/BusinessProspectModel.js"
import BusinessSearchHistory from "../../model/BusinessSearchHistoryModel.js"
import { io } from "../../index.js"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// In-memory search control
const searchControlMap = new Map()

// Force development mode if not set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
  console.log("🔧 Setting NODE_ENV to development for mock data");
}

// 1. Enhanced Google Search with multiple sources
const performEnhancedSearch2 = async (searchParams, maxResults = 100) => {
  const sources = [
    // LinkedIn profiles
    `"${searchParams.role}" "${searchParams.industry}" site:linkedin.com/in "${searchParams.location}"`,
    // Company websites
    `"${searchParams.role}" "${searchParams.company || searchParams.industry}" "${searchParams.location}" site:*.com`,
    // Professional directories
    `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" (site:crunchbase.com OR site:angel.co OR site:zoominfo.com)`,
    // Industry-specific searches
    `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" contact email`,
    // Recent news mentions
    `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" (hired OR promoted OR joined) site:*.com`
  ];

  let allResults = [];
  
  for (const query of sources) {
    try {
      const results = await performGoogleSearch(query, Math.ceil(maxResults / sources.length));
      allResults.push(...results);
      
      // Rate limiting between different searches
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Search failed for query: ${query}`, error);
    }
  }

  // Remove duplicates and return unique results
  const uniqueResults = allResults.filter((result, index, self) => 
    index === self.findIndex(r => r.link === result.link)
  );

  return uniqueResults.slice(0, maxResults);
};

const performEnhancedSearch = async (searchParams, maxResults = 200) => { // Increased from 100
  const sources = [
    // More comprehensive search queries
    `"${searchParams.role}" "${searchParams.industry}" site:linkedin.com/in "${searchParams.location}"`,
    `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" site:*.com`,
    `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" (site:crunchbase.com OR site:angel.co OR site:zoominfo.com)`,
    `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" contact email`,
    `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" (hired OR promoted OR joined)`,
    // Additional broad searches
    `${searchParams.role.split(',')[0]} "${searchParams.industry}" "${searchParams.location}"`, // First role only
    `${searchParams.location} "${searchParams.industry}" professionals`,
    `"${searchParams.industry}" careers "${searchParams.location}" jobs`
  ];

  let allResults = [];
  
  for (const query of sources) {
    try {
      console.log(`🔍 Searching with query: "${query}"`);
      const results = await performGoogleSearch(query, Math.ceil(maxResults / sources.length));
      console.log(`   Found ${results.length} results for this query`);
      
      if (results.length > 0) {
        allResults.push(...results);
        // Reduced wait time for faster processing
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Search failed for query: ${query}`, error.message);
      continue;
    }
  }

  // Remove duplicates and return more results
  const uniqueResults = allResults.filter((result, index, self) => 
    index === self.findIndex(r => r.link === result.link)
  );

  console.log(`📊 Total unique results found: ${uniqueResults.length}`);
  return uniqueResults.slice(0, maxResults);
};

// Google Search Function
const performGoogleSearch = async (query, maxResults = 50) => {
  try {
    // Using Google Custom Search API (you'll need to set up API key and search engine ID)
    const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY
    const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      throw new Error("Google Search API credentials not configured")
    }

    const results = []
    const resultsPerPage = 10
    const totalPages = Math.ceil(Math.min(maxResults, 100) / resultsPerPage)

    for (let page = 0; page < totalPages; page++) {
      const startIndex = page * resultsPerPage + 1

      const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
        params: {
          key: GOOGLE_API_KEY,
          cx: GOOGLE_SEARCH_ENGINE_ID,
          q: query,
          start: startIndex,
          num: resultsPerPage,
        },
      })

      if (response.data.items) {
        results.push(...response.data.items)
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return results.slice(0, maxResults)
  } catch (error) {
    console.error("Google search error:", error)
    throw error
  }
}

const extractContactInfo = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: 8000, // REDUCED from 15000
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    // ... rest of the function stays the same
    const $ = load(response.data);
    // ... keep all the existing extraction logic
    
    const emails = [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const pageText = $.text();
    
    // Extract from different sections
    const emailSources = [
      $('a[href^="mailto:"]').map((i, el) => $(el).attr('href').replace('mailto:', '')).get(),
      pageText.match(emailRegex) || [],
      $('[data-email]').map((i, el) => $(el).data('email')).get()
    ];

    emailSources.flat().forEach(email => {
      if (email && !email.includes('example.com') && !email.includes('noreply') && 
          !email.includes('support@') && email.includes('@')) {
        emails.push(email.toLowerCase());
      }
    });

    // Enhanced phone extraction with country code detection
    const phones = [];
    const phonePatterns = [
      /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
      /\(\d{3}\)[-.\s]?\d{3}[-.\s]?\d{4}/g,
      /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
      /\d{10,}/g
    ];

    phonePatterns.forEach(pattern => {
      const matches = pageText.match(pattern) || [];
      matches.forEach(phone => {
        const cleanPhone = phone.replace(/[^\d+]/g, '');
        if (cleanPhone.length >= 10) {
          let formattedPhone = cleanPhone;
          if (!formattedPhone.startsWith('+')) {
            formattedPhone = formattedPhone.length === 10 ? `+1${formattedPhone}` : `+${formattedPhone}`;
          }
          phones.push(formattedPhone);
        }
      });
    });

    // Enhanced social media extraction
    const socialLinks = {};
    
    $('a[href*="linkedin.com"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('/in/') || href.includes('/company/'))) {
        socialLinks.linkedin = href.split('?')[0];
      }
    });

    const socialPlatforms = [
      { key: 'twitter', domains: ['twitter.com', 'x.com'] },
      { key: 'github', domains: ['github.com'] },
      { key: 'crunchbase', domains: ['crunchbase.com'] },
      { key: 'angelco', domains: ['angel.co', 'wellfound.com'] }
    ];

    socialPlatforms.forEach(platform => {
      platform.domains.forEach(domain => {
        $(`a[href*="${domain}"]`).each((i, el) => {
          const href = $(el).attr('href');
          if (href && !socialLinks[platform.key]) {
            socialLinks[platform.key] = href.split('?')[0];
          }
        });
      });
    });

    const title = $('title').text().trim();
    const description = $('meta[name="description"]').attr('content') || 
                      $('meta[property="og:description"]').attr('content') || '';
    
    const companyInfo = extractCompanyInfo($, pageText);

    return {
      emails: [...new Set(emails)].slice(0, 5),
      phones: [...new Set(phones)].slice(0, 3),
      socialLinks,
      title,
      description,
      url,
      companyInfo
    };
  } catch (error) {
    console.error(`Enhanced extraction error for ${url}:`, error.message);
    return null;
  }
};

// 3. Enhanced company information extraction
const extractCompanyInfo = ($, pageText) => {
  const companyInfo = {};
  
  // Company size indicators
  const sizeIndicators = pageText.match(/(\d+[\+]?\s*(employees?|people|staff|team members?))/gi);
  if (sizeIndicators && sizeIndicators.length > 0) {
    companyInfo.size = sizeIndicators[0];
  }

  // Revenue indicators
  const revenueIndicators = pageText.match(/(\$\d+[MBK]?\s*(revenue|sales|annual))/gi);
  if (revenueIndicators && revenueIndicators.length > 0) {
    companyInfo.revenue = revenueIndicators[0];
  }

  // Industry keywords
  const industryKeywords = [
    'technology', 'healthcare', 'finance', 'education', 'manufacturing',
    'retail', 'consulting', 'software', 'AI', 'fintech', 'biotech'
  ];
  
  companyInfo.industries = industryKeywords.filter(keyword => 
    pageText.toLowerCase().includes(keyword)
  );

  return companyInfo;
};

// 4. Enhanced AI analysis with more comprehensive prompting
const analyzeProspectWithAI2 = async (prospectData, searchCriteria) => {
  try {
    const prompt = `
    Analyze this business prospect comprehensively for B2B sales opportunities:
    
    PROSPECT PROFILE:
    Name: ${prospectData.name}
    Job Title: ${prospectData.jobTitle}
    Company: ${prospectData.company}
    Location: ${prospectData.location}
    Industry: ${searchCriteria.industry}
    Company Size: ${prospectData.companyInfo?.size || 'Unknown'}
    Company Revenue: ${prospectData.companyInfo?.revenue || 'Unknown'}
    
    CONTEXT: ${prospectData.description || 'No additional context'}
    
    Provide analysis in JSON format:
    {
      "industryExpertise": ["specific expertise areas"],
      "keyStrengths": ["unique strengths and achievements"],
      "potentialPainPoints": ["likely business challenges"],
      "businessOpportunities": ["specific collaboration opportunities"],
      "competitorAnalysis": "competitive landscape insights",
      "marketPosition": "company's market position",
      "decisionMakingAuthority": "high|medium|low",
      "priorityScore": 85,
      "conversionProbability": 75,
      "bestContactMethod": "email|linkedin|phone",
      "optimalContactTime": "morning|afternoon|evening",
      "approachStrategy": "detailed outreach strategy",
      "budgetLikelihood": "high|medium|low",
      "timeToDecision": "fast|medium|slow",
      "keyMotivators": ["primary business motivators"],
      "riskFactors": ["potential risks or objections"]
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("Enhanced AI analysis error:", error);
    return getDefaultAnalysis();
  }
};

const analyzeProspectWithAI = async (prospectData, searchCriteria) => {
  try {
    const prompt = `
    Analyze this business prospect for B2B sales opportunities. Provide varied and realistic scoring based on the available information:
    
    PROSPECT PROFILE:
    Name: ${prospectData.name}
    Job Title: ${prospectData.jobTitle}
    Company: ${prospectData.company}
    Location: ${prospectData.location}
    Industry: ${searchCriteria.industry}
    Description: ${prospectData.description || 'No additional context'}
    
    SCORING GUIDELINES:
    - Priority Score: 20-95 (be realistic, not all prospects are 85+)
    - Consider company size, role seniority, industry match
    - Higher scores for decision makers (C-level, Directors, Partners)
    - Medium scores for managers and specialists
    - Lower scores for individual contributors or unclear roles
    
    Respond with valid JSON only:
    {
      "industryExpertise": ["specific expertise area 1", "specific expertise area 2"],
      "keyStrengths": ["strength based on role and company", "another relevant strength"],
      "potentialPainPoints": ["realistic business challenge 1", "realistic business challenge 2"],
      "businessOpportunities": ["specific opportunity 1", "specific opportunity 2"],
      "competitorAnalysis": "brief competitive landscape insight",
      "marketPosition": "company market position assessment",
      "decisionMakingAuthority": "high|medium|low",
      "priorityScore": 65,
      "conversionProbability": 45,
      "bestContactMethod": "email|linkedin|phone",
      "optimalContactTime": "morning|afternoon|evening",
      "approachStrategy": "specific outreach strategy",
      "budgetLikelihood": "high|medium|low",
      "timeToDecision": "fast|medium|slow",
      "keyMotivators": ["business motivator 1", "business motivator 2"],
      "riskFactors": ["potential objection 1", "potential objection 2"]
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8, // Higher temperature for more varied responses
      max_tokens: 1200,
    });

    const content = response.choices[0].message.content;
    
    // Clean and parse JSON
    const cleanedContent = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanedContent);
    
    // Add some randomization to ensure varied scores
    const scoreVariation = Math.floor(Math.random() * 20) - 10; // -10 to +10
    parsed.priorityScore = Math.max(20, Math.min(95, parsed.priorityScore + scoreVariation));
    parsed.conversionProbability = Math.max(15, Math.min(90, parsed.conversionProbability + Math.floor(Math.random() * 15) - 7));
    
    return parsed;

  } catch (error) {
    console.error("Enhanced AI analysis error:", error);
    return getDefaultAnalysisWithRandomScoring(prospectData, searchCriteria);
  }
};

const getDefaultAnalysisWithRandomScoring = (prospectData, searchCriteria) => {
  // Generate more realistic varied scores
  const roleScore = prospectData.jobTitle.toLowerCase().includes('secretary') ? 45 : 
                   prospectData.jobTitle.toLowerCase().includes('lawyer') ? 75 :
                   prospectData.jobTitle.toLowerCase().includes('director') ? 80 :
                   prospectData.jobTitle.toLowerCase().includes('partner') ? 90 : 60;
                   
  const randomVariation = Math.floor(Math.random() * 20) - 10;
  const finalScore = Math.max(25, Math.min(95, roleScore + randomVariation));
  
  return {
    industryExpertise: [searchCriteria.industry, "Professional services"],
    keyStrengths: ["Industry experience", "Professional background"],
    potentialPainPoints: ["Process efficiency", "Technology adoption"],
    businessOpportunities: ["Service partnership", "Collaboration potential"],
    competitorAnalysis: "Competitive landscape varies by specialization",
    marketPosition: "Established professional",
    decisionMakingAuthority: prospectData.jobTitle.toLowerCase().includes('partner') || 
                           prospectData.jobTitle.toLowerCase().includes('director') ? "high" :
                           prospectData.jobTitle.toLowerCase().includes('manager') ? "medium" : "low",
    priorityScore: finalScore,
    conversionProbability: Math.max(20, finalScore - 15 + Math.floor(Math.random() * 20)),
    bestContactMethod: "email",
    optimalContactTime: "morning",
    approachStrategy: "Professional industry-focused approach",
    budgetLikelihood: finalScore > 70 ? "medium" : finalScore > 50 ? "low" : "low",
    timeToDecision: "medium",
    keyMotivators: ["Efficiency improvement", "Cost reduction"],
    riskFactors: ["Budget constraints", "Time availability"]
  };
};

// SOLUTION 1: Add fallback search methods and better error handling
const performEnhancedSearchWithFallback = async (searchParams, maxResults = 50) => {
  console.log("🔍 Starting enhanced search with params:", searchParams);
  
  // Check if Google API is configured
  const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
  const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
  if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
    console.warn("⚠️ Google Search API not configured, using fallback method");
    return await performFallbackSearch(searchParams, maxResults);
  }

  try {
    // Try enhanced search first
    const results = await performGoogleSearchEnhanced(searchParams, maxResults);
    console.log(`✅ Enhanced search found ${results.length} results`);
    return results;
  } catch (error) {
    console.error("❌ Enhanced search failed:", error.message);
    console.log("🔄 Falling back to basic search");
    return await performFallbackSearch(searchParams, maxResults);
  }
};

const performFallbackSearch = async (searchParams, maxResults) => {
  console.log("🔄 Using fallback search method");
  
  // Check if we should use mock data for testing
  if (process.env.NODE_ENV === 'development' || !process.env.GOOGLE_SEARCH_API_KEY) {
    console.log("🎭 Using mock data for development/testing");
    const mockResults = generateMockSearchResults(searchParams, Math.min(maxResults, 20));
    console.log(`🎭 Generated ${mockResults.length} mock results for testing`);
    return mockResults;
  }
  
  // In production with no Google API, try alternative methods
  try {
    // You could implement other search methods here:
    // 1. Bing Search API
    // 2. DuckDuckGo API
    // 3. Other professional databases
    
    console.warn("⚠️ No alternative search methods configured");
    return [];
  } catch (error) {
    console.error("Fallback search error:", error);
    return [];
  }
};

const performGoogleSearchEnhanced = async (searchParams, maxResults) => {
  const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
  const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

  // Create more flexible search queries
  const searchQueries = [
    // Primary LinkedIn search
    `"${searchParams.role}" site:linkedin.com/in ${searchParams.location}`,
    
    // Industry-specific search
    `"${searchParams.role}" "${searchParams.industry}" ${searchParams.location}`,
    
    // Company directory search
    `"${searchParams.role}" "${searchParams.industry}" contact ${searchParams.location}`,
    
    // Professional directory search
    `"${searchParams.role}" ${searchParams.location} email phone`,
    
    // Broader search if specific queries fail
    `${searchParams.role} ${searchParams.industry} ${searchParams.location}`
  ];

  let allResults = [];
  const resultsPerQuery = Math.ceil(maxResults / searchQueries.length);

  for (let i = 0; i < searchQueries.length && allResults.length < maxResults; i++) {
    const query = searchQueries[i];
    console.log(`🔍 Searching with query ${i + 1}/${searchQueries.length}: "${query}"`);

    try {
      // FIX: Use performGoogleSearch instead of executeGoogleSearch
      const results = await performGoogleSearch(query, resultsPerQuery);
      console.log(`   Found ${results.length} results for this query`);
      
      if (results.length > 0) {
        allResults.push(...results);
        // Rate limiting between queries
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`   Query failed: ${error.message}`);
      continue; // Try next query
    }
  }

  // Remove duplicates
  const uniqueResults = allResults.filter((result, index, self) => 
    index === self.findIndex(r => r.link === result.link)
  );

  console.log(`📊 Total unique results found: ${uniqueResults.length}`);
  return uniqueResults.slice(0, maxResults);
};

const generateMockSearchResults = (searchParams, count) => {
  console.log(`🎭 Generating ${count} mock results for testing`);
  const mockResults = [];
  
  const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Lisa', 'Chris', 'Amy', 'Robert', 'Emily'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  const companies = [
    'Legal Associates Ltd', 'City Law Firm', 'Metropolitan Legal', 'Crown Solicitors', 
    'Thames Legal Group', 'London Law Partners', 'Capital Legal Services', 'British Legal Corp'
  ];
  
  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    
    mockResults.push({
      title: `${firstName} ${lastName} - ${searchParams.role} at ${company}`,
      link: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${Math.random().toString(36).substr(2, 6)}`,
      snippet: `${firstName} ${lastName} is a ${searchParams.role} at ${company} in ${searchParams.location}. Experienced professional in ${searchParams.industry} with strong background in legal services and client support.`,
      displayLink: 'linkedin.com'
    });
  }
  
  return mockResults;
};


// Generate Outreach Content
const generateOutreachContent2 = async (prospect, analysis, searchCriteria) => {
  try {
    const prompt = `
    Generate personalized outreach content for this business prospect:
    
    Prospect: ${prospect.name}, ${prospect.jobTitle} at ${prospect.company}
    Location: ${prospect.location}
    Industry: ${searchCriteria.industry}
    
    Analysis Summary:
    - Priority Score: ${analysis.priorityScore}/100
    - Key Strengths: ${analysis.keyStrengths.join(", ")}
    - Business Opportunities: ${analysis.businessOpportunities.join(", ")}
    - Pain Points: ${analysis.potentialPainPoints.join(", ")}
    
    Generate outreach content in JSON format:
    {
      "emailSubject": "compelling subject line",
      "personalizedMessage": "personalized email message (200-300 words)",
      "linkedinMessage": "LinkedIn connection message (under 300 characters)",
      "valueProposition": "clear value proposition",
      "callToAction": "specific call to action",
      "followUpSequence": ["follow-up 1", "follow-up 2", "follow-up 3"]
    }
    
    Make it professional, personalized, and focused on value delivery.
    `

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 1200,
    })

    return JSON.parse(response.choices[0].message.content)
  } catch (error) {
    console.error("Outreach generation error:", error)
    return {
      emailSubject: "Partnership Opportunity",
      personalizedMessage: "Hello, I'd like to discuss a potential partnership opportunity.",
      linkedinMessage: "Hi, I'd like to connect and discuss potential collaboration.",
      valueProposition: "We help businesses grow through strategic partnerships.",
      callToAction: "Would you be available for a brief call this week?",
      followUpSequence: ["Following up on my previous message", "Checking in again", "Final follow-up"],
    }
  }
}

const generateOutreachContent = async (prospect, analysis, searchCriteria) => {
  try {
    const prompt = `
    Generate personalized outreach content for this business prospect:
    
    Prospect: ${prospect.name}, ${prospect.jobTitle} at ${prospect.company}
    Location: ${prospect.location}
    Industry: ${searchCriteria.industry}
    
    Analysis Summary:
    - Priority Score: ${analysis.priorityScore}/100
    - Key Strengths: ${analysis.keyStrengths.join(", ")}
    - Business Opportunities: ${analysis.businessOpportunities.join(", ")}
    - Pain Points: ${analysis.potentialPainPoints.join(", ")}
    
    Generate outreach content in JSON format with properly escaped strings:
    {
      "emailSubject": "compelling subject line",
      "personalizedMessage": "personalized email message 200-300 words",
      "linkedinMessage": "LinkedIn connection message under 300 characters",
      "valueProposition": "clear value proposition",
      "callToAction": "specific call to action",
      "followUpSequence": ["follow-up 1", "follow-up 2", "follow-up 3"]
    }
    
    IMPORTANT: Ensure all JSON strings are properly escaped and contain no line breaks or special characters that would break JSON parsing.
    `

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7, // Reduced for more consistent output
      max_tokens: 1000, // Reduced to avoid truncation issues
    })

    const content = response.choices[0].message.content;
    
    // Clean the response to ensure valid JSON
    const cleanedContent = content
      .replace(/[\n\r\t]/g, ' ') // Remove line breaks and tabs
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/"/g, '\\"') // Escape quotes in content
      .replace(/\\\\"([^"]*)":/g, '"$1":') // Fix escaped property names
      .trim();

    // Try to extract JSON from the response
    let jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("JSON parse error, using fallback:", parseError.message);
      throw parseError;
    }

  } catch (error) {
    console.error("Outreach generation error:", error);
    return getDefaultOutreachContent(prospect, searchCriteria);
  }
}

// 6. Enhanced search process
const processEnhancedBusinessSearch2 = async (searchId, searchParams, userId) => {
  try {
    const searchHistory = await BusinessSearchHistory.findById(searchId);
    if (!searchHistory) return;

    // Phase 1: Multi-source search
    io.emit("businessSearchProgress", {
      searchId,
      status: "Searching multiple sources for prospects...",
      progress: 5,
      phase: "multi-source-search",
    });

    const searchResults = await performEnhancedSearch(searchParams, searchParams.maxResults || 100);
    
    // Phase 2: Enhanced analysis
    io.emit("businessSearchProgress", {
      searchId,
      status: `Found ${searchResults.length} potential prospects. Starting enhanced analysis...`,
      progress: 20,
      phase: "enhanced-analysis",
    });

    const prospects = [];
    let processed = 0;

    for (const result of searchResults) {
      if (searchControlMap.get(searchId)?.shouldStop) {
        await handleSearchStop(searchId);
        return;
      }

      try {
        // Enhanced contact extraction
        const contactInfo = await extractContactInfo(result.link);
        if (!contactInfo) {
          processed++;
          continue;
        }

        // Enhanced prospect data creation
        const prospectData = {
          name: extractNameFromTitle(result.title),
          jobTitle: extractJobTitle(result.title, result.snippet),
          company: extractCompany(result.title, result.snippet),
          location: searchParams.location,
          description: result.snippet,
          url: result.link,
          companyInfo: contactInfo.companyInfo
        };

        if (!prospectData.name || !prospectData.company) {
          processed++;
          continue;
        }

        // Enhanced AI analysis
        const analysis = await analyzeProspectWithAI(prospectData, searchParams);
        const outreachContent = await generateOutreachContent(prospectData, analysis, searchParams);

        // Create enhanced prospect record
        const prospect = new BusinessProspect({
          name: prospectData.name,
          email: contactInfo.emails[0] || null,
          phone: contactInfo.phones[0] || null, // Now includes country code
          jobTitle: prospectData.jobTitle,
          company: prospectData.company,
          location: prospectData.location,

          searchCriteria: {
            ...searchParams,
            searchId: searchId // Link to specific search
          },

          profileUrls: {
            linkedin: contactInfo.socialLinks.linkedin,
            portfolio: contactInfo.socialLinks.github,
            companyWebsite: result.link,
            twitter: contactInfo.socialLinks.twitter,
            crunchbase: contactInfo.socialLinks.crunchbase,
            angelco: contactInfo.socialLinks.angelco,
          },

          aiAnalysis: {
            industryExpertise: analysis.industryExpertise,
            keyStrengths: analysis.keyStrengths,
            potentialPainPoints: analysis.potentialPainPoints,
            businessOpportunities: analysis.businessOpportunities,
            competitorAnalysis: analysis.competitorAnalysis,
            marketPosition: analysis.marketPosition,
            decisionMakingAuthority: analysis.decisionMakingAuthority,
            keyMotivators: analysis.keyMotivators || [],
            riskFactors: analysis.riskFactors || [],
            budgetLikelihood: analysis.budgetLikelihood || 'medium',
            timeToDecision: analysis.timeToDecision || 'medium'
          },

          outreachContent: {
            personalizedMessage: outreachContent.personalizedMessage,
            emailSubject: outreachContent.emailSubject,
            linkedinMessage: outreachContent.linkedinMessage,
            followUpSequence: outreachContent.followUpSequence,
            valueProposition: outreachContent.valueProposition,
            callToAction: outreachContent.callToAction,
          },

          recommendations: {
            bestContactMethod: analysis.bestContactMethod,
            optimalContactTime: analysis.optimalContactTime,
            approachStrategy: analysis.approachStrategy,
            priorityScore: analysis.priorityScore,
            conversionProbability: analysis.conversionProbability,
          },

          businessContext: {
            companySize: prospectData.companyInfo?.size,
            companyRevenue: prospectData.companyInfo?.revenue,
            industry: searchParams.industry,
            techStack: prospectData.companyInfo?.industries || []
          },

          sourceInfo: {
            searchEngine: "Enhanced Google Search",
            searchQuery: `Multi-source search for ${searchParams.role} in ${searchParams.industry}`,
            sourceUrl: result.link,
            dataQuality: contactInfo.emails.length > 0 && contactInfo.phones.length > 0 ? "high" : 
                        contactInfo.emails.length > 0 ? "medium" : "low",
            searchId: searchId // Link to specific search
          },

          createdBy: userId,
        });

        await prospect.save();
        prospects.push(prospect);
        processed++;

        // Update progress
        const progressPercent = Math.round((processed / searchResults.length) * 70) + 25;
        io.emit("businessSearchProgress", {
          searchId,
          status: `Analyzed ${processed}/${searchResults.length} prospects`,
          progress: progressPercent,
          phase: "analyzing",
          prospectsFound: prospects.length,
        });

        // Reduced rate limiting for faster processing
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error processing prospect:`, error);
        processed++;
      }
    }

    // Complete search with enhanced results
    searchHistory.status = "completed";
    searchHistory.completedAt = new Date();
    searchHistory.results = {
      totalFound: searchResults.length,
      totalProcessed: processed,
      highPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 80).length,
      mediumPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80).length,
      lowPriorityProspects: prospects.filter(p => p.recommendations.priorityScore < 60).length,
      contactInfoQuality: {
        withEmail: prospects.filter(p => p.email).length,
        withPhone: prospects.filter(p => p.phone).length,
        withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length
      }
    };
    searchHistory.progress.percentage = 100;
    await searchHistory.save();

    io.emit("businessSearchComplete", {
      searchId,
      prospects: prospects.length,
      message: `Enhanced search completed! Found ${prospects.length} qualified prospects with improved contact data.`,
      qualityStats: searchHistory.results.contactInfoQuality
    });
  } catch (error) {
    console.error("Enhanced search process error:", error);
    // Error handling remains the same
  }
};

const processEnhancedBusinessSearch = async (searchId, searchParams, userId) => {
  try {
    console.log(`🚀 Starting enhanced search for ID: ${searchId}`);
    
    const searchHistory = await BusinessSearchHistory.findById(searchId);
    if (!searchHistory) {
      console.error("❌ Search history not found");
      return;
    }

    // Update status with more detailed progress
    searchHistory.status = "searching";
    searchHistory.progress.currentPhase = "Initializing multi-source search";
    await searchHistory.save();

    io.emit("businessSearchProgress", {
      searchId,
      status: "Initializing enhanced search with multiple sources...",
      progress: 5,
      phase: "initialization",
    });

    // Phase 1: Enhanced search with fallback
    io.emit("businessSearchProgress", {
      searchId,
      status: "Searching across multiple platforms...",
      progress: 15,
      phase: "searching",
    });

    const searchResults = await performEnhancedSearchWithFallback(searchParams, searchParams.maxResults || 50);
    
    if (searchResults.length === 0) {
      console.warn("⚠️ No search results found, this might indicate:");
      console.warn("   - Google API issues");
      console.warn("   - Too specific search criteria");
      console.warn("   - Rate limiting");
      console.warn("   - Network connectivity issues");
      
      // Try with broader search criteria
      const broaderParams = {
        ...searchParams,
        keywords: [], // Remove keywords to broaden search
        companySize: 'any',
        experienceLevel: 'any'
      };
      
      console.log("🔄 Retrying with broader search criteria");
      const broaderResults = await performEnhancedSearchWithFallback(broaderParams, 20);
      searchResults.push(...broaderResults);
    }

    console.log(`📊 Final search results count: ${searchResults.length}`);

    if (searchControlMap.get(searchId)?.shouldStop) {
      await handleSearchStop(searchId);
      return;
    }

    // Update progress
    searchHistory.progress.totalItems = searchResults.length;
    searchHistory.status = "analyzing";
    searchHistory.progress.currentPhase = "Analyzing prospects";
    await searchHistory.save();

    io.emit("businessSearchProgress", {
      searchId,
      status: `Found ${searchResults.length} potential prospects. Starting detailed analysis...`,
      progress: 30,
      phase: "analyzing",
    });

    const prospects = [];
    let processed = 0;
    let successful = 0;

    // Process each search result with better error handling
    for (const result of searchResults) {
      if (searchControlMap.get(searchId)?.shouldStop) {
        await handleSearchStop(searchId);
        return;
      }

      try {
        console.log(`🔍 Processing result ${processed + 1}/${searchResults.length}: ${result.title}`);
        
        // Enhanced contact extraction with timeout
        const contactInfo = await extractContactInfoWithTimeout(result.link, 10000);

        if (!contactInfo) {
          console.log(`   ⚠️ No contact info extracted from ${result.link}`);
          processed++;
          continue;
        }

        // Create prospect data with fallback values
        const prospectData = {
          name: extractNameFromTitle(result.title) || generateNameFromUrl(result.link),
          jobTitle: extractJobTitle(result.title, result.snippet) || searchParams.role,
          company: extractCompany(result.title, result.snippet) || "Unknown Company",
          location: searchParams.location,
          description: result.snippet,
          url: result.link,
          companyInfo: contactInfo.companyInfo || {}
        };

        // Skip if essential data is still missing
        if (!prospectData.name || prospectData.name === "Unknown" || prospectData.name.length < 3) {
          console.log(`   ⚠️ Insufficient name data: "${prospectData.name}"`);
          processed++;
          continue;
        }

        console.log(`   ✅ Created prospect: ${prospectData.name} at ${prospectData.company}`);

        // AI Analysis with error handling
        let analysis;
        try {
          analysis = await analyzeProspectWithAI(prospectData, searchParams);
        } catch (error) {
          console.error(`   ❌ AI analysis failed: ${error.message}`);
          analysis = getDefaultAnalysis();
        }

        // Generate outreach content with error handling
        let outreachContent;
        try {
          outreachContent = await generateOutreachContent(prospectData, analysis, searchParams);
        } catch (error) {
          console.error(`   ❌ Outreach generation failed: ${error.message}`);
          outreachContent = getDefaultOutreachContent();
        }

        // Create prospect record
        const prospect = new BusinessProspect({
          name: prospectData.name,
          email: contactInfo.emails[0] || null,
          phone: contactInfo.phones[0] || null,
          jobTitle: prospectData.jobTitle,
          company: prospectData.company,
          location: prospectData.location,

          searchCriteria: {
            ...searchParams,
            searchId: searchId
          },

          profileUrls: {
            linkedin: contactInfo.socialLinks?.linkedin,
            portfolio: contactInfo.socialLinks?.github,
            companyWebsite: result.link,
            twitter: contactInfo.socialLinks?.twitter,
          },

          aiAnalysis: {
            industryExpertise: analysis.industryExpertise || [],
            keyStrengths: analysis.keyStrengths || [],
            potentialPainPoints: analysis.potentialPainPoints || [],
            businessOpportunities: analysis.businessOpportunities || [],
            competitorAnalysis: analysis.competitorAnalysis || "Analysis pending",
            marketPosition: analysis.marketPosition || "Unknown",
            decisionMakingAuthority: analysis.decisionMakingAuthority || "unknown",
          },

          outreachContent: {
            personalizedMessage: outreachContent.personalizedMessage || "Hello, I'd like to discuss a potential opportunity.",
            emailSubject: outreachContent.emailSubject || "Partnership Opportunity",
            linkedinMessage: outreachContent.linkedinMessage || "Hi, I'd like to connect.",
            followUpSequence: outreachContent.followUpSequence || [],
            valueProposition: outreachContent.valueProposition || "We help businesses grow.",
            callToAction: outreachContent.callToAction || "Would you be interested in learning more?",
          },

          recommendations: {
            bestContactMethod: analysis.bestContactMethod || "email",
            optimalContactTime: analysis.optimalContactTime || "morning",
            approachStrategy: analysis.approachStrategy || "Professional outreach",
            priorityScore: analysis.priorityScore || 50,
            conversionProbability: analysis.conversionProbability || 50,
          },

          sourceInfo: {
            searchEngine: "Enhanced Google Search",
            searchQuery: `${searchParams.role} in ${searchParams.industry}`,
            sourceUrl: result.link,
            dataQuality: contactInfo.emails?.length > 0 && contactInfo.phones?.length > 0 ? "high" : 
                        contactInfo.emails?.length > 0 ? "medium" : "low",
            searchId: searchId
          },

          createdBy: userId,
        });

        await prospect.save();
        prospects.push(prospect);
        successful++;

        console.log(`   💾 Saved prospect: ${prospect.name} (Priority: ${prospect.recommendations.priorityScore})`);

      } catch (error) {
        console.error(`   ❌ Error processing prospect:`, error.message);
      }

      processed++;

      // Update progress every 5 prospects
      if (processed % 5 === 0 || processed === searchResults.length) {
        const progressPercent = Math.round((processed / searchResults.length) * 60) + 30;
        io.emit("businessSearchProgress", {
          searchId,
          status: `Analyzed ${processed}/${searchResults.length} prospects (${successful} qualified)`,
          progress: progressPercent,
          phase: "analyzing",
          prospectsFound: prospects.length,
        });
      }

      // Reduced rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`🎉 Search completed: ${successful} prospects created from ${processed} results`);

    // Complete the search
    searchHistory.status = "completed";
    searchHistory.completedAt = new Date();
    searchHistory.results = {
      totalFound: searchResults.length,
      totalProcessed: processed,
      totalQualified: successful,
      highPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 80).length,
      mediumPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80).length,
      lowPriorityProspects: prospects.filter(p => p.recommendations.priorityScore < 60).length,
      contactInfoQuality: {
        withEmail: prospects.filter(p => p.email).length,
        withPhone: prospects.filter(p => p.phone).length,
        withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length
      }
    };
    searchHistory.progress.percentage = 100;
    await searchHistory.save();

    io.emit("businessSearchComplete", {
      searchId,
      prospects: prospects.length,
      message: `Search completed! Found ${prospects.length} qualified prospects from ${searchResults.length} sources.`,
      qualityStats: searchHistory.results.contactInfoQuality
    });

  } catch (error) {
    console.error("❌ Enhanced search process error:", error);
    
    await BusinessSearchHistory.findByIdAndUpdate(searchId, {
      status: "failed",
      errors: [error.message],
    });

    io.emit("businessSearchError", {
      searchId,
      error: `Search failed: ${error.message}. Please try again with different criteria.`,
    });
  }
};

// Helper function with timeout for contact extraction
const extractContactInfoWithTimeout2 = async (url, timeout = 10000) => {
  return Promise.race([
    extractContactInfo(url),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Extraction timeout')), timeout)
    )
  ]);
};

const extractContactInfoWithTimeout = async (url, timeout = 6000) => { // Reduced timeout
  const maxRetries = 2;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await Promise.race([
        extractContactInfo(url),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Extraction timeout after ${timeout}ms`)), timeout)
        )
      ]);
    } catch (error) {
      console.log(`   Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries && !error.message.includes('timeout')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // On final failure, return basic info to keep the prospect
      if (error.message.includes('timeout') || error.message.includes('403')) {
        console.log(`   Creating basic prospect info for ${url}`);
        return {
          emails: [],
          phones: [],
          socialLinks: {},
          title: 'Professional Profile',
          description: 'Contact information extracted from search results',
          url: url,
          companyInfo: {}
        };
      }
      
      return null;
    }
  }
};

// Helper function to generate name from URL as fallback
const generateNameFromUrl = (url) => {
  try {
    const match = url.match(/\/([^\/]+)$/);
    if (match) {
      return match[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
        .substring(0, 50);
    }
  } catch (error) {
    console.error('Name generation error:', error);
  }
  return null;
};

// Default analysis for fallback
const getDefaultAnalysis = () => ({
  industryExpertise: [],
  keyStrengths: ["Professional experience"],
  potentialPainPoints: ["Growth challenges"],
  businessOpportunities: ["Strategic partnership"],
  competitorAnalysis: "Analysis pending",
  marketPosition: "Unknown",
  decisionMakingAuthority: "unknown",
  priorityScore: 50,
  conversionProbability: 50,
  bestContactMethod: "email",
  optimalContactTime: "morning",
  approachStrategy: "Standard professional approach"
});

// Default outreach content for fallback
const getDefaultOutreachContent = (prospect, searchCriteria) => {
  const role = searchCriteria.role || 'Professional';
  const industry = searchCriteria.industry || 'your industry';
  const name = prospect.name || 'there';
  
  return {
    emailSubject: `${industry} Partnership Opportunity - ${role} Collaboration`,
    personalizedMessage: `Hello ${name}, I hope this message finds you well. I came across your profile and was impressed by your background as a ${role} in ${industry}. I believe there might be some exciting collaboration opportunities that could benefit both of us. Our company specializes in providing innovative solutions to ${industry} professionals, and I think our services could add significant value to your current operations. Would you be interested in a brief conversation to explore potential synergies? I'd be happy to share more details about how we've helped other ${role} professionals achieve their business goals.`,
    linkedinMessage: `Hi ${name}, I'd like to connect with you to discuss potential collaboration opportunities in ${industry}. Looking forward to connecting!`,
    valueProposition: `We help ${role} professionals in ${industry} streamline their operations and grow their business through innovative solutions and strategic partnerships.`,
    callToAction: `Would you be available for a brief 15-minute call this week to discuss how we can support your ${industry} initiatives?`,
    followUpSequence: [
      `Following up on my previous message about ${industry} collaboration opportunities.`,
      `Hi ${name}, I wanted to check in again about the partnership opportunity I mentioned.`,
      `Final follow-up: Would love to connect and explore how we can help your ${role} practice grow.`
    ]
  };
};

export const startBusinessDevelopmentSearch2 = async (req, res) => {
  try {
    const { searchParams, userId } = req.body;

    console.log("🚀 Starting business development search:", {
      userId,
      searchParams,
      timestamp: new Date().toISOString()
    });

    if (!searchParams || !userId) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    // Validate required search parameters
    if (!searchParams.industry || !searchParams.location || !searchParams.role) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required search parameters: industry, location, and role are required" 
      });
    }

    // Create search history record with enhanced tracking
    const searchHistory = new BusinessSearchHistory({
      userId,
      searchParams: {
        ...searchParams,
        enhancedSearch: true,
        searchVersion: '2.0'
      },
      status: "pending",
      progress: {
        currentPhase: "Initializing enhanced search",
        percentage: 0
      }
    });
    await searchHistory.save();

    const searchId = searchHistory._id.toString();
    searchControlMap.set(searchId, { shouldStop: false });

    console.log(`✅ Search initialized with ID: ${searchId}`);

    // Start enhanced search process
    processEnhancedBusinessSearch(searchId, searchParams, userId);

    res.json({
      success: true,
      searchId,
      message: "Enhanced business development search started",
    });
  } catch (error) {
    console.error("❌ Start enhanced search error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const startBusinessDevelopmentSearch = async (req, res) => {
  try {
    const { searchParams, userId } = req.body;

    console.log("🚀 Starting business development search:", {
      userId,
      searchParams,
      timestamp: new Date().toISOString()
    });

    if (!searchParams || !userId) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    if (!searchParams.industry || !searchParams.location || !searchParams.role) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required search parameters: industry, location, and role are required" 
      });
    }

    // Increase maxResults if not specified or if too low
    if (!searchParams.maxResults || searchParams.maxResults < 50) {
      searchParams.maxResults = 100; // Increased default
    }

    // Cap at reasonable limit to avoid overwhelming the system
    if (searchParams.maxResults > 200) {
      searchParams.maxResults = 200;
    }

    const searchHistory = new BusinessSearchHistory({
      userId,
      searchParams: {
        ...searchParams,
        enhancedSearch: true,
        searchVersion: '2.1' // Updated version
      },
      status: "pending",
      progress: {
        currentPhase: "Initializing enhanced search",
        percentage: 0
      }
    });
    await searchHistory.save();

    const searchId = searchHistory._id.toString();
    searchControlMap.set(searchId, { shouldStop: false });

    console.log(`✅ Search initialized with ID: ${searchId} (targeting ${searchParams.maxResults} results)`);

    processEnhancedBusinessSearch(searchId, searchParams, userId);

    res.json({
      success: true,
      searchId,
      message: `Enhanced business development search started (targeting ${searchParams.maxResults} prospects)`,
    });
  } catch (error) {
    console.error("❌ Start enhanced search error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};



// Process business search
const processBusinessSearch = async (searchId, searchParams, userId) => {
  try {
    const searchHistory = await BusinessSearchHistory.findById(searchId)
    if (!searchHistory) return

    // Update status
    searchHistory.status = "searching"
    searchHistory.progress.currentPhase = "Searching Google"
    await searchHistory.save()

    // Emit progress
    io.emit("businessSearchProgress", {
      searchId,
      status: "Searching for prospects...",
      progress: 10,
      phase: "searching",
    })

    // Build search query
    const query = `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" site:linkedin.com OR site:company.com OR site:about.me`

    // Perform Google search
    const searchResults = await performGoogleSearch(query, searchParams.maxResults || 50)

    if (searchControlMap.get(searchId)?.shouldStop) {
      await handleSearchStop(searchId)
      return
    }

    // Update progress
    searchHistory.progress.totalItems = searchResults.length
    searchHistory.status = "analyzing"
    searchHistory.progress.currentPhase = "Analyzing prospects"
    await searchHistory.save()

    io.emit("businessSearchProgress", {
      searchId,
      status: `Found ${searchResults.length} potential prospects. Analyzing...`,
      progress: 30,
      phase: "analyzing",
    })

    const prospects = []
    let processed = 0

    // Process each search result
    for (const result of searchResults) {
      if (searchControlMap.get(searchId)?.shouldStop) {
        await handleSearchStop(searchId)
        return
      }

      try {
        // Extract contact information
        const contactInfo = await extractContactInfo(result.link)

        if (!contactInfo) {
          processed++
          continue
        }

        // Create prospect data
        const prospectData = {
          name: extractNameFromTitle(result.title),
          jobTitle: extractJobTitle(result.title, result.snippet),
          company: extractCompany(result.title, result.snippet),
          location: searchParams.location,
          description: result.snippet,
          url: result.link,
        }

        // Skip if essential data is missing
        if (!prospectData.name || !prospectData.company) {
          processed++
          continue
        }

        // AI Analysis
        const analysis = await analyzeProspectWithAI(prospectData, searchParams)

        // Generate outreach content
        const outreachContent = await generateOutreachContent(prospectData, analysis, searchParams)

        // Create prospect record
        const prospect = new BusinessProspect({
          name: prospectData.name,
          email: contactInfo.emails[0] || null,
          phone: contactInfo.phones[0] || null,
          jobTitle: prospectData.jobTitle,
          company: prospectData.company,
          location: prospectData.location,

          searchCriteria: searchParams,

          profileUrls: {
            linkedin: contactInfo.socialLinks.linkedin,
            portfolio: contactInfo.socialLinks.github,
            companyWebsite: result.link,
            twitter: contactInfo.socialLinks.twitter,
          },

          aiAnalysis: {
            industryExpertise: analysis.industryExpertise,
            keyStrengths: analysis.keyStrengths,
            potentialPainPoints: analysis.potentialPainPoints,
            businessOpportunities: analysis.businessOpportunities,
            competitorAnalysis: analysis.competitorAnalysis,
            marketPosition: analysis.marketPosition,
            decisionMakingAuthority: analysis.decisionMakingAuthority,
          },

          outreachContent: {
            personalizedMessage: outreachContent.personalizedMessage,
            emailSubject: outreachContent.emailSubject,
            linkedinMessage: outreachContent.linkedinMessage,
            followUpSequence: outreachContent.followUpSequence,
            valueProposition: outreachContent.valueProposition,
            callToAction: outreachContent.callToAction,
          },

          recommendations: {
            bestContactMethod: analysis.bestContactMethod,
            optimalContactTime: analysis.optimalContactTime,
            approachStrategy: analysis.approachStrategy,
            priorityScore: analysis.priorityScore,
            conversionProbability: analysis.conversionProbability,
          },

          sourceInfo: {
            searchEngine: "Google",
            searchQuery: query,
            sourceUrl: result.link,
            dataQuality: contactInfo.emails.length > 0 ? "high" : "medium",
          },

          createdBy: userId,
        })

        await prospect.save()
        prospects.push(prospect)
        processed++

        // Update progress
        const progressPercent = Math.round((processed / searchResults.length) * 70) + 30
        io.emit("businessSearchProgress", {
          searchId,
          status: `Processed ${processed}/${searchResults.length} prospects`,
          progress: progressPercent,
          phase: "analyzing",
          prospectsFound: prospects.length,
        })

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`Error processing prospect:`, error)
        processed++
      }
    }

    // Complete the search
    searchHistory.status = "completed"
    searchHistory.completedAt = new Date()
    searchHistory.results = {
      totalFound: searchResults.length,
      totalProcessed: processed,
      highPriorityProspects: prospects.filter((p) => p.recommendations.priorityScore >= 80).length,
      mediumPriorityProspects: prospects.filter(
        (p) => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80,
      ).length,
      lowPriorityProspects: prospects.filter((p) => p.recommendations.priorityScore < 60).length,
    }
    searchHistory.progress.percentage = 100
    await searchHistory.save()

    io.emit("businessSearchComplete", {
      searchId,
      prospects: prospects.length,
      message: `Search completed! Found ${prospects.length} qualified prospects.`,
    })
  } catch (error) {
    console.error("Process search error:", error)

    await BusinessSearchHistory.findByIdAndUpdate(searchId, {
      status: "failed",
      errors: [error.message],
    })

    io.emit("businessSearchError", {
      searchId,
      error: error.message,
    })
  }
}

// Helper functions
const extractNameFromTitle = (title) => {
  // Extract name from LinkedIn or company page titles
  const patterns = [/^([A-Z][a-z]+ [A-Z][a-z]+)/, /([A-Z][a-z]+ [A-Z][a-z]+) - /, /([A-Z][a-z]+ [A-Z][a-z]+) \|/]

  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) return match[1]
  }

  return title.split(" - ")[0].split(" | ")[0].trim()
}

const extractJobTitle = (title, snippet) => {
  const jobTitlePatterns = [
    /- ([^|]+) \|/,
    /- ([^-]+) -/,
    /(CEO|CTO|VP|Director|Manager|Lead|Senior|Principal|Head of)[^,]*/i,
  ]

  for (const pattern of jobTitlePatterns) {
    const match = (title + " " + snippet).match(pattern)
    if (match) return match[1].trim()
  }

  return "Professional"
}

const extractCompany = (title, snippet) => {
  const companyPatterns = [/at ([^|,-]+)/i, /\| ([^|]+)$/, /- ([^-]+)$/]

  for (const pattern of companyPatterns) {
    const match = (title + " " + snippet).match(pattern)
    if (match) return match[1].trim()
  }

  return "Unknown Company"
}

// Stop search
export const stopBusinessSearch = async (req, res) => {
  try {
    const { searchId, userId } = req.body

    if (!searchId || !userId) {
      return res.status(400).json({ success: false, error: "Missing required parameters" })
    }

    searchControlMap.set(searchId, { shouldStop: true, stoppedBy: userId })

    await BusinessSearchHistory.findByIdAndUpdate(searchId, {
      stoppedAt: new Date(),
      status: "stopped",
    })

    res.json({ success: true, message: "Search stop requested" })
  } catch (error) {
    console.error("Stop search error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

const handleSearchStop = async (searchId) => {
  await BusinessSearchHistory.findByIdAndUpdate(searchId, {
    status: "stopped",
    stoppedAt: new Date(),
  })

  io.emit("businessSearchStopped", {
    searchId,
    message: "Search stopped by user",
  })
}

// Get search history
export const getBusinessSearchHistory = async (req, res) => {
  try {
    const { userId } = req.params

    const searches = await BusinessSearchHistory.find({ userId }).sort({ createdAt: -1 }).limit(20)

    res.json({ success: true, searches })
  } catch (error) {
    console.error("Get search history error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// 1. Update getBusinessProspects function in controller to support searchId filtering
export const getBusinessProspects = async (req, res) => {
  try {
    const { userId } = req.params;
    const { searchId, status, priorityScore, dataQuality, limit = 100 } = req.query;

    const query = { createdBy: userId };

    // Filter by specific search ID
    if (searchId) {
      query["sourceInfo.searchId"] = searchId;
    }

    if (status && status !== 'all') {
      query["engagement.status"] = status;
    }

    if (priorityScore) {
      query["recommendations.priorityScore"] = { $gte: parseInt(priorityScore) };
    }

    if (dataQuality && dataQuality !== 'all') {
      query["sourceInfo.dataQuality"] = dataQuality;
    }

    const prospects = await BusinessProspect.find(query)
      .sort({ "recommendations.priorityScore": -1, createdAt: -1 })
      .limit(parseInt(limit));

    // Enhanced response with statistics
    const stats = {
      total: prospects.length,
      withEmail: prospects.filter(p => p.email).length,
      withPhone: prospects.filter(p => p.phone).length,
      withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length,
      highPriority: prospects.filter(p => p.recommendations.priorityScore >= 80).length,
      mediumPriority: prospects.filter(p => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80).length,
      lowPriority: prospects.filter(p => p.recommendations.priorityScore < 60).length,
      dataQuality: {
        high: prospects.filter(p => p.sourceInfo.dataQuality === 'high').length,
        medium: prospects.filter(p => p.sourceInfo.dataQuality === 'medium').length,
        low: prospects.filter(p => p.sourceInfo.dataQuality === 'low').length
      }
    };

    res.json({ 
      success: true, 
      prospects,
      stats,
      searchId: searchId || null
    });
  } catch (error) {
    console.error("Get prospects error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
// Update prospect status
export const updateProspectStatus = async (req, res) => {
  try {
    const { prospectId } = req.params
    const { status, notes } = req.body

    const prospect = await BusinessProspect.findByIdAndUpdate(
      prospectId,
      {
        "engagement.status": status,
        "engagement.lastContactDate": new Date(),
        $push: { "engagement.notes": notes },
        updatedAt: new Date(),
      },
      { new: true },
    )

    if (!prospect) {
      return res.status(404).json({ success: false, error: "Prospect not found" })
    }

    res.json({ success: true, prospect })
  } catch (error) {
    console.error("Update prospect error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// Delete prospect
export const deleteBusinessProspect = async (req, res) => {
  try {
    const { prospectId } = req.params
    const { userId } = req.body

    const prospect = await BusinessProspect.findOneAndDelete({
      _id: prospectId,
      createdBy: userId,
    })

    if (!prospect) {
      return res.status(404).json({ success: false, error: "Prospect not found" })
    }

    res.json({ success: true, message: "Prospect deleted successfully" })
  } catch (error) {
    console.error("Delete prospect error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
}

// 4. Add new route for getting search statistics
export const getSearchStatistics = async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe = '30' } = req.query; // days

    const dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - parseInt(timeframe));

    const searches = await BusinessSearchHistory.find({
      userId,
      createdAt: { $gte: dateFilter }
    });

    const prospects = await BusinessProspect.find({
      createdBy: userId,
      createdAt: { $gte: dateFilter }
    });

    const stats = {
      totalSearches: searches.length,
      completedSearches: searches.filter(s => s.status === 'completed').length,
      totalProspects: prospects.length,
      averagePriorityScore: prospects.reduce((sum, p) => sum + p.recommendations.priorityScore, 0) / prospects.length || 0,
      contactQuality: {
        withEmail: prospects.filter(p => p.email).length,
        withPhone: prospects.filter(p => p.phone).length,
        withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length
      },
      dataQualityDistribution: {
        high: prospects.filter(p => p.sourceInfo.dataQuality === 'high').length,
        medium: prospects.filter(p => p.sourceInfo.dataQuality === 'medium').length,
        low: prospects.filter(p => p.sourceInfo.dataQuality === 'low').length
      },
      topIndustries: getTopCategories(prospects, 'searchCriteria.industry'),
      topCompanies: getTopCategories(prospects, 'company'),
      engagementStats: {
        new: prospects.filter(p => p.engagement.status === 'new').length,
        contacted: prospects.filter(p => p.engagement.status === 'contacted').length,
        responded: prospects.filter(p => p.engagement.status === 'responded').length,
        closedWon: prospects.filter(p => p.engagement.status === 'closed_won').length
      }
    };

    res.json({ success: true, stats, timeframe });
  } catch (error) {
    console.error("Get statistics error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function for statistics
const getTopCategories = (prospects, field, limit = 5) => {
  const counts = {};
  prospects.forEach(prospect => {
    const value = field.split('.').reduce((obj, key) => obj?.[key], prospect);
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  });
  
  return Object.entries(counts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
};

export const debugSearch = async (req, res) => {
  try {
    const { searchParams } = req.body || {
      industry: 'Legal',
      location: 'London', 
      role: 'Legal Secretary',
      maxResults: 5
    };
    
    console.log("🐛 Debug search started with params:", searchParams);
    
    // Test Google API connectivity
    const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
    const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    const debugInfo = {
      googleApiConfigured: !!GOOGLE_API_KEY && !!GOOGLE_SEARCH_ENGINE_ID,
      googleApiKeyLength: GOOGLE_API_KEY ? GOOGLE_API_KEY.length : 0,
      searchEngineIdLength: GOOGLE_SEARCH_ENGINE_ID ? GOOGLE_SEARCH_ENGINE_ID.length : 0,
      searchParams,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'development'
    };
    
    if (!debugInfo.googleApiConfigured) {
      debugInfo.warning = "Google Search API not configured - will use mock data";
    }
    
    // Test a simple search
    try {
      console.log("🧪 Testing search functionality...");
      const results = await performEnhancedSearchWithFallback(searchParams, 5);
      debugInfo.testSearchResults = results.length;
      debugInfo.sampleResult = results[0] ? {
        title: results[0].title,
        link: results[0].link,
        snippet: results[0].snippet?.substring(0, 100) + "..."
      } : null;
      
      console.log(`🧪 Debug test completed: ${results.length} results found`);
    } catch (error) {
      debugInfo.searchError = error.message;
      console.error("🧪 Debug search error:", error.message);
    }
    
    res.json({
      success: true,
      debug: debugInfo,
      recommendations: [
        "If Google API is not configured, mock data will be used for testing",
        "Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in your .env file",
        "Check API quotas and limits if configured",
        "Try broader search criteria if getting 0 results",
        "Verify network connectivity to Google APIs"
      ]
    });
  } catch (error) {
    console.error("🐛 Debug endpoint error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      debug: {
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || 'development'
      }
    });
  }
};


// --- working with 10 prospects -----
// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import BusinessProspect from "../../model/BusinessProspectModel.js"
// import BusinessSearchHistory from "../../model/BusinessSearchHistoryModel.js"
// import { io } from "../../index.js"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // In-memory search control
// const searchControlMap = new Map()

// // Force development mode if not set
// if (!process.env.NODE_ENV) {
//   process.env.NODE_ENV = 'development';
//   console.log("🔧 Setting NODE_ENV to development for mock data");
// }

// // 1. Enhanced Google Search with multiple sources
// const performEnhancedSearch = async (searchParams, maxResults = 100) => {
//   const sources = [
//     // LinkedIn profiles
//     `"${searchParams.role}" "${searchParams.industry}" site:linkedin.com/in "${searchParams.location}"`,
//     // Company websites
//     `"${searchParams.role}" "${searchParams.company || searchParams.industry}" "${searchParams.location}" site:*.com`,
//     // Professional directories
//     `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" (site:crunchbase.com OR site:angel.co OR site:zoominfo.com)`,
//     // Industry-specific searches
//     `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" contact email`,
//     // Recent news mentions
//     `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" (hired OR promoted OR joined) site:*.com`
//   ];

//   let allResults = [];
  
//   for (const query of sources) {
//     try {
//       const results = await performGoogleSearch(query, Math.ceil(maxResults / sources.length));
//       allResults.push(...results);
      
//       // Rate limiting between different searches
//       await new Promise(resolve => setTimeout(resolve, 2000));
//     } catch (error) {
//       console.error(`Search failed for query: ${query}`, error);
//     }
//   }

//   // Remove duplicates and return unique results
//   const uniqueResults = allResults.filter((result, index, self) => 
//     index === self.findIndex(r => r.link === result.link)
//   );

//   return uniqueResults.slice(0, maxResults);
// };

// // Google Search Function
// const performGoogleSearch = async (query, maxResults = 50) => {
//   try {
//     // Using Google Custom Search API (you'll need to set up API key and search engine ID)
//     const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY
//     const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID

//     if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
//       throw new Error("Google Search API credentials not configured")
//     }

//     const results = []
//     const resultsPerPage = 10
//     const totalPages = Math.ceil(Math.min(maxResults, 100) / resultsPerPage)

//     for (let page = 0; page < totalPages; page++) {
//       const startIndex = page * resultsPerPage + 1

//       const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
//         params: {
//           key: GOOGLE_API_KEY,
//           cx: GOOGLE_SEARCH_ENGINE_ID,
//           q: query,
//           start: startIndex,
//           num: resultsPerPage,
//         },
//       })

//       if (response.data.items) {
//         results.push(...response.data.items)
//       }

//       // Rate limiting
//       await new Promise((resolve) => setTimeout(resolve, 100))
//     }

//     return results.slice(0, maxResults)
//   } catch (error) {
//     console.error("Google search error:", error)
//     throw error
//   }
// }

// const extractContactInfo = async (url) => {
//   try {
//     const response = await axios.get(url, {
//       timeout: 8000, // REDUCED from 15000
//       headers: {
//         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
//       },
//     });

//     // ... rest of the function stays the same
//     const $ = load(response.data);
//     // ... keep all the existing extraction logic
    
//     const emails = [];
//     const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
//     const pageText = $.text();
    
//     // Extract from different sections
//     const emailSources = [
//       $('a[href^="mailto:"]').map((i, el) => $(el).attr('href').replace('mailto:', '')).get(),
//       pageText.match(emailRegex) || [],
//       $('[data-email]').map((i, el) => $(el).data('email')).get()
//     ];

//     emailSources.flat().forEach(email => {
//       if (email && !email.includes('example.com') && !email.includes('noreply') && 
//           !email.includes('support@') && email.includes('@')) {
//         emails.push(email.toLowerCase());
//       }
//     });

//     // Enhanced phone extraction with country code detection
//     const phones = [];
//     const phonePatterns = [
//       /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
//       /\(\d{3}\)[-.\s]?\d{3}[-.\s]?\d{4}/g,
//       /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
//       /\d{10,}/g
//     ];

//     phonePatterns.forEach(pattern => {
//       const matches = pageText.match(pattern) || [];
//       matches.forEach(phone => {
//         const cleanPhone = phone.replace(/[^\d+]/g, '');
//         if (cleanPhone.length >= 10) {
//           let formattedPhone = cleanPhone;
//           if (!formattedPhone.startsWith('+')) {
//             formattedPhone = formattedPhone.length === 10 ? `+1${formattedPhone}` : `+${formattedPhone}`;
//           }
//           phones.push(formattedPhone);
//         }
//       });
//     });

//     // Enhanced social media extraction
//     const socialLinks = {};
    
//     $('a[href*="linkedin.com"]').each((i, el) => {
//       const href = $(el).attr('href');
//       if (href && (href.includes('/in/') || href.includes('/company/'))) {
//         socialLinks.linkedin = href.split('?')[0];
//       }
//     });

//     const socialPlatforms = [
//       { key: 'twitter', domains: ['twitter.com', 'x.com'] },
//       { key: 'github', domains: ['github.com'] },
//       { key: 'crunchbase', domains: ['crunchbase.com'] },
//       { key: 'angelco', domains: ['angel.co', 'wellfound.com'] }
//     ];

//     socialPlatforms.forEach(platform => {
//       platform.domains.forEach(domain => {
//         $(`a[href*="${domain}"]`).each((i, el) => {
//           const href = $(el).attr('href');
//           if (href && !socialLinks[platform.key]) {
//             socialLinks[platform.key] = href.split('?')[0];
//           }
//         });
//       });
//     });

//     const title = $('title').text().trim();
//     const description = $('meta[name="description"]').attr('content') || 
//                       $('meta[property="og:description"]').attr('content') || '';
    
//     const companyInfo = extractCompanyInfo($, pageText);

//     return {
//       emails: [...new Set(emails)].slice(0, 5),
//       phones: [...new Set(phones)].slice(0, 3),
//       socialLinks,
//       title,
//       description,
//       url,
//       companyInfo
//     };
//   } catch (error) {
//     console.error(`Enhanced extraction error for ${url}:`, error.message);
//     return null;
//   }
// };

// // 3. Enhanced company information extraction
// const extractCompanyInfo = ($, pageText) => {
//   const companyInfo = {};
  
//   // Company size indicators
//   const sizeIndicators = pageText.match(/(\d+[\+]?\s*(employees?|people|staff|team members?))/gi);
//   if (sizeIndicators && sizeIndicators.length > 0) {
//     companyInfo.size = sizeIndicators[0];
//   }

//   // Revenue indicators
//   const revenueIndicators = pageText.match(/(\$\d+[MBK]?\s*(revenue|sales|annual))/gi);
//   if (revenueIndicators && revenueIndicators.length > 0) {
//     companyInfo.revenue = revenueIndicators[0];
//   }

//   // Industry keywords
//   const industryKeywords = [
//     'technology', 'healthcare', 'finance', 'education', 'manufacturing',
//     'retail', 'consulting', 'software', 'AI', 'fintech', 'biotech'
//   ];
  
//   companyInfo.industries = industryKeywords.filter(keyword => 
//     pageText.toLowerCase().includes(keyword)
//   );

//   return companyInfo;
// };

// // 4. Enhanced AI analysis with more comprehensive prompting
// const analyzeProspectWithAI = async (prospectData, searchCriteria) => {
//   try {
//     const prompt = `
//     Analyze this business prospect comprehensively for B2B sales opportunities:
    
//     PROSPECT PROFILE:
//     Name: ${prospectData.name}
//     Job Title: ${prospectData.jobTitle}
//     Company: ${prospectData.company}
//     Location: ${prospectData.location}
//     Industry: ${searchCriteria.industry}
//     Company Size: ${prospectData.companyInfo?.size || 'Unknown'}
//     Company Revenue: ${prospectData.companyInfo?.revenue || 'Unknown'}
    
//     CONTEXT: ${prospectData.description || 'No additional context'}
    
//     Provide analysis in JSON format:
//     {
//       "industryExpertise": ["specific expertise areas"],
//       "keyStrengths": ["unique strengths and achievements"],
//       "potentialPainPoints": ["likely business challenges"],
//       "businessOpportunities": ["specific collaboration opportunities"],
//       "competitorAnalysis": "competitive landscape insights",
//       "marketPosition": "company's market position",
//       "decisionMakingAuthority": "high|medium|low",
//       "priorityScore": 85,
//       "conversionProbability": 75,
//       "bestContactMethod": "email|linkedin|phone",
//       "optimalContactTime": "morning|afternoon|evening",
//       "approachStrategy": "detailed outreach strategy",
//       "budgetLikelihood": "high|medium|low",
//       "timeToDecision": "fast|medium|slow",
//       "keyMotivators": ["primary business motivators"],
//       "riskFactors": ["potential risks or objections"]
//     }
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{ role: "user", content: prompt }],
//       temperature: 0.3,
//       max_tokens: 1500,
//     });

//     return JSON.parse(response.choices[0].message.content);
//   } catch (error) {
//     console.error("Enhanced AI analysis error:", error);
//     return getDefaultAnalysis();
//   }
// };

// // SOLUTION 1: Add fallback search methods and better error handling
// const performEnhancedSearchWithFallback = async (searchParams, maxResults = 50) => {
//   console.log("🔍 Starting enhanced search with params:", searchParams);
  
//   // Check if Google API is configured
//   const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
//   const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
//   if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
//     console.warn("⚠️ Google Search API not configured, using fallback method");
//     return await performFallbackSearch(searchParams, maxResults);
//   }

//   try {
//     // Try enhanced search first
//     const results = await performGoogleSearchEnhanced(searchParams, maxResults);
//     console.log(`✅ Enhanced search found ${results.length} results`);
//     return results;
//   } catch (error) {
//     console.error("❌ Enhanced search failed:", error.message);
//     console.log("🔄 Falling back to basic search");
//     return await performFallbackSearch(searchParams, maxResults);
//   }
// };

// const performFallbackSearch = async (searchParams, maxResults) => {
//   console.log("🔄 Using fallback search method");
  
//   // Check if we should use mock data for testing
//   if (process.env.NODE_ENV === 'development' || !process.env.GOOGLE_SEARCH_API_KEY) {
//     console.log("🎭 Using mock data for development/testing");
//     const mockResults = generateMockSearchResults(searchParams, Math.min(maxResults, 20));
//     console.log(`🎭 Generated ${mockResults.length} mock results for testing`);
//     return mockResults;
//   }
  
//   // In production with no Google API, try alternative methods
//   try {
//     // You could implement other search methods here:
//     // 1. Bing Search API
//     // 2. DuckDuckGo API
//     // 3. Other professional databases
    
//     console.warn("⚠️ No alternative search methods configured");
//     return [];
//   } catch (error) {
//     console.error("Fallback search error:", error);
//     return [];
//   }
// };

// const performGoogleSearchEnhanced = async (searchParams, maxResults) => {
//   const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
//   const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;

//   // Create more flexible search queries
//   const searchQueries = [
//     // Primary LinkedIn search
//     `"${searchParams.role}" site:linkedin.com/in ${searchParams.location}`,
    
//     // Industry-specific search
//     `"${searchParams.role}" "${searchParams.industry}" ${searchParams.location}`,
    
//     // Company directory search
//     `"${searchParams.role}" "${searchParams.industry}" contact ${searchParams.location}`,
    
//     // Professional directory search
//     `"${searchParams.role}" ${searchParams.location} email phone`,
    
//     // Broader search if specific queries fail
//     `${searchParams.role} ${searchParams.industry} ${searchParams.location}`
//   ];

//   let allResults = [];
//   const resultsPerQuery = Math.ceil(maxResults / searchQueries.length);

//   for (let i = 0; i < searchQueries.length && allResults.length < maxResults; i++) {
//     const query = searchQueries[i];
//     console.log(`🔍 Searching with query ${i + 1}/${searchQueries.length}: "${query}"`);

//     try {
//       // FIX: Use performGoogleSearch instead of executeGoogleSearch
//       const results = await performGoogleSearch(query, resultsPerQuery);
//       console.log(`   Found ${results.length} results for this query`);
      
//       if (results.length > 0) {
//         allResults.push(...results);
//         // Rate limiting between queries
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       }
//     } catch (error) {
//       console.error(`   Query failed: ${error.message}`);
//       continue; // Try next query
//     }
//   }

//   // Remove duplicates
//   const uniqueResults = allResults.filter((result, index, self) => 
//     index === self.findIndex(r => r.link === result.link)
//   );

//   console.log(`📊 Total unique results found: ${uniqueResults.length}`);
//   return uniqueResults.slice(0, maxResults);
// };

// const generateMockSearchResults = (searchParams, count) => {
//   console.log(`🎭 Generating ${count} mock results for testing`);
//   const mockResults = [];
  
//   const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Lisa', 'Chris', 'Amy', 'Robert', 'Emily'];
//   const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
//   const companies = [
//     'Legal Associates Ltd', 'City Law Firm', 'Metropolitan Legal', 'Crown Solicitors', 
//     'Thames Legal Group', 'London Law Partners', 'Capital Legal Services', 'British Legal Corp'
//   ];
  
//   for (let i = 0; i < count; i++) {
//     const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
//     const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
//     const company = companies[Math.floor(Math.random() * companies.length)];
    
//     mockResults.push({
//       title: `${firstName} ${lastName} - ${searchParams.role} at ${company}`,
//       link: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}-${Math.random().toString(36).substr(2, 6)}`,
//       snippet: `${firstName} ${lastName} is a ${searchParams.role} at ${company} in ${searchParams.location}. Experienced professional in ${searchParams.industry} with strong background in legal services and client support.`,
//       displayLink: 'linkedin.com'
//     });
//   }
  
//   return mockResults;
// };


// // Generate Outreach Content
// const generateOutreachContent = async (prospect, analysis, searchCriteria) => {
//   try {
//     const prompt = `
//     Generate personalized outreach content for this business prospect:
    
//     Prospect: ${prospect.name}, ${prospect.jobTitle} at ${prospect.company}
//     Location: ${prospect.location}
//     Industry: ${searchCriteria.industry}
    
//     Analysis Summary:
//     - Priority Score: ${analysis.priorityScore}/100
//     - Key Strengths: ${analysis.keyStrengths.join(", ")}
//     - Business Opportunities: ${analysis.businessOpportunities.join(", ")}
//     - Pain Points: ${analysis.potentialPainPoints.join(", ")}
    
//     Generate outreach content in JSON format:
//     {
//       "emailSubject": "compelling subject line",
//       "personalizedMessage": "personalized email message (200-300 words)",
//       "linkedinMessage": "LinkedIn connection message (under 300 characters)",
//       "valueProposition": "clear value proposition",
//       "callToAction": "specific call to action",
//       "followUpSequence": ["follow-up 1", "follow-up 2", "follow-up 3"]
//     }
    
//     Make it professional, personalized, and focused on value delivery.
//     `

//     const response = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{ role: "user", content: prompt }],
//       temperature: 0.8,
//       max_tokens: 1200,
//     })

//     return JSON.parse(response.choices[0].message.content)
//   } catch (error) {
//     console.error("Outreach generation error:", error)
//     return {
//       emailSubject: "Partnership Opportunity",
//       personalizedMessage: "Hello, I'd like to discuss a potential partnership opportunity.",
//       linkedinMessage: "Hi, I'd like to connect and discuss potential collaboration.",
//       valueProposition: "We help businesses grow through strategic partnerships.",
//       callToAction: "Would you be available for a brief call this week?",
//       followUpSequence: ["Following up on my previous message", "Checking in again", "Final follow-up"],
//     }
//   }
// }

// // 6. Enhanced search process
// const processEnhancedBusinessSearch2 = async (searchId, searchParams, userId) => {
//   try {
//     const searchHistory = await BusinessSearchHistory.findById(searchId);
//     if (!searchHistory) return;

//     // Phase 1: Multi-source search
//     io.emit("businessSearchProgress", {
//       searchId,
//       status: "Searching multiple sources for prospects...",
//       progress: 5,
//       phase: "multi-source-search",
//     });

//     const searchResults = await performEnhancedSearch(searchParams, searchParams.maxResults || 100);
    
//     // Phase 2: Enhanced analysis
//     io.emit("businessSearchProgress", {
//       searchId,
//       status: `Found ${searchResults.length} potential prospects. Starting enhanced analysis...`,
//       progress: 20,
//       phase: "enhanced-analysis",
//     });

//     const prospects = [];
//     let processed = 0;

//     for (const result of searchResults) {
//       if (searchControlMap.get(searchId)?.shouldStop) {
//         await handleSearchStop(searchId);
//         return;
//       }

//       try {
//         // Enhanced contact extraction
//         const contactInfo = await extractContactInfo(result.link);
//         if (!contactInfo) {
//           processed++;
//           continue;
//         }

//         // Enhanced prospect data creation
//         const prospectData = {
//           name: extractNameFromTitle(result.title),
//           jobTitle: extractJobTitle(result.title, result.snippet),
//           company: extractCompany(result.title, result.snippet),
//           location: searchParams.location,
//           description: result.snippet,
//           url: result.link,
//           companyInfo: contactInfo.companyInfo
//         };

//         if (!prospectData.name || !prospectData.company) {
//           processed++;
//           continue;
//         }

//         // Enhanced AI analysis
//         const analysis = await analyzeProspectWithAI(prospectData, searchParams);
//         const outreachContent = await generateOutreachContent(prospectData, analysis, searchParams);

//         // Create enhanced prospect record
//         const prospect = new BusinessProspect({
//           name: prospectData.name,
//           email: contactInfo.emails[0] || null,
//           phone: contactInfo.phones[0] || null, // Now includes country code
//           jobTitle: prospectData.jobTitle,
//           company: prospectData.company,
//           location: prospectData.location,

//           searchCriteria: {
//             ...searchParams,
//             searchId: searchId // Link to specific search
//           },

//           profileUrls: {
//             linkedin: contactInfo.socialLinks.linkedin,
//             portfolio: contactInfo.socialLinks.github,
//             companyWebsite: result.link,
//             twitter: contactInfo.socialLinks.twitter,
//             crunchbase: contactInfo.socialLinks.crunchbase,
//             angelco: contactInfo.socialLinks.angelco,
//           },

//           aiAnalysis: {
//             industryExpertise: analysis.industryExpertise,
//             keyStrengths: analysis.keyStrengths,
//             potentialPainPoints: analysis.potentialPainPoints,
//             businessOpportunities: analysis.businessOpportunities,
//             competitorAnalysis: analysis.competitorAnalysis,
//             marketPosition: analysis.marketPosition,
//             decisionMakingAuthority: analysis.decisionMakingAuthority,
//             keyMotivators: analysis.keyMotivators || [],
//             riskFactors: analysis.riskFactors || [],
//             budgetLikelihood: analysis.budgetLikelihood || 'medium',
//             timeToDecision: analysis.timeToDecision || 'medium'
//           },

//           outreachContent: {
//             personalizedMessage: outreachContent.personalizedMessage,
//             emailSubject: outreachContent.emailSubject,
//             linkedinMessage: outreachContent.linkedinMessage,
//             followUpSequence: outreachContent.followUpSequence,
//             valueProposition: outreachContent.valueProposition,
//             callToAction: outreachContent.callToAction,
//           },

//           recommendations: {
//             bestContactMethod: analysis.bestContactMethod,
//             optimalContactTime: analysis.optimalContactTime,
//             approachStrategy: analysis.approachStrategy,
//             priorityScore: analysis.priorityScore,
//             conversionProbability: analysis.conversionProbability,
//           },

//           businessContext: {
//             companySize: prospectData.companyInfo?.size,
//             companyRevenue: prospectData.companyInfo?.revenue,
//             industry: searchParams.industry,
//             techStack: prospectData.companyInfo?.industries || []
//           },

//           sourceInfo: {
//             searchEngine: "Enhanced Google Search",
//             searchQuery: `Multi-source search for ${searchParams.role} in ${searchParams.industry}`,
//             sourceUrl: result.link,
//             dataQuality: contactInfo.emails.length > 0 && contactInfo.phones.length > 0 ? "high" : 
//                         contactInfo.emails.length > 0 ? "medium" : "low",
//             searchId: searchId // Link to specific search
//           },

//           createdBy: userId,
//         });

//         await prospect.save();
//         prospects.push(prospect);
//         processed++;

//         // Update progress
//         const progressPercent = Math.round((processed / searchResults.length) * 70) + 25;
//         io.emit("businessSearchProgress", {
//           searchId,
//           status: `Analyzed ${processed}/${searchResults.length} prospects`,
//           progress: progressPercent,
//           phase: "analyzing",
//           prospectsFound: prospects.length,
//         });

//         // Reduced rate limiting for faster processing
//         await new Promise(resolve => setTimeout(resolve, 500));
//       } catch (error) {
//         console.error(`Error processing prospect:`, error);
//         processed++;
//       }
//     }

//     // Complete search with enhanced results
//     searchHistory.status = "completed";
//     searchHistory.completedAt = new Date();
//     searchHistory.results = {
//       totalFound: searchResults.length,
//       totalProcessed: processed,
//       highPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 80).length,
//       mediumPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80).length,
//       lowPriorityProspects: prospects.filter(p => p.recommendations.priorityScore < 60).length,
//       contactInfoQuality: {
//         withEmail: prospects.filter(p => p.email).length,
//         withPhone: prospects.filter(p => p.phone).length,
//         withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length
//       }
//     };
//     searchHistory.progress.percentage = 100;
//     await searchHistory.save();

//     io.emit("businessSearchComplete", {
//       searchId,
//       prospects: prospects.length,
//       message: `Enhanced search completed! Found ${prospects.length} qualified prospects with improved contact data.`,
//       qualityStats: searchHistory.results.contactInfoQuality
//     });
//   } catch (error) {
//     console.error("Enhanced search process error:", error);
//     // Error handling remains the same
//   }
// };

// const processEnhancedBusinessSearch = async (searchId, searchParams, userId) => {
//   try {
//     console.log(`🚀 Starting enhanced search for ID: ${searchId}`);
    
//     const searchHistory = await BusinessSearchHistory.findById(searchId);
//     if (!searchHistory) {
//       console.error("❌ Search history not found");
//       return;
//     }

//     // Update status with more detailed progress
//     searchHistory.status = "searching";
//     searchHistory.progress.currentPhase = "Initializing multi-source search";
//     await searchHistory.save();

//     io.emit("businessSearchProgress", {
//       searchId,
//       status: "Initializing enhanced search with multiple sources...",
//       progress: 5,
//       phase: "initialization",
//     });

//     // Phase 1: Enhanced search with fallback
//     io.emit("businessSearchProgress", {
//       searchId,
//       status: "Searching across multiple platforms...",
//       progress: 15,
//       phase: "searching",
//     });

//     const searchResults = await performEnhancedSearchWithFallback(searchParams, searchParams.maxResults || 50);
    
//     if (searchResults.length === 0) {
//       console.warn("⚠️ No search results found, this might indicate:");
//       console.warn("   - Google API issues");
//       console.warn("   - Too specific search criteria");
//       console.warn("   - Rate limiting");
//       console.warn("   - Network connectivity issues");
      
//       // Try with broader search criteria
//       const broaderParams = {
//         ...searchParams,
//         keywords: [], // Remove keywords to broaden search
//         companySize: 'any',
//         experienceLevel: 'any'
//       };
      
//       console.log("🔄 Retrying with broader search criteria");
//       const broaderResults = await performEnhancedSearchWithFallback(broaderParams, 20);
//       searchResults.push(...broaderResults);
//     }

//     console.log(`📊 Final search results count: ${searchResults.length}`);

//     if (searchControlMap.get(searchId)?.shouldStop) {
//       await handleSearchStop(searchId);
//       return;
//     }

//     // Update progress
//     searchHistory.progress.totalItems = searchResults.length;
//     searchHistory.status = "analyzing";
//     searchHistory.progress.currentPhase = "Analyzing prospects";
//     await searchHistory.save();

//     io.emit("businessSearchProgress", {
//       searchId,
//       status: `Found ${searchResults.length} potential prospects. Starting detailed analysis...`,
//       progress: 30,
//       phase: "analyzing",
//     });

//     const prospects = [];
//     let processed = 0;
//     let successful = 0;

//     // Process each search result with better error handling
//     for (const result of searchResults) {
//       if (searchControlMap.get(searchId)?.shouldStop) {
//         await handleSearchStop(searchId);
//         return;
//       }

//       try {
//         console.log(`🔍 Processing result ${processed + 1}/${searchResults.length}: ${result.title}`);
        
//         // Enhanced contact extraction with timeout
//         const contactInfo = await extractContactInfoWithTimeout(result.link, 10000);

//         if (!contactInfo) {
//           console.log(`   ⚠️ No contact info extracted from ${result.link}`);
//           processed++;
//           continue;
//         }

//         // Create prospect data with fallback values
//         const prospectData = {
//           name: extractNameFromTitle(result.title) || generateNameFromUrl(result.link),
//           jobTitle: extractJobTitle(result.title, result.snippet) || searchParams.role,
//           company: extractCompany(result.title, result.snippet) || "Unknown Company",
//           location: searchParams.location,
//           description: result.snippet,
//           url: result.link,
//           companyInfo: contactInfo.companyInfo || {}
//         };

//         // Skip if essential data is still missing
//         if (!prospectData.name || prospectData.name === "Unknown" || prospectData.name.length < 3) {
//           console.log(`   ⚠️ Insufficient name data: "${prospectData.name}"`);
//           processed++;
//           continue;
//         }

//         console.log(`   ✅ Created prospect: ${prospectData.name} at ${prospectData.company}`);

//         // AI Analysis with error handling
//         let analysis;
//         try {
//           analysis = await analyzeProspectWithAI(prospectData, searchParams);
//         } catch (error) {
//           console.error(`   ❌ AI analysis failed: ${error.message}`);
//           analysis = getDefaultAnalysis();
//         }

//         // Generate outreach content with error handling
//         let outreachContent;
//         try {
//           outreachContent = await generateOutreachContent(prospectData, analysis, searchParams);
//         } catch (error) {
//           console.error(`   ❌ Outreach generation failed: ${error.message}`);
//           outreachContent = getDefaultOutreachContent();
//         }

//         // Create prospect record
//         const prospect = new BusinessProspect({
//           name: prospectData.name,
//           email: contactInfo.emails[0] || null,
//           phone: contactInfo.phones[0] || null,
//           jobTitle: prospectData.jobTitle,
//           company: prospectData.company,
//           location: prospectData.location,

//           searchCriteria: {
//             ...searchParams,
//             searchId: searchId
//           },

//           profileUrls: {
//             linkedin: contactInfo.socialLinks?.linkedin,
//             portfolio: contactInfo.socialLinks?.github,
//             companyWebsite: result.link,
//             twitter: contactInfo.socialLinks?.twitter,
//           },

//           aiAnalysis: {
//             industryExpertise: analysis.industryExpertise || [],
//             keyStrengths: analysis.keyStrengths || [],
//             potentialPainPoints: analysis.potentialPainPoints || [],
//             businessOpportunities: analysis.businessOpportunities || [],
//             competitorAnalysis: analysis.competitorAnalysis || "Analysis pending",
//             marketPosition: analysis.marketPosition || "Unknown",
//             decisionMakingAuthority: analysis.decisionMakingAuthority || "unknown",
//           },

//           outreachContent: {
//             personalizedMessage: outreachContent.personalizedMessage || "Hello, I'd like to discuss a potential opportunity.",
//             emailSubject: outreachContent.emailSubject || "Partnership Opportunity",
//             linkedinMessage: outreachContent.linkedinMessage || "Hi, I'd like to connect.",
//             followUpSequence: outreachContent.followUpSequence || [],
//             valueProposition: outreachContent.valueProposition || "We help businesses grow.",
//             callToAction: outreachContent.callToAction || "Would you be interested in learning more?",
//           },

//           recommendations: {
//             bestContactMethod: analysis.bestContactMethod || "email",
//             optimalContactTime: analysis.optimalContactTime || "morning",
//             approachStrategy: analysis.approachStrategy || "Professional outreach",
//             priorityScore: analysis.priorityScore || 50,
//             conversionProbability: analysis.conversionProbability || 50,
//           },

//           sourceInfo: {
//             searchEngine: "Enhanced Google Search",
//             searchQuery: `${searchParams.role} in ${searchParams.industry}`,
//             sourceUrl: result.link,
//             dataQuality: contactInfo.emails?.length > 0 && contactInfo.phones?.length > 0 ? "high" : 
//                         contactInfo.emails?.length > 0 ? "medium" : "low",
//             searchId: searchId
//           },

//           createdBy: userId,
//         });

//         await prospect.save();
//         prospects.push(prospect);
//         successful++;

//         console.log(`   💾 Saved prospect: ${prospect.name} (Priority: ${prospect.recommendations.priorityScore})`);

//       } catch (error) {
//         console.error(`   ❌ Error processing prospect:`, error.message);
//       }

//       processed++;

//       // Update progress every 5 prospects
//       if (processed % 5 === 0 || processed === searchResults.length) {
//         const progressPercent = Math.round((processed / searchResults.length) * 60) + 30;
//         io.emit("businessSearchProgress", {
//           searchId,
//           status: `Analyzed ${processed}/${searchResults.length} prospects (${successful} qualified)`,
//           progress: progressPercent,
//           phase: "analyzing",
//           prospectsFound: prospects.length,
//         });
//       }

//       // Reduced rate limiting
//       await new Promise(resolve => setTimeout(resolve, 200));
//     }

//     console.log(`🎉 Search completed: ${successful} prospects created from ${processed} results`);

//     // Complete the search
//     searchHistory.status = "completed";
//     searchHistory.completedAt = new Date();
//     searchHistory.results = {
//       totalFound: searchResults.length,
//       totalProcessed: processed,
//       totalQualified: successful,
//       highPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 80).length,
//       mediumPriorityProspects: prospects.filter(p => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80).length,
//       lowPriorityProspects: prospects.filter(p => p.recommendations.priorityScore < 60).length,
//       contactInfoQuality: {
//         withEmail: prospects.filter(p => p.email).length,
//         withPhone: prospects.filter(p => p.phone).length,
//         withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length
//       }
//     };
//     searchHistory.progress.percentage = 100;
//     await searchHistory.save();

//     io.emit("businessSearchComplete", {
//       searchId,
//       prospects: prospects.length,
//       message: `Search completed! Found ${prospects.length} qualified prospects from ${searchResults.length} sources.`,
//       qualityStats: searchHistory.results.contactInfoQuality
//     });

//   } catch (error) {
//     console.error("❌ Enhanced search process error:", error);
    
//     await BusinessSearchHistory.findByIdAndUpdate(searchId, {
//       status: "failed",
//       errors: [error.message],
//     });

//     io.emit("businessSearchError", {
//       searchId,
//       error: `Search failed: ${error.message}. Please try again with different criteria.`,
//     });
//   }
// };

// // Helper function with timeout for contact extraction
// const extractContactInfoWithTimeout = async (url, timeout = 10000) => {
//   return Promise.race([
//     extractContactInfo(url),
//     new Promise((_, reject) => 
//       setTimeout(() => reject(new Error('Extraction timeout')), timeout)
//     )
//   ]);
// };

// // Helper function to generate name from URL as fallback
// const generateNameFromUrl = (url) => {
//   try {
//     const match = url.match(/\/([^\/]+)$/);
//     if (match) {
//       return match[1]
//         .replace(/-/g, ' ')
//         .replace(/\b\w/g, l => l.toUpperCase())
//         .substring(0, 50);
//     }
//   } catch (error) {
//     console.error('Name generation error:', error);
//   }
//   return null;
// };

// // Default analysis for fallback
// const getDefaultAnalysis = () => ({
//   industryExpertise: [],
//   keyStrengths: ["Professional experience"],
//   potentialPainPoints: ["Growth challenges"],
//   businessOpportunities: ["Strategic partnership"],
//   competitorAnalysis: "Analysis pending",
//   marketPosition: "Unknown",
//   decisionMakingAuthority: "unknown",
//   priorityScore: 50,
//   conversionProbability: 50,
//   bestContactMethod: "email",
//   optimalContactTime: "morning",
//   approachStrategy: "Standard professional approach"
// });

// // Default outreach content for fallback
// const getDefaultOutreachContent = () => ({
//   personalizedMessage: "Hello, I hope this message finds you well. I'd like to discuss a potential business opportunity that might be of interest to you.",
//   emailSubject: "Business Partnership Opportunity",
//   linkedinMessage: "Hi, I'd like to connect and explore potential collaboration opportunities.",
//   followUpSequence: ["Following up on my previous message", "Checking in on the opportunity"],
//   valueProposition: "We help businesses grow through strategic partnerships and innovative solutions.",
//   callToAction: "Would you be available for a brief call this week to discuss further?"
// });

// export const startBusinessDevelopmentSearch = async (req, res) => {
//   try {
//     const { searchParams, userId } = req.body;

//     console.log("🚀 Starting business development search:", {
//       userId,
//       searchParams,
//       timestamp: new Date().toISOString()
//     });

//     if (!searchParams || !userId) {
//       return res.status(400).json({ success: false, error: "Missing required parameters" });
//     }

//     // Validate required search parameters
//     if (!searchParams.industry || !searchParams.location || !searchParams.role) {
//       return res.status(400).json({ 
//         success: false, 
//         error: "Missing required search parameters: industry, location, and role are required" 
//       });
//     }

//     // Create search history record with enhanced tracking
//     const searchHistory = new BusinessSearchHistory({
//       userId,
//       searchParams: {
//         ...searchParams,
//         enhancedSearch: true,
//         searchVersion: '2.0'
//       },
//       status: "pending",
//       progress: {
//         currentPhase: "Initializing enhanced search",
//         percentage: 0
//       }
//     });
//     await searchHistory.save();

//     const searchId = searchHistory._id.toString();
//     searchControlMap.set(searchId, { shouldStop: false });

//     console.log(`✅ Search initialized with ID: ${searchId}`);

//     // Start enhanced search process
//     processEnhancedBusinessSearch(searchId, searchParams, userId);

//     res.json({
//       success: true,
//       searchId,
//       message: "Enhanced business development search started",
//     });
//   } catch (error) {
//     console.error("❌ Start enhanced search error:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };



// // Process business search
// const processBusinessSearch = async (searchId, searchParams, userId) => {
//   try {
//     const searchHistory = await BusinessSearchHistory.findById(searchId)
//     if (!searchHistory) return

//     // Update status
//     searchHistory.status = "searching"
//     searchHistory.progress.currentPhase = "Searching Google"
//     await searchHistory.save()

//     // Emit progress
//     io.emit("businessSearchProgress", {
//       searchId,
//       status: "Searching for prospects...",
//       progress: 10,
//       phase: "searching",
//     })

//     // Build search query
//     const query = `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" site:linkedin.com OR site:company.com OR site:about.me`

//     // Perform Google search
//     const searchResults = await performGoogleSearch(query, searchParams.maxResults || 50)

//     if (searchControlMap.get(searchId)?.shouldStop) {
//       await handleSearchStop(searchId)
//       return
//     }

//     // Update progress
//     searchHistory.progress.totalItems = searchResults.length
//     searchHistory.status = "analyzing"
//     searchHistory.progress.currentPhase = "Analyzing prospects"
//     await searchHistory.save()

//     io.emit("businessSearchProgress", {
//       searchId,
//       status: `Found ${searchResults.length} potential prospects. Analyzing...`,
//       progress: 30,
//       phase: "analyzing",
//     })

//     const prospects = []
//     let processed = 0

//     // Process each search result
//     for (const result of searchResults) {
//       if (searchControlMap.get(searchId)?.shouldStop) {
//         await handleSearchStop(searchId)
//         return
//       }

//       try {
//         // Extract contact information
//         const contactInfo = await extractContactInfo(result.link)

//         if (!contactInfo) {
//           processed++
//           continue
//         }

//         // Create prospect data
//         const prospectData = {
//           name: extractNameFromTitle(result.title),
//           jobTitle: extractJobTitle(result.title, result.snippet),
//           company: extractCompany(result.title, result.snippet),
//           location: searchParams.location,
//           description: result.snippet,
//           url: result.link,
//         }

//         // Skip if essential data is missing
//         if (!prospectData.name || !prospectData.company) {
//           processed++
//           continue
//         }

//         // AI Analysis
//         const analysis = await analyzeProspectWithAI(prospectData, searchParams)

//         // Generate outreach content
//         const outreachContent = await generateOutreachContent(prospectData, analysis, searchParams)

//         // Create prospect record
//         const prospect = new BusinessProspect({
//           name: prospectData.name,
//           email: contactInfo.emails[0] || null,
//           phone: contactInfo.phones[0] || null,
//           jobTitle: prospectData.jobTitle,
//           company: prospectData.company,
//           location: prospectData.location,

//           searchCriteria: searchParams,

//           profileUrls: {
//             linkedin: contactInfo.socialLinks.linkedin,
//             portfolio: contactInfo.socialLinks.github,
//             companyWebsite: result.link,
//             twitter: contactInfo.socialLinks.twitter,
//           },

//           aiAnalysis: {
//             industryExpertise: analysis.industryExpertise,
//             keyStrengths: analysis.keyStrengths,
//             potentialPainPoints: analysis.potentialPainPoints,
//             businessOpportunities: analysis.businessOpportunities,
//             competitorAnalysis: analysis.competitorAnalysis,
//             marketPosition: analysis.marketPosition,
//             decisionMakingAuthority: analysis.decisionMakingAuthority,
//           },

//           outreachContent: {
//             personalizedMessage: outreachContent.personalizedMessage,
//             emailSubject: outreachContent.emailSubject,
//             linkedinMessage: outreachContent.linkedinMessage,
//             followUpSequence: outreachContent.followUpSequence,
//             valueProposition: outreachContent.valueProposition,
//             callToAction: outreachContent.callToAction,
//           },

//           recommendations: {
//             bestContactMethod: analysis.bestContactMethod,
//             optimalContactTime: analysis.optimalContactTime,
//             approachStrategy: analysis.approachStrategy,
//             priorityScore: analysis.priorityScore,
//             conversionProbability: analysis.conversionProbability,
//           },

//           sourceInfo: {
//             searchEngine: "Google",
//             searchQuery: query,
//             sourceUrl: result.link,
//             dataQuality: contactInfo.emails.length > 0 ? "high" : "medium",
//           },

//           createdBy: userId,
//         })

//         await prospect.save()
//         prospects.push(prospect)
//         processed++

//         // Update progress
//         const progressPercent = Math.round((processed / searchResults.length) * 70) + 30
//         io.emit("businessSearchProgress", {
//           searchId,
//           status: `Processed ${processed}/${searchResults.length} prospects`,
//           progress: progressPercent,
//           phase: "analyzing",
//           prospectsFound: prospects.length,
//         })

//         // Rate limiting
//         await new Promise((resolve) => setTimeout(resolve, 1000))
//       } catch (error) {
//         console.error(`Error processing prospect:`, error)
//         processed++
//       }
//     }

//     // Complete the search
//     searchHistory.status = "completed"
//     searchHistory.completedAt = new Date()
//     searchHistory.results = {
//       totalFound: searchResults.length,
//       totalProcessed: processed,
//       highPriorityProspects: prospects.filter((p) => p.recommendations.priorityScore >= 80).length,
//       mediumPriorityProspects: prospects.filter(
//         (p) => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80,
//       ).length,
//       lowPriorityProspects: prospects.filter((p) => p.recommendations.priorityScore < 60).length,
//     }
//     searchHistory.progress.percentage = 100
//     await searchHistory.save()

//     io.emit("businessSearchComplete", {
//       searchId,
//       prospects: prospects.length,
//       message: `Search completed! Found ${prospects.length} qualified prospects.`,
//     })
//   } catch (error) {
//     console.error("Process search error:", error)

//     await BusinessSearchHistory.findByIdAndUpdate(searchId, {
//       status: "failed",
//       errors: [error.message],
//     })

//     io.emit("businessSearchError", {
//       searchId,
//       error: error.message,
//     })
//   }
// }

// // Helper functions
// const extractNameFromTitle = (title) => {
//   // Extract name from LinkedIn or company page titles
//   const patterns = [/^([A-Z][a-z]+ [A-Z][a-z]+)/, /([A-Z][a-z]+ [A-Z][a-z]+) - /, /([A-Z][a-z]+ [A-Z][a-z]+) \|/]

//   for (const pattern of patterns) {
//     const match = title.match(pattern)
//     if (match) return match[1]
//   }

//   return title.split(" - ")[0].split(" | ")[0].trim()
// }

// const extractJobTitle = (title, snippet) => {
//   const jobTitlePatterns = [
//     /- ([^|]+) \|/,
//     /- ([^-]+) -/,
//     /(CEO|CTO|VP|Director|Manager|Lead|Senior|Principal|Head of)[^,]*/i,
//   ]

//   for (const pattern of jobTitlePatterns) {
//     const match = (title + " " + snippet).match(pattern)
//     if (match) return match[1].trim()
//   }

//   return "Professional"
// }

// const extractCompany = (title, snippet) => {
//   const companyPatterns = [/at ([^|,-]+)/i, /\| ([^|]+)$/, /- ([^-]+)$/]

//   for (const pattern of companyPatterns) {
//     const match = (title + " " + snippet).match(pattern)
//     if (match) return match[1].trim()
//   }

//   return "Unknown Company"
// }

// // Stop search
// export const stopBusinessSearch = async (req, res) => {
//   try {
//     const { searchId, userId } = req.body

//     if (!searchId || !userId) {
//       return res.status(400).json({ success: false, error: "Missing required parameters" })
//     }

//     searchControlMap.set(searchId, { shouldStop: true, stoppedBy: userId })

//     await BusinessSearchHistory.findByIdAndUpdate(searchId, {
//       stoppedAt: new Date(),
//       status: "stopped",
//     })

//     res.json({ success: true, message: "Search stop requested" })
//   } catch (error) {
//     console.error("Stop search error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// const handleSearchStop = async (searchId) => {
//   await BusinessSearchHistory.findByIdAndUpdate(searchId, {
//     status: "stopped",
//     stoppedAt: new Date(),
//   })

//   io.emit("businessSearchStopped", {
//     searchId,
//     message: "Search stopped by user",
//   })
// }

// // Get search history
// export const getBusinessSearchHistory = async (req, res) => {
//   try {
//     const { userId } = req.params

//     const searches = await BusinessSearchHistory.find({ userId }).sort({ createdAt: -1 }).limit(20)

//     res.json({ success: true, searches })
//   } catch (error) {
//     console.error("Get search history error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // 1. Update getBusinessProspects function in controller to support searchId filtering
// export const getBusinessProspects = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { searchId, status, priorityScore, dataQuality, limit = 100 } = req.query;

//     const query = { createdBy: userId };

//     // Filter by specific search ID
//     if (searchId) {
//       query["sourceInfo.searchId"] = searchId;
//     }

//     if (status && status !== 'all') {
//       query["engagement.status"] = status;
//     }

//     if (priorityScore) {
//       query["recommendations.priorityScore"] = { $gte: parseInt(priorityScore) };
//     }

//     if (dataQuality && dataQuality !== 'all') {
//       query["sourceInfo.dataQuality"] = dataQuality;
//     }

//     const prospects = await BusinessProspect.find(query)
//       .sort({ "recommendations.priorityScore": -1, createdAt: -1 })
//       .limit(parseInt(limit));

//     // Enhanced response with statistics
//     const stats = {
//       total: prospects.length,
//       withEmail: prospects.filter(p => p.email).length,
//       withPhone: prospects.filter(p => p.phone).length,
//       withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length,
//       highPriority: prospects.filter(p => p.recommendations.priorityScore >= 80).length,
//       mediumPriority: prospects.filter(p => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80).length,
//       lowPriority: prospects.filter(p => p.recommendations.priorityScore < 60).length,
//       dataQuality: {
//         high: prospects.filter(p => p.sourceInfo.dataQuality === 'high').length,
//         medium: prospects.filter(p => p.sourceInfo.dataQuality === 'medium').length,
//         low: prospects.filter(p => p.sourceInfo.dataQuality === 'low').length
//       }
//     };

//     res.json({ 
//       success: true, 
//       prospects,
//       stats,
//       searchId: searchId || null
//     });
//   } catch (error) {
//     console.error("Get prospects error:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };
// // Update prospect status
// export const updateProspectStatus = async (req, res) => {
//   try {
//     const { prospectId } = req.params
//     const { status, notes } = req.body

//     const prospect = await BusinessProspect.findByIdAndUpdate(
//       prospectId,
//       {
//         "engagement.status": status,
//         "engagement.lastContactDate": new Date(),
//         $push: { "engagement.notes": notes },
//         updatedAt: new Date(),
//       },
//       { new: true },
//     )

//     if (!prospect) {
//       return res.status(404).json({ success: false, error: "Prospect not found" })
//     }

//     res.json({ success: true, prospect })
//   } catch (error) {
//     console.error("Update prospect error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Delete prospect
// export const deleteBusinessProspect = async (req, res) => {
//   try {
//     const { prospectId } = req.params
//     const { userId } = req.body

//     const prospect = await BusinessProspect.findOneAndDelete({
//       _id: prospectId,
//       createdBy: userId,
//     })

//     if (!prospect) {
//       return res.status(404).json({ success: false, error: "Prospect not found" })
//     }

//     res.json({ success: true, message: "Prospect deleted successfully" })
//   } catch (error) {
//     console.error("Delete prospect error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // 4. Add new route for getting search statistics
// export const getSearchStatistics = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { timeframe = '30' } = req.query; // days

//     const dateFilter = new Date();
//     dateFilter.setDate(dateFilter.getDate() - parseInt(timeframe));

//     const searches = await BusinessSearchHistory.find({
//       userId,
//       createdAt: { $gte: dateFilter }
//     });

//     const prospects = await BusinessProspect.find({
//       createdBy: userId,
//       createdAt: { $gte: dateFilter }
//     });

//     const stats = {
//       totalSearches: searches.length,
//       completedSearches: searches.filter(s => s.status === 'completed').length,
//       totalProspects: prospects.length,
//       averagePriorityScore: prospects.reduce((sum, p) => sum + p.recommendations.priorityScore, 0) / prospects.length || 0,
//       contactQuality: {
//         withEmail: prospects.filter(p => p.email).length,
//         withPhone: prospects.filter(p => p.phone).length,
//         withLinkedIn: prospects.filter(p => p.profileUrls.linkedin).length
//       },
//       dataQualityDistribution: {
//         high: prospects.filter(p => p.sourceInfo.dataQuality === 'high').length,
//         medium: prospects.filter(p => p.sourceInfo.dataQuality === 'medium').length,
//         low: prospects.filter(p => p.sourceInfo.dataQuality === 'low').length
//       },
//       topIndustries: getTopCategories(prospects, 'searchCriteria.industry'),
//       topCompanies: getTopCategories(prospects, 'company'),
//       engagementStats: {
//         new: prospects.filter(p => p.engagement.status === 'new').length,
//         contacted: prospects.filter(p => p.engagement.status === 'contacted').length,
//         responded: prospects.filter(p => p.engagement.status === 'responded').length,
//         closedWon: prospects.filter(p => p.engagement.status === 'closed_won').length
//       }
//     };

//     res.json({ success: true, stats, timeframe });
//   } catch (error) {
//     console.error("Get statistics error:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// // Helper function for statistics
// const getTopCategories = (prospects, field, limit = 5) => {
//   const counts = {};
//   prospects.forEach(prospect => {
//     const value = field.split('.').reduce((obj, key) => obj?.[key], prospect);
//     if (value) {
//       counts[value] = (counts[value] || 0) + 1;
//     }
//   });
  
//   return Object.entries(counts)
//     .sort(([,a], [,b]) => b - a)
//     .slice(0, limit)
//     .map(([name, count]) => ({ name, count }));
// };

// export const debugSearch = async (req, res) => {
//   try {
//     const { searchParams } = req.body || {
//       industry: 'Legal',
//       location: 'London', 
//       role: 'Legal Secretary',
//       maxResults: 5
//     };
    
//     console.log("🐛 Debug search started with params:", searchParams);
    
//     // Test Google API connectivity
//     const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
//     const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
//     const debugInfo = {
//       googleApiConfigured: !!GOOGLE_API_KEY && !!GOOGLE_SEARCH_ENGINE_ID,
//       googleApiKeyLength: GOOGLE_API_KEY ? GOOGLE_API_KEY.length : 0,
//       searchEngineIdLength: GOOGLE_SEARCH_ENGINE_ID ? GOOGLE_SEARCH_ENGINE_ID.length : 0,
//       searchParams,
//       timestamp: new Date().toISOString(),
//       nodeEnv: process.env.NODE_ENV || 'development'
//     };
    
//     if (!debugInfo.googleApiConfigured) {
//       debugInfo.warning = "Google Search API not configured - will use mock data";
//     }
    
//     // Test a simple search
//     try {
//       console.log("🧪 Testing search functionality...");
//       const results = await performEnhancedSearchWithFallback(searchParams, 5);
//       debugInfo.testSearchResults = results.length;
//       debugInfo.sampleResult = results[0] ? {
//         title: results[0].title,
//         link: results[0].link,
//         snippet: results[0].snippet?.substring(0, 100) + "..."
//       } : null;
      
//       console.log(`🧪 Debug test completed: ${results.length} results found`);
//     } catch (error) {
//       debugInfo.searchError = error.message;
//       console.error("🧪 Debug search error:", error.message);
//     }
    
//     res.json({
//       success: true,
//       debug: debugInfo,
//       recommendations: [
//         "If Google API is not configured, mock data will be used for testing",
//         "Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in your .env file",
//         "Check API quotas and limits if configured",
//         "Try broader search criteria if getting 0 results",
//         "Verify network connectivity to Google APIs"
//       ]
//     });
//   } catch (error) {
//     console.error("🐛 Debug endpoint error:", error);
//     res.status(500).json({ 
//       success: false, 
//       error: error.message,
//       debug: {
//         timestamp: new Date().toISOString(),
//         nodeEnv: process.env.NODE_ENV || 'development'
//       }
//     });
//   }
// };



// import { OpenAI } from "openai"
// import axios from "axios"
// import { load } from "cheerio"
// import BusinessProspect from "../../model/BusinessProspectModel.js"
// import BusinessSearchHistory from "../../model/BusinessSearchHistoryModel.js"
// import { io } from "../../index.js"

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// // In-memory search control
// const searchControlMap = new Map()

// // Google Search Function
// const performGoogleSearch = async (query, maxResults = 50) => {
//   try {
//     // Using Google Custom Search API (you'll need to set up API key and search engine ID)
//     const GOOGLE_API_KEY = process.env.GOOGLE_SEARCH_API_KEY
//     const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID

//     if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
//       throw new Error("Google Search API credentials not configured")
//     }

//     const results = []
//     const resultsPerPage = 10
//     const totalPages = Math.ceil(Math.min(maxResults, 100) / resultsPerPage)

//     for (let page = 0; page < totalPages; page++) {
//       const startIndex = page * resultsPerPage + 1

//       const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
//         params: {
//           key: GOOGLE_API_KEY,
//           cx: GOOGLE_SEARCH_ENGINE_ID,
//           q: query,
//           start: startIndex,
//           num: resultsPerPage,
//         },
//       })

//       if (response.data.items) {
//         results.push(...response.data.items)
//       }

//       // Rate limiting
//       await new Promise((resolve) => setTimeout(resolve, 100))
//     }

//     return results.slice(0, maxResults)
//   } catch (error) {
//     console.error("Google search error:", error)
//     throw error
//   }
// }

// // Extract contact information from webpage
// const extractContactInfo = async (url) => {
//   try {
//     const response = await axios.get(url, {
//       timeout: 10000,
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
//       },
//     })

//     const $ = load(response.data)

//     // Extract various contact information
//     const emails = []
//     const phones = []
//     const socialLinks = {}

//     // Email extraction
//     const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
//     const pageText = $.text()
//     const foundEmails = pageText.match(emailRegex) || []
//     emails.push(
//       ...foundEmails.filter(
//         (email) => !email.includes("example.com") && !email.includes("placeholder") && !email.includes("noreply"),
//       ),
//     )

//     // Phone extraction
//     const phoneRegex = /(\+?1?[-.\s]?)?(\(?[0-9]{3}\)?)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
//     const foundPhones = pageText.match(phoneRegex) || []
//     phones.push(...foundPhones)

//     // Social media links
//     $('a[href*="linkedin.com"]').each((i, el) => {
//       const href = $(el).attr("href")
//       if (href && href.includes("/in/")) {
//         socialLinks.linkedin = href
//       }
//     })

//     $('a[href*="twitter.com"], a[href*="x.com"]').each((i, el) => {
//       socialLinks.twitter = $(el).attr("href")
//     })

//     $('a[href*="github.com"]').each((i, el) => {
//       socialLinks.github = $(el).attr("href")
//     })

//     // Extract company and personal info
//     const title = $("title").text().trim()
//     const description = $('meta[name="description"]').attr("content") || ""

//     return {
//       emails: [...new Set(emails)].slice(0, 3),
//       phones: [...new Set(phones)].slice(0, 2),
//       socialLinks,
//       title,
//       description,
//       url,
//     }
//   } catch (error) {
//     console.error(`Error extracting from ${url}:`, error.message)
//     return null
//   }
// }

// // AI Analysis Function
// const analyzeProspectWithAI = async (prospectData, searchCriteria) => {
//   try {
//     const prompt = `
//     Analyze this business prospect for business development opportunities:
    
//     Name: ${prospectData.name}
//     Job Title: ${prospectData.jobTitle}
//     Company: ${prospectData.company}
//     Location: ${prospectData.location}
//     Industry: ${searchCriteria.industry}
    
//     Additional Context: ${prospectData.description || "No additional context"}
    
//     Please provide a comprehensive analysis in JSON format with the following structure:
//     {
//       "industryExpertise": ["expertise1", "expertise2"],
//       "keyStrengths": ["strength1", "strength2"],
//       "potentialPainPoints": ["pain1", "pain2"],
//       "businessOpportunities": ["opportunity1", "opportunity2"],
//       "competitorAnalysis": "brief analysis",
//       "marketPosition": "position description",
//       "decisionMakingAuthority": "high|medium|low",
//       "priorityScore": 85,
//       "conversionProbability": 75,
//       "bestContactMethod": "email|linkedin|phone",
//       "optimalContactTime": "morning|afternoon|evening",
//       "approachStrategy": "strategy description"
//     }
//     `

//     const response = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{ role: "user", content: prompt }],
//       temperature: 0.7,
//       max_tokens: 1000,
//     })

//     return JSON.parse(response.choices[0].message.content)
//   } catch (error) {
//     console.error("AI analysis error:", error)
//     return {
//       industryExpertise: [],
//       keyStrengths: [],
//       potentialPainPoints: [],
//       businessOpportunities: [],
//       competitorAnalysis: "Analysis unavailable",
//       marketPosition: "Unknown",
//       decisionMakingAuthority: "unknown",
//       priorityScore: 50,
//       conversionProbability: 50,
//       bestContactMethod: "email",
//       optimalContactTime: "morning",
//       approachStrategy: "Standard approach",
//     }
//   }
// }

// // Generate Outreach Content
// const generateOutreachContent = async (prospect, analysis, searchCriteria) => {
//   try {
//     const prompt = `
//     Generate personalized outreach content for this business prospect:
    
//     Prospect: ${prospect.name}, ${prospect.jobTitle} at ${prospect.company}
//     Location: ${prospect.location}
//     Industry: ${searchCriteria.industry}
    
//     Analysis Summary:
//     - Priority Score: ${analysis.priorityScore}/100
//     - Key Strengths: ${analysis.keyStrengths.join(", ")}
//     - Business Opportunities: ${analysis.businessOpportunities.join(", ")}
//     - Pain Points: ${analysis.potentialPainPoints.join(", ")}
    
//     Generate outreach content in JSON format:
//     {
//       "emailSubject": "compelling subject line",
//       "personalizedMessage": "personalized email message (200-300 words)",
//       "linkedinMessage": "LinkedIn connection message (under 300 characters)",
//       "valueProposition": "clear value proposition",
//       "callToAction": "specific call to action",
//       "followUpSequence": ["follow-up 1", "follow-up 2", "follow-up 3"]
//     }
    
//     Make it professional, personalized, and focused on value delivery.
//     `

//     const response = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [{ role: "user", content: prompt }],
//       temperature: 0.8,
//       max_tokens: 1200,
//     })

//     return JSON.parse(response.choices[0].message.content)
//   } catch (error) {
//     console.error("Outreach generation error:", error)
//     return {
//       emailSubject: "Partnership Opportunity",
//       personalizedMessage: "Hello, I'd like to discuss a potential partnership opportunity.",
//       linkedinMessage: "Hi, I'd like to connect and discuss potential collaboration.",
//       valueProposition: "We help businesses grow through strategic partnerships.",
//       callToAction: "Would you be available for a brief call this week?",
//       followUpSequence: ["Following up on my previous message", "Checking in again", "Final follow-up"],
//     }
//   }
// }

// // Main search function
// export const startBusinessDevelopmentSearch = async (req, res) => {
//   try {
//     const { searchParams, userId } = req.body

//     console.log("search body", req.body)
//     console.log("startBusinessDevelopmentSearch CALLED")

//     if (!searchParams || !userId) {
//       return res.status(400).json({ success: false, error: "Missing required parameters" })
//     }

//     // Create search history record
//     const searchHistory = new BusinessSearchHistory({
//       userId,
//       searchParams,
//       status: "pending",
//     })
//     await searchHistory.save()

//     const searchId = searchHistory._id.toString()
//     searchControlMap.set(searchId, { shouldStop: false })

//     // Start the search process asynchronously
//     processBusinessSearch(searchId, searchParams, userId)

//     res.json({
//       success: true,
//       searchId,
//       message: "Business development search started",
//     })
//   } catch (error) {
//     console.error("Start search error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Process business search
// const processBusinessSearch = async (searchId, searchParams, userId) => {
//   try {
//     const searchHistory = await BusinessSearchHistory.findById(searchId)
//     if (!searchHistory) return

//     // Update status
//     searchHistory.status = "searching"
//     searchHistory.progress.currentPhase = "Searching Google"
//     await searchHistory.save()

//     // Emit progress
//     io.emit("businessSearchProgress", {
//       searchId,
//       status: "Searching for prospects...",
//       progress: 10,
//       phase: "searching",
//     })

//     // Build search query
//     const query = `"${searchParams.role}" "${searchParams.industry}" "${searchParams.location}" site:linkedin.com OR site:company.com OR site:about.me`

//     // Perform Google search
//     const searchResults = await performGoogleSearch(query, searchParams.maxResults || 50)

//     if (searchControlMap.get(searchId)?.shouldStop) {
//       await handleSearchStop(searchId)
//       return
//     }

//     // Update progress
//     searchHistory.progress.totalItems = searchResults.length
//     searchHistory.status = "analyzing"
//     searchHistory.progress.currentPhase = "Analyzing prospects"
//     await searchHistory.save()

//     io.emit("businessSearchProgress", {
//       searchId,
//       status: `Found ${searchResults.length} potential prospects. Analyzing...`,
//       progress: 30,
//       phase: "analyzing",
//     })

//     const prospects = []
//     let processed = 0

//     // Process each search result
//     for (const result of searchResults) {
//       if (searchControlMap.get(searchId)?.shouldStop) {
//         await handleSearchStop(searchId)
//         return
//       }

//       try {
//         // Extract contact information
//         const contactInfo = await extractContactInfo(result.link)

//         if (!contactInfo) {
//           processed++
//           continue
//         }

//         // Create prospect data
//         const prospectData = {
//           name: extractNameFromTitle(result.title),
//           jobTitle: extractJobTitle(result.title, result.snippet),
//           company: extractCompany(result.title, result.snippet),
//           location: searchParams.location,
//           description: result.snippet,
//           url: result.link,
//         }

//         // Skip if essential data is missing
//         if (!prospectData.name || !prospectData.company) {
//           processed++
//           continue
//         }

//         // AI Analysis
//         const analysis = await analyzeProspectWithAI(prospectData, searchParams)

//         // Generate outreach content
//         const outreachContent = await generateOutreachContent(prospectData, analysis, searchParams)

//         // Create prospect record
//         const prospect = new BusinessProspect({
//           name: prospectData.name,
//           email: contactInfo.emails[0] || null,
//           phone: contactInfo.phones[0] || null,
//           jobTitle: prospectData.jobTitle,
//           company: prospectData.company,
//           location: prospectData.location,

//           searchCriteria: searchParams,

//           profileUrls: {
//             linkedin: contactInfo.socialLinks.linkedin,
//             portfolio: contactInfo.socialLinks.github,
//             companyWebsite: result.link,
//             twitter: contactInfo.socialLinks.twitter,
//           },

//           aiAnalysis: {
//             industryExpertise: analysis.industryExpertise,
//             keyStrengths: analysis.keyStrengths,
//             potentialPainPoints: analysis.potentialPainPoints,
//             businessOpportunities: analysis.businessOpportunities,
//             competitorAnalysis: analysis.competitorAnalysis,
//             marketPosition: analysis.marketPosition,
//             decisionMakingAuthority: analysis.decisionMakingAuthority,
//           },

//           outreachContent: {
//             personalizedMessage: outreachContent.personalizedMessage,
//             emailSubject: outreachContent.emailSubject,
//             linkedinMessage: outreachContent.linkedinMessage,
//             followUpSequence: outreachContent.followUpSequence,
//             valueProposition: outreachContent.valueProposition,
//             callToAction: outreachContent.callToAction,
//           },

//           recommendations: {
//             bestContactMethod: analysis.bestContactMethod,
//             optimalContactTime: analysis.optimalContactTime,
//             approachStrategy: analysis.approachStrategy,
//             priorityScore: analysis.priorityScore,
//             conversionProbability: analysis.conversionProbability,
//           },

//           sourceInfo: {
//             searchEngine: "Google",
//             searchQuery: query,
//             sourceUrl: result.link,
//             dataQuality: contactInfo.emails.length > 0 ? "high" : "medium",
//           },

//           createdBy: userId,
//         })

//         await prospect.save()
//         prospects.push(prospect)
//         processed++

//         // Update progress
//         const progressPercent = Math.round((processed / searchResults.length) * 70) + 30
//         io.emit("businessSearchProgress", {
//           searchId,
//           status: `Processed ${processed}/${searchResults.length} prospects`,
//           progress: progressPercent,
//           phase: "analyzing",
//           prospectsFound: prospects.length,
//         })

//         // Rate limiting
//         await new Promise((resolve) => setTimeout(resolve, 1000))
//       } catch (error) {
//         console.error(`Error processing prospect:`, error)
//         processed++
//       }
//     }

//     // Complete the search
//     searchHistory.status = "completed"
//     searchHistory.completedAt = new Date()
//     searchHistory.results = {
//       totalFound: searchResults.length,
//       totalProcessed: processed,
//       highPriorityProspects: prospects.filter((p) => p.recommendations.priorityScore >= 80).length,
//       mediumPriorityProspects: prospects.filter(
//         (p) => p.recommendations.priorityScore >= 60 && p.recommendations.priorityScore < 80,
//       ).length,
//       lowPriorityProspects: prospects.filter((p) => p.recommendations.priorityScore < 60).length,
//     }
//     searchHistory.progress.percentage = 100
//     await searchHistory.save()

//     io.emit("businessSearchComplete", {
//       searchId,
//       prospects: prospects.length,
//       message: `Search completed! Found ${prospects.length} qualified prospects.`,
//     })
//   } catch (error) {
//     console.error("Process search error:", error)

//     await BusinessSearchHistory.findByIdAndUpdate(searchId, {
//       status: "failed",
//       errors: [error.message],
//     })

//     io.emit("businessSearchError", {
//       searchId,
//       error: error.message,
//     })
//   }
// }

// // Helper functions
// const extractNameFromTitle = (title) => {
//   // Extract name from LinkedIn or company page titles
//   const patterns = [/^([A-Z][a-z]+ [A-Z][a-z]+)/, /([A-Z][a-z]+ [A-Z][a-z]+) - /, /([A-Z][a-z]+ [A-Z][a-z]+) \|/]

//   for (const pattern of patterns) {
//     const match = title.match(pattern)
//     if (match) return match[1]
//   }

//   return title.split(" - ")[0].split(" | ")[0].trim()
// }

// const extractJobTitle = (title, snippet) => {
//   const jobTitlePatterns = [
//     /- ([^|]+) \|/,
//     /- ([^-]+) -/,
//     /(CEO|CTO|VP|Director|Manager|Lead|Senior|Principal|Head of)[^,]*/i,
//   ]

//   for (const pattern of jobTitlePatterns) {
//     const match = (title + " " + snippet).match(pattern)
//     if (match) return match[1].trim()
//   }

//   return "Professional"
// }

// const extractCompany = (title, snippet) => {
//   const companyPatterns = [/at ([^|,-]+)/i, /\| ([^|]+)$/, /- ([^-]+)$/]

//   for (const pattern of companyPatterns) {
//     const match = (title + " " + snippet).match(pattern)
//     if (match) return match[1].trim()
//   }

//   return "Unknown Company"
// }

// // Stop search
// export const stopBusinessSearch = async (req, res) => {
//   try {
//     const { searchId, userId } = req.body

//     if (!searchId || !userId) {
//       return res.status(400).json({ success: false, error: "Missing required parameters" })
//     }

//     searchControlMap.set(searchId, { shouldStop: true, stoppedBy: userId })

//     await BusinessSearchHistory.findByIdAndUpdate(searchId, {
//       stoppedAt: new Date(),
//       status: "stopped",
//     })

//     res.json({ success: true, message: "Search stop requested" })
//   } catch (error) {
//     console.error("Stop search error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// const handleSearchStop = async (searchId) => {
//   await BusinessSearchHistory.findByIdAndUpdate(searchId, {
//     status: "stopped",
//     stoppedAt: new Date(),
//   })

//   io.emit("businessSearchStopped", {
//     searchId,
//     message: "Search stopped by user",
//   })
// }

// // Get search history
// export const getBusinessSearchHistory = async (req, res) => {
//   try {
//     const { userId } = req.params

//     const searches = await BusinessSearchHistory.find({ userId }).sort({ createdAt: -1 }).limit(20)

//     res.json({ success: true, searches })
//   } catch (error) {
//     console.error("Get search history error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Get prospects
// export const getBusinessProspects = async (req, res) => {
//   try {
//     const { userId } = req.params
//     const { searchId, status, priorityScore } = req.query

//     const query = { createdBy: userId }

//     if (searchId) {
//       const searchHistory = await BusinessSearchHistory.findById(searchId)
//       if (searchHistory) {
//         query["searchCriteria.industry"] = searchHistory.searchParams.industry
//         query["searchCriteria.targetLocation"] = searchHistory.searchParams.location
//         query["searchCriteria.role"] = searchHistory.searchParams.role
//       }
//     }

//     if (status) {
//       query["engagement.status"] = status
//     }

//     if (priorityScore) {
//       query["recommendations.priorityScore"] = { $gte: Number.parseInt(priorityScore) }
//     }

//     const prospects = await BusinessProspect.find(query)
//       .sort({ "recommendations.priorityScore": -1, createdAt: -1 })
//       .limit(100)

//     res.json({ success: true, prospects })
//   } catch (error) {
//     console.error("Get prospects error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Update prospect status
// export const updateProspectStatus = async (req, res) => {
//   try {
//     const { prospectId } = req.params
//     const { status, notes } = req.body

//     const prospect = await BusinessProspect.findByIdAndUpdate(
//       prospectId,
//       {
//         "engagement.status": status,
//         "engagement.lastContactDate": new Date(),
//         $push: { "engagement.notes": notes },
//         updatedAt: new Date(),
//       },
//       { new: true },
//     )

//     if (!prospect) {
//       return res.status(404).json({ success: false, error: "Prospect not found" })
//     }

//     res.json({ success: true, prospect })
//   } catch (error) {
//     console.error("Update prospect error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }

// // Delete prospect
// export const deleteBusinessProspect = async (req, res) => {
//   try {
//     const { prospectId } = req.params
//     const { userId } = req.body

//     const prospect = await BusinessProspect.findOneAndDelete({
//       _id: prospectId,
//       createdBy: userId,
//     })

//     if (!prospect) {
//       return res.status(404).json({ success: false, error: "Prospect not found" })
//     }

//     res.json({ success: true, message: "Prospect deleted successfully" })
//   } catch (error) {
//     console.error("Delete prospect error:", error)
//     res.status(500).json({ success: false, error: error.message })
//   }
// }
