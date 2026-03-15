const tools = [
  {
    type: "function",
    function: {
      name: "cercar_internet",
      description:
        "Cerca a internet informació objectiva, dades rellevants sobre temes que desconeixes (ex. fets històrics, personatges, pel·lícules, països).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "El concepte clau a cercar (en català).",
          },
        },
        required: ["query"],
      },
    },
  },
];

module.exports = {
  tools,
};
