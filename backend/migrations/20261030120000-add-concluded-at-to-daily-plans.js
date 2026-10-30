'use strict';

const {
    safeAddColumns,
    safeRemoveColumn,
} = require('../utils/migration-utils');

module.exports = {
    // Set by "End day" on Today. Once set, Today shows the day as done and
    // offers to plan tomorrow.
    async up(queryInterface, Sequelize) {
        await safeAddColumns(queryInterface, 'daily_plans', [
            {
                name: 'concluded_at',
                definition: {
                    type: Sequelize.DATE,
                    allowNull: true,
                },
            },
        ]);
    },

    async down(queryInterface) {
        await safeRemoveColumn(queryInterface, 'daily_plans', 'concluded_at');
    },
};
