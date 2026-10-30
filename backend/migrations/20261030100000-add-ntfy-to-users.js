'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

module.exports = {
    // ntfy topic for phone notifications. The access token is encrypted at
    // rest, like calendar feed addresses.
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'users', [
            {
                name: 'ntfy_topic_url',
                definition: { type: Sequelize.STRING, allowNull: true },
            },
            {
                name: 'ntfy_token_encrypted',
                definition: { type: Sequelize.TEXT, allowNull: true },
            },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'users', 'ntfy_token_encrypted');
        await safeRemoveColumn(queryInterface, 'users', 'ntfy_topic_url');
    },
};
