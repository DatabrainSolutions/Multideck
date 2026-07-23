using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunityQuoteLink
{
    public Guid CrmopptyQuoteId { get; set; }

    public Guid CrmopptyQuoteOpportunityId { get; set; }

    public Guid CrmopptyQuoteCusQuoteHeaderId { get; set; }

    public Guid? CrmopptyQuoteCusQuoteRevId { get; set; }

    public Guid? CrmopptyQuoteCostOptId { get; set; }

    public Guid? CrmopptyQuoteRevenueOptId { get; set; }

    public Guid? CrmopptyQuoteCostRevenueLinkId { get; set; }

    public bool CrmopptyQuoteIsPrimary { get; set; }

    public bool CrmopptyQuoteIsSelectedForJob { get; set; }

    public DateTime CrmopptyQuoteLinkedAt { get; set; }

    public Guid? CrmopptyQuoteLinkedBy { get; set; }

    public string? CrmopptyQuoteNotes { get; set; }

    public virtual ICollection<CrmOpportunityJobLink> CrmOpportunityJobLinks { get; set; } = new List<CrmOpportunityJobLink>();

    public virtual CusQuoteCostOption? CrmopptyQuoteCostOpt { get; set; }

    public virtual CusQuoteCostRevenueLink? CrmopptyQuoteCostRevenueLink { get; set; }

    public virtual CusQuoteHeader CrmopptyQuoteCusQuoteHeader { get; set; } = null!;

    public virtual CusQuoteRevision? CrmopptyQuoteCusQuoteRev { get; set; }

    public virtual CmpUser? CrmopptyQuoteLinkedByNavigation { get; set; }

    public virtual CrmOpportunity CrmopptyQuoteOpportunity { get; set; } = null!;

    public virtual CusQuoteRevenueOption? CrmopptyQuoteRevenueOpt { get; set; }
}
