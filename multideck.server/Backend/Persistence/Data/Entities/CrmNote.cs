using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmNote
{
    public Guid CrmnoteId { get; set; }

    public Guid? CrmnoteAccountId { get; set; }

    public Guid? CrmnoteLeadId { get; set; }

    public Guid? CrmnoteOpportunityId { get; set; }

    public Guid? CrmnoteQuoteFollowupId { get; set; }

    public Guid? CrmnoteJobId { get; set; }

    public string? CrmnoteSourceTable { get; set; }

    public Guid? CrmnoteSourceId { get; set; }

    public string? CrmnoteTitle { get; set; }

    public string CrmnoteBody { get; set; } = null!;

    public string CrmnoteSensitivityCode { get; set; } = null!;

    public bool CrmnoteIsCustomerVisible { get; set; }

    public bool CrmnoteIsTrainingAllowed { get; set; }

    public DateTime CrmnoteCreatedAt { get; set; }

    public Guid? CrmnoteCreatedBy { get; set; }

    public DateTime CrmnoteUpdatedAt { get; set; }

    public Guid? CrmnoteUpdatedBy { get; set; }

    public bool CrmnoteIsDeleted { get; set; }

    public virtual ICollection<CrmCallActionCandidate> CrmCallActionCandidates { get; set; } = new List<CrmCallActionCandidate>();

    public virtual ICollection<CrmCallSummaryNote> CrmCallSummaryNotes { get; set; } = new List<CrmCallSummaryNote>();

    public virtual CrmAccountProfile? CrmnoteAccount { get; set; }

    public virtual CmpUser? CrmnoteCreatedByNavigation { get; set; }

    public virtual JobHeader? CrmnoteJob { get; set; }

    public virtual CrmLead? CrmnoteLead { get; set; }

    public virtual CrmOpportunity? CrmnoteOpportunity { get; set; }

    public virtual CrmQuoteFollowup? CrmnoteQuoteFollowup { get; set; }

    public virtual CmpUser? CrmnoteUpdatedByNavigation { get; set; }
}
