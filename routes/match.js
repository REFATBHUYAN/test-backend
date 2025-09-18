import { Router } from "express"
import multer from "multer"
import dotenv from "dotenv"
dotenv.config()
import { generateJD } from "../controllers/generateJD.js"
import { getSingleCompanyResumes } from "../controllers/getSingleCompanyResume.js"
import { getCompanyJD } from "../controllers/getCompanyJD.js"
import { psychoTest } from "../controllers/psychoTest.js"
import { situationQues } from "../controllers/situationQues.js"
import { submitAnswer } from "../controllers/submitAnsware.js"
import { personalityTest } from "../controllers/personalityMapping.js"
// import { generateTenQuestion3, generateTenQuestion32 } from "../controllers/generateTenQuestion3.js"
import { sendChatLink } from "../controllers/sendChatLink.js"
import { checkDatabaseAttachments } from "../test2.js"
import { deleteResume } from "../controllers/deleteResume.js"
import { generateTenJobSpecificQs } from "../controllers/generateTenJobSpecificQs.js"
import { generateTenPsychoQuestion } from "../controllers/generateTenPsychoQuestion.js"
import { generateTenSituationalQs } from "../controllers/generateTenSituationalQs.js"
import { deleteJob } from "../controllers/deleteJob.js"
import { getQuestionAndAnsResult } from "../controllers/getQuestion&AnswerResult.js"
import { deleteResumesByJob } from "../controllers/deleteResumesByJob.js"
import { getCompanies } from "../controllers/getCompanies.js"
import { deleteMultipleResumes } from "../controllers/deleteMultipleResumes.js"
import { generateAllJobSpecificQs } from "../controllers/generateAllJobSpecificQs.js"
import { submitAnswer4 } from "../controllers/submitAnsware4.js"
import { scoreMultipleResume4 } from "../controllers/scoreMultipleResume4.js"
import { updateMultipleResumes, updateMultipleResumes2 } from "../controllers/updateMulitipleResume.js"
import { getCompanyData, getCompanyJobs, getCompanyResumes } from "../controllers/companyData/getCompanyData.js"
import { updateJobAssineeAndStaus } from "../controllers/jobs/updateJobAssineeAndStaus.js"
import { getResumeById } from "../controllers/resumes/getSingleResumebyID.js"
import { updateCandidateExpectationResult } from "../controllers/resumes/updateCandidateExpecationResult.js"
import { updateResumeExpectationsAndSendMail } from "../controllers/resumes/updateResumeExpectations.js"
import { sendChatLink2 } from "../controllers/sendChatLink2.js"
import { getAptituteTestResult } from "../controllers/getAptitudeTestScore.js"
import { submitAnswer5 } from "../controllers/submitAnsware5.js"
import { updateJobOwner } from "../controllers/jobs/updateJobOwner.js"
import { scoreMultipleResumeTest } from "../controllers/scoreMultipleResumeTest.js"
import { setJobCriteria } from "../controllers/jobs/setJobCriteria.js"
import { submitAssessmentScore } from "../controllers/resumes/submitAssessmentScore.js"
import { getChatHistoryNew, sendChat, uploadChatAttachment, sendBulkChat } from "../controllers/resumes/sendChat.js"
import { getChatHistory, getLastQuestion, submitChatAnswer } from "../controllers/resumes/chatController.js"
import { jobDescTest } from "../controllers/JobDescTest.js"
import { saveResumes } from "../controllers/resumes/saveResumes.js"
import { scoreSingleResumeMultipleJobs } from "../controllers/jobDescTest2.js"
import { getSingleJob } from "../controllers/jobs/getSingleJob.js"
import { scoreSingleResumeSingleJob } from "../controllers/jobs/uploadSingleResumeForJob.js"
import { togglePublish } from "../controllers/jobs/publishJob.js"
import { getClient } from "../controllers/client/getClient.js"
import {
  createClient,
  deleteClient,
  getClientsByCompany,
  updateClient,
} from "../controllers/client/clientsController.js"
import { addNotes } from "../controllers/resumes/addNotes.js"
import { scoreSingleResume } from "../controllers/resumes/scoreSingleResume.js"
import { codeQues } from "../controllers/codeQues.js"
import { scoreSingleResumeAndSaveCandidate } from "../controllers/jobs/scoreSingleResumeAndSaveCandidate.js"
import { scoreSingleResume2 } from "../controllers/resumes/scoreSingleResume2.js"
import { scoreSingleResume3 } from "../controllers/resumes/scoreSingleResume3.js"
import { updateJobClient } from "../controllers/jobs/updateJobClient.js"
import { submitVideoResponses3 } from "../controllers/videoInterview/submitVideoResponse3.js"
import { getResumeByEmail } from "../controllers/resumes/getResumeByEmail.js"
import { deleteUser, updateUser } from "../controllers/users/userController.js"
import {
  assignCompanyExess,
  createSingleCompany,
  deleteCompany,
  getAllCompanies,
  getAllCompanies2,
  getSingleCompany,
  updateCompany,
} from "../controllers/companyData/companyController.js"
import { getSingleCompanyUsers } from "../controllers/companyData/getSingleCompanyUsers.js"
import {
  addReference,
  deleteReference,
  getReferencesByCandidateEmail,
  sendReferenceEmail,
  updateReference,
  updateReferenceById,
} from "../controllers/references/referenceControler.js"
import {
  createSubscriptionFlow,
  completeSubscriptionFlow,
  testConnection,
  createStripeCheckout,
  verifyStripeSession,
} from "../controllers/payment/paymentController.js"
import expectationScreeningController from "../controllers/jobs/expectationControler.js"
import {
  createGuestLink,
  retrieveVerificationResults,
  webhookCallback,
} from "../controllers/trustID/trustidController.js"
import { generateCompanyJD2, getCustomQuestions, saveCustomQuestions, updateJobDescription2, updateSingleJob } from "../controllers/jobs/jobController.js"
import { submitCustomAnswers } from "../controllers/question/customQuestionRoutes.js"
import {    generateDynamicQuestions, generateTenQuestion3,  submitDynamicAnswers } from "../controllers/question/enhanced-question-generator.js"
import { initializeMCPInterview, mcpInterviewResponse, submitMCPInterview } from "../controllers/aiInterview/mcpInterviewController.js"
// import { sendAIInterviewLink } from "../controllers/aiInterview/aiInterviewController.js"
// import { handleInitializeInterview, handleProcessResponse, handleSubmitInterview } from "../controllers/aiInterview/mcpServer.js"
import voiceInterviewController from "../controllers/aiInterview/voiceInterviewController.js"
import customAnswersController from "../controllers/jobs/custom-answers-controller.js"

