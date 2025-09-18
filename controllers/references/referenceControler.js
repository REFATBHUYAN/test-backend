import Reference from "../../model/referenceModal.js";
import nodemailer from "nodemailer";

// Get references by candidate email
export async function getReferencesByCandidateEmail(req, res) {
  try {
    const { candidateEmail } = req.params;
    const references = await Reference.find({ candidateEmail });
    res.json(references);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching references", error });
  }
}

// Add a new reference
export async function addReference(req, res) {
  try {
    const newReference = new Reference(req.body);
    const savedReference = await newReference.save();
    res.status(201).json(savedReference);
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: "Error adding reference", error });
  }
}

export async function sendReferenceEmail(req, res) {
  try {
    const { id } = req.params;
    const { candidateName, refereeName, refereeEmail, candidateEmail } =
      req.body;

    // Configure email
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const emailOptions = {
      from: process.env.EMAIL_USER,
      to: refereeEmail,
      subject: `Request for reference for ${candidateName}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background: #f9f9f9; border-radius: 10px;">
        <h2 style="color: #333; text-align: center;">Reference Request</h2>
        <p>Dear ${refereeName || "Referee"},</p>

        <p>
          <strong>${
            candidateName || "A candidate"
          }</strong> (with the email <strong>${candidateEmail}</strong>) has requested a reference from you, for jobs he has been apply to.
        </p>

        <p>
          Your input is invaluable and will help in the hiring process.
          Kindly click the button below to provide your reference.
        </p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${
            process.env.FRONTEND_URL
          }/reference-response?referenceId=${id}&candidateName=${candidateName}"
            style="background:rgb(3, 97, 61); color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-size: 16px;">
            Provide Reference
          </a>
        </div>

        <p>
          If you have any questions, feel free to contact ${
            candidateName + " ( " + candidateEmail + " )"
          }.
        </p>

        <p>Thank you for your time and consideration.</p>
        <p>Kind regards,<br>Bloomix</p>
      </div>`,
    };

    await transporter.sendMail(emailOptions);

    res.status(201).json({ message: "Success", emailOptions: emailOptions });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: "Error adding reference", error });
  }
}

// Update a reference
export async function updateReference(req, res) {
  try {
    const { id } = req.params;
    const updatedReference = await Reference.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!updatedReference) {
      return res.status(404).json({ message: "Reference not found" });
    }
    res.json(updatedReference);
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: "Error updating reference", error });
  }
}

// Delete a reference
export async function deleteReference(req, res) {
  try {
    const { id } = req.params;
    const deletedReference = await Reference.findByIdAndDelete(id);
    if (!deletedReference) {
      return res.status(404).json({ message: "Reference not found" });
    }
    res.json({ message: "Reference deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: "Error deleting reference", error });
  }
}

export async function updateReferenceById2(req, res) {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const updatedReference = await Reference.findByIdAndUpdate(
      id,
      { message },
      { new: true }
    );

    if (!updatedReference) {
      return res.status(404).json({ message: "Reference not found" });
    }
    res.json({ message: "Reference updated successfully", updatedReference });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: "Error updating reference", error });
  }
}

export async function updateReferenceById(req, res) {
  try {
    const { id } = req.params;
    const { message, companyName, datesWorked } = req.body;

    const updatedReference = await Reference.findByIdAndUpdate(
      id,
      { message, companyName, datesWorked },
      { new: true }
    );

    if (!updatedReference) {
      return res.status(404).json({ message: "Reference not found" });
    }
    res.json({ message: "Reference updated successfully", updatedReference });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: "Error updating reference", error });
  }
}
