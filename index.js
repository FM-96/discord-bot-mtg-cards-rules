var Discord = require('discord.js');
var argv = require('minimist')(process.argv.slice(2));
var winston = require('winston');

var fs = require('fs');

var embeds = require('./embeds.js');
var fetcher = require('./fetcher.js');

var botToken = null;
var client = new Discord.Client();

//set logging level
var loggingLevel = 'info';
if (argv.logging !== undefined && Object.keys(require('./logging-levels.js').levels).includes(argv.logging)) {
	loggingLevel = argv.logging;
} else if (argv.verbose === true || argv.v === true) {
	loggingLevel = 'verbose';
}

//set console colors
var colorize = true;
if (argv.nocolor === true) {
	colorize = false;
}

//configure logger
var loggingLevels = require('./logging-levels.js');
winston.padLevels = true;
winston.setLevels(loggingLevels.levels);
winston.addColors(loggingLevels.colors);
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {
	level: loggingLevel,
	colorize: colorize,
	timestamp: true,
	stderrLevels: [
		'fatal',
		'error'
	]
});

//get discord bot token
if (!fileExists(__dirname + '/discord_bot_token.txt')) {
	//create file
	fs.closeSync(fs.openSync(__dirname + '/discord_bot_token.txt', 'w'));
}
//read token from file
botToken = fs.readFileSync(__dirname + '/discord_bot_token.txt', 'utf8');
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

	var matches = message.content.match(/\[\[[0-9a-zA-Z.,:\- ]+\]\]/g);

	if (matches) {
		for (let match of matches) {
			match = match.slice(2, -2);

			if (/^[0-9]{3}\.?([0-9]{1,3}[a-z]?\.?)?$/.test(match)) {
				//match is a rule
				var notImplementedNotified
				if (!notImplementedNotified) {
					notImplementedNotified = true;
					message.channel.sendMessage('Sorry, I can\'t look up rules yet.');
				}
			} else {
				//match is a card
				fetcher.fetchCard(match).then(
					function (result) {
						if (result === false) {
							return false;
						}
						return embeds.makeCardEmbed(result);
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

//start bot
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

//utility functions
function fileExists(path) {
	try {
		fs.statSync(path);
		return true;
	} catch (e) {
		return false;
	}
}
