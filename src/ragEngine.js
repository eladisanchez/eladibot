require("dotenv").config();
const { ChromaClient } = require("chromadb");
const ollama = require("ollama").default;

const client = new ChromaClient({ host: "localhost", port: 8000 });

const ollamaEmbeddingFunction = {
  generate: async (texts) => {
    try {
      const embeddings = [];
      for (const text of texts) {
        const response = await ollama.embeddings({
          model: process.env.RAG_MODEL || "llama3", // Model per defecte si falla l'env
          prompt: text,
        });
        embeddings.push(response.embedding);
      }
      return embeddings;
    } catch (error) {
      console.error("Error generant embeddings amb Ollama:", error);
      return [];
    }
  },
};

async function getCollection(name) {
  if (!name) {
    throw new Error("Nom de col·lecció no definit a les variables d'entorn.");
  }
  return await client.getOrCreateCollection({
    name: name,
    embeddingFunction: ollamaEmbeddingFunction,
  });
}

/**
 * Find relevant info in vectorial memory
 * @param {*} userMessage
 * @returns
 */
async function findRelevantMemory(userMessage) {
  try {
    const colName = process.env.RAG_MEMORY_COLLECTION || "memory";
    const collection = await getCollection(colName);

    const results = await collection.query({
      queryTexts: [userMessage],
      nResults: 5,
    });

    if (!results.documents || results.documents[0].length === 0) return "";

    let context = "\nRecords rellevants:\n";
    results.documents[0].forEach((doc, i) => {
      // Calculem similitud (1 - distància)
      const score = results.distances
        ? (1 - results.distances[0][i]).toFixed(2)
        : "N/A";
      context += `- ${doc} (Rellevància: ${score})\n`;
    });

    return context;
  } catch (e) {
    console.error("Error a findRelevantMemory:", e);
    return "";
  }
}

/**
 * Find relevant chat history
 */
async function findRelevantChatHistory(userMessage) {
  try {
    const colName = process.env.RAG_CHAT_COLLECTION || "chat";
    const collection = await getCollection(colName);

    const results = await collection.query({
      queryTexts: [userMessage],
      nResults: 3, // Baixem de 5 a 3 per evitar "palla"
      where: { role: "user" },
    });

    if (!results.documents || results.documents[0].length === 0) return "";

    let text =
      "\nContext de converses anteriors (no les repeteixis, només tingues-les en compte):\n";
    let trobatAlgunaCosa = false;

    results.documents[0].forEach((doc, i) => {
      const distancia = results.distances[0][i];
      // FILTRE D'ECO: Si la distància és menor a 0.1, és que és la mateixa frase. La ignorem.
      if (distancia > 0.1) {
        text += `- Usuari va dir: "${doc}"\n`;
        trobatAlgunaCosa = true;
      }
    });

    return trobatAlgunaCosa ? text : "";
  } catch (e) {
    return "";
  }
}

/**
 * Guarda un fet o record a la col·lecció 'memory'
 */
async function saveToMemory(text, userId, nom) {
  try {
    const colName = process.env.RAG_MEMORY_COLLECTION || "memory";
    const collection = await getCollection(colName);
    await collection.add({
      ids: [`mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`],
      metadatas: [{ user: userId, nom: nom, data: new Date().toISOString() }],
      documents: [text],
    });
  } catch (e) {
    console.error("Error salvant a memòria:", e);
  }
}

/**
 * Guarda un missatge del xat per a context futur
 */
async function saveToChatHistory(text, role, userId) {
  try {
    const colName = process.env.RAG_CHAT_COLLECTION || "chat";
    const collection = await getCollection(colName);
    await collection.add({
      ids: [`chat_${Date.now()}_${userId}`],
      metadatas: [
        { role: role, userId: userId, data: new Date().toISOString() },
      ],
      documents: [text],
    });
  } catch (e) {
    console.error("Error salvant historial:", e);
  }
}

module.exports = {
  getCollection,
  ollamaEmbeddingFunction,
  findRelevantMemory,
  findRelevantChatHistory,
  saveToMemory,
  saveToChatHistory,
};
