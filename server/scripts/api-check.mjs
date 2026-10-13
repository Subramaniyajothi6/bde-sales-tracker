// End-to-end check of every API flow against a running server.
// DEVELOPMENT DATABASE ONLY: it creates test leads, payments and a BDE account.
// Needs the sample data (SEED_SAMPLE_DATA=true) and the server running:  npm run dev,  then  npm run check:api
import 'dotenv/config';
const BASE = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api`;
const ADMIN_PW = process.env.SEED_ADMIN_PASSWORD;
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };

function client() {
  let cookie = '';
  return async (method, path, body, isForm) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, type };
  };
}

const admin = client(), bde = client(), other = client(), anon = client();
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

console.log('Auth');
ok((await anon('GET', '/leads')).status === 401, 'no login -> 401');
ok((await admin('POST', '/auth/login', { employeeId: 'ADMIN-01', password: 'wrong' })).status === 401, 'wrong password -> 401');
let r = await admin('POST', '/auth/login', { employeeId: 'admin-01', password: ADMIN_PW });
ok(r.status === 200 && r.data.user.role === 'ADMIN' && !('passwordHash' in r.data.user), 'admin login (lowercase id), no hash leaked', r.data);
r = await bde('POST', '/auth/login', { employeeId: 'BDE-014', password: 'Bde@12345' });
ok(r.status === 200 && r.data.user.name === 'Karthik R.', 'BDE login', r.data);
await other('POST', '/auth/login', { employeeId: 'BDE-001', password: 'Bde@12345' });
ok((await bde('GET', '/users')).status === 403, 'BDE cannot list users');
ok((await bde('GET', '/stats/dashboard')).status === 403, 'BDE cannot see admin dashboard');

console.log('Today / calls');
r = await bde('GET', '/today');
const before = r.data.total;
ok(r.status === 200 && r.data.target === 80, 'today payload', r.data);
r = await bde('POST', '/today/calls', { outcome: 'INTERESTED' });
ok(r.status === 201 && r.data.total === before + 1, 'log a call increments total');
const callId = r.data.recent[0].id;
ok((await other('DELETE', `/today/calls/${callId}`)).status === 404, "another BDE can't undo my call");
r = await bde('DELETE', `/today/calls/${callId}`);
ok(r.status === 200 && r.data.total === before, 'undo call');
ok((await bde('POST', '/today/calls', { outcome: 'BAD' })).status === 400, 'bad outcome -> 400');
r = await bde('POST', '/today/submit');
ok(r.data.submittedAt, 'submit report');
ok((await bde('POST', '/today/calls', { outcome: 'NO_ANSWER' })).status === 409, 'cannot log after sending');
r = await bde('POST', '/today/reopen');
ok(r.data.submittedAt === null, 'reopen report');

console.log('Daily reports');
r = await admin('GET', '/daily-reports');
ok(r.status === 200 && r.data.rows.length >= 30, 'a row per active BDE today', r.data.rows?.length);
const karthik = r.data.rows.find(x => x.bde.employeeId === 'BDE-014');
ok(karthik && karthik.total === before && karthik.status === 'CALLING', 'Karthik row matches his today total', karthik);
r = await admin('GET', `/daily-reports?from=${today.slice(0, 8)}01&to=${today}`);
ok(r.status === 200 && r.data.rows[0].dueDays >= 1, 'month range');

console.log('Leads');
const courses = (await bde('GET', '/courses')).data.courses;
ok(courses.length === 6, '6 courses');
const phone = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
r = await bde('POST', '/leads', { name: 'Test Candidate', phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`, courseId: courses[0].id, followUpOn: today, nextAction: 'Call back' });
ok(r.status === 201 && r.data.lead.owner.employeeId === 'BDE-014', 'BDE adds lead', r.data);
const leadId = r.data.lead.id;
r = await other('POST', '/leads', { name: 'Dup', phone, courseId: courses[0].id });
ok(r.status === 409 && /Karthik/.test(r.data.error), 'duplicate phone blocked with owner name', r.data);
ok((await bde('POST', '/leads', { name: 'X', phone: '12345', courseId: courses[0].id })).status === 400, 'invalid phone -> 400');
ok((await other('GET', `/leads/${leadId}`)).status === 403, "other BDE can't open my lead");
r = await bde('GET', '/leads?view=due');
ok(r.status === 200 && r.data.leads.every(l => l.owner.employeeId === 'BDE-014') && r.data.leads.some(l => l.id === leadId), 'BDE sees only own leads; new lead is due');
r = await bde('PATCH', `/leads/${leadId}`, { stage: 'FOLLOW_UP', nextAction: 'Send fee details' });
ok(r.data.lead.stage === 'FOLLOW_UP', 'change stage');
ok((await bde('PATCH', `/leads/${leadId}`, { ownerId: 1 })).status === 403, 'BDE cannot reassign');
r = await bde('POST', `/leads/${leadId}/notes`, { text: 'Parent wants a call' });
ok(r.status === 201, 'add note');
r = await bde('GET', `/leads/${leadId}`);
ok(r.data.notes.length >= 3 && r.data.money.balance === courses[0].fee, 'lead detail: history + balance', r.data.money);

