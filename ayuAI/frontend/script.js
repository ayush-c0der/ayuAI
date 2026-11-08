let history = [];
const COOKIE_NOTICE_KEY = "ayuai_cookie_notice_seen";
const HIGH_STAKES_NOTICE = "\n\n**Important:** This AI provides informational responses and does not replace qualified professional advice. Responses may contain errors or outdated information. For medical, legal, financial, or other high-stakes matters, consult a qualified professional.";
let chats = [];
let currentChatIndex = -1;
let currentMode = "efficient";
let currentFeature = "chat";
let chatSearchQuery = "";
let pinnedChats = [];
let userMemory = {};
let activeRecognition = null;
let activeRecorder = null;
let activeMediaStream = null;
let voiceStartPending = false;

const STORAGE_KEY = "ayuai_chats";
const isSeparateLocalFrontend = window.location.protocol === "file:"
  || (window.location.hostname === "localhost" && window.location.port !== "3000")
  || (window.location.hostname === "127.0.0.1" && window.location.port !== "3000");
const CHAT_ENDPOINT = isSeparateLocalFrontend
  ? "http://localhost:3000/chat"
  : "/chat";
const TRANSCRIBE_ENDPOINT = isSeparateLocalFrontend
  ? "http://localhost:3000/transcribe"
  : "/transcribe";
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
  try {
    const savedPins = JSON.parse(sessionStorage.getItem(PINNED_CHATS_KEY) || "[]");
    pinnedChats = Array.isArray(savedPins)
      ? [...new Set(savedPins.filter(index => Number.isInteger(index) && index >= 0 && index < chats.length))]
      : [];
  } catch {
    pinnedChats = [];
  }
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
  setImageMode(false);

  document.querySelectorAll(".mode-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(
    mode === "smart" ? ".smart-btn" : ".efficient-btn"
  );
  if (activeBtn) activeBtn.classList.add("active");
  if (window.innerWidth <= 768) closeSidebar();
}

function setImageMode(enabled) {
  currentFeature = enabled ? "images" : "chat";
  const imageButton = document.querySelector(".image-feature-btn");
  const input = document.getElementById("input");
  imageButton?.classList.toggle("active", enabled);
  imageButton?.setAttribute("aria-pressed", String(enabled));
  if (input) {
    input.placeholder = enabled
      ? "Describe the image you want to generate..."
      : "Message AyuAI...";
  }
}

function toggleImageMode() {
  setImageMode(currentFeature !== "images");
  if (window.innerWidth <= 768) closeSidebar();
}

