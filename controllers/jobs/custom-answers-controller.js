// Enhanced controller for handling custom question answers with LangChain OpenAI evaluation
import { OpenAI } from "@langchain/openai"
import dotenv from "dotenv"
import JobDescription from "../../model/JobDescriptionModel.js"
import Resume from "../../model/resumeModel.js"
import Notification from "../../model/NotificationModal.js"
import nodemailer from "nodemailer"
import { io } from "../../index.js"

dotenv.config()

const customAnswersController = {
  // Get custom questions for a job
  getCustomQuestions: async (req, res) => {
    try {
      const { jobId } = req.query

      if (!jobId) {
        return res.status(400).json({ error: "Job ID is required" })
      }

      const job = await JobDescription.findById(jobId).select("customQuestions")

      if (!job) {
        return res.status(404).json({ error: "Job not found" })
      }

      res.json({
        questions: job.customQuestions || [],
        questionsCount: job.customQuestions?.length || 0,
      })
    } catch (error) {
      console.error("Error getting custom questions:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },

  saveCustomQuestions: async (req, res) => {
    try {
      const { jobId, questions } = req.body

      // Validate input
      if (!jobId) {
        return res.status(400).json({ error: "Job ID is required" })
      }

      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ error: "Questions must be an array" })
      }

      // Validate and format questions
      const formattedQuestions = questions.map((q, index) => {
        // Ensure each question has required fields
        if (!q.text || typeof q.text !== "string") {
          throw new Error(`Question ${index + 1} must have valid text`)
        }

        const questionObj = {
          text: q.text.trim(),
          type: q.type || "text",
          questionIndex: index,
        }

        // Validate question type
        if (!["text", "option", "custom"].includes(questionObj.type)) {
          throw new Error(`Question ${index + 1} has invalid type: ${questionObj.type}`)
        }

        // Handle custom questions with options
        if (questionObj.type === "custom") {
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            throw new Error(`Question ${index + 1} (multiple choice) must have at least 2 options`)
          }

          // Filter out empty options
          const validOptions = q.options.filter((opt) => opt && opt.trim() !== "")
          if (validOptions.length < 2) {
            throw new Error(`Question ${index + 1} must have at least 2 non-empty options`)
          }

          questionObj.options = validOptions
        }

        return questionObj
      })

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
        { new: true, runValidators: true },
      )

      if (!updatedJob) {
        return res.status(404).json({ error: "Job not found" })
      }

      res.json({
        message: "Custom questions saved successfully",
        job: updatedJob,
        questionsCount: formattedQuestions.length,
      })
    } catch (error) {
      console.error("Error saving custom questions:", error)

      // Send specific error message if it's a validation error
      if (error.message.includes("Question")) {
        return res.status(400).json({ error: error.message })
      }

      res.status(500).json({ error: "Internal server error" })
    }
  },

  // Submit custom question answers with LangChain OpenAI evaluation
  submitCustomAnswers: async (req, res) => {
    const { questions, answers, resumeId, jobId, email, userId } = req.body

    console.log("Custom answers:", answers)
    console.log("Custom questions:", questions)
    console.log("resumeId:", resumeId)
    console.log("jobId:", jobId)
    console.log("email:", email)

    if (!answers || !questions || !resumeId || !jobId) {
      return res.status(400).json({
        message: "Questions, answers, resumeId, and jobId are required.",
      })
    }

    try {
      // Find the resume
      const resume = await Resume.findById(resumeId)
      if (!resume) {
        return res.status(404).json({ error: "Resume not found" })
      }

      // Find the job
      const job = await JobDescription.findById(jobId)
      if (!job) {
        return res.status(404).json({ error: "Job not found" })
      }

      // Check if custom question results already exist for this resume and job
      if (resume.customQuestionResults && resume.customQuestionResults.completedAt) {
        return res.status(409).json({
          message: "Custom questions have already been completed for this candidate.",
        })
      }

      // Create the LangChain OpenAI model instance
      const model = new OpenAI({
        modelName: "gpt-4.1",
        temperature: 0.2,
      })

      // Prepare questions and answers for evaluation
      const formattedQA = questions.map((question, index) => {
        const answer = answers[index]
        const questionText = typeof question === "object" ? question.text : question
        let answerText = ""

        if (typeof answer === "object") {
          // Handle structured answer objects
          if (answer.questionType === "option") {
            answerText = answer.answer === true ? "Yes" : "No"
          } else if (answer.questionType === "custom" && answer.options && typeof answer.selectedOption === "number") {
            answerText = answer.options[answer.selectedOption] || answer.answer
          } else {
            answerText = answer.answer || answer
          }
        } else {
          answerText = answer
        }

        return {
          questionText,
          answerText,
          questionType: question.type || "text",
        }
      })

      // Create evaluation prompt with more specific formatting instructions
      const prompt = `You are an expert HR interviewer evaluating a candidate's responses to custom interview questions for the position: ${job.context}.

Candidate: ${resume.candidateName}
Position: ${job.context}
Company: ${job.company_name || "Not specified"}

Questions and Answers:
${formattedQA
  .map((qa, i) => `Q${i + 1} (${qa.questionType}): ${qa.questionText}\nA${i + 1}: ${qa.answerText}`)
  .join("\n\n")}

Please evaluate each answer considering:
1. Relevance to the question
2. Quality and depth of response
3. Alignment with job requirements
4. Communication skills demonstrated
5. Overall suitability for the role

IMPORTANT: Provide your evaluation in EXACTLY this format (one line per question):
Q1: 8 - Excellent understanding of SQA goals, comprehensive answer
Q2: 7 - Good knowledge of SQA activities, could be more specific
Q3: 9 - Correct answer, shows understanding of SQA processes
Q4: 6 - Partially correct, shows some knowledge gaps

OVERALL: 7 - Strong technical knowledge with room for improvement in specific areas`

      console.log("Sending prompt to AI:", prompt)

      const response = await model.call(prompt)
      console.log("AI Response received:", response)

      // Improved parsing logic
      const lines = response.split("\n").filter((line) => line.trim() !== "")
      const individualScores = []
      let overallAssessment = null

      // Process each line to extract scores and feedback
      for (const line of lines) {
        console.log("Processing line:", line)

        // More flexible regex patterns
        const questionMatch = line.match(/Q(\d+):\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(.+)/i)
        const overallMatch = line.match(/OVERALL:\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(.+)/i)

        if (questionMatch) {
          const questionIndex = Number.parseInt(questionMatch[1], 10) - 1
          const score = Math.min(10, Math.max(0, Number.parseFloat(questionMatch[2]))) // Ensure score is between 0-10
          const feedback = questionMatch[3].trim()

          console.log(`Parsed Q${questionIndex + 1}: Score=${score}, Feedback=${feedback}`)

          if (questionIndex >= 0 && questionIndex < formattedQA.length) {
            individualScores.push({
              questionIndex,
              questionText: formattedQA[questionIndex].questionText,
              answerText: formattedQA[questionIndex].answerText,
              questionType: formattedQA[questionIndex].questionType,
              score,
              feedback,
            })
          }
        } else if (overallMatch) {
          const overallScore = Math.min(10, Math.max(0, Number.parseFloat(overallMatch[1])))
          const overallFeedback = overallMatch[2].trim()
          overallAssessment = {
            score: overallScore,
            feedback: overallFeedback,
          }
          console.log(`Parsed Overall: Score=${overallScore}, Feedback=${overallFeedback}`)
        }
      }

      console.log("Individual scores parsed:", individualScores)
      console.log("Overall assessment:", overallAssessment)

      // Fallback: If no scores were parsed, create default scores
      if (individualScores.length === 0) {
        console.log("No scores parsed, creating fallback scores")

        // Create a simpler evaluation request
        const fallbackPrompt = `Rate each answer from 1-10 and provide brief feedback:

${formattedQA.map((qa, i) => `${i + 1}. ${qa.questionText}\nAnswer: ${qa.answerText}`).join("\n\n")}

Respond with just: Score1: X, Score2: Y, Score3: Z, etc.`

        try {
          const fallbackResponse = await model.call(fallbackPrompt)
          console.log("Fallback response:", fallbackResponse)

          // Parse simple score format
          const scoreMatches = fallbackResponse.match(/Score\d+:\s*(\d+)/g)
          if (scoreMatches) {
            scoreMatches.forEach((match, index) => {
              const score = Number.parseInt(match.match(/(\d+)/)[1], 10)
              if (index < formattedQA.length) {
                individualScores.push({
                  questionIndex: index,
                  questionText: formattedQA[index].questionText,
                  answerText: formattedQA[index].answerText,
                  questionType: formattedQA[index].questionType,
                  score: Math.min(10, Math.max(1, score)),
                  feedback: "AI evaluation completed",
                })
              }
            })
          }
        } catch (fallbackError) {
          console.error("Fallback evaluation failed:", fallbackError)

          // Last resort: Create basic scores based on answer length and content
          formattedQA.forEach((qa, index) => {
            let score = 5 // Default middle score

            // Simple heuristic scoring
            if (qa.answerText && qa.answerText.length > 10) {
              score = qa.answerText.length > 50 ? 7 : 6
            }

            individualScores.push({
              questionIndex: index,
              questionText: qa.questionText,
              answerText: qa.answerText,
              questionType: qa.questionType,
              score,
              feedback: "Basic evaluation - answer provided",
            })
          })
        }
      }

      // Calculate scores
      const totalScore = individualScores.reduce((sum, item) => sum + item.score, 0)
      const averageScore = individualScores.length > 0 ? totalScore / individualScores.length : 0
      const percentageScore = (averageScore / 10) * 100

      // Determine recommendation based on score only (no disqualification)
      let recommendation = "Not Recommended"
      if (percentageScore >= 80) recommendation = "Highly Recommended"
      else if (percentageScore >= 70) recommendation = "Recommended"
      else if (percentageScore >= 60) recommendation = "Consider"

      // Prepare custom question results (removed disqualification logic)
      const customQuestionResults = {
        questions: questions,
        answers: answers,
        answerMetadata: answers.map((answer, index) => ({
          questionIndex: index,
          questionText: typeof questions[index] === "object" ? questions[index].text : questions[index],
          questionType: typeof questions[index] === "object" ? questions[index].type : "text",
          candidateAnswer: typeof answer === "object" ? answer.answer : answer,
          selectedOption: typeof answer === "object" ? answer.selectedOption : undefined,
          options: typeof questions[index] === "object" ? questions[index].options || [] : [],
          aiScore: individualScores[index]?.score || 0,
          aiAnalysis: individualScores[index]?.feedback || "",
        })),
        aiEvaluation: {
          individualScores: individualScores,
          overallScore: overallAssessment?.score || averageScore,
          averageScore: averageScore,
          percentageScore: percentageScore,
          recommendation: recommendation,
          overallFeedback: overallAssessment?.feedback || "Evaluation completed",
          evaluatedAt: new Date(),
        },
        disqualifyingAnswers: [], // Always empty since we're not disqualifying
        isDisqualified: false, // Always false since we're not disqualifying
        completedAt: new Date(),
      }

      // Update resume with custom question results (no disqualification status)
      const candidateStatus = "Custom Test Completed"

      const updateData = {
        $set: {
          customQuestionResults: customQuestionResults,
          candidateStatus: candidateStatus,
        },
        $push: {
          jobStatus: candidateStatus,
        },
      }

      await Resume.findByIdAndUpdate(resumeId, updateData, { new: true })

      // Send notification email
      if (resume && job) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        })

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: `Custom Test Submission for ${job.context}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
              <h2 style="text-align: center; color: #4CAF50;">Custom Test Submission Received</h2>
              <p>Dear Hiring Manager,</p>
              <p>We have received a custom test submission from a candidate for the ${job.context} position.</p>
              <p><strong>Submission Details:</strong></p>
              <ul>
                <li><strong>Job Title:</strong> ${job.context}</li>
                <li><strong>Candidate Name:</strong> ${resume.candidateName}</li>
                <li><strong>Questions Answered:</strong> ${questions.length}</li>
                <li><strong>Average Score:</strong> ${averageScore.toFixed(2)}/10</li>
                <li><strong>Percentage Score:</strong> ${percentageScore.toFixed(2)}%</li>
                <li><strong>Recommendation:</strong> ${recommendation}</li>
                <li><strong>Status:</strong> <span style="color: green;">Completed</span></li>
              </ul>
              <p>Please review the candidate's responses in the system for detailed feedback and next steps.</p>
              <p>Best regards,</p>
              <p>Bloomix Team</p>
            </div>
          `,
        }

        try {
          await transporter.sendMail(mailOptions)
          console.log("Custom test notification email sent successfully!")
        } catch (error) {
          console.error("Error sending email:", error)
        }
      }

      // Create notification
      const notificationMessage = `${
        resume.candidateName
      } completed custom test - Score: ${percentageScore.toFixed(1)}%`

      const newNotification = new Notification({
        message: notificationMessage,
        recipientId: userId,
        resumeId: resume._id,
      })

      await newNotification.save()

      // Emit notification
      if (typeof io !== "undefined") {
        io.emit("newNotification", newNotification)
      }

      res.status(200).json({
        message: "Custom answers submitted and evaluated successfully!",
        aiEvaluation: customQuestionResults.aiEvaluation,
        disqualifyingAnswers: [], // Always empty
        isDisqualified: false, // Always false
        averageScore: averageScore,
        percentageScore: percentageScore,
        recommendation: recommendation,
      })
    } catch (error) {
      console.error("Error submitting custom answers:", error)
      res.status(500).json({ error: "Internal server error", details: error.message })
    }
  },
}

