import Stripe from "stripe";
import User from "../../model/User.js"; // Adjust path to your User model

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Stripe products and prices
export const initializeStripeProducts = async () => {
  try {
    // Check if products exist, create if not
    const products = await stripe.products.list({ active: true });
    const requiredProducts = [
      { name: "Pro Subscription", price: 999, interval: "month" }, // £9.99/month
      { name: "Lifetime Access", price: 7900 }, // £79 one-time
    ];

    for (const reqProduct of requiredProducts) {
      let product = products.data.find((p) => p.name === reqProduct.name);
      if (!product) {
        product = await stripe.products.create({
          name: reqProduct.name,
        });
      }

      // Check for price
      const prices = await stripe.prices.list({ product: product.id, active: true });
      if (prices.data.length === 0) {
        await stripe.prices.create({
          product: product.id,
          unit_amount: reqProduct.price,
          currency: "gbp",
          recurring: reqProduct.interval ? { interval: reqProduct.interval } : undefined,
        });
      }
    }
    return true;
  } catch (error) {
    console.error("Error initializing Stripe products:", error);
    return false;
  }
};

// Process payment
export const processPayment = async (req, res) => {
  const { paymentMethodId, planType, userId } = req.body;

  if (!paymentMethodId || !planType || !userId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const products = await stripe.products.list({ active: true });
    let product;
    if (planType === "pro") {
      product = products.data.find((p) => p.name === "Pro Subscription");
    } else if (planType === "lifetime") {
      product = products.data.find((p) => p.name === "Lifetime Access");
    }

    if (!product) {
      return res.status(400).json({ message: "Invalid plan type" });
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    const price = prices.data[0];
    if (!price) {
      return res.status(400).json({ message: "Price not found for the selected plan" });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await createStripeCustomer(user);
      customerId = customer.id;
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

    if (planType === "pro") {
      // Create or update subscription
      let subscription;
      if (user.stripeSubscriptionId) {
        subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
          items: [{ price: price.id }],
          default_payment_method: paymentMethodId,
          payment_behavior: "default_incomplete",
        });
      } else {
        subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: price.id }],
          default_payment_method: paymentMethodId,
          payment_behavior: "default_incomplete",
          expand: ["latest_invoice.payment_intent"],
        });
      }

      // Check if payment requires additional action (e.g., 3D Secure)
      const latestInvoice = subscription.latest_invoice;
      if (latestInvoice.payment_intent && latestInvoice.payment_intent.status === "requires_action") {
        return res.status(200).json({
          requiresAction: true,
          clientSecret: latestInvoice.payment_intent.client_secret,
          subscriptionId: subscription.id,
        });
      }

      // Update user with subscription details
      user.stripeCustomerId = subscription.customer;
      user.stripeSubscriptionId = subscription.id;
      user.userType = "pro";
      user.subscriptionExpiry = new Date(subscription.current_period_end * 1000);
      await user.save();

      return res.status(200).json({ message: "Subscription created successfully" });
    } else {
      // One-time payment for lifetime
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price.unit_amount,
        currency: "gbp",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: false,
        confirm: true,
      });

      if (paymentIntent.status === "requires_action") {
        return res.status(200).json({
          requiresAction: true,
          clientSecret: paymentIntent.client_secret,
        });
      }

      // Update user for lifetime access
      user.userType = "lifetime";
      user.stripeCustomerId = paymentIntent.customer;
      await user.save();

      return res.status(200).json({ message: "Lifetime access granted" });
    }
  } catch (error) {
    console.error("Error processing payment:", error);
    return res.status(500).json({ message: error.message || "Payment processing failed" });
  }
};

// Confirm payment (for 3D Secure)
export const confirmPayment = async (req, res) => {
  const { paymentIntentId, planType, userId, subscriptionId } = req.body;

  if (!paymentIntentId || !planType || !userId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (planType === "pro" && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      user.stripeCustomerId = subscription.customer;
      user.stripeSubscriptionId = subscription.id;
      user.userType = "pro";
      user.subscriptionExpiry = new Date(subscription.current_period_end * 1000);
    } else if (planType === "lifetime") {
      user.userType = "lifetime";
    } else {
      return res.status(400).json({ message: "Invalid plan type" });
    }

    await user.save();
    return res.status(200).json({ message: "Payment confirmed successfully" });
  } catch (error) {
    console.error("Error confirming payment:", error);
    return res.status(500).json({ message: error.message || "Payment confirmation failed" });
  }
};

