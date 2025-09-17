import { v4 as uuid } from 'uuid';
import { query, withTransaction } from '../db/index.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/token.js';

const DEFAULT_ROLE = process.env.DEFAULT_ROLE || 'user';

const mapUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const fetchUserByEmail = async (client, email) => {
  const result = await client.query(
    'SELECT * FROM public.users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
};

const fetchUserById = async (client, id) => {
  const result = await client.query(
    'SELECT * FROM public.users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
};

const fetchRolesForUser = async (client, userId) => {
  const result = await client.query(
    `SELECT r.name
       FROM public.roles r
       INNER JOIN public.user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1`,
    [userId]
  );
  return result.rows.map((row) => row.name);
};

const persistRefreshToken = async (client, userId, refreshToken, metadata = {}) => {
  const { token, expiresAt } = refreshToken;
  const hashed = hashToken(token);
  await client.query(
    `INSERT INTO public.refresh_tokens
      (id, user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuid(), userId, hashed, expiresAt.toISOString(), metadata.userAgent || null, metadata.ipAddress || null]
  );
};

const buildAuthPayload = async (client, user, metadata) => {
  const roles = await fetchRolesForUser(client, user.id);
  const defaultRole = roles.includes(DEFAULT_ROLE) ? DEFAULT_ROLE : roles[0] || DEFAULT_ROLE;

  const accessToken = generateAccessToken({
    sub: user.id,
    email: user.email,
    roles,
    defaultRole
  });

  const refreshToken = generateRefreshToken();
  await persistRefreshToken(client, user.id, refreshToken, metadata);

  return {
    accessToken,
    refreshToken: refreshToken.token,
    refreshTokenExpiresAt: refreshToken.expiresAt,
    roles,
    defaultRole
  };
};

export const registerUser = async ({ email, password, displayName }, metadata = {}) => {
  return withTransaction(async (client) => {
    const normalizedEmail = email.toLowerCase();
    const existing = await fetchUserByEmail(client, normalizedEmail);
    if (existing) {
      const error = new Error('Email already registered');
      error.status = 409;
      throw error;
    }

    const roleResult = await client.query('SELECT id FROM public.roles WHERE name = $1', [DEFAULT_ROLE]);
    if (roleResult.rowCount === 0) {
      const error = new Error('Default role is not configured in the database');
      error.status = 500;
      throw error;
    }

    const passwordHash = await hashPassword(password);
    const userId = uuid();
    const insertResult = await client.query(
      `INSERT INTO public.users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, normalizedEmail, passwordHash, displayName]
    );

    await client.query(
      `INSERT INTO public.user_roles (user_id, role_id)
       VALUES ($1, $2)`,
      [userId, roleResult.rows[0].id]
    );

    const authPayload = await buildAuthPayload(client, insertResult.rows[0], metadata);

    return {
      user: mapUser(insertResult.rows[0]),
      ...authPayload
    };
  });
};

export const authenticateUser = async ({ email, password }, metadata = {}) => {
  return withTransaction(async (client) => {
    const user = await fetchUserByEmail(client, email.toLowerCase());
    if (!user || !user.is_active) {
      const error = new Error('Invalid credentials');
      error.status = 401;
      throw error;
    }

    const matches = await comparePassword(password, user.password_hash);
    if (!matches) {
      const error = new Error('Invalid credentials');
      error.status = 401;
      throw error;
    }

    return {
      user: mapUser(user),
      ...(await buildAuthPayload(client, user, metadata))
    };
  });
};

export const refreshUserSession = async (refreshToken, metadata = {}) => {
  return withTransaction(async (client) => {
    const hashed = hashToken(refreshToken);
    const result = await client.query(
      `SELECT * FROM public.refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hashed]
    );

    const tokenRow = result.rows[0];
    if (!tokenRow) {
      const error = new Error('Refresh token not found');
      error.status = 401;
      throw error;
    }

    if (tokenRow.revoked_at) {
      const error = new Error('Refresh token revoked');
      error.status = 401;
      throw error;
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      const error = new Error('Refresh token expired');
      error.status = 401;
      throw error;
    }

    // Rotate refresh token
    await client.query(
      `UPDATE public.refresh_tokens
          SET revoked_at = NOW()
        WHERE id = $1`,
      [tokenRow.id]
    );

    const user = await fetchUserById(client, tokenRow.user_id);
    if (!user || !user.is_active) {
      const error = new Error('User no longer active');
      error.status = 403;
      throw error;
    }

    const payload = await buildAuthPayload(client, user, metadata);
    return {
      user: mapUser(user),
      ...payload
    };
  });
};

export const revokeRefreshToken = async (refreshToken) => {
  const hashed = hashToken(refreshToken);
  await query(
    `UPDATE public.refresh_tokens
        SET revoked_at = NOW()
      WHERE token_hash = $1`,
    [hashed]
  );
};

export const getUserProfile = async (userId) => {
  const result = await query(
    `SELECT id, email, display_name, is_active, created_at, updated_at
       FROM public.users
      WHERE id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const rolesResult = await query(
    `SELECT r.name
       FROM public.roles r
       INNER JOIN public.user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1`,
    [userId]
  );

  return {
    ...mapUser(result.rows[0]),
    roles: rolesResult.rows.map((row) => row.name)
  };
};

