-- partyclip Phase 1 — governance pipeline (v0 active) plus v1 dormant tables.
-- See docs/handoff/03_DATA_MODEL.md and plans/your-next-task-list-soft-lantern.md.

CREATE TABLE "constitution_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"stable_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mutability" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"superseded_by" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"classification" text DEFAULT 'REGULAR' NOT NULL,
	"state" text DEFAULT 'DRAFTING' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_patch_id" uuid,
	"repealed_by" uuid,
	"pipeline_id" text,
	"cost_total" numeric(18, 6) DEFAULT '0' NOT NULL,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"published_at" timestamp with time zone,
	"repealed_at" timestamp with time zone,
	"killed_at" timestamp with time zone,
	"kill_reason_code" text,
	"paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb,
	"content_text" text,
	"producer_run_id" uuid,
	"visibility_class" text DEFAULT 'OPERATOR_ONLY' NOT NULL,
	"delay_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patch_stage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"agent_role" text NOT NULL,
	"agent_id" uuid,
	"model" text,
	"input_artifact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_artifact_id" uuid,
	"decision" text,
	"reason_code" text,
	"cost" numeric(18, 6) DEFAULT '0' NOT NULL,
	"duration_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"from_stage" text NOT NULL,
	"reason_code" text NOT NULL,
	"details_artifact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"session_id" uuid,
	"voter_role" text NOT NULL,
	"vote" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"rationale_artifact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dissents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"filed_by_role" text NOT NULL,
	"filed_by_agent_id" uuid,
	"filed_at_stage" text NOT NULL,
	"body" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"patch_id" uuid,
	"action" text NOT NULL,
	"operator_user_id" text NOT NULL,
	"rationale" text NOT NULL,
	"visibility_class" text DEFAULT 'PUBLIC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bias_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"stage_run_id" uuid NOT NULL,
	"overall_decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bias_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"suggestion" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "press_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"body" text NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_sub" text NOT NULL,
	"email" text,
	"handle" text,
	"tier" text DEFAULT 'FREE' NOT NULL,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"citizen_id" uuid,
	"body" text,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"processor" text NOT NULL,
	"kind" text NOT NULL,
	"transparency_level" text DEFAULT 'FULLY_PUBLIC' NOT NULL,
	"transparency_reason" text,
	"earmark_target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requester" text NOT NULL,
	"purpose" text NOT NULL,
	"scope" text NOT NULL,
	"approved_by_user_id" text,
	"audit_log_ref" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "constitution_articles" ADD CONSTRAINT "constitution_articles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "constitution_articles" ADD CONSTRAINT "constitution_articles_superseded_by_constitution_articles_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."constitution_articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_parent_patch_id_patches_id_fk" FOREIGN KEY ("parent_patch_id") REFERENCES "public"."patches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_repealed_by_patches_id_fk" FOREIGN KEY ("repealed_by") REFERENCES "public"."patches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_stage_runs" ADD CONSTRAINT "patch_stage_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_stage_runs" ADD CONSTRAINT "patch_stage_runs_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_stage_runs" ADD CONSTRAINT "patch_stage_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_stage_runs" ADD CONSTRAINT "patch_stage_runs_output_artifact_id_artifacts_id_fk" FOREIGN KEY ("output_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejections" ADD CONSTRAINT "rejections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejections" ADD CONSTRAINT "rejections_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejections" ADD CONSTRAINT "rejections_details_artifact_id_artifacts_id_fk" FOREIGN KEY ("details_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_rationale_artifact_id_artifacts_id_fk" FOREIGN KEY ("rationale_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dissents" ADD CONSTRAINT "dissents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dissents" ADD CONSTRAINT "dissents_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dissents" ADD CONSTRAINT "dissents_filed_by_agent_id_agents_id_fk" FOREIGN KEY ("filed_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_actions" ADD CONSTRAINT "operator_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_actions" ADD CONSTRAINT "operator_actions_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_reports" ADD CONSTRAINT "bias_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_reports" ADD CONSTRAINT "bias_reports_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_reports" ADD CONSTRAINT "bias_reports_stage_run_id_patch_stage_runs_id_fk" FOREIGN KEY ("stage_run_id") REFERENCES "public"."patch_stage_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_findings" ADD CONSTRAINT "bias_findings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_findings" ADD CONSTRAINT "bias_findings_report_id_bias_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."bias_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_releases" ADD CONSTRAINT "press_releases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "press_releases" ADD CONSTRAINT "press_releases_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_reactions" ADD CONSTRAINT "public_reactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_reactions" ADD CONSTRAINT "public_reactions_citizen_id_citizens_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_streams" ADD CONSTRAINT "revenue_streams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_grants" ADD CONSTRAINT "data_access_grants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "constitution_articles_company_stable_version_uq" ON "constitution_articles" USING btree ("company_id","stable_id","version");--> statement-breakpoint
CREATE INDEX "constitution_articles_company_idx" ON "constitution_articles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "patches_company_state_idx" ON "patches" USING btree ("company_id","state");--> statement-breakpoint
CREATE INDEX "patches_company_classification_idx" ON "patches" USING btree ("company_id","classification");--> statement-breakpoint
CREATE INDEX "patches_parent_idx" ON "patches" USING btree ("parent_patch_id");--> statement-breakpoint
CREATE INDEX "artifacts_company_kind_idx" ON "artifacts" USING btree ("company_id","kind");--> statement-breakpoint
CREATE INDEX "artifacts_producer_run_idx" ON "artifacts" USING btree ("producer_run_id");--> statement-breakpoint
CREATE INDEX "artifacts_visibility_idx" ON "artifacts" USING btree ("visibility_class");--> statement-breakpoint
CREATE INDEX "patch_stage_runs_patch_idx" ON "patch_stage_runs" USING btree ("patch_id");--> statement-breakpoint
CREATE INDEX "patch_stage_runs_patch_stage_idx" ON "patch_stage_runs" USING btree ("patch_id","stage");--> statement-breakpoint
CREATE INDEX "patch_stage_runs_company_stage_idx" ON "patch_stage_runs" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "rejections_patch_idx" ON "rejections" USING btree ("patch_id");--> statement-breakpoint
CREATE INDEX "rejections_company_idx" ON "rejections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "votes_patch_idx" ON "votes" USING btree ("patch_id");--> statement-breakpoint
CREATE INDEX "votes_session_idx" ON "votes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "dissents_patch_idx" ON "dissents" USING btree ("patch_id");--> statement-breakpoint
CREATE INDEX "dissents_company_idx" ON "dissents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "operator_actions_patch_idx" ON "operator_actions" USING btree ("patch_id");--> statement-breakpoint
CREATE INDEX "operator_actions_company_action_idx" ON "operator_actions" USING btree ("company_id","action");--> statement-breakpoint
CREATE INDEX "bias_reports_patch_idx" ON "bias_reports" USING btree ("patch_id");--> statement-breakpoint
CREATE INDEX "bias_reports_stage_run_idx" ON "bias_reports" USING btree ("stage_run_id");--> statement-breakpoint
CREATE INDEX "bias_findings_report_idx" ON "bias_findings" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "bias_findings_category_idx" ON "bias_findings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "press_releases_patch_idx" ON "press_releases" USING btree ("patch_id");--> statement-breakpoint
CREATE INDEX "press_releases_company_idx" ON "press_releases" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "citizens_company_provider_sub_uq" ON "citizens" USING btree ("company_id","provider_sub");--> statement-breakpoint
CREATE INDEX "citizens_company_handle_idx" ON "citizens" USING btree ("company_id","handle");--> statement-breakpoint
CREATE INDEX "public_reactions_target_idx" ON "public_reactions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "public_reactions_company_kind_idx" ON "public_reactions" USING btree ("company_id","kind");--> statement-breakpoint
CREATE INDEX "revenue_streams_company_processor_idx" ON "revenue_streams" USING btree ("company_id","processor");--> statement-breakpoint
CREATE INDEX "data_access_grants_company_idx" ON "data_access_grants" USING btree ("company_id");
