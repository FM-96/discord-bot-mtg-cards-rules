const argv = require('minimist')(process.argv.slice(2));
const winston = require('winston');

const fs = require('fs');
const path = require('path');

const embeds = require('./embeds.js');
const emojis = require('./emojis.js');
const fetcher = require('./fetcher.js');

let botToken = null;
const client = require('./client.js');

// set logging level
let loggingLevel = 'info';
const loggingLevels = require('./logging-levels.js');
if (argv.logging !== undefined && Object.keys(loggingLevels.levels).includes(argv.logging)) {
	loggingLevel = argv.logging;
} else if (argv.verbose === true || argv.v === true) {
	loggingLevel = 'verbose';
}

// set console colors
let colorize = true;
if (argv.nocolor === true) {
	colorize = false;
}

// configure logger
winston.padLevels = true;
winston.setLevels(loggingLevels.levels);
winston.addColors(loggingLevels.colors);
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {
	level: loggingLevel,
	colorize: colorize,
	timestamp: true,
	stderrLevels: [
		'fatal',
		'error',
	],
});

// get discord bot token
const tokenFile = path.join(__dirname, 'discord_bot_token.txt');
if (!fileExists(tokenFile)) {
	// create file
	fs.closeSync(fs.openSync(tokenFile, 'w'));
}
// read token from file
botToken = fs.readFileSync(tokenFile, 'utf8');
if (!botToken) {
	winston.fatal('No bot token found');
	winston.fatal('Save the token in discord_bot_token.txt and restart the application');
	process.exit(0);
} else {
	winston.verbose('Bot token loaded');
}