const router = Router()

// DISK STORAGE - For resume uploads and other large files that need to be processed
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/")
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  },
})

// MEMORY STORAGE - For chat attachments that go directly to Cloudinary
const memoryStorage = multer.memoryStorage()

// File filter for resume uploads (PDF, DOCX, videos)
const resumeFileFilter = (req, file, cb) => {
  console.log("Uploaded file mimetype:", file.mimetype)

  const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "video/mp4",
    "video/mov",
    "video/webm",
    "video/avi",
    "video/x-msvideo",
    "image/jpeg",
    "image/png",
    "image/gif",
  ]

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Only PDF, DOCX, video, and image files are allowed."), false)
  }
}

// File filter for chat attachments (more permissive)
const chatFileFilter = (req, file, cb) => {
  console.log("Chat attachment mimetype:", file.mimetype)

  const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-zip-compressed",
  ]

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("File type not allowed for chat attachments."), false)
  }
}

// Configure multer instances
const uploadDisk = multer({
  storage: diskStorage,
  fileFilter: resumeFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for resumes and videos
    // files: 10,
  },
})

const uploadMemory = multer({
  storage: memoryStorage,
  fileFilter: chatFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for chat attachments
    // files: 5,
  },
})

// Legacy upload for backward compatibility
const upload = uploadDisk

// RESUME AND JOB ROUTES (using disk storage)
router.post("/match", uploadDisk.array("resumes"), scoreMultipleResume4)
router.post("/match2", uploadDisk.array("resumes"), scoreMultipleResumeTest)
router.delete("/deleteResume/:id", deleteResume)
router.delete("/deleteJob/:id", deleteJob)
router.delete("/deleteResumesByJob/:jobId", deleteResumesByJob)
router.delete("/deleteMultipleResumes", deleteMultipleResumes)
router.get("/companyResumes", getSingleCompanyResumes)
router.get("/getCompanyJD", getCompanyJD)
router.get("/companies", getCompanies)
router.post("/jobDesc", uploadDisk.single("resume"), scoreSingleResumeMultipleJobs)
router.post("/jobDesc2", jobDescTest)

// QUESTION GENERATION ROUTES
router.get("/generateAllThreeTypeQs", generateAllJobSpecificQs)
// router.get("/generateTenQuestion3", generateTenQuestion3)
router.get("/generateTenJobSpecificQs", generateTenJobSpecificQs)
router.get("/generateTenPsychoQs", generateTenPsychoQuestion)
router.get("/generateTenSituationQs", generateTenSituationalQs)
router.get("/scores", getQuestionAndAnsResult)
router.post("/scores2", getAptituteTestResult)

// ANSWER SUBMISSION ROUTES
router.post("/submitAnswers", submitAnswer)
router.post("/submitAnswers2", submitAnswer4)
router.post("/submitAnswers3", submitAnswer5)

// JOB DESCRIPTION ROUTES
router.post("/generateJD", generateJD)
router.post("/generateCompanyJD", generateCompanyJD2)
router.post("/updateJobDescription", updateJobDescription2)
router.put("/updateSingleJob/:id", updateSingleJob)
router.put("/updateMultipleResumes", updateMultipleResumes)
router.put("/updateMultipleResumes2", updateMultipleResumes2)

// TEST ROUTES
router.post("/full-test", psychoTest)
router.post("/situation-test", situationQues)
router.post("/personalityTest", personalityTest)
router.post("/sendChatLink", sendChatLink)
router.post("/sendChatLink2", sendChatLink2)
router.get("/test", checkDatabaseAttachments)

// COMPANY DATA ROUTES
router.get("/getCompanyData", getCompanyData)
router.get("/getCompanyJobs", getCompanyJobs)
router.get("/getCompanyResumes", getCompanyResumes)
router.get("/resumes/:resumeId", getResumeById)
router.put("/updateExpectations", updateResumeExpectationsAndSendMail)
router.put("/updateJobAssineeAndStaus", updateJobAssineeAndStaus)
router.put("/updateJobOwner", updateJobOwner)
router.put("/resumes/:resumeId/expectations-response", updateCandidateExpectationResult)
router.post("/setJobCriteria", setJobCriteria)
router.post("/submit-assessment", submitAssessmentScore)

// CHAT ROUTES (using memory storage for attachments)
router.post("/sendChat", sendChat)
router.post("/sendBulkChat", sendBulkChat)
router.get("/getChatHistory", getChatHistoryNew)
router.post("/submitChatAnswer", submitChatAnswer)
router.post("/uploadChatAttachment", uploadMemory.single("file"), uploadChatAttachment)
router.get("/getLastQuestion", getLastQuestion)

// RESUME UPLOAD ROUTES (using disk storage)
router.post("/saveResumes", saveResumes)
router.post("/uploadResume/:id", uploadDisk.single("resume"), scoreSingleResumeSingleJob)
router.post("/uploadResume2/:id", uploadDisk.single("resume"), scoreSingleResumeAndSaveCandidate)
router.get("/getJob/:id", getSingleJob)
router.put("/toggle-publish/:jobId", togglePublish)

// CLIENT ROUTES
router.get("/clients/:companyId", getClientsByCompany)
router.post("/clients/:companyId", createClient)
router.get("/clients/:companyId/:id", getClient)
router.put("/clients/:companyId/:id", updateClient)
router.delete("/clients/:companyId/:id", deleteClient)

// NOTES AND SCORING ROUTES
router.post("/add-note/:resumeId", addNotes)
router.post("/scoreSingleResume", uploadDisk.single("resume"), scoreSingleResume)
router.post("/scoreSingleResume2", uploadDisk.single("resume"), scoreSingleResume2)
router.post("/scoreSingleResume3", scoreSingleResume3)
router.put("/updateJobClient", updateJobClient)

// VIDEO INTERVIEW ROUTES (using disk storage for videos)
router.post("/videointerview", uploadDisk.array("videos"), submitVideoResponses3)
router.get("/resume/:email", getResumeByEmail)

// USER MANAGEMENT ROUTES
router.put("/users/:id", updateUser)
router.delete("/users/:id", deleteUser)

