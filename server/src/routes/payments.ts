import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../lib/db.js';
import { HttpError, forbidden, notFound } from '../lib/http.js';
import { isAdmin, me, requireAdmin } from '../lib/auth.js';
import { storage } from '../lib/storage.js';
import { dateOnly, humanDate, monthRange, todayIST, ymd } from '../lib/time.js';
import { formatPhone } from '../lib/phone.js';
import { logActivity } from '../lib/activity.js';
import { userRef } from '../lib/present.js';
import { balanceOf, leadFor } from './leads.js';

export const payments = Router();

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (RECEIPT_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'The receipt must be a photo (JPG, PNG, WEBP, HEIC) or a PDF'));
  }
});

const withLead = { lead: { include: { owner: true, course: true } }, recordedBy: true } as const;
type Row = Prisma.PaymentGetPayload<{ include: typeof withLead }>;
const out = (p: Row) => ({
  id: p.id,
  amount: p.amount,
  status: p.status,
  date: ymd(p.date),
  note: p.note,
  hasReceipt: !!p.receiptKey,
  receiptName: p.receiptName,
  receiptType: p.receiptType,
  check: p.check,
  rejectReason: p.rejectReason,
  verifiedAt: p.verifiedAt,
  closedAt: p.closedAt,
  createdAt: p.createdAt,
  lead: { id: p.lead.id, name: p.lead.name, phone: formatPhone(p.lead.phone), course: p.lead.course.name, fee: p.lead.course.fee },
  owner: userRef(p.lead.owner),
  recordedBy: userRef(p.recordedBy)
});

payments.get('/', async (req, res) => {
  const { view = 'all' } = z.object({ view: z.enum(['verify', 'promised', 'received', 'all']).optional() }).parse(req.query);
  const scope: Prisma.PaymentWhereInput = isAdmin(req) ? {} : { lead: { ownerId: me(req).id } };
  const where: Record<string, Prisma.PaymentWhereInput> = {
    verify: { check: 'TO_VERIFY' },
    promised: { status: 'PROMISED', closedAt: null },
    received: { status: { in: ['PARTIALLY_PAID', 'PAID'] } },
    all: {}
  };
  const month = monthRange(todayIST().slice(0, 7));
  const [list, toVerify, promised, collected] = await Promise.all([
    db.payment.findMany({
      where: { ...scope, ...where[view] },
      include: withLead,
      orderBy: view === 'promised' ? { date: 'asc' } : { createdAt: 'desc' },
      take: 500
    }),
    db.payment.count({ where: { ...scope, check: 'TO_VERIFY' } }),
    db.payment.aggregate({ where: { ...scope, ...where.promised }, _count: { _all: true }, _sum: { amount: true } }),
    db.payment.aggregate({
      where: { ...scope, ...where.received, check: 'VERIFIED', date: { gte: dateOnly(month.from), lte: dateOnly(month.to) } },
      _sum: { amount: true }
    })
  ]);
  res.json({
    payments: list.map(out),
    summary: {
      toVerify,
      promisedCount: promised._count._all,
      promisedAmount: promised._sum.amount ?? 0,
      collectedThisMonth: collected._sum.amount ?? 0
    }
  });
});

/**
 * Record a payment (multipart form, field "receipt" for the file).
 * PROMISED needs no receipt. Money received always needs one and waits for the admin to verify it.
 */
