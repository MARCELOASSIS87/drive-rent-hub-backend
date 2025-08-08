const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const contratosController = require('../controllers/contratosController');

router.post('/gerar', auth, contratosController.gerarContrato);
router.get('/:id', auth, contratosController.visualizarContrato);
router.post('/:id/assinar', auth, contratosController.assinarContrato);
// Listar todos os contratos
router.get('/', auth, contratosController.listarContratos);
router.get('/:id/pdf', auth, contratosController.baixarContratoPdf);

module.exports = router;