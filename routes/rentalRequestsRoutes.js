const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const rentalRequestsController = require('../controllers/rentalRequestsController');

router.post('/', auth, rentalRequestsController.criarSolicitacao);
router.get('/minhas', auth, rentalRequestsController.listarMinhasSolicitacoes);
router.get('/recebidas', auth, rentalRequestsController.listarSolicitacoesRecebidas);
router.put('/:id/aprovar', auth, rentalRequestsController.aprovarSolicitacao);
router.put('/:id/recusar', auth, rentalRequestsController.recusarSolicitacao);

module.exports = router;