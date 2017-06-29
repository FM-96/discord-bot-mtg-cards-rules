var argv = require('minimist')(process.argv.slice(2));
var winston = require('winston');

var fs = require('fs');
var path = require('path');

var embeds = require('./embeds.js');
var fetcher = require('./fetcher.js');

var botToken = null;
var client = require('./client.js');

// set logging level
var loggingLevel = 'info';
var loggingLevels = require('./logging-levels.js');
if (argv.logging !== undefined && Object.keys(loggingLevels.levels).includes(argv.logging)) {
	loggingLevel = argv.logging;
} else if (argv.verbose === true || argv.v === true) {
	loggingLevel = 'verbose';
}

// set console colors
var colorize = true;
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
var tokenFile = path.join(__dirname, 'discord_bot_token.txt');
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

client.on('message', function (message) {
	if (message.author.id === client.user.id) {
		return;
	}

	var cardMatches = message.content.match(/\[(?:!?|\??)*\[[^[\n]+?\]\]/g);
	var ruleMatches = message.content.match(/\{(?:<?|>?)*\{[^{\n]+?\}\}/g);

	if (cardMatches) {
		let uniqueMatches = [];
		for (let match of cardMatches) {
			let flags = match.slice(1, match.indexOf('[', 1));
			match = match.slice(2 + flags.length, -2).trim().replace(/ +/g, ' ').toLowerCase();
			if (uniqueMatches.includes(match)) {
				continue;
			}
			uniqueMatches.push(match);

			let extended = flags.includes('?');
			let picture = flags.includes('!');

			// match is a card
			fetcher.fetchCard(match).then(
				function (result) {
					if (result === false) {
						return false;
					}
					return embeds.makeCardEmbed(result, extended);
				}
			).then(
				function (embed) {
					if (embed !== false) {
						let options = {};
						if (picture) {
							options.file = embed.image.url;
						}
						delete embed.image;
						return message.channel.sendEmbed(embed, '', options);
					}
				}
			).catch(
				function (error) {
					winston.error(error);
				}
			);
		}
	}

	if (ruleMatches) {
		let uniqueMatches = [];
		for (let match of ruleMatches) {
			let flags = match.slice(1, match.indexOf('{', 1));
			match = match.slice(2 + flags.length, -2).trim().replace(/ +/g, ' ').toLowerCase();
			if (uniqueMatches.includes(match)) {
				continue;
			}
			uniqueMatches.push(match);

			let context = flags.includes('<');
			let details = flags.includes('>');

			if (/^[1-9]\.?$|^[0-9]{3}\.?([0-9]{1,3}[a-z]?\.?)?$/.test(match)) {
				// match is a rule
				match = match.replace(/\./g, '');
				fetcher.fetchRule(match, context, details).then(
					function (result) {
						if (result.content.length === 0) {
							return false;
						}
						return embeds.makeRuleEmbed(result);
					}
				).then(
					function (embed) {
						if (embed !== false) {
							return message.channel.sendEmbed(embed);
						}
					}
				).catch(
					function (error) {
						winston.error(error);
					}
				);
			} else {
				// match is a glossary term
				fetcher.fetchGlossary(match).then(
					function (result) {
						if (result.content.length === 0) {
							return false;
						}
						return embeds.makeRuleEmbed(result);
					}
				).then(
					function (embed) {
						if (embed !== false) {
							return message.channel.sendEmbed(embed);
						}
					}
				).catch(
					function (error) {
						winston.error(error);
					}
				);
			}
		}
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
