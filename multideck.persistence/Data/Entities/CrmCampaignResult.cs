using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCampaignResult
{
    public Guid CrmcampaignResultId { get; set; }

    public Guid CrmcampaignResultCampaignId { get; set; }

    public DateOnly CrmcampaignResultResultDate { get; set; }

    public int CrmcampaignResultMembersCount { get; set; }

    public int CrmcampaignResultResponsesCount { get; set; }

    public int CrmcampaignResultLeadsCreatedCount { get; set; }

    public int CrmcampaignResultOpportunitiesCreatedCount { get; set; }

    public int CrmcampaignResultQuotesCreatedCount { get; set; }

    public int CrmcampaignResultJobsWonCount { get; set; }

    public decimal? CrmcampaignResultRevenueAmount { get; set; }

    public decimal? CrmcampaignResultMarginAmount { get; set; }

    public string? CrmcampaignResultCurrencyCode { get; set; }

    public string CrmcampaignResultMetadataJson { get; set; } = null!;

    public virtual CrmCampaign CrmcampaignResultCampaign { get; set; } = null!;
}
