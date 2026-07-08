using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteLostDetail
{
    public Guid CrmquoteLostId { get; set; }

    public Guid CrmquoteLostFollowupId { get; set; }

    public string CrmquoteLostLossReasonCode { get; set; } = null!;

    public Guid? CrmquoteLostCompetitorOrgId { get; set; }

    public string? CrmquoteLostCompetitorNameSnapshot { get; set; }

    public decimal? CrmquoteLostPriceGapAmount { get; set; }

    public string? CrmquoteLostPriceGapCurrencyCode { get; set; }

    public int? CrmquoteLostTransitGapDays { get; set; }

    public string? CrmquoteLostCustomerFeedback { get; set; }

    public string? CrmquoteLostImprovementNotes { get; set; }

    public bool CrmquoteLostRecordAsMarketFeedback { get; set; }

    public DateTime CrmquoteLostCreatedAt { get; set; }

    public Guid? CrmquoteLostCreatedBy { get; set; }

    public virtual OrgMaster? CrmquoteLostCompetitorOrg { get; set; }

    public virtual CmpUser? CrmquoteLostCreatedByNavigation { get; set; }

    public virtual CrmQuoteFollowup CrmquoteLostFollowup { get; set; } = null!;

    public virtual SysCrmlossReason CrmquoteLostLossReasonCodeNavigation { get; set; } = null!;
}
