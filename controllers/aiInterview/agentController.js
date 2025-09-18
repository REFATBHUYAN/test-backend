import { OpenAI } from "openai"
import cron from "node-cron"
import Resume from "../../model/resumeModel.js"
import JobDescription from "../../model/JobDescriptionModel.js"
import AgentWorkflow from "../../model/AgentWorkflowModel.js"
import nodemailer from "nodemailer"
import Notification from "../../model/NotificationModal.js"
import { io } from "../../index.js"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

const DEFAULT_INTERVIEW_SETTINGS = {
  maxQuestions: 8,
  interviewDuration: 15,
  focusAreas: ["technical", "experience"],
  interviewStyle: "balanced",
  voiceType: "professional",
  customInstructions: "",
}

// Improved AI evaluation function
async function evaluateResumeWithAI(resume, jobDescription) {
  try {
    const prompt = `
You are an expert HR recruiter. Evaluate this candidate's resume against the job requirements.

JOB DESCRIPTION:
${jobDescription.markdown_description}

JOB REQUIREMENTS:
- Position: ${jobDescription.context}
- Required Skills: ${jobDescription.requiredSkills?.join(", ") || "Not specified"}
- Experience Level: ${jobDescription.experienceLevel || "Not specified"}

CANDIDATE RESUME:
- Name: ${resume.candidateName}
- Email: ${resume.email}
- Skills: ${resume.skills?.join(", ") || "Not specified"}
- Experience: ${resume.experience || "Not specified"}
- Education: ${resume.education || "Not specified"}
- Summary: ${resume.summary || "Not specified"}
- Previous Roles: ${resume.workExperience?.map((exp) => `${exp.position} at ${exp.company} (${exp.duration})`).join(", ") || "Not specified"}

EVALUATION CRITERIA:
1. Technical Skills Match (0-25 points)
2. Experience Relevance (0-25 points)
3. Education Background (0-20 points)
4. Overall Fit (0-30 points)

Please provide:
1. A detailed score breakdown for each criteria
2. Total score out of 100
3. Key strengths and weaknesses
4. Specific reasons for the score

Return your response in the following JSON format:
{
  "technicalSkills": number,
  "experienceRelevance": number,
  "educationBackground": number,
  "overallFit": number,
  "totalScore": number,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "reasoning": "detailed explanation",
  "recommendation": "hire/consider/reject"
}
`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    })

    const evaluation = JSON.parse(response.choices[0].message.content)
    return evaluation
  } catch (error) {
    console.error("Error in AI resume evaluation:", error)
    // Fallback to existing score if AI evaluation fails
    return {
      totalScore: resume.matchingScoreDetails?.overallMatch || 0,
      technicalSkills: 0,
      experienceRelevance: 0,
      educationBackground: 0,
      overallFit: 0,
      strengths: [],
      weaknesses: [],
      reasoning: "AI evaluation failed, using existing score",
      recommendation: "consider",
    }
  }
}

// Improved interview evaluation
async function evaluateInterviewWithAI(interviewData, jobDescription) {
  try {
    const prompt = `
You are an expert interviewer. Evaluate this candidate's interview performance.

JOB DESCRIPTION:
${jobDescription.markdown_description}

INTERVIEW DATA:
- Questions Asked: ${interviewData.questions?.length || 0}
- Responses Quality: ${interviewData.responses?.map((r) => r.text).join("\n") || "No responses available"}
- Interview Duration: ${interviewData.duration || "Not specified"}
- Communication Score: ${interviewData.communicationScore || "Not available"}

EVALUATION CRITERIA:
1. Technical Knowledge (0-25 points)
2. Communication Skills (0-25 points)
3. Problem-Solving Ability (0-25 points)
4. Cultural Fit (0-25 points)

Please provide a detailed evaluation with scores for each criteria and total score out of 100.

Return your response in JSON format:
{
  "technicalKnowledge": number,
  "communicationSkills": number,
  "problemSolving": number,
  "culturalFit": number,
  "totalScore": number,
  "feedback": "detailed feedback",
  "recommendation": "strong_hire/hire/consider/reject"
}
`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    })

    const evaluation = JSON.parse(response.choices[0].message.content)
    return evaluation
  } catch (error) {
    console.error("Error in AI interview evaluation:", error)
    // Fallback to existing score
    return {
      totalScore: interviewData.score || 0,
      technicalKnowledge: 0,
      communicationSkills: 0,
      problemSolving: 0,
      culturalFit: 0,
      feedback: "AI evaluation failed, using existing score",
      recommendation: "consider",
    }
  }
}

