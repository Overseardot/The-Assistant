require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
  REST,
  Routes,
} = require('discord.js');

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  GITHUB_TOKEN,
  GITHUB_REPO, // e.g. "yourname/faction-site"
  GITHUB_FILE = 'data.json',
  GITHUB_BRANCH = 'main',
} = process.env;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---------- GitHub: read, change, and save data.json ----------
async function updateSiteData(mutate) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPO are not set');
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Load the current file (if it exists yet)
  let data = { faction: {}, announcements: [], roles: [] };
  let sha;
  const res = await fetch(`${url}?ref=${GITHUB_BRANCH}`, { headers });
  if (res.ok) {
    const file = await res.json();
    sha = file.sha;
    data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  } else if (res.status !== 404) {
    throw new Error(`GitHub read failed (${res.status})`);
  }

  mutate(data);
  data.updated = new Date().toISOString();

  // Save it back as a commit
  const put = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'Update site data from Discord bot',
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      branch: GITHUB_BRANCH,
      sha,
    }),
  });
  if (!put.ok) throw new Error(`GitHub write failed (${put.status})`);
}

// ---------- Slash commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName('createrole')
    .setDescription('Create a new role and list it on the website')
    .addStringOption((o) =>
      o.setName('name').setDescription('Role name').setRequired(true)
    )
    .addStringOption((o) =>
      o.setName('color').setDescription('Hex color, e.g. #ff0000')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .toJSON(),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post an announcement on the website')
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('What to announce')
        .setMaxLength(500)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });
}

client.once('ready', async () => {
  await registerCommands();
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /createrole
  if (interaction.commandName === 'createrole') {
    await interaction.deferReply();
    let role;
    try {
      role = await interaction.guild.roles.create({
        name: interaction.options.getString('name'),
        color: interaction.options.getString('color') ?? undefined,
        reason: `Created by ${interaction.user.tag}`,
      });
    } catch (err) {
      console.error(err);
      return interaction.editReply(
        'Could not create the role. Check the color format and that I have Manage Roles.'
      );
    }

    let note = ' It now appears on the website.';
    try {
      await updateSiteData((d) => {
        d.roles = d.roles || [];
        d.roles.push({ name: role.name, color: role.hexColor });
      });
    } catch (err) {
      console.error(err);
      note = ' The role exists, but the website update failed.';
    }
    return interaction.editReply(`Created role ${role}.${note}`);
  }

  // /announce
  if (interaction.commandName === 'announce') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const text = interaction.options.getString('text');
    try {
      await updateSiteData((d) => {
        d.announcements = d.announcements || [];
        d.announcements.unshift({ text, date: new Date().toISOString() });
        d.announcements = d.announcements.slice(0, 20); // keep the latest 20
      });
      return interaction.editReply('Announcement posted to the website.');
    } catch (err) {
      console.error(err);
      return interaction.editReply(
        'Could not update the website. Check the GitHub settings in .env.'
      );
    }
  }
});

client.login(DISCORD_TOKEN);
