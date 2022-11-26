const { DiscordApi } = require('./discordapi');
const fs = require('fs');

let config = {}

const defaultConfig = {
    token: ''
};

if (!fs.existsSync('config.json')) {
    console.log('config.json doesn\'t exist, creating it');
    fs.writeFileSync('config.json', JSON.stringify(defaultConfig, undefined, 2));
    config = JSON.parse(JSON.stringify(defaultConfig));
} else {
    try {
        config = JSON.parse(fs.readFileSync('config.json'));
    } catch(e) {
        console.log('config.json isn\'t valid JSON!');
        process.exit(1);
    }
}

if (!config.token) {
    console.log('You need to put your discord token to config.json.');
    process.exit(1);
}

const api = new DiscordApi(config.token);

api.addMessageListener((json) => {
    if (json.op !== 0 || json.t !== 'MESSAGE_CREATE')
        return;

    if (json.d.author.id != '294882584201003009') // GiveawayBot
        return;

    if (json.d.components.length != 0) {
        const component = json.d.components[0];
    }
});