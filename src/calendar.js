const { google } = require("googleapis");
const fs = require("fs");

// Load the keys we downloaded
const KEYFILE = "google-keys.json";
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILE,
  scopes: SCOPES,
});

const calendar = google.calendar({ version: "v3", auth });

// Function to list events
async function getProperesCites() {
  try {
    const res = await calendar.events.list({
      calendarId: "primary", // O el teu correu personal si l'has compartit
      timeMin: new Date().toISOString(),
      maxResults: 5,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items;
    if (!events || events.length === 0)
      return "No tens ni una merda a l'agenda, piyuli.";

    return events
      .map((e) => `${e.start.dateTime || e.start.date}: ${e.summary}`)
      .join("\n");
  } catch (err) {
    return "Catacrocker! L'API de Google ha petat.";
  }
}

// Funció per crear una cita
async function crearCita(titol, dataHora) {
  const event = {
    summary: titol,
    start: { dateTime: dataHora, timeZone: "Europe/Madrid" },
    end: {
      dateTime: new Date(new Date(dataHora).getTime() + 3600000).toISOString(),
      timeZone: "Europe/Madrid",
    },
  };

  await calendar.events.insert({ calendarId: "primary", resource: event });
  return "Fet, t'ho he apuntat, no t'hi flipis.";
}
