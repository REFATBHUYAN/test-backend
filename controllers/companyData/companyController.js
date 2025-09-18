// Assume we have a Company model imported here
// import Company from '../models/Company';
import Company from "../../model/companyModel.js";
import Fees from "../../model/feesModal.js";

export async function getAllCompanies(req, res) {
    try {
      const companies = await Company.find({});
      res.status(200).json(companies);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching companies', error: error.message });
    }
  }
  
  export async function   createSingleCompany2(req, res) {
    try {
      const company = await Company.create(req.body);
      res.status(201).json(company);
    } catch (error) {
      res.status(400).json({ message: 'Error creating company', error: error.message });
    }
  }

  export async function createSingleCompany(req, res) {
    try {
      const company = await Company.create(req.body);
  
      // Automatically create default fees for the new company
      const newFees = new Fees({
        organisationName: company.name,
        organisationId: company._id,
      });
  
      await newFees.save();
  
      res.status(201).json({ message: 'Company and default fees created successfully', company, fees: newFees });
    } catch (error) {
      res.status(400).json({ message: 'Error creating company', error: error.message });
    }
  }
  
  export async function   getCompany(req, res) {
    try {
      const company = await Company.findById(req.params.id);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }
      res.status(200).json(company);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching company', error: error.message });
    }
  }
  
  export async function   updateCompany(req, res) {
    try {
      const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }
      res.status(200).json(company);
    } catch (error) {
      res.status(400).json({ message: 'Error updating company', error: error.message });
    }
  }
  
  export async function   deleteCompany(req, res) {
    try {
      const company = await Company.findByIdAndDelete(req.params.id);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }
      res.status(200).json({ message: 'Company deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting company', error: error.message });
    }
  }

  // 1/31/2025

  export const assignCompanyExess = async (req, res) => {
    try {
      const { companyId, exessIds } = req.body
      const company = await Company.findByIdAndUpdate(companyId, { $set: { companyExessId: exessIds } }, { new: true })
      res.json(company)
    } catch (error) {
      res.status(500).json({ message: "Error assigning company exess", error: error.message })
    }
  }

  export const getSingleCompany = async (req, res) => {
    try {
      const { companyId } = req.params
      const company = await Company.findById(companyId).populate("companyExessId")
      res.json(company)
    } catch (error) {
      res.status(500).json({ message: "Error fetching company", error: error.message })
    }
  }

  export const getAllCompanies2 = async (req, res) => {
    try {
      const companies = await Company.find({}, "name")
      res.json(companies)
    } catch (error) {
      res.status(500).json({ message: "Error fetching companies", error: error.message })
    }
  }
  
  
  