// COMPANY MANAGEMENT ROUTES
router.get("/companies2", getAllCompanies)
router.post("/companies", createSingleCompany)
router.put("/companies/:id", updateCompany)
router.delete("/companies/:id", deleteCompany)
router.get("/companies", getAllCompanies2)
router.get("/companies/:companyId", getSingleCompany)
router.post("/companies/assign-exess", assignCompanyExess)

// ORGANIZATION DATA ROUTES
router.get("/organization/:companyId", getSingleCompanyUsers)

// REFERENCE ROUTES
router.get("/references/:candidateEmail", getReferencesByCandidateEmail)
router.post("/references", addReference)
router.post("/references/:id", sendReferenceEmail)
router.put("/references/:id", updateReference)
router.patch("/references/:id", updateReferenceById)
router.delete("/references/:id", deleteReference)

// CODE QUESTIONS
router.post("/codeQues", codeQues)

// PAYMENT ROUTES
router.post("/create-subscription-flow", createSubscriptionFlow)
router.post("/complete-subscription-flow", completeSubscriptionFlow)
router.get("/testgo", testConnection)
router.post("/create-stripe-checkout", createStripeCheckout)
router.post("/verify-stripe-session", verifyStripeSession)

// EXPECTATION SCREENING ROUTES
router.post("/saveExpectationQuestions", expectationScreeningController.saveQuestions)
router.post("/sendExpectationQuestions", expectationScreeningController.sendQuestions)
router.put("/resumesExpectation/expectationsResponse/:resumeId", expectationScreeningController.saveCandidateResponse)

// TRUSTID ROUTES
router.post("/create-guest-link", createGuestLink)
router.post("/webhook", webhookCallback)
router.get("/retrieve-results/:resumeId", retrieveVerificationResults)

// Custom question routes - separate from regular question routes
router.post("/submitCustomAnswers", customAnswersController.submitCustomAnswers)
// router.post("/submitCustomAnswers", submitCustomAnswers)
router.post("/saveCustomQuestions", customAnswersController.saveCustomQuestions)
// router.post("/saveCustomQuestions", saveCustomQuestions)
router.get("/getCustomQuestions", customAnswersController.getCustomQuestions)
// router.get("/getCustomQuestions", getCustomQuestions)

// Dynamic question generation route
router.get("/generateDynamicQuestions", generateDynamicQuestions)

// Original personality test route (maintained for backward compatibility)
router.get("/generateTenQuestion3", generateTenQuestion3)

// Submit dynamic answers route
router.post("/submitDynamicAnswers", submitDynamicAnswers)

// AI AGENTIC INTERVIEW ROUTE
// router.get('/initializeMCPInterview', initializeMCPInterview);
// router.post('/mcpInterviewResponse', mcpInterviewResponse);
// router.post('/submitMCPInterview', submitMCPInterview);
// router.post('/sendAIInterviewLink', sendAIInterviewLink);
// router.get('/initializeMCPInterview', handleInitializeInterview);
// router.post('/mcpInterviewResponse', handleProcessResponse);
// router.post('/submitMCPInterview', handleSubmitInterview);
// router.post('/sendVoiceInterviewLink', handleSendInterviewLink);
router.get('/initializeMCPInterview', voiceInterviewController.initializeMCPInterview);
router.post('/mcpInterviewResponse', voiceInterviewController.mcpInterviewResponse);
router.post('/submitMCPInterview', voiceInterviewController.submitMCPInterview);
// router.post('/sendVoiceInterviewLink', handleSendInterviewLink);
router.post('/sendVoiceInterviewLink', voiceInterviewController.sendVoiceInterviewLink);

// ERROR HANDLING MIDDLEWARE
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "File too large. Maximum size is 50MB for resumes/videos and 10MB for chat attachments.",
      })
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        message: "Too many files. Maximum is 10 files for resumes and 5 files for chat.",
      })
    }
  }

  if (error.message.includes("not allowed") || error.message.includes("Only")) {
    return res.status(400).json({ message: error.message })
  }

  next(error)
})

export default router


