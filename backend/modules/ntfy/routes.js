'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { createResourceLimiter } = require('../../middleware/rateLimiter');

router.get('/ntfy', controller.get);
router.put('/ntfy', createResourceLimiter, controller.update);
router.delete('/ntfy', controller.remove);

module.exports = router;
