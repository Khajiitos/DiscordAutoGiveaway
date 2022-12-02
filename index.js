const { DiscordApi } = require('./discordapi');
const fs = require('fs');
const https = require('https');
const config = require('./config');

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

    if (json.d.components.length === 0 || json.d.embeds.length === 0)
        return;
    
    const component = json.d.components[0].components[0];
    const embed = json.d.embeds[0];

    if (component.custom_id !== 'enter-giveaway')
        return;
    
    // TODO
    const descriptionRegex = /^Ends: <t:(\d+):R>[\S\s]*Winners: \*\*(\d+)\*\*$/g;
    const matches = embed.description.match(descriptionRegex);

    const delay = 5 + Math.floor(Math.random() * 25);
    const name = embed.title;
    api.log(`Giveaway created for ${name}! Joining it in ${delay} seconds.`);

    setTimeout(() => {

        const nonce = (Date.now() - 1420070400000) << 22; // TODO make this actually work lol

        const data = {
            type: 3,
            nonce: nonce,
            guild_id: json.d.guild_id,
            channel_id: json.d.channel_id,
            message_flags: 0,
            message_id: json.d.id,
            application_id: json.d.author.id,
            session_id: api.session_id,
            data: {
                component_type: 2,
                custom_id: 'enter-giveaway'
            }
        };

        const req = https.request({
            hostname: 'discord.com',
            method: 'POST',
            path: '/api/v9/interactions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': api.token,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
            }
        }, res => {

            if (res.statusCode === 204) {
                api.log(`Successfully joined the giveaway for ${name}.`)
            } else {
                api.log(`Couldn't join the giveaway, http response code: ${res.statusCode}`);
            }

            res.on('error', err => {
                console.error(err);
            });
        });
        req.write(JSON.stringify(data));
        req.end();
    }, delay * 1000);
});