payments.post('/', upload.single('receipt'), async (req, res) => {
  const b = z.object({
    leadId: z.coerce.number().int(),
    status: z.enum(['PROMISED', 'PARTIALLY_PAID', 'PAID']),
    amount: z.coerce.number().int('Enter the amount in whole rupees').positive('Enter an amount above zero'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    note: z.string().trim().max(300).optional()
  }).parse(req.body);
  const lead = await leadFor(req, b.leadId);
  const money = await balanceOf(lead.id, lead.course.fee);
  const today = todayIST();

  if (b.status === 'PROMISED') {
    if (b.date < today) throw new HttpError(400, 'A promised date must be today or later');
  } else {
    if (b.date > today) throw new HttpError(400, "A payment can't be dated in the future");
    if (!req.file) throw new HttpError(400, 'Add the receipt or payment screenshot');
    if (money.balance === 0) throw new HttpError(400, `${lead.name} has already paid the full fee`);
    if (b.amount > money.balance) throw new HttpError(400, `That's more than the balance of ₹${money.balance.toLocaleString('en-IN')}`);
    if (b.status === 'PAID' && b.amount !== money.balance) throw new HttpError(400, `Paid in full means the whole balance, ₹${money.balance.toLocaleString('en-IN')}. Choose Part paid for less.`);
    if (b.status === 'PARTIALLY_PAID' && b.amount === money.balance) throw new HttpError(400, 'That clears the balance. Choose Paid in full.');
  }

  const receiptKey = req.file ? await storage.save(req.file.buffer, req.file.originalname) : null;
  const actor = me(req).id;
  const amountText = `₹${b.amount.toLocaleString('en-IN')}`;

  const created = await db.$transaction(async tx => {
    // A new promise replaces an older open one; money received closes open promises
    await tx.payment.updateMany({ where: { leadId: lead.id, status: 'PROMISED', closedAt: null }, data: { closedAt: new Date() } });
    const p = await tx.payment.create({
      data: {
        leadId: lead.id, recordedById: actor, amount: b.amount, status: b.status, date: dateOnly(b.date), note: b.note || null,
        receiptKey, receiptName: req.file?.originalname.slice(0, 200) ?? null, receiptType: req.file?.mimetype ?? null,
        check: b.status === 'PROMISED' ? null : 'TO_VERIFY'
      },
      include: withLead
    });
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        ...(b.status === 'PROMISED'
          ? { stage: 'PAYMENT_COMMITTED', followUpOn: dateOnly(b.date), nextAction: `Collect ${amountText}` }
          : { followUpOn: null, nextAction: b.status === 'PAID' ? 'Waiting for admin to verify the receipt' : 'Collect the balance' }),
        notes: { create: { authorId: actor, text: b.status === 'PROMISED' ? `Promised to pay ${amountText} by ${humanDate(b.date)}` : `Paid ${amountText} (receipt sent for checking)` } }
      }
    });
    return p;
  });
  logActivity(actor, 'PAYMENT_RECORDED', `${lead.name}: ${b.status === 'PROMISED' ? `promised ${amountText} by ${humanDate(b.date)}` : `received ${amountText}`}`);
  res.status(201).json({ payment: out(created) });
});

/** The receipt file. BDEs can only open their own leads' receipts. */
payments.get('/:id/receipt', async (req, res) => {
  const p = await db.payment.findUnique({ where: { id: Number(req.params.id) }, include: { lead: true } });
  if (!p || !p.receiptKey) throw notFound('Receipt');
  if (!isAdmin(req) && p.lead.ownerId !== me(req).id) throw forbidden();
  res.setHeader('Content-Type', p.receiptType ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${(p.receiptName ?? 'receipt').replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  (await storage.read(p.receiptKey)).pipe(res);
});

payments.post('/:id/verify', requireAdmin, async (req, res) => {
  const p = await db.payment.findUnique({ where: { id: Number(req.params.id) }, include: { lead: { include: { course: true } } } });
  if (!p || p.check === null) throw notFound('Receipt');
  if (p.check !== 'TO_VERIFY') throw new HttpError(409, 'This receipt has already been checked');

  const updated = await db.$transaction(async tx => {
    const u = await tx.payment.update({
      where: { id: p.id },
      data: { check: 'VERIFIED', verifiedById: me(req).id, verifiedAt: new Date(), rejectReason: null },
      include: withLead
    });
    const agg = await tx.payment.aggregate({ where: { leadId: p.leadId, check: 'VERIFIED' }, _sum: { amount: true } });
    const fullyPaid = (agg._sum.amount ?? 0) >= p.lead.course.fee;
    await tx.lead.update({
      where: { id: p.leadId },
      data: {
        ...(fullyPaid ? { stage: 'PAID', followUpOn: null, nextAction: null } : {}),
        notes: { create: { authorId: me(req).id, text: `Receipt for ₹${p.amount.toLocaleString('en-IN')} verified${fullyPaid ? '. Fully paid.' : ''}` } }
      }
    });
    return u;
  });
  logActivity(me(req).id, 'RECEIPT_VERIFIED', `${p.lead.name}, ₹${p.amount.toLocaleString('en-IN')}`);
  res.json({ payment: out(updated) });
});

payments.post('/:id/reject', requireAdmin, async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Say why the receipt is rejected').max(200) }).parse(req.body);
  const p = await db.payment.findUnique({ where: { id: Number(req.params.id) } });
  if (!p || p.check === null) throw notFound('Receipt');
  if (p.check !== 'TO_VERIFY') throw new HttpError(409, 'This receipt has already been checked');
  const [updated] = await db.$transaction([
    db.payment.update({ where: { id: p.id }, data: { check: 'REJECTED', rejectReason: reason, verifiedById: me(req).id, verifiedAt: new Date() }, include: withLead }),
    db.lead.update({
      where: { id: p.leadId },
      data: {
        followUpOn: dateOnly(todayIST()), nextAction: `Receipt rejected: ${reason}. Record the payment again.`,
        notes: { create: { authorId: me(req).id, text: `Receipt for ₹${p.amount.toLocaleString('en-IN')} rejected: ${reason}` } }
      }
    })
  ]);
  logActivity(me(req).id, 'RECEIPT_REJECTED', `${updated.lead.name}, ₹${p.amount.toLocaleString('en-IN')}: ${reason}`);
  res.json({ payment: out(updated) });
});
