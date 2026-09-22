-- A reply was already live on Google when we went to post. Two systems
-- (this app and tarte-seo-engine) reply to the same reviews and GBP's
-- reply endpoint is a PUT upsert, so without this state an approval here
-- silently overwrites the other system's published reply.
ALTER TYPE "ReviewReplyStatus" ADD VALUE IF NOT EXISTS 'ANSWERED_ELSEWHERE';
