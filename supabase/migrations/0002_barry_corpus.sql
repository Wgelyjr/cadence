-- ============================================================================
-- Barry — curated knowledge corpus with vector embeddings.
--
-- Barry answers questions by RAG over this corpus (plus the caller's own
-- recent data summary). The corpus is deliberately small and curated; each
-- row is a short, self-contained reference note with a `topic` tag used to
-- narrow retrieval.
-- ============================================================================

create extension if not exists vector;

create table if not exists public.barry_corpus (
  id bigint generated always as identity primary key,
  topic text not null,
  title text not null,
  body text not null,
  embedding vector(384),
  created_at timestamptz not null default now()
);

create index if not exists barry_corpus_embedding_idx
  on public.barry_corpus using hnsw (embedding vector_cosine_ops);

create or replace function public.barry_search(query_embedding vector(384), top_k int default 4)
returns setof public.barry_corpus
language sql
stable
as $$
  select *
  from public.barry_corpus
  where embedding is not null
  order by embedding <=> query_embedding
  limit top_k;
$$;

grant select on public.barry_corpus to authenticated;

-- ---------------------------------------------------------------------------
-- Seed corpus.
--
-- These are general, mainstream, non-prescriptive references for new
-- caregivers. They are informational only and are NOT medical advice; the
-- app and Barry always say so. When in doubt, caregivers should talk to
-- their own pediatrician or a health professional.
--
-- Embeddings are filled by the `barry` edge function on first use when
-- BARRY_EMBEDDING_MODEL is set (it top-ups rows where embedding is null).
-- Without embeddings, Barry falls back to keyword search over topic/title/body.
-- ---------------------------------------------------------------------------

insert into public.barry_corpus (topic, title, body) values
('sleep', 'Newborn sleep basics',
 'Newborns (0–3 months) typically sleep 14–17 hours in 24-hour blocks, in short stretches of 2–4 hours, waking frequently to feed. They have no day/night distinction yet; exposure to daylight and dark, quiet nights helps their rhythm develop. Always place the baby on their back, on a firm flat surface, with no loose bedding, pillows or soft toys in the sleep space.'),
('sleep', 'Sleep safety',
 'Safe sleep: back position for every sleep, a firm flat mattress with a fitted sheet, no pillows, blankets, bumpers or soft toys, no co-sleeping on a sofa, and keep the sleep space smoke-free. Room-sharing (without bed-sharing) for at least the first 6 months is associated with a lower risk of SIDS.'),
('sleep', 'Naps and wake windows',
 'Wake windows (time baby can stay comfortably awake) are short in infancy and grow with age: roughly 45–90 minutes in the first months, 1.5–3 hours by 4–6 months, and 3–5+ hours by a year. Common patterns move from 4 naps/day (newborn) to 3 (3–4 months), 2 (6–9 months), and 1 (12+ months). Overtired babies often fight sleep; watch for early sleepy cues (glazed eyes, losing interest, yawning).'),
('sleep', 'Sleep regressions',
 'Sleep regressions — a few rough nights after previously good sleep — commonly appear around 4 months, 8–10 months and 18 months, often coinciding with development jumps (rolling, sitting, crawling, separation anxiety, language). They are usually temporary; keeping a consistent routine, a calm wind-down and safe-sleep habits tends to get through them.'),
('sleep', 'Sleeping through the night',
 'When babies start sleeping longer stretches (often 6+ hours) varies widely — many between 3 and 6 months, some later. Supporting longer sleep: a predictable wind-down routine, feeding well during the day, a consistent bedtime, and a calm response to night waking (brief, boring). Avoid expecting it on a specific date; it develops naturally.'),
('feeding', 'Breastfeeding basics',
 'Newborns commonly feed 8–12 times in 24 hours (about every 2–3 hours, "on demand"). Signs a baby is getting enough: at least 6 wet diapers a day after day 5, steady weight gain after an early dip, and contented behavior between feeds. Frequent feeding in the first weeks builds and maintains supply.'),
('feeding', 'Bottle feeding & formula',
 'Formula feeding: amounts vary by age — roughly 30–60 ml per feed in the first weeks up to 120–180 ml by 3–4 months, about 600–900 ml total per day by 4–6 months, decreasing as solids start. Never force a full bottle; follow hunger and fullness cues. Prepare formula per the tin''s instructions with water at the recommended temperature.'),
('feeding', 'Growth spurts',
 'Growth spurts — clusters of extra feeding, clinginess and sometimes fussiness — commonly hit around days 7–10, 3–4 weeks, 6–8 weeks, 3 months and 6 months, and at other times. They usually last 1–3 days (up to a week). Offer feeds as often as the baby wants; the episode passes and the baby looks calmer and bigger.'),
('feeding', 'Signs of hunger and fullness',
 'Early hunger cues: rooting, hand-to-mouth, stirring, lip smacking, looking for the breast. Fullness cues: turning away, closing the mouth, relaxed hands, falling asleep. Responding to early cues keeps feeding easier and helps baby learn self-regulation.'),
