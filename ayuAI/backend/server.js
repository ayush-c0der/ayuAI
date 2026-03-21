const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors());
app.use(express.json());

// ✅ FIXED PATH (VERY IMPORTANT)
app.use(express.static(path.join(__dirname, "../frontend")));

/* ---------------- SYSTEM PROMPT ---------------- */

const SYSTEM_PROMPT = {
  role: "system",
  content: `
You are Ayu AI 🤖, a highly intelligent assistant made by abhay pratap son of santosh kumar.

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
        "HTTP-Referer": "https://your-render-url.onrender.com",
        "X-Title": "AyuAI"
      }
    }
  );

  return res.data.choices[0].message.content;
}

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
<!DOCTYPE html>
<html>
<head>
<title>AyuAI</title>

<meta name="viewport" content="width=device-width, initial-scale=1.0">

  return res.data.choices[0].message.content;
<style>
body {
  margin:0;
  background:#343541;
  color:white;
  font-family:system-ui;
}

/* ---------------- MODES ---------------- */
/* Layout */
.app { display:flex; height:100vh; }

async function efficientMode(history) {
  try { return await groq(history); } catch {}
  try { return await openrouter(history); } catch {}
  return "⚠️ All APIs failed.";
/* Sidebar */
.sidebar {
  width:260px;
  background:#202123;
  padding:15px;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
}

async function smartMode(history) {
  const results = await Promise.allSettled([
    groq(history),
    openrouter(history)
  ]);
.new-btn {
  width:100%;
  padding:10px;
  background:#343541;
  border:1px solid #555;
  color:white;
  border-radius:8px;
  cursor:pointer;
}

  const texts = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
/* Chat */
.chat {
  flex:1;
  display:flex;
  flex-direction:column;
}

  if (texts.length === 0) return "⚠️ All APIs failed.";
/* Topbar */
.topbar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:12px;
  border-bottom:1px solid #444;
}

  return texts.sort((a, b) => b.length - a.length)[0];
/* Logo */
.logo {
  display:flex;
  align-items:center;
  gap:10px;
}

async function multiMode(history, api) {
  try {
    if (api === "groq") return await groq(history);
    if (api === "openrouter") return await openrouter(history);
    return "⚠️ Invalid API selected.";
  } catch {
    return "⚠️ Selected API failed.";
  }
.logo img {
  width:35px;
  height:35px;
  border-radius:6px;
}

/* ---------------- ROUTES ---------------- */
/* Messages */
#messages {
  flex:1;
  padding:20px;
  overflow-y:auto;
  display:flex;
  flex-direction:column;
  gap:18px;
}

// ✅ FIXED: serve frontend homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});
.msg {
  max-width:800px;
  width:100%;
  margin:auto;
  padding:15px;
  border-radius:10px;
  line-height:1.6;
  white-space:pre-wrap;
  word-spacing: 2px; /* FIX spacing */
}

app.post("/chat", async (req, res) => {
  const { mode, history, api } = req.body;
.user-msg { background:#444654; }
.bot-msg { background:#343541; }

  try {
    let reply;
/* Input */
.input-box {
  display:flex;
  padding:15px;
  background:#40414f;
}

    if (mode === "smart") {
      reply = await smartMode(history);
    } else if (mode === "multi") {
      reply = await multiMode(history, api);
    } else {
      reply = await efficientMode(history);
    }
.input-box input {
  flex:1;
  padding:12px;
  border:none;
  border-radius:8px;
  background:#343541;
  color:white;
}

/* Buttons */
button {
  margin-left:10px;
  padding:10px;
  border:none;
  border-radius:8px;
  background:#10a37f;
  color:white;
  cursor:pointer;
}

.mic { background:#ef4444; }
.assistant { background:#9333ea; }

/* Footer */
.footer {
  font-size:12px;
  text-align:center;
  opacity:0.6;
}

/* Mobile */
@media (max-width:768px){
  .sidebar { display:none; }
}
</style>
</head>

<body>

<div class="app">

<!-- Sidebar -->
<div class="sidebar">
  <div>
    <button class="new-btn" onclick="newChat()">+ New Chat</button>
  </div>

  <div class="footer">
    Made by Abhay Pratap 🚀
  </div>
</div>

<!-- Chat -->
<div class="chat">

  <div class="topbar">
    <div class="logo">
      <img src="logo.png">
      <span>AyuAI 🤖</span>
    </div>

    <div>
      <button onclick="setMode('efficient')">⚡</button>
      <button onclick="setMode('smart')">🧠</button>
      <button onclick="startAssistant()" class="assistant">🎧</button>
    </div>
  </div>

  <div id="messages"></div>

  <div class="input-box">
    <input id="input" placeholder="Message AyuAI...">
    <button onclick="send()">Send</button>
    <button class="mic" onclick="startVoice()">🎤</button>
  </div>

</div>
</div>

<script>
let history = [];
let memory = []; // 🔥 persistent memory
let currentMode = "efficient";

/* MODE */
function setMode(mode){
  currentMode = mode;
}

/* CLEAN TEXT (remove emoji for voice) */
function cleanText(text){
  return text.replace(/[\u{1F600}-\u{1F6FF}]/gu, '');
}

/* SEND */
async function send(){
  const input = document.getElementById("input");
  const text = input.value.trim();
  if(!text) return;

    res.json({ reply });
  addMessage(text,"user-msg");
  input.value="";

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Server error" });
  history.push({role:"user",content:text});
  memory.push({role:"user",content:text}); // 🔥 save memory

  try{
    const res = await fetch("/chat",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        message:text,
        mode:currentMode,
        history:[...memory] // 🔥 use memory always
      })
    });

    const data = await res.json();

    history.push({role:"assistant",content:data.reply});
    memory.push({role:"assistant",content:data.reply});

    addMessage(data.reply,"bot-msg",true);

    speak(cleanText(data.reply)); // 🔥 FIX voice emoji

  }catch{
    addMessage("⚠️ Error","bot-msg");
  }
});
}

/* ---------------- START SERVER ---------------- */
/* MESSAGE with typing */
function addMessage(text,type,typing=false){
  const div = document.createElement("div");
  div.className = "msg " + type;

const PORT = process.env.PORT || 3000;
  document.getElementById("messages").appendChild(div);

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
  const box = document.getElementById("messages");

  if(typing){
    let i=0;
    function typeEffect(){
      if(i < text.length){
        div.innerText += text.charAt(i);
        i++;
        box.scrollTop = box.scrollHeight;
        setTimeout(typeEffect,10);
      }
    }
    typeEffect();
  } else {
    div.innerText = text;
  }

  box.scrollTop = box.scrollHeight;
}

/* ENTER */
document.getElementById("input").addEventListener("keydown", e=>{
  if(e.key==="Enter") send();
});

/* VOICE INPUT */
function startVoice(){
  const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  rec.lang="en-US";

  rec.onresult = (e)=>{
    document.getElementById("input").value = e.results[0][0].transcript;
  };

  rec.start();
}

/* BETTER VOICE */
function speak(text){
  const speech = new SpeechSynthesisUtterance(text);

  const voices = speechSynthesis.getVoices();

  speech.voice =
    voices.find(v => v.name.includes("Google UK Female")) ||
    voices.find(v => v.name.includes("Female")) ||
    voices[0];

  speech.rate = 0.95;
  speech.pitch = 1;

  speechSynthesis.cancel();
  speechSynthesis.speak(speech);
}

/* 🎧 FULL ASSISTANT MODE */
function startAssistant(){
  const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  rec.continuous = true;
  rec.lang="en-US";

  rec.onresult = async (e)=>{
    const text = e.results[e.results.length-1][0].transcript;

    addMessage(text,"user-msg");

    memory.push({role:"user",content:text});

    const res = await fetch("/chat",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        message:text,
        mode:currentMode,
        history:memory
      })
    });

    const data = await res.json();

    addMessage(data.reply,"bot-msg",true);
    speak(cleanText(data.reply));
  };

  rec.start();
}

/* NEW CHAT (memory NOT cleared 🔥) */
function newChat(){
  history = [];
  document.getElementById("messages").innerHTML="";
}
</script>

</body>
</html>
