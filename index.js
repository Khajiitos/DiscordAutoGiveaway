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