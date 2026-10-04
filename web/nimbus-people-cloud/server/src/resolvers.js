import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { query } from './db.js';
import { signSession } from './auth.js';

// --- row -> GraphQL object mappers -----------------------------------------

function mapEmployee(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    title: row.title,
    role: row.role,
    location: row.location,
    hiredAt: row.hired_at instanceof Date ? row.hired_at.toISOString().slice(0, 10) : row.hired_at,
    leaveBalance: Number(row.leave_balance),
    salary: row.salary,
    passwordHash: row.password_hash,
    confidentialMemo: row.confidential_memo,
    vaultSecret: row.vault_secret,
    _departmentId: row.department_id,
    _managerId: row.manager_id,
  };
}

function mapPayslip(row) {
  return {
    id: String(row.id),
    period: row.period,
    grossCents: row.gross_cents,
    taxCents: row.tax_cents,
    netCents: row.net_cents,
    issuedAt: row.issued_at instanceof Date ? row.issued_at.toISOString().slice(0, 10) : row.issued_at,
    _employeeId: row.employee_id,
  };
}

function mapLeave(row) {
  return {
    id: String(row.id),
    kind: row.kind,
    startDate: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : row.start_date,
    endDate: row.end_date instanceof Date ? row.end_date.toISOString().slice(0, 10) : row.end_date,
    days: Number(row.days),
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// --- helpers ---------------------------------------------------------------

function requireAuth(ctx) {
  // Authentication only. This is deliberately all the checking there is:
  // resolvers below never verify that the requested object belongs to the
  // caller (the BOLA / IDOR bug).
  if (!ctx.session) {
    throw new GraphQLError('You must be signed in.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return ctx.session;
}

async function loadEmployee(id) {
  const { rows } = await query('SELECT * FROM employees WHERE id = $1', [id]);
  return mapEmployee(rows[0]);
}

// --- resolvers -------------------------------------------------------------

export const resolvers = {
  Query: {
    me: async (_p, _a, ctx) => {
      const s = requireAuth(ctx);
      return loadEmployee(s.employeeId);
    },

    myPayslips: async (_p, _a, ctx) => {
      const s = requireAuth(ctx);
      const { rows } = await query(
        'SELECT * FROM payslips WHERE employee_id = $1 ORDER BY period DESC',
        [s.employeeId],
      );
      return rows.map(mapPayslip);
    },

    myLeaveRequests: async (_p, _a, ctx) => {
      const s = requireAuth(ctx);
      const { rows } = await query(
        'SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY start_date DESC',
        [s.employeeId],
      );
      return rows.map(mapLeave);
    },

    myManagerChain: async (_p, _a, ctx) => {
      const s = requireAuth(ctx);
      const chain = [];
      let current = await loadEmployee(s.employeeId);
      const seen = new Set();
      while (current && current._managerId && !seen.has(current._managerId)) {
        seen.add(current._managerId);
        const mgr = await loadEmployee(current._managerId);
        if (!mgr) break;
        chain.push(mgr);
        current = mgr;
      }
      return chain;
    },

    // ---------------------------------------------------------------
    // Reachable via the API, never called by the UI.
    // BUG: authenticated-only. No ownership / role check on `id`.
    // ---------------------------------------------------------------
    employee: async (_p, { id }, ctx) => {
      requireAuth(ctx);
      return loadEmployee(Number(id));
    },

    payslipsFor: async (_p, { employeeId }, ctx) => {
      requireAuth(ctx);
      const { rows } = await query(
        'SELECT * FROM payslips WHERE employee_id = $1 ORDER BY period DESC',
        [Number(employeeId)],
      );
      return rows.map(mapPayslip);
    },

    departments: async (_p, _a, ctx) => {
      requireAuth(ctx);
      const { rows } = await query('SELECT * FROM departments ORDER BY id');
      return rows.map((r) => ({ id: String(r.id), name: r.name, costCenter: r.cost_center }));
    },
  },

  Mutation: {
    login: async (_p, { email, password }) => {
      const { rows } = await query('SELECT * FROM employees WHERE lower(email) = lower($1)', [email]);
      const row = rows[0];
      // Uniform failure — do not reveal whether the email exists.
      const ok = row ? await bcrypt.compare(password, row.password_hash) : false;
      if (!ok) {
        throw new GraphQLError('Invalid email or password.', {
          extensions: { code: 'BAD_CREDENTIALS' },
        });
      }
      const employee = mapEmployee(row);
      return { token: signSession({ id: row.id, role: row.role, email: row.email }), employee };
    },

    requestLeave: async (_p, args, ctx) => {
      const s = requireAuth(ctx);
      // This mutation is correctly scoped: it always writes for the caller.
      const { rows } = await query(
        `INSERT INTO leave_requests (employee_id, kind, start_date, end_date, days, status, reason)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6) RETURNING *`,
        [s.employeeId, args.kind, args.startDate, args.endDate, args.days, args.reason || null],
      );
      return mapLeave(rows[0]);
    },
  },

  Employee: {
    department: async (emp) => {
      if (!emp._departmentId) return null;
      const { rows } = await query('SELECT * FROM departments WHERE id = $1', [emp._departmentId]);
      const d = rows[0];
      return d ? { id: String(d.id), name: d.name, costCenter: d.cost_center } : null;
    },
    manager: async (emp) => {
      if (!emp._managerId) return null;
      return loadEmployee(emp._managerId);
    },
    // salary / passwordHash / confidentialMemo / vaultSecret are returned
    // straight from the record with NO field-level authorization. Combined
    // with the IDOR above, any authenticated user can read them for anyone.
  },

  Payslip: {
    employee: async (p) => loadEmployee(p._employeeId),
  },
};
