import post from "axios";
import { readFileSync, unlinkSync } from "fs";
import path from "path";
import axios from "axios";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// Environment Variables
const TRUSTID_API_URL = 'https://devcloud.trustid.co.uk/api/verify';
const TRUSTID_API_USERNAME = 'api_bloomixdev';
const TRUSTID_API_PASSWORD = 'EmL+iYGjck39';
// const TRUSTID_API_URL = process.env.TRUSTID_API_URL || 'https://devcloud.trustid.co.uk/api/verify';
// const TRUSTID_API_USERNAME = process.env.TRUSTID_API_USERNAME || 'api_bloomixdev';
// const TRUSTID_API_PASSWORD = process.env.TRUSTID_API_PASSWORD || 'EmL+iYGjck39';

export const verifyDocument = async (req, res) => {
  try {
    const filePath = req.file.path;

    // Read the file and prepare it for sending to TrustID API
    const fileData = readFileSync(filePath);

    const response = await post(
      `${TRUSTID_API_URL}/verify`, // Adjust the endpoint based on TrustID API documentation
      {
        branch_id: "1940ba3b-b92e-4244-83cf-f993bc850be8", // Use the appropriate Branch ID
        document: fileData.toString("base64"), // Convert file to base64
      },
      {
        auth: {
          username: TRUSTID_API_USERNAME,
          password: TRUSTID_API_PASSWORD,
        },
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Delete the uploaded file after processing
    unlinkSync(filePath);

    // Send the response back to the frontend
    res.status(200).json(response.data);
  } catch (error) {
    console.error(
      "Error verifying document:",
      error.response ? error.response.data : error.message
    );
    console.log("Error verifying document:", error);
    res.status(500).json({ message: "Failed to verify document" });
  }
};
export const verifyDocument2 = async (req, res) => {
  try {
    const filePath = req.file.path;

    // Read the file and prepare it for sending to TrustID API
    const fileData = fs.readFileSync(filePath);

    console.log(`Sending request to ${TRUSTID_API_URL}`);

    const response = await axios.post(
      TRUSTID_API_URL,
      {
        branch_id: '1940ba3b-b92e-4244-83cf-f993bc850be8', // Use the appropriate Branch ID
        document: fileData.toString('base64'), // Convert file to base64
      },
      {
        auth: {
          username: TRUSTID_API_USERNAME,
          password: TRUSTID_API_PASSWORD,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    // Delete the uploaded file after processing
    fs.unlinkSync(filePath);

    // Send the response back to the frontend
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error verifying document:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('DNS resolution failed for hostname:', error.hostname);
      res.status(500).json({ message: 'Failed to connect to TrustID API' });
    } else {
      res.status(500).json({ message: 'Failed to verify document' });
    }
  }
};


// export default {
//   verifyDocument,
// };
