// import Resume from "../../model/resumeModel.js";


// export const updateResumeExpectationsScreening = async (req, res) => {
//   const { resumeIds, expectations } = req.body;

//   try {
//     if (!resumeIds || !expectations) {
//       return res.status(400).json({ message: 'Resume IDs and expectations are required' });
//     }

//     // Update all resumes in one operation
//     await Resume.updateMany(
//       { _id: { $in: resumeIds } },
//       { $set: { expectations: expectations } }
//     );

//     res.status(200).json({ message: 'Expectations updated successfully' });
//   } catch (error) {
//     res.status(500).json({ message: 'Error updating expectations', error });
//   }
// };


import Resume from "../../model/resumeModel.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

export const updateResumeExpectationsAndSendMail = async (req, res) => {
  const { resumeIds, expectations, company, userId } = req.body;
  // const { resumeIds, expectations, frontendUrl } = req.body;

  try {
    if (!resumeIds || !expectations) {
      return res.status(400).json({ message: 'Resume IDs, expectations, and frontend URL are required' });
    }

    // Update all resumes in one operation
    await Resume.updateMany(
      { _id: { $in: resumeIds } },
      { $set: { expectations: expectations, candidateStatus: "Expectations Screening Sent" } }
    );

    // Fetch the updated resumes to get candidate emails
    const updatedResumes = await Resume.find({ _id: { $in: resumeIds } });

    // Configure your email service
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Iterate over updated resumes to send an email to each candidate
    const sendEmails = updatedResumes.map(async (resume) => {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: resume.email, // Assuming the resume document has an 'email' field
        subject: `Invitation to ${company} Expectations Screening - by Bloomix`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
            <h2 style="text-align: center; color: #4CAF50;">Invitation to Q&A Session</h2>
            <p>Dear Candidate,</p>
            <p>We are pleased to invite you to participate in our Expectations Screening session. This session is designed to help us get to know your better and to evaluate you fit for our team.</p>
            <p><strong>Instructions:</strong></p>
            <ol>
              <li>Click the link below to start the Expectations Screening session.</li>
              <li>Answer the questions with YES/NO</li>
              <li>Not more than 5 questions.</li>
            </ol>
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/start-session?resumeId=${resume._id}&userId=${userId}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Q&A Session</a>
            </p>
            <p>If you have any questions, feel free to reply to this email.</p>
            <p>Kind regards,</p>
            <p>Bloomix</p>
            <p>on behalf of ${company}</p>
          </div>
        `,
      };

      return transporter.sendMail(mailOptions);
    });

    // Wait for all emails to be sent
    await Promise.all(sendEmails);

    res.status(200).json({ message: 'Expectations updated and emails sent successfully!' });
  } catch (error) {
    console.error("Error updating expectations or sending email:", error);
    res.status(500).json({ message: 'Error updating expectations or sending email', error });
  }
};
