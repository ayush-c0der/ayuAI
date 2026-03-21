const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

/* ---------------- MIDDLEWARE ---------------- */
app.use(cors());
app.use(express.json());

// ✅ serve frontend (IMPORTANT)
app.use(express.static(path.join(__dirname, "frontend")));

/* ---------------- SYSTEM PROMPT ---------------- */

const SYSTEM_PROMPT = {
  role: "system",
  content: `
You are Ayu AI 🤖, a highly intelligent assistant made by Abhay Pratap.

Rules:
- Give detailed and well-explained answers
- Use a natural, human tone
- Use emojis when helpful 😊
- Break answers into clean paragraphs
- For complex questions, explain step-by-step
- Avoid very short answers
- Be engaging and helpful
`
};

/* ---------------- API CALLS ---------------- */

// 🔵 OpenRouter
async function openrouter(history) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o-mini",
      max_tokens: 1200,
      temperature: 0.7,
      messages: [SYSTEM_PROMPT, ...history]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,

        // ✅ FIXED (YOUR REAL LINK)
        "HTTP-Referer": "https://ayuai.onrender.com",
        "X-Title": "AyuAI"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// 🟢 Groq
async function groq(history) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      max_tokens: 1200,
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

// ⚡ Efficient
async function efficientMode(history) {
  try {
    return await groq(history);
  } catch (e) {
    console.log("Groq failed");
  }

  try {
    return await openrouter(history);
  } catch (e) {
    console.log("OpenRouter failed");
  }

  return "⚠️ All AI services failed. Try again later.";
}

// 🧠 Smart
async function smartMode(history) {
  const results = await Promise.allSettled([
    groq(history),
    openrouter(history)
  ]);

  const responses = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  if (responses.length === 0) {
    return "⚠️ All AI services failed.";
  }

  // choose longest (best)
  return responses.sort((a, b) => b.length - a.length)[0];
}

// 🔀 Multi API
async function multiMode(history, api) {
  try {
    if (api === "groq") return await groq(history);
    if (api === "openrouter") return await openrouter(history);

    return "⚠️ Invalid API selected.";
  } catch {
    return "⚠️ Selected API failed.";
  }
}

/* ---------------- ROUTES ---------------- */

// ✅ IMPORTANT (Render health check)
app.get("/", (req, res) => {
  res.send("🚀 AyuAI Server is running!");
});

// 💬 Chat endpoint
app.post("/chat", async (req, res) => {
  const { mode, history, api } = req.body;

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
    console.error("ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 AyuAI running on port " + PORT);
});
