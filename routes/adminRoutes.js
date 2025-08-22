const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth');
const adminController = require('../controllers/adminController');
const adminAuth = require('../middlewares/adminAuth');

router.use(express.json());
router.use(express.urlencoded({ extended: true }));
// CRUD RESTful
router.get   ('/',      auth, adminController.listarAdmins);      // Listar todos os admins
router.post  ('/',      auth, adminController.criarAdmin);        // Criar novo admin
router.put   ('/:id',   auth, adminController.editarAdmin);       // Editar admin por ID
router.delete('/:id',   auth, adminController.excluirAdmin);      // Exclusão lógica por ID

// Aprovação/recusa de veículos
router.put('/veiculos/:id/aprovar', adminAuth, adminController.aprovarVeiculo);
router.put('/veiculos/:id/recusar', adminAuth, adminController.recusarVeiculo);
module.exports = router;
