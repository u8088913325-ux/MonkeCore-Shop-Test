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
const SHOP_ACCESS_ROLE_ID = process.env.SHOP_ACCESS_ROLE_ID;
const CHECKER_ROLE_ID = process.env.CHECKER_ROLE_ID;
const UTILITY_ROLE_ID = process.env.UTILITY_ROLE_ID;
const ALL_ACCESS_ROLE_ID = process.env.ALL_ACCESS_ROLE_ID;

const sessions = new Map();
const oauthStates = new Set();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
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

function createSession(res, user, accessToken) {
  const sessionId = crypto.randomBytes(32).toString("hex");

  sessions.set(sessionId, {
    discordUserId: user.id,
    username: user.username,
    globalName: user.global_name || user.username,
    accessToken,
    createdAt: Date.now()
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

function getMissingConfig() {
  const missing = [];

  if (!DISCORD_BOT_TOKEN) missing.push("DISCORD_BOT_TOKEN");
  if (!DISCORD_CLIENT_ID) missing.push("DISCORD_CLIENT_ID");
  if (!DISCORD_CLIENT_SECRET) missing.push("DISCORD_CLIENT_SECRET");
  if (!DISCORD_REDIRECT_URI) missing.push("DISCORD_REDIRECT_URI");
  if (!DISCORD_GUILD_ID) missing.push("DISCORD_GUILD_ID");
  if (!SHOP_ACCESS_ROLE_ID) missing.push("SHOP_ACCESS_ROLE_ID");
  if (!CHECKER_ROLE_ID) missing.push("CHECKER_ROLE_ID");
  if (!UTILITY_ROLE_ID) missing.push("UTILITY_ROLE_ID");
  if (!ALL_ACCESS_ROLE_ID) missing.push("ALL_ACCESS_ROLE_ID");

  return missing;
}

async function discordBotRequest(url, options = {}) {
  return await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      ...(options.headers || {})
    }
  });
}

async function getDiscordUserGuilds(accessToken) {
  const response = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not read user guilds: ${response.status} ${text}`);
  }

  return await response.json();
}

async function isUserInTargetGuild(accessToken) {
  const guilds = await getDiscordUserGuilds(accessToken);

  return guilds.some((guild) => guild.id === DISCORD_GUILD_ID);
}

async function getGuildMember(discordUserId) {
  const response = await discordBotRequest(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}`,
    {
      method: "GET"
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not fetch guild member: ${response.status} ${text}`);
  }

  return await response.json();
}

function memberHasRole(member, roleId) {
  return Boolean(
    member &&
    Array.isArray(member.roles) &&
    member.roles.includes(roleId)
  );
}

async function addRoleToUser(discordUserId, roleId) {
  if (!roleId) {
    throw new Error("Missing role ID.");
  }

  const response = await discordBotRequest(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`,
    {
      method: "PUT"
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Could not add role ${roleId}: ${response.status} ${text}`);
  }
}

async function ensureShopRole(discordUserId) {
  await addRoleToUser(discordUserId, SHOP_ACCESS_ROLE_ID);

  return true;
}

async function checkAccess(session) {
  if (!session) {
    return {
      loggedIn: false,
      inServer: false,
      hasShopRole: false,
      roles: []
    };
  }

  let inServerByOauth = false;

  try {
    inServerByOauth = await isUserInTargetGuild(session.accessToken);
  } catch (error) {
    console.error("OAuth guild check failed:", error.message);
  }

  let member = null;
  let hasShopRole = false;
  let roles = [];

  try {
    member = await getGuildMember(session.discordUserId);

    if (member) {
      roles = Array.isArray(member.roles) ? member.roles : [];
      hasShopRole = memberHasRole(member, SHOP_ACCESS_ROLE_ID);
    }
  } catch (error) {
    console.error("Bot member check failed:", error.message);
  }

  if (inServerByOauth) {
    try {
      await ensureShopRole(session.discordUserId);

      member = await getGuildMember(session.discordUserId).catch(() => null);

      if (member) {
        roles = Array.isArray(member.roles) ? member.roles : [];
        hasShopRole = memberHasRole(member, SHOP_ACCESS_ROLE_ID);
      } else {
        hasShopRole = true;
      }
    } catch (error) {
      console.error("Could not ensure shop role:", error.message);
    }
  }

  return {
    loggedIn: true,
    inServer: inServerByOauth || Boolean(member),
    hasShopRole,
    roles
  };
}

function getPackage(packageId) {
  const id = String(packageId || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]/g, "");

  const packages = {
    checker: {
      name: "Checker Access",
      roles: [CHECKER_ROLE_ID]
    },
    modchecker: {
      name: "Checker Access",
      roles: [CHECKER_ROLE_ID]
    },
    utility: {
      name: "Utility Access",
      roles: [UTILITY_ROLE_ID]
    },
    utilityaccess: {
      name: "Utility Access",
      roles: [UTILITY_ROLE_ID]
    },
    allaccess: {
      name: "All Access",
      roles: [ALL_ACCESS_ROLE_ID, UTILITY_ROLE_ID, CHECKER_ROLE_ID]
    },
    all: {
      name: "All Access",
      roles: [ALL_ACCESS_ROLE_ID, UTILITY_ROLE_ID, CHECKER_ROLE_ID]
    }
  };

  return packages[id] || null;
}

app.get("/api/status", (req, res) => {
  const missingConfig = getMissingConfig();

  res.json({
    website: "online",
    bot: client.isReady() ? "online" : "offline",
    botName: client.user ? client.user.tag : null,
    configReady: missingConfig.length === 0,
    missingConfig
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
    scope: "identify guilds",
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

    createSession(res, user, tokenData.access_token);

    const session = {
      discordUserId: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      accessToken: tokenData.access_token
    };

    const access = await checkAccess(session);

    if (!access.inServer) {
      return res.redirect("/?discord=connected&server=missing");
    }

    if (!access.hasShopRole) {
      return res.redirect("/?discord=connected&shopRole=missing");
    }

    return res.redirect("/?discord=connected&shopRole=ok");
  } catch (error) {
    console.error("Discord callback error:", error);

    res.status(500).send("Discord login failed.");
  }
});

app.get("/auth/logout", (req, res) => {
  clearSession(res);
  res.redirect("/");
});

app.post("/auth/logout", (req, res) => {
  clearSession(res);

  res.json({
    success: true
  });
});

app.get("/api/me", async (req, res) => {
  try {
    const session = getSession(req);

    if (!session) {
      return res.json({
        loggedIn: false,
        message: "No website session found. Please authorize with Discord first.",
        discord: {
          inServer: false,
          hasShopRole: false
        }
      });
    }

    const access = await checkAccess(session);

    res.json({
      loggedIn: true,
      authorizedDiscordAccount: {
        id: session.discordUserId,
        username: session.username,
        globalName: session.globalName
      },
      discord: {
        guildId: DISCORD_GUILD_ID,
        inServer: access.inServer,
        hasShopRole: access.hasShopRole,
        roles: access.roles
      }
    });
  } catch (error) {
    console.error("API me error:", error);

    res.status(500).json({
      loggedIn: false,
      error: "Could not check Discord access.",
      details: error.message
    });
  }
});

app.post("/api/refresh-access", async (req, res) => {
  try {
    const session = getSession(req);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Please authorize with Discord first."
      });
    }

    const access = await checkAccess(session);

    res.json({
      success: true,
      message: "Access refreshed.",
      authorizedDiscordAccount: {
        id: session.discordUserId,
        username: session.username,
        globalName: session.globalName
      },
      discord: {
        inServer: access.inServer,
        hasShopRole: access.hasShopRole,
        roles: access.roles
      }
    });
  } catch (error) {
    console.error("Refresh access error:", error);

    res.status(500).json({
      success: false,
      message: "Could not refresh access.",
      details: error.message
    });
  }
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

    const selectedPackage = getPackage(req.body.packageId);

    if (!selectedPackage) {
      return res.status(400).json({
        success: false,
        message: "Unknown package selected.",
        receivedPackageId: req.body.packageId || null
      });
    }

    const access = await checkAccess(session);

    if (!access.inServer) {
      return res.status(403).json({
        success: false,
        message: "You must join the Discord server before buying a package.",
        debug: {
          reason: "USER_NOT_IN_DISCORD_SERVER",
          authorizedDiscordAccount: {
            id: session.discordUserId,
            username: session.username,
            globalName: session.globalName
          },
          guildId: DISCORD_GUILD_ID
        }
      });
    }

    if (!access.hasShopRole) {
      return res.status(403).json({
        success: false,
        message: "You need the Monkey Core Shop role before buying a package. Please authorize with Discord again.",
        debug: {
          reason: "SHOP_ROLE_MISSING",
          shopRoleId: SHOP_ACCESS_ROLE_ID
        }
      });
    }

    for (const roleId of selectedPackage.roles) {
      await addRoleToUser(session.discordUserId, roleId);
    }

    res.json({
      success: true,
      package: selectedPackage.name,
      message: `${selectedPackage.name} unlocked. Your Discord role has been added.`,
      authorizedDiscordAccount: {
        id: session.discordUserId,
        username: session.username,
        globalName: session.globalName
      }
    });
  } catch (error) {
    console.error("Checkout role error:", error);

    res.status(500).json({
      success: false,
      message: "Could not complete checkout. Check Railway logs for the exact Discord error.",
      details: error.message
    });
  }
});

app.use(express.static(path.join(__dirname, "public")));

client.once("ready", () => {
  console.log(`✅ Discord Bot online als ${client.user.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  try {
    if (member.guild.id !== DISCORD_GUILD_ID) return;

    await addRoleToUser(member.user.id, SHOP_ACCESS_ROLE_ID);

    console.log(`✅ Monkey Core Shop Rolle gegeben an ${member.user.tag}`);
  } catch (error) {
    console.error("❌ Konnte Monkey Core Shop Rolle beim Join nicht geben:", error);
  }
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