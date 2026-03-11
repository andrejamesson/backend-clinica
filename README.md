# backend-clinica

 https://fresh-hellebore-b85.notion.site/Sistema-completo-pra-cl-nica-do-zero-usando-IA-Codex-chatGpt-AO-VIVO-31f07a1c67dc8077bf39e6583388086a?pvs=73

API backend em Node.js com PostgreSQL (Prisma) e autenticacao JWT + refresh token.

## Estrutura

- `server.js`: aplicacao Express em arquivo unico
- `prisma/schema.prisma`: modelos e datasource do Prisma
- `.env`: variaveis de ambiente
- `.gitignore`
- `Procfile`: entrada para Heroku

## Requisitos

- Node.js 20+
- PostgreSQL

## Configuracao

1. Instale dependencias:

```bash
npm install
```

2. Configure o banco no `.env`:

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/backend_clinica?schema=public"
```

Opcional para criar usuario inicial automaticamente:

```env
DEFAULT_USER_EMAIL="admin@clinica.com"
DEFAULT_USER_PASSWORD="123456"
```

3. Rode as migracoes:

```bash
npx prisma migrate dev --name init
```

4. Suba a aplicacao:

```bash
npm start
```

## Autenticacao

Rotas publicas:
- `POST /login`
- `POST /refresh`

Todas as demais rotas exigem `Authorization: Bearer <token>`.

## Pacientes

Todas as rotas abaixo sao protegidas por JWT.

- `POST /pacientes`: cadastra paciente
- `GET /pacientes?q=<termo>`: lista e busca por nome, CPF ou telefone
- `GET /pacientes/:id`: detalha paciente
- `PUT /pacientes/:id`: edita cadastro
- `DELETE /pacientes/:id`: exclui cadastro

Campos obrigatorios no cadastro:
- `nomeCompleto`
- `cpf`
- `telefone`

Campos opcionais:
- `email`
- `endereco`
- `dataNascimento`
- `contatoEmergenciaNome`
- `contatoEmergenciaTelefone`
- `observacoes`

## Documentacao Swagger

- `GET /docs`: UI do Swagger
- `GET /docs.json`: especificacao OpenAPI em JSON

### Login

`POST /login`

```json
{
  "email": "usuario@dominio.com",
  "password": "senha"
}
```

Resposta:

```json
{
  "token": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "expiresIn": "24h"
}
```

### Refresh

`POST /refresh`

```json
{
  "refreshToken": "jwt_refresh_token"
}
```

## Deploy Heroku

1. Crie app e adicione PostgreSQL.
2. Configure variaveis de ambiente (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, etc.).
3. Garanta que migracoes sejam aplicadas no ambiente (`npx prisma migrate deploy`).
4. O Heroku executa `web: node server.js` via `Procfile`.
