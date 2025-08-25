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
    const nome = props.nome || 'Prop Badge';
    const email = props.email || `prop_${Date.now()}@t.com`;
    const cpf_cnpj = props.cpf_cnpj || String(Math.floor(1e14 + Math.random() * 9e14)).slice(0, 14);
    const senha_hash = props.senha_hash || 'x'.repeat(60); // NOT NULL
    const status = props.status || 'aprovado'; // enum('pendente','aprovado','recusado','bloqueado')
    const [r] = await pool.query(
        `INSERT INTO proprietarios (nome, email, cpf_cnpj, senha_hash, status, criado_em)
     VALUES (?, ?, ?, ?, ?, NOW())`,
        [nome, email, cpf_cnpj, senha_hash, status]
    );
    return { id: r.insertId, nome, email, cpf_cnpj };
}

async function insertMotorista(props = {}) {
    const nome = props.nome || 'Mot Badge';
    const email = props.email || `mot_${Date.now()}@t.com`;
    const cpf = props.cpf || String(Math.floor(1e10 + Math.random() * 9e10)).slice(0, 11);
    // status é ENUM('em_analise','aprovado','recusado','bloqueado'); usamos 'aprovado'
    const senha_hash = props.senha_hash || 'x'.repeat(60); // NOT NULL
    // status enum('em_analise','aprovado','recusado','bloqueado')
    const [r] = await pool.query(
        `INSERT INTO motoristas (nome, email, cpf, senha_hash, status, criado_em)
     VALUES (?, ?, ?, ?, 'aprovado', NOW())`,
        [nome, email, cpf, senha_hash]
    );
    return { id: r.insertId, nome, email, cpf };
}

async function insertVeiculo(proprietarioId, props = {}) {
    const marca = props.marca || 'Fiat';
    const modelo = props.modelo || 'Argo';
    const placa = props.placa || ('ABC' + Math.floor(Math.random() * 900 + 100) + '1');
    const renavam = props.renavam || String(Math.floor(1e9 + Math.random() * 9e9));
    const ano = props.ano || 2022;
    const valor_diaria = props.valor_diaria || 100.0;
    const cor = props.cor || 'Prata'; // NOT NULL no schema
    // garante relacionamento com proprietario_id, ativo e disponível
    const [r] = await pool.query(
        `INSERT INTO veiculos (marca, modelo, placa, renavam, ano, cor, valor_diaria, status, ativo, criado_em, proprietario_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'disponivel', 1, NOW(), ?)`,
        [marca, modelo, placa, renavam, ano, cor, valor_diaria, proprietarioId]);
    return { id: r.insertId, marca, modelo };
}

async function getSolicitacao(id) {
    const [rows] = await pool.query(`SELECT * FROM solicitacoes_aluguel WHERE id = ?`, [id]);
    return rows[0] || null;
}

