-- Initial managers password, as a bcrypt hash. Set from the admin under
-- Settings > Managers password to change it; that overwrites this row.
-- DO NOTHING on conflict so a password already set from the admin wins.
INSERT INTO "AppSetting" ("key","value","updatedAt")
VALUES ('managerPasswordHash', '$2b$10$IavT4A2k1HziRb.Td5z7fOGUP.Ng6GRo9ulCoho37qbLS9ZjFeS0u', now())
ON CONFLICT ("key") DO NOTHING;
