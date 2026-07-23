using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteCostRevenueLink
{
    public Guid CqcrlId { get; set; }

    public Guid CqcrlCusQuoteRevId { get; set; }

    public Guid CqcrlCostOptId { get; set; }

    public Guid CqcrlRevenueOptId { get; set; }

    public string CqcrlStatusCode { get; set; } = null!;

    public bool CqcrlIsPreferred { get; set; }

    public bool CqcrlIsAccepted { get; set; }

    public int CqcrlSortOrder { get; set; }

    public string? CqcrlNotes { get; set; }

    public DateTime CqcrlCreatedAt { get; set; }

    public Guid? CqcrlCreatedBy { get; set; }

    public DateTime CqcrlUpdatedAt { get; set; }

    public Guid? CqcrlUpdatedBy { get; set; }

    public virtual CusQuoteCostOption CqcrlCostOpt { get; set; } = null!;

    public virtual CusQuoteRevision CqcrlCusQuoteRev { get; set; } = null!;

    public virtual CusQuoteRevenueOption CqcrlRevenueOpt { get; set; } = null!;

    public virtual SysCusQuoteOptionStatus CqcrlStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<CrmOpportunityQuoteLink> CrmOpportunityQuoteLinks { get; set; } = new List<CrmOpportunityQuoteLink>();

    public virtual CusQuoteCostOption CusQuoteCostOption { get; set; } = null!;

    public virtual CusQuoteRevenueOption CusQuoteRevenueOption { get; set; } = null!;

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();
}