// import { Router } from "express";
// import { matchResume } from "../controllers/match.js";
// import multer from "multer";
// import fs from 'fs';
// import dotenv from "dotenv";
// dotenv.config();
// import { getAllResumes } from "../controllers/resume.js";
// import { jobDesc } from "../controllers/jobDesc.js";
// import { generateQues } from "../controllers/generateQues.js";
// import { generateJD } from "../controllers/generateJD.js";
// import { getSingleCompanyResumes } from "../controllers/getSingleCompanyResume.js";
// import { getCompanyJD } from "../controllers/getCompanyJD.js";
// import { psychoTest } from "../controllers/psychoTest.js";
// import { situationQues } from "../controllers/situationQues.js";
// import { generateCompanyJD } from "../controllers/generateComapanyJD.js";
// import { generateQuestion2 } from "../controllers/genarateQestion2.js";
// import { generateTenQuestion } from "../controllers/generateTenQuestion.js";
// import { submitAnswer } from "../controllers/submitAnsware.js";
// import { submitAnswer2 } from "../controllers/submitAnsware2.js";
// import { generateTenQuestion2 } from "../controllers/generateTenQuestion2.js";
// import { personalityTest } from "../controllers/personalityMapping.js";
// import { generateTenQuestion3 } from "../controllers/generateTenQuestion3.js";
// import { sendChatLink } from "../controllers/sendChatLink.js";
// import { updateJobDescription } from "../controllers/updateJobDescription.js";
// import { updateTopSkills } from "../test2.js";
// import { deleteResume } from "../controllers/deleteResume.js";
// import { generateTenJobSpecificQs } from "../controllers/generateTenJobSpecificQs.js";
// import { generateTenPsychoQuestion } from "../controllers/generateTenPsychoQuestion.js";
// import { generateTenSituationalQs } from "../controllers/generateTenSituationalQs.js";
// import { scoreMultipleResume } from "../controllers/scoreMultipleResume.js";
// import { deleteJob } from "../controllers/deleteJob.js";
// import { scoreMultipleResume2 } from "../controllers/scoreMultipleResume2.js";
// import { getQuestionAndAnsResult } from "../controllers/getQuestion&AnswerResult.js";
// import { submitAnswer3 } from "../controllers/submitAnswer3.js";
// import { deleteResumesByJob } from "../controllers/deleteResumesByJob.js";
// import { getCompanies } from "../controllers/getCompanies.js";
// import { deleteMultipleResumes } from "../controllers/deleteMultipleResumes.js";
// import { generateAllJobSpecificQs } from "../controllers/generateAllJobSpecificQs.js";
// import { submitAnswer4 } from "../controllers/submitAnsware4.js";
// import { scoreMultipleResume3 } from "../controllers/scoreMultipleResume3.js";
// import { updateSingleJobDescription } from "../controllers/updateSingleJobDescription.js";
// import { scoreMultipleResume4 } from "../controllers/scoreMultipleResume4.js";
// import { updateMultipleResumes, updateMultipleResumes2 } from "../controllers/updateMulitipleResume.js";
// import { getCompanyData, getCompanyJobs, getCompanyResumes } from "../controllers/companyData/getCompanyData.js";
// import { updateJobAssineeAndStaus } from "../controllers/jobs/updateJobAssineeAndStaus.js";
// import { getResumeById } from "../controllers/resumes/getSingleResumebyID.js";
// import { updateCandidateExpectationResult } from "../controllers/resumes/updateCandidateExpecationResult.js";
// import { updateResumeExpectationsAndSendMail } from "../controllers/resumes/updateResumeExpectations.js";
// import { sendChatLink2 } from "../controllers/sendChatLink2.js";
// import { getAptituteTestResult } from "../controllers/getAptitudeTestScore.js";
// import { submitAnswer5 } from "../controllers/submitAnsware5.js";
// import { jobDesc2 } from "../controllers/jobDesc2.js";
// import { updateJobOwner } from "../controllers/jobs/updateJobOwner.js";
// import { scoreMultipleResumeTest } from "../controllers/scoreMultipleResumeTest.js";
// import { setJobCriteria } from "../controllers/jobs/setJobCriteria.js";
// import { submitAssessmentScore } from "../controllers/resumes/submitAssessmentScore.js";
// import { sendChat, uploadChatAttachment } from "../controllers/resumes/sendChat.js";
// import {
//   getChatHistory,
//   getLastQuestion,
//   submitChatAnswer,
// } from "../controllers/resumes/chatController.js";
// import { jobDescTest } from "../controllers/JobDescTest.js";
// import { saveResumes } from "../controllers/resumes/saveResumes.js";
// import { scoreSingleResumeMultipleJobs } from "../controllers/jobDescTest2.js";
// import { getSingleJob } from "../controllers/jobs/getSingleJob.js";
// import { scoreSingleResumeSingleJob } from "../controllers/jobs/uploadSingleResumeForJob.js";
// import { togglePublish } from "../controllers/jobs/publishJob.js";
// import { getClient } from "../controllers/client/getClient.js";
// import {
//   createClient,
//   deleteClient,
//   getClientsByCompany,
//   updateClient,
// } from "../controllers/client/clientsController.js";
// import { addNotes } from "../controllers/resumes/addNotes.js";
// import { scoreSingleResume } from "../controllers/resumes/scoreSingleResume.js";
// import { codeQues } from "../controllers/codeQues.js";
// import { scoreSingleResumeAndSaveCandidate } from "../controllers/jobs/scoreSingleResumeAndSaveCandidate.js";
// import { scoreSingleResume2 } from "../controllers/resumes/scoreSingleResume2.js";
// import { scoreSingleResume3 } from "../controllers/resumes/scoreSingleResume3.js";
// import { updateJobClient } from "../controllers/jobs/updateJobClient.js";
// import { submitVideoResponses } from "../controllers/videoInterview/submitVideoResponses.js";
// import { submitVideoResponses2 } from "../controllers/videoInterview/submitVideoResponse2.js";
// import { submitVideoResponses3 } from "../controllers/videoInterview/submitVideoResponse3.js";
// import { getResumeByEmail } from "../controllers/resumes/getResumeByEmail.js";
// import { deleteUser, updateUser } from "../controllers/users/userController.js";
// import {
//   assignCompanyExess,
//   createSingleCompany,
//   deleteCompany,
//   getAllCompanies,
//   getAllCompanies2,
//   getSingleCompany,
//   updateCompany,
// } from "../controllers/companyData/companyController.js";
// import { getSingleCompanyData } from "../controllers/companyData/getSingleCompanyData.js";
// import { getSingleCompanyUsers } from "../controllers/companyData/getSingleCompanyUsers.js";
// import {
//   addReference,
//   deleteReference,
//   getReferencesByCandidateEmail,
//   sendReferenceEmail,
//   updateReference,
//   updateReferenceById,
// } from "../controllers/references/referenceControler.js";
// import { createSubscriptionFlow,completeSubscriptionFlow, testConnection, createStripeCheckout, verifyStripeSession } from "../controllers/payment/paymentController.js";
// import expectationScreeningController from "../controllers/jobs/expectationControler.js";
// import { createGuestLink, retrieveVerificationResults, webhookCallback } from "../controllers/trustID/trustidController.js";
// import { generateCompanyJD2, updateJobDescription2, updateSingleJob } from "../controllers/jobs/jobController.js";
// const router = Router();

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/");
//   },
//   filename: function (req, file, cb) {
//     cb(null, file.originalname);
//   },
// });

