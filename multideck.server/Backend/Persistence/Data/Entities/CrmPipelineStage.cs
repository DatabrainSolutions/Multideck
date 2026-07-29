namespace Multideck.Persistence.Entities;

/// <summary>
/// A stage within a company pipeline. Sort order is the saved column order operators drag into place,
/// and the default-entry and conversion flags survive renames that a name reference would not.
/// </summary>
public sealed class CrmPipelineStage
{
    public Guid CrmPipelineStageId { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CrmPipelineId { get; set; }
    public string CrmPipelineStageName { get; set; } = null!;
    public string CrmPipelineStageTone { get; set; } = null!;
    public string? CrmPipelineStageEntryRule { get; set; }
    public decimal CrmPipelineStageProbabilityPct { get; set; }
    public int CrmPipelineStageSortOrder { get; set; }
    public bool CrmPipelineStageIsDefaultEntry { get; set; }
    public bool CrmPipelineStageIsConversion { get; set; }
    public DateTime CrmPipelineStageCreatedAt { get; set; }
    public DateTime CrmPipelineStageUpdatedAt { get; set; }
    public bool CrmPipelineStageIsDeleted { get; set; }

    public CrmPipeline CrmPipeline { get; set; } = null!;
    public ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();
}
