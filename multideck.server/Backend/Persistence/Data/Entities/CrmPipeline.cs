namespace Multideck.Persistence.Entities;

/// <summary>
/// A company-wide deal pipeline. One row is shared by every user in the workspace, so editing it in
/// pipeline settings changes what the whole team sees.
/// </summary>
public sealed class CrmPipeline
{
    public Guid CrmPipelineId { get; set; }
    public Guid CompanyId { get; set; }
    public string CrmPipelineName { get; set; } = null!;
    public string? CrmPipelineOwner { get; set; }
    public string? CrmPipelineAutomation { get; set; }
    public int CrmPipelineSortOrder { get; set; }
    public DateTime CrmPipelineCreatedAt { get; set; }
    public DateTime CrmPipelineUpdatedAt { get; set; }
    public Guid? CrmPipelineCreatedByUserId { get; set; }
    public Guid? CrmPipelineUpdatedByUserId { get; set; }
    public bool CrmPipelineIsDeleted { get; set; }

    public ICollection<CrmPipelineStage> CrmPipelineStages { get; set; } = new List<CrmPipelineStage>();
    public ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();
}
