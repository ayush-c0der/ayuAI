let history = [];
let chats = [];
let currentChatIndex = -1;
let currentMode = "efficient";

/* MODE */
function setMode(mode) {
  currentMode = mode;

  document.body.classList.remove("smart","efficient");
  document.body.classList.add(mode);

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

    addMessage(data.reply, "bot-msg");

    saveChat(); // 🔥 IMPORTANT

  } catch {
    addMessage("⚠️ Error", "bot-msg");
  }
}

/* MESSAGE UI */
function addMessage(text,type) {
  const div = document.createElement("div");
  div.className = "msg " + type;

  div.innerText = text;
  document.getElementById("messages").appendChild(div);

  const box = document.getElementById("messages");
  box.scrollTop = box.scrollHeight;
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