let history = [];
const COOKIE_NOTICE_KEY = "ayuai_cookie_notice_seen";
const HIGH_STAKES_NOTICE = "\n\n**Important:** This AI provides informational responses and does not replace qualified professional advice. Responses may contain errors or outdated information. For medical, legal, financial, or other high-stakes matters, consult a qualified professional.";
let chats = [];
let currentChatIndex = -1;
let currentMode = "efficient";
let chatSearchQuery = "";
let pinnedChats = [];
let userMemory = {};
let activeRecognition = null;

const STORAGE_KEY = "ayuai_chats";
const isSeparateLocalFrontend = window.location.protocol === "file:"
  || (window.location.hostname === "localhost" && window.location.port !== "3000")
  || (window.location.hostname === "127.0.0.1" && window.location.port !== "3000");
const CHAT_ENDPOINT = isSeparateLocalFrontend
  ? "http://localhost:3000/chat"
  : "/chat";
const IMAGE_ENDPOINT = CHAT_ENDPOINT.replace(/\/chat$/, "/generate-image");
const SIDEBAR_COLLAPSED_KEY = "ayuai_sidebar_collapsed";
const PINNED_CHATS_KEY = "ayuai_pinned_chats";
const MEMORY_KEY = "ayuai_memory";
const THEME_KEY = "ayuai_theme";

/* ===== STORAGE (temporary per-tab memory, survives reload) ===== */
function loadChatsFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    chats = raw ? JSON.parse(raw) : [];
  } catch {
    chats = [];
  }
  try { pinnedChats = JSON.parse(sessionStorage.getItem(PINNED_CHATS_KEY) || "[]"); } catch { pinnedChats = []; }
  try { userMemory = JSON.parse(sessionStorage.getItem(MEMORY_KEY) || "{}"); } catch { userMemory = {}; }
}

function persistChats() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    /* storage unavailable (private mode / quota) — fail silently */
  }
}

/* ===== MODE ===== */
function setMode(mode) {
  currentMode = mode;
  document.body.dataset.mode = mode;

  document.querySelectorAll(".mode-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(
    mode === "smart" ? ".smart-btn" : ".efficient-btn"
  );
  if (activeBtn) activeBtn.classList.add("active");
}

function setTheme(theme) {
  const selectedTheme = ["dark", "lite", "glass", "neo"].includes(theme) ? theme : "dark";
  document.body.dataset.theme = selectedTheme;
  localStorage.setItem(THEME_KEY, selectedTheme);
  document.querySelectorAll(".theme-btn").forEach(button => {
    const isSelected = button.dataset.themeChoice === selectedTheme;
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}


function toggleChatSearch(event) {
  const search = document.getElementById("chat-search");
  const toggle = document.querySelector(".search-toggle");
  if (!search) return;
  if (event?.target.closest("#chat-search")) return;

  const isOpen = document.querySelector(".sidebar-search")?.classList.toggle("open");
  toggle?.setAttribute("aria-expanded", String(Boolean(isOpen)));
  if (isOpen) search.focus();
}

function toggleSidebarSize() {
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.querySelector(".sidebar-size-toggle");
  if (!sidebar) return;

  const collapsed = sidebar.classList.toggle("collapsed");
  toggle?.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  toggle?.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  const compactSetting = document.getElementById("compact-setting");
  if (compactSetting) compactSetting.checked = collapsed;
}

/* ===== SIDEBAR (mobile) ===== */
function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.toggle("open");
  document.querySelector(".sidebar-backdrop")?.classList.toggle("open");
}

function closeSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.querySelector(".sidebar-backdrop")?.classList.remove("open");
}

/* ===== EMPTY STATE HELPERS ===== */
function clearEmptyState() {
  const empty = document.querySelector(".empty-state");
  if (empty) empty.remove();
}

function showEmptyState() {
  const box = document.getElementById("messages");
  if (!box) return;
  box.innerHTML = `
    <div class="empty-state">
      <img src="logo.svg" alt="AyuAI Logo" style="width: 32px; height: 32px; image-rendering: crisp-edges;">
      <h1>${["How can I help you today?", "What would you like to explore?", "Ready when you are."][Math.floor(Math.random() * 3)]}</h1>
    </div>
  `;
}

function isImageGenerationRequest(text) {
  return /\b(generate|create|make|draw|design|illustrate|paint)\b/i.test(text)
    && /\b(image|picture|photo|illustration|artwork|logo|wallpaper|portrait)\b/i.test(text);
}

