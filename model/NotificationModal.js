import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobDescription",
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CV_Summary",
    },
    isRead: {
      type: Boolean,
      default: false, // Set the default value to false
    },
  },
  { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
