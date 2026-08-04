-- 0014 — the usage log records WHICH kind of title each row carries (C3: the
-- team must see where its credits went). A row's summary is either what the
-- assistant DID ('action' — team-visible: the team is entitled to see actions
-- taken in its name) or what the person TYPED ('prompt' — the author's own;
-- showing a teammate's question would publish it). Back-filled rows (kind NULL)
-- default to PRIVATE: they cannot be classified after the fact, and a wrong
-- guess publishes somebody's question.
ALTER TABLE agent_usage_log ADD COLUMN kind TEXT; -- 'action' | 'prompt' | NULL (legacy → private)
