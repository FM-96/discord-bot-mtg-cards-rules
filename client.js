const Discord = require('discord.js');

module.exports = new Discord.Client({
	partials: [
		'MESSAGE',
		'REACTION',
		'USER',
	],
	ws: {
		intents: Discord.Intents.NON_PRIVILEGED,
	},
});