('diaper', 'Wet and dirty diapers',
 'Expect about 6+ wet diapers a day in the first weeks (this is a good sign of adequate intake). Stool color changes: tarry black meconium → greenish → yellow (breastfed) or tan/brown (formula) in the first week; color and frequency vary widely with diet. Occasional green, stringy or "seedy" stools are common and normal. Contact a professional urgently for white/gray, bloody or black (after the meconium phase) stools.'),
('diaper', 'Diaper rash basics',
 'Diaper rash is very common. Prevention: change promptly, keep the area clean and dry, let baby have regular diaper-free air time, and use a barrier cream (zinc oxide or petroleum-based) at changes. Persistent, weeping or blistered rash, or rash with fever, deserves a professional look.'),
('health', 'Fever in babies',
 'Fever threshold by age: rectal 38.0°C / 100.4°F or higher. Under 3 months old, any fever at or above that level should be checked with a doctor promptly. For older infants, comfort matters more than the number: keep them comfortably dressed, offer fluids, and use paracetamol or ibuprofen per weight-based dosing guidance from your pharmacist/doctor (never aspirin; ibuprofen only from 6 months). Seek care urgently for fever with lethargy, a non-blanching rash, fast or labored breathing, poor feeding, or a bulging fontanelle.'),
('health', 'When to seek urgent care',
 'Seek urgent help for: difficulty breathing or fast/labored breathing, bluish or pale-gray color, a high-pitched continuous cry, a non-blanching (doesn''t fade when pressed) rash, severe lethargy or a baby who is hard to wake, no wet diaper for 12+ hours, repeated vomiting or green/vomit, a bulging fontanelle, a fever in a baby under 3 months, or any time you are worried — instincts count.'),
('health', 'Vaccinations',
 'Vaccination schedules vary by country; follow the schedule from your local health service. Common side effects are mild and short: soreness at the injection site, low-grade fever, fussiness, sleepiness. Call a professional for a high or prolonged fever, a reaction at the site that spreads over days, or a baby who seems seriously unwell.'),
('milestones', 'Milestones 0–3 months',
 'Typical 0–3 months: lifts head during tummy time, smiles socially (around 6–8 weeks), coos, tracks faces and high-contrast objects, brings hands to mouth, calms when held. Milestones are ranges, not deadlines — babies vary widely.'),
('milestones', 'Milestones 4–6 months',
 'Typical 4–6 months: rolls both ways, sits with support, laughs and babbles, grasps and brings objects to mouth, may start on solids around 6 months when showing readiness (steady head control, sitting with support, interest in food).'),
('milestones', 'Milestones 7–9 months',
 'Typical 7–9 months: sits without support, crawls or scoots, transfers objects hand to hand, plays peek-a-boo, says "mama"/"dada" (nonspecific), may start on finger foods, stranger awareness emerges.'),
('milestones', 'Milestones 10–12 months',
 'Typical 10–12 months: pulls to stand, cruises along furniture, pincer grasp, first clear words, follows one-step instructions, shows objects to others (pointing).'),
('solids', 'Starting solids',
 'Readiness for solids is usually around 6 months: sits with support, holds head steady, shows interest in food, and loses the tongue-thrust reflex that pushes food out. Start with iron-rich foods (e.g., iron-fortified cereal, pureed meats, lentils). Offer one new food at a time and introduce potential allergens (peanut, egg, dairy) early and in small amounts, unless a doctor has advised otherwise. Continue milk (breast or formula) as the main drink through the first year; water can be sipped from 6 months.'),
('solids', 'Introducing allergens',
 'Current guidance (e.g., NICE, AAP) is to introduce common allergens early (around 4–6 months, once solids have started) rather than delaying — early, regular exposure to peanut, egg, milk and others may reduce the chance of allergy. Introduce each one in small amounts, a few days apart, in the daytime when you can watch for reactions. For babies with severe eczema or a family history of anaphylaxis, talk to a professional first.'),
('solids', 'Safe feeding practices',
 'Keep milk as the main drink in year one. Avoid honey under 12 months (botulism risk). Cut round foods (grapes, cherry tomatoes, sausage) into quarters and cook firm foods until soft; supervise every meal; sit baby upright; never leave them alone with food. If a baby chokes and can''t breathe, call emergency services.'),
('contractions', 'Labor: contraction timing',
 'Track contractions by noting start-to-start intervals and how long each lasts. Early labor: contractions are irregular, often 10–20 minutes apart. As labor establishes, they get longer, stronger and closer together — commonly the "5-1-1" rule is used to go in: contractions every 5 minutes, lasting 1 minute, for 1 hour (or follow your birth plan / midwife''s guidance). If membranes break, bleeding, or reduced baby movement occurs, contact a professional promptly.'),
('general', 'BabyApp is not medical advice',
 'BabyApp is a care-tracking tool. Everything it shows — including SweetSpot nap windows, schedules and Barry''s answers — is a starting point based on general information and your own recorded data, not medical advice. For anything health-related, or whenever you are worried, talk to your own doctor, midwife or a qualified health professional.');
