const fs = require("fs");
const path = require("path");
const { CHATS_DIR } = require("./constants");
const { getUser } = require("./register");

async function handleAdminCommands(ctx, userId, inputText) {
  // Only for the administrator 'eladisc'
  if (userId !== "eladisc") return false;

  // --- COMMAND /XATS ---
  if (inputText === "/xats") {
    try {
      const files = fs.readdirSync(CHATS_DIR);
      const users = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""));

      if (users.length === 0) {
        await ctx.reply("No tinc cap xat guardat, estic net.");
        return true;
      }

      // Inline keyboard: 2 buttons per row
      const buttons = [];
      for (let i = 0; i < users.length; i += 2) {
        const u1 = users[i];
        const info1 = getUser(u1);
        const label1 = info1 && info1.nom ? info1.nom : `@${u1}`;
        const row = [{ text: label1, callback_data: `xat:${u1}` }];

        if (users[i + 1]) {
          const u2 = users[i + 1];
          const info2 = getUser(u2);
          const label2 = info2 && info2.nom ? info2.nom : `@${u2}`;
          row.push({ text: label2, callback_data: `xat:${u2}` });
        }
        buttons.push(row);
      }

      await ctx.reply("Tria l'usuari:", {
        reply_markup: { inline_keyboard: buttons },
      });
      return true;
    } catch (e) {
      await ctx.reply("Error buscant els xats.");
      return true;
    }
  }

  // --- COMMAND /xat ---
  if (inputText.startsWith("/xat ")) {
    const usernameToSearch = inputText.split(" ")[1];
    if (!usernameToSearch) {
      await ctx.reply("Digues el nom de l'usuari, collons.");
      return true;
    }

    const otherChatPath = path.join(CHATS_DIR, `${usernameToSearch}.json`);
    if (!fs.existsSync(otherChatPath)) {
      await ctx.reply(`No tinc ni idea de qui és aquest ${usernameToSearch}.`);
      return true;
    }

    try {
      const otherHistory = JSON.parse(
        fs.readFileSync(otherChatPath, "utf-8"),
      );
      const lastMessages = otherHistory.slice(-5); // Last 5 interactions

      let replyText = `*Últimes converses de ${usernameToSearch}:*\n\n`;
      lastMessages.forEach((m) => {
        const prefix = m.role === "user" ? "👤 Usuari:" : "🐒 Eladi:";
        replyText += `${prefix} ${m.content}\n\n`;
      });

      await ctx.reply(replyText, { parse_mode: "Markdown" });
      return true;
    } catch (e) {
      await ctx.reply("Error llegint el xat, s'ha cardat tot.");
      return true;
    }
  }

  return false; // Not an admin command recognized or nothing has been executed
}

async function sendDebugContext(ctx, userId, inputText, context) {
  if (userId !== "eladisc" || !inputText.toLowerCase().startsWith("/debug"))
    return;

  const { memoriaColectiva, timeline, amics, historiadelXat } = context;
  const cleanContext = inputText.replace(/^\/debug\s*/i, "");

  const fullContext =
    `🧠 **DEBUG CONTEXT** (Cerca: "${cleanContext}"):\n\n` +
    `**Memòria:**\n\`\`\`\n${memoriaColectiva || "Cap record trobat."}\n\`\`\`\n` +
    `**Timeline:**\n\`\`\`\n${timeline || "Cap anècdota trobada."}\n\`\`\`\n` +
    `**Amics:**\n\`\`\`\n${amics || "Cap fitxa d'amic trobada."}\n\`\`\`\n` +
    `**Historial:**\n\`\`\`\n${historiadelXat || "Cap historial rellevant."}\n\`\`\`\n`;

  try {
    await ctx.reply(fullContext, { parse_mode: "Markdown" });
  } catch (e) {
    await ctx.reply("--- DEBUG CONTEXT ---\n" + fullContext.replace(/\*/g, ""));
  }
}

function setupCallbackQueries(bot) {
  // --- HANDLER: INLINE BUTTONS (for /xats) ---
  bot.on("callback_query", async (ctx) => {
    const userId = ctx.from.username || ctx.from.id.toString();
    if (userId !== "eladisc")
      return ctx.answerCbQuery("No tens permís per fer això.");

    const data = ctx.callbackQuery.data;
    if (data && data.startsWith("xat:")) {
      const username = data.split(":")[1];
      await ctx.answerCbQuery(); // Close the "loading" button

      // Reuse the logic of /xat
      await handleAdminCommands(ctx, userId, `/xat ${username}`);
    }
  });
}

module.exports = {
  handleAdminCommands,
  sendDebugContext,
  setupCallbackQueries,
};
