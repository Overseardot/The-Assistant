# The Assistant

Discord bot for managing faction roles and website announcements.

## Stack

- Node.js
- JavaScript
- discord.js
- GitHub Contents API

## Commands

### /createrole

Creates a Discord role and adds the role to `data.json`.

Requires **Manage Roles**.

### /announce

Adds an announcement to `data.json` so the website can display it.

Requires **Manage Server**.

## Environment variables

Set these in your hosting provider:

```text
DISCORD_TOKEN=your-discord-bot-token
CLIENT_ID=your-discord-application-id
GUILD_ID=your-discord-server-id
GITHUB_TOKEN=your-github-token
GITHUB_REPO=Overseardot/The-Assistant
GITHUB_BRANCH=main
GITHUB_FILE=data.json
```

Never commit real tokens or secrets.

## Run

```bash
npm install
npm start
```

The bot entry point is:

```text
src/index.js
```
