const {
    listarMinhasContratos,
    obterContrato,
    atualizarContrato,
    publicarContrato,
    assinarContrato,
    markContratoReadForMotorista,
    markContratoReadForProprietario
} = require('../controllers/contratosController');
const router = require('express').Router();
const auth = require('../middlewares/auth');
const motoristaOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!['motorista', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Apenas motoristas ou admins' });
    }
    next();
};

const proprietarioOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!['proprietario', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Apenas proprietários ou admins' });
    }
    next();
};

router.get('/minhas', auth, motoristaOrAdmin, listarMinhasContratos);
router.get('/:id', auth, obterContrato);
router.put('/:id', auth, atualizarContrato);
router.post('/:id/publicar', auth, publicarContrato);
router.post('/:id/assinar', auth, assinarContrato);
router.patch('/:id/mark-read/motorista', auth, motoristaOrAdmin, markContratoReadForMotorista);
router.patch('/:id/mark-read/proprietario', auth, proprietarioOrAdmin, markContratoReadForProprietario);

module.exports = router;