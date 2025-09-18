import express from "express";
import {
  processPayment,
  confirmPayment,
  handleWebhook,
  getUserSubscription,
  cancelSubscription,
  initializeStripeProducts,
} from "./paymentController.js";

const router = express.Router();

// Initialize Stripe products on server start
initializeStripeProducts().then((success) => {
  if (success) {
    console.log("Stripe products initialized successfully");
  } else {
    console.error("Failed to initialize Stripe products");
  }
});

// Process payment
router.post("/v1/api/payment", processPayment);

// Confirm payment (for 3D Secure)
router.post("/v1/api/confirm-payment", confirmPayment);

// Get user subscription status
router.get("/v1/api/subscription/:userId", getUserSubscription);

// Cancel subscription
router.post("/v1/api/cancel-subscription", cancelSubscription);

// Stripe webhook (requires raw body)
router.post(
  "/v1/api/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

export default router;