let isCronStarted = false

function startCronPolling() {
  if (isCronStarted) return
  isCronStarted = true

  // Run every hour at minute 0
  cron.schedule("0 * * * *", async () => {
    try {
      const workflows = await AgentWorkflow.find({ status: "In Progress" }).populate("jobId")
      for (const workflow of workflows) {
        await checkWorkflowProgress(workflow)
      }
    } catch (error) {
      console.error("Cron polling error:", error.message)
    }
  })
}

async function triggerAgenticWorkflow(
  jobId,
  candidatesToInterview,
  candidatesToRecommend,
  companyId,
  recruiterId,
  workflowDeadline = 48,
  interviewSettings = {},
) {
  // Calculate deadline
  const interviewDeadline = new Date(Date.now() + workflowDeadline * 60 * 60 * 1000)

  // Generate AI-driven interview settings
  const job = await JobDescription.findById(jobId)
  const finalInterviewSettings = { ...DEFAULT_INTERVIEW_SETTINGS, ...interviewSettings }

  try {
    const prompt = `Given the job description: ${job.markdown_description}, suggest appropriate focus areas (from: technical, experience, behavioral, problemSolving, cultural, leadership) and custom instructions for an AI-driven voice interview. Return JSON with focusAreas (array) and customInstructions (string).`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      max_tokens: 200,
    })

    const aiSettings = JSON.parse(response.choices[0].message.content)

    // Only update if not provided by user
    if (!interviewSettings.focusAreas) {
      finalInterviewSettings.focusAreas = aiSettings.focusAreas || DEFAULT_INTERVIEW_SETTINGS.focusAreas
    }
    if (!interviewSettings.customInstructions) {
      finalInterviewSettings.customInstructions = aiSettings.customInstructions || ""
    }
  } catch (error) {
    console.error("Error generating AI settings:", error.message)
  }

  // Create workflow record
  const workflow = new AgentWorkflow({
    jobId,
    companyId,
    candidatesToInterview,
    candidatesToRecommend,
    status: "Pending",
    interviewDeadline,
    interviewSettings: finalInterviewSettings,
    recruiterId,
    workflowDeadline,
  })

  await workflow.save()

  // Start the workflow immediately
  await processWorkflow(workflow._id)

  // Ensure cron job is running
  startCronPolling()
}