console.log('Interviews');
r = await bde('POST', '/interviews', { leadId, date: today, time: '15:30' });
ok(r.status === 201, 'schedule interview', r.data);
const ivId = r.data.interview.id;
ok((await bde('POST', '/interviews', { leadId, date: today, time: '16:00' })).status === 409, 'second open interview blocked');
ok((await bde('PATCH', `/interviews/${ivId}`, { result: 'SELECTED' })).status === 400, 'result before attendance blocked');
r = await bde('PATCH', `/interviews/${ivId}`, { status: 'ATTENDED' });
ok(r.data.interview.status === 'ATTENDED', 'mark attended');
r = await bde('PATCH', `/interviews/${ivId}`, { result: 'SELECTED' });
ok(r.data.interview.lead.stage === 'SELECTED', 'selected -> lead stage SELECTED', r.data);
r = await bde('GET', '/interviews?when=today');
ok(r.data.interviews.some(i => i.id === ivId), 'appears in today list');

console.log('Payments');
const fee = courses[0].fee;
let fd = new FormData();
Object.entries({ leadId, status: 'PROMISED', amount: fee, date: today }).forEach(([k, v]) => fd.append(k, String(v)));
r = await bde('POST', '/payments', fd, true);
ok(r.status === 201 && r.data.payment.check === null, 'record promise (no receipt)', r.data);
fd = new FormData();
Object.entries({ leadId, status: 'PARTIALLY_PAID', amount: 5000, date: today }).forEach(([k, v]) => fd.append(k, String(v)));
r = await bde('POST', '/payments', fd, true);
ok(r.status === 400 && /receipt/i.test(r.data.error), 'part payment without receipt blocked', r.data);
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
fd.append('receipt', new Blob([png], { type: 'image/png' }), 'upi.png');
r = await bde('POST', '/payments', fd, true);
ok(r.status === 201 && r.data.payment.check === 'TO_VERIFY', 'part payment with receipt', r.data);
const p1 = r.data.payment.id;
fd = new FormData();
Object.entries({ leadId, status: 'PAID', amount: 1, date: today }).forEach(([k, v]) => fd.append(k, String(v)));
fd.append('receipt', new Blob([png], { type: 'image/png' }), 'x.png');
r = await bde('POST', '/payments', fd, true);
ok(r.status === 400 && /balance/i.test(r.data.error), 'paid-in-full must equal balance', r.data);
fd = new FormData();
Object.entries({ leadId, status: 'PAID', amount: fee - 5000, date: today }).forEach(([k, v]) => fd.append(k, String(v)));
fd.append('receipt', new Blob([new TextEncoder().encode('hello')], { type: 'text/plain' }), 'x.txt');
r = await bde('POST', '/payments', fd, true);
ok(r.status === 400, 'non-image receipt rejected', r.data);
r = await bde('GET', `/payments/${p1}/receipt`);
ok(r.status === 200 && r.type.includes('image/png'), 'owner can open receipt');
ok((await other('GET', `/payments/${p1}/receipt`)).status === 403, "other BDE can't open receipt");
ok((await bde('POST', `/payments/${p1}/verify`)).status === 403, "BDE can't verify");
r = await admin('GET', '/payments?view=verify');
ok(r.data.payments.some(p => p.id === p1) && r.data.summary.toVerify >= 1, 'admin sees it to verify');
r = await admin('POST', `/payments/${p1}/reject`, { reason: 'Screenshot is unclear' });
ok(r.data.payment.check === 'REJECTED', 'reject receipt');
r = await bde('GET', `/leads/${leadId}`);
ok(r.data.money.paid === 0 && /rejected/i.test(r.data.lead.nextAction), 'rejected money not counted, BDE told why', r.data.lead);
fd = new FormData();
Object.entries({ leadId, status: 'PAID', amount: fee, date: today }).forEach(([k, v]) => fd.append(k, String(v)));
fd.append('receipt', new Blob([png], { type: 'image/png' }), 'gpay.png');
r = await bde('POST', '/payments', fd, true);
ok(r.status === 201, 'record full payment again', r.data);
const p2 = r.data.payment.id;
r = await admin('POST', `/payments/${p2}/verify`);
ok(r.data.payment.check === 'VERIFIED', 'verify');
ok((await admin('POST', `/payments/${p2}/verify`)).status === 409, 'double verify blocked');
r = await bde('GET', `/leads/${leadId}`);
ok(r.data.lead.stage === 'PAID' && r.data.money.balance === 0, 'lead becomes PAID, balance 0', r.data);
r = await bde('GET', '/payments?view=promised');
ok(!r.data.payments.some(p => p.lead.id === leadId), 'promise closed after payment');

