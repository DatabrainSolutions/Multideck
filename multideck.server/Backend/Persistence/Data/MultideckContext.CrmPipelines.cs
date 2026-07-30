using Microsoft.EntityFrameworkCore;
using Multideck.Persistence.Entities;

namespace Multideck.Persistence;

public partial class MultideckContext
{
    public DbSet<CrmPipeline> CrmPipelines => Set<CrmPipeline>();
    public DbSet<CrmPipelineStage> CrmPipelineStages => Set<CrmPipelineStage>();
    public DbSet<CrmLeadFieldSetting> CrmLeadFieldSettings => Set<CrmLeadFieldSetting>();

    private static void ConfigureCrmPipelines(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CrmPipeline>(entity =>
        {
            entity.HasKey(value => value.CrmPipelineId);
            entity.ToTable("CRM_Pipelines");
            entity.HasIndex(value => new { value.CompanyId, value.CrmPipelineSortOrder });

            entity.Property(value => value.CrmPipelineId).HasColumnName("CRMPipeline_ID").HasDefaultValueSql("gen_random_uuid()");
            entity.Property(value => value.CompanyId).HasColumnName("Company_ID");
            entity.Property(value => value.CrmPipelineName).HasColumnName("CRMPipeline_Name");
            entity.Property(value => value.CrmPipelineOwner).HasColumnName("CRMPipeline_Owner");
            entity.Property(value => value.CrmPipelineAutomation).HasColumnName("CRMPipeline_Automation");
            entity.Property(value => value.CrmPipelineSortOrder).HasColumnName("CRMPipeline_SortOrder").HasDefaultValue(0);
            entity.Property(value => value.CrmPipelineCreatedAt).HasColumnName("Created_At").HasDefaultValueSql("now()");
            entity.Property(value => value.CrmPipelineUpdatedAt).HasColumnName("Updated_At").HasDefaultValueSql("now()");
            entity.Property(value => value.CrmPipelineCreatedByUserId).HasColumnName("Created_By_User_ID");
            entity.Property(value => value.CrmPipelineUpdatedByUserId).HasColumnName("Updated_By_User_ID");
            entity.Property(value => value.CrmPipelineIsDeleted).HasColumnName("Is_Deleted").HasDefaultValue(false);
        });

        modelBuilder.Entity<CrmPipelineStage>(entity =>
        {
            entity.HasKey(value => value.CrmPipelineStageId);
            entity.ToTable("CRM_PipelineStages");
            entity.HasIndex(value => new { value.CrmPipelineId, value.CrmPipelineStageSortOrder });

            entity.Property(value => value.CrmPipelineStageId).HasColumnName("CRMPipelineStage_ID").HasDefaultValueSql("gen_random_uuid()");
            entity.Property(value => value.CompanyId).HasColumnName("Company_ID");
            entity.Property(value => value.CrmPipelineId).HasColumnName("CRMPipeline_ID");
            entity.Property(value => value.CrmPipelineStageName).HasColumnName("CRMPipelineStage_Name");
            entity.Property(value => value.CrmPipelineStageTone).HasColumnName("CRMPipelineStage_Tone").HasDefaultValue("neutral");
            entity.Property(value => value.CrmPipelineStageEntryRule).HasColumnName("CRMPipelineStage_EntryRule");
            entity.Property(value => value.CrmPipelineStageProbabilityPct).HasColumnName("CRMPipelineStage_ProbabilityPct").HasPrecision(5, 2).HasDefaultValue(0m);
            entity.Property(value => value.CrmPipelineStageSortOrder).HasColumnName("CRMPipelineStage_SortOrder").HasDefaultValue(0);
            entity.Property(value => value.CrmPipelineStageIsDefaultEntry).HasColumnName("CRMPipelineStage_IsDefaultEntry").HasDefaultValue(false);
            entity.Property(value => value.CrmPipelineStageIsConversion).HasColumnName("CRMPipelineStage_IsConversion").HasDefaultValue(false);
            entity.Property(value => value.CrmPipelineStageCreatedAt).HasColumnName("Created_At").HasDefaultValueSql("now()");
            entity.Property(value => value.CrmPipelineStageUpdatedAt).HasColumnName("Updated_At").HasDefaultValueSql("now()");
            entity.Property(value => value.CrmPipelineStageIsDeleted).HasColumnName("Is_Deleted").HasDefaultValue(false);

            entity.HasOne(value => value.CrmPipeline)
                .WithMany(value => value.CrmPipelineStages)
                .HasForeignKey(value => value.CrmPipelineId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CrmOpportunity>(entity =>
        {
            entity.Property(value => value.CrmopptyPipelineId)
                .HasColumnName("CRMOppty_PipelineID");
            entity.Property(value => value.CrmopptyPipelineStageId)
                .HasColumnName("CRMOppty_PipelineStageID");
            entity.HasIndex(value => new { value.CrmopptyPipelineId, value.CrmopptyPipelineStageId });

            entity.HasOne(value => value.CrmopptyPipeline)
                .WithMany(value => value.CrmOpportunities)
                .HasForeignKey(value => value.CrmopptyPipelineId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(value => value.CrmopptyPipelineStage)
                .WithMany(value => value.CrmOpportunities)
                .HasForeignKey(value => value.CrmopptyPipelineStageId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CrmLeadFieldSetting>(entity =>
        {
            entity.HasKey(value => value.CrmLeadFieldId);
            entity.ToTable("CRM_LeadFieldSettings");
            entity.HasIndex(value => new { value.CompanyId, value.CrmLeadFieldSortOrder });

            entity.Property(value => value.CrmLeadFieldId).HasColumnName("CRMLeadField_ID").HasDefaultValueSql("gen_random_uuid()");
            entity.Property(value => value.CompanyId).HasColumnName("Company_ID");
            entity.Property(value => value.CrmLeadFieldLabel).HasColumnName("CRMLeadField_Label");
            entity.Property(value => value.CrmLeadFieldTypeCode).HasColumnName("CRMLeadField_TypeCode").HasDefaultValue("Dropdown");
            entity.Property(value => value.CrmLeadFieldOptionsJson).HasColumnName("CRMLeadField_OptionsJSON").HasColumnType("jsonb").HasDefaultValueSql("'[]'::jsonb");
            entity.Property(value => value.CrmLeadFieldActiveOptionsJson).HasColumnName("CRMLeadField_ActiveOptionsJSON").HasColumnType("jsonb").HasDefaultValueSql("'[]'::jsonb");
            entity.Property(value => value.CrmLeadFieldSortOrder).HasColumnName("CRMLeadField_SortOrder").HasDefaultValue(0);
            entity.Property(value => value.CrmLeadFieldCreatedAt).HasColumnName("Created_At").HasDefaultValueSql("now()");
            entity.Property(value => value.CrmLeadFieldUpdatedAt).HasColumnName("Updated_At").HasDefaultValueSql("now()");
            entity.Property(value => value.CrmLeadFieldUpdatedByUserId).HasColumnName("Updated_By_User_ID");
            entity.Property(value => value.CrmLeadFieldIsDeleted).HasColumnName("Is_Deleted").HasDefaultValue(false);
        });
    }
}