async function processWorkflow(workflowId) {
  try {
    const workflow = await AgentWorkflow.findById(workflowId).populate("jobId")
    if (!workflow) throw new Error("Workflow not found")

    await workflow.updateOne({ status: "In Progress" })

    // Step 1: Get and evaluate candidates with AI
    const resumes = await Resume.find({
      jobTitle: workflow.jobId,
      jobStatus: { $in: ["Selected for Aptitude Testing"] },
    })

    if (resumes.length === 0) {
      throw new Error("No valid resumes found")
    }

    // AI-powered candidate evaluation
    const evaluatedCandidates = []
    for (const resume of resumes) {
      const aiEvaluation = await evaluateResumeWithAI(resume, workflow.jobId)
      evaluatedCandidates.push({
        ...resume.toObject(),
        aiEvaluation,
        enhancedScore: aiEvaluation.totalScore,
      })
    }

    // Select top candidates based on AI evaluation
    const topCandidates = evaluatedCandidates
      .sort((a, b) => b.enhancedScore - a.enhancedScore)
      .slice(0, workflow.candidatesToInterview)

    // Step 2: Send interview links
    const sentEmails = new Set()
    const resumeIds = []
    const emailPromises = topCandidates.map(async (resume) => {
      if (sentEmails.has(resume.email)) return { success: true, email: resume.email }

      sentEmails.add(resume.email)
      resumeIds.push(resume._id)

      const queryParams = new URLSearchParams({
        jobId: workflow.jobId._id,
        email: resume.email,
        userId: workflow.recruiterId,
        maxQuestions: workflow.interviewSettings.maxQuestions,
        interviewDuration: workflow.interviewSettings.interviewDuration,
        interviewStyle: workflow.interviewSettings.interviewStyle,
        voiceType: workflow.interviewSettings.voiceType,
        focusAreas: workflow.interviewSettings.focusAreas.join(","),
      })

      if (workflow.interviewSettings.customInstructions) {
        queryParams.append("customInstructions", workflow.interviewSettings.customInstructions)
      }

      const personalizedLink = `${process.env.FRONTEND_URL}/voice-interview?${queryParams.toString()}&resumeId=${resume._id}`

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: "refatbubt@gmail.com", // Change to resume.email in production
        subject: `Voice AI Interview Invitation: ${workflow.jobId.context} at ${workflow.companyId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">Voice AI Interview Invitation</h2>
            <p>Dear ${resume.candidateName},</p>
            <p>Thank you for your interest in the ${workflow.jobId.context} position at ${workflow.companyId}.</p>
            <p>Based on our AI-powered initial screening, you have been selected for the next round of our recruitment process.</p>
            
            <div style="background-color: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2563eb; margin-top: 0;">Your Initial Assessment Score: ${resume.enhancedScore}/100</h3>
              <p style="margin: 5px 0;"><strong>Key Strengths:</strong> ${resume.aiEvaluation.strengths.join(", ")}</p>
              <p style="margin: 5px 0;"><strong>Areas to Highlight:</strong> ${resume.aiEvaluation.weaknesses.length > 0 ? resume.aiEvaluation.weaknesses.join(", ") : "Continue showcasing your expertise"}</p>
            </div>

            <p><strong>Interview Details:</strong></p>
            <ul>
              <li><strong>Format:</strong> Voice-based AI Interview</li>
              <li><strong>Duration:</strong> Approximately ${workflow.interviewSettings.interviewDuration} minutes</li>
              <li><strong>Questions:</strong> ${workflow.interviewSettings.maxQuestions} questions focusing on ${workflow.interviewSettings.focusAreas.join(", ")}</li>
              <li><strong>Style:</strong> ${workflow.interviewSettings.interviewStyle} approach</li>
            </ul>

            <p style="text-align: center; margin: 30px 0;">
              <a href="${personalizedLink}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Start Your Voice AI Interview</a>
            </p>

            <p>This personalized link will expire in ${Math.round(workflow.workflowDeadline)} hours. Please complete the interview at your earliest convenience.</p>
            
            <p>Best regards,<br>The Recruitment Team<br>${workflow.companyId}</p>
          </div>
        `,
      }

      try {
        await transporter.sendMail(mailOptions)
        return { success: true, email: resume.email }
      } catch (error) {
        console.error(`Error sending email to ${resume.email}:`, error)
        return { success: false, email: resume.email, error: error.message }
      }
    })

    const results = await Promise.all(emailPromises)
    const successCount = results.filter((r) => r.success).length

    // Update resume status with AI evaluation
    await Resume.updateMany(
      { _id: { $in: resumeIds } },
      {
        $set: {
          candidateStatus: "Voice AI Interview Scheduled",
          aiEvaluationScore: { $exists: true },
        },
      },
    )

    if (successCount === 0) {
      throw new Error("Failed to send interview links to any candidates")
    }

    // Send notification
    const notification = new Notification({
      message: `AI-powered workflow started: ${successCount} top candidates invited for interviews`,
      recipientId: workflow.recruiterId,
      jobId: workflow.jobId._id,
    })

    await notification.save()
    io.emit("newNotification", notification)
  } catch (error) {
    console.error("Agent workflow error:", error.message)
    await AgentWorkflow.updateOne({ _id: workflowId }, { status: "Failed" })
  }
}

