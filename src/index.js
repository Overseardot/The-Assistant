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

const required = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "GUILD_ID",
  "GITHUB_TOKEN",
  "GITHUB_REPO",
];

const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function updateSiteData(update) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  let data = { faction: {}, announcements: [], roles: [] };
  let sha;

  const response = await fetch(
    `${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    { headers }
  );

  if (response.ok) {
    const file = await response.json();
    sha = file.sha;
    data = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  } else if (response.status !== 404) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  update(data);

  const body = {
    message: "Update website data from Discord",
    content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
    branch: GITHUB_BRANCH,
  };

  if (sha) body.sha = sha;

  const save = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!save.ok) {
    throw new Error(`GitHub write failed: ${save.status}`);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName("createrole")
    .setDescription("Create a Discord role and add it to the website")
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
        .setMaxLength(7)
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
        .setRequired(true)
        .setMaxLength(500)
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
    const color = interaction.options.getString("color");

    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return interaction.editReply("Use a valid 6-digit hex color like #ff0000.");
    }

    try {
      const role = await interaction.guild.roles.create({
        name,
        color: color || undefined,
        reason: `Created by ${interaction.user.tag}`,
      });

      await updateSiteData((data) => {
        data.roles = Array.isArray(data.roles) ? data.roles : [];
        data.roles.push({
          name: role.name,
          color: role.hexColor,
        });
      });

      await interaction.editReply(
        `Created ${role} and added it to the website.`
      );
    } catch (error) {
      console.error("Create role failed:", error);
      await interaction.editReply(
        "I could not create the role or update the website. Check my Discord permissions and GitHub settings."
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

      await interaction.editReply("Announcement posted to the website.");
    } catch (error) {
      console.error("Announcement failed:", error);
      await interaction.editReply(
        "I could not update the website. Check the GitHub token and repository settings."
      );
    }
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});