// Get user subscription status
export const getUserSubscription = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let subscriptionInfo = {
      userType: user.userType || "free",
      downloadCount: user.downloadCount || 0,
    };

    if (user.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      subscriptionInfo.subscriptionExpiry = new Date(subscription.current_period_end * 1000);
    }

    return res.status(200).json(subscriptionInfo);
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return res.status(500).json({ message: "Failed to fetch subscription" });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ message: "No active subscription found" });
    }

    const subscription = await stripe.subscriptions.del(user.stripeSubscriptionId);
    user.userType = "free";
    user.stripeSubscriptionId = null;
    user.subscriptionExpiry = null;
    await user.save();

    return res.status(200).json({ message: "Subscription canceled successfully" });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return res.status(500).json({ message: error.message || "Failed to cancel subscription" });
  }
};

// Handle Stripe webhook
export const handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case "invoice.payment_succeeded":
        const subscriptionId = event.data.object.subscription;
        const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
        if (user) {
          user.subscriptionExpiry = new Date(event.data.object.lines.data[0].period.end * 1000);
          await user.save();
        }
        break;
      case "customer.subscription.deleted":
        const deletedSubscriptionId = event.data.object.id;
        const deletedUser = await User.findOne({ stripeSubscriptionId: deletedSubscriptionId });
        if (deletedUser) {
          deletedUser.userType = "free";
          deletedUser.stripeSubscriptionId = null;
          deletedUser.subscriptionExpiry = null;
          await deletedUser.save();
        }
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(400).json({ message: "Webhook error" });
  }
};

// Helper: Create Stripe customer
const createStripeCustomer = async (user) => {
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
  });
  user.stripeCustomerId = customer.id;
  await user.save();
  return customer;
};


// import Stripe from "stripe"
// import User from "../../model/User.js" // Adjust path as needed

// // Initialize Stripe with your secret key
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// // Store product and price IDs to avoid creating new ones each time
// // In a production app, you would store these in your database
// const PRODUCTS = {
//   pro: {
//     id: null,
//     priceId: null,
//   },
//   lifetime: {
//     id: null,
//     priceId: null,
//   },
// }

// // Initialize products and prices
// export const initializeStripeProducts = async () => {
//   try {
//     // Create Pro product and price if not already created
//     if (!PRODUCTS.pro.id) {
//       const proProduct = await stripe.products.create({
//         name: "Pro Plan Subscription",
//         description: "Monthly subscription for Pro plan with unlimited downloads",
//         metadata: { plan_type: "pro" },
//       })
//       PRODUCTS.pro.id = proProduct.id

//       const proPrice = await stripe.prices.create({
//         product: proProduct.id,
//         unit_amount: 999, // £9.99
//         currency: "gbp",
//         recurring: {
//           interval: "month",
//         },
//         nickname: "Monthly Pro Plan",
//       })
//       PRODUCTS.pro.priceId = proPrice.id

//       console.log("Created Pro product and price:", PRODUCTS.pro)
//     }

//     // Create Lifetime product and price if not already created
//     if (!PRODUCTS.lifetime.id) {
//       const lifetimeProduct = await stripe.products.create({
//         name: "Lifetime Access",
//         description: "One-time payment for lifetime access",
//         metadata: { plan_type: "lifetime" },
//       })
//       PRODUCTS.lifetime.id = lifetimeProduct.id

//       const lifetimePrice = await stripe.prices.create({
//         product: lifetimeProduct.id,
//         unit_amount: 7900, // £79
//         currency: "gbp",
//         nickname: "Lifetime Access",
//       })
//       PRODUCTS.lifetime.priceId = lifetimePrice.id