export default customAnswersController



// // Enhanced controller for handling custom question answers with LangChain OpenAI evaluation
// import { OpenAI } from "@langchain/openai";
// import dotenv from "dotenv";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import Resume from "../../model/resumeModel.js";
// import Notification from "../../model/NotificationModal.js";
// import nodemailer from "nodemailer";
// import { io } from "../../index.js";

// dotenv.config();

// const customAnswersController = {
//   // Get custom questions for a job
//   getCustomQuestions: async (req, res) => {
//     try {
//       const { jobId } = req.query;

//       if (!jobId) {
//         return res.status(400).json({ error: "Job ID is required" });
//       }

//       const job = await JobDescription.findById(jobId).select(
//         "customQuestions"
//       );

//       if (!job) {
//         return res.status(404).json({ error: "Job not found" });
//       }

//       res.json({
//         questions: job.customQuestions || [],
//         questionsCount: job.customQuestions?.length || 0,
//       });
//     } catch (error) {
//       console.error("Error getting custom questions:", error);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   },

//   saveCustomQuestions: async (req, res) => {
//     try {
//       const { jobId, questions } = req.body;

//       // Validate input
//       if (!jobId) {
//         return res.status(400).json({ error: "Job ID is required" });
//       }

//       if (!questions || !Array.isArray(questions)) {
//         return res.status(400).json({ error: "Questions must be an array" });
//       }

