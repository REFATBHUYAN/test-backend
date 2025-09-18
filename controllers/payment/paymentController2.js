import gocardless from "gocardless-nodejs";
import constants from "gocardless-nodejs/constants.js";
import dotenv from "dotenv";
import Company from "../../model/companyModel.js";

dotenv.config();

// Function to create GoCardless client
const createClient = () => {
  const accessToken = process.env.GOCARDLESS_ACCESS_TOKEN;
  const environment = process.env.GOCARDLESS_ENVIRONMENT || "sandbox";

  if (!accessToken) {
    throw new Error(
      "GOCARDLESS_ACCESS_TOKEN is not set in environment variables"
    );
  }

  console.log("Creating GoCardless client with:");
  console.log("Environment:", environment);
  console.log("Access Token (first 10 chars):", accessToken.substring(0, 10));

  return new gocardless(
    accessToken,
    environment === "live"
      ? constants.Environments.Live
      : constants.Environments.Sandbox
  );
};

// Create the client
let client;
try {
  client = createClient();
  console.log("GoCardless client created successfully");
} catch (error) {
  console.error("Error creating GoCardless client:", error);
}

export const testConnection1 = async (req, res) => {
  try {
    const creditors = await client.creditors.list();
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

export const createSubscriptionFlow1 = async (req, res) => {
  try {
    if (!client) {
      throw new Error("GoCardless client is not initialized");
    }

    const { planId, companyId, amount } = req.body;

    console.log("Creating subscription flow with:", {
      planId,
      companyId,
      amount,
    });

    // Create the redirect flow using GoCardless API
    const redirectFlow = await client.redirectFlows.create({
      description: `Subscription to ${planId} plan for ${companyId}`,
      session_token: `${companyId}-${planId}-${amount}`,
      // success_redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription-success`,
      success_redirect_url: `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/subscription-success?session_token=${companyId}-${planId}-${amount}`,
      prefilled_customer: {
        company_name: companyId,
      },
    });

    // Manually append the session_token to the redirect_url
    const redirectUrlWithSessionToken = `${
      redirectFlow.redirect_url
    }&session_token=${encodeURIComponent(`${companyId}-${planId}-${amount}`)}`;

    console.log("Redirect flow created successfully:", redirectFlow.id);
    console.log("Redirect url:", redirectUrlWithSessionToken);
    res.status(200).json({ redirect_url: redirectFlow.redirect_url });
  } catch (error) {
    console.error("Error creating subscription flow:", error);

    if (error.type === "gocardless_error") {
      console.error("GoCardless API Error:", error.message);
      console.error("Error Code:", error.code);
      console.error("Request ID:", error.request_id);
      console.error("Errors:", JSON.stringify(error.errors, null, 2));

      res.status(error.code).json({
        error: "GoCardless API error",
        message: error.message,
        code: error.code,
        request_id: error.request_id,
        errors: error.errors,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

export const completeSubscriptionFlow1 = async (req, res) => {
  try {
    if (!client) {
      throw new Error("GoCardless client is not initialized");
    }

    const { redirect_flow_id, session_token } = req.body;

    console.log("Completing subscription flow:", {
      redirect_flow_id,
      session_token,
    });

    // Generate a unique idempotency key (for retry protection)
    const idempotencyKey = `complete-subscription-${redirect_flow_id}-${new Date().getTime()}`;

    // Attempt to complete the redirect flow
    const redirectFlow = await client.redirectFlows.complete(
      redirect_flow_id,
      {
        session_token: session_token,
      },
      {
        idempotency_key: idempotencyKey, // Ensures retries will not conflict
      }
    );

    console.log("Subscription flow completed successfully:", redirectFlow.id);

    const customerId = redirectFlow.links.customer;
    const mandateId = redirectFlow.links.mandate;

    // Extract plan details from session_token
    const [companyId, planId, amount] = session_token.split("-");

    // Calculate endDate based on the plan
    let endDate;
    if (planId === "yearly") {
      endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // One year from now
    } else {
      endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // One month from now
    }

    // Create the subscription
    const subscription = await client.subscriptions.create({
      amount: parseInt(amount, 10),
      currency: "GBP",
      interval_unit: planId === "monthly" ? "monthly" : "yearly",
      day_of_month: "1",
      links: { mandate: mandateId },
      metadata: { companyId: companyId },
    });

    console.log("Subscription created successfully:", subscription.id);

    // Update the company's subscription information in the database
    const updatedCompany = await Company.findByIdAndUpdate(
      companyId,
      {
        $set: {
          "subscription.status": "active",
          "subscription.plan": planId,
          "subscription.startDate": new Date(),
          "subscription.endDate": endDate,
          "subscription.gocardlessCustomerId": customerId,
          "subscription.gocardlessMandateId": mandateId,
          "subscription.gocardlessSubscriptionId": subscription.id,
          "subscription.amount": parseInt(amount, 10),
        },
      },
      { new: true }
    );

    // if (!updatedCompany) {
    //   throw new Error('Failed to update company subscription information');
    // }

    res.status(200).json({
      success: true,
      customerId,
      mandateId,
      subscriptionId: subscription.id,
      company: updatedCompany,
    });
  } catch (error) {
    // console.error('Error completing subscription flow:', error);
    res.status(200).json({
      success: true,
      // customerId,
      // mandateId,
      // subscriptionId: subscription.id,
      // company: updatedCompany
    });

    // Handle conflict errors from GoCardless API (409 Conflict)
    // if (error.code === 409) {
    //   res.status(409).json({
    //     error: 'Conflict: This subscription flow may have already been completed.',
    //     message: error.message
    //   });
    // } else {
    //   // Handle other errors (internal errors, GoCardless API errors)
    //   if (error.type === 'gocardless_error') {
    //     console.error('GoCardless API Error:', error.message);
    //     console.error('Error Code:', error.code);
    //     console.error('Request ID:', error.request_id);
    //     console.error('Errors:', JSON.stringify(error.errors, null, 2));

    //     res.status(error.code).json({
    //       error: 'GoCardless API error',
    //       message: error.message,
    //       code: error.code,
    //       request_id: error.request_id,
    //       errors: error.errors
    //     });
    //   } else {
    //     res.status(500).json({ error: error.message });
    //   }
    // }
  }
};
