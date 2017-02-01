module.exports.fetchCard = fetchCard;
module.exports.fetchGlossary = fetchGlossary;
module.exports.fetchRule = fetchRule;

var cheerio = require('cheerio');

var http = require('http');
var https = require('https');

var comprehensiveRules = {
	glossary: {},
	rules: {},
	updated: ''
};

function fetchCard(cardName) {
	//get result from https://mtg.wtf/
	return new Promise(function (resolve, reject) {
		https.request({
			hostname: 'mtg.wtf',
			path: '/card?q=!' + encodeURIComponent(cardName)
		}, function (response) {
			var responseData = '';

			response.on('data', function (data) {
				responseData += data;
			});

			response.on('end', function () {
				resolve(responseData);
			});
		}).end();
	}).then(
		//parse result into object
		function (result) {
			var $ = cheerio.load(result);
			var cardObject = {};

			if ($('.results_summary').text().trim() === 'No cards found') {
				return false;
			}

			cardObject.title = $('.card_title > a').text().trim();
			cardObject.cost = $('.card_title > .manacost').text().trim().toUpperCase();
			if (!cardObject.cost) {
				cardObject.cost = 'N/A';
			}
			cardObject.cmc = getCmc(cardObject.cost);
			cardObject.types = $('.typeline').text().trim();
			var colorIndicator = null;
			if ($('.oracle').length) {
				if ($('.oracle > .color_indicator').length) {
					colorIndicator = $('.oracle > .color_indicator').text();
					$('.oracle > .color_indicator').remove();
				}
				$('.oracle').html($('.oracle').html().replace(/\s*<br>\s*/g, '\n\n'));
				cardObject.oracle = $('.oracle').text().trim();
			}
			cardObject.colors = getColors(cardObject.cost, colorIndicator, cardObject.oracle);
			cardObject.ci = getCi(cardObject.cost, cardObject.colors, cardObject.oracle);
			if ($('.flavor').length) {
				$('.flavor').html($('.flavor').html().replace(/<br>/g, '\n'));
				cardObject.flavor = $('.flavor').text().trim();
			}
			if (cardObject.types.includes('Creature') || cardObject.types.includes('Vehicle')) {
				cardObject.pt = $('.power_toughness').text().trim();
			} else if (cardObject.types.includes('Planeswalker')) {
				var loyalty = $.text().match(/Loyalty:\s+([0-9]+)/);
				if (loyalty) {
					cardObject.loyalty = loyalty[1];
				}
			}
			var $otherparts;
			$('.infolabel').each(function (i, elem) {
				if ($(this).text().includes('Card has other part')) {
					$otherparts = $(this);
					return false
				}
			});
			if ($otherparts) {
				cardObject.otherparts = [];
				$otherparts.find('a').each(function (i, elem) {
					cardObject.otherparts.push($(this).text().trim());
				});
			}
			if ($('.legalities').length) {
				cardObject.legalities = '';
				$('.legalities > li').each(function (i, elem) {
					cardObject.legalities += $(this).text().trim().replace(/\n/g, ' ') + '\n';
				});
			}
			if ($('.rulings').length) {
				cardObject.rulings = [];
				$('.rulings > li').each(function (i, elem) {
					var ruling = {
						date: $(this).text().trim().slice(0, 10),
						text: $(this).text().trim().slice(11) //additional whitespace after date and before ruling text
					};
					cardObject.rulings.push(ruling);
				});
			}

			cardObject.image = 'https://mtg.wtf' + $('.card_picture').attr('src');

			return cardObject;
		}
	);
}

function fetchGlossary(term) {
	return getComprehensiveRules().then(
		function (result) {
			glossaryObject = {
				type: 'glossary',
				content: []
			};

			if (comprehensiveRules.glossary[term]) {
				glossaryObject.content.push(comprehensiveRules.glossary[term]);
			}
			for (var key in comprehensiveRules.glossary) {
				if (key.includes(term) && key !== term) {
					glossaryObject.content.push(comprehensiveRules.glossary[key]);
				}
			}

			return glossaryObject;
		}
	);
}

function fetchRule(rule, context, details) {
	return getComprehensiveRules().then(
		function (result) {
			ruleObject = {
				type: 'rule',
				content: []
			};

			if (comprehensiveRules.rules[rule]) {
				ruleObject.content.push(comprehensiveRules.rules[rule]);
				if (details) {
					ruleObject.subrules = getSubRules(comprehensiveRules.rules[rule]);
				}
				if (context) {
					var superRule = comprehensiveRules.rules[rule];
					while (superRule = getSuperRule(superRule)) {
						ruleObject.content.splice(0, 0, superRule);
					}
				}
			}

			return ruleObject;
		}
	);
}