/* ===== SEND ===== */
async function send() {
  const input = document.getElementById("input");
  const sendBtn = document.querySelector(".send-btn");
  const text = input.value.trim();
  if (!text) return;

  clearEmptyState();
  addMessage(text, "user-msg", false, history.length);
  input.value = "";
  if (sendBtn) sendBtn.disabled = true;

    history.push({ role: "user", content: text });
    rememberUserDetails(text);

  const typingEl = showTypingIndicator();

  try {
    let reply;
    let imageUrl;
    if (isImageGenerationRequest(text)) {
      const res = await fetch(IMAGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.reply || "Image generation failed.");
      }
      imageUrl = URL.createObjectURL(await res.blob());
      reply = `Generated image: ${text}`;
    } else {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode: currentMode,
          history,
          memory: userMemory
        })
      });

      const data = await res.json();
      reply = res.ok ? data.reply : (data.reply || "AyuAI could not process that request.");
    }

    history.push({ role: "assistant", content: addHighStakesNotice(text, reply) });

    typingEl.remove();
    addMessage(history[history.length - 1].content, "bot-msg", !imageUrl, null, imageUrl);

    saveChat();

  } catch (error) {
    typingEl.remove();
    addMessage(error.message || "⚠️ Error — could not reach AyuAI. Please try again.", "bot-msg");
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function addHighStakesNotice(question, reply) {
  const highStakesTopic = /\b(medical|medicine|doctor|symptom|diagnos|health|legal|lawyer|lawsuit|contract|financial|finance|invest|investment|loan|tax|safety|danger|emergency)\b/i.test(question);
  return highStakesTopic && !reply.includes("This AI provides informational responses")
    ? reply + HIGH_STAKES_NOTICE
    : reply;
}

/* ===== TYPING INDICATOR ===== */
function showTypingIndicator() {
  const div = document.createElement("div");
  div.className = "msg bot-msg typing-indicator";
  div.innerHTML = "<span></span><span></span><span></span>";

  const box = document.getElementById("messages");
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  return div;
}

function formatAssistantText(text) {
  const escaped = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

  return escaped
    .replace(/-{2,}/g, "")
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^#\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/(^|\n)\s*--\s*(?=\n|$)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

async function copyMessage(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  const originalLabel = button.getAttribute("aria-label");
  button.setAttribute("aria-label", "Copied");
  button.title = "Copied";
  button.classList.add("copied");
  setTimeout(() => {
    button.setAttribute("aria-label", originalLabel);
    button.title = "Copy message";
    button.classList.remove("copied");
  }, 1200);
}

function editMessage(row, messageIndex, text) {
  const message = row.querySelector(".msg");
  const actions = row.querySelector(".message-actions");
  if (!message || !actions || messageIndex === null) return;

  const editor = document.createElement("textarea");
  editor.className = "message-editor";
  editor.value = text;
  editor.rows = 2;
  message.replaceChildren(editor);
  actions.innerHTML = "<button class=\"message-action edit-save\">Save</button><button class=\"message-action edit-cancel\">Cancel</button>";
  editor.focus();

  actions.querySelector(".edit-cancel").onclick = () => {
    message.textContent = text;
    renderMessageActions(row, messageIndex, text);
  };
  actions.querySelector(".edit-save").onclick = () => {
    const updated = editor.value.trim();
    if (!updated) return;
    history[messageIndex].content = updated;
    rememberUserDetails(updated);
    persistChats();
    message.textContent = updated;
    renderMessageActions(row, messageIndex, updated);
  };
}

function renderMessageActions(row, messageIndex, text) {
  const actions = row.querySelector(".message-actions");
  actions.innerHTML = `<button class="message-action copy-action" title="Copy message" aria-label="Copy message"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>`;
  if (messageIndex !== null) actions.innerHTML += `<button class="message-action edit-action" title="Edit message" aria-label="Edit message">Edit</button>`;
  actions.querySelector(".copy-action").onclick = () => copyMessage(text, actions.querySelector(".copy-action"));
  actions.querySelector(".edit-action")?.addEventListener("click", () => editMessage(row, messageIndex, text));
}

function toggleMessageActions(row) {
  document.querySelectorAll(".message-row.actions-open").forEach(item => {
    if (item !== row) item.classList.remove("actions-open");
  });
  row.classList.toggle("actions-open");
}

/* ===== MESSAGE UI (fast batched reveal — feels instant even for long replies) ===== */
function addMessage(text, type, animate = false, messageIndex = null, imageUrl = null) {
  const row = document.createElement("div");
  row.className = "message-row " + type;
  row.addEventListener("click", event => {
    if (!event.target.closest(".message-action")) toggleMessageActions(row);
  });
  const div = document.createElement("div");
  div.className = "msg " + type;
  if (type === "user-msg") div.classList.add("message-flight");

  const actions = document.createElement("div");
  actions.className = "message-actions";
  row.append(div, actions);
  renderMessageActions(row, type === "user-msg" ? messageIndex : null, text);

  const box = document.getElementById("messages");
  box.appendChild(row);

  if (animate && text.length > 0) {
    // Reveal the whole message in ~40 animation frames regardless of length,
    // so short and long replies both feel equally fast.
    const totalFrames = 40;
    const charsPerFrame = Math.max(1, Math.ceil(text.length / totalFrames));
    let i = 0;

    function step() {
      i = Math.min(text.length, i + charsPerFrame);
      if (type === "bot-msg") {
        div.innerHTML = formatAssistantText(text.slice(0, i));
      } else {
        div.innerText = text.slice(0, i);
      }
      box.scrollTop = box.scrollHeight;

      if (i < text.length) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  } else {
    if (type === "bot-msg") {
      div.innerHTML = formatAssistantText(text);
    } else {
      div.innerText = text;
    }
  }

  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "generated-image";
    image.src = imageUrl;
    image.alt = text;
    image.loading = "lazy";
    div.appendChild(image);
  }

  box.scrollTop = box.scrollHeight;
}

/* ===== 🎤 VOICE INPUT (ONLY FILLS INPUT, NO AUTO SEND) ===== */
function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = document.querySelector(".mic");
  if (!SpeechRecognition) {
    alert("Voice not supported");
    return;
  }

  if (activeRecognition) {
    activeRecognition.stop();
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  activeRecognition = rec;

  rec.onstart = () => {
    mic?.classList.add("recording");
    mic?.setAttribute("aria-label", "Stop voice input");
    mic?.setAttribute("title", "Stop voice input");
  };
  rec.onend = () => {
    activeRecognition = null;
    mic?.classList.remove("recording");
    mic?.setAttribute("aria-label", "Voice input");
    mic?.setAttribute("title", "Voice input");
  };
  rec.onerror = (event) => {
    rec.stop();
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      alert("Allow microphone access in your browser settings to use voice input.");
    }
  };

  rec.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(result => result[0].transcript)
      .join("");
    document.getElementById("input").value = transcript;
  };

  try {
    rec.start();
  } catch {
    activeRecognition = null;
    mic?.classList.remove("recording");
  }
}

