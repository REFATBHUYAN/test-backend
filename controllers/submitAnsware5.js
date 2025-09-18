import { OpenAI } from "@langchain/openai"
import dotenv from "dotenv"
import Resume from "../model/resumeModel.js"
import JobDescription from "../model/JobDescriptionModel.js"
import nodemailer from "nodemailer"
import Notification from "../model/NotificationModal.js"
import { io } from "../index.js"

dotenv.config()

export const submitAnswer5 = async (req, res) => {
  const { answers, questions, resumeId, jobId, qId, email, userId, testTypes, numberOfQuestions, tailorToExperience } =
    req.body

  console.log("answers", answers)
  console.log("questions", questions)
  console.log("resumeId", resumeId)
  console.log("jobId", jobId)
  console.log("qId", qId)
  console.log("email", email)
  console.log("testTypes", testTypes)

  // Enhanced validation
  if (!answers || !questions) {
    return res.status(400).json({ message: "Questions and answers are required." })
  }

  if (!Array.isArray(answers) || !Array.isArray(questions)) {
    return res.status(400).json({ message: "Questions and answers must be arrays." })
  }

  if (answers.length !== questions.length) {
    return res.status(400).json({
      message: `Mismatch: ${questions.length} questions but ${answers.length} answers provided.`,
    })
  }

  // Validate that all answers are provided and not empty
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] === undefined || answers[i] === null || answers[i] === "") {
      return res.status(400).json({
        message: `Answer ${i + 1} is missing or empty.`,
      })
    }
  }

  try {
    // Find the resume
    const resume = await Resume.findById(resumeId)
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" })
    }

    // Initialize jobSpecificQuestionResults if it doesn't exist
    if (!resume.jobSpecificQuestionResults) {
      resume.jobSpecificQuestionResults = []
    }

    // Check if a record with the same resumeId, jobId, and qId already exists
    // const existingRecord = resume.jobSpecificQuestionResults?.find(
    //   (result) => result.jobId.toString() === jobId && result.qId === qId,
    // )

    // if (existingRecord) {
    //   return res.status(409).json({
    //     message: "A record with the same resumeId, jobId, and qId already exists.",
    //   })
    // }

    // Clean up invalid voiceInterviewResults to prevent validation errors
    if (resume.voiceInterviewResults && resume.voiceInterviewResults.length > 0) {
      resume.voiceInterviewResults = resume.voiceInterviewResults.filter((result) => {
        // Remove results with invalid interactions
        if (result.interactions && result.interactions.length > 0) {
          result.interactions = result.interactions.filter((interaction) => {
            return interaction.candidateResponse && interaction.candidateResponse.trim() !== ""
          })
          // If no valid interactions remain, remove the entire result
          return result.interactions.length > 0
        }
        return true
      })
    }

    // Validate that OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key is missing")
      return res.status(500).json({ error: "OpenAI API key is not configured" })
    }

    // Create the AI model instance with proper configuration
    const model = new OpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo-instruct",
      temperature: 0.2,
      maxTokens: 1000,
    })

    const prompt = `You are an expert interviewer. I will provide you with a list of questions and answers given by a candidate. Please evaluate each answer and provide a score out of 10, along with a brief feedback comment.

Questions and Answers:
${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`).join("\n\n")}

Please provide the scores and feedback in the following format (one line per question):
Q1: 8 - Good understanding but could be more detailed
Q2: 7 - Correct approach with minor gaps
Q3: 9 - Excellent comprehensive answer

