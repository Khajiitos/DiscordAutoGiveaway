const fs = require('fs');

let config = {};

const defaultConfig = {
    token: '',
    printDispatch: false,
    printDispatchExceptions: [],
    useCompression: true
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
    let hadFieldsMissing = false;
    for (const field in defaultConfig) {
        if (typeof config[field] === 'undefined') {
            config[field] = defaultConfig[field];
            hadFieldsMissing = true;
        }
    }
    if (hadFieldsMissing)
        fs.writeFileSync('config.json', JSON.stringify(config, undefined, 2));
}

module.exports = config;