function setTheme(theme) {
  const selectedTheme = ["dark", "lite", "glass", "neo"].includes(theme) ? theme : "glass";
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
      <img class="empty-logo" src="logo.svg" alt="AyuAI logo">
      <h1>${["How can I help you today?", "What would you like to explore?", "Ready when you are."][Math.floor(Math.random() * 3)]}</h1>
    </div>
  `;
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
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        mode: currentMode,
        history: history.filter(item => item.content),
        memory: userMemory,
        imageSearch: currentFeature === "images"
      })
    });

    const data = await res.json();
    const reply = res.ok ? data.reply : (data.reply || "AyuAI could not process that request.");
    const images = res.ok && Array.isArray(data.images) ? data.images.slice(0, 1) : [];

    history.push({
      role: "assistant",
      content: images.length ? "" : addHighStakesNotice(text, reply),
      ...(images.length ? { images } : {})
    });

    typingEl.remove();
    addMessage(history[history.length - 1].content, "bot-msg", !images.length, null, images);

    saveChat();

  } catch {
    typingEl.remove();
    addMessage("⚠️ Error — could not reach AyuAI. Please try again.", "bot-msg");
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
function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function showImagePreview(image) {
  const dialog = document.getElementById("image-preview");
  const preview = document.getElementById("image-preview-image");
  const caption = document.getElementById("image-preview-caption");
  const details = document.getElementById("image-preview-details");
  const source = document.getElementById("image-preview-source");
  if (!dialog || !preview || !caption || !details || !source) return;

  const imageUrl = safeImageUrl(image.url) || safeImageUrl(image.thumbnail);
  const sourceUrl = safeImageUrl(image.foreign_landing_url) || imageUrl;
  if (!imageUrl) return;

  preview.src = imageUrl;
  preview.alt = image.title || "Image preview";
  caption.textContent = image.title || "Image preview";
  details.textContent = [
    image.creator ? `By ${image.creator}` : "",
    image.license ? `License: ${image.license}` : "",
    image.attribution || ""
  ].filter(Boolean).join(" · ");
  source.href = sourceUrl;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeImagePreview() {
  const dialog = document.getElementById("image-preview");
  if (typeof dialog?.close === "function") dialog.close();
  else dialog?.removeAttribute("open");
}

function renderImageGallery(images) {
  if (!images.length) return null;

  const gallery = document.createElement("div");
  gallery.className = "image-gallery";
  gallery.setAttribute("aria-label", "Generated image results");

  images.slice(0, 1).forEach(image => {
    const imageUrl = safeImageUrl(image.thumbnail) || safeImageUrl(image.url);
    if (!imageUrl) return;

    const card = document.createElement("article");
    card.className = "image-result";
    const previewButton = document.createElement("button");
    previewButton.className = "image-preview-button";
    previewButton.type = "button";
    previewButton.title = "View larger image";
    previewButton.setAttribute("aria-label", `View larger image: ${image.title || "Untitled image"}`);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = image.title || "Openverse search result";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      const unavailable = document.createElement("span");
      unavailable.className = "image-unavailable";
      unavailable.setAttribute("aria-hidden", "true");
      previewButton.replaceChildren(unavailable);
      previewButton.disabled = true;
    }, { once: true });
    previewButton.addEventListener("click", event => {
      event.stopPropagation();
      showImagePreview(image);
    });
    previewButton.appendChild(img);
    card.appendChild(previewButton);
    gallery.appendChild(card);
  });

  return gallery.childElementCount ? gallery : null;
}

function addMessage(text, type, animate = false, messageIndex = null, images = []) {
  const row = document.createElement("div");
  row.className = "message-row " + type;
  if (images.length && !text) row.classList.add("image-message");
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

  if (type === "bot-msg") {
    const gallery = renderImageGallery(images);
    if (gallery) div.appendChild(gallery);
  }

  box.scrollTop = box.scrollHeight;
}

/* ===== VOICE INPUT ===== */
function updateMicState(state, message = "") {
  const mic = document.querySelector(".mic");
  const status = document.getElementById("voice-status");
  const feedback = document.getElementById("voice-feedback");
  const indicator = document.getElementById("voice-indicator");
  const label = document.getElementById("voice-label");
  if (!mic) return;

  mic.classList.toggle("recording", state === "recording");
  mic.classList.toggle("transcribing", state === "transcribing");
  mic.classList.toggle("mic-error", state === "error");
  const buttonLabel = state === "recording"
    ? "Stop voice input"
    : state === "transcribing"
    ? "Transcribing voice input"
    : "Voice input";
  mic.setAttribute("aria-label", buttonLabel);
  mic.setAttribute("title", buttonLabel);
  mic.setAttribute("aria-pressed", String(state === "recording"));
  mic.disabled = state === "transcribing";
  if (indicator) {
    indicator.hidden = state !== "recording" && state !== "transcribing";
    indicator.setAttribute("aria-hidden", String(state !== "recording" && state !== "transcribing"));
    indicator.classList.toggle("transcribing", state === "transcribing");
  }
  if (label) {
    label.textContent = state === "transcribing" ? "Transcribing" : "Listening";
  }
  if (feedback) {
    feedback.textContent = message;
    feedback.classList.toggle("visible", Boolean(message) && state !== "recording" && state !== "transcribing");
    feedback.classList.toggle("error", state === "error");
  }
  if (status) status.textContent = message || (state === "recording" ? "Listening. Speak now." : "");
}

function voiceErrorMessage(error) {
  const messages = {
    "not-allowed": "Allow microphone access in your browser settings to use voice input.",
    "service-not-allowed": "Voice input is blocked by this browser or device.",
    "audio-capture": "No microphone was found. Check your audio device and try again.",
    network: "Voice recognition could not connect. Check your connection and try again.",
    "no-speech": "No speech was detected. Try again when you are ready.",
    aborted: "Voice input stopped."
  };
  return messages[error] || "Voice input could not start. Check microphone permissions and try again.";
}

async function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (activeRecognition) {
    const recognition = activeRecognition;
    recognition.userStopped = true;
    try { recognition.stop(); } catch { activeRecognition = null; updateMicState("idle"); }
    return;
  }
  if (activeRecorder) {
    activeRecorder.stop();
    return;
  }
  if (voiceStartPending || document.querySelector(".mic")?.disabled) return;
  voiceStartPending = true;

  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    updateMicState("error", "Voice input requires a secure HTTPS connection.");
    voiceStartPending = false;
    return;
  }

  updateMicState("idle");

  if (!Recognition) {
    await startRecordedVoice();
    voiceStartPending = false;
    return;
  }

  try {
    const permission = await navigator.permissions?.query({ name: "microphone" });
    if (permission?.state === "denied") {
      await startRecordedVoice();
      voiceStartPending = false;
      return;
    }
  } catch {
    // Permission queries are inconsistent; start recognition and fall back if it fails.
  }

  let rec;
  try {
    rec = new Recognition();
  } catch {
    await startRecordedVoice();
    voiceStartPending = false;
    return;
  }
  let receivedSpeech = false;
  rec.lang = navigator.language || "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  activeRecognition = rec;

  rec.onstart = () => {
    const preview = document.getElementById("voice-transcript");
    if (preview) preview.textContent = "";
    updateMicState("recording");
  };
  rec.onend = () => {
    if (activeRecognition === rec) {
      activeRecognition = null;
      updateMicState(receivedSpeech || rec.userStopped ? "idle" : "error",
        receivedSpeech ? "Voice input captured." : rec.userStopped ? "" : "No speech was detected. Try again when you are ready.");
    }
  };
  rec.onerror = (event) => {
    if (activeRecognition === rec) activeRecognition = null;
    if (["network", "service-not-allowed", "language-not-supported", "no-speech"].includes(event.error)) {
      updateMicState("recording", "Switching to secure voice recording...");
      window.setTimeout(() => startRecordedVoice(), 0);
    } else {
      updateMicState("error", voiceErrorMessage(event.error));
    }
  };

  rec.onresult = (e) => {
    receivedSpeech = true;
    const transcript = Array.from(e.results)
      .map(result => result[0].transcript)
      .join("");
    const input = document.getElementById("input");
    if (input) input.value = transcript;
    const preview = document.getElementById("voice-transcript");
    if (preview) preview.textContent = transcript;
  };

  try {
    rec.start();
    updateMicState("recording");
  } catch (error) {
    activeRecognition = null;
    if (["NotAllowedError", "InvalidStateError"].includes(error.name)) {
      await startRecordedVoice();
    } else {
      updateMicState("error", voiceErrorMessage(error.name === "NotAllowedError" ? "not-allowed" : "start-failed"));
    }
  }
  voiceStartPending = false;
}

async function startRecordedVoice() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    updateMicState("error", "Voice input is not supported on this browser. Try a current version of Chrome, Edge, or Safari.");
    return;
  }

  try {
    activeMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(activeMediaStream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    activeRecorder = recorder;
    const preview = document.getElementById("voice-transcript");
    if (preview) preview.textContent = "";
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      if (activeRecorder === recorder) activeRecorder = null;
      activeMediaStream?.getTracks().forEach(track => track.stop());
      activeMediaStream = null;
      updateMicState("error", "Microphone recording failed. Check your microphone and try again.");
    };
    recorder.onstop = async () => {
      if (activeRecorder === recorder) activeRecorder = null;
      activeMediaStream?.getTracks().forEach(track => track.stop());
      activeMediaStream = null;
      const recording = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (!recording.size) {
        updateMicState("error", "No voice was recorded. Tap the microphone and try again.");
        return;
      }

      updateMicState("transcribing");
      try {
        const response = await fetch(TRANSCRIBE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": recording.type.split(";")[0] },
          body: recording
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Voice transcription failed. Please try again.");
        const transcript = String(data.transcript || "").trim();
        if (!transcript) throw new Error("No speech was detected. Try speaking a little closer to the microphone.");
        const input = document.getElementById("input");
        if (input) input.value = transcript;
        const preview = document.getElementById("voice-transcript");
        if (preview) preview.textContent = transcript;
        updateMicState("idle", "Voice input captured.");
      } catch (error) {
        updateMicState("error", error.message || "Voice transcription failed. Please try again.");
      }
    };

    recorder.start(250);
    updateMicState("recording", "Listening. Tap the microphone again when you are done.");
  } catch (error) {
    activeMediaStream?.getTracks().forEach(track => track.stop());
    activeMediaStream = null;
    const reason = error.name === "NotAllowedError" || error.name === "SecurityError"
      ? "Allow microphone access in your browser settings to use voice input."
      : error.name === "NotFoundError"
      ? "No microphone was found. Check your audio device and try again."
      : "Could not access the microphone. Check its permissions and try again.";
    updateMicState("error", reason);
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

  const normalizedQuery = chatSearchQuery.trim().toLocaleLowerCase();
  const matchesQuery = chat => !normalizedQuery || chat.some(message =>
    String(message.content || "").toLocaleLowerCase().includes(normalizedQuery)
  );
  if (chats.length === 0 || !chats.some(matchesQuery)) {
    const empty = document.createElement("div");
    empty.className = "chat-list-empty";
    empty.innerText = chats.length === 0 ? "No chats yet" : "No matching chats";
    list.appendChild(empty);
    return;
  }

  const renderItem = (chat, i, target) => {
    const title = chat[0]?.content || "New Chat";
    if (!matchesQuery(chat)) return;
    const item = document.createElement("div");
    item.className = "chat-item" + (i === currentChatIndex ? " active" : "");
    const isPinned = pinnedChats.includes(i);
    item.innerHTML = `<span class="chat-number">${i + 1}</span><svg class="chat-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6a7.5 7.5 0 1 1 17-3.5Z"/><path d="M8 10h8M8 14h5"/></svg><span class="chat-title"></span><button class="pin-btn" type="button" title="${isPinned ? "Unpin" : "Pin"} chat" aria-label="${isPinned ? "Unpin" : "Pin"} chat" aria-pressed="${isPinned}">${isPinned ? "★" : "☆"}</button>`;
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
  setImageMode(false);
  history = chats[i].map(message => message.images?.length
    ? { ...message, content: "" }
    : message);
  currentChatIndex = i;

  const box = document.getElementById("messages");
  box.innerHTML = "";

  history.forEach((m, index) => {
    addMessage(m.content, m.role === "user" ? "user-msg" : "bot-msg", false, m.role === "user" ? index : null, m.images || []);
  });

  renderChatList();
  closeSidebar();
}

/* ===== NEW CHAT ===== */
function newChat() {
  setImageMode(false);
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
setTheme(localStorage.getItem(THEME_KEY) || "glass");

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
  chatSearchQuery = event.currentTarget.value;
  renderChatList();
});
document.getElementById("chat-search")?.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.currentTarget.value = "";
    chatSearchQuery = "";
    renderChatList();
    event.currentTarget.blur();
  }
});
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const search = document.getElementById("chat-search");
    const container = document.querySelector(".sidebar-search");
    if (!search || !container) return;
    container.classList.add("open");
    document.querySelector(".search-toggle")?.setAttribute("aria-expanded", "true");
    search.focus();
  }
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
  try {
    sessionStorage.setItem(PINNED_CHATS_KEY, JSON.stringify(pinnedChats));
  } catch (error) {
    console.error("Could not save pinned chats:", error);
  }
  renderChatList();
}

function rememberUserDetails(text) {
  const nameMatch = text.match(/\b(?:my name is|call me)\s+([a-z][a-z .'-]{1,40})/i);
  if (!nameMatch) return;
  userMemory.name = nameMatch[1].trim().replace(/[.!?]+$/, "");
  sessionStorage.setItem(MEMORY_KEY, JSON.stringify(userMemory));
}