//       console.log("Created Lifetime product and price:", PRODUCTS.lifetime)
//     }

//     return true
//   } catch (error) {
//     console.error("Error initializing Stripe products:", error)
//     return false
//   }
// }

// // Process payment and update user
// export const processPayment = async (req, res) => {
//   try {
//     console.log("Payment request received:", req.body)
//     const { paymentMethodId, planType, userId } = req.body

//     if (!paymentMethodId || !planType || !userId) {
//       console.error("Missing required fields:", { paymentMethodId, planType, userId })
//       return res.status(400).json({ message: "Missing required payment information" })
//     }

//     // Ensure products are initialized
//     if (!PRODUCTS.pro.id || !PRODUCTS.lifetime.id) {
//       await initializeStripeProducts()
//     }

//     // Find the user in the database
//     const user = await User.findById(userId)

//     if (!user) {
//       console.error("User not found:", userId)
//       return res.status(404).json({ message: "User not found" })
//     }

//     console.log("Processing payment for user:", user.email)

//     // Create or retrieve customer
//     let customerId = user.stripeCustomerId

//     if (!customerId) {
//       console.log("Creating new Stripe customer")
//       const customer = await stripe.customers.create({
//         email: user.email,
//         name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
//         payment_method: paymentMethodId,
//         invoice_settings: {
//           default_payment_method: paymentMethodId,
//         },
//         metadata: {
//           userId: user._id.toString(),
//         },
//       })

//       customerId = customer.id
//       user.stripeCustomerId = customerId
//       await user.save()
//       console.log("Created new customer:", customerId)
//     } else {
//       console.log("Using existing customer:", customerId)
//       // Update the customer's payment method
//       await stripe.paymentMethods.attach(paymentMethodId, {
//         customer: customerId,
//       })

//       await stripe.customers.update(customerId, {
//         invoice_settings: {
//           default_payment_method: paymentMethodId,
//         },
//       })
//       console.log("Updated customer payment method")
//     }

//     // Handle different plan types
//     if (planType === "pro") {
//       console.log("Processing Pro subscription")
//       try {
//         // Create a subscription
//         const subscription = await stripe.subscriptions.create({
//           customer: customerId,
//           items: [
//             {
//               price: PRODUCTS.pro.priceId,
//             },
//           ],
//           payment_behavior: "default_incomplete",
//           payment_settings: {
//             payment_method_types: ["card"],
//             save_default_payment_method: "on_subscription",
//           },
//           expand: ["latest_invoice.payment_intent"],
//           metadata: {
//             userId: user._id.toString(),
//             planType: "pro",
//           },
//         })

//         console.log("Created subscription:", subscription.id)

//         // Check if payment needs additional action
//         const paymentIntent = subscription.latest_invoice.payment_intent

//         if (paymentIntent.status === "requires_action") {
//           console.log("Payment requires action")
//           // Return the client secret for the frontend to handle 3D Secure
//           return res.status(200).json({
//             requiresAction: true,
//             clientSecret: paymentIntent.client_secret,
//             subscriptionId: subscription.id,
//           })
//         } else if (paymentIntent.status === "succeeded") {
//           console.log("Payment succeeded")
//           // Payment succeeded, update user
//           user.userType = "pro"

//           // Set subscription expiry to one month from now
//           const expiryDate = new Date()
//           expiryDate.setMonth(expiryDate.getMonth() + 1)
//           user.subscriptionExpiry = expiryDate

//           // Save subscription ID for future reference
//           user.stripeSubscriptionId = subscription.id
//           await user.save()
//           console.log("Updated user to pro plan")

