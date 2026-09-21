-- Default pick clock is 2:00. Existing leagues keep the value already stored.
ALTER TABLE "League" ALTER COLUMN "pickClockSeconds" SET DEFAULT 120;
