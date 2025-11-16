const express = require("express");
const paypal = require("paypal-rest-sdk");
const cors = require("cors");

const app = express();
app.use(cors());

// PayPal configuration
const CLIENT_ID =
  "ASKkPxdw72syTx3q7W8Z-mhe3r_YhmIx_Cp-e5VPr8yr5c2WoYr7vpVEdRk1fZQKRI7Lps9H93xXXLEo";
const CLIENT_SECRET =
  "EJR202eyOD82BvUymSOGKl7eHzR5a_akxB8ysgA1zDjvtDLAwQwxWK6z9mZwsaXR0Y9H33mgoF87-Cv1";

paypal.configure({
  mode: "sandbox", // 'sandbox' or 'live'
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
});

// Route to create a PayPal payment
app.get("/payment", async (req, res) => {
  try {
    const create_payment_json = {
      intent: "sale",
      payer: {
        payment_method: "paypal",
      },
      redirect_urls: {
        return_url: "http://localhost:8000/success",
        cancel_url: "http://localhost:8000/failed",
      },
      transactions: [
        {
          item_list: {
            items: [
              {
                name: "item",
                sku: "item",
                price: "1.00",
                currency: "USD",
                quantity: 1,
              },
            ],
          },
          amount: {
            currency: "USD",
            total: "1.00",
          },
          description: "This is the payment description.",
        },
      ],
    };

    paypal.payment.create(create_payment_json, (error, payment) => {
      if (error) {
        throw error;
      } else {
        console.log("Create Payment Response", payment);
        res.json(payment);
      }
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ error: "Payment creation failed" });
  }
});

// Route to handle successful payment
app.get("/success", async (req, res) => {
  try {
    const payerId = req.query.PayerID;
    const paymentId = req.query.paymentId;

    const execute_payment_json = {
      payer_id: payerId,
      transactions: [
        {
          amount: {
            currency: "USD",
            total: "1.00",
          },
        },
      ],
    };

    paypal.payment.execute(
      paymentId,
      execute_payment_json,
      (error, payment) => {
        if (error) {
          console.error("Error executing payment:", error);
          return res.redirect("http://localhost:5173/failed");
        } else {
          console.log("Execute Payment Response", payment);
          return res.redirect("http://localhost:5173/success");
        }
      }
    );
  } catch (error) {
    console.error("Error processing success callback:", error);
    res.status(500).json({ error: "Payment execution failed" });
  }
});

// Route for failed payments
app.get("/failed", (req, res) => {
  return res.redirect("http://localhost:5173/failed");
});

// Start the server
app.listen(8000, () => {
  console.log("Server is running on port 8000");
});