//           return res.status(200).json({
//             success: true,
//             message: "Pro subscription activated successfully",
//             subscription: subscription.id,
//           })
//         } else {
//           console.log("Payment failed:", paymentIntent.status)
//           // Payment failed
//           return res.status(400).json({
//             success: false,
//             message: "Payment failed",
//             status: paymentIntent.status,
//           })
//         }
//       } catch (error) {
//         console.error("Error creating subscription:", error.message)
//         return res.status(500).json({ message: "Error creating subscription: " + error.message })
//       }
//     } else if (planType === "lifetime") {
//       console.log("Processing Lifetime payment")
//       try {
//         // For lifetime, create a payment intent
//         const paymentIntent = await stripe.paymentIntents.create({
//           amount: 7900, // £79
//           currency: "gbp",
//           customer: customerId,
//           payment_method: paymentMethodId,
//           confirm: true,
//           description: "Lifetime Plan - One-time Payment",
//           metadata: {
//             userId: user._id.toString(),
//             planType: "lifetime",
//           },
//         })

//         console.log("Created payment intent:", paymentIntent.id)

//         // Check payment status
//         if (paymentIntent.status === "requires_action") {
//           console.log("Payment requires action")
//           // Return the client secret for the frontend to handle 3D Secure
//           return res.status(200).json({
//             requiresAction: true,
//             clientSecret: paymentIntent.client_secret,
//           })
//         } else if (paymentIntent.status === "succeeded") {
//           console.log("Payment succeeded")
//           // Payment succeeded, update user
//           user.userType = "lifetime"

//           // No expiry for lifetime
//           user.subscriptionExpiry = null

//           await user.save()
//           console.log("Updated user to lifetime plan")

//           return res.status(200).json({
//             success: true,
//             message: "Lifetime access activated successfully",
//             paymentIntent: paymentIntent.id,
//           })
//         } else {
//           console.log("Payment failed:", paymentIntent.status)
//           // Payment failed
//           return res.status(400).json({
//             success: false,
//             message: "Payment failed",
//             status: paymentIntent.status,
//           })
//         }
//       } catch (error) {
//         console.error("Error processing lifetime payment:", error.message)
//         return res.status(500).json({ message: "Error processing payment: " + error.message })
//       }
//     } else {
//       console.error("Invalid plan type:", planType)
//       return res.status(400).json({ message: "Invalid plan type" })
//     }
//   } catch (error) {
//     console.error("Payment processing error:", error)
//     return res.status(500).json({ message: error.message || "Payment processing failed" })
//   }
// }

// // Handle payment confirmation (for 3D Secure)
// export const confirmPayment = async (req, res) => {
//   try {
//     const { paymentIntentId, planType, userId } = req.body

//     if (!paymentIntentId || !planType || !userId) {
//       return res.status(400).json({ message: "Missing required information" })
//     }

//     // Find the user
//     const user = await User.findById(userId)

//     if (!user) {
//       return res.status(404).json({ message: "User not found" })
//     }

//     // Retrieve the payment intent
//     const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

//     if (paymentIntent.status !== "succeeded") {
//       return res.status(400).json({
//         success: false,
//         message: "Payment was not successful",
//         status: paymentIntent.status,
//       })
//     }

//     // Update user based on plan type
//     if (planType === "pro") {
//       user.userType = "pro"

//       // Set subscription expiry to one month from now
//       const expiryDate = new Date()
//       expiryDate.setMonth(expiryDate.getMonth() + 1)
//       user.subscriptionExpiry = expiryDate

//       // Find subscription ID from metadata
//       if (paymentIntent.metadata && paymentIntent.metadata.subscription_id) {
//         user.stripeSubscriptionId = paymentIntent.metadata.subscription_id
//       }
//     } else if (planType === "lifetime") {
//       user.userType = "lifetime"
//       user.subscriptionExpiry = null
//     }

//     await user.save()

//     return res.status(200).json({
//       success: true,
//       message: `${planType === "pro" ? "Pro subscription" : "Lifetime access"} activated successfully`,
//     })
//   } catch (error) {
//     console.error("Payment confirmation error:", error)
//     return res.status(500).json({ message: error.message || "Payment confirmation failed" })
//   }
// }

// // Handle Stripe webhooks
// export const handleWebhook = async (req, res) => {
//   const signature = req.headers["stripe-signature"]
//   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

//   if (!signature) {
//     return res.status(400).json({ message: "Missing stripe signature" })
//   }

//   let event

