const { OllamaEmbeddings } = require("@langchain/ollama");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { Document } = require("@langchain/core/documents");
const fs = require("fs");
const path = require("path");
const { TIMELINE_FILE, AMICS_FILE, MEMORIA_DIR, CHATS_DIR } = require("./constants");

// Configuració d'Embeddings
const embeddings = new OllamaEmbeddings({
  model: process.env.OLLAMA_EMBED_MODEL || "bge-m3",
  baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
});

let vectorStore;
let isInitializing = false;

/**
 * Carrega les dades dels JSONs i inicialitza el VectorStore
 */
async function initVectorStore(force = false) {
  if (isInitializing) return; // Evita crides concurrents
  if (vectorStore && !force) return; // Ja està inicialitzat i no es demana forçar

  isInitializing = true;
  try {
    console.log("🔄 Inicialitzant VectorStore (LangChain RAG)...");
    const docs = [];

    // 1. Carregar Timeline
    if (fs.existsSync(TIMELINE_FILE)) {
      try {
        const timeline = JSON.parse(fs.readFileSync(TIMELINE_FILE, "utf-8"));
        timeline.forEach((item) => {
          let content = `Anècdota: ${item.esdeveniment}`;
          if (item.data) content += ` (Data: ${item.data})`;
          if (item.protagonistes) content += ` Protagonistes: ${item.protagonistes.join(", ")}`;
          if (item.tags) content += ` Tags: ${item.tags.join(", ")}`;

          docs.push(new Document({
            pageContent: content,
            metadata: { source: "timeline", type: "anecdote" }
          }));
        });
      } catch (e) {
        console.error("❌ Error carregant timeline:", e.message);
      }
    }

    // 2. Carregar Amics
    if (fs.existsSync(AMICS_FILE)) {
      try {
        const amics = JSON.parse(fs.readFileSync(AMICS_FILE, "utf-8"));
        amics.forEach((amics) => {
          let content = `Amic/Persona: ${amics.name}`;
          if (amics.description) content += `. Descripció: ${amics.description}`;
          if (amics.birthdate) content += `. Data de naixement: ${amics.birthdate}`;

          docs.push(new Document({
            pageContent: content,
            metadata: { source: "amics", type: "friend" }
          }));
        });
      } catch (e) {
        console.error("❌ Error carregant amics:", e.message);
      }
    }

    // 3. Carregar Memòria Personal (Personal Memory de cada usuari)
    if (fs.existsSync(MEMORIA_DIR)) {
      try {
        const files = fs.readdirSync(MEMORIA_DIR).filter(f => f.endsWith(".json"));
        files.forEach(file => {
          const username = file.replace(".json", "");
          const filePath = path.join(MEMORIA_DIR, file);
          const memData = JSON.parse(fs.readFileSync(filePath, "utf-8"));

          memData.forEach(m => {
            if (m.text) {
              docs.push(new Document({
                pageContent: `Record de @${username}: ${m.text}`,
                metadata: { source: "memory", user: username, date: m.data }
              }));
            }
          });
        });
      } catch (e) {
        console.error("❌ Error carregant memòria personal:", e.message);
      }
    }

    // 4. Carregar Historial de Converses (L'IA apren dels xats)
    if (fs.existsSync(CHATS_DIR)) {
      try {
        const files = fs.readdirSync(CHATS_DIR).filter(f => f.endsWith(".json"));
        files.forEach(file => {
          const username = file.replace(".json", "");
          const filePath = path.join(CHATS_DIR, file);
          const chatData = JSON.parse(fs.readFileSync(filePath, "utf-8"));

          chatData.forEach(m => {
            if (m.content) {
              const roleName = m.role === "user" ? `@${username}` : "L'Eladi";
              docs.push(new Document({
                pageContent: `Conversa amb ${roleName}: ${m.content}`,
                metadata: { source: "chat_history", user: username, role: m.role }
              }));
            }
          });
        });
      } catch (e) {
        console.error("❌ Error carregant historial de converses:", e.message);
      }
    }

    if (docs.length === 0) {
      console.warn("⚠️ No s'han trobat documents per indexar.");
      // Inicialitzem igualment amb un doc buit per evitar errors si no hi ha dades encara
      docs.push(new Document({ pageContent: "Dades inicialitzades.", metadata: { source: "init" } }));
    }

    // Inicialitzar el VectorStore en memòria amb els documents i el model d'embeddings
    vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
    console.log("✅ VectorStore inicialitzat amb", docs.length, "documents.");
  } catch (e) {
    console.error("❌ Error crític inicialitzant VectorStore:", e);
  } finally {
    isInitializing = false;
  }
}

/**
 * Cerca semàntica al VectorStore
 */
async function getRelevantContext(query, k = 5) {
  if (!vectorStore) await initVectorStore();

  const results = await vectorStore.similaritySearch(query, k);

  if (results.length === 0) return "";

  let context = "\nInformació rellevant que recordo:\n";
  results.forEach((res) => {
    context += `- ${res.pageContent}\n`;
  });

  return context;
}

module.exports = {
  getRelevantContext,
  initVectorStore
};
