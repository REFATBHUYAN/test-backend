import { io } from "../../index.js";
import Notification from "../../model/NotificationModal.js";
import Resume from "../../model/resumeModel.js";

// Controller to get the chat history for the resume
export const getChatHistory = async (req, res) => {
  const { resumeId } = req.query;

  try {
    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    const { questions, answers } = resume.chat;
    const chatHistory = questions.map((question, index) => ({
      type: "question",
      message: question,
      index,
    }));

    // Add answers to the chat history based on their corresponding question
    answers.forEach((answer, index) => {
      if (chatHistory[index]) {
        chatHistory.push({
          type: "answer",
          message: answer,
          index,
        });
      }
    });

    // Sort by index to maintain the conversation order
    chatHistory.sort((a, b) => a.index - b.index);

    res.status(200).json({ chatHistory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Controller to get the last question for the resume
export const getLastQuestion = async (req, res) => {
  const { resumeId } = req.query;

  try {
    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    const lastQuestion =
      resume.chat.questions[resume.chat.questions.length - 1];
    if (!lastQuestion) {
      return res.status(404).json({ message: "No question found" });
    }

    res.status(200).json({ question: lastQuestion });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Controller to submit the answer to the last question
export const submitChatAnswer = async (req, res) => {
  const { resumeId, answer, userId } = req.body;

  try {
    const resume = await Resume.findById(resumeId);
    if (!resume) {
      return res.status(404).json({ message: "Resume not found" });
    }

    // If there's an extra answer (empty string or otherwise), remove it
    if (resume.chat.answers.length > resume.chat.questions.length) {
      resume.chat.answers.pop(); // Remove the last element
    }

    // Find the correct index for the answer (the last unanswered question)
    const lastUnansweredIndex = resume.chat.answers.length;
    console.log("lastUnansweredIndex", lastUnansweredIndex);
    console.log("lastquestionsIndex", resume.chat.questions.length);

    //   if (lastUnansweredIndex >= resume.chat.questions.length) {
    //     return res.status(400).json({ message: "No unanswered questions remaining." });
    //   }

    // Set the answer at the correct index
    resume.chat.answers[lastUnansweredIndex - 1] = answer;

    await resume.save();

    const newNotification = new Notification({
      message: `${resume?.candidateName} Reply on chat`,

      recipientId: userId,

      resumeId: resumeId,
    });

    await newNotification.save();

    // Emit the new notification event to the specific recipient
    io.emit("newNotification", newNotification);

    res.status(200).json({ message: "Answer submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};
