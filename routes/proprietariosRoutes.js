const express = require('express');
const router = express.Router();
const { criarProprietario, loginProprietario, getOwnerStats } = require('../controllers/proprietariosController');

router.post('/', criarProprietario);
router.post('/login', loginProprietario);
router.get('/me/stats', getOwnerStats); // usa o Bearer token para identificar o proprietário

module.exports = router;
