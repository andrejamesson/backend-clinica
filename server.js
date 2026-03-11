require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const swaggerUi = require('swagger-ui-express');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const REFRESH_EXPIRES_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 7);
const DEFAULT_USER_EMAIL = process.env.DEFAULT_USER_EMAIL;
const DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD;

if (!JWT_SECRET || !REFRESH_SECRET) {
  console.error('JWT_SECRET e JWT_REFRESH_SECRET sao obrigatorios.');
  process.exit(1);
}

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function generateRefreshToken(user) {
  return jwt.sign({ sub: user.id }, REFRESH_SECRET, {
    expiresIn: `${REFRESH_EXPIRES_DAYS}d`
  });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso nao informado.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Token de acesso invalido ou expirado.' });
  }
}

async function ensureDefaultUser() {
  if (!DEFAULT_USER_EMAIL || !DEFAULT_USER_PASSWORD) {
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: DEFAULT_USER_EMAIL }
  });

  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_USER_PASSWORD, 10);

  await prisma.user.create({
    data: {
      email: DEFAULT_USER_EMAIL,
      passwordHash
    }
  });

  console.log(`Usuario inicial criado: ${DEFAULT_USER_EMAIL}`);
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function optionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function parseBirthDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Backend Clinica API',
    version: '1.0.0',
    description: 'API com autenticacao JWT e cadastro de pacientes.'
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      },
      RefreshBody: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } }
      },
      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'string', example: '24h' }
        }
      },
      PatientInput: {
        type: 'object',
        required: ['nomeCompleto', 'cpf', 'telefone'],
        properties: {
          nomeCompleto: { type: 'string' },
          cpf: { type: 'string' },
          telefone: { type: 'string' },
          email: { type: 'string', nullable: true },
          endereco: { type: 'string', nullable: true },
          dataNascimento: {
            type: 'string',
            format: 'date',
            nullable: true,
            example: '1990-12-31'
          },
          contatoEmergenciaNome: { type: 'string', nullable: true },
          contatoEmergenciaTelefone: { type: 'string', nullable: true },
          observacoes: { type: 'string', nullable: true }
        }
      },
      PatientUpdateInput: {
        type: 'object',
        properties: {
          nomeCompleto: { type: 'string' },
          cpf: { type: 'string' },
          telefone: { type: 'string' },
          email: { type: 'string', nullable: true },
          endereco: { type: 'string', nullable: true },
          dataNascimento: {
            type: 'string',
            format: 'date',
            nullable: true,
            example: '1990-12-31'
          },
          contatoEmergenciaNome: { type: 'string', nullable: true },
          contatoEmergenciaTelefone: { type: 'string', nullable: true },
          observacoes: { type: 'string', nullable: true }
        }
      },
      Patient: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fullName: { type: 'string' },
          cpf: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          birthDate: { type: 'string', format: 'date-time', nullable: true },
          emergencyName: { type: 'string', nullable: true },
          emergencyPhone: { type: 'string', nullable: true },
          notes: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/login': {
      post: {
        tags: ['Auth'],
        summary: 'Autentica usuario',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginBody' } }
          }
        },
        responses: {
          200: {
            description: 'Token gerado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } }
            }
          },
          400: { description: 'Entrada invalida' },
          401: { description: 'Credenciais invalidas' }
        }
      }
    },
    '/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Gera novo token via refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshBody' } }
          }
        },
        responses: {
          200: {
            description: 'Novo par de tokens',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } }
            }
          },
          400: { description: 'Entrada invalida' },
          401: { description: 'Refresh token invalido' }
        }
      }
    },
    '/pacientes': {
      get: {
        tags: ['Pacientes'],
        summary: 'Lista pacientes e busca por nome, CPF ou telefone',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: {
            description: 'Lista de pacientes',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Patient' } }
              }
            }
          },
          401: { description: 'Nao autorizado' }
        }
      },
      post: {
        tags: ['Pacientes'],
        summary: 'Cadastra paciente',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/PatientInput' } }
          }
        },
        responses: {
          201: {
            description: 'Paciente criado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Patient' } }
            }
          },
          400: { description: 'Entrada invalida' },
          401: { description: 'Nao autorizado' },
          409: {
            description: 'Conflito',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } }
            }
          }
        }
      }
    },
    '/pacientes/{id}': {
      get: {
        tags: ['Pacientes'],
        summary: 'Busca paciente por ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Paciente encontrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Patient' } }
            }
          },
          401: { description: 'Nao autorizado' },
          404: { description: 'Paciente nao encontrado' }
        }
      },
      put: {
        tags: ['Pacientes'],
        summary: 'Edita paciente',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/PatientUpdateInput' } }
          }
        },
        responses: {
          200: {
            description: 'Paciente atualizado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Patient' } }
            }
          },
          400: { description: 'Entrada invalida' },
          401: { description: 'Nao autorizado' },
          404: { description: 'Paciente nao encontrado' },
          409: { description: 'CPF duplicado' }
        }
      },
      delete: {
        tags: ['Pacientes'],
        summary: 'Exclui paciente',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          204: { description: 'Paciente removido' },
          401: { description: 'Nao autorizado' },
          404: { description: 'Paciente nao encontrado' }
        }
      }
    }
  }
};

app.get('/docs.json', (_req, res) => {
  return res.json(openapiSpec);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password sao obrigatorios.' });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({ error: 'Credenciais invalidas.' });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    return res.status(401).json({ error: 'Credenciais invalidas.' });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const refreshPayload = jwt.verify(refreshToken, REFRESH_SECRET);
  const expiresAt = new Date(refreshPayload.exp * 1000);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt
    }
  });

  return res.json({
    token: accessToken,
    refreshToken,
    expiresIn: JWT_EXPIRES_IN
  });
});

