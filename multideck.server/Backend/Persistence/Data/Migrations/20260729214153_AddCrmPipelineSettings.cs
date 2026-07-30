using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Multideck.Persistence.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCrmPipelineSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CRM_LeadFieldSettings",
                columns: table => new
                {
                    CRMLeadField_ID = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Company_ID = table.Column<Guid>(type: "uuid", nullable: false),
                    CRMLeadField_Label = table.Column<string>(type: "text", nullable: false),
                    CRMLeadField_TypeCode = table.Column<string>(type: "text", nullable: false, defaultValue: "Dropdown"),
                    CRMLeadField_OptionsJSON = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'[]'::jsonb"),
                    CRMLeadField_ActiveOptionsJSON = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'[]'::jsonb"),
                    CRMLeadField_SortOrder = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Created_At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    Updated_At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    Updated_By_User_ID = table.Column<Guid>(type: "uuid", nullable: true),
                    Is_Deleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CRM_LeadFieldSettings", x => x.CRMLeadField_ID);
                });

            migrationBuilder.CreateTable(
                name: "CRM_Pipelines",
                columns: table => new
                {
                    CRMPipeline_ID = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Company_ID = table.Column<Guid>(type: "uuid", nullable: false),
                    CRMPipeline_Name = table.Column<string>(type: "text", nullable: false),
                    CRMPipeline_Owner = table.Column<string>(type: "text", nullable: true),
                    CRMPipeline_Automation = table.Column<string>(type: "text", nullable: true),
                    CRMPipeline_SortOrder = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Created_At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    Updated_At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    Created_By_User_ID = table.Column<Guid>(type: "uuid", nullable: true),
                    Updated_By_User_ID = table.Column<Guid>(type: "uuid", nullable: true),
                    Is_Deleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CRM_Pipelines", x => x.CRMPipeline_ID);
                });

            migrationBuilder.CreateTable(
                name: "CRM_PipelineStages",
                columns: table => new
                {
                    CRMPipelineStage_ID = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Company_ID = table.Column<Guid>(type: "uuid", nullable: false),
                    CRMPipeline_ID = table.Column<Guid>(type: "uuid", nullable: false),
                    CRMPipelineStage_Name = table.Column<string>(type: "text", nullable: false),
                    CRMPipelineStage_Tone = table.Column<string>(type: "text", nullable: false, defaultValue: "neutral"),
                    CRMPipelineStage_EntryRule = table.Column<string>(type: "text", nullable: true),
                    CRMPipelineStage_ProbabilityPct = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false, defaultValue: 0m),
                    CRMPipelineStage_SortOrder = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    CRMPipelineStage_IsDefaultEntry = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CRMPipelineStage_IsConversion = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    Created_At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    Updated_At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    Is_Deleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CRM_PipelineStages", x => x.CRMPipelineStage_ID);
                    table.ForeignKey(
                        name: "FK_CRM_PipelineStages_CRM_Pipelines_CRMPipeline_ID",
                        column: x => x.CRMPipeline_ID,
                        principalTable: "CRM_Pipelines",
                        principalColumn: "CRMPipeline_ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CRM_LeadFieldSettings_Company_ID_CRMLeadField_SortOrder",
                table: "CRM_LeadFieldSettings",
                columns: new[] { "Company_ID", "CRMLeadField_SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_CRM_Pipelines_Company_ID_CRMPipeline_SortOrder",
                table: "CRM_Pipelines",
                columns: new[] { "Company_ID", "CRMPipeline_SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_CRM_PipelineStages_CRMPipeline_ID_CRMPipelineStage_SortOrder",
                table: "CRM_PipelineStages",
                columns: new[] { "CRMPipeline_ID", "CRMPipelineStage_SortOrder" });

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CRM_LeadFieldSettings");

            migrationBuilder.DropTable(
                name: "CRM_PipelineStages");

            migrationBuilder.DropTable(
                name: "CRM_Pipelines");
        }
    }
}
