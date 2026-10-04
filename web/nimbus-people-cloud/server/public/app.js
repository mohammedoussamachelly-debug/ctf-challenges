// NIMBUS People Cloud — front end.
// Talks to the GraphQL API using only the "owned data" operations:
// me, myPayslips, myLeaveRequests, myManagerChain, requestLeave.
// It never requests another employee's record — that boundary only exists
// in the resolvers, which is the whole point of the challenge.

const GQL = '/graphql';
const TOKEN_KEY = 'nimbus.token';

function token() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function gql(query, variables) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error(json.errors[0].message || 'Request failed');
  }
  return json.data;
}

// ---------- formatting helpers ----------
const money = (cents, min = true) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: min ? 0 : 2 });
const initials = (f, l) => `${(f || '?')[0]}${(l || '')[0] || ''}`.toUpperCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function statusBadge(s) {
  const map = { APPROVED: 'ok', PENDING: 'pending', REJECTED: 'rej' };
  const label = s[0] + s.slice(1).toLowerCase();
  return `<span class="badge ${map[s] || 'neutral'}">${label}</span>`;
}

// ---------- state ----------
let ME = null;

// ======================================================================
// Login
// ======================================================================
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

document.getElementById('fill-demo').addEventListener('click', () => {
  document.getElementById('email').value = 'guest.employee@nimbus.example';
  document.getElementById('password').value = 'N1mbus@Guest2026';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    const data = await gql(
      `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token employee { id firstName lastName role } } }`,
      { e: email, p: password },
    );
    setToken(data.login.token);
    await boot();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

function logout() {
  clearToken();
  ME = null;
  document.getElementById('view-app').classList.add('hidden');
  document.getElementById('view-login').classList.remove('hidden');
  loginForm.reset();
}
document.getElementById('user-chip').addEventListener('click', () => {
  if (confirm('Sign out of NIMBUS People Cloud?')) logout();
});

// ======================================================================
// Shell / routing
// ======================================================================
const routes = {};
let currentRoute = 'dashboard';

document.querySelectorAll('.nav-item').forEach((el) => {
  el.addEventListener('click', () => navigate(el.dataset.route));
});
document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

function navigate(route) {
  currentRoute = route;
  document.querySelectorAll('.nav-item').forEach((el) =>
    el.classList.toggle('active', el.dataset.route === route),
  );
  const titles = { dashboard: 'Dashboard', profile: 'My Profile', payslips: 'Payslips', leave: 'Leave', org: 'Org Chart' };
  document.getElementById('crumb').textContent = titles[route] || route;
  document.getElementById('sidebar').classList.remove('open');
  (routes[route] || routes.dashboard)();
}

function render(html) {
  document.getElementById('content').innerHTML = html;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ======================================================================
// Views
// ======================================================================
routes.dashboard = async () => {
  render(`<div class="page-head"><h1>Welcome back, ${esc(ME.firstName)}</h1><p>Here's what's happening with your profile today.</p></div><div id="dash"></div>`);
  const data = await gql(`{
    me { leaveBalance department { name } title hiredAt }
    myPayslips { period netCents issuedAt }
    myLeaveRequests { id status }
    myManagerChain { firstName lastName title }
  }`);
  const latest = data.myPayslips[0];
  const pending = data.myLeaveRequests.filter((l) => l.status === 'PENDING').length;
  const mgr = data.myManagerChain[0];
  const tenureYears = ((Date.now() - new Date(data.me.hiredAt).getTime()) / (365.25 * 864e5)).toFixed(1);

  document.getElementById('dash').innerHTML = `
    <div class="grid cols-4">
      <div class="card stat">
        <div class="card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>Leave balance</div>
        <div class="v">${data.me.leaveBalance} <span style="font-size:14px;color:var(--text-faint)">days</span></div>
        <div class="trend up">${pending} request(s) pending</div>
      </div>
      <div class="card stat">
        <div class="card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8"/></svg>Latest net pay</div>
        <div class="v">${latest ? money(latest.netCents) : '—'}</div>
        <div class="d">${latest ? 'Period ' + latest.period : 'No payslips yet'}</div>
      </div>
      <div class="card stat">
        <div class="card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Reports to</div>
        <div class="v" style="font-size:18px">${mgr ? esc(mgr.firstName + ' ' + mgr.lastName) : '—'}</div>
        <div class="d">${mgr ? esc(mgr.title) : 'Top of chain'}</div>
      </div>
      <div class="card stat">
        <div class="card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Tenure</div>
        <div class="v">${tenureYears} <span style="font-size:14px;color:var(--text-faint)">yrs</span></div>
        <div class="d">${esc(data.me.department?.name || '')}</div>
      </div>
    </div>

    <div class="section-head"><h2>Recent payslips</h2><span class="link" data-go="payslips">View all →</span></div>
    <div class="card table-card">
      <table>
        <thead><tr><th>Period</th><th>Net pay</th><th>Issued</th><th></th></tr></thead>
        <tbody>
          ${data.myPayslips.slice(0, 3).map((p) => `<tr><td class="mono">${p.period}</td><td class="mono">${money(p.netCents, false)}</td><td class="mono">${p.issuedAt}</td><td style="text-align:right"><span class="badge ok">Available</span></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  document.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.go)));
};

