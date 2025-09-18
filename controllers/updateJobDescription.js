// import JobDescription from '../model/JobDescriptionModel.js';

// export const updateJobDescription = async (req, res) => {
//     const {job_description} = req.body;
//     console.log(job_description)

//     // const { id, markdown_description } = req.body;

//     // if (!id || !markdown_description) {
//     //     return res.status(400).json({ message: "Job description ID and markdown description are required." });
//     // }

//     try {
//         const jobDescription = new JobDescription(job_description);
//         console.log(jobDescription);

//         await jobDescription.save();

//         return res.status(200).json({ job_description: jobDescription });
//     } catch (error) {
//         return res.status(500).json({ message: "Error updating job description.", error: error.message });
//     }
//     // try {
//     //     const jobDescription = await JobDescription.findById(id);
//     //     if (!jobDescription) {
//     //         return res.status(404).json({ message: "Job description not found." });
//     //     }

//     //     jobDescription.markdown_description = markdown_description;
//     //     await jobDescription.save();

//     //     return res.status(200).json({ job_description: jobDescription });
//     // } catch (error) {
//     //     return res.status(500).json({ message: "Error updating job description.", error: error.message });
//     // }
// };

import JobDescription from "../model/JobDescriptionModel.js";

function convertMarkdownToHTML(markdown) {
  if (!markdown) return "";

  // Convert headers
  let html = markdown
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^### (.*$)/gm, "<h3>$1</h3>");

  // Convert lists
  html = html
    .replace(/^\s*- (.*$)/gm, "<li>$1</li>")
    .replace(/^\s*\* (.*$)/gm, "<li>$1</li>")
    .replace(/^\s*\d+\. (.*$)/gm, "<li>$1</li>");

  // Wrap lists
  html = html.replace(/<li>.*?<\/li>(\n<li>.*?<\/li>)*/gs, (match) => {
    if (match.includes("1. ")) {
      return `<ol>${match}</ol>`;
    }
    return `<ul>${match}</ul>`;
  });

  // Convert bold and italic
  html = html
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<em>$1</em>");

  // Convert links
  html = html.replace(/\[(.*?)\]$$(.*?)$$/g, '<a href="$2">$1</a>');

  // Convert paragraphs (must be done last)
  html = html
    .split("\n\n")
    .map((para) => {
      if (!para.trim()) return "";
      if (
        para.startsWith("<h") ||
        para.startsWith("<ul") ||
        para.startsWith("<ol")
      ) {
        return para;
      }
      return `<p>${para}</p>`;
    })
    .join("");

  return html;
}

export const updateJobDescription = async (req, res) => {
  const { job_description, user_name, user_email, companyId } = req.body;

  try {
    // Check if we have an existing job description to update
    let existingJobDescription = null;
    if (job_description._id) {
      existingJobDescription = await JobDescription.findById(job_description._id);
    }

    if (existingJobDescription) {
      // Update existing job description
      existingJobDescription.context = job_description.context;
      existingJobDescription.company_name = job_description.company_name;
      existingJobDescription.short_description = job_description.short_description;
      existingJobDescription.key_responsibilities = job_description.key_responsibilities;
      existingJobDescription.qualifications = job_description.qualifications;
      existingJobDescription.experience_required = job_description.experience_required;
      existingJobDescription.other_relevant_details = job_description.other_relevant_details;
      existingJobDescription.markdown_description = job_description.markdown_description;
      existingJobDescription.html_description = job_description.html_description; // Update HTML content
      existingJobDescription.topskills = job_description.topskills;
      existingJobDescription.topresponsibilityskills = job_description.topresponsibilityskills;
      existingJobDescription.topqualificationskills = job_description.topqualificationskills;
      
      // Add modification history
      existingJobDescription.modifications.push({
        user_name,
        user_email,
        date: new Date(),
      });

      await existingJobDescription.save();
      
      return res.status(200).json({ job_description: existingJobDescription });
    } else {
      // Create new job description
      const newJobDescription = new JobDescription({
        ...job_description,
        created_by: {
          user_name,
          user_email,
        },
        assignee: {
          name: user_name,
          email: user_email,
          assignDate: new Date(),
        },
        jobOwner: {
          name: user_name,
          email: user_email,
          assignDate: new Date(),
        },
        companyId,  // Adding companyId to the new job description
        // Make sure html_description is included
        html_description: job_description.html_description || convertMarkdownToHTML(job_description.markdown_description),
      });

      await newJobDescription.save();

      return res.status(200).json({ job_description: newJobDescription });
    }
  } catch (error) {
    console.log("server error", error);
    return res
      .status(500)
      .json({
        message: "Error creating/updating job description.",
        error: error.message,
      });
  }
};

export const updateJobDescription2 = async (req, res) => {
  const { job_description, user_name, user_email, companyId } = req.body;

  try {
    const newJobDescription = new JobDescription({
      ...job_description,
      created_by: {
        user_name,
        user_email,
      },
      assignee: {
        name: user_name,
        email: user_email,
        assignDate: new Date(),
      },
      jobOwner: {
        name: user_name,
        email: user_email,
        assignDate: new Date(),
      },
      companyId,  // Adding companyId to the new job description
      html_description: job_description.html_description || convertMarkdownToHTML(job_description.markdown_description),
    });

    await newJobDescription.save();

    return res.status(200).json({ job_description: newJobDescription });
  } catch (error) {
    console.log("server error", error)
    return res
      .status(500)
      .json({
        message: "Error creating job description.",
        error: error.message,
      });
  }
};

