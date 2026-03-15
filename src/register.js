const fs = require("fs");
const { USERS_FILE } = require("./constants");

let usersMap = {};

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      const content = fs.readFileSync(USERS_FILE, "utf-8").trim();
      usersMap = content ? JSON.parse(content) : {};
    } catch (e) {
      console.warn("⚠️  json buit o invàlid, es reinicia com a {}");
      usersMap = {};
    }
  }
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(usersMap, null, 2));
}

function getUser(userId) {
  return usersMap[userId];
}

async function ensureUserRegistration(ctx) {
  const userId = ctx.from.username || ctx.from.id.toString();
  const inputText = ctx.message.text || "";

  // Initialize the user if it doesn't exist
  if (!usersMap[userId]) {
    usersMap[userId] = { id: ctx.from.id, nom: null };
    saveUsers();
  }

  // Logic to ask for the name if we don't have it
  if (!usersMap[userId].nom) {
    if (usersMap[userId].esperantNom && inputText) {
      usersMap[userId].nom = inputText.trim();
      delete usersMap[userId].esperantNom;
      saveUsers();
      await ctx.reply(
        `D'acord, ${usersMap[userId].nom}. Ja t'he fitxat. Què vols ara? 🐒`,
      );
      return false; // Stop here until the next message
    } else {
      usersMap[userId].esperantNom = true;
      saveUsers();
      await ctx.reply(
        "Escolta, no sé qui cony ets. Com et diuen? Escriu el teu nom abans de res, que si no no et penso respondre.",
      );
      return false; // Stop here until the next message
    }
  }

  return true; // User registered, continue
}

// Load initially
loadUsers();

module.exports = {
  ensureUserRegistration,
  getUser,
};