describe('Badges em Solicitações (flags por entidade)', () => {
    let prop, mot, vei;
    let tokenProp, tokenMot;

    beforeAll(async () => {
        // banco limpo
        if (typeof resetDb === 'function') {
            await resetDb();
        } else if (resetDb && typeof resetDb.reset === 'function') {
            await resetDb.reset();
        } else {
            await pool.query('SET FOREIGN_KEY_CHECKS=0');
            await pool.query('TRUNCATE TABLE solicitacoes_aluguel');
            await pool.query('TRUNCATE TABLE contratos');
            await pool.query('TRUNCATE TABLE veiculos');
            await pool.query('TRUNCATE TABLE motoristas');
            await pool.query('TRUNCATE TABLE proprietarios');
            await pool.query('SET FOREIGN_KEY_CHECKS=1');
        }

        // dados base: insere proprietário real (FK de veículos) e usa seu id
        prop = await insertProprietario();
        mot = await insertMotorista();
        vei = await insertVeiculo(prop.id);

        tokenProp = signToken({ id: prop.id, role: 'proprietario' });
        tokenMot = signToken({ id: mot.id, role: 'motorista' });
    });

    afterAll(async () => {
        // limpeza básica (opcional; globalTeardown fecha o pool)
        await pool.query('DELETE FROM solicitacoes_aluguel');
        await pool.query('DELETE FROM contratos');
        await pool.query('DELETE FROM veiculos');
        await pool.query('DELETE FROM motoristas');
        await pool.query('DELETE FROM proprietarios');
    });

    test('POST /solicitacoes → seta visto_por_proprietario=0 e aparece em /recebidas?unread=1', async () => {
        const hoje = new Date();
        const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000);
        const fmt = d => d.toISOString().slice(0, 10);

        // cria solicitação como motorista (ação do controller deve marcar flag do proprietário)
        const resCreate = await request(app)
            .post('/solicitacoes')
            .set('Authorization', tokenMot)
            .send({
                veiculo_id: vei.id,
                data_inicio: fmt(hoje),
                data_fim: fmt(amanha)
            });

        expect([200, 201].includes(resCreate.statusCode)).toBe(true);
        const solicitacaoId = resCreate.body?.id || resCreate.body?.insertId || resCreate.body?.solicitacao?.id;
        expect(solicitacaoId).toBeTruthy();

        // valida flag no banco
        const sDb = await getSolicitacao(solicitacaoId);
        expect(sDb).toBeTruthy();
        expect(Number(sDb.visto_por_proprietario)).toBe(0);

        // proprietário vê somente não lidas
        const resUnread = await request(app)
            .get('/solicitacoes/recebidas?unread=1')
            .set('Authorization', tokenProp)
            .send();
        expect(resUnread.statusCode).toBe(200);
        const lista = Array.isArray(resUnread.body) ? resUnread.body : (resUnread.body?.rows || []);
        const ids = lista.map(x => x.id);
        expect(ids).toContain(solicitacaoId);

        // marca como lida para proprietário
        const resMark = await request(app)
            .patch(`/solicitacoes/${solicitacaoId}/mark-read/proprietario`)
            .set('Authorization', tokenProp)
            .send();
        expect(resMark.statusCode).toBe(200);
        expect(resMark.body).toHaveProperty('ok', true);

        // não deve mais aparecer nas não lidas do proprietário
        const resUnread2 = await request(app)
            .get('/solicitacoes/recebidas?unread=1')
            .set('Authorization', tokenProp)
            .send();
        const lista2 = Array.isArray(resUnread2.body) ? resUnread2.body : (resUnread2.body?.rows || []);
        const ids2 = lista2.map(x => x.id);
        expect(ids2).not.toContain(solicitacaoId);
    });

    test('PUT aprovar/recusar → seta visto_por_motorista=0; motorista marca como lida e some de ?unread=1', async () => {
        const hoje = new Date();
        const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000);
        const fmt = d => d.toISOString().slice(0, 10);

        // cria outra solicitação
        const resCreate = await request(app)
            .post('/solicitacoes')
            .set('Authorization', tokenMot)
            .send({
                veiculo_id: vei.id,
                data_inicio: fmt(hoje),
                data_fim: fmt(amanha)
            });
        expect([200, 201].includes(resCreate.statusCode)).toBe(true);
        const solicitacaoId = resCreate.body?.id || resCreate.body?.insertId || resCreate.body?.solicitacao?.id;

        // proprietário recusa; controller deve setar visto_por_motorista = 0 (evita 422 de validação do aprovar)
        const resRecusar = await request(app)
            .put(`/solicitacoes/${solicitacaoId}/recusar`)
            .set('Authorization', tokenProp)
            .send({ motivo_recusa: 'Sem documentos completos' });
        expect([200, 204].includes(resRecusar.statusCode)).toBe(true);
        // motorista enxerga nas não lidas
        const resUnreadMot = await request(app)
            .get('/solicitacoes/minhas?unread=1')
            .set('Authorization', tokenMot)
            .send();
        expect(resUnreadMot.statusCode).toBe(200);
        const lista = Array.isArray(resUnreadMot.body) ? resUnreadMot.body : (resUnreadMot.body?.rows || []);
        const ids = lista.map(x => x.id);
        expect(ids).toContain(solicitacaoId);

        // motorista marca como lida
        const resMarkMot = await request(app)
            .patch(`/solicitacoes/${solicitacaoId}/mark-read/motorista`)
            .set('Authorization', tokenMot)
            .send();
        expect(resMarkMot.statusCode).toBe(200);
        expect(resMarkMot.body).toHaveProperty('ok', true);

        // some de ?unread=1 do motorista
        const resUnreadMot2 = await request(app)
            .get('/solicitacoes/minhas?unread=1')
            .set('Authorization', tokenMot)
            .send();
        const lista2 = Array.isArray(resUnreadMot2.body) ? resUnreadMot2.body : (resUnreadMot2.body?.rows || []);
        const ids2 = lista2.map(x => x.id);
        expect(ids2).not.toContain(solicitacaoId);
    });
});
