using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunityJobLink
{
    public Guid CrmopptyJobId { get; set; }

    public Guid CrmopptyJobOpportunityId { get; set; }

    public Guid CrmopptyJobJobId { get; set; }

    public Guid? CrmopptyJobSourceQuoteLinkId { get; set; }

    public DateTime CrmopptyJobLinkedAt { get; set; }

    public Guid? CrmopptyJobLinkedBy { get; set; }

    public virtual JobHeader CrmopptyJobJob { get; set; } = null!;

    public virtual CmpUser? CrmopptyJobLinkedByNavigation { get; set; }

    public virtual CrmOpportunity CrmopptyJobOpportunity { get; set; } = null!;

    public virtual CrmOpportunityQuoteLink? CrmopptyJobSourceQuoteLink { get; set; }
}
