'use strict';

const service = require('./service');
const { getAuthenticatedUserId } = require('../../utils/request-utils');
const { UnauthorizedError } = require('../../shared/errors');

function requireUserId(req) {
    const userId = getAuthenticatedUserId(req);
    if (!userId) throw new UnauthorizedError('Authentication required');
    return userId;
}

const controller = {
    async get(req, res, next) {
        try {
            res.json(await service.getSettings(requireUserId(req)));
        } catch (error) {
            next(error);
        }
    },

    async update(req, res, next) {
        try {
            res.json(
                await service.saveSettings(requireUserId(req), req.body || {})
            );
        } catch (error) {
            next(error);
        }
    },

    async remove(req, res, next) {
        try {
            res.json(
                await service.saveSettings(requireUserId(req), {
                    topic_url: null,
                })
            );
        } catch (error) {
            next(error);
        }
    },
};

module.exports = controller;