// // const upload2 = multer({
// //   dest: 'uploads/',
// //   limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
// // });

// // const fileFilter = (req, file, cb) => {
// //   // Accept only PDF and DOCX files
// //   if (
// //     file.mimetype === "application/pdf" ||
// //     file.mimetype ===
// //       "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
// //   ) {
// //     cb(null, true);
// //   } else {
// //     cb(new Error("Only PDF and DOCX files are allowed."), false);
// //   }
// // };

// const fileFilter = (req, file, cb) => {
//   console.log("Uploaded file mimetype:", file.mimetype); // Log MIME type

//   // Accept only PDF, DOCX, and video files (MP4, MOV, etc.)
//   const allowedMimeTypes = [
//     "application/pdf",
//     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
//     "video/mp4",
//     "video/mov",
//     "video/webm",
//     "video/avi", // add more video types if needed
//     "video/x-msvideo",
//     "image/jpeg",
//     "image/png",
//     "image/gif",
//   ];

//   if (allowedMimeTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error("Only PDF, DOCX, and video files are allowed."), false);
//   }
// };

// const upload = multer({ storage: storage, fileFilter: fileFilter });

// router.post("/match", upload.array("resumes"), scoreMultipleResume4);
// // router.post("/match2", upload.array("resumes"), jobDescTest);
// router.post("/match2", upload.array("resumes"), scoreMultipleResumeTest);
// // router.post("/match", upload.array("resumes"), scoreMultipleResume3)
// // router.post("/match", upload.array("resumes"), scoreMultipleResume)
// // router.post("/match", upload.array("resumes"), matchResume)
// router.delete("/deleteResume/:id", deleteResume);
// router.delete("/deleteJob/:id", deleteJob);
// router.delete("/deleteResumesByJob/:jobId", deleteResumesByJob);
// router.delete("/deleteMultipleResumes", deleteMultipleResumes);
// // router.get("/getAllResumes", getAllResumes )
// router.get("/companyResumes", getSingleCompanyResumes);
// router.get("/getCompanyJD", getCompanyJD);
// router.get("/companies", getCompanies);
// // router.post("/jobDesc", upload.single("resume"), jobDesc);
// router.post("/jobDesc", upload.single("resume"), scoreSingleResumeMultipleJobs);
// router.post("/jobDesc2", jobDescTest);
// // router.post("/jobDesc2", jobDesc2);

