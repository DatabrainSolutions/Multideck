using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Multideck.Persistence.Data.Migrations
{
    /// <inheritdoc />
    public partial class LinkDealsToTenantPipelines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CRMOppty_PipelineID",
                table: "CRM_Opportunities",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CRMOppty_PipelineStageID",
                table: "CRM_Opportunities",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                WITH deal_destinations AS (
                    SELECT DISTINCT ON (opportunity."CRMOppty_ID")
                        opportunity."CRMOppty_ID" AS deal_id,
                        pipeline."CRMPipeline_ID" AS pipeline_id,
                        stage."CRMPipelineStage_ID" AS stage_id
                    FROM "CRM_Opportunities" opportunity
                    LEFT JOIN "CRM_Leads" lead
                        ON lead."CRMLead_ID" = opportunity."CRMOppty_SourceLeadID"
                    JOIN "cmp_Users" owner
                        ON owner."User_ID" = COALESCE(opportunity."CRMOppty_OwnerUserID", lead."CRMLead_OwnerUserID")
                    JOIN "CRM_Pipelines" pipeline
                        ON pipeline."Company_ID" = owner."Company_ID"
                       AND pipeline."Is_Deleted" = FALSE
                    JOIN "CRM_PipelineStages" stage
                        ON stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID"
                       AND stage."Is_Deleted" = FALSE
                    WHERE opportunity."CRMOppty_PipelineID" IS NULL
                    ORDER BY
                        opportunity."CRMOppty_ID",
                        pipeline."CRMPipeline_SortOrder",
                        stage."CRMPipelineStage_IsDefaultEntry" DESC,
                        stage."CRMPipelineStage_SortOrder"
                )
                UPDATE "CRM_Opportunities" opportunity
                SET
                    "CRMOppty_PipelineID" = destination.pipeline_id,
                    "CRMOppty_PipelineStageID" = destination.stage_id
                FROM deal_destinations destination
                WHERE opportunity."CRMOppty_ID" = destination.deal_id;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_CRM_Opportunities_CRMOppty_PipelineID_CRMOppty_PipelineStag~",
                table: "CRM_Opportunities",
                columns: new[] { "CRMOppty_PipelineID", "CRMOppty_PipelineStageID" });

            migrationBuilder.CreateIndex(
                name: "IX_CRM_Opportunities_CRMOppty_PipelineStageID",
                table: "CRM_Opportunities",
                column: "CRMOppty_PipelineStageID");

            migrationBuilder.AddForeignKey(
                name: "FK_CRM_Opportunities_CRM_PipelineStages_CRMOppty_PipelineStage~",
                table: "CRM_Opportunities",
                column: "CRMOppty_PipelineStageID",
                principalTable: "CRM_PipelineStages",
                principalColumn: "CRMPipelineStage_ID",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CRM_Opportunities_CRM_Pipelines_CRMOppty_PipelineID",
                table: "CRM_Opportunities",
                column: "CRMOppty_PipelineID",
                principalTable: "CRM_Pipelines",
                principalColumn: "CRMPipeline_ID",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CRM_Opportunities_CRM_PipelineStages_CRMOppty_PipelineStage~",
                table: "CRM_Opportunities");

            migrationBuilder.DropForeignKey(
                name: "FK_CRM_Opportunities_CRM_Pipelines_CRMOppty_PipelineID",
                table: "CRM_Opportunities");

            migrationBuilder.DropIndex(
                name: "IX_CRM_Opportunities_CRMOppty_PipelineID_CRMOppty_PipelineStag~",
                table: "CRM_Opportunities");

            migrationBuilder.DropIndex(
                name: "IX_CRM_Opportunities_CRMOppty_PipelineStageID",
                table: "CRM_Opportunities");

            migrationBuilder.DropColumn(
                name: "CRMOppty_PipelineID",
                table: "CRM_Opportunities");

            migrationBuilder.DropColumn(
                name: "CRMOppty_PipelineStageID",
                table: "CRM_Opportunities");
        }
    }
}
