-- WHICH SPINE THIS PERSON WANTS THE SIDEBAR PAINTED IN — ink, paper or mango.
--
-- The twin of 0026_user_scale.sql. NULL is a real answer ("never chosen") and
-- reads as `paper` (shared/spine.ts DEFAULT_SPINE) rather than the kit's own
-- mango default, because this app's rail has always been paper and nobody who
-- has never opened Settings should see it change under them. No CHECK
-- constraint, for the same reason `scale` carries none: the allow-list is
-- SPINE_VALUES in shared/spine.ts, the door validates against it, and an
-- unrecognised value falls back rather than throws.
ALTER TABLE users ADD COLUMN spine TEXT;
