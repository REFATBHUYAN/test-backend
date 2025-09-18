import Resume from "../model/resumeModel.js"

export const getSingleCompanyResumes = async(req,res) => {
    const { companyName } = req.query;

    try {
        let resumes;
        if (companyName) {
            // If a company name is provided, filter resumes by company name
            resumes = await Resume.find({ companyName: companyName });
            res.status(200).json({ 
                message: "Resumes fetched successfully", 
                resumes: resumes, 
                total: resumes.length 
            });
        } else {
            // If no company name is provided, fetch all resumes
            res.status(200).json({ 
                message: "Resumes fetched successfully", 
                resumes: [],
                total: 0 
            });
        }

        
    } catch (error) {
        console.error('Error fetching resumes:', error);
        res.status(500).json({ error: 'Internal Server Error', errMsg: error });
    }
}