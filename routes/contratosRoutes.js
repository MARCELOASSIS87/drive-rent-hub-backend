const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const controller = require('../controllers/contratosController');

router.get('/:id', auth, controller.obterContrato);
router.put('/:id', auth, controller.atualizarContrato);
router.post('/:id/publicar', auth, controller.publicarContrato);
router.post('/:id/assinar', auth, controller.assinarContrato);

module.exports = router;