// // router.post("/generateQuestions", upload.single("resume"), generateQues)

// // generate questions all routes start
// // router.post("/generateQues2", generateQuestion2)
// // router.post("/generateTenQuestion", generateTenQuestion)
// // router.post("/generateTenQuestion2", generateTenQuestion2)
// router.get("/generateAllThreeTypeQs", generateAllJobSpecificQs);
// router.get("/generateTenQuestion3", generateTenQuestion3);
// router.get("/generateTenJobSpecificQs", generateTenJobSpecificQs);
// router.get("/generateTenPsychoQs", generateTenPsychoQuestion);
// router.get("/generateTenSituationQs", generateTenSituationalQs);
// router.get("/scores", getQuestionAndAnsResult);
// router.post("/scores2", getAptituteTestResult);
// // generate questions all routes end

// router.post("/submitAnswers", submitAnswer);
// router.post("/submitAnswers2", submitAnswer4);
// router.post("/submitAnswers3", submitAnswer5);
// // router.post("/submitAnswers2", submitAnswer2)
// router.post("/generateJD", generateJD);
// router.post("/generateCompanyJD", generateCompanyJD2);
// // router.post("/generateCompanyJD", generateCompanyJD);
// router.post("/updateJobDescription", updateJobDescription2);
// // router.post("/updateJobDescription", updateJobDescription);
// router.put("/updateSingleJob/:id", updateSingleJob);
// // router.put("/updateSingleJob/:id", updateSingleJobDescription);
// router.put("/updateMultipleResumes", updateMultipleResumes);
// router.put("/updateMultipleResumes2", updateMultipleResumes2);
// router.post("/full-test", psychoTest);
// router.post("/situation-test", situationQues);
// router.post("/personalityTest", personalityTest);
// // router.get("/generateTenQuestion3", generateTenQuestion3)
// router.post("/sendChatLink", sendChatLink);
// router.post("/sendChatLink2", sendChatLink2);
// // router.get("/test", checkAndUpdateResumes)
// router.get("/test", updateTopSkills);
// // router.get("/test", addLinkedInField);
// // router.get("/test", updateCandidateStatus);

// // router.get("/test", updateUsers);
// // router.get("/test", createCompany);

