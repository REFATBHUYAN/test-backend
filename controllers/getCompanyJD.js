import JobDescription from "../model/JobDescriptionModel.js"; // Import the model

export const getCompanyJD = async (req, res) => {
  const { company_name } = req.query;

  if (!company_name) {
    return res.status(400).json({ message: "No company name provided." });
  }

  try {
    const jobDescriptions = await JobDescription.find({
      company_name: company_name,
    });

    if (jobDescriptions.length === 0) {
      return res
        .status(404)
        .json({
          message: "No job descriptions found for the provided company name.",
        });
    }

    return res.status(200).json(jobDescriptions);
  } catch (error) {
    return res
      .status(500)
      .json({
        message: "Error retrieving job descriptions.",
        error: error.message,
      });
  }
};
