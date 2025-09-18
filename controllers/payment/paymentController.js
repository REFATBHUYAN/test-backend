import gocardless from "gocardless-nodejs";
import constants from "gocardless-nodejs/constants.js";
import Stripe from 'stripe';
import dotenv from "dotenv";
import Company from "../../model/companyModel.js";

dotenv.config();

// GoCardless client setup
const createGoCardlessClient = () => {
  const accessToken = process.env.GOCARDLESS_ACCESS_TOKEN;
  const environment = process.env.GOCARDLESS_ENVIRONMENT || "sandbox";

  if (!accessToken) {
    throw new Error("GOCARDLESS_ACCESS_TOKEN is not set in environment variables");
  }

  return new gocardless(
    accessToken,
    environment === "live" ? constants.Environments.Live : constants.Environments.Sandbox
  );
};

let goCardlessClient;
try {
  goCardlessClient = createGoCardlessClient();
  console.log("GoCardless client created successfully");
} catch (error) {
  console.error("Error creating GoCardless client:", error);
}

// Stripe client setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// GoCardless Functions

export const testConnection = async (req, res) => {
  try {
    const creditors = await goCardlessClient.creditors.list();
    res.json({
      success: true,
      message: "Connected to GoCardless successfully",
      creditors,
    });
  } catch (error) {
    console.error("Error testing GoCardless connection:", error);
    res.status(500).json({
      error: "Failed to connect to GoCardless",
      message: error.message,
      details: error.type === "gocardless_error" ? error.errors : null,
    });
  }
};

export const createSubscriptionFlow = async (req, res) => {
  try {
    if (!goCardlessClient) {
      throw new Error("GoCardless client is not initialized");
    }

    const { planId, companyId, amount } = req.body;

    const redirectFlow = await goCardlessClient.redirectFlows.create({
      description: `Subscription to ${planId} plan for ${companyId}`,
      session_token: `${companyId}-${planId}-${amount}`,
      success_redirect_url: `${process.env.FRONTEND_URL}/subscription-success?session_token=${companyId}-${planId}-${amount}`,
      prefilled_customer: {
        company_name: companyId,
      },
    });

    res.status(200).json({ redirect_url: redirectFlow.redirect_url });
  } catch (error) {
    console.error("Error creating subscription flow:", error);
    res.status(500).json({ error: error.message });
  }
};

export const completeSubscriptionFlow = async (req, res) => {
  try {
    if (!goCardlessClient) {
      throw new Error("GoCardless client is not initialized");
    }

    const { redirect_flow_id, session_token } = req.body;

    const redirectFlow = await goCardlessClient.redirectFlows.complete(
      redirect_flow_id,
      { session_token: session_token }
    );

    const [companyId, planId, amount] = session_token.split("-");

    const endDate = planId === "yearly" 
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const subscription = await goCardlessClient.subscriptions.create({
      amount: parseInt(amount, 10),
      currency: "GBP",
      interval_unit: planId === "monthly" ? "monthly" : "yearly",
      day_of_month: "1",
      links: { mandate: redirectFlow.links.mandate },
      metadata: { companyId: companyId },
    });

    const updatedCompany = await Company.findByIdAndUpdate(
      companyId,
      {
        $set: {
          "subscription.status": "active",
          "subscription.plan": planId,
          "subscription.startDate": new Date(),
          "subscription.endDate": endDate,
          "subscription.gocardlessCustomerId": redirectFlow.links.customer,
          "subscription.gocardlessMandateId": redirectFlow.links.mandate,
          "subscription.gocardlessSubscriptionId": subscription.id,
          "subscription.amount": parseInt(amount, 10),
        },
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      customerId: redirectFlow.links.customer,
      mandateId: redirectFlow.links.mandate,
      subscriptionId: subscription.id,
      company: updatedCompany,
    });
  } catch (error) {
    console.error('Error completing subscription flow:', error);
    res.status(500).json({ error: error.message });
  }
};

// Stripe Functions

export const createStripeCheckout = async (req, res) => {
  try {
    const { planId, companyId, amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Subscription`,
            },
            unit_amount: amount,
            recurring: {
              interval: planId === 'monthly' ? 'month' : 'year',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription-cancelled`,
      client_reference_id: companyId,
      metadata: {
        companyId,
        planId,
      },
    });

    res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    res.status(500).json({ error: error.message });
  }
};

export const verifyStripeSession = async (req, res) => {
  try {
    const { session_id } = req.body;

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);

      const companyId = session.client_reference_id;
      const planId = session.metadata.planId;
      const endDate = new Date(subscription.current_period_end * 1000);

      const updatedCompany = await Company.findByIdAndUpdate(
        companyId,
        {
          $set: {
            "subscription.status": "active",
            "subscription.plan": planId,
            "subscription.startDate": new Date(subscription.current_period_start * 1000),
            "subscription.endDate": endDate,
            "subscription.stripeCustomerId": session.customer,
            "subscription.stripeSubscriptionId": subscription.id,
            "subscription.amount": subscription.items.data[0].price.unit_amount,
          },
        },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: 'Stripe session verified and subscription activated',
        company: updatedCompany,
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Stripe session payment not completed',
      });
    }
  } catch (error) {
    console.error('Error verifying Stripe session:', error);
    res.status(500).json({ error: error.message });
  }
};

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // This part is handled by verifyStripeSession, but you can add additional logic here if needed
    console.log('Checkout session completed:', session.id);
  }

  res.status(200).json({ received: true });
};