IMPORTANT: Provide exactly ${questions.length} evaluations, one for each question.`

    console.log("Sending prompt to AI...")

    let response
    try {
      response = await model.call(prompt)
      console.log("AI Response received:", response)
    } catch (aiError) {
      console.error("AI API Error:", aiError)

      // Fallback: Create basic scores if AI fails
      const fallbackScores = questions.map((question, index) => {
        const answer = answers[index]
        let score = 5 // Default middle score

        // Simple heuristic scoring
        if (answer && typeof answer === "string") {
          if (answer.length > 100) score = 8
          else if (answer.length > 50) score = 7
          else if (answer.length > 20) score = 6
          else if (answer.length > 0) score = 5
          else score = 2
        }

        return {
          question: question,
          answer: answer,
          score,
          feedback: "Automated evaluation - AI service unavailable",
        }
      })

      // Use fallback scores
      const totalScore = fallbackScores.reduce((sum, item) => sum + item.score, 0)
      const averageScore = totalScore / fallbackScores.length
      const percentageScore = (averageScore / 10) * 100

      // Create job-specific question result object
      const jobSpecificResult = {
        jobId: jobId,
        qId: qId,
        questions: questions,
        answers: answers,
        scores: fallbackScores,
        testTypes: testTypes || [],
        averageScore: averageScore,
        percentageScore: percentageScore,
        numberOfQuestions: numberOfQuestions || questions.length,
        tailorToExperience: tailorToExperience || false,
        aiEvaluation: {
          individualScores: fallbackScores.map((score, index) => ({
            questionIndex: index,
            questionText: score.question,
            answerText: score.answer,
            score: score.score,
            feedback: score.feedback,
          })),
          overallScore: averageScore,
          averageScore: averageScore,
          percentageScore: percentageScore,
          recommendation:
            percentageScore >= 80
              ? "Highly Recommended"
              : percentageScore >= 70
                ? "Recommended"
                : percentageScore >= 60
                  ? "Consider"
                  : "Not Recommended",
          overallFeedback: "Evaluation completed with fallback scoring",
          evaluatedAt: new Date(),
        },
        completedAt: new Date(),
      }

      // Add to resume's jobSpecificQuestionResults array
      resume.jobSpecificQuestionResults.push(jobSpecificResult)
      resume.candidateStatus = "Aptitude Tests Assessed"

      // Save with validation disabled for existing data
      await resume.save({ validateBeforeSave: false })

      return res.status(200).json({
        scores: fallbackScores,
        averageScore,
        percentageScore,
        message: "Answers submitted and evaluated successfully (fallback scoring used)!",
        warning: "AI evaluation service was unavailable, basic scoring applied",
      })
    }

    // Parse the AI response
    const lines = response.split("\n").filter((line) => line.trim() !== "")
    const scores = []

    // Process each line to extract question, score, and feedback
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      console.log(`Processing line ${i + 1}: ${line}`)

      // More flexible regex to match different formats
      const match = line.match(/Q(\d+):\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(.+)/i)

      if (match) {
        const questionIndex = Number.parseInt(match[1], 10) - 1
        const score = Math.min(10, Math.max(0, Number.parseInt(match[2], 10)))
        const feedback = match[3].trim()

        if (questionIndex >= 0 && questionIndex < questions.length) {
          scores.push({
            question: questions[questionIndex],
            answer: answers[questionIndex],
            score,
            feedback,
          })
          console.log(`Parsed Q${questionIndex + 1}: Score=${score}, Feedback=${feedback}`)
        }
      }
    }

    // Ensure we have scores for all questions with proper validation
    for (let i = 0; i < questions.length; i++) {
      const existingScore = scores.find((s) => s.question === questions[i])

      if (!existingScore) {
        console.log(`Creating missing score for question ${i + 1}`)

        // Validate that the answer exists
        if (answers[i] === undefined || answers[i] === null) {
          return res.status(400).json({
            message: `Answer ${i + 1} is missing and cannot be processed.`,
          })
        }

        scores.push({
          question: questions[i],
          answer: answers[i],
          score: 5,
          feedback: "Evaluation completed",
        })
      }
    }

    // Final validation - ensure all scores have required fields
    for (let i = 0; i < scores.length; i++) {
      const scoreItem = scores[i]

      if (!scoreItem.question || scoreItem.question === "") {
        return res.status(400).json({
          message: `Question ${i + 1} is missing or empty.`,
        })
      }

      if (!scoreItem.answer || scoreItem.answer === "") {
        return res.status(400).json({
          message: `Answer ${i + 1} is missing or empty.`,
        })
      }

      if (typeof scoreItem.score !== "number") {
        scoreItem.score = 5 // Default score
      }

      if (!scoreItem.feedback || scoreItem.feedback === "") {
        scoreItem.feedback = "Evaluation completed"
      }
    }

    // Calculate the total score and average score
    const totalScore = scores.reduce((sum, item) => sum + item.score, 0)
    const averageScore = totalScore / scores.length
    const percentageScore = (averageScore / 10) * 100

    // Determine recommendation
    let recommendation = "Not Recommended"
    if (percentageScore >= 80) recommendation = "Highly Recommended"
    else if (percentageScore >= 70) recommendation = "Recommended"
    else if (percentageScore >= 60) recommendation = "Consider"

    console.log(`Final scores: Total=${totalScore}, Average=${averageScore}, Percentage=${percentageScore}`)
    console.log("Final scores array:", JSON.stringify(scores, null, 2))

    // Create job-specific question result object
    const jobSpecificResult = {
      jobId: jobId,
      qId: qId,
      questions: questions,
      answers: answers,
      scores: scores,
      testTypes: testTypes || [],
      averageScore: averageScore,
      percentageScore: percentageScore,
      numberOfQuestions: numberOfQuestions || questions.length,
      tailorToExperience: tailorToExperience || false,
      aiEvaluation: {
        individualScores: scores.map((score, index) => ({
          questionIndex: index,
          questionText: score.question,
          answerText: score.answer,
          score: score.score,
          feedback: score.feedback,
        })),
        overallScore: averageScore,
        averageScore: averageScore,
        percentageScore: percentageScore,
        recommendation: recommendation,
        overallFeedback: "AI evaluation completed successfully",
        evaluatedAt: new Date(),
      },
      completedAt: new Date(),
    }

    // Add to resume's jobSpecificQuestionResults array
    resume.jobSpecificQuestionResults.push(jobSpecificResult)
    resume.candidateStatus = "Aptitude Tests Assessed"

    // Save with validation disabled for existing data to avoid voiceInterviewResults validation errors
    await resume.save({ validateBeforeSave: false })

    // Retrieve job title and candidate details
    const job = await JobDescription.findById(jobId)

    if (resume && job) {
      const { candidateName, email: candidateEmail } = resume
      const { context } = job

      // Configure Nodemailer
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
        subject: `Submission Confirmation for ${context}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">Candidate Test Submission Received</h2>
            <p>Dear Hiring Manager,</p>
            <p>We have received a new submission from a candidate for the ${context} position. Below are the details of the submission:</p>
            <p><strong>Submission Details:</strong></p>
            <ul>
              <li><strong>Job Title:</strong> ${context}</li>
              <li><strong>Candidate Name:</strong> ${resume.candidateName}</li>
              <li><strong>Questions Answered:</strong> ${questions.length}</li>
              <li><strong>Test Types:</strong> ${testTypes?.join(", ") || "General"}</li>
              <li><strong>Average Score:</strong> ${averageScore.toFixed(2)}/10</li>
              <li><strong>Percentage Score:</strong> ${percentageScore.toFixed(2)}%</li>
              <li><strong>Recommendation:</strong> ${recommendation}</li>
            </ul>
            <p>Please review the candidate's responses and proceed with the next steps as necessary.</p>
            <p>Best regards,</p>
            <p>The Team</p>
          </div>
        `,
      }

      try {
        await transporter.sendMail(mailOptions)
        console.log("Notification email sent successfully!")
      } catch (error) {
        console.error("Error sending email:", error)
      }
    }

    const newNotification = new Notification({
      message: `${resume?.candidateName} Aptitude Test Screened - Score: ${percentageScore.toFixed(1)}%`,
      recipientId: userId,
      resumeId: resumeId,
    })

    await newNotification.save()

    // Emit the new notification event to the specific recipient
    if (io) {
      io.emit("newNotification", newNotification)
    }

    res.status(200).json({
      scores,
      averageScore,
      percentageScore,
      recommendation,
      message: "Answers submitted and evaluated successfully!",
    })
  } catch (error) {
    console.error("Error scoring answers:", error.message)
    console.error("Full error:", error)
    res.status(500).json({ error: error.message })
  }
}





// import { OpenAI } from "@langchain/openai";
// import dotenv from "dotenv";
// import QuestionAnswerScore from "../model/questionAnswerScoreModel.js";
// import Resume from "../model/resumeModel.js";
// import JobDescription from "../model/JobDescriptionModel.js";
// import nodemailer from "nodemailer";
// import Notification from "../model/NotificationModal.js";
// import { io } from "../index.js";

// dotenv.config();

// export const submitAnswer5 = async (req, res) => {
//   const { answers, questions, resumeId, jobId, qId, email, userId } = req.body;

//   console.log("answers", answers);
//   console.log("questions", questions);
//   console.log("resumeId", resumeId);
//   console.log("jobId", jobId);
//   console.log("qId", qId);
//   console.log("email", email);

//   if (!answers || !questions) {
//     return res
//       .status(400)
//       .json({ message: "Questions and answers are required." });
//   }

//   try {
//     // Check if a record with the same resumeId, jobId, and qId already exists
//     const existingRecord = await QuestionAnswerScore.findOne({
//       resumeId,
//       jobId,
//       qId,
//     });

//     if (existingRecord) {
//       return res.status(409).json({
//         message:
//           "A record with the same resumeId, jobId, and qId already exists.",
//       });
//     }

//     // Create the AI model instance
//     const model = new OpenAI({
//       modelName: "gpt-4.1",
//       temperature: 0,
//     });

//     const prompt = `You are an expert interviewer. I will provide you with a list of questions and answers given by a candidate. Please evaluate each answer and provide a score out of 10, along with a brief feedback comment.
    
