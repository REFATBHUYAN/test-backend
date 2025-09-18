import mongoose from "mongoose";
// import Resume from "../Bloomix_API/model/resumeModel.js"; // Adjust the path as necessary
import connectDB from "./db/index.js";
import dotenv from "dotenv";
import Resume from "./model/resumeModel.js";
import User from "./model/User.js";
import Company from "./model/companyModel.js";
import QuestionAnswerScore from "./model/questionAnswerScoreModel.js";
import Notification from "./model/NotificationModal.js";
import JobDescription from "./model/JobDescriptionModel.js";
import Fees from "./model/feesModal.js";
import Candidate from "./model/candidateModal.js";
import { ChatOpenAI } from "@langchain/openai";

dotenv.config();

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY, // Ensure your API key is loaded from .env
//   model: "gpt-4",
//   temperature: 0.3,
// });
const openai = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4-turbo", // Use "gpt-4" if turbo is unavailable
  temperature: 0.2,
});
// Connect to MongoDB
// mongoose.connect(process.env.MONGO_URI)
//     .then(() => { console.log("MongoDB connected"); checkAndUpdateResumes(); })
//     .catch(err => console.error("MongoDB connection error:", err));

// const checkAndUpdateResumes = async () => {
//     try {
//         // Find documents without the averageScore field
//         const resumesWithoutAverageScore = await Resume.find({ averageScore: { $exists: false } });

//         // Print out the documents to see if there are any matches
//         console.log("Resumes without averageScore:", resumesWithoutAverageScore);

//         // If there are documents without the averageScore field, update them
//         if (resumesWithoutAverageScore.length > 0) {
//             const result = await Resume.updateMany(
//                 { averageScore: { $exists: false } }, // Find documents without the averageScore field
//                 { $set: { averageScore: null } } // Set the averageScore field to null or a default value
//             );
//             console.log(`Updated ${result.modifiedCount} documents.`); // Use modifiedCount to get the number of modified documents
//         } else {
//             console.log("No documents found that need updating.");
//         }
//     } catch (error) {
//         console.error('Error updating resumes:', error.message);
//     } finally {
//         mongoose.connection.close();
//     }
// };

// checkAndUpdateResumes();

// Connect to MongoDB
// export const checkAndUpdateResumes = async () => {
//   try {
//       // Find and log some sample documents to understand the structure
//       const sampleResumes = await Resume.find({});
//       console.log("Sample Resumes:", sampleResumes);

//       // Find documents without the averageScore field or with null averageScore
//       const resumesWithoutAverageScore = await Resume.find({
//           $or: [
//               { averageScore: { $exists: false } },
//               { averageScore: null }
//           ]
//       });

//       // Print out the documents to see if there are any matches
//       console.log("Resumes without or with null averageScore:", resumesWithoutAverageScore);

//       // If there are documents without the averageScore field, update them
//       if (resumesWithoutAverageScore.length > 0) {
//           const result = await Resume.updateMany(
//               { $or: [
//                   { averageScore: { $exists: false } },
//                   { averageScore: null }
//               ] }, // Find documents without the averageScore field or with null averageScore
//               { $set: { averageScore: null } } // Set the averageScore field to null or a default value
//           );
//           console.log(`Updated ${result.modifiedCount} documents.`); // Use modifiedCount to get the number of modified documents
//       } else {
//           console.log("No documents found that need updating.");
//       }
//   } catch (error) {
//       console.error('Error updating resumes:', error.message);
//   } finally {
//       // mongoose.connection.close();
//   }
// };

export const checkAndUpdateResumes = async () => {
  const resumeId = "66935ade84e2532160feee7c"; // Replace with the actual resumeId
  // Retrieve resume using resumeId and update with averageScore
  const resumeIdObjectId = new mongoose.Types.ObjectId(resumeId);
  console.log("resumeid object id resume", resumeIdObjectId);
  const resume = await Resume.findById(resumeIdObjectId);
  console.log("resumeid resume", resume);
  if (!resume) {
    return res.status(404).json({ message: "Resume not found." });
  }

  console.log("resumeid resume", resume);
};

// await mongoose.connect(process.env.MONGO_URI)
//     .then(() => { console.log("MongoDB connected"); checkAndUpdateResumes(); })
//     .catch(err => console.error("MongoDB connection error:", err));
export const updateUsers = async () => {
  try {
    // Connect to your MongoDB
    //   await mongoose.connect('your-mongodb-connection-string', {
    //     useNewUrlParser: true,
    //     useUnifiedTopology: true,
    //   });
    await connectDB();

    // Update existing users to include default values for the new fields
    await Resume.updateMany(
      {}, // This matches all documents
      {
        $set: {
          selected: false, // or any default value you prefer
        },
      }
    );
    // await User.updateMany(
    //   {}, // This matches all documents
    //   {
    //     $set: {
    //       active: false,
    //       jobRule: "Internal Recruiter", // or any default value you prefer
    //     },
    //   }
    // );

    console.log("Users updated successfully.");
  } catch (error) {
    console.error("Error updating users:", error);
  } finally {
    // Close the connection
    //   mongoose.connection.close();
  }
};