async function checkWorkflowProgress(workflow) {
  const maxChecks = workflow.workflowDeadline || 48

  // Stop polling if deadline is reached or max checks exceeded
  if (new Date() > workflow.interviewDeadline || workflow.checkCount >= maxChecks) {
    await evaluateAndRank(workflow)
    return
  }

  // Check for completed interviews
  const resumes = await Resume.find({
    jobTitle: workflow.jobId,
    "voiceInterviewResults.score": { $exists: true },
  })

  if (resumes.length >= workflow.candidatesToInterview * 0.8) {
    // At least 80% of interviews completed
    await evaluateAndRank(workflow)
    return
  }

  // Increment check count
  await AgentWorkflow.updateOne({ _id: workflow._id }, { $inc: { checkCount: 1 } })
}

async function evaluateAndRank(workflow) {
  const job = await JobDescription.findById(workflow.jobId)
  const resumes = await Resume.find({ jobTitle: workflow.jobId })

  const rankedCandidates = []

  for (const resume of resumes) {
    // Get AI-enhanced resume evaluation
    const resumeEvaluation = await evaluateResumeWithAI(resume, job)

    // Get AI-enhanced interview evaluation
    let interviewEvaluation = { totalScore: 0 }
    if (resume.voiceInterviewResults && resume.voiceInterviewResults.length > 0) {
      let validVoiceResults = resume.voiceInterviewResults.filter(
        (result) =>
          result && result.interactions && result.interactions.length > 3
      );
      interviewEvaluation = await evaluateInterviewWithAI(validVoiceResults[0], job)
      // interviewEvaluation = await evaluateInterviewWithAI(resume.voiceInterviewResults[0], job)
    }

    // Calculate weighted combined score
    // const resumeScore = resumeEvaluation.totalScore
    // const interviewScore = interviewEvaluation.totalScore
    // const combinedScore = resumeScore * 0.4 + interviewScore * 0.6
    const resumeScore = resumeEvaluation.totalScore; // Out of 100
    const interviewScoreRaw = interviewEvaluation.totalScore; // Out of 10
    const interviewScore = interviewScoreRaw * 10; // Normalize to 0–100
    const combinedScore = resumeScore * 0.4 + interviewScore * 0.6; // Corrected

    rankedCandidates.push({
      candidateName: resume.candidateName,
      email: resume.email,
      resumeId: resume._id,
      combinedScore,
      resumeScore,
      interviewScore,
      resumeEvaluation,
      interviewEvaluation,
    })
  }

  // Select top candidates
  const topCandidates = rankedCandidates
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, workflow.candidatesToRecommend)

  // Generate comprehensive recommendation summary
  const summaryPrompt = `
As an expert HR consultant, provide a comprehensive summary of why these candidates are the top choices for the position.

JOB: ${job.context}
JOB DESCRIPTION: ${job.markdown_description}

TOP CANDIDATES:
${topCandidates
  .map(
    (candidate, index) => `
${index + 1}. ${candidate.candidateName}
   - Overall Score: ${candidate.combinedScore.toFixed(1)}/100
   - Resume Score: ${candidate.resumeScore}/100
   - Interview Score: ${candidate.interviewScore}/10
   - Key Strengths: ${candidate.resumeEvaluation.strengths?.join(", ") || "N/A"}
   - Interview Feedback: ${candidate.interviewEvaluation.feedback || "N/A"}