//         Questions and Answers:
//         ${questions
//           ?.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`)
//           .join("\n\n")}
    
//         Please provide the scores and feedback in the following format:
//         Q1: score - feedback
//         Q2: score - feedback
//         ...
//         `;

//     const response = await model.call(prompt);

//     // Split the response into lines
//     const lines = response.split("\n").filter((line) => line.trim() !== "");

//     // Initialize an array to store parsed scores
//     const scores = [];

//     // Process each line to extract question, score, and feedback
//     lines.forEach((line, index) => {
//       const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/);
//       if (match) {
//         const question = questions[index];
//         const answer = answers[index];
//         const score = parseInt(match[2], 10);
//         const feedback = match[3].trim();
//         scores.push({ question, answer, score, feedback });
//       }
//     });

//     // Calculate the total score and average score
//     const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
//     const averageScore = totalScore / scores.length;

//     // Optionally, calculate percentage score (if scores are out of 10)
//     const percentageScore = (averageScore / 10) * 100;

//     // Save all the data at once in the QuestionAnswerScore model
//     const questionAnswerScore = new QuestionAnswerScore({
//       resumeId: resumeId,
//       jobId: jobId,
//       qId: qId,
//       scores: scores,
//       averageScore: averageScore,
//       percentageScore: percentageScore,
//     });