app.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken e obrigatorio.' });
  }

  let payload;

  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Refresh token invalido ou expirado.' });
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true }
  });

  if (!storedToken) {
    return res.status(401).json({ error: 'Refresh token nao reconhecido.' });
  }

  if (storedToken.revoked || storedToken.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Refresh token revogado ou expirado.' });
  }

  if (storedToken.userId !== payload.sub) {
    return res.status(401).json({ error: 'Refresh token invalido.' });
  }

  const newAccessToken = generateAccessToken(storedToken.user);
  const newRefreshToken = generateRefreshToken(storedToken.user);
  const newPayload = jwt.verify(newRefreshToken, REFRESH_SECRET);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true }
    }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.userId,
        expiresAt: new Date(newPayload.exp * 1000)
      }
    })
  ]);

  return res.json({
    token: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: JWT_EXPIRES_IN
  });
});

app.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken e obrigatorio.' });
  }

  await prisma.refreshToken.updateMany({
    where: { token: refreshToken, userId: req.user.sub },
    data: { revoked: true }
  });

  return res.status(204).send();
});

app.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, role: true, createdAt: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'Usuario nao encontrado.' });
  }

  return res.json(user);
});

app.use(requireAuth);

app.get('/protected', (_req, res) => {
  return res.json({ message: 'Rota protegida acessada com sucesso.' });
});

app.post('/pacientes', async (req, res) => {
  const {
    nomeCompleto,
    cpf,
    telefone,
    email,
    endereco,
    dataNascimento,
    contatoEmergenciaNome,
    contatoEmergenciaTelefone,
    observacoes
  } = req.body;

  const fullName = String(nomeCompleto || '').trim();
  const normalizedCpf = normalizeCpf(cpf);
  const normalizedPhone = normalizePhone(telefone);

  if (!fullName || !normalizedCpf || !normalizedPhone) {
    return res.status(400).json({
      error: 'Campos obrigatorios: nomeCompleto, cpf e telefone.'
    });
  }

  const birthDate = parseBirthDate(dataNascimento);
  if (dataNascimento && !birthDate) {
    return res.status(400).json({ error: 'dataNascimento invalida.' });
  }

  try {
    const patient = await prisma.patient.create({
      data: {
        fullName,
        cpf: normalizedCpf,
        phone: normalizedPhone,
        email: optionalString(email),
        address: optionalString(endereco),
        birthDate,
        emergencyName: optionalString(contatoEmergenciaNome),
        emergencyPhone: optionalString(contatoEmergenciaTelefone)
          ? normalizePhone(contatoEmergenciaTelefone)
          : null,
        notes: optionalString(observacoes)
      }
    });

    return res.status(201).json(patient);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'CPF ja cadastrado.' });
    }

    throw error;
  }
});

app.get('/pacientes', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const qDigits = q.replace(/\D/g, '');

  const orFilters = [];

  if (q) {
    orFilters.push({ fullName: { contains: q, mode: 'insensitive' } });
  }

  if (qDigits) {
    orFilters.push({ cpf: { contains: qDigits } });
    orFilters.push({ phone: { contains: qDigits } });
  }

  const patients = await prisma.patient.findMany({
    where: orFilters.length ? { OR: orFilters } : undefined,
    orderBy: { createdAt: 'desc' }
  });

  return res.json(patients);
});

app.get('/pacientes/:id', async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: req.params.id }
  });

  if (!patient) {
    return res.status(404).json({ error: 'Paciente nao encontrado.' });
  }

  return res.json(patient);
});

app.put('/pacientes/:id', async (req, res) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(req.body, 'nomeCompleto')) {
    const fullName = String(req.body.nomeCompleto || '').trim();
    if (!fullName) {
      return res.status(400).json({ error: 'nomeCompleto invalido.' });
    }
    data.fullName = fullName;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'cpf')) {
    const normalizedCpf = normalizeCpf(req.body.cpf);
    if (!normalizedCpf) {
      return res.status(400).json({ error: 'cpf invalido.' });
    }
    data.cpf = normalizedCpf;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'telefone')) {
    const normalizedPhone = normalizePhone(req.body.telefone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'telefone invalido.' });
    }
    data.phone = normalizedPhone;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
    data.email = optionalString(req.body.email);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'endereco')) {
    data.address = optionalString(req.body.endereco);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'dataNascimento')) {
    const birthDate = parseBirthDate(req.body.dataNascimento);

    if (req.body.dataNascimento && !birthDate) {
      return res.status(400).json({ error: 'dataNascimento invalida.' });
    }

    data.birthDate = birthDate;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'contatoEmergenciaNome')) {
    data.emergencyName = optionalString(req.body.contatoEmergenciaNome);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'contatoEmergenciaTelefone')) {
    data.emergencyPhone = optionalString(req.body.contatoEmergenciaTelefone)
      ? normalizePhone(req.body.contatoEmergenciaTelefone)
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'observacoes')) {
    data.notes = optionalString(req.body.observacoes);
  }

  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'Nenhum campo para atualizacao.' });
  }

  try {
    const updated = await prisma.patient.update({
      where: { id: req.params.id },
      data
    });

    return res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Paciente nao encontrado.' });
    }

    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'CPF ja cadastrado.' });
    }

    throw error;
  }
});

app.delete('/pacientes/:id', async (req, res) => {
  try {
    await prisma.patient.delete({
      where: { id: req.params.id }
    });

    return res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Paciente nao encontrado.' });
    }

    throw error;
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

async function bootstrap() {
  await ensureDefaultUser();

  app.listen(PORT, () => {
    console.log(`API em execucao na porta ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Falha ao iniciar aplicacao:', err);
  process.exit(1);
});