export const createCompany = async (req, res) => {
  try {
    // Define demo data
    const demoCompanies = [
      {
        name: "Candidate",
        website: "",
        address: "bloomix",
        phoneNumber: "+123456",
      },
    ];
    // const demoCompanies = [
    //   {
    //     name: "Bloomix Inc.",
    //     website: "https://www.bloomix.co.uk",
    //     address: "123 Innovation Drive, Tech City, TX 75001",
    //     phoneNumber: "+44 20 7946 0958",
    //   },
    //   {
    //     name: "Cunard Consulting Limited",
    //     website: "https://www.cunardconsulting.com/",
    //     address:
    //       "Unit 1, Derwent Business Centre, Clarke Street, Derby, United Kingdom, DE1 2BU",
    //     phoneNumber: "+1 650-123-4567",
    //   },
    //   {
    //     name: "Creative Labs",
    //     website: "https://www.creativelabs.org",
    //     address: "789 Creative Lane, Design District, NY 10001",
    //     phoneNumber: "+1 212-987-6543",
    //   },
    // ];

    // Insert demo data into the database
    await Company.insertMany(demoCompanies);
    console.log("Company Created successfully.");

    // res
    //   .status(201)
    //   .json({ message: "Companies added successfully!", demoCompanies });
  } catch (error) {
    console.error("Error updating users:", error);
  }
};

// Adjust the path to where your Resume model is located

