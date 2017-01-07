module.exports.fetchCard = fetchCard;
module.exports.fetchRule = fetchRule;

var cheerio = require('cheerio');

var http = require('http');
var https = require('https');

function fetchCard(cardName) {
	//get result from https://mtg.wtf/
	return new Promise(function (resolve, reject) {
		https.request({
			hostname: 'mtg.wtf',
			path: '/card?q=!' + cardName.toLowerCase().replace(/ /g, '%20')
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
			cardObject.colors = getColors(cardObject.cost);
			cardObject.types = $('.typeline').text().trim();
			if ($('.oracle').length) {
				$('.oracle').html($('.oracle').html().replace(/\s*<br>\s*/g, '\n\n'));
				cardObject.oracle = $('.oracle').text().trim();
			}
			cardObject.ci = getCi(cardObject.colors, cardObject.oracle);
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
			var otherpart = $.text().match(/Card has other part:\s+([^\n.]+)/);
			if (otherpart) {
				cardObject.otherpart = otherpart[1];
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

			return cardObject;
		}
	);
}

function fetchRule(rule) {
	//TODO
}

function getCi(cardColors, oracleText) {
	var ci = 'C';
	if (cardColors.includes('W') || (oracleText && oracleText.match(/\{W\}/))) {
		ci += 'W';
	}
	if (cardColors.includes('U') || (oracleText && oracleText.match(/\{U\}/))) {
		ci += 'U';
	}
	if (cardColors.includes('B') || (oracleText && oracleText.match(/\{B\}/))) {
		ci += 'B';
	}
	if (cardColors.includes('R') || (oracleText && oracleText.match(/\{R\}/))) {
		ci += 'R';
	}
	if (cardColors.includes('G') || (oracleText && oracleText.match(/\{G\}/))) {
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
	var genericCosts = manacost.match(/\{([0-9]+)\}/);
	if (genericCosts) {
		cmc += Number(genericCosts[1]);
	}
	return cmc;
}

function getColors(manacost) {
	var colors = 'C';
	if (manacost.includes('W')) {
		colors += 'W';
	}
	if (manacost.includes('U')) {
		colors += 'U';
	}
	if (manacost.includes('B')) {
		colors += 'B';
	}
	if (manacost.includes('R')) {
		colors += 'R';
	}
	if (manacost.includes('G')) {
		colors += 'G';
	}
	if (colors.length > 1) {
		colors = colors.slice(1);
	}
	return colors;
}
