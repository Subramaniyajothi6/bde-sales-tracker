/**
 * Sets up a fresh database:
 *   - the first admin account (ADMIN-01, password from SEED_ADMIN_PASSWORD)
 *   - the list of courses and internships
 *   - with SEED_SAMPLE_DATA=true, 30 sample BDEs with calls, leads, interviews
 *     and payments for this month, for demos and testing. Never use on the live database.
 * Safe to run twice: it skips anything that already exists.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type CallOutcome } from '@prisma/client';
import { addDays, dateOnly, istInstant, todayIST, workDays } from '../src/lib/time.js';

const db = new PrismaClient();

const COURSES = [
  { name: 'Python full-stack course', type: 'COURSE', fee: 12000 },
  { name: 'Java development course', type: 'COURSE', fee: 10000 },
  { name: 'Data analytics course', type: 'COURSE', fee: 6500 },
  { name: 'Full-stack web internship', type: 'INTERNSHIP', fee: 12000 },
  { name: 'UI/UX design internship', type: 'INTERNSHIP', fee: 9000 },
  { name: 'Digital marketing internship', type: 'INTERNSHIP', fee: 5000 }
] as const;

const BDE_NAMES = ['Anitha R.', 'Bala S.', 'Nisha A.', 'Sanjay D.', 'Charan V.', 'Deepa M.', 'Priya S.', 'Ganesh K.', 'Lakshmi V.', 'Harini B.',
  'Ravi K.', 'Ayesha B.', 'Manoj P.', 'Karthik R.', 'Sneha P.', 'Meghna J.', 'Arjun M.', 'Farhan Q.', 'Divya S.', 'Imran H.',
  'Vikram T.', 'Kavitha N.', 'Gayathri M.', 'Imran K.', 'Rohit G.', 'Suresh L.', 'Pooja R.', 'Naveen J.', 'Revathi C.', 'Ajay V.'];
const CANDIDATES = ['Mohan S.', 'Ramya G.', 'Lavanya D.', 'Imran S.', 'Bhavya R.', 'Keerthana P.', 'Harish M.', 'Arvind R.', 'Nandini K.',
  'Deepak V.', 'Kavya N.', 'Vishnu A.', 'Sowmya R.', 'Prakash J.', 'Meera Iyer', 'Rahul Nair', 'Anjali Rao', 'Fathima Z.', 'Gokul T.',
  'Shalini B.', 'Ashwin K.', 'Janani S.', 'Tarun P.', 'Yamini L.', 'Sathish R.', 'Pavithra M.', 'Dinesh K.', 'Swetha V.', 'Bharath N.', 'Monika A.'];

// Small repeatable random generator, so every seeded database looks the same
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

async function main() {
  // Courses
  if ((await db.course.count()) === 0) {
    await db.course.createMany({ data: COURSES.map(c => ({ ...c })) });
    console.log(`Added ${COURSES.length} courses`);
  }

  // First admin
  const adminPw = process.env.SEED_ADMIN_PASSWORD;
  if (!(await db.user.findUnique({ where: { employeeId: 'ADMIN-01' } }))) {
    if (!adminPw || adminPw.length < 8) throw new Error('Set SEED_ADMIN_PASSWORD (8+ characters) in .env first');
    await db.user.create({
      data: {
        employeeId: 'ADMIN-01', name: 'Admin', phone: '+91 90000 00000', role: 'ADMIN',
        passwordHash: await bcrypt.hash(adminPw, 10), mustChangePassword: false, joinedOn: dateOnly(todayIST())
      }
    });
    console.log('Created ADMIN-01');
  }

  if (process.env.SEED_SAMPLE_DATA !== 'true') return;
  if (await db.user.count({ where: { role: 'BDE' } })) {
    console.log('BDEs already exist, sample data skipped');
    return;
  }
  await sample();
}

async function sample() {
  const today = todayIST();
  const demoHash = await bcrypt.hash('Bde@12345', 10);
  const courses = await db.course.findMany();
  const admin = await db.user.findUniqueOrThrow({ where: { employeeId: 'ADMIN-01' } });

  const bdes = [];
  for (let i = 0; i < BDE_NAMES.length; i++) {
    bdes.push(await db.user.create({
      data: {
        employeeId: `BDE-${String(i + 1).padStart(3, '0')}`, name: BDE_NAMES[i],
        phone: `+91 98${String(10000000 + i * 7919137).slice(0, 3)} ${String(10000 + i * 731).slice(0, 5)}`,
        email: `${BDE_NAMES[i].split(' ')[0].toLowerCase()}${i + 1}@adz4needz.com`,
        passwordHash: demoHash, mustChangePassword: false, joinedOn: dateOnly(addDays(today, -between(60, 500)))
      }
    }));
  }

  // Calls: every working day of this month so far, around the 80 target
  const days = workDays(`${today.slice(0, 8)}01`, today);
  const outcomes: CallOutcome[] = ['INTERESTED', 'CALL_BACK', 'NOT_INTERESTED', 'NO_ANSWER'];
  const weights = [0.17, 0.13, 0.36, 0.34];
  const calls = [];
  for (const b of bdes) {
    const skill = 0.8 + rand() * 0.35;
    for (const d of days) {
      const n = d === today ? between(25, 50) : Math.round(between(62, 92) * skill);
      for (let k = 0; k < n; k++) {
        let r = rand(), o = 0;
        while (o < 3 && r > weights[o]) r -= weights[o++];
        calls.push({ bdeId: b.id, outcome: outcomes[o], workDate: dateOnly(d), calledAt: istInstant(d, `${String(10 + Math.floor(k / 12)).padStart(2, '0')}:${String((k * 5) % 60).padStart(2, '0')}`) });
      }
    }
  }
  for (let i = 0; i < calls.length; i += 5000) await db.callLog.createMany({ data: calls.slice(i, i + 5000) });

  // Sent reports for past days
  await db.dailyReport.createMany({
    data: bdes.flatMap(b => days.filter(d => d !== today && rand() > 0.05).map(d => ({ bdeId: b.id, workDate: dateOnly(d), submittedAt: istInstant(d, '19:1' + between(0, 9)) })))
  });

  // Leads at every stage, with interviews and payments
  const stages = ['INTERESTED', 'FOLLOW_UP', 'INTERVIEW_SCHEDULED', 'SELECTED', 'PAYMENT_COMMITTED', 'PAID', 'NOT_INTERESTED'] as const;
  let phoneN = 9000000000;
  for (let i = 0; i < 120; i++) {
    const owner = i < 14 ? bdes[13] : pick(bdes); // Karthik R. (BDE-014) gets plenty, for BDE demos
    const course = pick(courses);
    const stage = pick(stages);
    const created = addDays(today, -between(1, 25));
    const fu = ['PAID', 'NOT_INTERESTED'].includes(stage) ? null : addDays(today, between(-4, 5));
    const lead = await db.lead.create({
      data: {
        name: i < CANDIDATES.length ? CANDIDATES[i] : `${pick(CANDIDATES).split(' ')[0]} ${String.fromCharCode(65 + (i % 26))}.`,
        phone: String(phoneN += between(1000, 99999)).slice(0, 10).replace(/^[0-5]/, '9'),
        courseId: course.id, ownerId: owner.id, stage,
        followUpOn: fu ? dateOnly(fu) : null,
        nextAction: { INTERESTED: 'Send the course brochure', FOLLOW_UP: 'Call back about fees', INTERVIEW_SCHEDULED: 'Remind about the interview',
          SELECTED: 'Ask when they can pay', PAYMENT_COMMITTED: 'Collect the payment', PAID: null, NOT_INTERESTED: null }[stage],
        createdAt: istInstant(created, '11:00'),
        notes: { create: { authorId: owner.id, text: 'Lead added', createdAt: istInstant(created, '11:00') } }
      }
    });
    if (['INTERVIEW_SCHEDULED', 'SELECTED', 'PAYMENT_COMMITTED', 'PAID'].includes(stage)) {
      const upcoming = stage === 'INTERVIEW_SCHEDULED';
      await db.interview.create({
        data: {
          leadId: lead.id, createdById: owner.id,
          scheduledAt: istInstant(upcoming ? addDays(today, between(0, 3)) : addDays(created, 2), pick(['11:00', '15:00', '16:30'])),
          status: upcoming ? 'SCHEDULED' : 'ATTENDED', result: upcoming ? null : 'SELECTED'
        }
      });
    }
    if (stage === 'PAYMENT_COMMITTED') {
      await db.payment.create({ data: { leadId: lead.id, recordedById: owner.id, amount: course.fee, status: 'PROMISED', date: dateOnly(fu!), createdAt: istInstant(created, '12:00') } });
    }
    if (stage === 'PAID') {
      const d = addDays(created, 4) > today ? today : addDays(created, 4);
      await db.payment.create({
        data: {
          leadId: lead.id, recordedById: owner.id, amount: course.fee, status: 'PAID', date: dateOnly(d),
          receiptName: 'sample-receipt.png', receiptType: 'image/png',
          check: i % 9 === 0 ? 'TO_VERIFY' : 'VERIFIED', verifiedById: i % 9 === 0 ? null : admin.id
        }
      });
    }
  }
  console.log(`Sample data: ${bdes.length} BDEs (password Bde@12345), ${calls.length} calls, 120 leads`);
}

main()
  .catch(e => { console.error(e.message ?? e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
