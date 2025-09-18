import { OpenAI } from "@langchain/openai"
import dotenv from "dotenv"
import Resume from "../../model/resumeModel.js"


dotenv.config()

// Submit custom question answers - save in resume schema
export const submitCustomAnswers = async (req, res) => {
  const { answers, questions, resumeId, jobId, qId } = req.body

  console.log("Custom answers", answers)
  console.log("Custom questions", questions)
  console.log("resumeId", resumeId)
  console.log("jobId", jobId)
  console.log("qId", qId)

  if (!answers || !questions) {
    return res.status(400).json({ message: "Questions and answers are required." })
  }

  try {
    // Find the resume
    const resume = await Resume.findById(resumeId)
    if (!resume) {
      return res.status(404).json({ message: "Resume not found." })
    }

    // Check if custom questions already answered for this job
    const existingCustomScore = resume.questionAnswerScores?.find(
      (score) => score.jobId?.toString() === jobId && score.qId === `custom_${qId || "1"}`,
    )

    if (existingCustomScore) {
      return res.status(409).json({
        message: "Custom questions already answered for this job.",
      })
    }

    // Create the AI model instance
    const model = new OpenAI({
      modelName: "gpt-4.1",
      temperature: 0,
    })

    const prompt = `You are an expert interviewer evaluating custom interview questions. I will provide you with a list of custom questions and answers given by a candidate. Please evaluate each answer and provide a score out of 10, along with a brief feedback comment.
    
        Custom Questions and Answers:
        ${questions?.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`).join("\n\n")}
    
        Please provide the scores and feedback in the following format:
        Q1: score - feedback
        Q2: score - feedback
        ...
        `

    const response = await model.call(prompt)

    // Split the response into lines
    const lines = response.split("\n").filter((line) => line.trim() !== "")

    // Initialize an array to store parsed scores
    const scores = []

    // Process each line to extract question, score, and feedback
    lines.forEach((line, index) => {
      const match = line.match(/Q(\d+):\s*(\d+)\s*-\s*(.*)/)
      if (match) {
        const question = questions[index]
        const answer = answers[index]
        const score = Number.parseInt(match[2], 10)
        const feedback = match[3].trim()
        scores.push({ question, answer, score, feedback })
      }
    })

    // Calculate the total score and average score
    const totalScore = scores.reduce((sum, item) => sum + item.score, 0)
    const averageScore = totalScore / scores.length
    const percentageScore = (averageScore / 10) * 100

    // Create custom question score object for resume
    const customQuestionScore = {
      resumeId: resumeId,
      jobId: jobId,
      qId: `custom_${qId || "1"}`, // Prefix to identify as custom
      scores: scores,
      averageScore: averageScore,
      percentageScore: percentageScore,
      created_at: new Date(),
    }

    // Add to resume's questionAnswerScores array
    if (!resume.questionAnswerScores) {
      resume.questionAnswerScores = []
    }
    resume.questionAnswerScores.push(customQuestionScore)

    // Save the updated resume
    await resume.save()

    res.status(200).json({
      scores,
      averageScore,
      percentageScore,
      message: "Custom answers submitted and evaluated successfully!",
      type: "custom",
    })
  } catch (error) {
    console.error("Error scoring custom answers:", error.message)
    res.status(500).json({ error: error.message })
  }
}
