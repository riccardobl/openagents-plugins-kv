
# Key-Value storage for OpenAgents
A Key-Value storage plugin for [OpenAgents](https://openagents.com/) that is eventually-consistent on nostr using [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md)
It can be used to store agent states, send data between agents or agent instances, or even to communicate with external services on nostr.

API calls need to specify a kvprovider, that is a  [nostr-kv](https://github.com/riccardobl/nostr-kv) instance, used to communicate with the nostr network.
nostr-kv instances serve as a bridge and cache to reduce strain on the nostr relays, agents can use any nostr-kv instance (self hosted or public) and as long as they specify the same set of nostr relays they will eventually sync with each other through the nostr network.

Event validation and signing happens on the plugin side, so the trust on the kvprovider is minimized.


# Build
```bash
npm run build
```

# Example
Check [API](#API) for more details on the actions and their parameters.



1. Create a nostr public/private key pair
We can use [this tool](https://nostrtool.com/) for testing purposes
```
Nostr private key (hex): b2ad483c219271e3468096711fe12caf6c1b5ecebfb7e141d8d64a6a7ec81e1e
Nostr public key (hex): d545d5c59786ae5b62cee15947d6595a941e4932b1b4fa02f63ea9f88858cfa1
```
2. Set a value
```bash
extism call plugin.wasm run --input '{
  "action":"set", 
  "kvprovider":"https://nostr.rblb.it:7778",
  "key":"ThisIsATest", 
  "value":"123", 
  "expireAfter": 60000,
  "relays":["wss://nostr.rblb.it:7777"],
  "authorPriv":"b2ad483c219271e3468096711fe12caf6c1b5ecebfb7e141d8d64a6a7ec81e1e"
}' --wasi --allow-host '*'
```

3. Get the value
```jsonc
extism call plugin.wasm run --input '{
  "action":"get", 
  "kvprovider":"https://nostr.rblb.it:7778",
  "key":"ThisIsATest", 
  "relays":["wss://nostr.rblb.it:7777"],
  "authors":["d545d5c59786ae5b62cee15947d6595a941e4932b1b4fa02f63ea9f88858cfa1"]
}' --wasi --allow-host '*'
```




# API
*Note: public and private keys are specified as hex strings, not as [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) keys.*
*Note2: The `npm run start` wrapper can be used in place of `extism call dist/plugin.wasm run --input "$JSON" --wasi --allow-host '*'` on linux hosts.*

## SET
Set a value for a key and propagate the key-value pair to the nostr network.
It is possible to specify an `authorPriv` to sign the event, if not specified a new key will be generated.
It is a good idea to use known private keys shared between agents to be used to filter result in the GET action.

```jsonc
JSON='
{
  "action":"set", 
  "kvprovider":"https://nostr.rblb.it:7778", // url to the nostr-kv instance
  "key":"testKey", // the key
  "value":"testValue", // the value 
  "expireAfter": 60000, // optional: the key-value pair will be deleted after this time in ms
  "relays":["wss://nostr.rblb.it:7777"], // the nostr relays to use for finalization
  "authorPriv":"", // optional: the private key of the author, if not specified a new key will be generated
}' npm run start
```
### Result
```jsonc
{
  "status": true, // true if the request was accepted
  "submissionIds": [ // one id per relay in the same order as the relays array , can be used to check the propagation status in CHECK
    "ZTQwYjIzMGU4NDhlNDMxMzI0MTJjNGE1MTA4ZjcwOTU0ZGFhOGRiYWZiODhjYjU2NzNiMzcyNjlkNTk0MTc0YkB3c3M6Ly9ub3N0ci5yYmxiLml0Ojc3Nzc=" 
  ],
  "authorPriv": "???", // the private key of the author
  "author": "46efb3fc36c26c18113479659a6b7890530950692b3acb5554e21c0bf631489a", // the author public key
  "key": "testKey", // the key of the key-pair
  "value": "testValue", // the value of the key-pair
  "_banner": "Self hosted nostr-kv instance", // custom server info
  "_ip": "::ffff:127.0.0.1" // custom server info
  // ... other custom server info
}
```

## CHECK

Check the propagation status of a key-value pair in the nostr network.

```jsonc
JSON='
{
  "action":"check",
  "kvprovider":"https://nostr.rblb.it:7778", //  url to the nostr-kv instance
  "submissionIds":[ // the submission ids to check
    "OTlhNTNmY2IzMWYzNjhjMjM1NTFlNGQ2MzllN2ZjOTg4YWM0NGNiMzA3MjdlYzc3OGE2MTIxM2U0ODg1YzI1N0B3c3M6Ly9ub3N0ci5yYmxiLml0Ojc3Nzc="
  ]   
}' npm run start
```

### Result
```jsonc
[ // array of status
    "success or expired"
]
```
The array contains the statuses for each submissionIds in the same order as the submissionIds array in the request.
The status can be:
- "sucess or expired": the key-value pair was successfully propagated to the network or the request failed several minutes ago and was deleted
- "failed": the key-value propagation failed
- "pending": the key-value pair is still being propagated


## GET

Get a value for a key from the kvprovided if available, otherwise from the nostr network.
If `authors` is unspecified or contains the wildcard "*" all authors will be considered.
Note: everyone can write to the same key, so if the data needs to be somewhat trusted it is a good idea to specify a list of author public keys using the `authors` field so that only events signed by the specified authors will be considered, alternatively a custom validation logic can be implemented on the agent side using the history field in the result.

```jsonc
JSON='
{
    "action":"get",
    "kvprovider":"https://nostr.rblb.it:7778", //  url to the nostr-kv instance
    "key":"testKey", // the key to get the value for
    "authors":["*"], // optional: an array of author public keys to filter the key-value pairs by, leave it empty or use the wildcard "*" for all authors.
    "maxHistory":10, // optional: the maximum number of old values to return, note: only the most recent value is kept for each author
    "relays":["wss://nostr.rblb.it:7777"], // the nostr relays to query 
}' npm run start
```


### Result
```jsonc
{
  "key": "testKey", // the key of the key-value pair
  "value": "testValue", // the value of the key-value pair
  "author": "9c1a523e79f4984c6103022bc7f5c57e6fe6faf932e29588a69fbbeb37791662", // the author public key
  "timestamp": 1711051487000, // the timestamp of the key-value pair event
  "localTimestamp": 1711051523218, // the timestamp of when the kvprovider received the key-value pair event
  "history": [ // an array of old states of the key-value pair, from newer to older. Note only one state per key per author is kept
    // {
    //     "key": "", 
    //     "value": "", 
    //     "author": "", 
    //     "timestamp": 1711051487000, 
    //     "localTimestamp": 1711051523218, event
    // }
  ]
}
```
