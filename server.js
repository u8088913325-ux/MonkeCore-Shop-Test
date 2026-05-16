require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();

const PORT = process.env.PORT || 3000;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const DISCORD_INVITE_LINK = process.env.DISCORD_INVITE_LINK;

const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const CHECKER_ROLE_ID = process.env.CHECKER_ROLE_ID;
const UTILITY_ROLE_ID = process.env.UTILITY_ROLE_ID;
const ALL_ACCESS_ROLE_ID = process.env.ALL_ACCESS_ROLE_ID;

const sessions = new Map();
const oauthStates = new Set();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};

  header.split(";").forEach((part) => {
    const [key, ...valueParts] = part.trim().split("=");
    if (!key) return;
    cookies[key] = decodeURIComponent(valueParts.join("="));
  });

  return cookies;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.mc_session;

  if (!sessionId) return null;

  return sessions.get(sessionId) || null;
}

function createSession(res, user) {
  const sessionId = crypto.randomBytes(32).toString("hex");

  sessions.set(sessionId, {
    discordUserId: user.id,
    username: user.username,
    globalName: user.global_name || user.username,
    avatar: user.avatar
  });

  res.setHeader(
    "Set-Cookie",
    `mc_session=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
  );
}

function clearSession(res) {
  res.setHeader(
    "Set-Cookie",
    "mc_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
  );
}

app.get("/api/status", (req, res) => {
  res.json({
    website: "online",
    bot: client.isReady() ? "online" : "offline",
    botName: client.user ? client.user.tag : null
  });
});

app.get("/discord", (req, res) => {
  if (!DISCORD_INVITE_LINK) {
    return res.status(500).send("DISCORD_INVITE_LINK is missing.");
  }

  res.redirect(DISCORD_INVITE_LINK);
});

app.get("/auth/discord", (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI) {
    return res.status(500).send("Discord OAuth is not configured.");
  }

  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.add(state);

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state || !oauthStates.has(state)) {
      return res.status(400).send("Invalid Discord login request.");
    }

    oauthStates.delete(state);

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: DISCORD_REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Discord token error:", tokenData);
      return res.status(400).send("Discord authorization failed.");
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const user = await userResponse.json();

    if (!userResponse.ok) {
      console.error("Discord user error:", user);
      return res.status(400).send("Could not read Discord user.");
    }

    createSession(res, user);
    res.redirect("/?discord=connected");
  } catch (error) {
    console.error("Discord callback error:", error);
    res.status(500).send("Discord login failed.");
  }
});

app.post("/auth/logout", (req, res) => {
  clearSession(res);
  res.json({ success: true });
});

app.get("/api/me", (req, res) => {
  const session = getSession(req);

  if (!session) {
    return res.json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,
    user: {
      id: session.discordUserId,
      username: session.username,
      globalName: session.globalName
    }
  });
});

app.post("/api/checkout", async (req, res) => {
  try {
    const session = getSession(req);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Please authorize with Discord first."
      });
    }

    if (!client.isReady()) {
      return res.status(503).json({
        success: false,
        message: "The Discord bot is currently offline. Please try again later."
      });
    }

    const { packageId } = req.body;

    const roleMap = {
      checker: [CHECKER_ROLE_ID],
      utility: [UTILITY_ROLE_ID],
      allaccess: [ALL_ACCESS_ROLE_ID, UTILITY_ROLE_ID, CHECKER_ROLE_ID]
    };

    const roleIds = roleMap[packageId];

    if (!roleIds) {
      return res.status(400).json({
        success: false,
        message: "Unknown package selected."
      });
    }

    const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
    const member = await guild.members.fetch(session.discordUserId);

    for (const roleId of roleIds) {
      if (roleId) {
        await member.roles.add(roleId);
      }
    }

    res.json({
      success: true,
      message: "Access granted. Your Discord roles have been added."
    });
  } catch (error) {
    console.error("Checkout role error:", error);

    res.status(500).json({
      success: false,
      message: "Could not add the Discord role. Make sure you are in the server and the bot role is high enough."
    });
  }
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