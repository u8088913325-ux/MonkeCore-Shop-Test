require("dotenv").config();

const express = require("express");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();

const PORT = process.env.PORT || 3000;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/status", (req, res) => {
  res.json({
    website: "online",
    bot: client.isReady() ? "online" : "offline",
    botName: client.user ? client.user.tag : null
  });
});

app.use(express.static(path.join(__dirname, "public")));

client.once("ready", () => {
  console.log(`✅ Discord Bot online als ${client.user.tag}`);
});

client.on("error", (error) => {
  console.error("❌ Discord Client Fehler:", error);
});

app.listen(PORT, () => {
  console.log(`✅ Website läuft auf Port ${PORT}`);
});

if (!DISCORD_BOT_TOKEN) {
  console.warn("⚠️ DISCORD_BOT_TOKEN fehlt. Bot wird nicht gestartet.");
} else {
  client.login(DISCORD_BOT_TOKEN).catch((error) => {
    console.error("❌ Bot Login fehlgeschlagen:", error);
  });
}