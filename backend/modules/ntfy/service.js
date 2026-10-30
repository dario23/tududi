'use strict';

const { User } = require('../../models');
const secretCipher = require('../../shared/crypto/secretCipher');
const entitlements = require('../../services/entitlementsService');
const { getConfig } = require('../../config/config');
const { NotFoundError, ValidationError } = require('../../shared/errors');
const { logError } = require('../../services/logService');
const { publish, parseTopicUrl, NtfyError } = require('./sender');
const { urlForNotification } = require('../push/service');

const USER_ATTRIBUTES = ['id', 'ntfy_topic_url', 'ntfy_token_encrypted'];

// ntfy priorities run 1 (min) to 5 (max); 3 is the default.
const PRIORITY_BY_LEVEL = { error: 4, warning: 3, info: 3, success: 3 };
const TAGS_BY_LEVEL = { error: ['rotating_light'], warning: ['warning'] };

function isNtfyConfigured(user) {
    return !!user?.ntfy_topic_url;
}

function decryptToken(user) {
    if (!user?.ntfy_token_encrypted) return null;
    try {
        return secretCipher.decrypt(user.ntfy_token_encrypted);
    } catch (error) {
        logError('Could not decrypt ntfy token:', error);
        throw new NtfyError(
            'The saved ntfy token cannot be read. Enter it again.'
        );
    }
}

async function loadUser(userId) {
    const user = await User.findByPk(userId, { attributes: USER_ATTRIBUTES });
    if (!user) throw new NotFoundError('User not found');
    return user;
}

// The token is never sent back, only whether one is saved.
function toSettings(user) {
    return {
        topic_url: user.ntfy_topic_url || null,
        has_token: !!user.ntfy_token_encrypted,
    };
}

async function getSettings(userId) {
    return toSettings(await loadUser(userId));
}

// `token` left out keeps the saved one; null or '' removes it.
async function saveSettings(userId, { topic_url, token } = {}) {
    const user = await loadUser(userId);

    if (topic_url === null || topic_url === '') {
        await user.update({ ntfy_topic_url: null, ntfy_token_encrypted: null });
        return toSettings(user);
    }

    await entitlements.assertFeature(userId, 'ntfy');

    if (typeof topic_url !== 'string' || topic_url.length > 500) {
        throw new ValidationError('Enter the ntfy topic address');
    }
    let topicUrl;
    try {
        ({ topicUrl } = parseTopicUrl(topic_url));
    } catch (error) {
        if (error instanceof NtfyError)
            throw new ValidationError(error.message);
        throw error;
    }

    const updates = { ntfy_topic_url: topicUrl };
    if (token === null || token === '') {
        updates.ntfy_token_encrypted = null;
    } else if (token !== undefined) {
        if (typeof token !== 'string' || token.length > 255) {
            throw new ValidationError('That access token is not valid');
        }
        if (!secretCipher.hasKeyMaterial()) {
            throw new ValidationError(
                'Cannot save an access token: set TUDUDI_SESSION_SECRET (or TUDUDI_OIDC_SECRET_ENCRYPTION_KEY) on the server first'
            );
        }
        updates.ntfy_token_encrypted = secretCipher.encrypt(token.trim());
    }

    await user.update(updates);
    return toSettings(user);
}

function clickUrl(data) {
    const base = (getConfig().frontendUrl || '').replace(/\/$/, '');
    return base ? `${base}${urlForNotification(data)}` : undefined;
}

// Sends one message to the user's topic. Returns false when ntfy is not set
// up; throws NtfyError when the server could not be reached or refused it.
async function sendToUser(userId, { title, message, level = 'info', data }) {
    const user = await User.findByPk(userId, { attributes: USER_ATTRIBUTES });
    if (!isNtfyConfigured(user)) return false;

    await publish(user.ntfy_topic_url, decryptToken(user), {
        title,
        message,
        priority: PRIORITY_BY_LEVEL[level] || 3,
        tags: TAGS_BY_LEVEL[level],
        click: clickUrl(data),
    });
    return true;
}

async function sendNotification(notification) {
    return sendToUser(notification.user_id, {
        title: notification.title,
        message: notification.message,
        level: notification.level,
        data: notification.data,
    });
}

module.exports = {
    isNtfyConfigured,
    getSettings,
    saveSettings,
    sendToUser,
    sendNotification,
    NtfyError,
};
