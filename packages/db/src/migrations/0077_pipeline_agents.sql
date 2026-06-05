-- partyclip pipeline-agent roster (ADR-005). Loaded from the deployment content
-- repo (regular.yaml + persona files) into the DB by the content-load step (L4-E).
-- One row per (company, pipeline role). The runtime AgentRunnerProviders read
-- agents + personas from here, not from the paperclip-inherited `agents` table.
-- `config` holds the validated partyclip AgentConfig (jsonb); `persona` is the
-- persona text resolved from config.persona_ref at load time.

CREATE TABLE "pipeline_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role" text NOT NULL,
	"config" jsonb NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_agents" ADD CONSTRAINT "pipeline_agents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_agents_company_role_uq" ON "pipeline_agents" USING btree ("company_id","role");--> statement-breakpoint
CREATE INDEX "pipeline_agents_company_idx" ON "pipeline_agents" USING btree ("company_id");