/* ===== ENTER KEY ===== */
document.getElementById("input").addEventListener("keydown", e => {
  if (e.key === "Enter") send();
});

/* ===== SAVE CHAT (persists to browser storage) ===== */
function saveChat() {
  if (currentChatIndex === -1) {
    pinnedChats = pinnedChats.map(index => index + 1);
    chats.unshift([...history]);
    currentChatIndex = 0;
    sessionStorage.setItem(PINNED_CHATS_KEY, JSON.stringify(pinnedChats));
  } else {
    chats[currentChatIndex] = [...history];
  }

  persistChats();
  renderChatList();
}

/* ===== SHOW CHAT LIST ===== */
function renderChatList() {
  const list = document.getElementById("chat-list");
  const pinnedList = document.getElementById("pinned-list");
  if (!list) return;

  list.innerHTML = "";
  if (pinnedList) pinnedList.innerHTML = "";

  if (chats.length === 0 || !chats.some(chat => {
    const title = chat[0]?.content || "New Chat";
    return !chatSearchQuery || title.toLowerCase().includes(chatSearchQuery);
  })) {
    const empty = document.createElement("div");
    empty.className = "chat-list-empty";
    empty.innerText = chats.length === 0 ? "No chats yet" : "No matching chats";
    list.appendChild(empty);
    return;
  }

  const renderItem = (chat, i, target) => {
    const title = chat[0]?.content || "New Chat";
    if (chatSearchQuery && !title.toLowerCase().includes(chatSearchQuery)) return;
    const item = document.createElement("div");
    item.className = "chat-item" + (i === currentChatIndex ? " active" : "");
    item.innerHTML = `<span class="chat-number">${i + 1}</span><span class="chat-title"></span><button class="pin-btn" title="${pinnedChats.includes(i) ? "Unpin" : "Pin"} chat" aria-label="${pinnedChats.includes(i) ? "Unpin" : "Pin"} chat">${pinnedChats.includes(i) ? "★" : "☆"}</button>`;
    item.querySelector(".chat-title").textContent = title.slice(0, 26);

    item.onclick = () => loadChat(i);
    item.oncontextmenu = event => {
      event.preventDefault();
      if (confirm("Delete this conversation?")) deleteChat(i);
    };
    item.querySelector(".pin-btn").onclick = event => { event.stopPropagation(); togglePinned(i); };

    target.appendChild(item);
  };
  chats.forEach((chat, i) => {
    if (pinnedChats.includes(i) && pinnedList) renderItem(chat, i, pinnedList);
    else renderItem(chat, i, list);
  });
}

