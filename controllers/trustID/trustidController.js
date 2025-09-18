import axios from "axios";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import Resume from "../../model/resumeModel.js";

dotenv.config();

const TRUSTID_API_BASE = "https://customerdev.trustid.co.uk/VPE";
// const TRUSTID_API_BASE = "https://api.trustid.com/VPE";
const API_USERNAME = "api_bloomixdev";
const API_PASSWORD = "EmL+iYGjck39";
const DEVICE_ID = "your-device-id";

// Nodemailer transporter for sending emails
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS, 
  },
});

// Step 1: Login to TrustID
const getSessionId = async () => {
  try {
    const response = await axios.post(`${TRUSTID_API_BASE}/session/login/`, {
      DeviceId: DEVICE_ID,
      Username: API_USERNAME,
      Password: API_PASSWORD,
    });

    console.log("TrustID Login response", response);

    return response.data.SessionId;
  } catch (error) {
    console.error("Login failed:", error.response?.data || error.message || error);
    throw new Error("TrustID login failed.");
  }
};

// Step 2: Create Guest Link and Send Email
export const createGuestLink2 = async (req, res) => {
  try {
    const { email, resumeId } = req.body;
    if (!email || !resumeId) {
      return res.status(400).json({ success: false, message: "Email and Resume ID are required" });
    }

    const sessionId = await getSessionId();

    const response = await axios.post(`${TRUSTID_API_BASE}/guestLink/createGuestLink/`, {
      SessionId: sessionId,
      DeviceId: DEVICE_ID,
      Email: email,
      Name: "Candidate",
      BranchId: "539d67e4-5601-4531-856b-8d59fd5c3983",
      ContainerEventCallbackUrl: `${process.env.WEBHOOK_URL}/v1/trustid/webhook`, // Webhook to receive updates
    });

    console.log("TrustID Create Guest Link response", response);

    const guestLink = response.data.GuestLink;

    // Send the guest link via email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "TrustID Verification Link",
      text: `Click the link below to complete your verification:\n${guestLink}`,
    });

    res.json({ success: true, guestLink, message: "Guest link sent to candidate" });
  } catch (error) {
    console.error("Guest link creation failed:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Error creating guest link" });
  }
};

export const createGuestLink = async (req, res) => {
    try {
      const { email, resumeId } = req.body;
      if (!email || !resumeId) {
        return res.status(400).json({ success: false, message: "Email and Resume ID are required" });
      }
  
      // Login to TrustID and get session details
      const loginResponse = await axios.post(`${TRUSTID_API_BASE}/session/login/`, {
        DeviceId: DEVICE_ID,
        Username: API_USERNAME,
        Password: API_PASSWORD,
      });
  
      const sessionId = loginResponse.data.SessionId;
      const branchId = loginResponse.data.Branch?.Id || loginResponse.data.User?.BranchId;
  
      if (!sessionId || !branchId) {
        return res.status(401).json({ success: false, message: "Session ID or Branch ID missing" });
      }
  
      // Create Guest Link with correct Branch ID
      const response = await axios.post(`${TRUSTID_API_BASE}/guestLink/createGuestLink/`, {
        SessionId: sessionId,
        DeviceId: DEVICE_ID,
        Email: email,
        Name: "Candidate",
        BranchId: branchId, // Use correct Branch ID from login response
        ContainerEventCallbackUrl: `${process.env.WEBHOOK_URL}/v1/webhook`,
        ClientApplicationReference: resumeId // 🔥 Attach Resume ID here
      });
  
      const guestLink = response.data.GuestLink;
  
      res.json({ success: true, guestLink, message: "Guest link sent to candidate" });
    } catch (error) {
      console.error("Guest link creation failed:", error.response?.data || error.message);
      res.status(500).json({ success: false, message: "Error creating guest link" });
    }
  };
  

// Step 3: Webhook to Store Container ID in Resume Model
export const webhookCallback = async (req, res) => {
  try {
    const { Callback } = req.body;
    if (!Callback || !Callback.WorkflowStorage) {
      return res.status(400).json({ success: false, message: "Invalid webhook data" });
    }

    const containerId = Callback.WorkflowStorage.find((item) => item.Key === "ContainerId")?.Value;
    const resumeId = Callback.WorkflowStorage.find((item) => item.Key === "ClientApplicationReference")?.Value;

    if (!containerId || !resumeId) {
      return res.status(400).json({ success: false, message: "Missing Container ID or Resume ID" });
    }

    // Update the Resume model with the containerId
    await Resume.findByIdAndUpdate(resumeId, { containerId });

    res.json({ success: true, message: "Container ID saved successfully" });
  } catch (error) {
    console.error("Webhook processing failed:", error.message);
    res.status(500).json({ success: false, message: "Error processing webhook" });
  }
};

// Step 4: Retrieve Verification Results
export const retrieveVerificationResults = async (req, res) => {
  try {
    const { resumeId } = req.params;

    const resume = await Resume.findById(resumeId);
    if (!resume || !resume.containerId) {
      return res.status(404).json({ success: false, message: "Resume not found or Container ID missing" });
    }

    const sessionId = await getSessionId();

    const response = await axios.post(`${TRUSTID_API_BASE}/dataAccess/retrieveDocumentContainer/`, {
      DeviceId: DEVICE_ID,
      SessionId: sessionId,
      ContainerId: resume.containerId,
    });

    console.log("verification response", response);

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("Retrieving verification results failed:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Error retrieving results" });
  }
};