//       // Validate and format questions
//       const formattedQuestions = questions.map((q, index) => {
//         // Ensure each question has required fields
//         if (!q.text || typeof q.text !== "string") {
//           throw new Error(`Question ${index + 1} must have valid text`);
//         }

//         const questionObj = {
//           text: q.text.trim(),
//           type: q.type || "text",
//           questionIndex: index,
//         };

//         // Validate question type
//         if (!["text", "option", "custom"].includes(questionObj.type)) {
//           throw new Error(
//             `Question ${index + 1} has invalid type: ${questionObj.type}`
//           );
//         }

//         // Handle custom questions with options
//         if (questionObj.type === "custom") {
//           if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
//             throw new Error(
//               `Question ${
//                 index + 1
//               } (multiple choice) must have at least 2 options`
//             );
//           }

//           // Filter out empty options
//           const validOptions = q.options.filter(
//             (opt) => opt && opt.trim() !== ""
//           );
//           if (validOptions.length < 2) {
//             throw new Error(
//               `Question ${index + 1} must have at least 2 non-empty options`
//             );
//           }

//           questionObj.options = validOptions;

//           // Validate disqualifying options
//           if (q.disqualifyingOptions && Array.isArray(q.disqualifyingOptions)) {
//             const validDisqualifyingOptions = q.disqualifyingOptions.filter(
//               (optIndex) =>
//                 typeof optIndex === "number" &&
//                 optIndex >= 0 &&
//                 optIndex < validOptions.length
//             );
//             questionObj.disqualifyingOptions = validDisqualifyingOptions;
//           } else {
//             questionObj.disqualifyingOptions = [];
//           }
//         }

