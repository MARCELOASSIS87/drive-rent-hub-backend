const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const rentalRequestsController = require('../controllers/rentalRequestsController');

router.post('/', auth, rentalRequestsController.criarSolicitacao);
router.get('/', auth, rentalRequestsController.listarSolicitacoes);
router.get('/mine', auth, rentalRequestsController.listarMinhasSolicitacoes);
router.put('/:id/status', auth, rentalRequestsController.atualizarStatus);

module.exports = router;