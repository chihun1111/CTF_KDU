CREATE INDEX IF NOT EXISTS "final_submissions_user_latest_idx"
  ON "final_submissions" ("user_id", "created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "final_submission_results_submission_idx"
  ON "final_submission_results" ("final_submission_id");
CREATE INDEX IF NOT EXISTS "final_submission_results_solved_idx"
  ON "final_submission_results" ("flag_id", "user_id") WHERE "is_correct" = true;