//         return questionObj;
//       });

//       // Update the job with formatted questions
//       const updatedJob = await JobDescription.findByIdAndUpdate(
//         jobId,
//         {
//           $set: {
//             customQuestions: formattedQuestions,
//           },
//           $push: {
//             modifications: {
//               user_name: req.user?.name || "System",
//               user_email: req.user?.email || "system@company.com",
//               date: new Date(),
//               action: "Updated custom questions",
//             },
//           },
//         },
//         { new: true, runValidators: true }
//       );

//       if (!updatedJob) {
//         return res.status(404).json({ error: "Job not found" });
//       }

//       res.json({
//         message: "Custom questions saved successfully",
//         job: updatedJob,
//         questionsCount: formattedQuestions.length,
//       });
//     } catch (error) {
//       console.error("Error saving custom questions:", error);

//       // Send specific error message if it's a validation error
//       if (error.message.includes("Question")) {
//         return res.status(400).json({ error: error.message });
//       }

//       res.status(500).json({ error: "Internal server error" });
//     }
//   },

//   // Submit custom question answers with LangChain OpenAI evaluation
//   submitCustomAnswers: async (req, res) => {
//     const { questions, answers, resumeId, jobId, email, userId } = req.body;

//     console.log("Custom answers:", answers);
//     console.log("Custom questions:", questions);
//     console.log("resumeId:", resumeId);
//     console.log("jobId:", jobId);
//     console.log("email:", email);

