require("dotenv").config();
const { Telegraf } = require("telegraf");
const fs = require("fs");

// Our modules
const { CHATS_DIR, MEMORIA_DIR, FOTOS_DIR } = require("./src/constants");
const { setupCallbackQueries } = require("./src/admin");
const { setupTextHandler } = require("./src/text");
const { setupPhotoHandler } = require("./src/photo");
const { initVectorStore } = require("./src/langchain_rag");

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Init
if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR);
if (!fs.existsSync(MEMORIA_DIR)) fs.mkdirSync(MEMORIA_DIR);
if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR);

// Inicialitzar LangChain RAG un sol cop a l'inici
initVectorStore().catch((err) => {
  console.error("❌ Error inicialitzant el VectorStore:", err);
});

setupTextHandler(bot);
setupPhotoHandler(bot);
setupCallbackQueries(bot);

bot.launch();
