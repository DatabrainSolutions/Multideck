using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmPipelineSummary
{
    public Guid? CrmopptyId { get; set; }

    public string? CrmopptyName { get; set; }

    public Guid? CrmopptyOrgId { get; set; }

    public string? CrmopptyOrgName { get; set; }

    public Guid? CrmopptyAccountId { get; set; }

    public Guid? CrmopptyOwnerUserId { get; set; }

    public string? CrmopptyOwnerEmail { get; set; }

    public Guid? CrmopptyOrgOfficeId { get; set; }

    public string? CrmopptyOfficeName { get; set; }

    public string? CrmopptyTypeCode { get; set; }

    public string? CrmopptyStageCode { get; set; }

    public string? CrmopptyStageName { get; set; }

    public string? CrmopptyStatusCode { get; set; }

    public string? CrmopptyForecastCategoryCode { get; set; }

    public string? CrmopptyModeCode { get; set; }

    public string? CrmopptyTradeLane { get; set; }

    public DateOnly? CrmopptyExpectedCloseDate { get; set; }

    public decimal? CrmopptyProbabilityPct { get; set; }

    public decimal? CrmopptyExpectedValueAmount { get; set; }

    public decimal? CrmopptyExpectedMarginAmount { get; set; }

    public string? CrmopptyCurrencyCode { get; set; }

    public decimal? CrmopptyWeightedValueAmount { get; set; }

    public DateTime? CrmopptyNextActionDueAt { get; set; }

    public long? CrmopptyLinkedQuoteCount { get; set; }

    public long? CrmopptyLinkedJobCount { get; set; }
}