// Function to update candidate status in existing resumes
// Function to update candidate status in existing resumes
export const updateCandidateStatus = async (req, res) => {
  try {
    // Update resumes where the selected field is true
    const selectedUpdated = await Resume.updateMany(
      { selected: true },
      { $set: { candidateStatus: "Selected for Expectations Screening" } }
    );

    // Log the number of resumes updated in the first query
    console.log(
      `${selectedUpdated.modifiedCount} resumes updated to 'Selected for Expectations Screening'.`
    );

    // Update resumes where the candidateStatus field is missing
    // const appliedUpdated = await Resume.updateMany(
    //   { candidateStatus: { $exists: false } },
    //   { $set: { candidateStatus: "Screened" } }
    // );

    // Update resumes where the candidateStatus is "Applied" to "Screened"
    const appliedToScreenedUpdated = await Resume.updateMany(
      { candidateStatus: "Applied" },
      { $set: { candidateStatus: "Screened" } }
    );

    // Log the number of resumes updated in the second query
    console.log(
      `${appliedToScreenedUpdated.modifiedCount} resumes updated to 'Applied'.`
    );
    // console.log(`${appliedUpdated.modifiedCount} resumes updated to 'Applied'.`);

    // Respond to the client
    res.status(200).json({
      message: "Candidate status updated successfully.",
      selectedUpdated: selectedUpdated.modifiedCount,
      appliedUpdated: appliedUpdated.modifiedCount,
    });
  } catch (error) {
    console.error(
      "An error occurred while updating candidate statuses:",
      error
    );
    res
      .status(500)
      .json({ error: "An error occurred while updating candidate statuses." });
  }
};
// Second function to handle status mapping updates
export const updateCandidateStatus2 = async (req, res) => {
  const statusMapping = {
    "Selected for Expectations Screening": "Expectations Screening Sent",
    "Selected for Aptitude Testing": "Aptitude Test Sent",
    // Add any additional mappings as needed
  };

  try {
    // Fetch all resumes that match the existing statuses in the mapping
    const resumes = await Resume.find({
      candidateStatus: { $in: Object.keys(statusMapping) },
    });

    if (resumes.length === 0) {
      return res.status(404).json({
        message: "No resumes found with the specified statuses to update.",
      });
    }

    // Apply updates using `bulkWrite` for better performance
    const bulkOps = resumes.map((resume) => ({
      updateOne: {
        filter: { _id: resume._id },
        update: {
          $set: { candidateStatus: statusMapping[resume.candidateStatus] },
        },
      },
    }));

    const result = await Resume.bulkWrite(bulkOps);
    console.log(
      `Updated ${result.modifiedCount} resumes to new statuses based on mappings.`
    );

    res.status(200).json({
      message: "Candidate status mappings updated successfully.",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating statuses:", error);
    res
      .status(500)
      .json({ error: "An error occurred while updating statuses." });
  }
};

// Function to add linkedinLink to all existing resumes if not present
export const addLinkedInField = async () => {
  try {
    // Update all resumes, adding linkedinLink field with null value if it doesn't already exist
    await Resume.updateMany(
      { linkedinLink: { $exists: false } }, // Condition: if linkedinLink doesn't exist
      { $set: { linkedinLink: null } } // Action: set linkedinLink to null
    );

    console.log("LinkedIn link field added to existing resumes.");
  } catch (error) {
    console.error("Error updating resumes with linkedinLink:", error.message);
  }
};

// Controller function to update all resumes with QuestionAnswerScores
export const updateAllResumesWithQuestionAnswerScores = async (req, res) => {
  try {
    // 1. Fetch all QuestionAnswerScore documents from the database
    const questionAnswerScores = await QuestionAnswerScore.find();

    if (questionAnswerScores.length === 0) {
      return res.status(404).json({ message: "No QuestionAnswerScores found" });
    }

    // 2. Loop through each QuestionAnswerScore and update the respective Resume
    const updateResults = [];

    for (const questionAnswerScore of questionAnswerScores) {
      const resumeId = questionAnswerScore.resumeId;

      // Find the Resume associated with this QuestionAnswerScore
      const resume = await Resume.findById(resumeId);

      if (resume) {
        // Push the current QuestionAnswerScore data into the resume's questionAnswerScores array
        // resume.questionAnswerScores.push({
        //   resumeId: questionAnswerScore.resumeId,
        //   jobId: questionAnswerScore.jobId,
        //   qId: questionAnswerScore.qId,
        //   scores: questionAnswerScore.scores,
        //   averageScore: questionAnswerScore.averageScore,
        //   percentageScore: questionAnswerScore.percentageScore,
        // });
        resume.candidateStatus = "Aptitude Tests Assessed";

        // Save the updated Resume
        await resume.save();

        // Track successful updates
        updateResults.push({
          resumeId: resume._id,
          status: "Updated successfully",
        });
      } else {
        // Track if a Resume was not found
        updateResults.push({
          resumeId: resumeId,
          status: "Resume not found",
        });
      }
    }

    // 3. Send the update results as a response
    res.status(200).json({
      message: "Resumes updated with QuestionAnswerScores",
      results: updateResults,
    });
  } catch (error) {
    console.error("Error updating resumes:", error);
    res.status(500).json({
      message: "Failed to update resumes with QuestionAnswerScores",
      error: error.message,
    });
  }
};
// Controller function to update all resumes with QuestionAnswerScores
export const addDemoNotifications = async (req, res) => {
  try {
    const demoNotifications = [
      {
        message: "Your resume has been received for the job opening.",

        recipientId: "66d195048390f8732a7e1a2d",

        resumeId: "66e962f4f6b53d9a1e0541ad",
      },
      {
        message: "Your application is under review.",

        recipientId: "66d195048390f8732a7e1a2d",

        resumeId: "66e962f4f6b53d9a1e0541ad",
      },
      {
        message: "Your interview is scheduled for next week.",
        companyId: "666879e3adac5f22bb5e38a8",
        recipientId: "66d195048390f8732a7e1a2d",

        resumeId: "66e962f4f6b53d9a1e0541ad",
      },
    ];
    const demoNotifications2 = [
      {
        message: "Your resume has been received for the job opening.",
        // companyId: '666879e3adac5f22bb5e38a8',
        recipientId: "66d195048390f8732a7e1a2d",
        // jobId: '666879e3adac5f22bb5e38a8',
        resumeId: "66e962f4f6b53d9a1e0541ad",
      },
      {
        message: "Your application is under review.",
        // companyId: '666879e3adac5f22bb5e38a8',
        recipientId: "66d195048390f8732a7e1a2d",
        // jobId: '666879e3adac5f22bb5e38a8',
        resumeId: "66e962f4f6b53d9a1e0541ad",
      },
      {
        message: "Your interview is scheduled for next week.",
        companyId: "666879e3adac5f22bb5e38a8",
        recipientId: "66d195048390f8732a7e1a2d",
        // jobId: '666879e3adac5f22bb5e38a8',
        resumeId: "66e962f4f6b53d9a1e0541ad",
      },
    ];

    // Save demo notifications to the database
    await Notification.insertMany(demoNotifications);

    res.status(201).json({ message: "Demo notifications added successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Error adding demo notifications", error });
  }
};

export const updateNotifications = async () => {
  try {
    // Connect to the MongoDB database

    // Update all existing notifications to include isRead: false
    await Notification.updateMany({}, { $set: { isRead: false } });

    console.log("All notifications updated successfully!");
  } catch (error) {
    console.error("Error updating notifications:", error);
  }
};

export const updateUsersWithCompanyId = async () => {
  try {
    // Fetch all companies
    const companies = await Company.find({});
    console.log(`Fetched ${companies.length} companies`);

    // Create a map of company names to company IDs for easy look-up
    const companyMap = new Map();
    companies.forEach((company) => {
      companyMap.set(company.name.trim().toLowerCase(), company._id);
    });

    // Fetch all users without a companyId but with a valid company name
    const users = await User.find({
      companyId: { $exists: false },
      company: { $exists: true, $ne: "" },
    });
    console.log(`Fetched ${users.length} users without companyId`);

    // Prepare bulk update operations
    const bulkOps = users
      .map((user) => {
        const companyName = user.company.trim().toLowerCase();
        const companyId = companyMap.get(companyName);
        if (companyId) {
          return {
            updateOne: {
              filter: { _id: user._id },
              update: { $set: { companyId } },
            },
          };
        }
        return null;
      })
      .filter((op) => op !== null);

    // Execute the bulk update
    if (bulkOps.length > 0) {
      const result = await User.bulkWrite(bulkOps);
      console.log(
        `Successfully updated ${result.modifiedCount} users with companyId`
      );
    } else {
      console.log("No users to update");
    }
  } catch (error) {
    console.error("Error updating users with companyId:", error);
  }
};

export const updateJobDescriptionsWithCompanyId = async () => {
  try {
    // Fetch all JobDescriptions without companyId
    const jobDescriptions = await JobDescription.find({
      companyId: { $exists: false },
    });
    console.log("without companyid ", jobDescriptions.length);

    for (let job of jobDescriptions) {
      // Find the corresponding company by name
      const company = await Company.findOne({ name: job.company_name });

      if (company) {
        // Update jobDescription with the companyId
        job.companyId = company._id;
        await job.save();
        console.log(
          `Updated Job Description ID: ${job._id} with companyId: ${company._id}`
        );
      } else {
        console.log(`No company found for ${job.company_name}`);
      }
    }
    console.log("Job descriptions update completed.");
  } catch (err) {
    console.error("Error updating job descriptions:", err);
  }
};

export const migrateCompanyId2 = async () => {
  try {
    const resumes = await Resume.find({});

    let updatedCount = 0; // To track the total number of updates
    let notfoundCount = 0; // To track the total number of updates

    for (let resume of resumes) {
      const company = await Company.find({ name: resume.companyName });
      // const company = await Company.findById(resume.companyName);
      console.log("total company", company.length);

      if (company) {
        resume.companyId = company._id;
        await resume.save();
        updatedCount++; // Increment the count for each successful update
        // console.log(`Updated Resume ID: ${resume._id} with ObjectId Company ID: ${company._id}`);
      } else {
        notfoundCount++; // Increment the count for each unsuccessful update
        // console.log(`No Company found for Resume ID: ${resume._id} with Company ID: ${resume.companyId}`);
        // Handle cases where the company doesn't exist
        // e.g., create a new Company or set companyId to null
      }
    }

    console.log(`Migration completed. Total resumes updated: ${updatedCount}`);
    console.log(
      `Migration completed. Total resumes notupdated: ${notfoundCount}`
    );
  } catch (error) {
    console.error("Migration failed:", error);
  }
};

export const migrateCompanyId = async () => {
  try {
    const resumes = await Resume.find({ companyId: { $exists: false } });
    // const resumes = await Resume.find({ companyName: { $type: 'string' } });
    console.log("resume have not companyid", resumes.length);

    let updatedCount = 0; // To track the total number of updates
    let notfoundCount = 0;

    for (let resume of resumes) {
      // Find the company by name instead of by ID
      const company = await Company.findOne({ name: resume.companyName });
      // const company = await Company.findOne({ _id: resume.companyName });

      if (company) {
        resume.companyId = company._id;

        // Save without versioning to avoid VersionError
        await resume.set("companyId", company._id, { versionKey: false });
        await resume.save({ validateBeforeSave: false, versionKey: false });

        updatedCount++; // Increment the count for each successful update
        // console.log(`Updated Resume ID: ${resume._id} with ObjectId Company ID: ${company._id}`);
      } else {
        notfoundCount++;
        // console.log(`No Company found for Resume ID: ${resume._id} with Company Name: ${resume.companyName}`);
      }
    }

    console.log(`Migration completed. Total resumes updated: ${updatedCount}`);
    console.log(
      `Migration completed. Total resumes notupdated: ${notfoundCount}`
    );
  } catch (error) {
    console.error("Migration failed:", error);
  }
};

// Controller to update all job descriptions and set publish field to false
export const setPublishFalseForAll = async (req, res) => {
  try {
    // Update all job descriptions by adding 'publish: false'
    await JobDescription.updateMany({}, { $set: { publish: false } });
    res
      .status(200)
      .json({ message: "All job descriptions updated with publish: false" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred while updating job descriptions" });
  }
};

export async function updateChatDatesForResumesWithChats() {
  try {
    const today = new Date();

    const updatedResumes = await Resume.updateMany(
      {
        $or: [
          { "chat.questions.0": { $exists: true } }, // Checks if questions array has at least one item
          { "chat.answers.0": { $exists: true } }, // Checks if answers array has at least one item
        ],
        "chat.date": { $exists: false }, // Ensures 'date' field doesn't already exist
      },
      { $set: { "chat.date": today } } // Sets chat.date to today's date
    );

    console.log(
      `Updated ${updatedResumes.modifiedCount} resumes with today's date in chat.`
    );
  } catch (error) {
    console.error("Error updating chat dates:", error);
  }
}

export function parseScores2(content, questions, transcriptions) {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line, index) => {
    const match = line.match(/Q(\d+):\s*([\d.]+)\/10\s*-\s*(.*)/);
    if (match) {
      return {
        question: questions[index],
        answer: transcriptions[index],
        score: parseFloat(match[2]),
        feedback: match[3].trim(),
      };
    }
    console.error(`Failed to parse score for question ${index + 1}: ${line}`);
    return {
      question: questions[index],
      answer: transcriptions[index],
      score: 0,
      feedback: "Failed to parse score and feedback.",
    };
  });
}

const content = `Q1: 7/10 - The answer provides a general overview of how the candidate would use their full-stack development experience to enhance software quality assurance processes. However, it lacks specific examples or methodologies that could demonstrate a deeper understanding or practical application of these concepts. Including more detailed strategies or personal experiences could have strengthened the response.
Q2: 9/10 - This answer effectively demonstrates the candidate's ability to adapt and learn new technologies quickly, a crucial skill in the fast-paced tech industry. The candidate outlines their learning process, showing initiative and a hands-on approach, which is commendable. The mention of the positive outcome adds to the strength of the response. Providing a bit more detail on the challenges faced during the learning process could offer deeper insights into the candidate's problem-solving skills.
Q3: 8/10 - The candidate successfully identifies how data analysis techniques can be applied to improve software testing and quality assurance, highlighting the importance of using data to identify patterns and predict issues. This shows a good understanding of the role of data analysis in quality assurance. However, the answer could be improved by including specific examples of data analysis tools or techniques and how they were applied in past projects to yield tangible improvements.`;

const questions = [
  "How would you use your full-stack development experience to enhance our software quality assurance processes?",
  "Describe a situation where you had to quickly learn and implement a new technology. How did you approach it?",
  "How can data analysis techniques be applied to improve software testing and quality assurance?",
];

const transcriptions = [
  "I would leverage my full-stack experience to implement comprehensive testing strategies...",
  "When I needed to learn React Native for a project, I started with official documentation...",
  "Data analysis can be used to identify patterns in bug occurrences and predict potential issues...",
];

// const result = parseScores2(content, questions, transcriptions);
// console.log(JSON.stringify(result, null, 2));

const searchResumeByEmail = async (req, res) => {
  // const { email } = req.params;
  const email = "refatbubt@gmail.com";

  try {
    const resume = await Resume.findOne({ email }).populate({
      path: "jobTitle", // Assuming the jobTitle is now a reference to Job
      model: "JobDescription",
    });

    if (!resume) {
      // return res.status(404).json({ error: "Resume not found" });
      console.error("Resume not found");
    }

    console.log("resume", resume);
    // res.status(200).json(resume);
  } catch (error) {
    // res.status(500).json({ error: "Error searching resume", details: error.message });
    console.error("Error searching resume:", error.message);
  }
};

export const createFeesForAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find();

    if (!companies || companies.length === 0) {
      return res.status(404).json({ message: "No companies found" });
    }

    const createdFees = [];
    for (const company of companies) {
      const existingFees = await Fees.findOne({ organisationId: company._id });
      if (!existingFees) {
        const newFees = new Fees({
          organisationName: company.name,
          organisationId: company._id,
        });
        await newFees.save();
        createdFees.push(newFees);
      }
    }
    console.log("fees created", createdFees);

    res
      .status(201)
      .json({ message: "Fees created for all companies", fees: createdFees });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating fees", error: error.message });
  }
};

