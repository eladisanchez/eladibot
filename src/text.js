const { message } = require("telegraf/filters");
const fs = require("fs");
const path = require("path");

const { CHATS_DIR, MEMORIA_DIR } = require("./constants");
const { cercarWikipedia } = require("./web");
const { getProperesCites, crearCita } = require("./calendar");
const { ensureUserRegistration } = require("./register");
const { handleAdminCommands } = require("./admin");
const { generateLangChainResponse, clearUserMemory } = require("./langchain_chat");

function setupTextHandler(bot) {
  bot.on(message("text"), async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    const textEntrada = ctx.message.text;
    const pathXat = path.join(CHATS_DIR, `${userId}.json`);

    // Check if user is registered
    const isRegistered = await ensureUserRegistration(ctx);
    if (!isRegistered) return;

    const memoriaPath = path.join(MEMORIA_DIR, `${userId}.json`);

    // Admin commands
    const adminCommands = await handleAdminCommands(ctx, userId, textEntrada);
    if (adminCommands) return;

    // Logic to forget/reset
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
        return ctx.reply(
          "Fet. He enviat la nostra conversa a la paperera de la història. Ja no sé qui ets ni m'importa. 🐒",
        );
      } else {
        return ctx.reply(
          "Però si no teníem res guardat! Ja t'havia oblidat de sèrie, figura.",
        );
      }
    }

    // Logic to remember things (Mantenim funcionalitat de gravació manual)
    if (textEntrada.toLowerCase().startsWith("recorda que")) {
      const dadaAGravar = textEntrada.replace(/recorda que/i, "").trim();
      const dataAvui = new Date().toLocaleDateString("ca-ES");

      let memories = [];
      if (fs.existsSync(memoriaPath)) {
        try {
          memories = JSON.parse(fs.readFileSync(memoriaPath, "utf-8"));
        } catch (e) {
          memories = [];
        }
      }
      memories.push({ data: dataAvui, text: dadaAGravar });
      fs.writeFileSync(memoriaPath, JSON.stringify(memories, null, 2));

      return ctx.reply(
        `Entès! M'ho apunto a la llista de coses que m'importen una merda. 📝`,
      );
    }

    let intervalEscrivint;
    try {
      // Typing indicator
      ctx.sendChatAction("typing").catch(() => { });
      intervalEscrivint = setInterval(() => {
        ctx.sendChatAction("typing").catch(() => { });
      }, 4000);

      // --- NOVA LÒGICA LANGCHAIN ---
      let respostaIA = await generateLangChainResponse(userId, textEntrada);
      // -----------------------------

      if (intervalEscrivint) clearInterval(intervalEscrivint);

      // MANTENIM LA LÒGICA D'EINES (Tal com s'ha demanat: "no cal" passar-les a LangChain encara)

      // 1. Wikipedia (Eines de Ollama de forma manual si USE_TOOLS)
      // Aquest bot feia la crida manual d'eines de Ollama abans.
      // Ara per mantenir simplicitat, si LangChain ens retorna la resposta directament,
      // la processarem. Si vols mantenir la crida de tools per internet o calendari,
      // s'haurien d'adaptar a la Chain de LangChain o seguir el patró anterior.

      // 2. Detecció de TOOL_CALL per calendari
      if (respostaIA.includes("TOOL_CALL: [GET_CALENDAR]")) {
        const cites = await getProperesCites();
        // Cridem un cop més a la IA per "humanitzar" la llista de cites
        // (Això es podria fer millor amb un Tool de LangChain, però respectem el "no cal")
        respostaIA = await generateLangChainResponse(userId, `Dades del calendari a informar breument: ${cites}`);
      } else if (respostaIA.includes("TOOL_CALL: [ADD_CALENDAR")) {
        const parts = respostaIA.split("|");
        const titol = parts[1]?.trim();
        const data = parts[2]?.replace("]", "").trim();

        if (titol && data) {
          await crearCita(titol, data);
          respostaIA = await generateLangChainResponse(userId, `Confirma en to col·loquial que has anotat: ${titol} pel ${data}`);
        }
      }

      // Neteja de la resposta i tramesa
      respostaIA = respostaIA.trim().replace(/\n{3,}/g, "\n\n");
      const codiMarkdownTelegram = respostaIA
        .replace(/\*\*(.*?)\*\*/g, "*$1*")
        .replace(/### (.*)/g, "*$1*");

      try {
        await ctx.reply(codiMarkdownTelegram, { parse_mode: "Markdown" });
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
