module.exports.makeCardEmbed = makeCardEmbed;
module.exports.makeRuleEmbed = makeRuleEmbed;

var client = require('./client.js');

function makeCardEmbed(data) {
	var embed = {
		title: data.title,
		type: 'rich',
		url: 'https://mtg.wtf/card?q=!' + encodeURIComponent(data.title),
		footer: {
			text: client.user.username + ' | v' + (process.env.npm_package_version || require('./package.json').version),
			icon_url: client.user.avatarURL
		},
		fields: []
	};

	if (data.colors.length > 1) {
		embed.color = 0xECD57a;
	} else {
		if (data.colors === 'W') {
			embed.color = 0xFFFFDD;
		} else if (data.colors === 'U') {
			embed.color = 0x378BC6;
		} else if (data.colors === 'B') {
			embed.color = 0x161616;
		} else if (data.colors === 'R') {
			embed.color = 0xAF1D1D;
		} else if (data.colors === 'G') {
			embed.color = 0x5BD387;
		}
	}

	embed.fields.push({
		name: 'Mana Cost',
		value: data.cost,
		inline: true
	});

	embed.fields.push({
		name: 'CMC',
		value: String(data.cmc),
		inline: true
	});

	embed.fields.push({
		name: 'Color(s) / Color Identity',
		value: data.colors + ' / ' + data.ci,
		inline: true
	});

	var mainText = '';
	if (data.oracle) {
		mainText += data.oracle;
	}
	if (data.flavor) {
		if (mainText) {
			mainText += '\n\n';
		}
		mainText += '*' + data.flavor + '*';
	}
	if (data.pt) {
		if (mainText) {
			mainText += '\n\n';
		}
		mainText += '**' + data.pt.replace(/\*/g, '\\*') + '**';
	}
	if (data.loyalty) {
		if (mainText) {
			mainText += '\n\n';
		}
		mainText += '**' + data.loyalty + '**';
	}
	if (!mainText) {
		mainText = '*(No rules text.)*';
	}
	embed.fields.push({
		name: data.types,
		value: mainText,
		inline: false
	});

	embed.fields.push({
		name: 'Legalities',
		value: data.legalities,
		inline: true
	});

	if (data.otherparts) {
		var parts = '';
		for (var part of data.otherparts) {
			parts += '[' + part + '](https://mtg.wtf/card?q=!' + encodeURIComponent(part) + ')\n';
		}
		embed.fields.push({
			name: data.otherparts.length === 1 ? 'Other Part' : 'Other Parts',
			value: parts,
			inline: true
		});
	}

	var usedCharacters = 0;
	for (var field of embed.fields) {
		usedCharacters += field.name.length + String(field.value).length;
	}

	if (data.rulings) {
		var rulingsText = '';
		for (var i = 0; i < data.rulings.length; ++i) {
			//check if the next ruling still fits in the message and if not, make a [x more] link
			//Note: I originally thought the character limit is 2000, but this is apparently incorrect. The number below (1200) was found through trial and error
			var rulingLength = data.rulings[i].date.length + data.rulings[i].text.length + 6;
			if (usedCharacters + rulingLength <= 1200) {
				usedCharacters += rulingLength;
				rulingsText += '**' + data.rulings[i].date + '** ' + data.rulings[i].text + '\n';
			} else {
				if (i === 0) {
					rulingsText += '[' + data.rulings.length + ' rulings](https://mtg.wtf/card?q=!' + encodeURIComponent(data.title) + ')';
				} else {
					rulingsText += '[' + (data.rulings.length - i) + ' more](https://mtg.wtf/card?q=!' + encodeURIComponent(data.title) + ')';
				}
				break;
			}
		}
		embed.fields.push({
			name: 'Rulings',
			value: rulingsText,
			inline: false
		});
	}

	return embed;
}

function makeRuleEmbed(data) {
	//TODO
}