`,
  )
  .join("\n")}

Please provide:
1. Overall assessment of the candidate pool
2. Why each candidate stands out
3. Specific recommendations for next steps
4. Any concerns or areas to explore further

Keep the summary professional, concise, and actionable.
`

  const summaryResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: summaryPrompt }],
    max_tokens: 800,
  })

  // Update workflow with results
  await AgentWorkflow.updateOne(
    { _id: workflow._id },
    {
      status: "Completed",
      results: {
        topCandidates,
        summary: summaryResponse.choices[0].message.content,
        evaluationDetails: {
          totalCandidatesEvaluated: rankedCandidates.length,
          averageResumeScore: rankedCandidates.reduce((sum, c) => sum + c.resumeScore, 0) / rankedCandidates.length,
          averageInterviewScore:
            rankedCandidates.reduce((sum, c) => sum + c.interviewScore, 0) / rankedCandidates.length,
        },
      },
    },
  )

  // Notify recruiter
  const notification = new Notification({
    message: `AI evaluation complete! Top ${topCandidates.length} candidates recommended for ${job.context}`,
    recipientId: workflow.recruiterId,
    jobId: workflow.jobId._id,
  })

  await notification.save()
  io.emit("newNotification", notification)

  // Notify top candidates
  const sentEmails = new Set()
  const emailPromises = topCandidates.map(async (candidate, index) => {
    if (candidate.email && !sentEmails.has(candidate.email)) {
      sentEmails.add(candidate.email)

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: "refatbubt@gmail.com", // Change to candidate.email in production
        subject: `Congratulations! You're a Top Candidate for ${job.context}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">🎉 Congratulations!</h2>
            <p>Dear ${candidate.candidateName},</p>
            
            <p>We're excited to inform you that you've been selected as one of our <strong>top ${workflow.candidatesToRecommend} candidates</strong> for the ${job.context} position!</p>
            
            <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="color: #2563eb; margin-top: 0;">Your Final Ranking: #${index + 1}</h3>
              <p style="font-size: 18px; margin: 10px 0;"><strong>Overall Score: ${candidate.combinedScore.toFixed(1)}/100</strong></p>
              <div style="display: flex; justify-content: space-around; margin-top: 15px;">
                <div>
                  <div style="font-weight: bold; color: #059669;">Resume: ${candidate.resumeScore}/100</div>
                </div>
                <div>
                  <div style="font-weight: bold; color: #7c3aed;">Interview: ${candidate.interviewScore}/100</div>
                </div>
              </div>
            </div>

            <p>Our AI-powered evaluation system was impressed by your qualifications and interview performance. Our team will be in touch within the next 2-3 business days to discuss the next steps in our hiring process.</p>
            
            <p>Thank you for your time and interest in joining our team!</p>
            
            <p>Best regards,<br>The Recruitment Team<br>${workflow.companyId}</p>
          </div>
        `,
      }

      try {
        await transporter.sendMail(mailOptions)
        return { success: true, email: candidate.email }
      } catch (error) {
        console.error(`Error notifying candidate ${candidate.email}:`, error)
        return { success: false, email: candidate.email, error: error.message }
      }
    }
    return { success: true, email: candidate.email }
  })

  await Promise.all(emailPromises)
}

// Resume pending workflows on server start
async function resumePendingWorkflows() {
  const pendingWorkflows = await AgentWorkflow.find({ status: "In Progress" })
  for (const workflow of pendingWorkflows) {
    await checkWorkflowProgress(workflow)
  }
  startCronPolling()
}

export { triggerAgenticWorkflow, resumePendingWorkflows }

// =======================================================================

// import { OpenAI } from "openai";
// import { randomUUID } from "crypto";
// import cron from "node-cron";
// import Resume from "../../model/resumeModel.js";
// import JobDescription from "../../model/JobDescriptionModel.js";
// import AgentWorkflow from "../../model/AgentWorkflowModel.js";
// import nodemailer from "nodemailer";
// import Notification from "../../model/NotificationModal.js";
// import { io } from "../../index.js";

// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// const DEFAULT_INTERVIEW_SETTINGS = {
//   maxQuestions: 8,
//   interviewDuration: 15,
//   focusAreas: ["technical", "experience"],
//   interviewStyle: "balanced",
//   voiceType: "professional",
//   customInstructions: "",
// };

// // Start cron job for polling all workflows
// let isCronStarted = false;
// function startCronPolling() {
//   if (isCronStarted) return;
//   isCronStarted = true;

//   // Run every hour at minute 0
//   cron.schedule("0 * * * *", async () => {
//     try {
//       const workflows = await AgentWorkflow.find({ status: "In Progress" }).populate("jobId");
//       for (const workflow of workflows) {
//         await checkWorkflowProgress(workflow);
//       }
//     } catch (error) {
//       console.error("Cron polling error:", error.message);
//     }
//   });
// }

// async function triggerAgenticWorkflow(jobId, candidatesToInterview, candidatesToRecommend, companyId, recruiterId) {
//   // Calculate deadline (48 hours from now)
//   const interviewDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);

//   // Generate AI-driven interview settings
//   const job = await JobDescription.findById(jobId);
//   let interviewSettings = { ...DEFAULT_INTERVIEW_SETTINGS };

//   try {
//     const prompt = `Given the job description: ${job.markdown_description}, suggest appropriate focus areas (from: technical, experience, behavioral, problemSolving, cultural, leadership) and custom instructions for an AI-driven voice interview. Return JSON with focusAreas (array) and customInstructions (string).`;
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [{ role: "system", content: prompt }],
//       max_tokens: 200,
//     });
//     const aiSettings = JSON.parse(response.choices[0].message.content);
//     interviewSettings.focusAreas = aiSettings.focusAreas || DEFAULT_INTERVIEW_SETTINGS.focusAreas;
//     interviewSettings.customInstructions = aiSettings.customInstructions || "";
//   } catch (error) {
//     console.error("Error generating AI settings:", error.message);
//   }

//   // Create workflow record
//   const workflow = new AgentWorkflow({
//     jobId,
//     companyId,
//     candidatesToInterview,
//     candidatesToRecommend,
//     status: "Pending",
//     interviewDeadline,
//     interviewSettings,
//     recruiterId
//   });
//   await workflow.save();

//   // Start the workflow immediately
//   await processWorkflow(workflow._id);

//   // Ensure cron job is running
//   startCronPolling();
// }

// async function processWorkflow(workflowId) {
//   try {
//     const workflow = await AgentWorkflow.findById(workflowId).populate("jobId");
//     if (!workflow) throw new Error("Workflow not found");

//     await workflow.updateOne({ status: "In Progress" });

//     // Step 1: Select top candidates
//     const resumes = await Resume.find({
//       jobTitle: workflow.jobId,
//       jobStatus: { $in: ["Selected for Aptitude Testing"] },
//     });
//     const topCandidates = resumes
//       .sort((a, b) => (b.matchingScoreDetails?.overallMatch || 0) - (a.matchingScoreDetails?.overallMatch || 0))
//       .slice(0, workflow.candidatesToInterview);

//     if (topCandidates.length === 0) {
//       throw new Error("No valid resumes found");
//     }

//     // Step 2: Send interview links
//     const sentEmails = new Set();
//     const resumeIds = [];
//     const emailPromises = topCandidates.map(async (resume) => {
//       if (sentEmails.has(resume.email)) return { success: true, email: resume.email }; // Skip duplicates
//       sentEmails.add(resume.email);
//       resumeIds.push(resume._id);

