module.exports = {
	makeCardEmbed,
	makeErrorEmbed,
	makeRuleEmbed,
};

// https://discordapp.com/developers/docs/resources/channel#embed-limits
const EMBED_LIMIT_DESCRIPTION = 2048;
const EMBED_LIMIT_FIELD_VALUE = 1024;
const EMBED_LIMIT_TOTAL = 6000; // is that really necessary?

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

	if (extended && data.rulings) {
		let totalCharacters = 0;
		totalCharacters += embed.title.length;
		totalCharacters += embed.footer.text.length;
		for (const field of embed.fields) {
			totalCharacters += field.name.length + String(field.value).length;
		}

		const rulings = data.rulings.map(e => '**' + e.date + '** ' + e.text + '\n');
		let rulingsCharacters = 0;
		let fittingRulings = 0;
		let remainingRulingsText;

		for (let i = 0; i < rulings.length; ++i) {
			const ruling = rulings[i];
			if (rulingsCharacters + ruling.length <= EMBED_LIMIT_FIELD_VALUE && totalCharacters + rulingsCharacters + ruling.length <= EMBED_LIMIT_TOTAL) {
				// ruling fits within embed limits
				fittingRulings++;
				rulingsCharacters += ruling.length;
			} else {
				if (i === 0) {
					remainingRulingsText = '[' + rulings.length + ' rulings](https://mtg.wtf/card?q=!' + encodeURIComponent(data.title) + ')';
				} else {
					remainingRulingsText = '[' + (rulings.length - i) + ' more](https://mtg.wtf/card?q=!' + encodeURIComponent(data.title) + ')';
				}
				if (rulingsCharacters + remainingRulingsText.length > EMBED_LIMIT_FIELD_VALUE || totalCharacters + rulingsCharacters + remainingRulingsText.length > EMBED_LIMIT_TOTAL) {
					if (i === 0) {
						// not even 1 ruling fits into embed limits AND the "more rulings" link doesn't fit either
						throw new Error('Rulings don\'t fit within embed limits');
					}
					fittingRulings--;
					rulingsCharacters -= rulings[i - 1].length;
					remainingRulingsText = '[' + (rulings.length - (i - 1)) + ' more](https://mtg.wtf/card?q=!' + encodeURIComponent(data.title) + ')';
				}
				break;
			}
		}

		let rulingsText = rulings.slice(0, fittingRulings).join('');
		if (fittingRulings < rulings.length) {
			rulingsText += remainingRulingsText;
		}

		embed.fields.push({
			name: 'Rulings',
			value: rulingsText,
			inline: false,
		});
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
		embed.title = 'Glossary';

		const glossaryEntries = data.content.map(e => '**' + e.term + '**\n' + e.text + '\n\n');
		let glossaryCharacters = 0;
		let fittingEntries = 0;
		let remainingEntriesText;

		for (let i = 0; i < glossaryEntries.length; ++i) {
			const entry = glossaryEntries[i];
			if (glossaryCharacters + entry.length <= EMBED_LIMIT_DESCRIPTION) {
				// glossary entry fits within embed limits
				fittingEntries++;
				glossaryCharacters += entry.length;
			} else {
				remainingEntriesText = '*(' + (glossaryEntries.length - i) + ' more matching entries, be more specific.)*';
				if (glossaryCharacters + remainingEntriesText.length > EMBED_LIMIT_DESCRIPTION) {
					fittingEntries--;
					glossaryCharacters -= glossaryEntries[i - 1].length;
					remainingEntriesText = '*(' + (glossaryEntries.length - (i - 1)) + ' more matching entries, be more specific.)*';
				}
				break;
			}
		}

		let glossaryText = glossaryEntries.slice(0, fittingEntries).join('');
		if (fittingEntries < glossaryEntries.length) {
			glossaryText += remainingEntriesText;
		}

		embed.description = glossaryText;
	} else if (data.type === 'rule') {
		// TODO check for embed limits
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