//     if (!answers || !questions || !resumeId || !jobId) {
//       return res.status(400).json({
//         message: "Questions, answers, resumeId, and jobId are required.",
//       });
//     }

//     try {
//       // Find the resume
//       const resume = await Resume.findById(resumeId);
//       if (!resume) {
//         return res.status(404).json({ error: "Resume not found" });
//       }

//       // Find the job
//       const job = await JobDescription.findById(jobId);
//       if (!job) {
//         return res.status(404).json({ error: "Job not found" });
//       }

//       // Check if custom question results already exist for this resume and job
//       if (
//         resume.customQuestionResults &&
//         resume.customQuestionResults.completedAt
//       ) {
//         return res.status(409).json({
//           message:
//             "Custom questions have already been completed for this candidate.",
//         });
//       }

//       // Create the LangChain OpenAI model instance
//       const model = new OpenAI({
//         modelName: "gpt-4.1",
//         temperature: 0.2,
//       });

//       // Prepare questions and answers for evaluation
//       const formattedQA = questions.map((question, index) => {
//         const answer = answers[index];
//         const questionText =
//           typeof question === "object" ? question.text : question;
//         let answerText = "";

//         if (typeof answer === "object") {
//           // Handle structured answer objects
//           if (answer.questionType === "option") {
//             answerText = answer.answer === true ? "Yes" : "No";
//           } else if (
//             answer.questionType === "custom" &&
//             answer.options &&
//             typeof answer.selectedOption === "number"
//           ) {
//             answerText = answer.options[answer.selectedOption] || answer.answer;
//           } else {
//             answerText = answer.answer || answer;
//           }
//         } else {
//           answerText = answer;
//         }

//         return {
//           questionText,
//           answerText,
//           questionType: question.type || "text",
//         };
//       });

//       // Create evaluation prompt
//       const prompt = `You are an expert HR interviewer evaluating a candidate's responses to custom interview questions for the position: ${
//         job.context
//       }.

// Candidate: ${resume.candidateName}
// Position: ${job.context}
// Company: ${job.company_name || "Not specified"}

// Questions and Answers:
// ${formattedQA
//   .map(
//     (qa, i) =>
//       `Q${i + 1} (${qa.questionType}): ${qa.questionText}\nA${i + 1}: ${
//         qa.answerText
//       }`
//   )
//   .join("\n\n")}

// Please evaluate each answer considering:
// 1. Relevance to the question
// 2. Quality and depth of response
// 3. Alignment with job requirements
// 4. Communication skills demonstrated
// 5. Overall suitability for the role

// Provide evaluation in the following format:
// Q1: [score out of 10] - [detailed feedback]
// Q2: [score out of 10] - [detailed feedback]
// ...

// Then provide an overall assessment:
// OVERALL: [overall score out of 10] - [summary of candidate's performance, key strengths, areas for improvement, and hiring recommendation]`;

//       const response = await model.call(prompt);

//       // Parse the AI response
//       const lines = response.split("\n").filter((line) => line.trim() !== "");
//       const individualScores = [];
//       let overallAssessment = null;

