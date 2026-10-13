import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { isAdmin, requireAdmin } from '../lib/auth.js';

/** Courses and internships a candidate can sign up for. */
export const courses = Router();

courses.get('/', async (req, res) => {
  const list = await db.course.findMany({
    where: isAdmin(req) ? {} : { active: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }]
  });
  res.json({ courses: list });
});

const body = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  type: z.enum(['COURSE', 'INTERNSHIP']),
  fee: z.coerce.number().int().min(0, 'Fee cannot be negative'),
  active: z.boolean().optional()
});

courses.post('/', requireAdmin, async (req, res) => {
  const course = await db.course.create({ data: body.parse(req.body) });
  res.status(201).json({ course });
});

courses.patch('/:id', requireAdmin, async (req, res) => {
  const course = await db.course.update({ where: { id: Number(req.params.id) }, data: body.partial().parse(req.body) });
  res.json({ course });
});
