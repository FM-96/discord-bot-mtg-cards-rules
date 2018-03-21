module.exports.makeCardEmbed = makeCardEmbed;
module.exports.makeErrorEmbed = makeErrorEmbed;
module.exports.makeRuleEmbed = makeRuleEmbed;

const client = require('./client.js');

const botVersion = process.env.npm_package_version ? process.env.npm_package_version : require('./package.json').version;

function makeCardEmbed(data, extended) {
	const embed = {
		title: data.title,
		type: 'rich',
		url: 'https://mtg.wtf/card?q=!' + encodeURIComponent(data.title),
		footer: {
			text: client.user.username + ' | v' + botVersion,
			icon_url: client.user.avatarURL,
		},
		image: {
			url: data.image,
		},
		fields: [],
	};

	if (data.colors.length > 1) {
		embed.color = 0xECD57A;
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
		inline: true,
	});

	embed.fields.push({
		name: 'CMC',
		value: String(data.cmc),
		inline: true,
	});

	embed.fields.push({
		name: 'Color(s) / Color Identity',
		value: data.colors + ' / ' + data.ci,
		inline: true,
	});

	let mainText = '';
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
		inline: false,
	});

	if (extended) {
		embed.fields.push({
			name: 'Legalities',
			value: data.legalities,
			inline: true,
		});
	}

	if (data.otherparts) {
		let parts = '';
		for (const part of data.otherparts) {
			parts += '[' + part + '](https://mtg.wtf/card?q=!' + encodeURIComponent(part) + ')\n';
		}
		embed.fields.push({
			name: data.otherparts.length === 1 ? 'Other Part' : 'Other Parts',
			value: parts,
			inline: true,
		});
	}

	if (extended) {
		let usedCharacters = 0;
		for (const field of embed.fields) {
			usedCharacters += field.name.length + String(field.value).length;
		}

		if (data.rulings) {
			let rulingsText = '';
			for (let i = 0; i < data.rulings.length; ++i) {
				// check if the next ruling still fits in the message and if not, make a [x more] link
				// Note: I originally thought the character limit is 2000, but this is apparently incorrect. The number below (1200) was found through trial and error
				const rulingLength = data.rulings[i].date.length + data.rulings[i].text.length + 6;
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
				inline: false,
			});
		}
	}

	return embed;
}

function makeErrorEmbed(error, match, type) {
	const embed = {
		title: 'Error',
		type: 'rich',
		description: `*${type}: ${match}*\n${error.message}`,
		color: 0x00FFFF,
		footer: {
			text: client.user.username + ' | v' + botVersion,
			icon_url: client.user.avatarURL,
		},
	};

	return embed;
}

function makeRuleEmbed(data) {
	const embed = {
		type: 'rich',
		color: 0xAD42F4,
		footer: {
			text: client.user.username + ' | v' + botVersion,
			icon_url: client.user.avatarURL,
		},
		image: {
			url: data.image,
		},
		fields: [],
	};

	embed.description = '';

	if (data.type === 'glossary') {
		let usedCharacters = 0;
		embed.title = 'Glossary';
		for (const item of data.content) {
			if (usedCharacters + item.term.length + item.text.length + 7 <= 1200) {
				usedCharacters += item.term.length + item.text.length + 7;
				embed.description += '**' + item.term + '**\n' + item.text + '\n\n';
			} else {
				embed.description += '*(' + (data.content.length - data.content.indexOf(item)) + ' more matching entries, be more specific.)*';
				break;
			}
		}
	} else if (data.type === 'rule') {
		embed.title = 'Comprehensive Rules';
		for (const item of data.content) {
			embed.description += '**' + item.number + '** ' + item.text + '\n\n';
		}
		if (data.nav) {
			const navField = {
				name: 'Navigation',
				value: '',
			};

			navField.value += data.nav.siblings.list.map((e, i) => (data.nav.siblings.position === i ? `**${e.number}**` : e.number)).join(' - ') + '\n\n';

			if (data.nav.subrules.count > 0) {
				navField.value += data.nav.subrules.list.map(e => e.number).join(' - ') + '\n\n';
			}

			embed.fields.push(navField);
		}
	}

	return embed;
}
