import { io } from "../../index.js";
import Notification from "../../model/NotificationModal.js";
import Resume from "../../model/resumeModel.js";

// Controller to submit candidate expectations response
export const updateCandidateExpectationResult = async (req, res) => {
  const { resumeId } = req.params;
  const { candidateResponse, userId } = req.body;

  try {
    // Find the resume by ID and update it with the candidate's response and status
    const updatedResume = await Resume.findByIdAndUpdate(
      resumeId,
      {
        $set: {
          'expectations.candidateResponse.salaryRangeResponse': candidateResponse.salaryRangeResponse,
          'expectations.candidateResponse.workLocation': candidateResponse.workLocation,
          'expectations.candidateResponse.workType': candidateResponse.workType,
          'expectations.candidateResponse.hasDrivingLicense': candidateResponse.hasDrivingLicense,
          'expectations.candidateResponse.willingToRelocate': candidateResponse.willingToRelocate,
          'expectations.candidateResponse.others': candidateResponse.others,
          candidateStatus: 'Expectations Screened', // Update candidate status
        },
      },
      { new: true } // Return the updated document
    );

    if (!updatedResume) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    const newNotification = new Notification({
      message: `${updatedResume?.candidateName} Expectation Screened`,

      recipientId: userId,

      resumeId: resumeId,
    },);

    await newNotification.save();

    // Emit the new notification event to the specific recipient
    io.emit("newNotification", newNotification);

    // Send the updated resume data as a response
    res.status(200).json(updatedResume);
  } catch (error) {
    console.error('Error submitting candidate response:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