//       // Process each line to extract scores and feedback
//       lines.forEach((line, index) => {
//         const questionMatch = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
//         const overallMatch = line.match(/OVERALL:\s*(\d+)\s*-\s*(.*)/);

//         if (questionMatch) {
//           const questionIndex = Number.parseInt(questionMatch[1], 10) - 1;
//           const score = Number.parseInt(questionMatch[2], 10);
//           const feedback = questionMatch[3].trim();

//           if (questionIndex < formattedQA.length) {
//             individualScores.push({
//               questionIndex,
//               questionText: formattedQA[questionIndex].questionText,
//               answerText: formattedQA[questionIndex].answerText,
//               questionType: formattedQA[questionIndex].questionType,
//               score,
//               feedback,
//             });
//           }
//         } else if (overallMatch) {
//           const overallScore = Number.parseInt(overallMatch[1], 10);
//           const overallFeedback = overallMatch[2].trim();
//           overallAssessment = {
//             score: overallScore,
//             feedback: overallFeedback,
//           };
//         }
//       });

//       // Calculate scores
//       const totalScore = individualScores.reduce(
//         (sum, item) => sum + item.score,
//         0
//       );
//       const averageScore =
//         individualScores.length > 0 ? totalScore / individualScores.length : 0;
//       const percentageScore = (averageScore / 10) * 100;

//       // Check for disqualifying answers
//       const disqualifyingAnswers = checkDisqualifyingAnswers(
//         answers,
//         questions
//       );
//       const isDisqualified = disqualifyingAnswers.length > 0;

//       // Determine recommendation based on score and disqualification
//       let recommendation = "Not Recommended";
//       if (!isDisqualified) {
//         if (percentageScore >= 80) recommendation = "Highly Recommended";
//         else if (percentageScore >= 70) recommendation = "Recommended";
//         else if (percentageScore >= 60) recommendation = "Consider";
//       }

//       // Prepare custom question results
//       const customQuestionResults = {
//         questions: questions,
//         answers: answers,
//         answerMetadata: answers.map((answer, index) => ({
//           questionIndex: index,
//           questionText:
//             typeof questions[index] === "object"
//               ? questions[index].text
//               : questions[index],
//           questionType:
//             typeof questions[index] === "object"
//               ? questions[index].type
//               : "text",
//           candidateAnswer: typeof answer === "object" ? answer.answer : answer,
//           selectedOption:
//             typeof answer === "object" ? answer.selectedOption : undefined,
//           options:
//             typeof questions[index] === "object"
//               ? questions[index].options || []
//               : [],
//           aiScore: individualScores[index]?.score || 0,
//           aiAnalysis: individualScores[index]?.feedback || "",
//         })),
//         aiEvaluation: {
//           individualScores: individualScores,
//           overallScore: overallAssessment?.score || averageScore,
//           averageScore: averageScore,
//           percentageScore: percentageScore,
//           recommendation: recommendation,
//           overallFeedback:
//             overallAssessment?.feedback || "Evaluation completed",
//           evaluatedAt: new Date(),
//         },
//         disqualifyingAnswers: disqualifyingAnswers,
//         isDisqualified: isDisqualified,
//         completedAt: new Date(),
//       };

//       // Update resume with custom question results
//       const candidateStatus = isDisqualified
//         ? "Disqualified - Custom Test"
//         : "Custom Test Completed";

//       const updateData = {
//         $set: {
//           customQuestionResults: customQuestionResults,
//           candidateStatus: candidateStatus,
//         },
//         $push: {
//           jobStatus: candidateStatus,
//         },
//       };

//       await Resume.findByIdAndUpdate(resumeId, updateData, { new: true });

//       // Send notification email
//       if (resume && job) {
//         const transporter = nodemailer.createTransport({
//           service: "gmail",
//           auth: {
//             user: process.env.EMAIL_USER,
//             pass: process.env.EMAIL_PASS,
//           },
//         });

