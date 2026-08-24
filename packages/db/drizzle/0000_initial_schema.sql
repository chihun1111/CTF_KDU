DO $$ BEGIN
  CREATE TYPE "challenge_difficulty" AS ENUM ('하', '중', '중상');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id_ciphertext" jsonb NOT NULL,
  "student_id_key_version" text NOT NULL,
  "student_id_hash" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'participant' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_student_id_hash_key" ON "users" ("student_id_hash");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "session_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_session_hash_key" ON "sessions" ("session_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_last_seen_idx" ON "sessions" ("last_seen_at");

CREATE TABLE IF NOT EXISTS "cookie_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "consent_version" text NOT NULL,
  "required_logging_accepted" boolean NOT NULL,
  "analytics_logging_accepted" boolean,
  "cookie_accepted" boolean NOT NULL,
  "ip_hash" text,
  "user_agent_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "flag_id" text NOT NULL,
  "title" text NOT NULL,
  "difficulty" "challenge_difficulty" NOT NULL,
  "category" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "challenges_flag_id_key" ON "challenges" ("flag_id");

CREATE TABLE IF NOT EXISTS "challenge_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "challenge_id" text NOT NULL REFERENCES "challenges"("id"),
  "flag_ciphertext" jsonb NOT NULL,
  "flag_key_version" text NOT NULL,
  "flag_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "challenge_flags_user_challenge_key" ON "challenge_flags" ("user_id", "challenge_id");
CREATE UNIQUE INDEX IF NOT EXISTS "challenge_flags_user_flag_hash_key" ON "challenge_flags" ("user_id", "flag_hash");

CREATE TABLE IF NOT EXISTS "challenge_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "challenge_id" text NOT NULL REFERENCES "challenges"("id"),
  "artifact_path" text NOT NULL,
  "artifact_hash" text NOT NULL,
  "artifact_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "claim_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "challenge_id" text NOT NULL REFERENCES "challenges"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "final_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "submitted_hash_bundle" jsonb NOT NULL,
  "correct_count" integer NOT NULL,
  "is_clear" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "final_submission_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "final_submission_id" uuid NOT NULL REFERENCES "final_submissions"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "flag_id" text NOT NULL,
  "challenge_id" text NOT NULL,
  "submitted_flag_hash" text,
  "is_correct" boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS "clears" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "clear_receipt_code" text NOT NULL,
  "cleared_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "clears_user_id_key" ON "clears" ("user_id");

CREATE TABLE IF NOT EXISTS "clear_view_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "final_submission_id" uuid NOT NULL REFERENCES "final_submissions"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "action" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
