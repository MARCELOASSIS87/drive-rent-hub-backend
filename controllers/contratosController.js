const pool = require('../config/db');
const contratosModel = require('../models/contratosModel');

// Dados fixos do locador (podem vir de variáveis de ambiente ou configuração)
const LOCADOR_INFO = {
  nome: process.env.LOCADOR_NOME || 'Nome do Locador',
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

    const contratoHtml = `
     <h1>CONTRATO DE LOCAÇÃO DE AUTOMÓVEL POR PRAZO DETERMINADO</h1>
      <h2>IDENTIFICAÇÃO DAS PARTES CONTRATANTES</h2>
      <p><strong>LOCADOR:</strong> ${LOCADOR_INFO.nome}, ${LOCADOR_INFO.nacionalidade} ${LOCADOR_INFO.estado_civil} ${LOCADOR_INFO.profissao}, CPF nº ${LOCADOR_INFO.cpf}, RG nº ${LOCADOR_INFO.rg}, residente e domiciliado à ${LOCADOR_INFO.endereco}.</p>
      <p><strong>LOCATÁRIO:</strong> ${motorista.nome}, ${motorista.nacionalidade || ''}, ${motorista.estado_civil || ''}, ${motorista.profissao || ''}, portador do CPF nº ${motorista.cpf} e RG nº ${motorista.rg || ''}, residente e domiciliado à ${motorista.endereco || ''}.</p>

      <h2>CLÁUSULA 1ª – DO OBJETO</h2>
      <p>O presente contrato tem por objeto a locação do veículo marca/modelo: ${veiculo.marca}/${veiculo.modelo}, placa: ${veiculo.placa}, RENAVAM: ${veiculo.renavam || ''}, ano/modelo: ${veiculo.ano ? `${veiculo.ano}/${veiculo.ano}` : ''}.</p>

      <h2>CLÁUSULA 2ª – DO USO</h2>
      <p>O veículo será utilizado exclusivamente pelo LOCATÁRIO, sendo vedada sua cessão a terceiros, sublocação, uso para fins ilícitos ou não previstos neste contrato. O descumprimento desta cláusula poderá acarretar a rescisão imediata do contrato e aplicação de multa.</p>

      <h2>CLÁUSULA 3ª – DA DEVOLUÇÃO</h2>
      <p>O LOCATÁRIO se compromete a devolver o veículo nas mesmas condições de uso e conservação em que o recebeu, conforme laudo de vistoria anexo, respondendo por eventuais danos causados.</p>

      <h2>CLÁUSULA 4ª – DO PRAZO</h2>
      <p>O presente contrato terá duração de ${aluguel.dias || '[número de dias]'}, com início em ${aluguel.data_inicio} e término em ${aluguel.data_fim}, podendo ser renovado mediante acordo escrito entre as partes.</p>

      <h2>CLÁUSULA 5ª – DA PRORROGAÇÃO OU ATRASO</h2>
      <p>Caso o LOCATÁRIO não devolva o veículo na data estipulada, continuará responsável pelo pagamento proporcional do aluguel, bem como por eventuais danos, inclusive aqueles causados por caso fortuito ou força maior.</p>

      <h2>CLÁUSULA 6ª – DA RESCISÃO</h2>
      <p>Qualquer das partes poderá rescindir o contrato mediante notificação prévia de 10 (dez) dias. Em caso de inadimplemento de qualquer cláusula, a rescisão poderá ocorrer de forma imediata, sem aviso prévio.</p>

      <h2>CLÁUSULA 7ª – DA MULTA</h2>
      <p>O descumprimento de qualquer cláusula acarretará à parte infratora o pagamento de multa no valor de R$ 1.600,00 (mil e seiscentos reais).</p>

      <h2>CLÁUSULA 8ª – DO PAGAMENTO</h2>
      <p>O valor da locação será de R$ ${aluguel.valor_total || ''},00, a ser pago via transferência bancária ou Pix para:</p>
      <ul>
        <li>Banco: ${PAGAMENTO_INFO.banco}</li>
        <li>Agência: ${PAGAMENTO_INFO.agencia}</li>
        <li>Conta: ${PAGAMENTO_INFO.conta}</li>
        <li>Chave Pix: ${PAGAMENTO_INFO.chave_pix}</li>
      </ul>
      <p>Em caso de atraso, incidirá multa de 2% sobre o valor devido, além de juros de mora de 1% ao mês, calculados pro rata die.</p>

      <h2>CLÁUSULA 9ª – DAS MULTAS E INFRAÇÕES</h2>
      <p>Fica o LOCATÁRIO responsável pelo pagamento de multas e infrações de trânsito, devendo efetuar a indicação do condutor no prazo exigido pelos órgãos competentes, sob pena de responsabilidade integral.</p>

      <h2>CLÁUSULA 10 – DOS ENCARGOS</h2>
      <p>Todos os encargos obrigatórios do veículo, como IPVA, DPVAT, licenciamento e seguro serão de responsabilidade do LOCADOR.</p>

      <h2>CLÁUSULA 11 – DAS CONDIÇÕES DE USO</h2>
      <ul>
        <li>Manter o veículo em boas condições de conservação;</li>
        <li>Comunicar qualquer problema técnico ou avaria;</li>
        <li>Arcar com custos de manutenção decorrentes de mau uso;</li>
        <li>Zelar pelos itens obrigatórios (macaco, chave de roda, triângulo, estepe, etc.).</li>
      </ul>

      <h2>CLÁUSULA 12 – DO SEGURO</h2>
      <p>O veículo está segurado contra furto, roubo e colisão. Em caso de sinistro com culpa do LOCATÁRIO, este arcará com o valor da franquia do seguro.</p>

      <h2>CLÁUSULA 13 – DO FORO</h2>
      <p>Para dirimir quaisquer controvérsias decorrentes deste contrato, as partes elegem o foro da comarca de [Cidade/UF], com renúncia de qualquer outro.</p>

      <h2>ENCERRAMENTO</h2>
      <p>E, por estarem justos e contratados, firmam o presente instrumento em duas vias de igual teor, juntamente com 1 (uma) testemunha.</p>
    `;

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