//       const sessionId = randomUUID();
//       const queryParams = new URLSearchParams({
//         jobId: workflow.jobId._id,
//         email: resume.email,
//         userId: resume.userId || "anonymous",
//         maxQuestions: workflow.interviewSettings.maxQuestions,
//         interviewDuration: workflow.interviewSettings.interviewDuration,
//         interviewStyle: workflow.interviewSettings.interviewStyle,
//         voiceType: workflow.interviewSettings.voiceType,
//         focusAreas: workflow.interviewSettings.focusAreas.join(","),
//       });
//       if (workflow.interviewSettings.customInstructions) {
//         queryParams.append("customInstructions", workflow.interviewSettings.customInstructions);

//       const personalizedLink = `${process.env.FRONTEND_URL}/voice-interview?${queryParams.toString()}&resumeId=${resume._id}`;

//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: "refatbubt@gmail.com",
//         // to: resume.email,
//         subject: `Voice AI Interview Invitation: ${workflow.jobId.context} at ${workflow.companyId}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//             <h2 style="text-align: center; color: #4CAF50;">Voice AI Interview Invitation</h2>
//             <p>Dear ${resume.candidateName},</p>
//             <p>Thank you for your interest in the ${workflow.jobId.context} position at ${workflow.companyId}.</p>
//             <p>As part of our selection process, we'd like to invite you to participate in a voice-based AI interview. This innovative approach allows you to showcase your skills and experience through a natural conversation with our AI interviewer.</p>
//             <p><strong>Interview Details:</strong></p>
//             <ul>
//               <li><strong>Format:</strong> Voice-based AI Interview</li>
//               <li><strong>Duration:</strong> Approximately ${workflow.interviewSettings.interviewDuration} minutes</li>
//               <li><strong>Questions:</strong> ${workflow.interviewSettings.maxQuestions} questions related to your experience and the role</li>
//             </ul>
//             <p><strong>Technical Requirements:</strong></p>
//             <ul>
//               <li>A modern web browser (Chrome, Firefox, Edge, or Safari)</li>
//               <li>A working microphone</li>
//               <li>A quiet environment with minimal background noise</li>
//             </ul>
//             <p><strong>Instructions:</strong></p>
//             <ol>
//               <li>Click the link below to start your interview</li>
//               <li>Allow microphone access when prompted</li>
//               <li>The AI will speak questions aloud and listen to your verbal responses</li>
//               <li>Speak clearly and at a normal pace</li>
//               <li>The AI will ask follow-up questions based on your responses</li>
//             </ol>
//             <p style="text-align: center; margin: 30px 0;">
//               <a href="${personalizedLink}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Start Your Voice AI Interview</a>
//             </p>
//             <p>This link is unique to you and will expire in 7 days. Please complete the interview at your earliest convenience.</p>
//             <p>If you have any questions or technical issues, please contact our support team.</p>
//             <p>Best regards,</p>
//             <p>The Recruitment Team<br>${workflow.companyId}</p>
//           </div>
//         `,
//       };

//       try {
//         await transporter.sendMail(mailOptions);
//         return { success: true, email: resume.email };
//       } catch (error) {
//         console.error(`Error sending email to ${resume.email}:`, error);
//         return { success: false, email: resume.email, error: error.message };
//       }
//     }});

//     const results = await Promise.all(emailPromises);
//     const successCount = results.filter((r) => r.success).length;

//     // Update resume status
//     await Resume.updateMany(
//       { _id: { $in: resumeIds } },
//       { $set: { candidateStatus: "Voice AI Interview Scheduled" } }
//     );

//     if (successCount === 0) {
//       throw new Error("Failed to send interview links to any candidates");
//     }
//   } catch (error) {
//     console.error("Agent workflow error:", error.message);
//     await AgentWorkflow.updateOne({ _id: workflowId }, { status: "Failed" });
//   }
// }

// async function checkWorkflowProgress(workflow) {
//   const maxChecks = 48; // Max 48 hours of polling

//   // Stop polling if deadline is reached or max checks exceeded
//   if (new Date() > workflow.interviewDeadline || workflow.checkCount >= maxChecks) {
//     await evaluateAndRank(workflow);
//     return;
//   }

