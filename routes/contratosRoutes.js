const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const contratosController = require('../controllers/contratosController');

router.post('/gerar', auth, contratosController.gerarContrato);

module.exports = router;