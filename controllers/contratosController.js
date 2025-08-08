const pool = require('../config/db');
const contratosModel = require('../models/contratosModel');
const generateContractHtml = require('../utils/contractHtml');
const pdf = require('html-pdf');

// Dados fixos do locador (podem vir de variáveis de ambiente ou configuração)
const LOCADOR_INFO = {
  nome: process.env.LOCADOR_NOME || 'LocaPocos',
  nacionalidade: process.env.LOCADOR_NACIONALIDADE || '',
  estado_civil: process.env.LOCADOR_ESTADO_CIVIL || '',
  profissao: process.env.LOCADOR_PROFISSAO || '',
  cpf: process.env.LOCADOR_CPF || '',
  rg: process.env.LOCADOR_RG || '',
  endereco: process.env.LOCADOR_ENDERECO || ''
};
const PAGAMENTO_INFO = {
  banco: process.env.LOCADOR_BANCO || '[Banco]',
  agencia: process.env.LOCADOR_AGENCIA || '[Agência]',
  conta: process.env.LOCADOR_CONTA || '[Conta]',
  chave_pix: process.env.LOCADOR_CHAVE_PIX || '[Chave Pix]'
};

exports.gerarContrato = async (req, res) => {
  const { aluguel_id, motorista_id, veiculo_id } = req.body;

  if (!aluguel_id || !motorista_id || !veiculo_id) {
    return res.status(400).json({
      error: 'aluguel_id, motorista_id e veiculo_id são obrigatórios'
    });
  }

  try {
    const [rowsAluguel] = await pool.query(
      'SELECT * FROM alugueis WHERE id = ?',
      [aluguel_id]
    );
    const [rowsMotorista] = await pool.query(
      `SELECT nome, cpf, nacionalidade, estado_civil, profissao, rg, endereco
       FROM motoristas WHERE id = ?`, [motorista_id]
    );
    const [rowsVeiculo] = await pool.query(
      'SELECT marca, modelo, placa, renavam, ano FROM veiculos WHERE id = ?',
      [veiculo_id]
    );

    const aluguel = rowsAluguel[0];
    const motorista = rowsMotorista[0];
    const veiculo = rowsVeiculo[0];

    if (!aluguel || !motorista || !veiculo) {
      return res.status(404).json({ error: 'Dados não encontrados' });
    }

    const contratoHtml = generateContractHtml({
      locador: LOCADOR_INFO,
      motorista,
      veiculo,
      aluguel,
      pagamento: PAGAMENTO_INFO
    });

    const contratoId = await contratosModel.criarContrato({
      aluguel_id,
      motorista_id,
      veiculo_id,
      arquivo_html: contratoHtml,
      status: 'aguardando_assinatura'
    });

    res.status(201).json({ id: contratoId });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar contrato', detalhes: err.message });
  }
};

// GET /contratos/:id
exports.visualizarContrato = async (req, res) => {
  try {
    const { id } = req.params;
    const contrato = await contratosModel.buscarPorId(id);
    if (!contrato) {
      return res.status(404).json({ error: 'Contrato não encontrado' });
    }

    const usuario = req.user;
    if (usuario.role !== 'admin' && contrato.motorista_id !== usuario.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.type('html').send(contrato.arquivo_html);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contrato', detalhes: err.message });
  }
};
// GET /contratos/:id/pdf
exports.baixarContratoPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const contrato = await contratosModel.buscarPorId(id);
    if (!contrato) {
      return res.status(404).json({ error: 'Contrato não encontrado' });
    }
    // Converte HTML em PDF
    pdf.create(contrato.arquivo_html, { format: 'A4' }).toBuffer((err, buffer) => {
      if (err) return res.status(500).json({ error: 'Erro ao gerar PDF' });
      res.type('application/pdf');
      res.send(buffer);
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao baixar PDF', detalhes: err.message });
  }
};
// POST /contratos/:id/assinar
exports.assinarContrato = async (req, res) => {
  try {
    const { id } = req.params;
    const contrato = await contratosModel.buscarPorId(id);
    if (!contrato) {
      return res.status(404).json({ error: 'Contrato não encontrado' });
    }

    const usuario = req.user;
    if (contrato.motorista_id !== usuario.id) {
      return res.status(403).json({ error: 'Somente o motorista pode assinar' });
    }

    const ip = req.ip;
    await contratosModel.assinarContrato(id, ip);
    const atualizado = await contratosModel.buscarPorId(id);
    res.json({ status: atualizado.status });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao assinar contrato', detalhes: err.message });
  }
};
// GET /contratos
exports.listarContratos = async (req, res) => {
  try {
    // Chama a função do model que retorna todos os contratos
    const contratos = await contratosModel.listarContratos();
    return res.json(contratos);
  } catch (err) {
    console.error('Erro ao listar contratos:', err);
    return res
      .status(500)
      .json({ error: 'Erro ao listar contratos', detalhes: err.message });
  }
};