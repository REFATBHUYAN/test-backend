import nodemailer from "nodemailer";
import dotenv from "dotenv";
import Resume from "../model/resumeModel.js";

dotenv.config();

// export const sendChatLink2 = async (req, res) => {
//   const { link, company, resumeIds, jobTitle } = req.body;
//   // const { email, link, company, candidateName, resumeIds } = req.body;

//   console.log("chat link: ", link);

//   try {
//     if (!resumeIds || !link) {
//       return res.status(400).json({
//         message: "Resume IDs, link URL are required",
//       });
//     }

//     // Update all resumes in one operation
//     await Resume.updateMany(
//       { _id: { $in: resumeIds } }, // Match resumes by the provided IDs
//       { $set: { candidateStatus: "Aptitude Test Sent" } }
//     );

//     // Fetch the updated resumes to get candidate emails
//     const updatedResumes = await Resume.find({ _id: { $in: resumeIds } });

//     // Configure your email service
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//       },
//     });

//     // Iterate over updated resumes to send an email to each candidate
//     const sendEmails = updatedResumes.map(async (resume) => {
//       const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: resume.email, // Assuming the resume document has an 'email' field
//         subject: `Congratulations, Shortlisted for ${jobTitle} with ${company} - by Bloomix`,
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
//             <h2 style="text-align: center; color: #4CAF50;">Invitation to Aptitude Test</h2>
//             <p>Dear ${resume?.candidateName ? resume?.candidateName : "Candidate"},</p>
//             <p>We are pleased to invite you to participate in our Aptitude Test session following your application for ${jobTitle} at ${company}. This session consists of no more than 10 questions designed to help us get to know you better and to evaluate your skills and experience.</p>
//             <p><strong>Instructions:</strong></p>
//             <ol>
//                 <li>Click the link below to start the Aptitude Tests.</li>
//                 <li>Answer the questions to the best of your ability.</li>
//                 <li>Submit answers.</li>
//             </ol>
//             <p style="text-align: center;">
//               <a href="${link}&resumeId=${resume._id}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Aptitude Test</a>
//             </p>
//             <p>If you have any questions, feel free to reply to this email.</p>
//             <p>Kind regards,</p>
//             <p>Bloomix</p>
//             <p>on behalf of ${company}</p>
//           </div>
//         `,
//       };

//       return transporter.sendMail(mailOptions);
//     });

//     // Wait for all emails to be sent
//     await Promise.all(sendEmails);

//     // After emails are sent, update the status of all resumes to "Selected for Aptitude Testing"
//     await Resume.updateMany(
//       { _id: { $in: resumeIds } }, // Match resumes by the provided IDs
//       { $set: { candidateStatus: "Selected for Aptitude Testing" } } // Update the candidate status
//     );

//     res.status(200).json({ message: "Chat link sent successfully!" });
//   } catch (error) {
//     console.error("Error sending chat link email:", error);
//     res.status(500).json({ message: "Error sending chat link email", error });
//   }
// };

export const sendChatLink2 = async (req, res) => {
  const { link, company, resumeIds, jobTitle } = req.body;

  console.log("chat link: ", link);

  try {
    if (!resumeIds || !link) {
      return res.status(400).json({
        message: "Resume IDs and link URL are required",
      });
    }

    // Update all resumes to "Selected for Aptitude Testing" and append to jobStatus
    await Resume.updateMany(
      { _id: { $in: resumeIds } },
      {
        $set: { candidateStatus: "Selected for Aptitude Testing" },
        $addToSet: { jobStatus: "Selected for Aptitude Testing" }, // Append to jobStatus
      }
    );

    // Fetch resumes to get candidate emails
    const updatedResumes = await Resume.find({ _id: { $in: resumeIds } });

    // Configure email service
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    let sentCount = 0;
    let failedEmails = [];

    // Iterate over resumes and send emails
    for (const resume of updatedResumes) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: resume.email,
        subject: `Congratulations, Shortlisted for ${jobTitle} with ${company} - by Bloomix`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">Invitation to Aptitude Test</h2>
            <p>Dear ${resume?.candidateName || "Candidate"},</p>
            <p>We are pleased to invite you to participate in our Aptitude Test session following your application for ${jobTitle} at ${company}. This session consists of no more than 10 questions designed to help us get to know you better and to evaluate your skills and experience.</p>
            <p><strong>Instructions:</strong></p>
            <ol>
                <li>Click the link below to start the Aptitude Tests.</li>
                <li>Answer the questions to the best of your ability.</li>
                <li>Submit answers.</li>
            </ol>
            <p style="text-align: center;">
              <a href="${link}&resumeId=${
          resume._id
        }" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Aptitude Test</a>
            </p>
            <p>If you have any questions, feel free to reply to this email.</p>
            <p>Kind regards,</p>
            <p>Bloomix</p>
            <p>on behalf of ${company}</p>
          </div>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        sentCount++;

        // Update only the specific resume to "Aptitude Test Sent" and append to jobStatus
        await Resume.updateOne(
          { _id: resume._id },
          {
            $set: { candidateStatus: "Aptitude Test Sent" },
            $addToSet: { jobStatus: "Aptitude Test Sent" }, // Append to jobStatus
          }
        );
      } catch (error) {
        console.error(
          `Failed to send email to ${resume.email}:`,
          error.message
        );
        failedEmails.push(resume.email);
      }
    }

    res.status(200).json({
      message: `Emails sent successfully to ${sentCount} candidates.`,
      failedEmails,
    });
  } catch (error) {
    console.error("Error processing chat link emails:", error);
    res
      .status(500)
      .json({ message: "Error processing chat link emails", error });
  }
};
