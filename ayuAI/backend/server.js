const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

/* ---------------- SYSTEM PROMPT ---------------- */

const SYSTEM_PROMPT = {
  role: "system",
  content: `
You are Ayu AI 🤖, a highly intelligent assistant.

Rules:
- Give detailed and well-explained answers
- Use a natural, human tone
- Use emojis when helpful 😊
- Break answers into clean paragraphs or points
- For complex questions, explain step-by-step
- Avoid very short answers unless user asks
- Make responses engaging and easy to understand
`
};

/* ---------------- API CALLS ---------------- */

// OpenRouter (better quality)
async function openrouter(history) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o-mini",
      max_tokens: 1000,
      temperature: 0.7,
      messages: [SYSTEM_PROMPT, ...history]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AyuAI"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// Groq (fast + free)
async function groq(history) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      max_tokens: 1000,
      temperature: 0.7,
      messages: [SYSTEM_PROMPT, ...history]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      }
    }
  );

  return res.data.choices[0].message.content;
}

/* ---------------- MODES ---------------- */

// ⚡ Efficient → cheapest (1 API at a time)
async function efficientMode(history) {
  try { return await groq(history); } catch {}
  try { return await openrouter(history); } catch {}
  return "⚠️ All APIs failed.";
}

// 🧠 Smart → compare both
async function smartMode(history) {
  const results = await Promise.allSettled([
    groq(history),
    openrouter(history)
  ]);

  const texts = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  if (texts.length === 0) return "⚠️ All APIs failed.";

  // pick most detailed answer
  return texts.sort((a, b) => {
    return b.split(" ").length - a.split(" ").length;
  })[0];
}

// 🔀 Multi → user chooses API
async function multiMode(history, api) {
  if (api === "groq") return await groq(history);
  if (api === "openrouter") return await openrouter(history);

  return "⚠️ Invalid API selected.";
}

/* ---------------- ROUTE ---------------- */

app.post("/chat", async (req, res) => {
  const { message, mode, history, api } = req.body;

  try {
    let reply;

    if (mode === "smart") {
      reply = await smartMode(history);
    } 
    else if (mode === "multi") {
      reply = await multiMode(history, api);
    } 
    else {
      reply = await efficientMode(history);
    }

    res.json({ reply });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------- START ---------------- */

app.listen(3000, () => {
  console.log("🚀 AyuAI running at http://localhost:3000");
});