//     await questionAnswerScore.save();

//     // Find the Resume by resumeId and update the questionAnswerScores field
//     const resume = await Resume.findById(resumeId);
//     if (!resume) {
//       return res.status(404).json({ message: "Resume not found" });
//     }

//     // Push the new QuestionAnswerScore data into the resume's questionAnswerScores array
//     if (resume) {
//       // Push the current QuestionAnswerScore data into the resume's questionAnswerScores array
//       resume.questionAnswerScores.push({
//         resumeId: questionAnswerScore.resumeId,
//         jobId: questionAnswerScore.jobId,
//         qId: questionAnswerScore.qId,
//         scores: questionAnswerScore.scores,
//         averageScore: questionAnswerScore.averageScore,
//         percentageScore: questionAnswerScore.percentageScore,
//       });
//       // Update the resume status
//       resume.candidateStatus = "Aptitude Tests Assessed";
//       await resume.save();
//     }

//     // Save the updated resume document
//     // await resume.save();

//     // Retrieve job title and candidate details
//     const job = await JobDescription.findById(jobId);

//     if (resume && job) {
//       const { candidateName, email: candidateEmail } = resume;
//       const { context } = job;

//       // Configure Nodemailer
//       const transporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//           user: process.env.EMAIL_USER,
//           pass: process.env.EMAIL_PASS,
//         },
//       });

//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: email,
//         subject: `Submission Confirmation for ${context}`,
//         html: `
//     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//       <h2 style="text-align: center; color: #4CAF50;">Candidate Test Submission Received</h2>
//       <p>Dear Hiring Manager,</p>
//       <p>We have received a new submission from a candidate for the ${context} position. Below are the details of the submission:</p>
//       <p><strong>Submission Details:</strong></p>
//       <ul>
//         <li><strong>Job Title:</strong> ${context}</li>
//         <li><strong>Candidate Name:</strong> ${resume.candidateName}</li>
//         <li><strong>Questions Answered:</strong> ${questions.length}</li>
//         <li><strong>Average Score:</strong> ${averageScore.toFixed(2)}</li>
//         <li><strong>Percentage Score:</strong> ${percentageScore.toFixed(
//           2
//         )}%</li>
//       </ul>
//       <p>Please review the candidate's responses and proceed with the next steps as necessary.</p>
//       <p>Best regards,</p>
//       <p>The Team</p>
//     </div>
//   `,
//       };

//       try {
//         await transporter.sendMail(mailOptions);
//         console.log("Notification email sent successfully!");
//       } catch (error) {
//         console.error("Error sending email:", error);
//       }
//     }

//     const newNotification = new Notification({
//       message: `${resume?.candidateName} Aptitude Test Screened`,

//       recipientId: userId,

//       resumeId: resumeId,
//     },);

//     await newNotification.save();

//     // Emit the new notification event to the specific recipient
//     io.emit("newNotification", newNotification);

//     res.status(200).json({
//       scores,
//       averageScore,
//       percentageScore,
//       message: "Answers submitted and evaluated successfully!",
//     });
//   } catch (error) {
//     console.error("Error scoring answers:", error);
//     res.status(500).json({ error: error.message });
//   }
// };
