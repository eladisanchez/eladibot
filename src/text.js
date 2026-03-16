const { message } = require("telegraf/filters");
const fs = require("fs");
const path = require("path");

const { CHATS_DIR, MEMORIA_DIR } = require("./constants");
const { ensureUserRegistration } = require("./register");
const { handleAdminCommands } = require("./admin");
const { generateLangChainResponse, generateStreamingLangChainResponse, saveChatHistory, clearUserMemory } = require("./langchain_chat");

// These functions are now partially superseded by bot.command in setupTextHandler
// but kept for compatibility or internal logic if needed.

// State to track users who clicked /guarda but haven't sent the text yet
const waitingForMemory = new Map();
// State to track users who want a story but haven't sent the topic yet
const waitingForStory = new Map();
// State to track users who want a haiku but haven't sent the topic yet
const waitingForHaiku = new Map();

/**
 * Sets up the text handler for the bot
 * @param {*} bot 
 */
function setupTextHandler(bot) {
  // Command: /esborra
  bot.command("esborra", async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    if (!await ensureUserRegistration(ctx)) return;
    const pathXat = path.join(CHATS_DIR, `${userId}.json`);

    if (fs.existsSync(pathXat)) {
      fs.unlinkSync(pathXat);
      clearUserMemory(userId);
      await ctx.reply("Fet. He enviat la nostra conversa a la paperera de la història.");
    } else {
      await ctx.reply("Però si no teníem res guardat! Ja t'havia oblidat de sèrie, figura.");
    }
  });

  // Command: /guarda
  bot.command("guarda", async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    if (!await ensureUserRegistration(ctx)) return;

    const text = (ctx.payload || "").trim();
    if (!text) {
      waitingForMemory.set(userId, true);
      return ctx.reply("Què vols que guardi?");
    }

    const memoryPath = path.join(MEMORIA_DIR, `${userId}.json`);
    const dataAvui = new Date().toLocaleDateString("ca-ES");

    let memories = [];
    if (fs.existsSync(memoryPath)) {
      try {
        memories = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
      } catch (e) {
        memories = [];
      }
    }
    memories.push({ data: dataAvui, text });
    fs.writeFileSync(memoryPath, JSON.stringify(memories, null, 2));

    await ctx.reply(`Entès! M'ho apunto a la llista de coses que m'importen una merda. 📝`);
  });

  // Command: /conte
  bot.command("conte", async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    if (!await ensureUserRegistration(ctx)) return;

    const topic = (ctx.payload || "").trim();
    if (!topic) {
      waitingForStory.set(userId, true);
      return ctx.reply("D'acord, de què vols que vagi el conte? Explica'm una mica de què ha d'anar i et faré una obra d'art de les meves. 📖");
    }

    // Si ja porta el tema, generem directament
    await handleStoryGeneration(ctx, userId, topic);
  });

  // Command: /haiku
  bot.command("haiku", async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    if (!await ensureUserRegistration(ctx)) return;

    const topic = (ctx.payload || "").trim();
    if (!topic) {
      waitingForHaiku.set(userId, true);
      return ctx.reply("Un haiku? Ara ens hem posat poètics, eh? Digues de què vols que vagi i veuràs. ✍️");
    }

    await handleHaikuGeneration(ctx, userId, topic);
  });

  bot.on(message("text"), async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    const textEntrada = ctx.message.text;

    // Si és un comando, no fem res aquí (ja ho gestionen els bot.command o admin)
    if (textEntrada.startsWith("/")) {
      waitingForMemory.delete(userId);
      waitingForStory.delete(userId);
      waitingForHaiku.delete(userId);
      // Intentem gestionar commands d'admin primer
      const adminCommands = await handleAdminCommands(ctx, userId, textEntrada);
      if (adminCommands) return;
      return; // Ignorem qualsevol altre comando desconegut per no processar-lo com a xat
    }

    // Check if we are waiting for a story topic
    if (waitingForStory.has(userId)) {
      waitingForStory.delete(userId);
      await handleStoryGeneration(ctx, userId, textEntrada);
      return;
    }

    // Check if we are waiting for a haiku topic
    if (waitingForHaiku.has(userId)) {
      waitingForHaiku.delete(userId);
      await handleHaikuGeneration(ctx, userId, textEntrada);
      return;
    }

    // Check if we are waiting for a memory text
    if (waitingForMemory.has(userId)) {
      waitingForMemory.delete(userId);
      const memoryPath = path.join(MEMORIA_DIR, `${userId}.json`);
      const dataAvui = new Date().toLocaleDateString("ca-ES");

      let memories = [];
      if (fs.existsSync(memoryPath)) {
        try {
          memories = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
        } catch (e) {
          memories = [];
        }
      }
      memories.push({ data: dataAvui, text: textEntrada });
      fs.writeFileSync(memoryPath, JSON.stringify(memories, null, 2));

      return ctx.reply("Entès! M'ho guardo a la llista de coses que m'importen una merda. 📝");
    }

    const pathXat = path.join(CHATS_DIR, `${userId}.json`);

    // Check if user is registered
    const isRegistered = await ensureUserRegistration(ctx);
    if (!isRegistered) return;

    let intervalTyping;
    try {
      // Typing indicator
      ctx.sendChatAction("typing").catch(() => { });
      intervalTyping = setInterval(() => {
        ctx.sendChatAction("typing").catch(() => { });
      }, 4000);

      let fullResponse = "";
      let lastUpdate = Date.now();
      let messageSent = false;
      let replyMessage;

      const stream = await generateStreamingLangChainResponse(userId, textEntrada);

      for await (const chunk of stream) {
        fullResponse += chunk.content;

        // Throttling: update every 1.5 seconds or if it's the very first chunk
        if (!messageSent) {
          replyMessage = await ctx.reply(fullResponse || "...");
          messageSent = true;
        } else if (Date.now() - lastUpdate > 1000) {
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              replyMessage.message_id,
              null,
              fullResponse + " ..." // Add a cursor effect
            );
            lastUpdate = Date.now();
          } catch (e) {
            // Ignore "message is not modified" errors
          }
        }
      }

      if (intervalTyping) clearInterval(intervalTyping);

      // Final cleanup and formatting
      const cleanedResponse = fullResponse.trim().replace(/\n{3,}/g, "\n\n");
      const telegramEncodedResponse = cleanedResponse
        .replace(/\*\*(.*?)\*\*/g, "*$1*")
        .replace(/### (.*)/g, "*$1*");

      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          replyMessage.message_id,
          null,
          telegramEncodedResponse,
          { parse_mode: "Markdown" }
        );
      } catch (errorParsing) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          replyMessage.message_id,
          null,
          cleanedResponse
        );
      }

      // Save history after streaming is done
      await saveChatHistory(userId, textEntrada, fullResponse);

    } catch (error) {
      if (intervalTyping) clearInterval(intervalTyping);
      console.error("Error:", error);
      ctx.reply("M'he col·lapsat... massa informació!");
    }
  });
}

