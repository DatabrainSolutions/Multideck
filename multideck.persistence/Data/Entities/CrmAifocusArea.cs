using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAifocusArea
{
    public Guid CrmfocusId { get; set; }

    public string CrmfocusStatusCode { get; set; } = null!;

    public Guid? CrmfocusTargetUserId { get; set; }

    public Guid? CrmfocusAccountId { get; set; }

    public Guid? CrmfocusLeadId { get; set; }

    public Guid? CrmfocusOpportunityId { get; set; }

    public string CrmfocusTitle { get; set; } = null!;

    public string? CrmfocusReason { get; set; }

    public string? CrmfocusRecommendedActionCode { get; set; }

    public decimal? CrmfocusPriorityScore { get; set; }

    public string CrmfocusEvidenceJson { get; set; } = null!;

    public Guid? CrmfocusAitaskRunId { get; set; }

    public DateTime? CrmfocusDueAt { get; set; }

    public DateTime CrmfocusCreatedAt { get; set; }

    public DateTime? CrmfocusDecidedAt { get; set; }

    public Guid? CrmfocusDecidedBy { get; set; }

    public virtual CrmAccountProfile? CrmfocusAccount { get; set; }

    public virtual AiTaskRun? CrmfocusAitaskRun { get; set; }

    public virtual CmpUser? CrmfocusDecidedByNavigation { get; set; }

    public virtual CrmLead? CrmfocusLead { get; set; }

    public virtual CrmOpportunity? CrmfocusOpportunity { get; set; }

    public virtual SysCrmnextBestActionType? CrmfocusRecommendedActionCodeNavigation { get; set; }

    public virtual SysCrmfocusAreaStatus CrmfocusStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmfocusTargetUser { get; set; }
}