client.on('message', async function (message) {
	if (message.author.id === client.user.id) {
		return;
	}

	const cardMatches = message.content.match(/\[(?:!?|\??)*\[[^[\n]+?\]\]/g);
	const ruleMatches = message.content.match(/\{(?:>?)*\{[^{\n]+?\}\}/g);

	if (cardMatches) {
		const uniqueMatches = [];
		for (let match of cardMatches) {
			const flags = match.slice(1, match.indexOf('[', 1));
			match = match.slice(2 + flags.length, -2).trim().replace(/ +/g, ' ').toLowerCase();
			if (uniqueMatches.includes(match)) {
				continue;
			}
			uniqueMatches.push(match);

			const extended = flags.includes('?');
			const picture = flags.includes('!');

			// match is a card
			try {
				const cardData = await fetcher.fetchCard(match);
				if (cardData === false) {
					continue;
				}

				const embed = await embeds.makeCardEmbed(cardData, extended);
				const options = {};
				if (picture) {
					options.files = [embed.image.url];
				}
				delete embed.image;
				options.embed = embed;

				await message.channel.send('', options);
			} catch (err) {
				winston.error(`Error (card: ${match}):`);
				winston.error(err);
				try {
					const embed = await embeds.makeErrorEmbed(err, match, 'card');
					await message.channel.send('', {embed: embed});
				} catch (err2) {
					winston.error('Error while trying to send error message:');
					winston.error(err2);
				}
			}
		}
	}

	if (ruleMatches) {
		const uniqueMatches = [];
		for (let match of ruleMatches) {
			const flags = match.slice(1, match.indexOf('{', 1));
			match = match.slice(2 + flags.length, -2).trim().replace(/ +/g, ' ').toLowerCase();
			if (uniqueMatches.includes(match)) {
				continue;
			}
			uniqueMatches.push(match);

			const nav = flags.includes('>');

			if (/^[1-9]\.?$|^[0-9]{3}\.?([0-9]{1,3}[a-z]?\.?)?$/.test(match)) {
				// match is a rule
				match = match.replace(/\./g, '');
				try {
					const ruleData = await fetcher.fetchRule(match, nav);
					if (ruleData.content.length === 0) {
						continue;
					}

					const embed = await embeds.makeRuleEmbed(ruleData);

					const rulesMessage = await message.channel.send('', {embed: embed});

					if (nav) {
						rulesMessage.react(emojis.STOP)
							.then(reaction => reaction.message.react(emojis.SUPERRULE))
							.then(reaction => reaction.message.react(emojis.PREVIOUS_RULE))
							.then(reaction => reaction.message.react(emojis.NEXT_RULE))
							.then(reaction => reaction.message.react(emojis.SUBRULE))
							.catch(winston.error);
					}
				} catch (err) {
					winston.error(`Error (rule: ${match}):`);
					winston.error(err);
					try {
						const embed = await embeds.makeErrorEmbed(err, match, 'rule');
						await message.channel.send('', {embed: embed});
					} catch (err2) {
						winston.error('Error while trying to send error message:');
						winston.error(err2);
					}
				}
			} else {
				// match is a glossary term
				try {
					const glossaryData = await fetcher.fetchGlossary(match);
					if (glossaryData.content.length === 0) {
						continue;
					}

					const embed = await embeds.makeRuleEmbed(glossaryData);

					await message.channel.send('', {embed: embed});
				} catch (err) {
					winston.error(`Error (glossary: ${match}):`);
					winston.error(err);
					try {
						const embed = await embeds.makeErrorEmbed(err, match, 'glossary');
						await message.channel.send('', {embed: embed});
					} catch (err2) {
						winston.error('Error while trying to send error message:');
						winston.error(err2);
					}
				}
			}
		}
	}
});

client.on('messageReactionAdd', async function (reaction, user) {
	if (reaction.partial) {
		try {
			await reaction.fetch();
		} catch (err) {
			winston.error('Error while trying to fetch partial reaction:');
			winston.error(err);
		}
	}

	if (reaction.message.author.id !== client.user.id || user.id === client.user.id || !reaction.message.embeds[0].fields.length || reaction.message.embeds[0].fields[0].name !== 'Navigation') {
		return;
	}

	if (Object.values(emojis).includes(reaction.emoji.name)) {
		reaction.users.remove(user).catch(winston.error);
	} else {
		return;
	}

	const rule = reaction.message.embeds[0].description.match(/\*\*(.+?)\*\*/)[1].replace(/\./g, '');
	let ruleData, embed;

	switch (reaction.emoji.name) {
		case emojis.NEXT_RULE:
			try {
				ruleData = await fetcher.navigateNextRule(rule);
				if (ruleData === false) {
					return;
				}
				embed = embeds.makeRuleEmbed(ruleData);
				await reaction.message.edit({embed});
			} catch (err) {
				const errorRule = ruleData.content[0].number.replace(/\./g, '');
				winston.error(`Error (rule: ${errorRule}):`);
				winston.error(err);
				try {
					embed = await embeds.makeErrorEmbed(err, errorRule, 'rule');
					await reaction.message.edit({embed});
				} catch (err2) {
					winston.error('Error while trying to send error message:');
					winston.error(err2);
				}
			}
			break;
		case emojis.PREVIOUS_RULE:
			try {
				ruleData = await fetcher.navigatePrevRule(rule);
				if (ruleData === false) {
					return;
				}
				embed = embeds.makeRuleEmbed(ruleData);
				await reaction.message.edit({embed});
			} catch (err) {
				const errorRule = ruleData.content[0].number.replace(/\./g, '');
				winston.error(`Error (rule: ${errorRule}):`);
				winston.error(err);
				try {
					embed = await embeds.makeErrorEmbed(err, errorRule, 'rule');
					await reaction.message.edit({embed});
				} catch (err2) {
					winston.error('Error while trying to send error message:');
					winston.error(err2);
				}
			}
			break;
		case emojis.STOP:
			try {
				reaction.message.reactions.removeAll().catch(winston.error);
				ruleData = await fetcher.fetchRule(rule, false);
				embed = embeds.makeRuleEmbed(ruleData);
				await reaction.message.edit({embed});
			} catch (err) {
				const errorRule = ruleData.content[0].number.replace(/\./g, '');
				winston.error(`Error (rule: ${errorRule}):`);
				winston.error(err);
				try {
					embed = await embeds.makeErrorEmbed(err, errorRule, 'rule');
					await reaction.message.edit({embed});
				} catch (err2) {
					winston.error('Error while trying to send error message:');
					winston.error(err2);
				}
			}
			break;
		case emojis.SUBRULE:
			try {
				ruleData = await fetcher.navigateSubRule(rule);
				if (ruleData === false) {
					return;
				}
				embed = embeds.makeRuleEmbed(ruleData);
				await reaction.message.edit({embed});
			} catch (err) {
				const errorRule = ruleData.content[0].number.replace(/\./g, '');
				winston.error(`Error (rule: ${errorRule}):`);
				winston.error(err);
				try {
					embed = await embeds.makeErrorEmbed(err, errorRule, 'rule');
					await reaction.message.edit({embed});
				} catch (err2) {
					winston.error('Error while trying to send error message:');
					winston.error(err2);
				}
			}
			break;
		case emojis.SUPERRULE:
			try {
				ruleData = await fetcher.navigateSuperRule(rule);
				if (ruleData === false) {
					return;
				}
				embed = embeds.makeRuleEmbed(ruleData);
				await reaction.message.edit({embed});
			} catch (err) {
				const errorRule = ruleData.content[0].number.replace(/\./g, '');
				winston.error(`Error (rule: ${errorRule}):`);
				winston.error(err);
				try {
					embed = await embeds.makeErrorEmbed(err, errorRule, 'rule');
					await reaction.message.edit({embed});
				} catch (err2) {
					winston.error('Error while trying to send error message:');
					winston.error(err2);
				}
			}
			break;
		default:
			// no-op
	}
});

client.on('ready', function () {
	winston.verbose('Bot is ready');
});

client.on('error', function (error) {
	winston.error('Discord Error: ' + error);
});

client.on('warn', function (warning) {
	winston.warn('Discord Warning: ' + warning);
});

// start bot
client.login(botToken).then(
	function (result) {
		winston.info('Successfully logged in');
	}
).catch(
	function (error) {
		if (error) {
			winston.fatal('Error while logging in: ' + error);
			process.exit(1);
		}
	}
);

// utility functions
function fileExists(filePath) {
	try {
		fs.statSync(filePath);
		return true;
	} catch (e) {
		return false;
	}
}
