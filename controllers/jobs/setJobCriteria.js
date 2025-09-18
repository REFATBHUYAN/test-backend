 // Assuming the model is in the models folder

import JobDescription from "../../model/JobDescriptionModel.js";

export const setJobCriteria = async (req, res) => {
  try {
    const { jobId, criteria } = req.body;

    // Check if jobId and criteria are provided
    if (!jobId || !criteria) {
      return res.status(400).json({ message: "Job ID and criteria are required." });
    }

    // Find the job by ID and update its job_criteria
    const updatedJob = await JobDescription.findByIdAndUpdate(
      jobId,
      { job_criteria: criteria },
      { new: true } // Return the updated document
    );

    if (!updatedJob) {
      return res.status(404).json({ message: "Job not found." });
    }

    // Send success response with the updated job
    res.status(200).json({
      message: "Job criteria updated successfully.",
      job: updatedJob,
    });
  } catch (error) {
    console.error("Error updating job criteria:", error);
    res.status(500).json({ message: "Server error." });
  }
};
