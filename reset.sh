#!/usr/bin/env bash

# Restart bot
pm2 restart eladi-bot

# Ensure ChromaDB is running on port 8000
if ! docker ps --format '{{.Ports}}' | grep -q ':8000->'; then
  docker run -d -p 8000:8000 --name chroma-server chromadb/chroma >/dev/null 2>&1 || {
    echo "No s'ha pogut engegar el contenidor ChromaDB." >&2
  }
fi

# Recreate Ollama model
ollama create gemmota -f models/eladi-gemma.mf