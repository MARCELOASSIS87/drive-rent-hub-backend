const express = require('express');
const router = express.Router();
const proprietariosController = require('../controllers/proprietariosController');

router.post('/', proprietariosController.criarProprietario);

module.exports = router;