routes.profile = async () => {
  const data = await gql(`{ me {
    id firstName lastName email title role location hiredAt leaveBalance salary
    department { name costCenter } manager { firstName lastName title }
  } }`);
  const m = data.me;
  render(`
    <div class="page-head"><h1>My Profile</h1><p>Your employment record as held in NIMBUS.</p></div>
    <div class="card pad-lg">
      <div class="profile-head">
        <div class="avatar">${initials(m.firstName, m.lastName)}</div>
        <div>
          <h2>${esc(m.firstName)} ${esc(m.lastName)}</h2>
          <div class="t">${esc(m.title)} · ${esc(m.department?.name || '')}</div>
        </div>
        <div style="margin-left:auto"><span class="badge neutral">${esc(m.role)}</span></div>
      </div>
      <div class="kv">
        <div class="k">Employee ID</div><div class="val mono">#${m.id}</div>
        <div class="k">Work email</div><div class="val">${esc(m.email)}</div>
        <div class="k">Location</div><div class="val">${esc(m.location)}</div>
        <div class="k">Cost center</div><div class="val mono">${esc(m.department?.costCenter || '—')}</div>
        <div class="k">Manager</div><div class="val">${m.manager ? esc(m.manager.firstName + ' ' + m.manager.lastName + ' · ' + m.manager.title) : '—'}</div>
        <div class="k">Start date</div><div class="val mono">${m.hiredAt}</div>
        <div class="k">Annual salary</div><div class="val mono">${money(m.salary * 100)}</div>
        <div class="k">Leave balance</div><div class="val mono">${m.leaveBalance} days</div>
      </div>
    </div>`);
};

