import "./polyfill.js";
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256';
import { schnorr } from '@noble/curves/secp256k1';
import * as JSONc from "jsonc-parser";


function createEvent(key, value, expireAfter) {
    value = JSON.stringify(value);
    const now = Date.now();
    const expiration = expireAfter ? now + expireAfter : 0;

    const eventTags = [];

    eventTags.push(["d", key]);
    if (expiration) {
        eventTags.push(["expiration", "" + Math.floor(expiration / 1000.0)]);
    }
    const event = {
        kind: 30078,
        created_at: Math.floor(now / 1000),
        tags: eventTags,
        content: value,
    };
    return event;
}


function getEventHash(evt) {
    const serializedEvt = JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
    const encoder = new TextEncoder();
    const encodedEvent = encoder.encode(serializedEvt);
    const hashedEvent = sha256(encodedEvent);
    return hashedEvent;
}

function finalizeEvent(event, sk, pk) {
    event.pubkey = bytesToHex(pk);
    event.id = bytesToHex(getEventHash(event));
    event.sig = bytesToHex(schnorr.sign(getEventHash(event), sk));
    return event;
}

function verifyEvent(event) {
    const hash = bytesToHex(getEventHash(event));
    if (hash !== event.id) {
        return false
    }
    try {
        const valid = schnorr.verify(event.sig, hash, event.pubkey)
        return valid
    } catch (err) {
        return false
    }
}

function call(kvprovider, api, method, body) {
    if(!kvprovider) throw new Error("Invalid or missing kvprovider");
    if(!api) throw new Error("Invalid or missing api");
    if(!method) throw new Error("Invalid or missing method");

    if (kvprovider.endsWith("/")) {
        kvprovider = kvprovider.slice(0, kvprovider.length - 1);
    }
    if (api.startsWith("/")) {
        api = api.slice(1);
    }
    const endpoint = kvprovider + "/" + api;
    let response = Http.request({
        method: method,
        url: endpoint,
        headers: {
            "Content-Type": "application/json",
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
        },
    }, body ? JSON.stringify(body) : undefined);
    if (response.status !== 200) throw new Error("Error submitting event " + response.status + " " + response.body);
    response = JSON.parse(response.body);
    if (response.error) throw new Error(response.error);
    return response;
}


function set(key, value, expireAfter, relays, kvprovider, privKey) {
    if(!key) throw new Error("Invalid or missing key");
    if(!kvprovider) throw new Error("Invalid or missing kvprovider");
    let event = createEvent(key, value, expireAfter);
    let sk = !privKey ? schnorr.utils.randomPrivateKey() : privKey;
    if(typeof sk === "string") {
        sk = hexToBytes(sk);
    }
    const pk = schnorr.getPublicKey(sk);
    event = finalizeEvent(event, sk, pk);
    const out = call(kvprovider, "/api/event/set", "POST", { signedEvent: event, relays });
    out.authorPriv = bytesToHex(sk);
    return out;
}

function get(key, authors, maxHistory, relays, kvprovider) {
    if(!key) throw new Error("Invalid or missing key");
    if(!authors) authors = ["*"];
    if(!maxHistory) maxHistory = 10;
    if(!kvprovider) throw new Error("Invalid or missing kvprovider");
    const _processKV = (event) => {
        const out = {
            key: undefined,
            value: undefined,
            error: undefined
        };

        if (!verifyEvent(event)) {
            out.error = "Invalid event " + JSON.stringify(event, undefined, 2);
            return out;
        }

        if (event.kind !== 30078) {
            out.error = "Invalid event kind";
            return out;
        }


        let key = event.tags.find(t => t[0] === "d");
        if (!key) {
            out.error = "Invalid event key";
            return out;
        }
        key = key[1];
        out.key = key;



        let expiration;
        const expirationTag = event.tags.find(t => t[0] === "expiration");
        if (expirationTag) expiration = Number(expirationTag[1]) * 1000;
        else expiration = 0;

        if (expiration && expiration < Date.now()) {
            out.error = "Event expired";
            return out;
        }

        out.value = JSON.parse(event.content);
        out.author = event.pubkey;
        out.timestamp = event.created_at * 1000;
        out.localTimestamp = Date.now();
        return out;
    };

    const events = call(kvprovider, "/api/event/get", "POST", { key, authors, maxHistory, relays });
    let kvs;
    if (events.signedEvent) {
        kvs = _processKV(events.signedEvent);
    } else {
        kvs = {
            key
        };
    }
    kvs.history = [];
    for (const event of events.history) {
        kvs.history.push(_processKV(event.signedEvent));
    }

    return kvs;
}


function check(submissionIds, kvprovider) {
    if(!submissionIds) throw new Error("Invalid or missing submissionIds");
    if (submissionIds.length == 0) return [];
    if(!kvprovider) throw new Error("Invalid or missing kvprovider");
    const res = call(kvprovider, "/api/propagation/check", "POST", { submissionIds });
    return res.status;
}

function run() {
    try {
        let input = Host.inputString();
        input = JSONc.parse(input);

        const action = input.action;
        switch (action) {
            case "set": {
                const out = set(input.key, input.value, input.expireAfter, input.relays, input.kvprovider, input.authorPriv);
                Host.outputString(JSON.stringify(out, undefined, 2));
                break;
            }
            case "get": {
                const out = get(input.key, input.authors, input.maxHistory, input.relays, input.kvprovider)
                Host.outputString(JSON.stringify(out, undefined, 2));
                break;
            }
            case "check": {
                const out = check(input.submissionIds, input.kvprovider)
                Host.outputString(JSON.stringify(out, undefined, 2));
                break;
            }
            case "debug": {
                const out = {};
                out.set = set("TestKey", "TestValue" + Math.random(), 60000,  ["wss://nostr.rblb.it:7777"], "http://127.0.0.1:3000")
                out.check = check([out.set.submissionId], "http://127.0.0.1:3000");
                out.get = get("TestKey", ["*"], 10, ["wss://nostr.rblb.it:7777"], "http://127.0.0.1:3000")
                Host.outputString(JSON.stringify(out, undefined, 2));
                break;
            }
            default:
                throw new Error("Invalid action " + action);
        }
    } catch (e) {
        console.error(e);
        Host.outputString(JSON.stringify({ error: e.message, stack: e.stack.toString() }));
    }
}

module.exports = { run }