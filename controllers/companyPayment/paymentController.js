import Stripe from "stripe";
import Company from "../../model/companyModel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Stripe products for CV screening plans
export const initializeStripeProducts = async () => {
  try {
    const products = await stripe.products.list({ active: true });
    const requiredProducts = [
      { name: "Crazy Plan", price: 9900, interval: "month" }, // £99/month
      { name: "Ludicrous Plan", price: 49900, interval: "month" }, // £499/month
      { name: "Insane Plan", price: 99900, interval: "month" }, // £999/month
    ];

    for (const reqProduct of requiredProducts) {
      let product = products.data.find((p) => p.name === reqProduct.name);
      if (!product) {
        product = await stripe.products.create({
          name: reqProduct.name,
        });
      }

      const prices = await stripe.prices.list({ product: product.id, active: true });
      if (prices.data.length === 0) {
        await stripe.prices.create({
          product: product.id,
          unit_amount: reqProduct.price,
          currency: "gbp",
          recurring: { interval: reqProduct.interval },
        });
      }
    }
    return true;
  } catch (error) {
    console.error("Error initializing Stripe products:", error);
    return false;
  }
};

// Process payment for a company
export const processPayment = async (req, res) => {
  const { paymentMethodId, planType, companyId } = req.body;

  if (!paymentMethodId || !planType || !companyId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const products = await stripe.products.list({ active: true });
    let product;
    if (planType === "crazy") {
      product = products.data.find((p) => p.name === "Crazy Plan");
    } else if (planType === "ludicrous") {
      product = products.data.find((p) => p.name === "Ludicrous Plan");
    } else if (planType === "insane") {
      product = products.data.find((p) => p.name === "Insane Plan");
    }

    if (!product) {
      return res.status(400).json({ message: "Invalid plan type" });
    }

    const prices = await stripe.prices.list({ product: product.id, active: true });
    const price = prices.data[0];
    if (!price) {
      return res.status(400).json({ message: "Price not found for the selected plan" });
    }

    let customerId = company.subscription.stripeCustomerId;
    if (!customerId) {
      const customer = await createStripeCustomer(company);
      customerId = customer.id;
    }

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

    let subscription;
    if (company.subscription.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.update(company.subscription.stripeSubscriptionId, {
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

    const latestInvoice = subscription.latest_invoice;
    if (latestInvoice.payment_intent && latestInvoice.payment_intent.status === "requires_action") {
      return res.status(200).json({
        requiresAction: true,
        clientSecret: latestInvoice.payment_intent.client_secret,
        subscriptionId: subscription.id,
      });
    }

    company.subscription.status = "active";
    company.subscription.plan = planType;
    company.subscription.startDate = new Date(subscription.current_period_start * 1000);
    company.subscription.endDate = new Date(subscription.current_period_end * 1000);
    company.subscription.stripeCustomerId = subscription.customer;
    company.subscription.stripeSubscriptionId = subscription.id;
    await company.save();

    return res.status(200).json({ message: "Subscription created successfully" });
  } catch (error) {
    console.error("Error processing payment:", error);
    return res.status(500).json({ message: error.message || "Payment processing failed" });
  }
};

// Confirm payment (for 3D Secure)
export const confirmPayment = async (req, res) => {
  const { paymentIntentId, planType, companyId, subscriptionId } = req.body;

  if (!paymentIntentId || !planType || !companyId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      company.subscription.status = "active";
      company.subscription.plan = planType;
      company.subscription.startDate = new Date(subscription.current_period_start * 1000);
      company.subscription.endDate = new Date(subscription.current_period_end * 1000);
      company.subscription.stripeCustomerId = subscription.customer;
      company.subscription.stripeSubscriptionId = subscription.id;
    } else {
      return res.status(400).json({ message: "Invalid plan type" });
    }

    await company.save();
    return res.status(200).json({ message: "Payment confirmed successfully" });
  } catch (error) {
    console.error("Error confirming payment:", error);
    return res.status(500).json({ message: error.message || "Payment confirmation failed" });
  }
};

// Get company subscription status
export const getCompanySubscription = async (req, res) => {
  const { companyId } = req.params;

  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    let subscriptionInfo = {
      status: company.subscription.status || "inactive",
      plan: company.subscription.plan || null,
    };

    if (company.subscription.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(company.subscription.stripeSubscriptionId);
      subscriptionInfo.startDate = new Date(subscription.current_period_start * 1000);
      subscriptionInfo.endDate = new Date(subscription.current_period_end * 1000);
    }

    return res.status(200).json(subscriptionInfo);
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return res.status(500).json({ message: "Failed to fetch subscription" });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
    const { companyId } = req.body;
  
    try {
      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
  
      if (!company.subscription.stripeSubscriptionId) {
        return res.status(400).json({ message: "No active subscription found" });
      }
  
      // Use stripe.subscriptions.cancel instead of stripe.subscriptions.del
      await stripe.subscriptions.cancel(company.subscription.stripeSubscriptionId);
  
      company.subscription.status = "cancelled";
      company.subscription.plan = null;
      company.subscription.startDate = null;
      company.subscription.endDate = null;
      company.subscription.stripeSubscriptionId = null;
      await company.save();
  
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
        const company = await Company.findOne({ "subscription.stripeSubscriptionId": subscriptionId });
        if (company) {
          company.subscription.endDate = new Date(event.data.object.lines.data[0].period.end * 1000);
          company.subscription.status = "active";
          await company.save();
        }
        break;
      case "customer.subscription.deleted":
        const deletedSubscriptionId = event.data.object.id;
        const deletedCompany = await Company.findOne({ "subscription.stripeSubscriptionId": deletedSubscriptionId });
        if (deletedCompany) {
          deletedCompany.subscription.status = "cancelled";
          deletedCompany.subscription.plan = null;
          deletedCompany.subscription.startDate = null;
          deletedCompany.subscription.endDate = null;
          deletedCompany.subscription.stripeSubscriptionId = null;
          await deletedCompany.save();
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
const createStripeCustomer = async (company) => {
  const customer = await stripe.customers.create({
    email: company.email, // Add email to schema if needed
    name: company.name,
  });
  company.subscription.stripeCustomerId = customer.id;
  await company.save();
  return customer;
};