// updated fees new filed with value

export const updateExistingFees = async (req, res) => {
  try {
    const result = await Fees.updateMany(
      {},
      {
        $set: {
          freeJobs: 2,
          cvLimit: 150,
        },
      }
    );
    // const result = await Fees.updateMany({}, {
    //   $set: {
    //     basePrice: 300,
    //     costPerAdditionalCV: 0.20,
    //     packageType: 'Small',
    //   },
    // });
    console.log(`${result.modifiedCount} documents updated.`);
    res.status(201).json({
      message: `${result.modifiedCount} documents updated.`,
      fees: result,
    });
  } catch (error) {
    console.error("Error updating fees:", error);
  }
};

// update fees value
export const updateFeesDefaults = async (req, res) => {
  try {
    // const {
    //   screeningBase = 150,
    //   screeningPerCV = 2,
    //   expectationsPerCV = 2,
    //   aptitudeTestsPerCV = 2,
    //   f2fInterviewsPerCV = 2,
    //   basePrice = 600,
    //   costPerAdditionalCV = 15
    // } = req.body;

    // Update schema defaults (if needed dynamically)
    // Fees.schema.path('screening.base').default(screeningBase);
    // Fees.schema.path('screening.perCV').default(screeningPerCV);
    // Fees.schema.path('expectations.perCV').default(expectationsPerCV);
    // Fees.schema.path('aptitudeTests.perCV').default(aptitudeTestsPerCV);
    // Fees.schema.path('f2fInterviews.perCV').default(f2fInterviewsPerCV);
    // Fees.schema.path('basePrice').default(basePrice);
    // Fees.schema.path('costPerAdditionalCV').default(costPerAdditionalCV);

    // Update all existing documents with new values
    const updatedFees = await Fees.updateMany(
      {},
      {
        $set: {
          "screening.base": 150,
          "screening.perCV": 0.3,
          "expectations.perCV": 0.3,
          "aptitudeTests.perCV": 2,
          "f2fInterviews.perCV": 0.2,
          basePrice: 300,
          costPerAdditionalCV: 0.2,
        },
      }
    );

    res.status(200).json({
      message: "Fees updated successfully",
      modifiedCount: updatedFees.modifiedCount,
    });
  } catch (error) {
    console.error("Error updating fees:", error);
    res.status(500).json({ message: "Failed to update fees", error });
  }
};