//   try {
//     event = stripe.webhooks.constructEvent(
//       req.rawBody, // You need to get the raw body from the request
//       signature,
//       webhookSecret,
//     )
//   } catch (err) {
//     return res.status(400).json({ message: `Webhook signature verification failed: ${err.message}` })
//   }

//   // Handle specific events
//   try {
//     switch (event.type) {
//       case "invoice.payment_succeeded":
//         const invoice = event.data.object

//         // Find the user with this subscription
//         const user = await User.findOne({ stripeSubscriptionId: invoice.subscription })

//         if (user) {
//           // Update subscription expiry date
//           const expiryDate = new Date()
//           expiryDate.setMonth(expiryDate.getMonth() + 1)
//           user.subscriptionExpiry = expiryDate
//           await user.save()
//           console.log(`Updated subscription expiry for user ${user._id}`)
//         }
//         break

//       case "customer.subscription.deleted":
//         const subscription = event.data.object

//         // Find the user with this subscription
//         const subUser = await User.findOne({ stripeSubscriptionId: subscription.id })

//         if (subUser) {
//           // Downgrade to free plan
//           subUser.userType = "free"
//           subUser.subscriptionExpiry = null
//           await subUser.save()
//           console.log(`Downgraded user ${subUser._id} to free plan`)
//         }
//         break

//       case "payment_intent.succeeded":
//         const paymentIntent = event.data.object

//         // Check if this is a lifetime payment
//         if (paymentIntent.metadata && paymentIntent.metadata.planType === "lifetime") {
//           const userId = paymentIntent.metadata.userId

//           if (userId) {
//             const lifetimeUser = await User.findById(userId)

//             if (lifetimeUser) {
//               lifetimeUser.userType = "lifetime"
//               lifetimeUser.subscriptionExpiry = null
//               await lifetimeUser.save()
//               console.log(`Updated user ${lifetimeUser._id} to lifetime plan`)
//             }
//           }
//         }
//         break
//     }

//     return res.status(200).json({ received: true })
//   } catch (error) {
//     console.error("Webhook processing error:", error)
//     return res.status(500).json({ message: "Webhook processing failed" })
//   }
// }

// // Get user subscription status
// export const getUserSubscription = async (req, res) => {
//   try {
//     const { userId } = req.params

//     if (!userId) {
//       return res.status(400).json({ message: "User ID is required" })
//     }

//     const user = await User.findById(userId)

//     if (!user) {
//       return res.status(404).json({ message: "User not found" })
//     }

//     // Check if pro subscription is expired
//     if (user.userType === "pro" && user.subscriptionExpiry) {
//       const now = new Date()
//       if (now > user.subscriptionExpiry) {
//         user.userType = "free"
//         await user.save()
//       }
//     }

//     return res.status(200).json({
//       userType: user.userType,
//       downloadCount: user.downloadCount || 0,
//       subscriptionExpiry: user.subscriptionExpiry,
//       canDownload: user.userType !== "free" || (user.downloadCount || 0) < 10,
//     })
//   } catch (error) {
//     console.error("Error getting user subscription:", error)
//     return res.status(500).json({ message: error.message || "Failed to get subscription info" })
//   }
// }

// // Cancel subscription
// export const cancelSubscription = async (req, res) => {
//   try {
//     const { userId } = req.body

//     if (!userId) {
//       return res.status(400).json({ message: "User ID is required" })
//     }

//     const user = await User.findById(userId)

//     if (!user) {
//       return res.status(404).json({ message: "User not found" })
//     }

//     if (user.userType !== "pro" || !user.stripeSubscriptionId) {
//       return res.status(400).json({ message: "No active subscription to cancel" })
//     }

//     // Cancel the subscription at period end
//     await stripe.subscriptions.update(user.stripeSubscriptionId, {
//       cancel_at_period_end: true,
//     })

//     return res.status(200).json({
//       success: true,
//       message: "Subscription will be canceled at the end of the billing period",
//     })
//   } catch (error) {
//     console.error("Error canceling subscription:", error)
//     return res.status(500).json({ message: error.message || "Failed to cancel subscription" })
//   }
// }
