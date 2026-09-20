require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
  REST,
  Routes,
} = require("discord.js");

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  GITHUB_TOKEN,
  GITHUB_REPO,
  GITHUB_FILE = "data.json",
  GITHUB_BRANCH = "main",
} = process.env;

const required = {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  GITHUB_TOKEN,
  GITHUB_REPO,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ---------- GitHub: read, change, and save data.json ----------
async function updateSiteData(mutate) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  let data = {
    faction: {},
    announcements: [],
    roles: [],
  };

  let sha;

  const getResponse = await fetch(
    `${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    { headers }
  );

  if (getResponse.ok) {
    const file = await getResponse.json();
    sha = file.sha;

    try {
      data = JSON.parse(
        Buffer.from(file.content, "base64").toString("utf8")
      );
    } catch {
      throw new Error("GitHub data.json contains invalid JSON");
    }
  } else if (getResponse.status !== 404) {
    const body = await getResponse.text();
    throw new Error(`GitHub read failed (${getResponse.status}): ${body}`);
  }

  mutate(data);
  data.updated = new Date().toISOString();

  const payload = {
    message: "Update site data from Discord bot",
    content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
    branch: GITHUB_BRANCH,
  };

  if (sha) {
    payload.sha = sha;
  }

  const putResponse = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });

  if (!putResponse.ok) {
    const body = await putResponse.text();
    throw new Error(`GitHub write failed (${putResponse.status}): ${body}`);
  }
}

// ---------- Slash commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName("createrole")
    .setDescription("Create a Discord role and list it on the website")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Role name")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Hex color, for example #ff0000")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement on the website")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Announcement text")
        .setMaxLength(500)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("Slash commands registered.");
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("Slash-command registration failed:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "createrole") {
    await interaction.deferReply();

    const name = interaction.options.getString("name", true);
    const color = interaction.options.getString("color") || undefined;

    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return interaction.editReply(
        "Invalid color. Use a 6-digit hex color such as #ff0000."
      );
    }

    let role;

    try {
      role = await interaction.guild.roles.create({
        name,
        color,
        reason: `Created by ${interaction.user.tag}`,
      });
    } catch (error) {
      console.error("Role creation failed:", error);

      return interaction.editReply(
        "Could not create the role. Make sure I have Manage Roles and that my highest role is above the new role."
      );
    }

    try {
      await updateSiteData((data) => {
        data.roles = Array.isArray(data.roles) ? data.roles : [];
        data.roles.push({
          name: role.name,
          color: role.hexColor,
        });
      });

      return interaction.editReply(
        `Created role ${role} and added it to the website.`
      );
    } catch (error) {
      console.error("Website role update failed:", error);

      return interaction.editReply(
        `Created role ${role}, but I could not update the website. Check GITHUB_TOKEN, GITHUB_REPO, and repository permissions.`
      );
    }
  }

  if (interaction.commandName === "announce") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const text = interaction.options.getString("text", true);

    try {
      await updateSiteData((data) => {
        data.announcements = Array.isArray(data.announcements)
          ? data.announcements
          : [];

        data.announcements.unshift({
          text,
          date: new Date().toISOString(),
        });

        data.announcements = data.announcements.slice(0, 20);
      });

      return interaction.editReply(
        "Announcement posted to the website."
      );
    } catch (error) {
      console.error("Website announcement update failed:", error);

      return interaction.editReply(
        "Could not update the website. Check GITHUB_TOKEN, GITHUB_REPO, and repository permissions."
      );
    }
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});
