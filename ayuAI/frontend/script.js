let history = [];
let chats = [];
let currentChatIndex = -1;
let currentMode = "efficient";

/* 🎤 Assistant control */
let assistantActive = false;
let recognition;

/* MODE */
function setMode(mode) {
  currentMode = mode;

  document.body.classList.remove("smart","efficient");
  document.body.classList.add(mode);

  // 🔥 stop assistant when switching mode
  assistantActive = false;
  if (recognition) recognition.stop();

  document.getElementById("menu").style.display = "none";

  document.getElementById("ai-name").innerText =
    mode === "smart" ? "🧠 Smart ▼" : "⚡ Efficient ▼";
}

/* SEND */
async function send() {
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user-msg");
  input.value = "";

  history.push({ role:"user", content:text });

  try {
    const res = await fetch("/chat", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        message:text,
        mode:currentMode,
        history:history
      })
    });

    const data = await res.json();

    history.push({ role:"assistant", content:data.reply });

    addMessage(data.reply, "bot-msg", true);

    speak(data.reply); // 🔥 voice reply

    saveChat();

  } catch {
    addMessage("⚠️ Error", "bot-msg");
  }
}

/* MESSAGE UI (WITH TYPING EFFECT) */
function addMessage(text, type, typing=false) {
  const div = document.createElement("div");
  div.className = "msg " + type;

  document.getElementById("messages").appendChild(div);

  const box = document.getElementById("messages");

  if (typing) {
    let i = 0;
    function typeEffect() {
      if (i < text.length) {
        div.innerText += text.charAt(i);
        i++;
        box.scrollTop = box.scrollHeight;
        setTimeout(typeEffect, 10);
      }
    }
    typeEffect();
  } else {
    div.innerText = text;
  }

  box.scrollTop = box.scrollHeight;
}

/* 🔊 BETTER VOICE */
function speak(text) {
  // ❌ remove emojis
  const clean = text.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '');

  const speech = new SpeechSynthesisUtterance(clean);
  const voices = speechSynthesis.getVoices();

  speech.voice =
    voices.find(v => v.name.includes("Google UK English Female")) ||
    voices.find(v => v.name.includes("Google US English")) ||
    voices.find(v => v.name.includes("Female")) ||
    voices[0];

  speech.rate = 0.95;
  speech.pitch = 1;

  speechSynthesis.cancel();
  speechSynthesis.speak(speech);
}

/* 🎤 VOICE INPUT */
function startVoice() {
  const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  rec.lang = "en-US";

  rec.onresult = (e) => {
    document.getElementById("input").value = e.results[0][0].transcript;
  };

  rec.start();
}

/* 🎧 ASSISTANT MODE (FIXED) */
function startAssistant() {

  // toggle OFF
  if (assistantActive) {
    assistantActive = false;
    if (recognition) recognition.stop();
    return;
  }

  assistantActive = true;

  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.continuous = true;
  recognition.lang = "en-US";

  recognition.onresult = async (e) => {
    if (!assistantActive) return;

    const text = e.results[e.results.length-1][0].transcript;

    addMessage(text, "user-msg");
    history.push({ role:"user", content:text });

    const res = await fetch("/chat", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        message:text,
        mode:currentMode,
        history:history
      })
    });

    const data = await res.json();

    history.push({ role:"assistant", content:data.reply });

    addMessage(data.reply, "bot-msg", true);
    speak(data.reply);

    saveChat();
  };

  recognition.start();
}

/* ENTER */
document.getElementById("input").addEventListener("keydown", e=>{
  if(e.key==="Enter") send();
});

/* SAVE CHAT IN RAM */
function saveChat() {
  if (currentChatIndex === -1) {
    chats.push([...history]);
    currentChatIndex = chats.length - 1;
  } else {
    chats[currentChatIndex] = [...history];
  }

  renderChatList();
}

/* SHOW CHAT LIST */
function renderChatList() {
  const list = document.getElementById("chat-list");
  if (!list) return;

  list.innerHTML = "";

  chats.forEach((chat, i) => {
    const item = document.createElement("div");
    item.className = "chat-item";
    item.innerText = chat[0]?.content?.slice(0, 20) || "New Chat";

    item.onclick = () => loadChat(i);

    list.appendChild(item);
  });
}

/* LOAD CHAT */
function loadChat(i) {
  history = [...chats[i]];
  currentChatIndex = i;

  const box = document.getElementById("messages");
  box.innerHTML = "";

  history.forEach(m => {
    addMessage(m.content, m.role === "user" ? "user-msg" : "bot-msg");
  });
}

/* NEW CHAT */
function newChat() {
  history = [];
  currentChatIndex = -1;
  document.getElementById("messages").innerHTML = "";
}
