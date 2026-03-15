const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ollama = require("ollama").default;
const { message } = require("telegraf/filters");

const { FOTOS_DIR } = require("./constants");
const { ensureUserRegistration } = require("./register");

function setupPhotoHandler(bot) {
  bot.on(message("photo"), async (ctx) => {
    // Check if user is registered
    const isRegistered = await ensureUserRegistration(ctx);
    if (!isRegistered) return;

    let intervalEscrivint;
    try {
      const username = ctx.from.username || `usuari_${ctx.from.id}`;
      const timestamp = Date.now();
      const fileName = `${username}_${timestamp}.jpg`;
      const localPath = path.join(FOTOS_DIR, fileName);

      // Typing indicator
      ctx.sendChatAction("typing").catch(() => {});
      intervalEscrivint = setInterval(() => {
        ctx.sendChatAction("typing").catch(() => {});
      }, 4000);

      // Get the best quality photo link
      const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const fileUrl = await ctx.telegram.getFileLink(fileId);

      // Download and save the image to your Mac
      const responseStream = await axios({
        method: "GET",
        url: fileUrl.href,
        responseType: "stream",
      });

      const writer = fs.createWriteStream(localPath);
      responseStream.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      const imageBuffer = fs.readFileSync(localPath);
      const base64Image = imageBuffer.toString("base64");

      // The IA analyzes the photo
      const response = await ollama.generate({
        model: process.env.OLLAMA_MODEL,
        prompt: ctx.message.caption || "Què veus aquí? Sigues breu i irònic.",
        images: [base64Image],
      });

      if (intervalEscrivint) clearInterval(intervalEscrivint);
      await ctx.reply(response.response);
    } catch (error) {
      if (intervalEscrivint) clearInterval(intervalEscrivint);
      console.error("Error processant la foto:", error);
      await ctx.reply(
        "He intentat mirar la foto però m'he embolicat amb els cables.",
      );
    }
  });
}

module.exports = { setupPhotoHandler };
