// import JobDescription from "../../model/JobDescriptionModel.js";

// export const updateJobOwner = async (req, res) => {
//   const { id } = req.params;
//   const {  jobOwner } = req.body;

//   try {
//     const job = await JobDescription.findById(id);

//     if (!job) {
//       return res.status(404).json({ message: "Job not found" });
//     }

//     job.jobOwner = {
//       name: jobOwner.name,
//       email: jobOwner.email,
//     };

//     await job.save();
//     res.status(200).json({ message: "Job updated successfully", job });
//   } catch (error) {
//     console.log(error);
//     res.status(500).json({ message: "Server error", error });
//   }
// };

import JobDescription from "../../model/JobDescriptionModel.js";

export const updateJobOwner = async (req, res) => {
  const { jobIds, jobOwner } = req.body;

  try {
    // Use Promise.all to update all jobs concurrently
    const updatedJobs = await Promise.all(
      jobIds.map(async (id) => {
        const job = await JobDescription.findById(id);

        if (job) {
          job.jobOwner = {
            name: jobOwner.name,
            email: jobOwner.email,
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
