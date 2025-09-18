import JobDescription from "../../model/JobDescriptionModel.js";


export const getSingleJob = async (req, res) => {
  try {
    // Use Mongoose's findById to fetch the job by its ID
    const job = await JobDescription.findById(req.params.id);
    
    // If the job is not found, return a 404 error
    if (!job) {
      return res.status(404).send({ error: 'Job not found' });
    }
    
    // Return the found job
    res.json(job);
  } catch (error) {
    // Handle any server errors
    res.status(500).send({ error: 'Server error' });
  }
};
