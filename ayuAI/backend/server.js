const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

/* ---------------- MIDDLEWARE ---------------- */
app.use(cors());
app.use(express.json());

// Static frontend lives one level up, in /frontend
app.use(express.static(path.join(__dirname, "../frontend")));

/* ---------------- SYSTEM PROMPT ---------------- */

const SYSTEM_PROMPT = {
  role: "system",
  content: `
You are Ayu AI 🤖, a highly intelligent assistant made by Abhay Pratap.

Rules:
- Give concise, useful answers that feel like a natural ChatGPT conversation
- Use a natural, human tone
- Use emojis when helpful 😊
- Break answers into clean paragraphs
- For complex questions, explain only the necessary steps
- Do not give long essays unless the user explicitly asks for detail
- Be engaging and helpful
- Use simple language and clear bullet points when they improve readability
- Use emojis naturally, without overusing them
- Remember relevant context from the conversation history and avoid repeating questions
- Use clean Markdown formatting: short ### headings, bullet lists, and bold emphasis
- Do not use horizontal-rule separators such as --- or ----
- Keep formatting clean, readable, and natural for a chat interface
- Answer directly first, then add only the useful explanation or steps
- Use short paragraphs and clear lists instead of dense walls of text
- Keep most answers to 2 to 5 short paragraphs or a short list
- Sound like a helpful human conversation, not a formal essay
- Do not repeat the user's question before answering
- For comparisons, use this structure when it fits: a direct answer, a short heading, 2 to 5 bullet points, a brief explanation, and a clearly labeled final verdict
- Use emojis naturally when they improve scanning, such as section or verdict markers
- For a comparison question, follow this exact shape:
  Direct answer in one friendly sentence.
  ### First clear section heading
  - 2 to 4 short fact bullets with **bold labels**
  A short explanation in one or two sentences.
  ### Second clear section heading
  A short explanation or 2 to 4 bullets.
  **My verdict:**
  One to three short verdict lines with emojis when helpful.
- Do not add unnecessary sections, tables, introductions, disclaimers, or repeated conclusions
`
};

const AI_TIMEOUT_MS = 25000;

/* ---------------- API CALLS ---------------- */

// 🔵 OpenRouter
async function openrouter(history) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o-mini",
      max_tokens: 700,
      temperature: 0.7,
      messages: [SYSTEM_PROMPT, ...history]
    },
    {
      timeout: AI_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://ayuai.onrender.com",
        "X-Title": "AyuAI"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// 🟢 Groq
// NOTE: llama3-70b-8192 was decommissioned by Groq — swapped to their
// current general-purpose model. Update here if Groq changes lineups again:
// https://console.groq.com/docs/deprecations
async function groq(history) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "openai/gpt-oss-120b",
      max_tokens: 700,
      temperature: 0.7,
      messages: [SYSTEM_PROMPT, ...history]
    },
    {
      timeout: AI_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      }
    }
  );

  return res.data.choices[0].message.content;
}

/* ---------------- MODES ---------------- */

async function efficientMode(history) {
  try { return await groq(history); } catch (e) { logAiError("groq", e); }
  try { return await openrouter(history); } catch (e) { logAiError("openrouter", e); }
  return "⚠️ All AI services failed. Please try again in a moment.";
}

async function smartMode(history) {
  const results = await Promise.allSettled([
    groq(history),
    openrouter(history)
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logAiError(i === 0 ? "groq" : "openrouter", r.reason);
    }
  });

  const responses = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  if (responses.length === 0) return "⚠️ All AI services failed. Please try again in a moment.";

  return responses.sort((a, b) => b.length - a.length)[0];
}

async function multiMode(history, api) {
  try {
    if (api === "groq") return await groq(history);
    if (api === "openrouter") return await openrouter(history);
    return "⚠️ Invalid API selected.";
  } catch (e) {
    logAiError(api, e);
    return "⚠️ Selected API failed.";
  }
}

function logAiError(source, err) {
  console.error(`[${source}] error:`, err.response?.data || err.message);
}

function cleanReply(reply) {
  return String(reply || "")
    .replace(/-{2,}/g, "")
    .replace(/^\s*[_-]+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------------- ROUTES ---------------- */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.post("/chat", async (req, res) => {
  const { message, mode, history, api, memory } = req.body || {};

  // The frontend always pushes the user's message into `history` before
  // sending, but fall back to just the message if history is missing.
  const messages =
    Array.isArray(history) && history.length > 0
      ? history
      : message
      ? [{ role: "user", content: message }]
      : null;

  if (!messages) {
    return res.status(400).json({ reply: "⚠️ No message received." });
  }

  const memoryContext = memory && typeof memory === "object"
    ? Object.entries(memory)
      .filter(([key, value]) => typeof key === "string" && typeof value === "string")
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n")
    : "";
  const promptMessages = memoryContext
    ? [{ role: "system", content: `Remember these user details across chats:\n${memoryContext}` }, ...messages]
    : messages;

  try {
    let reply;

    if (mode === "smart") reply = await smartMode(promptMessages);
    else if (mode === "multi") reply = await multiMode(promptMessages, api);
    else reply = await efficientMode(promptMessages);

    res.json({ reply: cleanReply(reply) });

  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
    // Keep the response shape consistent with what the frontend expects.
    res.status(500).json({ reply: "⚠️ Server error. Please try again." });
  }
});

/* ---------------- START ---------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 AyuAI running on port " + PORT);
});