export const updateCandidateStatus3 = async (req, res) => {
  try {
    const jobTitleId = "675b724e481880bc9dcc9dd8"; // Assuming jobTitleId is passed as a parameter
    const currentStatus = "Aptitude Test Sent";
    const newStatus = "Expectations Screening Sent";

    // Find and update resumes that match the jobTitle and current candidateStatus
    const result = await Resume.updateMany(
      {
        jobTitle: jobTitleId, // jobTitle should match the passed ObjectId
        candidateStatus: currentStatus, // candidateStatus should be "Aptitude Test Sent"
      },
      {
        $set: { candidateStatus: newStatus }, // Set new candidateStatus to "Expectations Screening Sent"
      }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({
        message: `${result.modifiedCount} resumes updated successfully.`,
      });
    } else {
      res.status(404).json({
        message: "No resumes found with the specified criteria.",
      });
    }
  } catch (error) {
    console.error("Error updating resumes:", error);
    res.status(500).json({ message: "Error updating candidate status" });
  }
};

export const createCompanyIdIndex = async (req, res) => {
  try {
    // Ensure that the index for companyId is created on the Resume collection
    await Fees.collection.createIndex({ companyId: 1 }); // 1 for ascending index

    res
      .status(200)
      .json({ message: "Index for companyId created successfully for Fees!" });
  } catch (err) {
    console.error("Error creating index:", err);
    res.status(500).json({ message: "Error creating index", error: err });
  }
};

