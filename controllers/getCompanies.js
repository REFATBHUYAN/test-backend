import Company from "../model/companyModel.js";
export const getCompanies = async (req, res) => {
    try {
      const companies = await Company.find(); // Fetch all companies from the database
      res.json(companies);
    } catch (error) {
      console.error('Error fetching companies:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };