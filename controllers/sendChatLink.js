import nodemailer from "nodemailer";
import dotenv from "dotenv";
// import { Resend } from "resend";

// const resend = new Resend("re_7SvveXyW_L8E7dmUT4npedUxiQP93fGey");

dotenv.config();

export const sendChatLink = async (req, res) => {
  const { email, link, company, candidateName } = req.body;

  // Configure your email service (e.g., Gmail, SendGrid)
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      // pass: process.env.EMAIL_PASS, recovery code "ZW83CXKZV4W7SHTTCJHNEAUA"
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Invitation to ${company} Aptitude Tests - by Bloomix`,
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px;">
                <h2 style="text-align: center; color: #4CAF50;">Invitation to Aptitude Tests</h2>
                <p>Dear ${candidateName},</p>
                <p>We are pleased to invite you to participate in our Aptitude Tests session. This session is designed to help us get to know you better and to evaluate your skills and fit for our team.</p>
                <p><strong>Instructions:</strong></p>
                <ol>
                    <li>Click the link below to start the Aptitude Tests.</li>
                    <li>Answer the questions to the best of your ability.</li>
                    <li>Not more then 10 questions </li>
                </ol>
                <p style="text-align: center;">
                    <a href="${link}" style="display: inline-block; padding: 10px 20px; font-size: 16px; color: #fff; background-color: #4CAF50; text-decoration: none; border-radius: 5px;">Start Q&A Session</a>
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
    res.status(200).json({ message: "Chat link sent successfully!" });

    // below code for send mail with resend email sender

    // await resend.emails.send({
    //   from: "onboarding@resend.dev",
    //   to: email,
    //   subject: "Chat and QnA Link",
    //   html: `<p>Please click the following link to start the chat: <strong>${link}</strong>! Click <a href="${link}">here</a> to start the chat and QnA.</p>`,
    // });
    // res.status(200).json({ message: "Chat link sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: "Error sending email" });
  }
};