/* ===== LOAD CHAT ===== */
function loadChat(i) {
  history = [...chats[i]];
  currentChatIndex = i;

  const box = document.getElementById("messages");
  box.innerHTML = "";

  history.forEach((m, index) => {
    addMessage(m.content, m.role === "user" ? "user-msg" : "bot-msg", false, m.role === "user" ? index : null);
  });

  renderChatList();
  closeSidebar();
}

/* ===== NEW CHAT ===== */
function newChat() {
  history = [];
  currentChatIndex = -1;

  showEmptyState();
  renderChatList();
  closeSidebar();
}

function deleteChat(index) {
  if (index < 0 || index >= chats.length) return;
  chats.splice(index, 1);
  pinnedChats = pinnedChats.filter(item => item !== index).map(item => item > index ? item - 1 : item);
  if (currentChatIndex === index) {
    history = [];
    currentChatIndex = -1;
    showEmptyState();
  } else if (currentChatIndex > index) {
    currentChatIndex -= 1;
  }
  sessionStorage.setItem(PINNED_CHATS_KEY, JSON.stringify(pinnedChats));
  persistChats();
  renderChatList();
}

function deleteAllChats() {
  if (!chats.length || !confirm("Delete all conversations? This cannot be undone.")) return;
  chats = [];
  pinnedChats = [];
  history = [];
  currentChatIndex = -1;
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(PINNED_CHATS_KEY);
  showEmptyState();
  renderChatList();
}

/* ===== INIT ===== */
loadChatsFromStorage();
renderChatList();
setMode(currentMode);   
setTheme(localStorage.getItem(THEME_KEY) || "dark");

if (!localStorage.getItem(COOKIE_NOTICE_KEY)) {
  const cookieNotice = document.getElementById("cookie-notice");
  if (cookieNotice) cookieNotice.hidden = false;
}

function acceptCookies() {
  localStorage.setItem(COOKIE_NOTICE_KEY, "true");
  const cookieNotice = document.getElementById("cookie-notice");
  if (cookieNotice) cookieNotice.hidden = true;
}

document.getElementById("chat-search")?.addEventListener("input", event => {
  chatSearchQuery = event.target.value.trim().toLowerCase();
  renderChatList();
});

document.getElementById("compact-setting")?.addEventListener("change", event => {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("collapsed", event.target.checked);
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(event.target.checked));
});

document.getElementById("motion-setting")?.addEventListener("change", event => {
  document.body.classList.toggle("reduce-motion", event.target.checked);
});

document.querySelectorAll(".theme-btn").forEach(button => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});

document.getElementById("density-setting")?.addEventListener("change", event => {
  document.body.dataset.density = event.target.value;
});

if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true") {
  document.querySelector(".sidebar")?.classList.add("collapsed");
  const compactSetting = document.getElementById("compact-setting");
  if (compactSetting) compactSetting.checked = true;
  document.querySelector(".sidebar-size-toggle")?.setAttribute("aria-label", "Expand sidebar");
  document.querySelector(".sidebar-size-toggle")?.setAttribute("title", "Expand sidebar");
}

function toggleSettings() {
  const panel = document.getElementById("settings-panel");
  if (!panel) return;
  const open = panel.classList.toggle("open");
  panel.setAttribute("aria-hidden", String(!open));
}

function togglePinned(index) {
  pinnedChats = pinnedChats.includes(index)
    ? pinnedChats.filter(item => item !== index)
    : [...pinnedChats, index];
  sessionStorage.setItem(PINNED_CHATS_KEY, JSON.stringify(pinnedChats));
  renderChatList();
}

function rememberUserDetails(text) {
  const nameMatch = text.match(/\b(?:my name is|call me)\s+([a-z][a-z .'-]{1,40})/i);
  if (!nameMatch) return;
  userMemory.name = nameMatch[1].trim().replace(/[.!?]+$/, "");
  sessionStorage.setItem(MEMORY_KEY, JSON.stringify(userMemory));
}