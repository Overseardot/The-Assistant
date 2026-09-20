const { Client, GatewayIntentBits } = require("discord.js");

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("ERROR: DISCORD_TOKEN is not set.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("The Assistant is online.");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("Pong! 🏓");
  }
});

client.login(token).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});
