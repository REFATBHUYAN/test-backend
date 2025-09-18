import axios from "axios"
import FormData from "form-data"
import TVS from 'tvsapi';

const API_USERNAME = process.env.TRUSTID_API_USERNAME
const API_PASSWORD = process.env.TRUSTID_API_PASSWORD
const API_URL = "https://api.trustid.com/v1/documents/check" // Replace with the actual TrustID API URL

export const verifyId = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ status: "No file uploaded" })
  }

  const formData = new FormData()
  formData.append("document", req.file.buffer, req.file.originalname)
  formData.append("branchId", "1940ba3b-b92e-4244-83cf-f993bc850be8") // Digital & Conditional RTW branch

  try {
    const response = await axios.post(API_URL, formData, {
      auth: {
        username: API_USERNAME,
        password: API_PASSWORD,
      },
      headers: formData.getHeaders(),
    })

    // Process the response from TrustID
    const result = response.data
    let status

    if (result.overallResult === "PASS") {
      status = "Verification successful"
    } else if (result.overallResult === "FAIL") {
      status = "Verification failed"
    } else {
      status = "Verification pending or inconclusive"
    }

    res.json({ status, details: result })
  } catch (error) {
    console.error("Error:", error)
    res.status(500).json({ status: "Error occurred during verification", error: error.message })
  }
}

const baseUrl = "https://cloud.trustid.co.uk/vpe.svc/"

// Initialize the API
const api = new TVS.Api();

// Log in with your credentials
api.login('api_bloomixdev', 'EmL+iYGjck39')
  .then((loginResponse) => {
    console.log('Login successful:', loginResponse);
    // Proceed to make API calls after successful login
  })
  .catch((error) => {
    console.error('Login failed:', error.Message || error);
  });

