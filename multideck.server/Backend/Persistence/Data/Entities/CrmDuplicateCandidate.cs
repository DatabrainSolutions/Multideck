using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDuplicateCandidate
{
    public Guid CrmdupeId { get; set; }

    public string CrmdupeSourceTable { get; set; } = null!;

    public Guid CrmdupeSourceId { get; set; }

    public Guid? CrmdupeCandidateOrgId { get; set; }

    public Guid? CrmdupeCandidateContactId { get; set; }

    public decimal CrmdupeMatchScore { get; set; }

    public string? CrmdupeMatchReason { get; set; }

    public string CrmdupeStatus { get; set; } = null!;

    public DateTime? CrmdupeReviewedAt { get; set; }

    public Guid? CrmdupeReviewedBy { get; set; }

    public Guid? CrmdupeSourceAiTaskRunId { get; set; }

    public DateTime CrmdupeCreatedAt { get; set; }

    public virtual OrgContact? CrmdupeCandidateContact { get; set; }

    public virtual OrgMaster? CrmdupeCandidateOrg { get; set; }

    public virtual CmpUser? CrmdupeReviewedByNavigation { get; set; }

    public virtual AiTaskRun? CrmdupeSourceAiTaskRun { get; set; }
}
