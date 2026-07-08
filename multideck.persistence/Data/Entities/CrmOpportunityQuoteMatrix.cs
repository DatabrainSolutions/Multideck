using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunityQuoteMatrix
{
    public Guid? CrmopptyQuoteId { get; set; }

    public Guid? CrmopptyQuoteOpportunityId { get; set; }

    public string? CrmopptyName { get; set; }

    public Guid? CrmopptyQuoteCusQuoteHeaderId { get; set; }

    public int? CusQuoteHeaderNumber { get; set; }

    public Guid? CrmopptyQuoteCusQuoteRevId { get; set; }

    public int? CusQuoteRevNumber { get; set; }

    public string? CusQuoteRevStatusCode { get; set; }

    public string? CusQuoteRevModeCode { get; set; }

    public string? CusQuoteRevShipmentTypeCode { get; set; }

    public Guid? CrmopptyQuoteCostOptId { get; set; }

    public string? CusQuoteCostOptDescription { get; set; }

    public Guid? CusQuoteCostOptCarrierId { get; set; }

    public string? CusQuoteCostOptCarrierNameSnapshot { get; set; }

    public int? CusQuoteCostOptTransitDays { get; set; }

    public Guid? CrmopptyQuoteRevenueOptId { get; set; }

    public string? CusQuoteRevenueOptDescription { get; set; }

    public string? CusQuoteRevenueOptCustomerLabel { get; set; }

    public Guid? CrmopptyQuoteCostRevenueLinkId { get; set; }

    public bool? CrmopptyQuoteIsPrimary { get; set; }

    public bool? CrmopptyQuoteIsSelectedForJob { get; set; }

    public DateTime? CrmopptyQuoteLinkedAt { get; set; }
}