/**
 * Helper to handle story generation logic
 */
async function handleStoryGeneration(ctx, userId, topic) {
  let intervalTyping;
  try {
    ctx.sendChatAction("typing").catch(() => { });
    intervalTyping = setInterval(() => {
      ctx.sendChatAction("typing").catch(() => { });
    }, 4000);

    let fullResponse = "";
    let lastUpdate = Date.now();
    let messageSent = false;
    let replyMessage;

    // Use LangChain with a specific prompt for the story
    const customPrompt = `Fes-me un conte sobre: "${topic}". 
Hi han d'apareixer amics i personatges de Solsona.`;

    const stream = await generateStreamingLangChainResponse(userId, customPrompt);

    for await (const chunk of stream) {
      fullResponse += chunk.content;
      if (!messageSent) {
        replyMessage = await ctx.reply(fullResponse || "...");
        messageSent = true;
      } else if (Date.now() - lastUpdate > 1000) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            replyMessage.message_id,
            null,
            fullResponse + " ..."
          );
          lastUpdate = Date.now();
        } catch (e) { }
      }
    }

    if (intervalTyping) clearInterval(intervalTyping);

    const cleanedResponse = fullResponse.trim().replace(/\n{3,}/g, "\n\n");
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      replyMessage.message_id,
      null,
      cleanedResponse
    );

    await saveChatHistory(userId, `(Command: /conte sobre ${topic})`, fullResponse);

  } catch (error) {
    if (intervalTyping) clearInterval(intervalTyping);
    console.error("Error generating story:", error);
    ctx.reply("M'he col·lapsat escrivint el conte... massa literatura per a mi.");
  }
}

/**
 * Helper to handle haiku generation logic
 */
async function handleHaikuGeneration(ctx, userId, topic) {
  let intervalTyping;
  try {
    ctx.sendChatAction("typing").catch(() => { });
    intervalTyping = setInterval(() => {
      ctx.sendChatAction("typing").catch(() => { });
    }, 4000);

    let fullResponse = "";
    let lastUpdate = Date.now();
    let messageSent = false;
    let replyMessage;

    const customPrompt = `Fes-me un haiku sobre: "${topic}". 
Recorda: Ets l'Eladi de Solsona. L'haiku ha de tenir l'estructura 5-7-5 però amb el teu vocabulari i mala llet. 
Res de coses maques, que sigui ben groller i de bar.`;

    const stream = await generateStreamingLangChainResponse(userId, customPrompt);

    for await (const chunk of stream) {
      fullResponse += chunk.content;
      if (!messageSent) {
        replyMessage = await ctx.reply(fullResponse || "...");
        messageSent = true;
      } else if (Date.now() - lastUpdate > 1000) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, replyMessage.message_id, null, fullResponse + " ...");
          lastUpdate = Date.now();
        } catch (e) { }
      }
    }

    if (intervalTyping) clearInterval(intervalTyping);

    const cleanedResponse = fullResponse.trim();
    await ctx.telegram.editMessageText(ctx.chat.id, replyMessage.message_id, null, cleanedResponse);

    await saveChatHistory(userId, `(Command: /haiku sobre ${topic})`, fullResponse);

  } catch (error) {
    if (intervalTyping) clearInterval(intervalTyping);
    console.error("Error generating haiku:", error);
    ctx.reply("M'he col·lapsat fent de poeta... m'hauré de demanar una altra cervesa.");
  }
}

module.exports = { setupTextHandler };
