using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCustomerPaymentRiskSummary
{
    public Guid? FinpayBehCustomerOrgId { get; set; }

    public string? FinpayBehCustomerName { get; set; }

    public DateOnly? FinpayBehAsOfDate { get; set; }

    public int? FinpayBehInvoiceCount { get; set; }

    public int? FinpayBehOpenInvoiceCount { get; set; }

    public int? FinpayBehOverdueInvoiceCount { get; set; }

    public decimal? FinpayBehAverageDaysToPay { get; set; }

    public decimal? FinpayBehAverageDaysLate { get; set; }

    public decimal? FinpayBehTermsAbuseScore { get; set; }

    public string? FinpayBehFlexibilityLevelCode { get; set; }

    public int? FinpayBehRecommendedChaseDaysBeforeDue { get; set; }

    public string? FinpayBehRecommendedActionCode { get; set; }

    public decimal? FincreditProfileCreditLimitAmount { get; set; }

    public bool? FincreditProfileOnStop { get; set; }
}
