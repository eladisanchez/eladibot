const fs = require("fs");
const path = require("path");
const ollama = require("ollama").default;
const { message } = require("telegraf/filters");

const { CHATS_DIR, MEMORIA_DIR } = require("./constants");
const {
  findRelevantMemory,
  findRelevantTimeline,
  findRelevantFriends,
  findRelevantChatHistory,
} = require("./rag");
const { cercarWikipedia } = require("./web");
const { tools } = require("./tools");
const { getProperesCites, crearCita } = require("./calendar");
const { ensureUserRegistration, getUser } = require("./register");
const { handleAdminCommands, sendDebugContext } = require("./admin");

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
    const adminCommands = await handleAdminCommands(
      ctx,
      userId,
      textEntrada,
    );
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
        return ctx.reply(
          "Fet. He enviat la nostra conversa a la paperera de la història. Ja no sé qui ets ni m'importa. 🐒",
        );
      } else {
        return ctx.reply(
          "Però si no teníem res guardat! Ja t'havia oblidat de sèrie, figura.",
        );
      }
    }

    // Logic to remember things
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
      let historial = [];
      if (fs.existsSync(pathXat)) {
        historial = JSON.parse(fs.readFileSync(pathXat, "utf-8"));
      }

      const memoriaColectiva = findRelevantMemory(textEntrada);
      const timeline = findRelevantTimeline(textEntrada);
      const amics = findRelevantFriends(textEntrada);
      const historiadelXat = findRelevantChatHistory(textEntrada);

      // Sending context to Admin (only with /debug)
      await sendDebugContext(ctx, userId, textEntrada, {
        memoriaColectiva,
        timeline,
        amics,
        historiadelXat,
      });

      historial.push({ role: "user", content: textEntrada });

      const missatgesAEnviar = [];
      const systemReinforcement = `Estàs parlant amb ${getUser(userId).nom} (@${userId}).
${memoriaColectiva}
${timeline}
${amics}

RECORDATORI: Respon com un col·lega al bar. Sense llistes, sense bullets, sense negretes, sense format. Frases curtes com un WhatsApp. MAI diguis "Espero que això t'ajudi" ni res semblant. SI NO SAPS alguna cosa o no surt als registres, NO T'INVENTIS DADES ni fets; digues que no te'n recordes, que vas borratxo o fot-li la culpa a les cerveses, però no inventis boles sobre els col·legues.`;

      missatgesAEnviar.push({ role: "system", content: systemReinforcement });

      // Limit the history to the last 3 messages to avoid the IA becoming too "educated" by repetition
      const historialRecent = historial.slice(-3);
      missatgesAEnviar.push(...historialRecent);

      // Typing indicator
      ctx.sendChatAction("typing").catch(() => {});
      intervalEscrivint = setInterval(() => {
        ctx.sendChatAction("typing").catch(() => {});
      }, 4000);

      const optionsOllama = {
        model: process.env.OLLAMA_MODEL,
        messages: missatgesAEnviar,
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

      // Detection of TOOL_CALLS for calendar
      if (respostaIA.includes("TOOL_CALL: [GET_CALENDAR]")) {
        console.log("📅 Consultant el calendari...");
        const cites = await getProperesCites();

        const finalResponse = await ollama.chat({
          model: process.env.OLLAMA_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Ets l'Eladi. Informa de les cites del calendari en to col·loquial i breu.",
            },
            { role: "user", content: `Dades del calendari: ${cites}` },
          ],
        });
        respostaIA = finalResponse.message.content.trim();
      } else if (respostaIA.includes("TOOL_CALL: [ADD_CALENDAR")) {
        const parts = respostaIA.split("|");
        const titol = parts[1]?.trim();
        const data = parts[2]?.replace("]", "").trim();

        if (titol && data) {
          await crearCita(titol, data);

          const finalResponse = await ollama.chat({
            model: process.env.OLLAMA_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "Ets l'Eladi. Confirma que has apuntat la cita en to col·loquial i breu.",
              },
              {
                role: "user",
                content: `He apuntat: ${titol} per al dia ${data}`,
              },
            ],
          });
          respostaIA = finalResponse.message.content.trim();
        }
      }

      historial.push({ role: "assistant", content: respostaIA });
      fs.writeFileSync(pathXat, JSON.stringify(historial, null, 2));

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