function getCi(manacost, cardColors, oracleText) {
	var ci = 'C';
	if (manacost.includes('W') || cardColors.includes('W') || (oracleText && oracleText.match(/\{W\}/))) {
		ci += 'W';
	}
	if (manacost.includes('U') || cardColors.includes('U') || (oracleText && oracleText.match(/\{U\}/))) {
		ci += 'U';
	}
	if (manacost.includes('B') || cardColors.includes('B') || (oracleText && oracleText.match(/\{B\}/))) {
		ci += 'B';
	}
	if (manacost.includes('R') || cardColors.includes('R') || (oracleText && oracleText.match(/\{R\}/))) {
		ci += 'R';
	}
	if (manacost.includes('G') || cardColors.includes('G') || (oracleText && oracleText.match(/\{G\}/))) {
		ci += 'G';
	}
	if (ci.length > 1) {
		ci = ci.slice(1);
	}
	return ci;
}

function getCmc(manacost) {
	var cmc = 0;
	var coloredCosts = manacost.match(/\{[WUBRGC]\}/g);
	if (coloredCosts) {
		cmc += coloredCosts.length;
	}
	var phyrexianCosts = manacost.match(/\{[WUBRGC]\/P\}/g);
	if (phyrexianCosts) {
		cmc += phyrexianCosts.length;
	}
	var hybridCosts = manacost.match(/\{[WUBRGC]\/[WUBRGC]\}/g);
	if (hybridCosts) {
		cmc += hybridCosts.length;
	}
	var monocoloredHybridCosts = manacost.match(/\{[0-9]+\/[WUBRGC]\}/g);
	if (monocoloredHybridCosts) {
		for (var cost of monocoloredHybridCosts) {
			cmc += Number(cost.split('/')[0].slice(1));
		}
	}
	//halfmana from unsets
	var halfManaCosts = manacost.match(/\{H[WUBRGC]\}/g);
	if (halfManaCosts) {
		cmc += halfManaCosts.length/2;
	}
	var genericCosts = manacost.match(/\{([0-9]+)\}/);
	if (genericCosts) {
		cmc += Number(genericCosts[1]);
	}
	return cmc;
}

function getColors(manacost, colorIndicator, oracleText) {
	var colors = 'C';

	if (oracleText && (oracleText.match(/(^|\n|, )[Dd]evoid[,\n]/) || oracleText.includes(' is colorless'))) {
		return 'C';
	}

	if (manacost.includes('W') || (colorIndicator && (colorIndicator.includes('white') || colorIndicator.includes('all colors')))) {
		colors += 'W';
	}
	if (manacost.includes('U') || (colorIndicator && (colorIndicator.includes('blue') || colorIndicator.includes('all colors')))) {
		colors += 'U';
	}
	if (manacost.includes('B') || (colorIndicator && (colorIndicator.includes('black') || colorIndicator.includes('all colors')))) {
		colors += 'B';
	}
	if (manacost.includes('R') || (colorIndicator && (colorIndicator.includes('red') || colorIndicator.includes('all colors')))) {
		colors += 'R';
	}
	if (manacost.includes('G') || (colorIndicator && (colorIndicator.includes('green') || colorIndicator.includes('all colors')))) {
		colors += 'G';
	}
	if (colors.length > 1) {
		colors = colors.slice(1);
	}
	return colors;
}

function getComprehensiveRules() {
	return new Promise(function (resolve, reject) {
		http.request({
			hostname: 'magic.wizards.com',
			path: '/en/game-info/gameplay/rules-and-formats/rules'
		}, function (response) {
			var responseData = '';

			response.on('data', function (data) {
				responseData += data;
			});

			response.on('end', function () {
				resolve(responseData);
			});
		}).end();
	}).then(
		function (result) {
			return new Promise(function (resolve, reject) { //I need to return a promise here because http.request is asynchronous
				var $ = cheerio.load(result);
				if (comprehensiveRules.updated !== $('#comprehensive-rules > p').first().text()) {
					http.request({
						hostname: 'media.wizards.com',
						path: $('span.txt > a > span.txt').parent().attr('href').split('.com')[1]
					}, function (response) {
						var responseData = '';

						response.on('data', function (data) {
							responseData += data;
						});

						response.on('end', function () {
							comprehensiveRules.updated = $('#comprehensive-rules > p').first().text();
							resolve(parseComprehensiveRules(responseData));
						});
					}).end();
				} else {
					resolve(true);
				}
			});
		}
	);
}

