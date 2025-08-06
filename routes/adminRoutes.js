const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth');
const adminController = require('../controllers/adminController');
const rentalRequestsController = require('../controllers/rentalRequestsController');

router.use(express.json());
router.use(express.urlencoded({ extended: true }));
// CRUD RESTful
router.get   ('/',      auth, adminController.listarAdmins);      // Listar todos os admins
router.post  ('/',      auth, adminController.criarAdmin);        // Criar novo admin
router.put   ('/:id',   auth, adminController.editarAdmin);       // Editar admin por ID
router.delete('/:id',   auth, adminController.excluirAdmin);      // Exclusão lógica por ID
// Rotas de Solicitações para o Admin
// Listar todas as solicitações pendentes ou já processadas
router.get(  '/solicitacoes',  auth,  rentalRequestsController.listarSolicitacoes);
// Atualizar status de uma solicitação (aprovar/recusar)
router.put(  '/solicitacoes/:id/status',  auth,  rentalRequestsController.atualizarStatus);
module.exports = router;
