// routes/notificationRoutes.js
import express from "express";

import { io } from "../index.js";
import Notification from "../model/NotificationModal.js";

const router = express.Router();

// Add a new notification
// Add a new notification and emit an event
router.post("/add", async (req, res) => {
  const { message, companyId, recipientId, jobId, resumeId } = req.body;

  try {
    const newNotification = new Notification({
      message,
      companyId,
      recipientId,
      jobId,
      resumeId,
    });

    await newNotification.save();

    // Get the socket instance from the app
    //   const io = req.app.get('socketio');

    // Emit the new notification event to the specific recipient
    io.emit("newNotification", newNotification);

    res.status(201).json(newNotification);
  } catch (error) {
    res.status(500).json({ message: "Error creating notification", error });
  }
});

// Mark notification as read
router.put("/mark-as-read/:notificationId", async (req, res) => {
  const { notificationId } = req.params;

  try {
    // Find the notification by ID and update the isRead field
    const updatedNotification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    );

    if (!updatedNotification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    io.emit("notificationRead", updatedNotification);

    res.status(200).json(updatedNotification);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error marking notification as read", error });
  }
});

// Get notifications for a specific user
router.get("/:recipientId", async (req, res) => {
  try {
    const { recipientId } = req.params;
    const notifications = await Notification.find({ recipientId }).sort({
      createdAt: -1,
    });
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications", error });
  }
});

export default router;
