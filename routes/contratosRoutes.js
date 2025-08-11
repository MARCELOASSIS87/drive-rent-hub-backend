const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const contratosController = require('../controllers/contratosController');

// Requer que os dados de pagamento estejam presentes no corpo da requisição
router.post(
    '/gerar',
    auth,
    (req, res, next) => {
        const { banco, agencia, conta, chave_pix } = req.body;
        if (!banco || !agencia || !conta || !chave_pix) {
            return res
                .status(400)
                .json({ error: 'banco, agencia, conta e chave_pix são obrigatórios' });
        }
        next();
    },
    contratosController.gerarContrato
);
router.get('/:id', auth, contratosController.visualizarContrato);
router.post('/:id/assinar', auth, contratosController.assinarContrato);
// Listar todos os contratos
router.get('/', auth, contratosController.listarContratos);
router.get('/:id/pdf', auth, contratosController.baixarContratoPdf);

module.exports = router;