//         const mailOptions = {
//           from: process.env.EMAIL_USER,
//           to: email,
//           subject: `Custom Test Submission for ${job.context}`,
//           html: `
//             <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//               <h2 style="text-align: center; color: #4CAF50;">Custom Test Submission Received</h2>
//               <p>Dear Hiring Manager,</p>
//               <p>We have received a custom test submission from a candidate for the ${
//                 job.context
//               } position.</p>
//               <p><strong>Submission Details:</strong></p>
//               <ul>
//                 <li><strong>Job Title:</strong> ${job.context}</li>
//                 <li><strong>Candidate Name:</strong> ${
//                   resume.candidateName
//                 }</li>
//                 <li><strong>Questions Answered:</strong> ${
//                   questions.length
//                 }</li>
//                 <li><strong>Average Score:</strong> ${averageScore.toFixed(
//                   2
//                 )}/10</li>
//                 <li><strong>Percentage Score:</strong> ${percentageScore.toFixed(
//                   2
//                 )}%</li>
//                 <li><strong>Recommendation:</strong> ${recommendation}</li>
//                 ${
//                   isDisqualified
//                     ? `<li><strong>Status:</strong> <span style="color: red;">Disqualified</span></li>`
//                     : ""
//                 }
//               </ul>
//               ${
//                 disqualifyingAnswers.length > 0
//                   ? `
//                 <p><strong>Disqualifying Answers:</strong></p>
//                 <ul>
//                   ${disqualifyingAnswers
//                     .map(
//                       (da) =>
//                         `<li>${da.questionText}: ${da.answer} (${da.reason})</li>`
//                     )
//                     .join("")}
//                 </ul>
//               `
//                   : ""
//               }
//               <p>Please review the candidate's responses in the system for detailed feedback and next steps.</p>
//               <p>Best regards,</p>
//               <p>Bloomix Team</p>
//             </div>
//           `,
//         };

//         try {
//           await transporter.sendMail(mailOptions);
//           console.log("Custom test notification email sent successfully!");
//         } catch (error) {
//           console.error("Error sending email:", error);
//         }
//       }

//       // Create notification
//       const notificationMessage = isDisqualified
//         ? `${resume.candidateName} completed custom test but was disqualified`
//         : `${
//             resume.candidateName
//           } completed custom test - Score: ${percentageScore.toFixed(1)}%`;

//       const newNotification = new Notification({
//         message: notificationMessage,
//         recipientId: userId,
//         resumeId: resume._id,
//       });

//       await newNotification.save();

//       // Emit notification
//       if (typeof io !== "undefined") {
//         io.emit("newNotification", newNotification);
//       }

//       res.status(200).json({
//         message: "Custom answers submitted and evaluated successfully!",
//         aiEvaluation: customQuestionResults.aiEvaluation,
//         disqualifyingAnswers: disqualifyingAnswers,
//         isDisqualified: isDisqualified,
//         averageScore: averageScore,
//         percentageScore: percentageScore,
//         recommendation: recommendation,
//       });
//     } catch (error) {
//       console.error("Error submitting custom answers:", error);
//       res
//         .status(500)
//         .json({ error: "Internal server error", details: error.message });
//     }
//   },
// };

// // Function to check for disqualifying answers
// function checkDisqualifyingAnswers(answers, questions) {
//   const disqualifyingAnswers = [];

//   answers.forEach((answer, index) => {
//     const question = questions[index];

//     if (typeof question === "object") {
//       // Check for yes/no disqualifying answers
//       if (question.type === "option") {
//         const answerValue = typeof answer === "object" ? answer.answer : answer;
//         if (answerValue === false || answerValue === "No") {
//           disqualifyingAnswers.push({
//             questionIndex: index,
//             questionText: question.text,
//             answer: "No",
//             reason: "Answered 'No' to required qualification",
//           });
//         }
//       }

//       // Check for multiple choice disqualifying answers
//       if (
//         question.type === "custom" &&
//         question.disqualifyingOptions &&
//         question.disqualifyingOptions.length > 0
//       ) {
//         const selectedIndex =
//           typeof answer === "object" ? answer.selectedOption : answer;
//         if (
//           typeof selectedIndex === "number" &&
//           question.disqualifyingOptions.includes(selectedIndex)
//         ) {
//           const selectedOption =
//             question.options[selectedIndex] || "Unknown option";
//           disqualifyingAnswers.push({
//             questionIndex: index,
//             questionText: question.text,
//             answer: selectedOption,
//             reason: "Selected disqualifying option",
//           });
//         }
//       }
//     }
//   });

//   return disqualifyingAnswers;
// }

// export default customAnswersController;