routes.payslips = async () => {
  const data = await gql(`{ myPayslips { id period grossCents taxCents netCents issuedAt } }`);
  render(`
    <div class="page-head"><h1>Payslips</h1><p>Your payroll history. Figures shown gross and net of tax.</p></div>
    <div class="card table-card">
      <table>
        <thead><tr><th>Period</th><th>Gross</th><th>Tax</th><th>Net</th><th>Issued</th><th></th></tr></thead>
        <tbody>
          ${data.myPayslips.length ? data.myPayslips.map((p) => `
            <tr>
              <td class="mono">${p.period}</td>
              <td class="mono">${money(p.grossCents, false)}</td>
              <td class="mono" style="color:var(--text-dim)">−${money(p.taxCents, false)}</td>
              <td class="mono" style="font-weight:600">${money(p.netCents, false)}</td>
              <td class="mono">${p.issuedAt}</td>
              <td style="text-align:right"><span class="badge ok">Available</span></td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty">No payslips on record.</div></td></tr>`}
        </tbody>
      </table>
    </div>`);
};

routes.leave = async () => {
  render(`
    <div class="page-head"><h1>Leave</h1><p>Request time off and track your requests.</p></div>
    <div class="grid cols-2" style="align-items:start">
      <div class="card pad-lg">
        <div class="card-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>New request</div>
        <form id="leave-form">
          <div class="field">
            <label>Type</label>
            <select name="kind"><option value="ANNUAL">Annual leave</option><option value="SICK">Sick leave</option><option value="UNPAID">Unpaid leave</option></select>
          </div>
          <div class="form-row">
            <div class="field"><label>Start date</label><input type="date" name="startDate" required /></div>
            <div class="field"><label>End date</label><input type="date" name="endDate" required /></div>
          </div>
          <div class="field"><label>Working days</label><input type="number" name="days" min="0.5" step="0.5" value="1" required /></div>
          <div class="field"><label>Reason (optional)</label><textarea name="reason" rows="2" placeholder="Add context for your manager…"></textarea></div>
          <div class="form-actions"><button class="btn btn-primary" style="width:auto" type="submit">Submit request</button></div>
          <p id="leave-error" class="form-error"></p>
        </form>
      </div>
      <div class="card table-card" style="grid-column:auto">
        <table>
          <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr></thead>
          <tbody id="leave-rows"><tr><td colspan="4"><div class="empty">Loading…</div></td></tr></tbody>
        </table>
      </div>
    </div>`);

  async function loadLeave() {
    const data = await gql(`{ myLeaveRequests { id kind startDate endDate days status reason } }`);
    const rows = data.myLeaveRequests;
    document.getElementById('leave-rows').innerHTML = rows.length
      ? rows.map((l) => `<tr><td>${l.kind[0] + l.kind.slice(1).toLowerCase()}</td><td class="mono">${l.startDate} → ${l.endDate}</td><td class="mono">${l.days}</td><td>${statusBadge(l.status)}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty">No leave requests yet.</div></td></tr>`;
  }
  await loadLeave();

  document.getElementById('leave-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = document.getElementById('leave-error');
    err.textContent = '';
    try {
      await gql(
        `mutation($k:LeaveKind!,$s:String!,$en:String!,$d:Float!,$r:String){ requestLeave(kind:$k,startDate:$s,endDate:$en,days:$d,reason:$r){ id } }`,
        { k: f.kind.value, s: f.startDate.value, en: f.endDate.value, d: parseFloat(f.days.value), r: f.reason.value || null },
      );
      f.reset();
      toast('Leave request submitted for approval.');
      await loadLeave();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
};

routes.org = async () => {
  const data = await gql(`{
    me { firstName lastName title department { name } }
    myManagerChain { firstName lastName title department { name } }
  }`);
  const chain = [...data.myManagerChain].reverse(); // top first
  const nodes = [...chain, { ...data.me, _self: true }];
  render(`
    <div class="page-head"><h1>Org Chart</h1><p>Your reporting line, from leadership down to you.</p></div>
    <div class="card pad-lg">
      <div style="display:flex;flex-direction:column;gap:0">
        ${nodes.map((n, i) => `
          <div style="display:flex;align-items:center;gap:14px;padding:12px 4px;${i ? 'border-top:1px solid var(--border-soft)' : ''}">
            <div style="width:${18 + i * 10}px"></div>
            <div class="avatar" style="${n._self ? '' : 'background:linear-gradient(135deg,#334155,#475569)'}">${initials(n.firstName, n.lastName)}</div>
            <div>
              <div style="font-weight:600">${esc(n.firstName)} ${esc(n.lastName)} ${n._self ? '<span class="badge neutral" style="margin-left:6px">You</span>' : ''}</div>
              <div style="color:var(--text-dim);font-size:12.5px">${esc(n.title)} · ${esc(n.department?.name || '')}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`);
};

// ======================================================================
// Boot
// ======================================================================
async function boot() {
  try {
    const data = await gql(`{ me { id firstName lastName title role } }`);
    ME = data.me;
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-app').classList.remove('hidden');
    document.getElementById('top-avatar').textContent = initials(ME.firstName, ME.lastName);
    document.getElementById('top-name').textContent = `${ME.firstName} ${ME.lastName}`;
    document.getElementById('top-role').textContent = `${ME.title}`;
    navigate('dashboard');
  } catch {
    logout();
  }
}

if (token()) {
  boot();
}
