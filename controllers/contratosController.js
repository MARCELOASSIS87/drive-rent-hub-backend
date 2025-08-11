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
exports.gerarContrato = async (req, res) => {
  const {
    aluguel_id,
    banco,
    agencia,
    conta,
    chave_pix,
    endereco_retirada,
    endereco_devolucao,
  } = req.body;

  if (!aluguel_id || !banco || !agencia || !conta || !chave_pix) {
    return res.status(400).json({
      error: 'aluguel_id, banco, agencia, conta e chave_pix são obrigatórios',
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT s.*, m.nome, m.cpf, v.marca, v.modelo, v.placa, v.renavam, v.ano
         FROM solicitacoes_aluguel s
         JOIN motoristas m ON s.motorista_id = m.id
         JOIN veiculos v   ON s.veiculo_id   = v.id
        WHERE s.id = ?`,
      [aluguel_id]
    );

    let sol = rows[0];
    if (!sol) {
      return res.status(404).json({ error: 'Dados não encontrados' });
    }
    if (endereco_retirada || endereco_devolucao) {
      await pool.query(
        `UPDATE solicitacoes_aluguel
           SET endereco_retirada = COALESCE(?, endereco_retirada),
               endereco_devolucao = COALESCE(?, endereco_devolucao)
         WHERE id = ?`,
        [endereco_retirada || null, endereco_devolucao || null, aluguel_id]
      );

      const [atualizadas] = await pool.query(
        `SELECT s.*, m.nome, m.cpf, v.marca, v.modelo, v.placa, v.renavam, v.ano
           FROM solicitacoes_aluguel s
           JOIN motoristas m ON s.motorista_id = m.id
           JOIN veiculos v   ON s.veiculo_id   = v.id
          WHERE s.id = ?`,
        [aluguel_id]
      );
      sol = atualizadas[0];
    }
    const motorista = {
      nome: sol.nome,
      cpf: sol.cpf,
      nacionalidade: sol.nacionalidade,
      estado_civil: sol.estado_civil,
      profissao: sol.profissao,
      rg: sol.rg,
      endereco: sol.endereco
    };

    const veiculo = {
      marca: sol.marca,
      modelo: sol.modelo,
      placa: sol.placa,
      renavam: sol.renavam,
      ano: sol.ano
    };

    const aluguel = {
      id: sol.id,
      data_inicio: sol.data_inicio,
      data_fim: sol.data_fim,
      valor_total: sol.valor_total,
      local_retirada: sol.endereco_retirada,
      local_devolucao: sol.endereco_devolucao
    };

    const pagamento = { banco, agencia, conta, chave_pix };

    const contratoHtml = generateContractHtml({
      locador: LOCADOR_INFO,
      motorista,
      veiculo,
      aluguel,
      pagamento,
    });

    const contratoId = await contratosModel.criarContrato({
      aluguel_id: sol.id,
      motorista_id: sol.motorista_id,
      veiculo_id: sol.veiculo_id,
      arquivo_html: contratoHtml,
      status: 'aguardando_assinatura',
      arquivo_html: contratoHtml,
    });

    res.status(201).json({ id: contratoId });
  } catch (err) {
    console.error('Erro em gerarContrato:', err);
    res
      .status(500)
      .json({ error: 'Erro ao gerar contrato', detalhes: err.message });
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