// // all new endpoint
// router.get("/getCompanyData", getCompanyData);
// router.get("/getCompanyJobs", getCompanyJobs);
// router.get("/getCompanyResumes", getCompanyResumes);
// router.get("/resumes/:resumeId", getResumeById);
// router.put("/updateExpectations", updateResumeExpectationsAndSendMail);
// router.put("/updateJobAssineeAndStaus", updateJobAssineeAndStaus);
// // router.put("/updateJobAssineeAndStaus/:id", updateJobAssineeAndStaus);
// router.put("/updateJobOwner", updateJobOwner);
// // router.put("/updateJobOwner/:id", updateJobOwner);
// router.put(
//   "/resumes/:resumeId/expectations-response",
//   updateCandidateExpectationResult
// );
// router.post("/setJobCriteria", setJobCriteria);
// router.post("/submit-assessment", submitAssessmentScore);
// // router.post("/sendChat", sendChat);
// // Routes
// router.post("/sendChat", sendChat)
// router.get("/getChatHistory", getChatHistory)
// router.post("/submitChatAnswer", submitChatAnswer)
// router.post("/uploadChatAttachment", upload.single("file"), uploadChatAttachment)
// // router.post("/submitChatAnswer", submitChatAnswer);
// router.get("/getChatHistory", getChatHistory);
// router.get("/getLastQuestion", getLastQuestion);
// router.post("/saveResumes", saveResumes);
// router.post(
//   "/uploadResume/:id",
//   upload.single("resume"),
//   scoreSingleResumeSingleJob
// );
// router.post(
//   "/uploadResume2/:id",
//   upload.single("resume"),
//   scoreSingleResumeAndSaveCandidate
// );
// router.get("/getJob/:id", getSingleJob);
// router.put("/toggle-publish/:jobId", togglePublish);
// // client routes
// router.get("/clients/:companyId", getClientsByCompany);
// router.post("/clients/:companyId", createClient);
// router.get("/clients/:companyId/:id", getClient);
// router.put("/clients/:companyId/:id", updateClient);
// router.delete("/clients/:companyId/:id", deleteClient);
// // notes added route
// router.post("/add-note/:resumeId", addNotes);
// router.post("/scoreSingleResume", upload.single("resume"), scoreSingleResume);
// router.post("/scoreSingleResume2", upload.single("resume"), scoreSingleResume2);
// // without pdf. just give text info about resume
// router.post("/scoreSingleResume3", scoreSingleResume3);
// router.put("/updateJobClient", updateJobClient);

// // video response
// // router.post("/videointerview", uploadsFile , submitVideoResponses2);
// // router.post("/videointerview", upload.array("videos"), submitVideoResponses);
// router.post("/videointerview", upload.array("videos"), submitVideoResponses3);
// router.get("/resume/:email", getResumeByEmail);

// // users controller router
// router.put("/users/:id", updateUser);
// router.delete("/users/:id", deleteUser);

// // company create delete and update
// router.get("/companies2", getAllCompanies);
// router.post("/companies", createSingleCompany);
// router.put("/companies/:id", updateCompany);
// router.delete("/companies/:id", deleteCompany);
// // router.get("/companies/:id", getSingleCompany);
// // router.post("/companies/assign-exess", assignCompanyExess);
// router.get("/companies", getAllCompanies2)
// router.get("/companies/:companyId", getSingleCompany)
// router.post("/companies/assign-exess", assignCompanyExess)

// // get individul data

// // router.get("/organization/:companyId", getSingleCompanyData);
// router.get("/organization/:companyId", getSingleCompanyUsers);

// // references

// router.get("/references/:candidateEmail", getReferencesByCandidateEmail);
// router.post("/references", addReference);
// router.post("/references/:id", sendReferenceEmail);
// router.put("/references/:id", updateReference);
// router.patch("/references/:id", updateReferenceById);
// router.delete("/references/:id", deleteReference);

// router.post("/codeQues", codeQues);
// // payment
// // router.post('/create-payment', createPaymentOrder);
// // router.post('/create-payment-flow', createPaymentFlow);
// // router.post('/complete-payment-flow', completePaymentFlow);

// // In your Express app
// router.post('/create-subscription-flow', createSubscriptionFlow);
// router.post('/complete-subscription-flow', completeSubscriptionFlow);
// router.get('/testgo', testConnection);
// router.post('/create-stripe-checkout', createStripeCheckout);
// router.post('/verify-stripe-session', verifyStripeSession);

// // expectation code
// // router.get('/jobs', expectationScreeningController.getJobs);
// router.post('/saveExpectationQuestions', expectationScreeningController.saveQuestions);
// // router.get('/candidates/:jobId', expectationScreeningController.getCandidates);
// router.post('/sendExpectationQuestions', expectationScreeningController.sendQuestions);
// router.put(
//   "/resumesExpectation/:resumeId/expectationsResponse",
//   expectationScreeningController.saveCandidateResponse
// );

// // trustId
// router.post("/create-guest-link", createGuestLink);
// router.post("/webhook", webhookCallback);
// router.get("/retrieve-results/:resumeId", retrieveVerificationResults);



// export default router;
