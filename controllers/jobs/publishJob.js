// Controller to toggle publish field
import JobDescription from "../../model/JobDescriptionModel.js";
export const togglePublish = async (req, res) => {
    try {
      const { jobId } = req.params;
      
      // Find the job by its ID
      const job = await JobDescription.findById(jobId);
      
      if (!job) {
        return res.status(404).json({ error: 'Job description not found' });
      }
  
      // Toggle the publish field
      job.publish = !job.publish;
      
      // Save the updated job description
      await job.save();
      
      res.status(200).json({ message: 'Job description publish status updated', publish: job.publish });
    } catch (error) {
      res.status(500).json({ error: 'An error occurred while updating publish status' });
    }
  };
  