const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const pool = require('../config/db');

let resetDb;
try { resetDb = require('./helpers/resetDb'); } catch (_) { resetDb = null; }

function signToken(payload) {
    return 'Bearer ' + jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function insertProprietario(props = {}) {
    const nome = props.nome || 'Prop Badge C';
    const email = props.email || `prop_c_${Date.now()}@t.com`;
    const cpf_cnpj = props.cpf_cnpj || String(Math.floor(1e14 + Math.random() * 9e14)).slice(0, 14);
    const senha_hash = props.senha_hash || 'x'.repeat(60);
    const status = props.status || 'aprovado';
    const [r] = await pool.query(
        `INSERT INTO proprietarios (nome, email, cpf_cnpj, senha_hash, status, criado_em)
     VALUES (?, ?, ?, ?, ?, NOW())`,
        [nome, email, cpf_cnpj, senha_hash, status]
    );
    return { id: r.insertId, nome, email };
}

async function insertMotorista(props = {}) {
    const nome = props.nome || 'Mot Badge C';
    const email = props.email || `mot_c_${Date.now()}@t.com`;
    const cpf = props.cpf || String(Math.floor(1e10 + Math.random() * 9e10)).slice(0, 11);
    const senha_hash = props.senha_hash || 'x'.repeat(60);
    const [r] = await pool.query(
        `INSERT INTO motoristas (nome, email, cpf, senha_hash, status, criado_em)
     VALUES (?, ?, ?, ?, 'aprovado', NOW())`,
        [nome, email, cpf, senha_hash]
    );
    return { id: r.insertId, nome, email, cpf };
}

async function insertVeiculo(proprietarioId, props = {}) {
    const marca = props.marca || 'Fiat';
    const modelo = props.modelo || 'Cronos';
    const placa = props.placa || ('XYZ' + Math.floor(Math.random() * 900 + 100) + '2');
    const renavam = props.renavam || String(Math.floor(1e9 + Math.random() * 9e9));
    const ano = props.ano || 2023;
    const cor = props.cor || 'Preto';
    const valor_diaria = props.valor_diaria || 150.0;

    const [r] = await pool.query(
        `INSERT INTO veiculos (marca, modelo, placa, renavam, ano, cor, valor_diaria, status, ativo, criado_em, proprietario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'disponivel', 1, NOW(), ?)`,
        [marca, modelo, placa, renavam, ano, cor, valor_diaria, proprietarioId]
    );
    return { id: r.insertId, marca, modelo };
}

async function getContrato(id) {
    const [rows] = await pool.query(`SELECT * FROM contratos WHERE id = ?`, [id]);
    return rows[0] || null;
}

describe('Badges em Contratos (flags por entidade)', () => {
    let prop, mot, vei, tokenProp, tokenMot;

    beforeAll(async () => {
        if (resetDb?.resetAll) {
            await resetDb.resetAll();
        } else {
            await pool.query('SET FOREIGN_KEY_CHECKS=0');
            // filhos → pais (respeita FKs)
            const order = ['contrato_revisoes', 'contratos', 'avaliacoes', 'solicitacoes_aluguel', 'alugueis', 'veiculos', 'motoristas', 'proprietarios', 'admins'];
            for (const t of order) {
                try { await pool.query(`TRUNCATE TABLE \`${t}\``); } catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; }
            }
            await pool.query('SET FOREIGN_KEY_CHECKS=1');
        }
        // base: cria proprietario, motorista e veículo
        prop = await insertProprietario();
        mot = await insertMotorista();
        if (!mot || !mot.id) throw new Error('Falha ao criar motorista de teste (mot.id indefinido)');
        vei = await insertVeiculo(prop.id);

        // Pré-condição: dados legais completos (controller exige 12 campos)
        await pool.query(
            `INSERT INTO motoristas_legal
       (motorista_id, rg, orgao_expeditor, uf_rg, nacionalidade, estado_civil, profissao,
        endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep)
       VALUES (?, '1234567', 'SSP', 'SP', 'brasileiro', 'solteiro', 'Motorista',
               'Rua A', '100', 'Centro', 'São Paulo', 'SP', '01000-000')
       ON DUPLICATE KEY UPDATE
         rg=VALUES(rg), orgao_expeditor=VALUES(orgao_expeditor), uf_rg=VALUES(uf_rg),
         nacionalidade=VALUES(nacionalidade), estado_civil=VALUES(estado_civil), profissao=VALUES(profissao),
         endereco_logradouro=VALUES(endereco_logradouro), endereco_numero=VALUES(endereco_numero),
         endereco_bairro=VALUES(endereco_bairro), endereco_cidade=VALUES(endereco_cidade),
         endereco_uf=VALUES(endereco_uf), endereco_cep=VALUES(endereco_cep)`,
            [mot.id]
        );
        await pool.query(
            `INSERT INTO proprietarios_legal
         (proprietario_id, rg, orgao_expeditor, uf_rg, nacionalidade, estado_civil, profissao,
            endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep)
         VALUES (?, '7654321', 'SSP', 'SP', 'brasileiro', 'casado', 'Proprietário de Veículos',
               'Av. B', '200', 'Jardins', 'São Paulo', 'SP', '01400-000')
           ON DUPLICATE KEY UPDATE
             rg=VALUES(rg), orgao_expeditor=VALUES(orgao_expeditor), uf_rg=VALUES(uf_rg),
             nacionalidade=VALUES(nacionalidade), estado_civil=VALUES(estado_civil), profissao=VALUES(profissao),
             endereco_logradouro=VALUES(endereco_logradouro), endereco_numero=VALUES(endereco_numero),
            endereco_bairro=VALUES(endereco_bairro), endereco_cidade=VALUES(endereco_cidade),
            endereco_uf=VALUES(endereco_uf), endereco_cep=VALUES(endereco_cep)`,
            [prop.id]
        );

        tokenProp = signToken({ id: prop.id, role: 'proprietario' });
        tokenMot = signToken({ id: mot.id, role: 'motorista' });
    });

    afterAll(async () => {
        if (resetDb?.resetAll) {
            await resetDb.resetAll();
        } else {
            await pool.query('SET FOREIGN_KEY_CHECKS=0');
            const order = ['contrato_revisoes', 'contratos', 'avaliacoes', 'solicitacoes_aluguel', 'alugueis', 'veiculos', 'motoristas', 'proprietarios', 'admins'];
            for (const t of order) {
                try { await pool.query(`TRUNCATE TABLE \`${t}\``); } catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; }
            }
            await pool.query('SET FOREIGN_KEY_CHECKS=1');
        }
    });

    test('publicar → visto do motorista = 0; motorista marca como lido e sai de ?unread=1; assinar → visto do proprietário = 0', async () => {
        // 1) motorista cria uma solicitação
        const hoje = new Date();
        const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000);
        const fmt = d => d.toISOString().slice(0, 10);

        const resSolic = await request(app)
            .post('/solicitacoes')
            .set('Authorization', tokenMot)
            .send({
                veiculo_id: vei.id,
                data_inicio: fmt(hoje),
                data_fim: fmt(amanha)
            });
        expect([200, 201].includes(resSolic.statusCode)).toBe(true);
        const solicitacaoId = resSolic.body?.id || resSolic.body?.insertId || resSolic.body?.solicitacao?.id;
        expect(solicitacaoId).toBeTruthy();

        // 2) proprietário APROVA a solicitação → cria aluguel + contrato em_negociacao
        const payloadAprovar = {
            valor_por_dia: 150,
            forma_pagamento: 'pix',
            local_retirada: 'Ponto A',
            local_devolucao: 'Ponto B',
            // dados civis do MOTORISTA (obrigatórios)
            dados_legais: {
                rg: '12.345.678-9',
                orgao_expeditor: 'SSP',
                uf_rg: 'SP',
                nacionalidade: 'brasileiro',
                estado_civil: 'solteiro',
                profissao: 'Motorista',
                endereco_logradouro: 'Rua Alfa',
                endereco_numero: '100',
                endereco_bairro: 'Centro',
                endereco_cidade: 'São Paulo',
                endereco_uf: 'SP',
                endereco_cep: '01000-000',
            },
            // dados civis do PROPRIETÁRIO (obrigatórios)
            dados_legais_proprietario: {
                rg: '98.765.432-1',
                orgao_expeditor: 'SSP',
                uf_rg: 'SP',
                nacionalidade: 'brasileiro',
                estado_civil: 'casado',
                profissao: 'Proprietário de Veículos',
                endereco_logradouro: 'Av. Beta',
                endereco_numero: '200',
                endereco_bairro: 'Jardins',
                endereco_cidade: 'São Paulo',
                endereco_uf: 'SP',
                endereco_cep: '01400-000',
            }
        };
        const aprovarRes = await request(app)
            .put(`/solicitacoes/${solicitacaoId}/aprovar`)
            .set('Authorization', tokenProp)
            .send({
                valor_por_dia: 150,
                forma_pagamento: 'pix',
                local_retirada: 'Ponto A',
                local_devolucao: 'Ponto B'
            });
        expect([200, 201].includes(aprovarRes.statusCode)).toBe(true);

        // pega contrato criado (do body ou via fallback no banco)
        let contratoId = aprovarRes.body?.contrato_id;
        if (!contratoId) {
            const [cRows] = await pool.query(
                `SELECT id AS contrato_id FROM contratos ORDER BY id DESC LIMIT 1`
            );
            expect(cRows.length).toBe(1);
            contratoId = cRows[0].contrato_id;
        }

        // 3) publicar → deve setar visto_por_motorista = 0
        const pubRes = await request(app)
            .post(`/contratos/${contratoId}/publicar`)
            .set('Authorization', tokenProp)
            .send();
        expect([200, 204].includes(pubRes.statusCode)).toBe(true);

        const cAfterPub = await getContrato(contratoId);
        expect(Number(cAfterPub.visto_por_motorista)).toBe(0);

        // motorista vê somente não lidos
        const unreadMot1 = await request(app)
            .get('/contratos/minhas?unread=1')
            .set('Authorization', tokenMot)
            .send();
        expect(unreadMot1.statusCode).toBe(200);
        const list1 = Array.isArray(unreadMot1.body) ? unreadMot1.body : (unreadMot1.body?.rows || []);
        const ids1 = list1.map(x => x.id);
        expect(ids1).toContain(contratoId);

        // motorista marca como lido
        const markMot = await request(app)
            .patch(`/contratos/${contratoId}/mark-read/motorista`)
            .set('Authorization', tokenMot)
            .send();
        expect(markMot.statusCode).toBe(200);
        expect(markMot.body).toHaveProperty('ok', true);

        // não deve mais aparecer nos não lidos
        const unreadMot2 = await request(app)
            .get('/contratos/minhas?unread=1')
            .set('Authorization', tokenMot)
            .send();
        const list2 = Array.isArray(unreadMot2.body) ? unreadMot2.body : (unreadMot2.body?.rows || []);
        const ids2 = list2.map(x => x.id);
        expect(ids2).not.toContain(contratoId);

        // 4) assinar → deve setar visto_por_proprietario = 0
        const signRes = await request(app)
            .post(`/contratos/${contratoId}/assinar`)
            .set('Authorization', tokenMot)
            .send();
        expect([200, 204].includes(signRes.statusCode)).toBe(true);

        const cAfterSign = await getContrato(contratoId);
        expect(Number(cAfterSign.visto_por_proprietario)).toBe(0);

        // proprietário pode marcar como lido
        const markProp = await request(app)
            .patch(`/contratos/${contratoId}/mark-read/proprietario`)
            .set('Authorization', tokenProp)
            .send();
        expect(markProp.statusCode).toBe(200);
        expect(markProp.body).toHaveProperty('ok', true);
    });
});