console.log('Stats');
r = await admin('GET', '/stats/dashboard');
ok(r.status === 200 && r.data.today.calls > 0 && r.data.month.rows.length >= 30, 'dashboard', r.data.today);
r = await admin('GET', '/stats/monthly');
ok(r.data.rows[0].rank === 1 && r.data.totals.revenue > 0, 'monthly ranked', r.data.totals);
r = await bde('GET', '/stats/monthly');
ok(r.data.me && r.data.teamSize >= 30 && !r.data.rows, 'BDE gets only own month');
r = await bde('GET', '/stats/bde/1');
ok(r.status === 403, "BDE can't see another BDE's stats");
const myId = (await bde('GET', '/auth/me')).data.user.id;
r = await bde('GET', `/stats/bde/${myId}`);
ok(r.status === 200 && r.data.days.length > 0 && r.data.teamAverage.calls > 0, 'my month detail');
r = await admin('GET', '/stats/attendance');
ok(r.status === 200, 'attendance');

console.log('Exports');
for (const f of ['daily.xlsx', 'monthly.xlsx', 'leads.xlsx', 'payments.xlsx']) {
  r = await admin('GET', '/exports/' + f);
  ok(r.status === 200 && r.type.includes('spreadsheet') && r.data.byteLength > 1000, 'export ' + f, r.status);
}
ok((await bde('GET', '/exports/leads.xlsx')).status === 403, 'BDE cannot export');

console.log('Team');
const nextId = (await admin('GET', '/users/next-id')).data.employeeId;
r = await admin('POST', '/users', { name: 'New Person', phone: '9876501234' });
ok(r.status === 201 && r.data.user.employeeId === nextId && r.data.temporaryPassword, 'add BDE gets next ID ' + nextId, r.data);
const newId = r.data.user.id, tmp = r.data.temporaryPassword;
const fresh = client();
r = await fresh('POST', '/auth/login', { employeeId: nextId, password: tmp });
ok(r.data.user?.mustChangePassword === true, 'new BDE must change password');
ok((await fresh('POST', '/auth/change-password', { currentPassword: tmp, newPassword: 'short' })).status === 400, 'weak password rejected');
r = await fresh('POST', '/auth/change-password', { currentPassword: tmp, newPassword: 'NewPass123' });
ok(r.status === 200 && r.data.user.mustChangePassword === false, 'change password');
ok((await fresh('GET', '/today')).status === 200, 'still logged in after change');
await admin('PATCH', `/users/${newId}`, { active: false });
ok((await fresh('GET', '/today')).status === 401, 'deactivated BDE is logged out immediately');
r = await admin('POST', `/users/${newId}/reset-password`);
ok(r.data.temporaryPassword, 'reset password');

console.log('Logout');
await bde('POST', '/auth/logout');
ok((await bde('GET', '/today')).status === 401, 'logged out');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