// Controller to update candidateStatus and populate jobStatus

// Controller to update all resumes in the database
export const updateAllResumesJobStatus2 = async (req, res) => {
  try {
    // Fetch all resumes
    const resumes = await Resume.find();

    // Iterate over each resume and update jobStatus
    for (const resume of resumes) {
      // Ensure jobStatus includes all statuses up to the current candidateStatus
      const allPossibleStatuses = [
        "Screened",
        "Selected for Expectations Screening",
        "Expectations Screening Sent",
        "Expectations Screened",
        "Selected for Aptitude Testing",
        "Aptitude Test Sent",
        "Aptitude Tests Assessed",
        "Hired",
      ];

      // Find the index of the current candidateStatus
      const currentIndex = allPossibleStatuses.indexOf(resume.candidateStatus);

      // Add all statuses up to the current status to jobStatus
      if (currentIndex !== -1) {
        resume.jobStatus = allPossibleStatuses.slice(0, currentIndex + 1);
      }

      // Save the updated resume
      await resume.save();
    }

    return res
      .status(200)
      .json({ message: "All resumes updated successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

export const updateAllResumesJobStatus = async (req, res) => {
  try {
    // Fetch all resumes
    const resumes = await Resume.find();

    // Track any errors encountered during processing
    const errors = [];
    let successCount = 0; // Counter for successfully updated resumes
    let errorCount = 0; // Counter for resumes with errors

    // Iterate over each resume and update jobStatus
    for (const resume of resumes) {
      try {
        // Define all possible statuses
        const allPossibleStatuses = [
          "Screened",
          "Selected for Expectations Screening",
          "Expectations Screening Sent",
          "Expectations Screened",
          "Selected for Aptitude Testing",
          "Aptitude Test Sent",
          "Aptitude Tests Assessed",
          "Hired",
        ];

        // Find the index of the current candidateStatus
        const currentIndex = allPossibleStatuses.indexOf(
          resume.candidateStatus
        );

        // Add all statuses up to the current status to jobStatus
        if (currentIndex !== -1) {
          const newJobStatus = [
            ...new Set([
              ...resume.jobStatus,
              ...allPossibleStatuses.slice(0, currentIndex + 1),
            ]),
          ];
          resume.jobStatus = newJobStatus;
        }

        // Save the updated resume
        await resume.save();
        successCount++; // Increment success counter
      } catch (error) {
        // Log the error but don't stop the loop
        console.error(`Error updating resume ${resume._id}:`, error.message);
        errors.push({
          resumeId: resume._id,
          error: error.message,
        });
        errorCount++; // Increment error counter ERROR ID : 670d3f9f811a7dae3e9b72ce
      }
    }

    // Return success message, counts, and any errors encountered
    return res.status(200).json({
      message: "All resumes processed successfully.",
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

export const updateResumes = async (req, res) => {
  try {
    const jobTitle = "67ab60e5b97f5ad991ec0d1e"; // The job ID to filter resumes
    const newCompanyId = "66bbaa9cdd28ea39eb1caf26"; // The correct company ID
    const newCompanyName = "Bloomix"; // The correct company name

    // Find resumes with the jobId
    const resumes = await Resume.find({ jobTitle });

    if (resumes.length === 0) {
      return res
        .status(404)
        .json({ message: "No resumes found for the given job ID." });
    }

    // Update the companyId and companyName for each resume
    const updatedResumes = await Promise.all(
      resumes.map(async (resume) => {
        resume.companyId = newCompanyId;
        resume.companyName = newCompanyName;
        return resume.save(); // Save the updated resume
      })
    );

    res.status(200).json({
      message: `${updatedResumes.length} resumes updated successfully.`,
      data: updatedResumes,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({
        message: "An error occurred while updating resumes.",
        error: error.message,
      });
  }
};

// Function to extract top skills using OpenAI and update the job descriptions
// async function extractTopSkills(description) {
//   if (!description || description.trim().length === 0) {
//     console.log("Skipping empty description.");
//     return [];
//   }

//   try {
//     const response = await openai.invoke([
//       {
//         role: "system",
//         content: `Extract only the **top 5 most important and commonly required** skills from the job description.
//                   Do **not** include niche or rare skills.
//                   Return only a **comma-separated list** (e.g., JavaScript, React, Node.js, Communication, Teamwork).`
//       },
//       {
//         role: "user",
//         content: `Job Description:\n${description}\n\nExtract the top 5 most essential skills.`
//       },
//     ]);

//     console.log("🔹 OpenAI Response:", response.content); // Debugging output

//     if (!response.content) {
//       return [];
//     }

//     return response.content
//       .split(",")
//       .map(skill => skill.trim())
//       .filter(skill => skill.length > 0);
//   } catch (error) {
//     console.error("❌ Error extracting skills:", error);
//     return [];
//   }
// }

// export async function updateTopSkills() {
//   try {
//     await connectDB();

//     const jobs = await JobDescription.find({ topskills: { $exists: true } });

//     for (const job of jobs) {
//       console.log(`Processing Job ID: ${job._id}`);
//       const skills = await extractTopSkills(job.markdown_description);

//       if (skills.length > 0) {
//         await JobDescription.updateOne({ _id: job._id }, { $set: { topskills: skills } });
//         console.log(`✅ Updated job ID ${job._id} with top skills:`, skills);
//       } else {
//         console.log(`⚠️ No skills extracted for job ID ${job._id}`);
//       }
//     }
//   } catch (error) {
//     console.error("Database Error:", error);
//   } finally {
//     mongoose.connection.close();
//     console.log("MongoDB Disconnected.");
//   }
// }

async function extractSkills(job) {
  const description = job.markdown_description || "";
  const responsibilities = (job.key_responsibilities || []).join(" ");
  const qualifications = (job.qualifications || []).join(" ");

  // Helper function to extract skills from specific content
  const extractFromContent = async (content, type) => {
    if (!content || content.trim().length === 0) {
      console.log(`Skipping empty ${type} content.`);
      return [];
    }

    try {
      const response = await openai.invoke([
        {
          role: "system",
          content: `Extract the **top 5 most important and commonly required** skills from the ${type}.
                    Skills must be:
                    - Commonly required in similar roles
                    - Limited to 1 or 2 words maximum
                    - Not niche or rare skills
                    Return only a **comma-separated list** (e.g., JavaScript, React, Communication, Problem Solving)`,
        },
        {
          role: "user",
          content: `${
            type.charAt(0).toUpperCase() + type.slice(1)
          }:\n${content}\n\nExtract the top 5 most essential skills.`,
        },
      ]);

      console.log(`🔹 OpenAI Response for ${type}:`, response.content);

      if (!response.content) {
        return [];
      }

      return response.content
        .split(",")
        .map((skill) => skill.trim())
        .filter((skill) => {
          const wordCount = skill.split(/\s+/).length;
          return skill.length > 0 && wordCount <= 2;
        })
        .slice(0, 5);
    } catch (error) {
      console.error(`❌ Error extracting ${type} skills:`, error);
      return [];
    }
  };

  // Extract skills from each section
  const [topSkills, topResponsibilitySkills, topQualificationSkills] =
    await Promise.all([
      extractFromContent(description, "description"),
      extractFromContent(responsibilities, "responsibilities"),
      extractFromContent(qualifications, "qualifications"),
    ]);

  return {
    topskills: topSkills,
    topresponsibilityskills: topResponsibilitySkills,
    topqualificationskills: topQualificationSkills,
  };
}

export async function updateTopSkills2() {
  try {
    await connectDB();

    // const jobs = await JobDescription.find();
    // const jobs = await JobDescription.find({
    //   $or: [
    //     { topskills: { $exists: false } },
    //     { topresponsibilityskills: { $exists: false } },
    //     { topqualificationskills: { $exists: false } },
    //     { markdown_description: { $exists: false } },
    //     { key_responsibilities: { $exists: false } },
    //     { qualifications: { $exists: false } }
    //   ]
    // });
    // const jobs = await JobDescription.find({
    //   $or: [
    //     { topskills: { $exists: true } },
    //     { topresponsibilityskills: { $exists: true } },
    //     { topqualificationskills: { $exists: true } },
    //     { markdown_description: { $exists: true } },
    //     { key_responsibilities: { $exists: true } },
    //     { qualifications: { $exists: true } }
    //   ]
    // });

    for (const job of jobs) {
      console.log(`Processing Job ID: ${job._id}`);
      const skills = await extractSkills(job);

      if (
        skills.topskills.length > 0 ||
        skills.topresponsibilityskills.length > 0 ||
        skills.topqualificationskills.length > 0
      ) {
        await JobDescription.updateOne(
          { _id: job._id },
          {
            $set: {
              topskills: skills.topskills,
              topresponsibilityskills: skills.topresponsibilityskills,
              topqualificationskills: skills.topqualificationskills,
            },
          }
        );
        console.log(`✅ Updated job ID ${job._id} with:`);
        console.log(`- Updated job Title:`, job.context);
        console.log(`- Top skills:`, skills.topskills);
        console.log(
          `- Top responsibility skills:`,
          skills.topresponsibilityskills
        );
        console.log(
          `- Top qualification skills:`,
          skills.topqualificationskills
        );
      } else {
        console.log(`⚠️ No skills extracted for job ID ${job._id}`);
      }
    }
  } catch (error) {
    console.error("Database Error:", error);
  } finally {
    mongoose.connection.close();
    console.log("MongoDB Disconnected.");
  }
}
export async function updateTopSkills() {
  try {
    await connectDB();

    // const jobs = await JobDescription.find();
    const targetJobId = "680604200e00146fb10183e4"; // Replace with your target job ID
    const jobs2 = await JobDescription.findById(targetJobId);
    const jobs = [jobs2];

    if (jobs2) {
      console.log("Job Found:", jobs2);
    } else {
      console.log("Job Not Found");
    }
    // const jobs = await JobDescription.find({
    //   $or: [
    //     { topskills: { $exists: false } },
    //     { topresponsibilityskills: { $exists: false } },
    //     { topqualificationskills: { $exists: false } },
    //     { markdown_description: { $exists: false } },
    //     { key_responsibilities: { $exists: false } },
    //     { qualifications: { $exists: false } }
    //   ]
    // });
    // const jobs = await JobDescription.find({
    //   $or: [
    //     { topskills: { $exists: true } },
    //     { topresponsibilityskills: { $exists: true } },
    //     { topqualificationskills: { $exists: true } },
    //     { markdown_description: { $exists: true } },
    //     { key_responsibilities: { $exists: true } },
    //     { qualifications: { $exists: true } }
    //   ]
    // });

    for (const job of jobs) {
      console.log(`Processing Job ID: ${job._id}`);
      const skills = await extractSkills(job);

      if (
        skills.topskills.length > 0 ||
        skills.topresponsibilityskills.length > 0 ||
        skills.topqualificationskills.length > 0
      ) {
        await JobDescription.updateOne(
          { _id: job._id },
          {
            $set: {
              topskills: skills.topskills,
              topresponsibilityskills: skills.topresponsibilityskills,
              topqualificationskills: skills.topqualificationskills,
            },
          }
        );
        console.log(`✅ Updated job ID ${job._id} with:`);
        console.log(`- Updated job Title:`, job.context);
        console.log(`- Top skills:`, skills.topskills);
        console.log(
          `- Top responsibility skills:`,
          skills.topresponsibilityskills
        );
        console.log(
          `- Top qualification skills:`,
          skills.topqualificationskills
        );
      } else {
        console.log(`⚠️ No skills extracted for job ID ${job._id}`);
      }
    }
  } catch (error) {
    console.error("Database Error:", error);
  } finally {
    mongoose.connection.close();
    console.log("MongoDB Disconnected.");
  }
}

// Controller function to update all users with default userType
export const updateUserTypes = async (req, res) => {
  try {
    // Update all users to set userType to "free" if it's not already set
    const updateResult = await User.updateMany(
      { userType: { $exists: false } }, // Find users where userType is not set
      { $set: { userType: "free", downloadCount: 0 } } // Set default values
    );

    // Respond with the result of the update operation
    res.status(200).json({
      success: true,
      message: "All users updated successfully.",
      updatedCount: updateResult.modifiedCount, // Number of users updated
    });
  } catch (error) {
    console.error("Error updating user types:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while updating user types.",
      error: error.message,
    });
  }
};


export const migrateExistingChats = async () => {
  try {
    console.log("Starting chat migration...")

    // Find all resumes with existing chat data
    const resumes = await Resume.find({
      "chat.questions": { $exists: true, $ne: [] },
    })

    console.log(`Found ${resumes.length} resumes with chat data to migrate`)

    for (const resume of resumes) {
      if (resume.chat && resume.chat.questions) {
        // Initialize attachment arrays if they don't exist
        if (!resume.chat.attachments) {
          resume.chat.attachments = []
        }
        if (!resume.chat.answerAttachments) {
          resume.chat.answerAttachments = []
        }

        // Ensure attachment arrays have the same length as questions/answers
        while (resume.chat.attachments.length < resume.chat.questions.length) {
          resume.chat.attachments.push([])
        }
        while (resume.chat.answerAttachments.length < resume.chat.questions.length) {
          resume.chat.answerAttachments.push([])
        }

        await resume.save()
        console.log(`Migrated chat data for resume: ${resume._id}`)
      }
    }

    console.log("Migration completed successfully!")
  } catch (error) {
    console.error("Migration failed:", error)
  }
}

// Run migration
// migrateExistingChats()

// First, let's create a script to check what's actually in the database
// import mongoose from "mongoose"
// import Resume from "./model/resumeModel.js"

export const checkDatabaseAttachments = async () => {
  try {
    // await mongoose.connect(process.env.MONGODB_URI)

    // Find resumes with chat data
    const resumesWithChat = await Resume.find({
      "chat.questions": { $exists: true, $ne: [] },
    }).select("candidateName chat")

    console.log("=== DATABASE ATTACHMENT CHECK ===")

    for (const resume of resumesWithChat) {
      console.log(`\nCandidate: ${resume.candidateName}`)
      console.log(`Resume ID: ${resume._id}`)

      if (resume.chat) {
        console.log(`Questions: ${resume.chat.questions?.length || 0}`)
        console.log(`Answers: ${resume.chat.answers?.length || 0}`)
        console.log(`Attachments: ${resume.chat.attachments?.length || 0}`)
        console.log(`Answer Attachments: ${resume.chat.answerAttachments?.length || 0}`)

        // Check each question's attachments
        if (resume.chat.attachments) {
          resume.chat.attachments.forEach((attachmentArray, index) => {
            console.log(`Question ${index} attachments:`, attachmentArray)
          })
        }

        // Check each answer's attachments
        if (resume.chat.answerAttachments) {
          resume.chat.answerAttachments.forEach((attachmentArray, index) => {
            console.log(`Answer ${index} attachments:`, attachmentArray)
          })
        }
      }
    }

    console.log("=== END DATABASE CHECK ===")
  } catch (error) {
    console.error("Database check error:", error)
  } finally {
    await mongoose.disconnect()
  }
}

// Run this to check your database
// checkDatabaseAttachments()

