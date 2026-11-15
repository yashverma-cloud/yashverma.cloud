import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'zod';

/**
 * Content rules (CLAUDE.md): every fact here comes from the legacy site or from Yash.
 * Nothing is invented. Where a fact is missing the field is omitted and the open
 * question is recorded in design/notes.md — never filled with a plausible guess.
 */

const experience = defineCollection({
  loader: glob({ base: './src/content/experience', pattern: '**/*.md' }),
  schema: z.object({
    role: z.string(),
    company: z.string(),
    location: z.string(),
    start: z.string(), // 'YYYY-MM', kept as a string so partial dates stay honest
    end: z.string().optional(), // omitted means current
    order: z.number(),
    /** One sentence on what changed. Omitted until Yash supplies it. */
    summary: z.string().optional(),
  }),
});

const work = defineCollection({
  loader: glob({ base: './src/content/work', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    /** Short result line used on the home page proof rows. */
    result: z.string(),
    /** How it was done — the mechanism, not an adjective. */
    mechanism: z.string(),
    /** The headline figure, e.g. '40%'. Omitted when there isn't a real one. */
    figure: z.string().optional(),
    /** Employer and year. Omitted until Yash confirms the mapping. */
    employer: z.string().optional(),
    year: z.string().optional(),
    order: z.number(),
    /** Phase 4 writes the body. Until then the page is not linked. */
    draft: z.boolean().default(true),
  }),
});

const certifications = defineCollection({
  loader: file('./src/content/certifications.yaml'),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    issuer: z.string(),
    date: z.string(),
    /** Individually named sub-credentials, where one entry covers several. */
    includes: z.array(z.string()).optional(),
  }),
});

/** Added in the Phase 2 review — third-party validation, from Yash's resume. */
const recognition = defineCollection({
  loader: file('./src/content/recognition.yaml'),
  schema: z.object({
    id: z.string(),
    award: z.string(),
    issuer: z.string(),
    /** Omitted where Yash has not given a date. Never guessed. */
    date: z.string().optional(),
    reason: z.string(),
  }),
});

const links = defineCollection({
  loader: file('./src/content/links.yaml'),
  schema: z.object({
    id: z.string(),
    label: z.string(),
    url: z.url(),
    /** 'primary' renders as the one filled button on the site. */
    kind: z.enum(['primary', 'secondary', 'social']),
    order: z.number(),
  }),
});

export const collections = {
  experience,
  work,
  certifications,
  recognition,
  links,
};
