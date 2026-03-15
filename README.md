# Bot de Telegram Eladibot (Ollama + Gemma)

Projecte Node.js que munta un bot de Telegram (`Telegraf`) que parla com l'Eladi utilitzant un model local d'Ollama (Gemma finetunejada amb `models/eladi-gemma.mf`).  
El bot guarda memòria de les converses, pot consultar un "timeline", llistar amics i fins i tot analitzar fotos que li envies.

## Requisits

- **Node.js**: versió 18 o superior recomanada
- **npm**: per instal·lar dependències
- **Ollama**: instal·lat i funcionant al mateix host
  - Has de tenir creat el model definit a `models/eladi-gemma.mf`
- **Compte de Telegram** i **bot** creat amb BotFather
- Opcional: **PM2** per arrencar el bot en segon pla (es veu a `reset.sh`)

## Instal·lació

1. Clona el repositori i entra al directori:

```bash
git clone <URL_DEL_REPO>
cd eladibot
```

2. Instal·la les dependències de Node:

```bash
npm install
```

3. Crea el model d'Ollama a partir del fitxer de model:

```bash
ollama create gemmota -f models/eladi-gemma.mf
```

Pots canviar el nom del model (`gemmota`) si vols, però recorda ajustar la variable d'entorn `OLLAMA_MODEL`.

## Configuració (.env)

Al directori arrel crea un fitxer `.env` amb, com a mínim:

```bash
TELEGRAM_TOKEN=<token_del_teu_bot>
OLLAMA_MODEL=gemmota        # o el nom que hagis posat al crear el model
USE_TOOLS=true              # opcional, per habilitar les tools
```

Altres variables opcionals les pots afegir segons necessitis.

## Directori i fitxers importants

- `bot.js`: punt d'entrada del bot, registra els handlers i arrenca Telegraf.
- `src/text.js`: gestiona els missatges de text (memòria, timeline, calendaris, etc.).
- `src/photo.js`: gestiona el processament de fotos i la crida a Ollama amb imatge.
- `models/eladi-gemma.mf`: definició del model per Ollama (personalitat de l'Eladi).
- `rag/`: carpeta on el bot desa les dades per a RAG (`rag/chats/`, `rag/memory/`, `rag/friends.json`, `rag/timeline.json`, `rag/json`), juntament amb `historic/` i `fotos/`, que són dades locals.

## Execució

### En desenvolupament

```bash
node bot.js
```

Assegura’t que Ollama estigui en marxa (`ollama serve`) i que el model `OLLAMA_MODEL` existeixi.

### Amb PM2 / producció

Si fas servir PM2 (tal com suggereix `reset.sh`), pots tenir alguna cosa semblant a:

```bash
pm2 start bot.js --name eladi-bot
```

I per reiniciar ràpid:

```bash
./reset.sh
```

### RAG (Retrieval-Augmented Generation)

El model fa servir informació desada en fitxers json per generar les seves respostes:

- chats: carpeta amb les converses dels usuaris
- memory: anècdotes guardades pels usuaris amb la comanda "Recorda que"
- timeline.json: Conjunt d'anècdotes inicials
- friends.json: Base de dades d'amics
- users.json: Base de dades d'usuaris de Telegram

## Notes

- Aquest projecte assumeix que les dades de conversa i memòria són **locals** i no es versionen amb Git.
- Si canvies rutes o noms de carpetes (`rag`, `fotos`, etc.), assegura’t d’actualitzar els `require` i constants a `src/constants.js` i la resta de mòduls.
