import Resume from "../../model/resumeModel.js";

export const addNotes = async (req, res) => {
  const { noteText, userName, userEmail } = req.body;
  try {
    const resume = await Resume.findById(req.params.resumeId);
    if (!resume) {
      return res.status(404).send("Resume not found");
    }

    const newNote = {
      noteText,
      userName,
      userEmail,
    };

    resume.notes.push(newNote);
    await resume.save();

    res.status(200).json({ message: "Note added successfully", resume });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
