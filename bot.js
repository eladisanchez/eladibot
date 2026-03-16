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

const defaultCommands = [
  { command: "esborra", description: "Elimina totes les teves converses de la memòria" },
  { command: "guarda", description: "Guarda un record a la memòria" },
  { command: "conte", description: "L'Eladi et genera un conte segons el que li diguis" },
  { command: "haiku", description: "L'Eladi et fa un haiku ben parit" }
]

// Comands per defecte (tothom)
bot.telegram.setMyCommands(defaultCommands);

// Comands per l'admin (eladisc)
bot.telegram.setMyCommands([
  ...defaultCommands,
  { command: "xats", description: "Llistar tots els xats guardats" },
], {
  scope: { type: "chat", chat_id: 491435209 }
});

bot.launch();