//   // Check for completed interviews
//   const resumes = await Resume.find({
//     jobTitle: workflow.jobId,
//     "voiceInterviewResults.score": { $exists: true },
//   });

//   if (resumes.length >= workflow.candidatesToInterview * 0.8) {
//     // At least 80% of interviews completed
//     await evaluateAndRank(workflow);
//     return;
//   }

//   // Increment check count
//   await AgentWorkflow.updateOne(
//     { _id: workflow._id },
//     { $inc: { checkCount: 1 } },
//   );
// }

// async function evaluateAndRank(workflow) {
//   const job = await JobDescription.findById(workflow.jobId);
//   const resumes = await Resume.find({ jobTitle: workflow.jobId });

//   const rankedCandidates = [];
//   for (const resume of resumes) {
//     const resumeScore = resume.matchingScoreDetails?.overallMatch || 0;
//     const interviewScore = resume.voiceInterviewResults?.[0]?.score || 0;
//     const combinedScore = resumeScore * 0.4 + interviewScore * 0.6;

//     rankedCandidates.push({
//       candidateName: resume.candidateName,
//       email: resume.email,
//       resumeId: resume._id,
//       combinedScore,
//       resumeScore,
//       interviewScore,
//     });
//   }

//   // Select top candidates
//   const topCandidates = rankedCandidates
//     .sort((a, b) => b.combinedScore - a.combinedScore)
//     .slice(0, workflow.candidatesToRecommend);

//   // Generate recommendation summary
//   const prompt = `Summarize why these candidates are the top choices for the job: ${JSON.stringify(topCandidates)}\nJob Description: ${job.markdown_description}`;
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o-mini",
//     messages: [{ role: "system", content: prompt }],
//     max_tokens: 500,
//   });

//   // Update workflow with results
//   await AgentWorkflow.updateOne(
//     { _id: workflow._id },
//     {
//       status: "Completed",
//       results: {
//         topCandidates,
//         summary: response.choices[0].message.content,
//       },
//     },
//   );

//   // Notify recruiter
//   const notification = new Notification({
//     message: `Top ${topCandidates.length} candidates recommended for job ${job.context}`,
//     recipientId: workflow.companyId,
//     jobId: workflow.recruiterId
    
//   });
//   await notification.save();

//   io.emit("newNotification", notification);

//   // Notify candidates of final decision
//   const sentEmails = new Set();
//   const emailPromises = topCandidates.map(async (candidate) => {
//     if (candidate.email && !sentEmails.has(candidate.email)) {
//       sentEmails.add(candidate.email);
//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: "refatbubt@gmail.com",
//         // to: candidate.email,
//         subject: `Update on Your Application for ${job.context}`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//             <h2 style="text-align: center; color: #4CAF50;">Application Update</h2>
//             <p>Dear ${candidate.candidateName},</p>
//             <p>Thank you for participating in the interview process for the ${job.context} position at ${workflow.companyId}.</p>
//             <p>We are pleased to inform you that you have been selected as one of the top candidates. Our team will follow up with next steps soon.</p>
//             <p>Best regards,</p>
//             <p>The Recruitment Team<br>${workflow.companyId}</p>
//           </div>
//         `,
//       };

//       try {
//         await transporter.sendMail(mailOptions);
//         return { success: true, email: candidate.email };
//       } catch (error) {
//         console.error(`Error notifying candidate ${candidate.email}:`, error);
//         return { success: false, email: candidate.email, error: error.message };
//       }
//     }
//     return { success: true, email: candidate.email };
//   });

//   await Promise.all(emailPromises);
// }

// // Resume pending workflows on server start
// async function resumePendingWorkflows() {
//   const pendingWorkflows = await AgentWorkflow.find({ status: "In Progress" });
//   for (const workflow of pendingWorkflows) {
//     await checkWorkflowProgress(workflow);
//   }
//   startCronPolling();
// }

// export { triggerAgenticWorkflow, resumePendingWorkflows };

