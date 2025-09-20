// pages/api/webhook.js
export default function handler(req, res) {
  if (req.method === "GET") {
    // Webhook verification
    console.log("rquest is -------", req.query)
    console.log("rquest query is ------- ", req.query)
    console.log("rquest body is ------- ", req.body)

    const VERIFY_TOKEN = "my-secret-token";
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    
    if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      body.entry.forEach(entry => {
        const event = entry.messaging[0];
        const senderId = event.sender.id;

        if (event.message && event.message.text === "hi") {
          sendReply(senderId);
        }
      });
      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.sendStatus(404);
  }
}

// helper to send message back
async function sendReply(senderId) {
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

  await fetch(`https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: senderId },
      message: {
        text: "Hi, how are you? What do you want for today?",
        quick_replies: [
          {
            content_type: "text",
            title: "Pizza 🍕",
            payload: "ORDER_PIZZA"
          },
          {
            content_type: "text",
            title: "Burger 🍔",
            payload: "ORDER_BURGER"
          }
        ]
      }
    })
  });
}
