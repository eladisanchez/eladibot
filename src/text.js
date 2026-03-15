const { message } = require("telegraf/filters");
const fs = require("fs");
const path = require("path");

const { CHATS_DIR, MEMORIA_DIR } = require("./constants");
const { ensureUserRegistration } = require("./register");
const { handleAdminCommands } = require("./admin");
const { generateLangChainResponse, generateStreamingLangChainResponse, saveChatHistory, clearUserMemory } = require("./langchain_chat");

/**
 * Handles memory recording commands
 * @param {*} ctx 
 * @param {*} textEntrada 
 * @param {*} memoryPath 
 * @returns 
 */
async function handleMemoryRecording(ctx, textEntrada, memoryPath) {
  if (textEntrada.toLowerCase().startsWith("recorda que")) {
    const dadaAGravar = textEntrada.replace(/recorda que/i, "").trim();
    const dataAvui = new Date().toLocaleDateString("ca-ES");

    let memories = [];
    if (fs.existsSync(memoryPath)) {
      try {
        memories = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
      } catch (e) {
        memories = [];
      }
    }
    memories.push({ data: dataAvui, text: dadaAGravar });
    fs.writeFileSync(memoryPath, JSON.stringify(memories, null, 2));

    await ctx.reply(
      `Entès! M'ho apunto a la llista de coses que m'importen una merda. 📝`,
    );
    return true;
  }
  return false;
}

/**
 * Handles forget conversation commands
 * @param {*} ctx 
 * @param {*} textEntrada 
 * @param {*} pathXat 
 * @param {*} userId 
 * @returns 
 */
async function handleForgetConversation(ctx, textEntrada, pathXat, userId) {
  const frasesOblidar = [
    "oblida la meva conversa",
    "esborra el xat",
    "elimina la conversa",
    "oblida'm",
    "reset xat",
    "esborra la conversa",
  ];
  if (frasesOblidar.some((f) => textEntrada.toLowerCase().includes(f))) {
    if (fs.existsSync(pathXat)) {
      fs.unlinkSync(pathXat);
      clearUserMemory(userId);
      await ctx.reply(
        "Fet. He enviat la nostra conversa a la paperera de la història.",
      );
    } else {
      await ctx.reply(
        "Però si no teníem res guardat! Ja t'havia oblidat de sèrie, figura.",
      );
    }
    return true;
  }
  return false;
}

/**
 * Sets up the text handler for the bot
 * @param {*} bot 
 */
function setupTextHandler(bot) {
  bot.on(message("text"), async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    const textEntrada = ctx.message.text;
    const pathXat = path.join(CHATS_DIR, `${userId}.json`);

    // Check if user is registered
    const isRegistered = await ensureUserRegistration(ctx);
    if (!isRegistered) return;

    const memoryPath = path.join(MEMORIA_DIR, `${userId}.json`);

    // Admin commands
    const adminCommands = await handleAdminCommands(ctx, userId, textEntrada);
    if (adminCommands) return;

    // Logic to forget/reset
    const forgetHandled = await handleForgetConversation(ctx, textEntrada, pathXat, userId);
    if (forgetHandled) return;

    // Logic to remember things
    const memoryHandled = await handleMemoryRecording(ctx, textEntrada, memoryPath);
    if (memoryHandled) return;

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

module.exports = { setupTextHandler };
