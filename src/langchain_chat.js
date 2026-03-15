const { ChatOllama } = require("@langchain/ollama");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { BufferWindowMemory } = require("langchain/memory");
const { getRelevantContext } = require("./langchain_rag");
const { getUser } = require("./register");

// Configuració del Model
const chatModel = new ChatOllama({
  model: process.env.OLLAMA_MODEL || "gemmota",
  baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
});

const fs = require("fs");
const path = require("path");
const { CHATS_DIR } = require("./constants");
const { AIMessage, HumanMessage } = require("@langchain/core/messages");

// Mapa per guardar la memòria de cada usuari
const memories = new Map();

/**
 * Retorna o crea la memòria per a un usuari específic
 */
function getOrCreateMemory(userId) {
  if (!memories.has(userId)) {
    const memory = new BufferWindowMemory({
      returnMessages: true,
      memoryKey: "chat_history",
      k: 10 // Mantenim els darrers 10 intercanvis per a més context
    });

    // Intentar carregar historial de fitxer
    const pathXat = path.join(CHATS_DIR, `${userId}.json`);
    if (fs.existsSync(pathXat)) {
      try {
        const history = JSON.parse(fs.readFileSync(pathXat, "utf-8"));
        // Carreguem l'historial a la memòria de LangChain
        // BufferWindowMemory.saveContext espera format d'entrada i sortida o podem usar history
        history.forEach((msg, index) => {
          // Només carreguem els darrers missatges per no saturar
          if (index >= history.length - 20) {
            if (msg.role === "user") {
              // Busquem la següent resposta de l'assistent per fer el parell
              const nextMsg = history[index + 1];
              if (nextMsg && nextMsg.role === "assistant") {
                memory.chatHistory.addMessage(new HumanMessage(msg.content));
                memory.chatHistory.addMessage(new AIMessage(nextMsg.content));
              }
            }
          }
        });
      } catch (e) {
        console.error(`❌ Error carregant historial per ${userId}:`, e);
      }
    }
    memories.set(userId, memory);
  }
  return memories.get(userId);
}

/**
 * Guarda el nou missatge a l'historial (memòria i fitxer)
 */
async function saveChatHistory(userId, userInput, assistantResponse) {
  const memory = getOrCreateMemory(userId);
  await memory.saveContext({ input: userInput }, { output: assistantResponse });

  const pathXat = path.join(CHATS_DIR, `${userId}.json`);
  let fullHistory = [];
  if (fs.existsSync(pathXat)) {
    try {
      fullHistory = JSON.parse(fs.readFileSync(pathXat, "utf-8"));
    } catch (e) {
      fullHistory = [];
    }
  }
  fullHistory.push({ role: "user", content: userInput });
  fullHistory.push({ role: "assistant", content: assistantResponse });

  if (fullHistory.length > 100) fullHistory = fullHistory.slice(-100);
  fs.writeFileSync(pathXat, JSON.stringify(fullHistory, null, 2));
}

/**
 * Genera una resposta utilitzant la cadena de LangChain
 */
async function generateLangChainResponse(userId, userInput) {
  const memory = getOrCreateMemory(userId);
  const user = getUser(userId);

  const context = await getRelevantContext(userInput);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `Ets l'Eladi. Estàs parlant amb ${user.nom} (@${userId}).
PROXIMITAT I CONTEXT:
${context}

RECORDATORI: Respon com un col·lega al bar. Sense llistes, sense bullets, sense negretes, sense format. Frases curtes com un WhatsApp. MAI diguis "Espero que això t'ajudi" ni res semblant.`],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);

  const { chat_history } = await memory.loadMemoryVariables({});

  const formattedPrompt = await prompt.formatMessages({
    input: userInput,
    chat_history: chat_history
  });

  const response = await chatModel.invoke(formattedPrompt);

  await saveChatHistory(userId, userInput, response.content);

  return response.content;
}

/**
 * Genera un stream de resposta utilitzant LangChain
 */
async function generateStreamingLangChainResponse(userId, userInput) {
  const memory = getOrCreateMemory(userId);
  const user = getUser(userId);

  const context = await getRelevantContext(userInput);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `Ets l'Eladi. Estàs parlant amb ${user.nom} (@${userId}).
PROXIMITAT I CONTEXT:
${context}

RECORDATORI: Respon com un col·lega al bar. Sense llistes, sense bullets, sense negretes, sense format. Frases curtes com un WhatsApp. MAI diguis "Espero que això t'ajudi" ni res semblant.`],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
  ]);

  const { chat_history } = await memory.loadMemoryVariables({});

  const formattedPrompt = await prompt.formatMessages({
    input: userInput,
    chat_history: chat_history
  });

  return await chatModel.stream(formattedPrompt);
}

function clearUserMemory(userId) {
  memories.delete(userId);
}

module.exports = {
  generateLangChainResponse,
  generateStreamingLangChainResponse,
  saveChatHistory,
  clearUserMemory
};
