using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCustomerPaymentBehaviour
{
    public Guid FinpayBehId { get; set; }

    public Guid FinpayBehCustomerOrgId { get; set; }

    public Guid? FinpayBehLegalEntityId { get; set; }

    public Guid? FinpayBehOrgOfficeId { get; set; }

    public DateOnly FinpayBehAsOfDate { get; set; }

    public int FinpayBehInvoiceCount { get; set; }

    public int FinpayBehOpenInvoiceCount { get; set; }

    public int FinpayBehOverdueInvoiceCount { get; set; }

    public decimal? FinpayBehAverageDaysToPay { get; set; }

    public decimal? FinpayBehAverageDaysLate { get; set; }

    public int? FinpayBehWorstDaysLate { get; set; }

    public int FinpayBehBrokenPromiseCount { get; set; }

    public decimal FinpayBehDisputeRatePercent { get; set; }

    public decimal FinpayBehTermsAbuseScore { get; set; }

    public string FinpayBehFlexibilityLevelCode { get; set; } = null!;

    public int FinpayBehRecommendedChaseDaysBeforeDue { get; set; }

    public string? FinpayBehRecommendedActionCode { get; set; }

    public string FinpayBehEvidenceJson { get; set; } = null!;

    public DateTime FinpayBehCalculatedAt { get; set; }

    public Guid? FinpayBehCalculatedByAiinsightId { get; set; }

    public virtual FinAiinsight? FinpayBehCalculatedByAiinsight { get; set; }

    public virtual OrgMaster FinpayBehCustomerOrg { get; set; } = null!;

    public virtual SysFinanceCustomerFlexibilityLevel FinpayBehFlexibilityLevelCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? FinpayBehLegalEntity { get; set; }

    public virtual CmpOffice? FinpayBehOrgOffice { get; set; }

    public virtual SysFinanceCreditControlAction? FinpayBehRecommendedActionCodeNavigation { get; set; }
}
