import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import { SessionsClient } from "@google-cloud/dialogflow-cx";

dotenv.config();

// ==============================
// 🔐 GOOGLE SERVICE ACCOUNT SETUP
// ==============================
const credentials = {
  type: "service_account",
  project_id: process.env.PROJECT_ID,
  private_key_id: process.env.PRIVATE_KEY_ID,
  private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.CLIENT_EMAIL,
  client_id: process.env.CLIENT_ID,
  auth_uri: process.env.AUTH_URI,
  token_uri: process.env.TOKEN_URI,
  auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
};

// ==============================
// 📦 GLOBAL CONFIG
// ==============================
const projectId = "customer-support-dury";
const agentId = "a876e6a2-c33d-4b32-985d-daf270fd1278";
const location = "us-central1";
const languageCode = "en";

const client = new SessionsClient({
  credentials,
  apiEndpoint: "us-central1-dialogflow.googleapis.com",
});

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
    try {
      for (const entry of body.entry) {
        const event = entry.messaging[0];
        const senderId = event.sender.id;

        if (event.message && event.message.text) {
          const userMessage = event.message.text;

          const dfResponse = await sendToDialogflowCX(senderId, userMessage);
          const messengerPayload = buildMessengerPayloadFromDialogflow(dfResponse, senderId);

          if (messengerPayload) {
            await sendMessageToMessenger(messengerPayload);
          }
        }

        if (event.postback && event.postback.payload) {
          const userMessage = event.postback.payload;

          const dfResponse = await sendToDialogflowCX(senderId, userMessage);
          const messengerPayload = buildMessengerPayloadFromDialogflow(dfResponse, senderId);

          if (messengerPayload) {
            await sendMessageToMessenger(messengerPayload);
          }
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.error("❌ Error processing webhook:", error);
      return res.sendStatus(500);
    }
  }

  return res.sendStatus(404);
});


async function sendMessageToMessenger(payload) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      payload,
      { headers: { "Content-Type": "application/json" } }
    );
    console.log("✅ Sent message to Messenger");
    console.dir(response.data);
  } catch (error) {
    console.error("❌ Failed to send message to Messenger", error.response?.data || error.message);
  }
}

async function sendToDialogflowCX(sessionId, userMessage) {
  const sessionPath = client.projectLocationAgentSessionPath(
    projectId,
    location,
    agentId,
    sessionId
  );

  const request = {
    session: sessionPath,
    queryInput: {
      text: { text: userMessage },
      languageCode,
    },
  };

  try {
    const [response] = await client.detectIntent(request);
    return response.queryResult;
  } catch (err) {
    console.error("❌ Dialogflow CX request failed", err);
    return null;
  }
}

function buildMessengerPayloadFromDialogflow(queryResult, senderId) {
  if (!queryResult) return null;

  const message = queryResult.responseMessages?.[0];

  // Handle custom payload with buttons
  if (message?.payload?.fields?.content_type?.stringValue === "input_select") {
    const content = message.payload.fields.content?.stringValue || "Please choose:";
    const items = message.payload.fields.content_attributes.structValue.fields.items.listValue.values;

    const buttons = items.slice(0, 3).map((item) => ({
      type: "postback",
      title: item.structValue.fields.title.stringValue,
      payload: item.structValue.fields.value.stringValue,
    }));

    return {
      recipient: { id: senderId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: content,
            buttons: buttons,
          },
        },
      },
    };
  }

  // Fallback to simple text message
  if (message?.text?.text?.length) {
    return {
      recipient: { id: senderId },
      message: {
        text: message.text.text[0],
      },
    };
  }

  return null;
}


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
