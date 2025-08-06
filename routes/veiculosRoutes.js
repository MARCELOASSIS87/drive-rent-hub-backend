const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const veiculosController = require('../controllers/veiculosController');
const auth = require('../middlewares/auth');
// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/veiculos/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });
// Middleware simples para validar o campo valor_diaria
const validarValorDiaria = (req, res, next) => {
  const { valor_diaria } = req.body;
  if (valor_diaria !== undefined) {
    const valor = parseFloat(valor_diaria);
    if (isNaN(valor) || valor < 0) {
      return res
        .status(400)
        .json({ error: 'valor_diaria deve ser numérico e não negativo' });
    }
    req.body.valor_diaria = valor;
  }
  next();
};
// Rotas de CRUD de veículos
router.get('/', veiculosController.listarVeiculos);
router.get('/:id', veiculosController.obterVeiculo);
router.post('/', upload.fields([
  { name: 'foto_principal', maxCount: 1 },
  { name: 'fotos', maxCount: 10 }
]), validarValorDiaria, veiculosController.criarVeiculo);
router.put('/:id/status', auth, veiculosController.atualizarStatus);
router.put('/:id', upload.fields([
  { name: 'foto_principal', maxCount: 1 },
  { name: 'fotos', maxCount: 10 }
]), validarValorDiaria, veiculosController.editarVeiculo);
router.delete('/:id', veiculosController.excluirVeiculo);

module.exports = router;