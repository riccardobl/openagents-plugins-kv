import getRandomValues from 'polyfill-crypto.getrandomvalues';
global.crypto = { getRandomValues: getRandomValues };
global.globalThis = global;
global.frames = global;
global.self = global;
global.window = global;
global.crypto = { getRandomValues: require('polyfill-crypto.getrandomvalues') };