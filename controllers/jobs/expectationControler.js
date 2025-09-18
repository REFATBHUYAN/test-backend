import JobDescription from "../../model/JobDescriptionModel.js";
import Resume from "../../model/resumeModel.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import Notification from "../../model/NotificationModal.js";
import { io } from "../../index.js";

dotenv.config();

const expectationScreeningController = {
  // Get jobs with their expectation questions

  // Save expectation questions for a job
  saveQuestions2: async (req, res) => {
    try {
      const { jobId, questions } = req.body;

      const updatedJob = await JobDescription.findByIdAndUpdate(
        jobId,
        { $set: { expectationQuestions: questions } },
        { new: true }
      );

      if (!updatedJob) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({ message: "Questions saved successfully", job: updatedJob });
    } catch (error) {
      console.error("Error saving expectation questions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  saveQuestions: async (req, res) => {
    try {
      const { jobId, questions } = req.body;

      // Ensure questions is properly formatted before saving
      let formattedQuestions = questions;

      // If questions is a string (which can happen if it was JSON.stringified), parse it
      if (typeof questions === "string") {
        try {
          formattedQuestions = JSON.parse(questions);
        } catch (parseError) {
          console.error("Error parsing questions:", parseError);
          return res.status(400).json({ error: "Invalid question format" });
        }
      }

      const updatedJob = await JobDescription.findByIdAndUpdate(
        jobId,
        { $set: { expectationQuestions: formattedQuestions } },
        { new: true }
      );

      if (!updatedJob) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({ message: "Questions saved successfully", job: updatedJob });
    } catch (error) {
      console.error("Error saving expectation questions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  saveCustomQuestions: async (req, res) => {
    try {
      const { jobId, questions } = req.body;

      // Validate input
      if (!jobId) {
        return res.status(400).json({ error: "Job ID is required" });
      }

      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ error: "Questions must be an array" });
      }

      // Validate and format questions
      const formattedQuestions = questions.map((q, index) => {
        // Ensure each question has required fields
        if (!q.text || typeof q.text !== "string") {
          throw new Error(`Question ${index + 1} must have valid text`);
        }

        const questionObj = {
          text: q.text.trim(),
          type: q.type || "text",
          questionIndex: index,
        };

        // Validate question type
        if (!["text", "option", "custom"].includes(questionObj.type)) {
          throw new Error(
            `Question ${index + 1} has invalid type: ${questionObj.type}`
          );
        }

        // Handle custom questions with options
        if (questionObj.type === "custom") {
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            throw new Error(
              `Question ${
                index + 1
              } (multiple choice) must have at least 2 options`
            );
          }

          // Filter out empty options
          const validOptions = q.options.filter(
            (opt) => opt && opt.trim() !== ""
          );
          if (validOptions.length < 2) {
            throw new Error(
              `Question ${index + 1} must have at least 2 non-empty options`
            );
          }

          questionObj.options = validOptions;

          // Validate disqualifying options
          if (q.disqualifyingOptions && Array.isArray(q.disqualifyingOptions)) {
            const validDisqualifyingOptions = q.disqualifyingOptions.filter(
              (optIndex) =>
                typeof optIndex === "number" &&
                optIndex >= 0 &&
                optIndex < validOptions.length
            );
            questionObj.disqualifyingOptions = validDisqualifyingOptions;
          } else {
            questionObj.disqualifyingOptions = [];
          }
        }

        return questionObj;
      });

      // Update the job with formatted questions
      const updatedJob = await JobDescription.findByIdAndUpdate(
        jobId,
        {
          $set: {
            customQuestions: formattedQuestions,
          },
          $push: {
            modifications: {
              user_name: req.user?.name || "System",
              user_email: req.user?.email || "system@company.com",
              date: new Date(),
              action: "Updated custom questions",
            },
          },
        },
        { new: true, runValidators: true }
      );

      if (!updatedJob) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({
        message: "Custom questions saved successfully",
        job: updatedJob,
        questionsCount: formattedQuestions.length,
      });
    } catch (error) {
      console.error("Error saving custom questions:", error);

      // Send specific error message if it's a validation error
      if (error.message.includes("Question")) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Internal server error" });
    }
  },
  saveCandidateResponse2: async (req, res) => {
    try {
      const { responses, userId } = req.body;

      const resume = await Resume.findById(req.params.resumeId);
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }

      // Update the resume with the new responses
      resume.expectations.candidateQuestionResponse = {
        ...responses,
        created_at: new Date(),
      };
      resume.candidateStatus = "Expectations Screened";

      await resume.save();

      const newNotification = new Notification({
        message: `${resume?.candidateName} Expectation Screened`,

        recipientId: userId,

        resumeId: resume._id,
      });

      await newNotification.save();

      // Emit the new notification event to the specific recipient
      io.emit("newNotification", newNotification);

      return res.json({ message: "Responses saved successfully" });
    } catch (error) {
      console.error("Error saving expectation responses:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  saveCandidateResponse3: async (req, res) => {
    try {
      const { responses, userId } = req.body;
      const { resumeId } = req.params;

      const resume = await Resume.findById(resumeId);
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" });
      }

      // Update the resume with the new responses
      if (!resume.expectations) {
        resume.expectations = {};
      }

      resume.expectations.candidateQuestionResponse = {
        ...responses,
        created_at: new Date(),
      };

      resume.candidateStatus = "Expectations Screened";

      // Add to job status if not already present
      if (!resume.jobStatus.includes("Expectations Screened")) {
        resume.jobStatus.push("Expectations Screened");
      }

      await resume.save();

      // Create notification
      const newNotification = new Notification({
        message: `${resume?.candidateName} Expectation Screened`,
        recipientId: userId,
        resumeId: resume._id,
      });

      await newNotification.save();

      // Emit notification if socket is available
      if (typeof io !== "undefined") {
        // Assuming io is defined elsewhere, possibly in app.js or a similar setup file
        // Example: const io = require('../socket').getIO();
        io.emit("newNotification", newNotification);
      }

      return res.json({
        message: "Responses saved successfully",
        candidateStatus: resume.candidateStatus,
      });
    } catch (error) {
      console.error("Error saving expectation responses:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  saveCandidateResponse: async (req, res) => {
    try {
      const { responses, userId } = req.body;
      const { resumeId } = req.params;

      // Log the received resumeId for debugging
      console.log("Received resumeId:", resumeId);

      // Validate resumeId format
      // if (!isValidObjectId(resumeId)) {
      //   return res.status(400).json({ error: "Invalid resumeId format" });
      // }

      // Find the resume
      const resume = await Resume.findById(resumeId);
      if (!resume) {
        console.log(`No resume found for ID: ${resumeId}`);
        return res.status(404).json({ error: "Resume not found" });
      }

      // Initialize expectations if not present
      if (!resume.expectations) {
        resume.expectations = {};
      }

      // Update candidate responses
      resume.expectations.candidateQuestionResponse = {
        ...responses,
        created_at: new Date(),
      };

      // Update candidate status
      resume.candidateStatus = "Expectations Screened";

      // Add to job status if not already present
      if (!resume.jobStatus.includes("Expectations Screened")) {
        resume.jobStatus.push("Expectations Screened");
      }

      // Save the updated resume
      await resume.save();

      // Create notification
      const newNotification = new Notification({
        message: `${resume?.candidateName || "Candidate"} Expectation Screened`,
        recipientId: userId,
        resumeId: resume._id,
      });

      await newNotification.save();

      // Emit notification if socket is available
      if (typeof io !== "undefined") {
        io.emit("newNotification", newNotification);
      }

      return res.json({
        message: "Responses saved successfully",
        candidateStatus: resume.candidateStatus,
      });
    } catch (error) {
      console.error("Error saving expectation responses:", error);
      return res
        .status(500)
        .json({ error: "Internal server error", details: error.message });
    }
  },

  // Send expectation questions to selected candidates
  sendQuestions2: async (req, res) => {
    try {
      const { jobId, candidateIds, company, questions, userId } = req.body;

      // Here you would implement the logic to send emails to candidates
      // This is a placeholder for the email sending logic
      console.log(
        `Sending questions to candidates: ${candidateIds.join(", ")}`
      );

      // Update candidate statuses
      await Resume.updateMany(
        { _id: { $in: candidateIds } },
        {
          $set: {
            "expectations.expectationQuestions": questions,
            candidateStatus: "Expectations Screening Sent",
          },
        }
      );

      // Fetch the updated resumes to get candidate emails
      const updatedResumes = await Resume.find({ _id: { $in: candidateIds } });
      // Configure your email service
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Iterate over updated resumes to send an email to each candidate
      const sendEmails = updatedResumes.map(async (resume) => {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: resume.email, // Assuming the resume document has an 'email' field
          subject: `Invitation to ${company} Expectations Screening - by Bloomix`,
          html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
                  <h2 style="text-align: center; color: #4CAF50;">Invitation to Q&A Session</h2>
                  <p>Dear Candidate,</p>
                  <p>We are pleased to invite you to participate in our Expectations Screening session. This session is designed to help us get to know your better and to evaluate you fit for our team.</p>
                  <p><strong>Instructions:</strong></p>
                  <ol>
                    <li>Click the link below to start the Expectations Screening session.</li>
                    <li>Answer the questions with YES/NO</li>
                    <li>Not more than 5 questions.</li>
                  </ol>
                  <p style="text-align: center;">
                    <a href="${process.env.FRONTEND_URL}/start-session?resumeId=${resume._id}&userId=${userId}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Q&A Session</a>
                  </p>
                  <p>If you have any questions, feel free to reply to this email.</p>
                  <p>Kind regards,</p>
                  <p>Bloomix</p>
                  <p>on behalf of ${company}</p>
                </div>
              `,
        };

        return transporter.sendMail(mailOptions);
      });

      // Wait for all emails to be sent
      await Promise.all(sendEmails);

      res
        .status(200)
        .json({ message: "Expectations emails sent successfully!" });
    } catch (error) {
      console.error("Error sending expectation questions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
  sendQuestions: async (req, res) => {
    try {
      const { jobId, candidateIds, company, questions, userId } = req.body;

      // Validate required fields
      if (!candidateIds || !questions || !company || !userId) {
        return res.status(400).json({
          message:
            "Candidate IDs, questions, company, and user ID are required",
        });
      }

      console.log(
        `Sending questions to candidates: ${candidateIds.join(", ")}`
      );

      // Update all resumes in one operation to mark them as "Expectations Screening Sent"
      await Resume.updateMany(
        { _id: { $in: candidateIds } },
        {
          $set: {
            "expectations.expectationQuestions": questions,
            candidateStatus: "Expectations Screening Sent",
          },
        }
      );

      // Fetch the updated resumes to get candidate emails
      const updatedResumes = await Resume.find({ _id: { $in: candidateIds } });

      // Configure your email service
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Arrays to track successful and failed email sends
      const successEmails = [];
      const failedEmails = [];

      // Iterate over updated resumes to send an email to each candidate
      for (const resume of updatedResumes) {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: resume.email, // Assuming the resume document has an 'email' field
          subject: `Invitation to ${company} Expectations Screening - by Bloomix`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
              <h2 style="text-align: center; color: #4CAF50;">Invitation to Q&A Session</h2>
              <p>Dear Candidate,</p>
              <p>We are pleased to invite you to participate in our Expectations Screening session. This session is designed to help us get to know you better and evaluate your fit for our team.</p>
              <p><strong>Instructions:</strong></p>
              <ol>
                <li>Click the link below to start the Expectations Screening session.</li>
                <li>Answer the questions with YES/NO.</li>
                <li>Not more than 5 questions.</li>
              </ol>
              <p style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/start-session?resumeId=${resume._id}&userId=${userId}&jobId=${jobId}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Q&A Session</a>
              </p>
              <p>If you have any questions, feel free to reply to this email.</p>
              <p>Kind regards,</p>
              <p>Bloomix</p>
              <p>on behalf of ${company}</p>
            </div>
          `,
        };

        try {
          // Send the email
          await transporter.sendMail(mailOptions);

          // If successful, add to success list
          successEmails.push(resume.email);

          // Update the status of this specific resume to "Expectations Screening Completed"
          await Resume.updateOne(
            { _id: resume._id },
            { $set: { candidateStatus: "Expectations Screening Completed" } }
          );
        } catch (emailError) {
          // Log the error for this specific email
          console.error(`Failed to send email to ${resume.email}:`, emailError);

          // Add to failed list
          failedEmails.push(resume.email);
        }
      }

      // Return a response to the frontend
      res.status(200).json({
        message: "Expectations screening emails sending process completed.",
        successEmails,
        failedEmails,
      });
    } catch (error) {
      console.error("Error sending expectation questions:", error);
      res.status(500).json({ message: "Internal server error", error });
    }
  },
};

export default expectationScreeningController;
