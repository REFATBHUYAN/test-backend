// businessDevelopmentController.js - Focused on Client Discovery
import { OpenAI } from "openai";
import axios from "axios";
import { load } from "cheerio";
import { io } from "../../index.js"; // Assuming io is exported from your main server file
import mongoose from "mongoose";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// =================================================================
// SECTION: BUSINESS DEVELOPMENT AGENT
// =================================================================

const businessDevSearchHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    searchSettings: {
        targetLocation: String,
        clientCount: Number,
        targetIndustry: String,
        keywords: String,
    },
    results: [{
        clientName: String,
        industry: String,
        summary: String,
        email: String,
        phone: String,
        website: String,
        potentialNeeds: String,
        outreachMessage: String,
        sourceInfo: {
            platform: String,
            profileUrl: String,
        },
        location: String,
    }],
    createdAt: { type: Date, default: Date.now },
});
const BusinessDevSearchHistory = mongoose.model("BusinessDevSearchHistory", businessDevSearchHistorySchema);

/**
 * Starts the business development client search.
 */
export const startBusinessDevelopmentSearch = async (req, res) => {
    const { searchSettings, userId } = req.body;
    if (!searchSettings || !userId || !searchSettings.targetLocation) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const newSearch = new BusinessDevSearchHistory({
        userId,
        searchSettings,
        results: [],
    });
    await newSearch.save();

    res.status(200).json({
        success: true,
        message: "🚀 Business Development Agent search started!",
        searchId: newSearch._id,
    });

    // Perform the search asynchronously
    findPotentialClients(newSearch._id, searchSettings);
};

/**
 * The core async function to find and analyze clients.
 */
const findPotentialClients = async (searchId, searchSettings) => {
    try {
        io.emit("searchProgress", { searchId, status: "Generating intelligent search queries...", progress: 10 });

        const queries = await generateBusinessSearchQueries(searchSettings);
        if (!queries || queries.length === 0) throw new Error("Could not generate search queries.");

        io.emit("searchProgress", { searchId, status: `Searching the web with ${queries.length} queries...`, progress: 25 });

        const urls = await searchGoogleForClients(queries, searchSettings.clientCount);
        if (!urls || urls.length === 0) throw new Error("No potential client websites found.");

        const finalResults = [];
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const progress = 40 + (i / urls.length) * 60;
            io.emit("searchProgress", { searchId, status: `AI Analyzing client ${i + 1}/${urls.length}: ${url.split('/')[2]}`, progress });
            
            try {
                const clientData = await analyzeClientWebsite(url, searchSettings);
                if (clientData && clientData.clientName) { // Ensure we have a valid client
                    finalResults.push(clientData);
                }
            } catch (analysisError) {
                console.error(`Error analyzing ${url}:`, analysisError.message);
            }
        }

        await BusinessDevSearchHistory.findByIdAndUpdate(searchId, { results: finalResults });

        io.emit("searchComplete", { searchId, results: finalResults });

    } catch (error) {
        console.error("Error in findPotentialClients:", error);
        io.emit("searchError", { searchId, message: error.message });
    }
};

/**
 * Generates Google search queries using AI.
 */
const generateBusinessSearchQueries = async (settings) => {
    const prompt = `
        Generate 5 diverse Google search queries to find potential business clients based on these criteria:
        - Location: "${settings.targetLocation}"
        - Industry: "${settings.targetIndustry || 'professional services'}"
        - Keywords: "${settings.keywords || ''}"

        Focus on finding company websites, directories (like Clutch, GoodFirms), and professional listings. Avoid job boards.
        
        Return ONLY a valid JSON object with a "queries" array:
        {"queries": ["query1", "query2", "query3", "query4", "query5"]}
    `;
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: prompt }],
        response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content).queries;
};

/**
 * Searches Google and returns a list of unique URLs.
 */
const searchGoogleForClients = async (queries, count) => {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (!apiKey || !searchEngineId) throw new Error("Google Search API not configured.");

    const urls = new Set();
    for (const query of queries) {
        if (urls.size >= count) break;
        try {
            const response = await axios.get(`https://www.googleapis.com/customsearch/v1`, {
                params: { key: apiKey, cx: searchEngineId, q: query, num: 10 }
            });
            response.data.items?.forEach(item => {
                if(item.link) urls.add(item.link)
            });
        } catch (error) {
            console.error(`Google search failed for query "${query}":`, error.response?.data?.error?.message || error.message);
        }
    }
    return Array.from(urls).slice(0, count);
};

/**
 * Scrapes a website and uses AI to analyze it for business development info.
 */
const analyzeClientWebsite = async (url, settings) => {
    try {
        const { data } = await axios.get(url, { 
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        const $ = load(data);
        $("script, style, nav, footer, header, .sidebar, .ad").remove();
        const text = $("body").text().replace(/\s+/g, " ").trim().substring(0, 8000);

        if (text.length < 150) return null;

        const prompt = `
            You are a business development expert. Analyze the text from the website "${url}" and extract the following information in a strict JSON format. The target client is in or serves "${settings.targetLocation}". Do not invent data. Use null if a field cannot be found.

            - clientName: The official name of the company.
            - industry: The specific industry they operate in (e.g., "Digital Marketing Agency", "Custom Software Development").
            - summary: A brief, one-sentence summary of what the company does.
            - email: The best contact email address (e.g., contact@, info@, sales@).
            - phone: The main contact phone number.
            - website: The URL "${url}".
            - location: Their physical address or city, if mentioned.
            - potentialNeeds: Based on their services, what business development need might they have? (e.g., "They are a design agency, so they might need a development partner for their projects.").
            - outreachMessage: A short, personalized, friendly cold outreach message (2-3 sentences) to start a conversation.

            Return ONLY the JSON object.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: prompt }],
            response_format: { type: "json_object" },
        });

        const analysis = JSON.parse(response.choices[0].message.content);
        return { ...analysis, sourceInfo: { platform: 'web', profileUrl: url } };

    } catch (error) {
        console.error(`Failed to analyze website ${url}:`, error.message);
        return null;
    }
};

/**
 * Fetches the search history for the Business Development agent.
 */
export const getBusinessDevSearchHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const searches = await BusinessDevSearchHistory.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, searches });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Fetches the results of a specific Business Development search.
 */
export const getBusinessDevSearchResults = async (req, res) => {
    try {
        const { searchId } = req.params;
        const search = await BusinessDevSearchHistory.findById(searchId);
        if (!search) {
            return res.status(404).json({ success: false, error: "Search not found" });
        }
        res.status(200).json({ success: true, results: search.results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Deletes a Business Development search history item.
 */
export const deleteBusinessDevSearchHistoryItem = async (req, res) => {
    try {
        const { searchId } = req.params;
        await BusinessDevSearchHistory.findByIdAndDelete(searchId);
        res.status(200).json({ success: true, message: "Search history item deleted" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
