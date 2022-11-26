const WS = require('ws');

const websocketUrl = 'wss://gateway.discord.gg';
const webSocketGetParams = '/?v=9&encoding=json';

const defaultIdentifySettings = {
    op: 2,
    d: {
        properties: {
            os: 'Windows',
            browser: 'Chrome',
            device: ''
        },
        compress: false,
        presence: {
            status: 'offline',
            since: 0,
            afk: false, 
            activities: []
        },
        client_state: {
            guild_versions:	{},
            highest_last_message_id: "0",
            read_state_version:	0,
            user_guild_settings_version: -1,
            user_settings_version: -1,
            private_channels_version: "0",
            api_code_version: 0
        },
        capabilities: 4093
    }
}

class DiscordApi {
    token = null;
    seq = null;
    websocket = null;
    session_id = null;
    heartbeatTimeout = null;
    heartbeat_interval = null;
    lastHeartbeatAcknowledged = true;
    heartbeatNotAcknowledgedTimeout = null;
    resume_gateway_url = null;
    resumeNotAcknowledgedTimeout = null;
    resumeRetryDelay = 30;

    constructor(token) {
        this.token = token;
        this.initWebsocket(false);
    }

    initWebsocket(resume = false) {
        this.websocket = new WS.WebSocket((resume === true ? this.resume_gateway_url : websocketUrl) + webSocketGetParams);

        this.websocket.on('open', () => {
            console.log('[Discord API] Opened WebSocket');
        });

        this.websocket.on('close', code => {
            console.log('[Discord API] WebSocket closed. Code: %d', code);
            this.close();
        })

        this.websocket.on('message', message => {
            const json = JSON.parse(message);

            switch (json.op) {
                case 10: // HELLO
                    this.heartbeat_interval = json.heartbeat_interval;
                    this.initHeartbeatLoop();
                    if (resume) {
                        this.resume();
                    } else {
                        this.sendIdentify();
                    }
                    break;
                case 11: // HEARTBEAT_ACK
                    clearTimeout(this.heartbeatNotAcknowledgedTimeout);
                    this.lastHeartbeatAcknowledged = true;
                    break;
                case 9: // INVALID_SESSION
                    console.log('[Discord API] Invalid Session');
                    break;
                case 7: // RECONNECT
                    console.log('[Discord API] Discord wants us to reconnect.');
                    this.close();
                    this.initWebsocket();
                    break;
                case 0:
                    if (json.t === 'READY') {
                        console.log('[Discord API] Ready, connected as %s#%s', json.d.user.username, json.d.user.discriminator);
                        this.session_id = json.d.session_id;
                        this.resume_gateway_url = json.d.resume_gateway_url;
                    }
                    break;
            }
        });
    }

    initHeartbeatLoop() {
        this.heartbeatTimeout = setTimeout(() => {
            this.sendHeartbeat();
            this.heartbeatTimeout = setTimeout(() => {
                this.sendHeartbeat();
            }, this.heartbeat_interval);
        }, Math.random() * this.heartbeat_interval);
    }

    sendHeartbeat() {
        this.lastHeartbeatAcknowledged = false;
        this.heartbeatNotAcknowledgedTimeout = setTimeout(() => {
            
            console.log("[Discord API] Last heartbeat hasn't been acknowledged in 15 seconds. Connection problems?");
        }, 15000);
        this.websocket.send(JSON.stringify({
            op: 1,
            d: this.seq
        }));
    }

    sendIdentify() {
        const identifyObject = JSON.parse(JSON.stringify(defaultIdentifySettings));
        identifyObject.d.token = this.token;
        this.websocket.send(JSON.stringify(identifyObject));
    }

    close() {
        clearTimeout(this.heartbeatTimeout);
        clearTimeout(this.heartbeatNotAcknowledgedTimeout);
        this.websocket.close();
    }

    resume() {
        this.websocket.send(JSON.stringify({
            op: 6,
            d: {
                token: this.token,
                session_id: this.session_id,
                seq: this.seq
            }
        }));

        this.resumeNotAcknowledgedTimeout = setTimeout(() => {
            console.log("[Discord API] Tried to resume, but we didn't get a response. Connection error? Trying again in %d seconds.", this.resumeRetryDelay);
            this.resume();
            this.resumeRetryDelay += 30;
        }, this.resumeRetryDelay);
    }
}

module.exports = { DiscordApi };