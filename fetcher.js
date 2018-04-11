module.exports = {
	fetchCard,
	fetchGlossary,
	fetchRule,
	navigateNextRule,
	navigatePrevRule,
	navigateSubRule,
	navigateSuperRule,
};

const cheerio = require('cheerio');
const windows1252 = require('windows-1252');

const https = require('https');
const Transform = require('stream').Transform;

const RULES_UPDATE_CHECK_FREQUENCY = 86400000; // 1 day

const comprehensiveRules = {
	glossary: {},
	rules: {},
	updated: '',
	lastUpdateCheck: 0,
};

function fetchCard(cardName) {
	// get result from https://mtg.wtf/
	return new Promise(function (resolve, reject) {
		https.request({
			hostname: 'mtg.wtf',
			path: '/card?q=!' + encodeURIComponent(cardName),
		}, function (response) {
			let responseData = '';

			response.on('data', function (data) {
				responseData += data;
			});

			response.on('end', function () {
				resolve(responseData);
			});
		}).end();
	}).then(
		// parse result into object
		function (result) {
			const $ = cheerio.load(result);
			const cardObject = {};

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
			let colorIndicator = null;
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
				const loyalty = $.text().match(/Loyalty:\s+([0-9]+)/);
				if (loyalty) {
					cardObject.loyalty = loyalty[1];
				}
			}
			let $otherparts;
			$('.infolabel').each(function (i, elem) {
				if ($(this).text().includes('Card has other part')) {
					$otherparts = $(this);
					return false;
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
					const ruling = {
						date: $(this).text().trim().slice(0, 10),
						text: $(this).text().trim().slice(11), // additional whitespace after date and before ruling text
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
			const glossaryObject = {
				type: 'glossary',
				content: [],
			};

			if (comprehensiveRules.glossary[term]) {
				glossaryObject.content.push(comprehensiveRules.glossary[term]);
			}
			for (const key in comprehensiveRules.glossary) {
				if (key.includes(term) && key !== term) {
					glossaryObject.content.push(comprehensiveRules.glossary[key]);
				}
			}

			return glossaryObject;
		}
	);
}

function fetchRule(rule, nav) {
	return getComprehensiveRules().then(
		function (result) {
			const ruleObject = {
				type: 'rule',
				content: [],
			};

			if (comprehensiveRules.rules[rule]) {
				ruleObject.content.push(comprehensiveRules.rules[rule]);
				if (nav) {
					const siblings = getSubRules(getSuperRule(comprehensiveRules.rules[rule]));
					siblings.position = siblings.list.findIndex(e => e.number === comprehensiveRules.rules[rule].number);

					const subrules = getSubRules(comprehensiveRules.rules[rule]);

					const superrules = [];
					let superRule = comprehensiveRules.rules[rule];
					while ((superRule = getSuperRule(superRule))) {
						superrules.unshift(superRule);
					}

					ruleObject.nav = {
						siblings,
						subrules,
						superrules,
					};
				}
			}

			return ruleObject;
		}
	);
}

function getCi(manacost, cardColors, oracleText) {
	let ci = 'C';
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
	let cmc = 0;
	const coloredCosts = manacost.match(/\{[WUBRGC]\}/g);
	if (coloredCosts) {
		cmc += coloredCosts.length;
	}
	const phyrexianCosts = manacost.match(/\{[WUBRGC]\/P\}/g);
	if (phyrexianCosts) {
		cmc += phyrexianCosts.length;
	}
	const hybridCosts = manacost.match(/\{[WUBRGC]\/[WUBRGC]\}/g);
	if (hybridCosts) {
		cmc += hybridCosts.length;
	}
	const monocoloredHybridCosts = manacost.match(/\{[0-9]+\/[WUBRGC]\}/g);
	if (monocoloredHybridCosts) {
		for (const cost of monocoloredHybridCosts) {
			cmc += Number(cost.split('/')[0].slice(1));
		}
	}
	// halfmana from unsets
	const halfManaCosts = manacost.match(/\{H[WUBRGC]\}/g);
	if (halfManaCosts) {
		cmc += halfManaCosts.length / 2;
	}
	const genericCosts = manacost.match(/\{([0-9]+)\}/);
	if (genericCosts) {
		cmc += Number(genericCosts[1]);
	}
	return cmc;
}

function getColors(manacost, colorIndicator, oracleText) {
	let colors = 'C';

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
	if (Date.now() - comprehensiveRules.lastUpdateCheck < RULES_UPDATE_CHECK_FREQUENCY) {
		return Promise.resolve(true);
	}

	return new Promise(function (resolve, reject) {
		https.request({
			hostname: 'magic.wizards.com',
			path: '/en/game-info/gameplay/rules-and-formats/rules',
		}, function (response) {
			let responseData = '';

			response.on('data', function (data) {
				responseData += data;
			});

			response.on('end', function () {
				resolve(responseData);
			});
		}).end();
	}).then(
		function (result) {
			return new Promise(function (resolve, reject) { // I need to return a promise here because http.request is asynchronous
				const $ = cheerio.load(result);
				const rulesPath = $('a.cta[href$=".txt"]').attr('href').split('.com')[1];
				const rulesDate = /%20(.+?)\.txt$/.exec(rulesPath)[1];
				if (comprehensiveRules.updated !== rulesDate) {
					https.request({
						hostname: 'media.wizards.com',
						path: rulesPath,
					}, function (response) {
						const responseData = new Transform();

						response.on('data', function (data) {
							responseData.push(data);
						});

						response.on('end', function () {
							comprehensiveRules.updated = rulesDate;
							comprehensiveRules.lastUpdateCheck = Date.now();
							parseComprehensiveRules(windows1252.decode(responseData.read().toString('binary')));
							resolve(true);
						});
					}).end();
				} else {
					comprehensiveRules.lastUpdateCheck = Date.now();
					resolve(true);
				}
			});
		}
	);
}

function getSubRules(rule) {
	// false (= return top-level rules)
	if (rule === false) {
		let count = 0;
		let start = false;
		let end = false;
		const list = [];
		for (;;) {
			count++;
			const nextRule = String(count);
			if (comprehensiveRules.rules[nextRule]) {
				list.push(comprehensiveRules.rules[nextRule]);
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
			end: end,
			list: list,
		};
	}
	// 1. Game Concepts
	if (rule.number.length === 2) {
		let count = 0;
		let start = false;
		let end = false;
		const list = [];
		for (;;) {
			count++;
			const nextRule = String((Number(rule.number[0]) * 100) + (count - 1));
			if (comprehensiveRules.rules[nextRule]) {
				list.push(comprehensiveRules.rules[nextRule]);
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
			end: end,
			list: list,
		};
	}
	// 100. General
	if (rule.number.length === 4) {
		let count = 0;
		let start = false;
		let end = false;
		const list = [];
		for (;;) {
			count++;
			const nextRule = rule.number.slice(0, 3) + count;
			if (comprehensiveRules.rules[nextRule]) {
				list.push(comprehensiveRules.rules[nextRule]);
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
			end: end,
			list: list,
		};
	}
	// 100.1. These Magic rules apply to any Magic game with two or more players, including two-player games and multiplayer games.
	if (rule.number.endsWith('.')) {
		let count = 0;
		let start = false;
		let end = false;
		const list = [];
		const subletters = '.abcdefghijkmnpqrstuvwxyz';
		for (;;) {
			count++;
			const nextRule = rule.number.replace(/\./g, '') + subletters[count];
			if (comprehensiveRules.rules[nextRule]) {
				list.push(comprehensiveRules.rules[nextRule]);
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
			end: end,
			list: list,
		};
	}
	// 100.1a A two-player game is a game that begins with only two players.
	return {count: 0};
}

function getSuperRule(rule) {
	// 1. Game Concepts
	if (rule.number.length === 2) {
		return false;
	}
	// 100. General
	if (rule.number.length === 4) {
		return comprehensiveRules.rules[rule.number[0]];
	}
	// 100.1. These Magic rules apply to any Magic game with two or more players, including two-player games and multiplayer games.
	if (rule.number.endsWith('.')) {
		return comprehensiveRules.rules[rule.number.slice(0, 3)];
	}
	// 100.1a A two-player game is a game that begins with only two players.
	return comprehensiveRules.rules[rule.number.slice(0, -1).replace(/\./g, '')];
}

async function navigateNextRule(rule) {
	await getComprehensiveRules();
	const siblings = getSubRules(getSuperRule(comprehensiveRules.rules[rule]));
	siblings.position = siblings.list.findIndex(e => e.number === comprehensiveRules.rules[rule].number);
	if (siblings.position === siblings.count - 1) {
		return false;
	}
	return fetchRule(siblings.list[siblings.position + 1].number.replace(/\./g, ''), true);
}

async function navigatePrevRule(rule) {
	await getComprehensiveRules();
	const siblings = getSubRules(getSuperRule(comprehensiveRules.rules[rule]));
	siblings.position = siblings.list.findIndex(e => e.number === comprehensiveRules.rules[rule].number);
	if (siblings.position === 0) {
		return false;
	}
	return fetchRule(siblings.list[siblings.position - 1].number.replace(/\./g, ''), true);
}

async function navigateSubRule(rule) {
	await getComprehensiveRules();
	const subrules = getSubRules(comprehensiveRules.rules[rule]);
	if (subrules.count === 0) {
		return false;
	}
	return fetchRule(subrules.list[0].number.replace(/\./g, ''), true);
}

async function navigateSuperRule(rule) {
	await getComprehensiveRules();
	const superRule = getSuperRule(comprehensiveRules.rules[rule]);
	if (!superRule) {
		return false;
	}
	return fetchRule(superRule.number.replace(/\./g, ''), true);
}

function parseComprehensiveRules(fullRulesText) {
	const unixLeRulesText = fullRulesText.replace(/\r\n/g, '\n');
	const rulesStart = unixLeRulesText.indexOf('Credits') + 9; // 9 = 'Credits\n\n'
	const rulesEnd = unixLeRulesText.indexOf('Glossary', rulesStart) - 2; // 2 = '\n\n'
	const glossaryStart = rulesEnd + 12; // 12 = '\n\nGlossary\n\n'
	const glossaryEnd = unixLeRulesText.indexOf('Credits', glossaryStart) - 3; // 3 = '\n\n\n'

	// parse rules
	const rules = {};
	const rulesText = unixLeRulesText.slice(rulesStart, rulesEnd).replace(/\n +\n/g, '\n\n').replace(/\n\n\n/g, '\n\n').replace(/\nExample: /g, '\n__Example:__ ').split('\n\n');
	for (const item of rulesText) {
		const number = item.slice(0, item.indexOf(' '));
		const text = item.slice(item.indexOf(' ') + 1);
		rules[number.toLowerCase().replace(/\./g, '')] = {
			number: number,
			text: text,
		};
	}
	comprehensiveRules.rules = rules;

	// parse glossary
	const glossary = {};
	const glossaryText = unixLeRulesText.slice(glossaryStart, glossaryEnd).replace(/\n +\n/g, '\n\n').split('\n\n');
	for (const item of glossaryText) {
		const term = item.slice(0, item.indexOf('\n'));
		const text = item.slice(item.indexOf('\n') + 1);
		glossary[term.toLowerCase()] = {
			term: term,
			text: text,
		};
	}
	comprehensiveRules.glossary = glossary;
}
