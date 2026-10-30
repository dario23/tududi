'use strict';

const axios = require('axios');
const dns = require('dns');
const http = require('http');
const https = require('https');
const { getConfig } = require('../../config/config');
const {
    UnsafeUrlError,
    assertSafeUrl,
    isLinkLocalIp,
    isPrivateOrReservedIp,
} = require('../url/ssrfGuard');

const TIMEOUT_MS = 10000;
const MAX_MESSAGE_LENGTH = 4000;
// ntfy's own rule for topic names.
const TOPIC_PATTERN = /^[-_A-Za-z0-9]{1,64}$/;

class NtfyError extends Error {}

const allowPrivateHosts = () => !!getConfig().ntfy?.allowPrivateHosts;

// Splits "https://ntfy.example.com/sub/path/my-topic" into the server
// ("https://ntfy.example.com/sub/path/") and the topic ("my-topic"), so the
// message can be published as JSON, which carries UTF-8 titles safely.
function parseTopicUrl(urlLike) {
    let parsed;
    try {
        parsed = new URL(String(urlLike).trim());
    } catch {
        throw new NtfyError(
            'Enter the full topic address, like https://ntfy.sh/my-topic'
        );
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new NtfyError('The topic address must start with https://');
    }
    if (parsed.username || parsed.password) {
        throw new NtfyError(
            'Put the access token in its own field, not in the address'
        );
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const topic = segments.pop();
    if (!topic || !TOPIC_PATTERN.test(topic)) {
        throw new NtfyError(
            'The address must end in a topic name made of letters, numbers, - or _'
        );
    }
    const prefix = segments.length ? `/${segments.join('/')}` : '';
    return {
        topicUrl: `${parsed.origin}${prefix}/${topic}`,
        serverUrl: `${parsed.origin}${prefix}/`,
        topic,
    };
}

// Resolves at connect time, so a host cannot pass the check below and then
// answer with a private address for the real request (DNS rebinding).
function guardedLookup(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    } else if (typeof options === 'number') {
        options = { family: options };
    }

    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error);
        const blocked = addresses.find(({ address }) =>
            allowPrivateHosts()
                ? isLinkLocalIp(address)
                : isPrivateOrReservedIp(address)
        );
        if (blocked) {
            return callback(
                new UnsafeUrlError(`Refusing to connect to ${blocked.address}`)
            );
        }
        if (options.all) return callback(null, addresses);
        return callback(null, addresses[0].address, addresses[0].family);
    });
}

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

async function assertSafeServer(serverUrl) {
    const parsed = new URL(serverUrl);
    const bare = parsed.hostname.replace(/^\[|\]$/g, '');
    if (allowPrivateHosts()) {
        // Any port and plain http are fine on the operator's own network;
        // link-local (cloud metadata) never is.
        let addresses;
        try {
            addresses = await dns.promises.lookup(bare, { all: true });
        } catch {
            return; // Unresolvable: the request itself will fail.
        }
        if (addresses.some(({ address }) => isLinkLocalIp(address))) {
            throw new NtfyError(
                'Cannot send to link-local or cloud metadata addresses'
            );
        }
        return;
    }
    try {
        await assertSafeUrl(parsed);
    } catch (error) {
        if (error instanceof UnsafeUrlError) {
            throw new NtfyError(
                'Cannot send to private, local or internal addresses, or to ports other than 80 and 443. ' +
                    'If your ntfy server is on your own network, ask your administrator to set NTFY_ALLOW_PRIVATE_HOSTS=true.'
            );
        }
        throw error;
    }
}

const clip = (value, max) =>
    typeof value === 'string' && value.length > max
        ? `${value.slice(0, max - 1)}…`
        : value;

// Publishes one message. `token` is a plain ntfy access token (tk_...) or
// null for an open topic. Throws NtfyError with a message fit for the user.
async function publish(
    topicUrl,
    token,
    { title, message, priority, tags, click }
) {
    const { serverUrl, topic } = parseTopicUrl(topicUrl);
    await assertSafeServer(serverUrl);

    const body = { topic, message: clip(message || title, MAX_MESSAGE_LENGTH) };
    if (title && message) body.title = clip(title, 250);
    if (priority) body.priority = priority;
    if (tags?.length) body.tags = tags;
    if (click) body.click = click;

    let response;
    try {
        response = await axios.post(serverUrl, body, {
            httpAgent,
            httpsAgent,
            maxRedirects: 0,
            timeout: TIMEOUT_MS,
            validateStatus: () => true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'tududi-ntfy',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });
    } catch (error) {
        if (
            error instanceof UnsafeUrlError ||
            error.cause instanceof UnsafeUrlError
        ) {
            throw new NtfyError('Cannot send to that ntfy server address');
        }
        throw new NtfyError('Could not reach the ntfy server');
    }

    if (response.status === 401 || response.status === 403) {
        throw new NtfyError(
            'The ntfy server refused the message. Check the access token.'
        );
    }
    if (response.status < 200 || response.status >= 300) {
        throw new NtfyError(
            `The ntfy server answered with HTTP ${response.status}`
        );
    }
}

module.exports = { publish, parseTopicUrl, NtfyError };
