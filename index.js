const fs = require('node:fs');
const JSONdb = require('simple-json-db');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, REST, Routes, Collection} = require('discord.js');

const config = require('./config.json');
const {startRCONService} = require("./services/rconService");
const {cleanUp} = require("./utils/cleaner/cleaner");
const {ActivityType} = require("discord-api-types/v10");
const db = new JSONdb('./data/data.json');
const logger = require('./utils/discord/logger');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.commands = new Collection();
client.db = db;
client.logger = logger;

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isModalSubmit()) {
        const modalHandlerFolderPath = path.join(__dirname, 'modalHandlers');
        const modalHandlers = fs.readdirSync(modalHandlerFolderPath).filter(file => file.endsWith('.js'));

        if (!modalHandlers.includes(interaction.customId + '.js')) {
            console.error(`No Modal Handler ${interaction.customId} was found.`);
            return;
        }

        try {
            const modalHandler = require(path.join(modalHandlerFolderPath, interaction.customId));
            await modalHandler.handleModal(interaction);
        }catch (e) {
            console.error(`Failed to handle modal ${interaction.customId} with error: ${e}`);
        }

        return;
    }

    if (interaction.isAutocomplete()) {
        try {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(error);
            }
        }catch (e) {
            console.error(`Failed to handle autocomplete ${interaction.customId} with error: ${e}`);
        }

        return;
    }

    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    }
});

const rest = new REST().setToken(config.token);

(async () => {
    try {

        await rest.put(Routes.applicationCommands(config.botApplicationId), { body: [] })
            .catch(console.error);

        await rest.put(
            Routes.applicationCommands(config.botApplicationId),
            { body: client.commands.map(command => command.data.toJSON()) }
        );
    } catch (error) {
        console.error(error);
    }
})();

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    client.user.setActivity({
        type: ActivityType.Custom,
        name: "customstatus",
        state: config.customStatusMessage
    })

    startRCONService(client, db);
});

cleanUp(db);
client.login(config.token);