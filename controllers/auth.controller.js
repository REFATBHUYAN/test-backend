import jwt from "jsonwebtoken";
import User from "../model/User.js";
import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";

const transporter = nodemailer.createTransport({
  service: "gmail", // Use your email service provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendNotificationEmail = async (user) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.COMPANY_EMAIL,
    // to: 'cunardconsultingltd@gmail.com',
    subject: "New User Registration",
    html: `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px; background-color: #f9f9f9;">
    <h2 style="text-align: center; color: #4CAF50;">New User Registered</h2>
    <p style="font-size: 16px; color: #333;">A new user has registered:</p>
    <ul style="list-style-type: none; padding: 0;">
      <li style="padding: 10px 0; border-bottom: 1px solid #ddd;"><strong style="color: #555;">First Name:</strong> ${user.firstName}</li>
      <li style="padding: 10px 0; border-bottom: 1px solid #ddd;"><strong style="color: #555;">Last Name:</strong> ${user.lastName}</li>
      <li style="padding: 10px 0; border-bottom: 1px solid #ddd;"><strong style="color: #555;">Email:</strong> ${user.email}</li>
      <li style="padding: 10px 0; border-bottom: 1px solid #ddd;"><strong style="color: #555;">Company:</strong> ${user.company}</li>
      <li style="padding: 10px 0; border-bottom: 1px solid #ddd;"><strong style="color: #555;">Job Role:</strong> ${user.jobRole}</li>
    </ul>
    <p style="font-size: 16px; color: #333;">Thank you for your attention.</p>
    <p style="text-align: center; font-size: 14px; color: #777;">This is an automated notification. Please do not reply to this email.</p>
  </div>
`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Notification email sent");
  } catch (error) {
    console.error("Error sending notification email:", error);
  }
};

export const register = async (req, res) => {
  const {
    firstName,
    lastName,
    company,
    companyId,
    website,
    phoneNumber,
    email,
    password,
    jobRole,
  } = req.body;

  try {
    // Check if user already exists
    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Define the Candidate company IDs
    const candidateCompanyIds = [
      "6741fe9450be1423e009e56c",
      "680cdf89e906de255bddacad",
    ];

    // Check if the provided companyId is one of the Candidate company IDs
    const isCandidateCompany = candidateCompanyIds.includes(companyId);

    // Create new user
    const newUser = new User({
      firstName,
      lastName,
      company,
      companyId,
      website,
      phoneNumber,
      email,
      password,
      jobRole,
      active: true, // Set active to true if companyId is in candidateCompanyIds
      // active: isCandidateCompany, // Set active to true if companyId is in candidateCompanyIds
    });

    await newUser.save();

    // Send notification email
    await sendNotificationEmail(newUser);

    // Generate JWT token
    const payload = { userId: newUser._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, {
      expiresIn: "7d", // More readable than milliseconds
    });

    // Set cookie and respond
    res
      .cookie("token", token, {
        httpOnly: true
      })
      .status(201)
      .json({ message: "User registered" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  console.log(email, password);

  try {
    const user = await User.findOne({ email });
    console.log(user);

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.matchPassword(password);
    console.log(isMatch);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const userObj = user.toObject();
    const { password: userPassword, ...restInfo } = userObj;
    console.log(restInfo);
    const age = 1000 * 60 * 60 * 24 * 7;
    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, {
      expiresIn: age,
    });

    res
      .cookie("token", token, { httpOnly: true })
      .status(200)
      .json({ data: restInfo });
  } catch (err) {
    res.status(500).json(err);
  }
};

export const logout = (req, res) => {
  res.clearCookie("token").status(200).json({ message: "Logout Successful" });
};

// reset password

// Assuming you have a utility to send emails

const sendEmail = async (options) => {
  //  const transporter = nodemailer.createTransport({
  //    service: process.env.EMAIL_SERVICE, // e.g., Gmail
  //    auth: {
  //      user: process.env.EMAIL_USER, // Your email
  //      pass: process.env.EMAIL_PASS, // Your email password
  //    },
  //  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: options.email,
    subject: options.subject,
    html: options.message,
  };

  await transporter.sendMail(mailOptions);
};

export default sendEmail;

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(400)
        .json({ message: "User with this email does not exist" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash the token and set it to the user's record (expires in 1 hour)
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour

    await user.save();

    // Create reset URL
    // const resetUrl = `${req.protocol}://${req.get(
    //   "host"
    // )}/reset-password/${resetToken}`;
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send the email
    // const message = `You are receiving this email because you (or someone else) requested a password reset. Please click on the following link to reset your password: \n\n ${resetUrl}`;

    const message = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dcdcdc; border-radius: 10px; background-color: #f9f9f9;">
    <h2 style="text-align: center; color: #4CAF50;">Password Reset Request</h2>
    <p style="font-size: 16px; color: #333;">Hello,</p>
    <p style="font-size: 16px; color: #333;">
      You are receiving this email because a password reset request for your account was made.
    </p>
    <p style="font-size: 16px; color: #333;">
      Please click the button below to reset your password:
    </p>
    <div style="text-align: center; margin: 20px 0;">
      <a href="${resetUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: #fff; text-decoration: none; border-radius: 5px; font-size: 16px;">Reset Password</a>
    </div>
    <p style="font-size: 14px; color: #777;">
      If you did not request this, please ignore this email.
    </p>
    <p style="text-align: center; font-size: 14px; color: #777;">
      This link will expire in 10 minutes.
    </p>
    <p style="font-size: 14px; color: #777; text-align: center;">
      Thank you for using our service.
    </p>
    <p style="text-align: center; font-size: 12px; color: #999;">This is an automated email. Please do not reply to this message.</p>
  </div>
`;

    await sendEmail({
      email: user.email,
      subject: "Password Reset of Bloomix Website",
      message,
    });

    res.status(200).json({ message: "Reset link sent to your email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    // Hash the token again to match it with the user's record
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user by token and check if token is not expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
