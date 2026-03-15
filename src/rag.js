const fs = require("fs");
const path = require("path");
const {
  MEMORIA_DIR,
  TIMELINE_FILE,
  AMICS_FILE,
  CHATS_DIR,
} = require("./constants");

/**
 * Utilities
 */
function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function calculateScore(text, keywords) {
  const textNorm = normalize(text);
  let score = 0;
  keywords.forEach((p) => {
    if (textNorm.includes(p)) score += 1;
  });
  return score;
}

function formatRelativeDate(dataStr) {
  if (!dataStr) return "Data desconeguda";
  const data = new Date(dataStr);
  if (isNaN(data)) return dataStr;

  const ara = new Date();
  const diffYears = ara.getFullYear() - data.getFullYear();
  const diffMonths =
    (ara.getFullYear() - data.getFullYear()) * 12 +
    (ara.getMonth() - data.getMonth());

  if (diffYears > 0) return `${dataStr} (fa uns ${diffYears} anys)`;
  if (diffMonths > 0) return `${dataStr} (fa uns ${diffMonths} mesos)`;
  return dataStr;
}

/**
 * 1. Search in specific memory (specific data of users)
 */
async function findMemory(userMessage) {
  if (!fs.existsSync(MEMORIA_DIR)) return "";
  try {
    const keywords = normalize(userMessage)
      .split(/\W+/)
      .filter((p) => p.length > 2);
    if (keywords.length === 0) return "";

    const files = fs
      .readdirSync(MEMORIA_DIR)
      .filter((f) => f.endsWith(".json"));
    let results = [];

    files.forEach((file) => {
      const username = file.replace(".json", "");
      const data = JSON.parse(
        fs.readFileSync(path.join(MEMORIA_DIR, file), "utf-8"),
      );

      const scored = data
        .map((m) => ({
          ...m,
          score: calculateScore(m.text, keywords),
          user: username,
        }))
        .filter((m) => m.score > 0);

      results.push(...scored);
    });

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, 10);

    if (topResults.length === 0) return "";

    let text = "\nRecordes que: ";
    topResults.forEach((r, i) => {
      text += `${r.user} et va dir que ${r.text}`;
      if (i < topResults.length - 1) text += ". També ";
    });
    text += ".";
    return text;
  } catch (e) {
    console.error("Error memoryEngine (Memòria):", e);
    return "";
  }
}

/**
 * 2. Search in Timeline (Anecdotes and history of the group)
 */
async function findTimeline(userMessage) {
  if (!fs.existsSync(TIMELINE_FILE)) return "";
  try {
    const data = JSON.parse(fs.readFileSync(TIMELINE_FILE, "utf-8"));
    const keywords = normalize(userMessage)
      .split(/\W+/)
      .filter((p) => p.length > 2);
    if (keywords.length === 0) return "";

    const results = data
      .map((item) => {
        let score = 0;
        score += calculateScore(item.esdeveniment, keywords) * 3;
        if (item.protagonistes)
          score += calculateScore(item.protagonistes.join(" "), keywords) * 2;
        if (item.tags) score += calculateScore(item.tags.join(" "), keywords);
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (results.length === 0) return "";

    let text = "\nAnècdotes que recordes: ";
    results.forEach((r, i) => {
      const dataRelativa = formatRelativeDate(r.data_original || r.data);
      text += `${r.esdeveniment} (${dataRelativa})`;
      if (i < results.length - 1) text += ". ";
    });
    text += ".";
    return text;
  } catch (e) {
    console.error("Error memoryEngine (Timeline):", e);
    return "";
  }
}

/**
 * 3. Search in Friends' files (Who is who)
 */
function findFriends(userMessage) {
  if (!fs.existsSync(AMICS_FILE)) return "";
  try {
    const friends = JSON.parse(fs.readFileSync(AMICS_FILE, "utf-8"));
    const keywords = normalize(userMessage)
      .split(/\W+/)
      .filter((p) => p.length > 2);
    if (keywords.length === 0) return "";

    const results = friends
      .map((friend) => {
        let score =
          calculateScore(`${friend.name} ${friend.surnames || ""}`, keywords) *
          5;
        score += calculateScore(friend.description || "", keywords) * 2;
        return { ...friend, score };
      })
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (results.length === 0) return "";

    let text = "\nSaps que: ";
    results.forEach((a, i) => {
      text += `${a.name} ${a.description || ""}`;
      if (a.birthdate) text += `, nascut el ${a.birthdate}`;
      if (i < results.length - 1) text += ". ";
    });
    text += ".";
    return text;
  } catch (e) {
    console.error("Error memoryEngine (Amics):", e);
    return "";
  }
}

async function findRelevantMemory(userMessage) {
  let text = "";
  text += findMemory(userMessage);
  text += findTimeline(userMessage);
  text += findFriends(userMessage);
  return Promise.resolve(text);
}

/**
 * 4. Search in Chat History (Recent conversations context)
 */
function findRelevantChatHistory(userMessage) {
  if (!fs.existsSync(CHATS_DIR)) return "";
  try {
    const keywords = normalize(userMessage)
      .split(/\W+/)
      .filter((p) => p.length > 3);
    if (keywords.length === 0) return "";

    const files = fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith(".json"));
    let results = [];

    files.forEach((file) => {
      const username = file.replace(".json", "");
      const chats = JSON.parse(
        fs.readFileSync(path.join(CHATS_DIR, file), "utf-8"),
      );

      const scored = chats
        .filter((m) => m.role !== "system")
        .map((m) => ({
          ...m,
          score: calculateScore(m.content, keywords),
          user: username,
        }))
        .filter((m) => m.score > 0);

      results.push(...scored);
    });

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, 5);

    if (topResults.length === 0) return "";

    let text = "\nEXTRACTES DE CONVERSES RECENTS RELACIONADES:\n";
    topResults.forEach((r) => {
      const author = r.role === "user" ? `@${r.user}` : "Jo (Eladi)";
      text += `- ${author}: "${r.content}"\n`;
    });
    return text;
  } catch (e) {
    console.error("Error memoryEngine (Historial):", e);
    return "";
  }
}

function saveMemory(user, message) {
  if (!fs.existsSync(MEMORIA_DIR)) fs.mkdirSync(MEMORIA_DIR);
  const file = path.join(MEMORIA_DIR, `${user}.json`);
  let data = [];
  if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, "utf-8"));
  data.push({ text: message, date: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function saveToChatHistory(user, message) {
  if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR);
  const file = path.join(CHATS_DIR, `${user}.json`);
  let data = [];
  if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, "utf-8"));
  data.push({ text: message, date: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


module.exports = {
  findRelevantMemory,
  findRelevantChatHistory,
  saveMemory,
  saveToChatHistory
}