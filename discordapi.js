const WS = require('ws');
const config = require('./config');
const zlib = require('zlib');

const websocketUrl = 'wss://gateway.discord.gg';
const webSocketGetParams = `/?v=9&encoding=json${config.useCompression ? '&compress=zlib-stream' : ''}`;

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
    heartbeatInterval = null;
    heartbeat_interval = null;
    lastHeartbeatAcknowledged = true;
    heartbeatNotAcknowledgedTimeout = null;
    resume_gateway_url = null;
    resumeNotAcknowledgedTimeout = null;
    resumeRetryDelay = 30;
    messageListeners = [];
    connectRetryDelay = 10;
    connectRetryTimeout = null;
    inflator = null;
    bytes = [];
    inflateOutput = '';
    closeIntented = false;

    constructor(token) {
        this.token = token;
        this.initWebsocket(false);
    }

    initWebsocket(resume = false) {
        resume = false; // TEST
        this.closeIntented = false;

        if (config.useCompression) {
            this.inflator = zlib.createInflate();
            this.inflator.setEncoding('utf-8');
            this.inflator.on('data', (data) => {
                this.inflateOutput += data;
                try {
                    this.onMessage(JSON.parse(this.inflateOutput));
                    this.inflateOutput = '';
                } catch(e) {
                    // Incomplete message
                    // Even though we get an incomplete message from Discord, it still ends with 0x00 0x00 0xFF 0xFF for some reason?
                    // Also this is stupid as we're running a lot more JSON.parses
                }
            });
        }
        
        this.websocket = new WS.WebSocket((resume === true ? this.resume_gateway_url : websocketUrl) + webSocketGetParams);

        this.websocket.on('open', () => {
            this.logApi('Opened WebSocket');
        });

        this.websocket.on('error', () => {

        });

        this.websocket.on('close', code => {
            this.close();

            if (!this.closeIntented) {
                this.logApi(`Abnormal disconnection detected. Attempting to reconnect in ${this.connectRetryDelay} seconds.`);
                clearTimeout(this.connectRetryTimeout);
                this.connectRetryTimeout = setTimeout(() => {
                    this.initWebsocket(true);
                    this.connectRetryDelay += 10;
                }, this.connectRetryDelay * 1000);
            }
        });

        this.websocket.on('message', message => {
            if (!config.useCompression) {
                this.onMessage(JSON.parse(message));
                return;
            }
            this.bytes = [...this.bytes, ...Uint8Array.from(message)];
            if (message.byteLength > 4 &&
                message[message.byteLength - 4] === 0x00 &&
                message[message.byteLength - 3] === 0x00 &&
                message[message.byteLength - 2] === 0xFF &&
                message[message.byteLength - 1] === 0xFF) {
                this.inflator.write(Buffer.from(this.bytes));
                this.bytes = [];
            }
        });
    }

    onMessage(json) {
        switch (json.op) {
            case 10: // HELLO
                this.heartbeat_interval = json.d.heartbeat_interval;
                this.initHeartbeatLoop();
                this.sendIdentify();
                break;
            case 11: // HEARTBEAT_ACK
                clearTimeout(this.heartbeatNotAcknowledgedTimeout);
                this.lastHeartbeatAcknowledged = true;
                break;
            case 9: // INVALID_SESSION
                this.logApi('Invalid Session. Trying to reconnect and reidentify.');
                this.close();
                this.initWebsocket(false);
                break;
            case 7: // RECONNECT
                this.logApi('Discord wants us to reconnect.');
                this.close();
                this.initWebsocket(true);
                break;
            case 0: // DISPATCH
                if (config.printDispatch && !config.printDispatchExceptions.some(t => t === json.t)) {
                    console.log(json);
                }
                if (json.t === 'READY') {
                    this.logApi(`Ready, connected as ${json.d.user.username + '#' + json.d.user.discriminator}`);
                    this.session_id = json.d.session_id;
                    this.resume_gateway_url = json.d.resume_gateway_url;
                } else if (json.t === 'RESUMED') {
                    clearTimeout(this.resumeNotAcknowledgedTimeout);
                    this.logApi('Last session resumed successfully.')
                }
                break;
        }
        this.messageListeners.forEach(fn => fn(json));
    }

    initHeartbeatLoop() {
        this.heartbeatTimeout = setTimeout(() => {
            this.sendHeartbeat();
            this.heartbeatInterval = setInterval(() => {
                this.sendHeartbeat();
            }, this.heartbeat_interval);
        }, Math.random() * this.heartbeat_interval);
    }

    sendHeartbeat() {
        this.lastHeartbeatAcknowledged = false;
        clearTimeout(this.heartbeatNotAcknowledgedTimeout);
        this.heartbeatNotAcknowledgedTimeout = setTimeout(() => {
            this.logApi("Last heartbeat hasn't been acknowledged in 15 seconds. Reconnecting.");
            this.close();
            this.initWebsocket(true);
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
        this.closeIntented = true;
        clearTimeout(this.heartbeatTimeout);
        clearInterval(this.heartbeatInterval);
        clearTimeout(this.heartbeatNotAcknowledgedTimeout);
        clearTimeout(this.resumeNotAcknowledgedTimeout);
        this.websocket.removeAllListeners('message');
        if (config.useCompression) {
            this.inflator.close();
            this.bytes = [];
            this.inflateOutput = '';
        }
        if (this.websocket.readyState === 1)
            this.websocket.close(1000);
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
            this.logApi(`Tried to resume, but we didn't get a response. Connection error? Trying again in ${this.resumeRetryDelay} seconds.`);
            this.resume();
            this.resumeRetryDelay += 30;
        }, this.resumeRetryDelay * 1000);
    }

    addMessageListener(fn) {
        this.messageListeners.push(fn);
    }

    log(text) {
        const date = new Date();
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');
        const second = date.getSeconds().toString().padStart(2, '0');
        console.log(`[${hour + ':' + minute + ':' + second}] ${text}`);
    }

    logApi(text) {
        const date = new Date();
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');
        const second = date.getSeconds().toString().padStart(2, '0');
        console.log(`[Discord API - ${hour + ':' + minute + ':' + second}] ${text}`);
    }
}

module.exports = { DiscordApi };
