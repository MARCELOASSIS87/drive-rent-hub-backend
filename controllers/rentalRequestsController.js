const pool = require('../config/db');
const rentalRequestsModel = require('../models/rentalRequestsModel');
const contratosModel = require('../models/contratosModel');
const generateContractHtml = require('../utils/contractHtml');

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


exports.criarSolicitacao = async (req, res) => {
  console.log('=== criarSolicitacao chamado ===');
  console.log('Usuario logado:', req.user);
  console.log('Body recebido em criarSolicitacao:', req.body);
  const {
    veiculo_id,
    data_inicio,
    data_fim,
    endereco_retirada,
    endereco_devolucao,
    pagamentoDinheiro,
    nacionalidade,
    estado_civil,
    profissao,
    rg,
    endereco
  } = req.body;
  const motorista_id = req.user?.id;

  if (!motorista_id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  try {
    const solicitacao = await rentalRequestsModel.criarSolicitacao({
      motorista_id,
      veiculo_id,
      data_inicio,
      data_fim,
      endereco_retirada,
      endereco_devolucao,
      pagamentoDinheiro,
      nacionalidade,
      estado_civil,
      profissao,
      rg,
      endereco
    });
    console.log('Solicitação criada corretamente:', solicitacao);
    res.status(201).json(solicitacao);
  } catch (err) {
    console.error('Erro ao criar solicitação:', err);
    res
      .status(500)
      .json({ error: 'Erro ao criar solicitação', detalhes: err.message });
  }
};

exports.listarSolicitacoes = async (req, res) => {
  if (!req.user || !['comum', 'super'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT s.*, 
              m.nome    AS motorista_nome, 
              m.email   AS motorista_email,
              v.marca, v.modelo, v.placa
         FROM solicitacoes_aluguel s
         JOIN motoristas m ON s.motorista_id = m.id
         JOIN veiculos   v ON s.veiculo_id   = v.id`
    );

    // Mapeia para aninhar veiculo e remover campos achatados
    const formatted = rows.map(({ marca, modelo, placa, ...rest }) => ({
      ...rest,
      motorista: {
        id: rest.motorista_id,
        nome: rest.motorista_nome,
        email: rest.motorista_email
      },
      veiculo: { marca, modelo, placa }
    }));

    return res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar solicitações', detalhes: err.message });
  }
};

exports.listarMinhasSolicitacoes = async (req, res) => {
  const motorista_id = req.user?.id;
  if (!motorista_id) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }
  try {
    const [rows] = await pool.query(
      `SELECT s.*, v.marca, v.modelo, v.placa
         FROM solicitacoes_aluguel s
         JOIN veiculos v ON s.veiculo_id = v.id
        WHERE s.motorista_id = ?`,
      [motorista_id]
    );
    // Mantém marca/modelo/placa no root e adiciona veiculo aninhado
    const formatted = rows.map(r => ({
      ...r,
      veiculo: { marca: r.marca, modelo: r.modelo, placa: r.placa }
    }));
    return res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar solicitações', detalhes: err.message });
  }
};

exports.atualizarStatus = async (req, res) => {
  const { id } = req.params;
  const { status, motivo } = req.body;

  if (!req.user || !['comum', 'super'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  if (!['pendente', 'aprovado', 'recusado'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  try {
    // 1) Atualiza o status da solicitação
    await pool.query(
      'UPDATE solicitacoes_aluguel SET status = ?, motivo_recusa = ? WHERE id = ?',
      [status, motivo || null, id]
    );

    // 2) Se for aprovado, gera automaticamente um contrato completo
    if (status === 'aprovado') {
      // Busca a solicitação aprovada
      const sol = await rentalRequestsModel.buscarPorId(id);

      // Busca dados do motorista
      const [motoristaRows] = await pool.query(
        `SELECT nome, cpf, email 
       FROM motoristas 
      WHERE id = ?`,
        [sol.motorista_id]
      );
      const motorista = motoristaRows[0];

      // Busca dados do veículo
      const [veiculoRows] = await pool.query(
        `SELECT marca, modelo, placa 
         FROM veiculos 
         WHERE id = ?`,
        [sol.veiculo_id]
      );
      const veiculo = veiculoRows[0];

      // Prepara o objeto de aluguel (usando a própria solicitação)
      const aluguel = {
        id: sol.id,
        data_inicio: sol.data_inicio,
        data_fim: sol.data_fim,
        valor_total: sol.valor_total,
        local_retirada: sol.endereco_retirada,
        local_devolucao: sol.endereco_devolucao
      };

      // Gera o HTML definitivo do contrato
      const contratoHtml = generateContractHtml({
        locador: LOCADOR_INFO,
        motorista,
        veiculo,
        aluguel,
        pagamento: PAGAMENTO_INFO
      });

      // Persiste o contrato no banco com status inicial
      await contratosModel.criarContrato({
        aluguel_id: sol.id,
        motorista_id: sol.motorista_id,
        veiculo_id: sol.veiculo_id,
        status: 'aguardando_assinatura',
        arquivo_html: contratoHtml,
        ...PAGAMENTO_INFO
      });
    }


    return res.json({ message: 'Status atualizado e contrato gerado (se aprovado).' });
  } catch (err) {
    console.error('Erro em atualizarStatus:', err);
    return res
      .status(500)
      .json({ error: 'Erro ao atualizar status', detalhes: err.message });
  }
};