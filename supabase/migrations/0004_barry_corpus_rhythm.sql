-- ============================================================================
-- Barry corpus: the medical-disclaimer row still referenced SweetSpot, a
-- feature that was removed (replaced by Rhythm).
--
-- 0002_barry_corpus.sql seeds its rows with a plain INSERT, so re-applying
-- it would duplicate the seed rows; the existing row is fixed in place
-- instead. 0002 was also corrected at the source for fresh installs.
--
-- Idempotent: a no-op once applied, and on fresh installs where 0002 already
-- seeds the corrected text.
-- ============================================================================

update public.barry_corpus
set body = replace(body, 'SweetSpot nap windows', 'Rhythm intervals')
where body like '%SweetSpot%';