function getSubRules(rule) {
	//1. Game Concepts
	if (rule.number.length === 2) {
		var count = 0;
		var start = false;
		var end = false;
		while (true) {
			count++;
			var nextRule = String(Number(rule.number[0])*100 + count);
			if (comprehensiveRules.rules[nextRule]) {
				if (!start) {
					start = comprehensiveRules.rules[nextRule].number;
				}
				end = comprehensiveRules.rules[nextRule].number;
			} else {
				count--;
				break;
			}
		}
		return {
			count: count,
			start: start,
			end: end
		};
	}
	//100. General
	if (rule.number.length === 4) {
		var count = 0;
		var start = false;
		var end = false;
		while (true) {
			count++;
			var nextRule = rule.number.slice(0, 3) + count;
			if (comprehensiveRules.rules[nextRule]) {
				if (!start) {
					start = comprehensiveRules.rules[nextRule].number;
				}
				end = comprehensiveRules.rules[nextRule].number;
			} else {
				count--;
				break;
			}
		}
		return {
			count: count,
			start: start,
			end: end
		};
	}
	//100.1. These Magic rules apply to any Magic game with two or more players, including two-player games and multiplayer games.
	if (rule.number.endsWith('.')) {
		var count = 0;
		var start = false;
		var end = false;
		var subletters = '.abcdefghijkmnpqrstuvwxyz';
		while (true) {
			count++;
			var nextRule = rule.number.replace(/\./g, '') + subletters[count];
			if (comprehensiveRules.rules[nextRule]) {
				if (!start) {
					start = comprehensiveRules.rules[nextRule].number;
				}
				end = comprehensiveRules.rules[nextRule].number;
			} else {
				count--;
				break;
			}
		}
		return {
			count: count,
			start: start,
			end: end
		};
	}
	//100.1a A two-player game is a game that begins with only two players.
	return { count: 0 };
}

function getSuperRule(rule) {
	//1. Game Concepts
	if (rule.number.length === 2) {
		return false;
	}
	//100. General
	if (rule.number.length === 4) {
		return comprehensiveRules.rules[rule.number[0]];
	}
	//100.1. These Magic rules apply to any Magic game with two or more players, including two-player games and multiplayer games.
	if (rule.number.endsWith('.')) {
		return comprehensiveRules.rules[rule.number.slice(0, 3)];
	}
	//100.1a A two-player game is a game that begins with only two players.
	return comprehensiveRules.rules[rule.number.slice(0, -1).replace(/\./g, '')];
}

function parseComprehensiveRules(fullRulesText) {
	return new Promise(function (resolve, reject) {
		//Some symbols aren't downloaded properly and are displayed as �, so replace them with what they were supposed to be
		//affected symbols are "smart" quotes (“ ” ’) as well as things like ™ symbols
		//FIXME: This incorrectly converts some single quotes to double quotes, for example quotes inside quotes.
		fullRulesText = fullRulesText.replace(/�(?=(?:d|ll|re|s|t|ve))/g, '\'').replace(/�(?=(?: block| booster| card reference| expansion| set))/g, '™').replace(/�/g, '"');
		
		var rulesStart = fullRulesText.indexOf('Credits') + 11; // 11 = 'Credits\r\n\r\n'
		var rulesEnd = fullRulesText.indexOf('Glossary', rulesStart) - 4; // 4 = '\r\n\r\n'
		var glossaryStart = rulesEnd + 16; // 16 = '\r\n\r\nGlossary\r\n\r\n'
		var glossaryEnd = fullRulesText.indexOf('Credits', glossaryStart) - 6; // 6 = '\r\n\r\n\r\n'

		//parse rules
		var rules = {};
		var rulesText = fullRulesText.slice(rulesStart, rulesEnd).replace(/\r\n\r\n\r\n/g, '\r\n\r\n').split('\r\n\r\n');
		for (var item of rulesText) {
			var number = item.slice(0, item.indexOf(' '));
			var text = item.slice(item.indexOf(' ') + 1);
			rules[number.toLowerCase().replace(/\./g, '')] = {
				number: number,
				text: text
			};
		}
		comprehensiveRules.rules = rules;

		//parse glossary
		var glossary = {};
		var glossaryText = fullRulesText.slice(glossaryStart, glossaryEnd).split('\r\n\r\n');
		for (var item of glossaryText) {
			var term = item.slice(0, item.indexOf('\r\n'));
			var text = item.slice(item.indexOf('\r\n') + 2);
			glossary[term.toLowerCase()] = {
				term: term,
				text: text
			};
		}
		comprehensiveRules.glossary = glossary;

		resolve(true);
	});
}
