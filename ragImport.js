require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getCollection } = require("./src/ragEngine");

async function importarRecords(records) {
  const collection = await getCollection(process.env.RAG_MEMORY_COLLECTION);

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];

    const metadata = {
      autor: rec.usuari,
      data: rec.data,
      data_original: rec.data_original,
    };

    if (Array.isArray(rec.protagonistes) && rec.protagonistes.length > 0) {
      metadata.protagonistes = rec.protagonistes;
    }

    if (Array.isArray(rec.tags) && rec.tags.length > 0) {
      metadata.tags = rec.tags;
    }

    // Now Chroma handles embedding calculation via ollamaEmbeddingFunction defined in ragEngine
    await collection.add({
      ids: [`${Date.now()}-${i}`],
      documents: [rec.text],
      metadatas: [metadata],
    });
  }
}

async function importarTimeline() {
  const timelinePath = path.join(__dirname, "rag", "timeline.json");
  const raw = fs.readFileSync(timelinePath, "utf8");
  const timeline = JSON.parse(raw);

  const records = timeline.map((item, index) => {
    const protagonistes = Array.isArray(item.protagonistes)
      ? item.protagonistes
      : [];
    const tags = Array.isArray(item.tags) ? item.tags : [];

    const textParts = [
      item.esdeveniment,
      item.data_original || item.data
        ? `Data: ${item.data_original || item.data}`
        : null,
      protagonistes.length
        ? `Protagonistes: ${protagonistes.join(", ")}`
        : null,
      tags.length ? `Tags: ${tags.join(", ")}` : null,
    ].filter(Boolean);

    return {
      text: textParts.join(" | "),
      usuari: protagonistes[0] || "timeline",
      data: item.data || null,
      data_original: item.data_original || null,
      protagonistes,
      tags,
      index,
    };
  });

  await importarRecords(records);
}

async function importarRagMemory() {
  const memoryDir = path.join(__dirname, "rag", "memory");
  const files = fs.readdirSync(memoryDir);

  let allRecords = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const fullPath = path.join(memoryDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    let items;
    try {
      items = JSON.parse(raw);
    } catch (e) {
      console.error(`No s'ha pogut parsejar ${file}:`, e);
      continue;
    }

    const usuari = path.basename(file, ".json");

    const records = (Array.isArray(items) ? items : []).map((item, index) => ({
      text: item.text,
      usuari,
      data: item.data || null,
      data_original: null,
      protagonistes: [usuari],
      tags: ["memoria-usuari"],
      index,
    }));

    allRecords = allRecords.concat(records);
  }

  if (allRecords.length > 0) {
    await importarRecords(allRecords);
  }
}

if (require.main === module) {
  (async () => {
    try {
      await importarTimeline();
      console.log("Timeline importada correctament a la memòria.");

      await importarRagMemory();
      console.log("Fitxers de rag/memory importats correctament.");
    } catch (err) {
      console.error("Error important la memòria:", err);
      process.exitCode = 1;
    }
  })();
}
