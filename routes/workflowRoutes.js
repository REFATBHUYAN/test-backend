import express from "express"
import { triggerAgenticWorkflow } from "../controllers/aiInterview/agentController.js"
import JobDescription from "../model/JobDescriptionModel.js"
import AgentWorkflow from "../model/AgentWorkflowModel.js"

const router = express.Router()

router.post("/start", async (req, res) => {
  try {
    const {
      jobId,
      candidatesToInterview,
      candidatesToRecommend,
      companyId,
      recruiterId,
      workflowDeadline,
      interviewSettings,
    } = req.body

    console.log("items body", req.body )

    if (!jobId || !candidatesToInterview || !candidatesToRecommend || !companyId) {
      console.log("Missing required fields");
      return res.status(400).json({ success: false, error: "Missing required fields" })
    }

    const job = await JobDescription.findById(jobId)
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })

    await triggerAgenticWorkflow(
      jobId,
      candidatesToInterview,
      candidatesToRecommend,
      companyId,
      recruiterId,
      workflowDeadline,
      interviewSettings,
    )

    res.status(200).json({ success: true, message: "AI-powered workflow started successfully" })
  } catch (error) {
    console.error("Error starting workflow:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

router.get("/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params
    const workflows = await AgentWorkflow.find({ jobId }).sort({ createdAt: -1 })
    res.status(200).json({ success: true, workflows })
  } catch (error) {
    console.error("Error fetching workflow status:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// New endpoint to get detailed workflow analytics
router.get("/analytics/:workflowId", async (req, res) => {
  try {
    const { workflowId } = req.params
    const workflow = await AgentWorkflow.findById(workflowId).populate("jobId")

    if (!workflow) {
      return res.status(404).json({ success: false, error: "Workflow not found" })
    }

    // Get additional analytics data
    const analytics = {
      workflow,
      candidateStats: {
        totalInvited: workflow.candidatesToInterview,
        totalCompleted: workflow.results?.topCandidates?.length || 0,
        completionRate: workflow.results?.topCandidates?.length
          ? ((workflow.results.topCandidates.length / workflow.candidatesToInterview) * 100).toFixed(1)
          : 0,
      },
      timeStats: {
        started: workflow.createdAt,
        deadline: workflow.interviewDeadline,
        completed: workflow.status === "Completed" ? workflow.updatedAt : null,
        duration:
          workflow.status === "Completed"
            ? Math.round((new Date(workflow.updatedAt) - new Date(workflow.createdAt)) / (1000 * 60 * 60))
            : null,
      },
    }

    res.status(200).json({ success: true, analytics })
  } catch (error) {
    console.error("Error fetching workflow analytics:", error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router


// import express from "express";
// import { triggerAgenticWorkflow } from "../controllers/aiInterview/agentController.js";
// import JobDescription from "../model/JobDescriptionModel.js";
// import AgentWorkflow from "../model/AgentWorkflowModel.js";

// const router = express.Router();

// router.post("/start", async (req, res) => {
//   try {
//     const { jobId, candidatesToInterview, candidatesToRecommend, companyId, recruiterId } = req.body;

//     if (!jobId || !candidatesToInterview || !candidatesToRecommend || !companyId) {
//       return res.status(400).json({ success: false, error: "Missing required fields" });
//     }

//     const job = await JobDescription.findById(jobId);
//     if (!job) return res.status(404).json({ success: false, error: "Job not found" });

//     await triggerAgenticWorkflow(jobId, candidatesToInterview, candidatesToRecommend, companyId, recruiterId);

//     res.status(200).json({ success: true, message: "Workflow started" });
//   } catch (error) {
//     console.error("Error starting workflow:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// router.get("/status/:jobId", async (req, res) => {
//   try {
//     const { jobId } = req.params;
//     const workflows = await AgentWorkflow.find({ jobId }).sort({ createdAt: -1 });
//     res.status(200).json({ success: true, workflows });
//   } catch (error) {
//     console.error("Error fetching workflow status:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// export default router;