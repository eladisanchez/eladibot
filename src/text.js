const ollama = require("ollama").default;
const { message } = require("telegraf/filters");

const {
  findRelevantMemory,
  findRelevantChatHistory,
  saveToChatHistory,
  saveToMemory,
} = require("./rag");
const { cercarWikipedia } = require("./web");
const { tools } = require("./tools");
const { ensureUserRegistration, getUser } = require("./register");
const { handleAdminCommands, sendDebugContext } = require("./admin");

function setupTextHandler(bot) {
  bot.on(message("text"), async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    const textEntrada = ctx.message.text;

    // Check if user is registered
    const isRegistered = await ensureUserRegistration(ctx);
    if (!isRegistered) return;

    // Admin commands
    const adminCommands = await handleAdminCommands(ctx, userId, textEntrada);
    if (adminCommands) return;

    // Logic to remember things
    if (textEntrada.toLowerCase().startsWith("recorda que")) {
      const dadaAGravar = textEntrada.replace(/recorda que/i, "").trim();
      await saveToMemory(dadaAGravar, userId, getUser(userId).nom);
      return ctx.reply(
        "Gràcies, m'ho apunto a la llista de les nostres merdes. 📝",
      );
    }

    let intervalEscrivint;
    try {
      const [memoryContext, chatContext] = await Promise.all([
        findRelevantMemory(textEntrada),
        findRelevantChatHistory(textEntrada),
      ]);

      // Sending context to Admin (only with /debug)
      await sendDebugContext(ctx, userId, textEntrada, {
        memoryContext,
        chatContext,
      });

      const messagesToSend = [];
      const systemReinforcement = `Estàs parlant amb ${getUser(userId).nom} (@${userId}).
${memoryContext}
${chatContext}
RECORDA:
1. Respon com un col·lega de bar, directe i breu.
2. NO REPETEIXIS el que t'acabo de posar al context de "Converses anteriors". Aquell context és només perquè sàpigues de què va la vaina, no per fer un resum.
3. Si el context diu que l'usuari ja ha dit una cosa, no li tornis a preguntar el mateix.
4. Sigues natural, no un lloro.`;

      messagesToSend.push({ role: "system", content: systemReinforcement });

      // Typing indicator
      ctx.sendChatAction("typing").catch(() => { });
      intervalEscrivint = setInterval(() => {
        ctx.sendChatAction("typing").catch(() => { });
      }, 4000);

      const optionsOllama = {
        model: process.env.OLLAMA_MODEL,
        messages: messagesToSend,
      };

      if (process.env.USE_TOOLS === "true") {
        optionsOllama.tools = tools;
      }

      let response = await ollama.chat(optionsOllama);

      // Tool calls
      if (
        response.message.tool_calls &&
        response.message.tool_calls.length > 0
      ) {
        missatgesAEnviar.push(response.message);

        for (const call of response.message.tool_calls) {
          if (call.function.name === "cercar_internet") {
            const dadesExtretes = await cercarWikipedia(
              call.function.arguments.query,
            );
            missatgesAEnviar.push({
              role: "tool",
              content: dadesExtretes,
            });
          }
        }

        response = await ollama.chat({
          model: process.env.OLLAMA_MODEL,
          messages: missatgesAEnviar,
        });
      }

      if (intervalEscrivint) clearInterval(intervalEscrivint);

      let respostaIA = response.message.content
        .trim()
        .replace(/\n{3,}/g, "\n\n");

      await saveToChatHistory(textEntrada, "user", userId);

      try {
        await ctx.reply(respostaIA, { parse_mode: "Markdown" });
      } catch (errorParsing) {
        await ctx.reply(respostaIA);
      }
    } catch (error) {
      if (intervalEscrivint) clearInterval(intervalEscrivint);
      console.error("Error:", error);
      ctx.reply("M'he col·lapsat... massa informació!");
    }
  });
}

module.exports = { setupTextHandler };
