import express from "express";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "my-secret-token" // same as "my-secret-token"
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN; // for replying

// ===============================
// 📬 WEBHOOK ENDPOINT
// ==============================
app.get("/webhook", (req, res) => {
  console.log("GET /webhook query:", req.query);

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    console.log("❌ Verification failed");
    return res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  console.log("POST /webhook body:", JSON.stringify(req.body, null, 2));

  const body = req.body;

  if (body.object === "page") {
    body.entry.forEach(async (entry) => {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text.toLowerCase();
        console.log(`📥 Message from ${senderId}:`, userMessage);

        if (userMessage === "hi") {
          await sendReply(senderId);
        }
      }
    });

    return res.status(200).send("EVENT_RECEIVED");
  }

  return res.sendStatus(404);
});

// ==============================
// 📤 HELPER: SEND REPLY
// ==============================
async function sendReply(senderId) {
  const payload = {
    recipient: { id: senderId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Hi, how are you? What do you want for today?",
          buttons: [
            {
              type: "postback",
              title: "Pizza 🍕",
              payload: "ORDER_PIZZA"
            },
            {
              type: "postback",
              title: "Burger 🍔",
              payload: "ORDER_BURGER"
            }
          ]
        }
      }
    }
  };

  console.log("📤 Sending payload to Facebook:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    console.log(`✅ Sent reply to ${senderId}`);
    console.log("📥 Facebook response:", response.data);
  } catch (error) {
    if (error.response) {
      console.error("❌ Failed to send message:", error.response.status, error.response.data);
    } else {
      console.error("❌ Failed to send message:", error.message);
    }
  }
}

// ==============================
// 🚀 START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
});
