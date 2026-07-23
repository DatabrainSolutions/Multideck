using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAifocusAreaQueue
{
    public Guid? CrmfocusId { get; set; }

    public string? CrmfocusStatusCode { get; set; }

    public Guid? CrmfocusTargetUserId { get; set; }

    public string? CrmfocusTargetUserEmail { get; set; }

    public Guid? CrmfocusAccountId { get; set; }

    public string? CrmfocusAccountName { get; set; }

    public Guid? CrmfocusLeadId { get; set; }

    public Guid? CrmfocusOpportunityId { get; set; }

    public string? CrmfocusTitle { get; set; }

    public string? CrmfocusReason { get; set; }

    public string? CrmfocusRecommendedActionCode { get; set; }

    public decimal? CrmfocusPriorityScore { get; set; }

    public DateTime? CrmfocusDueAt { get; set; }

    public DateTime? CrmfocusCreatedAt { get; set; }
}
