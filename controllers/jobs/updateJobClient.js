
import JobDescription from "../../model/JobDescriptionModel.js";

export const updateJobClient = async (req, res) => {
  const { jobIds, jobClient } = req.body;

  try {
    // Use Promise.all to update all jobs concurrently
    const updatedJobs = await Promise.all(
      jobIds.map(async (id) => {
        const job = await JobDescription.findById(id);

        if (job) {
          job.jobClient = {
            name: jobClient.name,
            website: jobClient.website,
          };
          await job.save();
          return job; // Return the updated job
        }
        return null; // Return null if job is not found
      })
    );

    const successfulUpdates = updatedJobs.filter((job) => job !== null);

    if (successfulUpdates.length === 0) {
      return res.status(404).json({ message: "No jobs found" });
    }

    res
      .status(200)
      .json({ message: "Jobs updated successfully", jobs: successfulUpdates });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error", error });
  }
};
