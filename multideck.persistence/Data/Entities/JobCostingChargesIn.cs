using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCostingChargesIn
{
    public Guid JcinId { get; set; }

    public Guid JobId { get; set; }

    public Guid? JcinFrom { get; set; }

    public Guid? JcinChargeCode { get; set; }

    public string? JcinDescription { get; set; }

    public string? JcinInternalNotes { get; set; }

    public string? JcinExternalNotes { get; set; }

    public int? JcinFromCurr { get; set; }

    public decimal? JcinFromRoe { get; set; }

    public decimal? JcinExpectedNetCostCurr { get; set; }

    public decimal? JcinExpectedTaxAmountCurr { get; set; }

    public string? JcinExpectedTaxCode { get; set; }

    public decimal? JcinExpectedNetCostLocal { get; set; }

    public decimal? JcinExpectedTaxAmountLocal { get; set; }

    public decimal? JcinActualRoe { get; set; }

    public decimal? JcinActualNetCostCurr { get; set; }

    public decimal? JcinActualTaxAmountCurr { get; set; }

    public string? JcinActualTaxCode { get; set; }

    public decimal? JcinActualNetCostLocal { get; set; }

    public decimal? JcinActualTaxAmountLocal { get; set; }

    public int JcinMatchStatus { get; set; }

    public bool? JcinShowCurrency { get; set; }

    public bool? JcinShowLocal { get; set; }

    public byte[] JcinTs { get; set; } = null!;

    public Guid? JcinSourceQuoteRevId { get; set; }

    public Guid? JcinSourceQuoteCostRevenueLinkId { get; set; }

    public Guid? JcinSourceQuoteCostOptId { get; set; }

    public Guid? JcinSourceQuoteChargeInId { get; set; }

    public Guid? JcinSourceRateRequestId { get; set; }

    public Guid? JcinSourceRateResultId { get; set; }

    public Guid? JcinSourceRateResultLineId { get; set; }

    public Guid? JcinSourceRateLineId { get; set; }

    public virtual ICollection<AccPaymentsLine> AccPaymentsLines { get; set; } = new List<AccPaymentsLine>();

    public virtual ICollection<FinAccountingDateEvaluation> FinAccountingDateEvaluations { get; set; } = new List<FinAccountingDateEvaluation>();

    public virtual ICollection<FinAccrual> FinAccruals { get; set; } = new List<FinAccrual>();

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual ICollection<FinCreditNoteRequestLine> FinCreditNoteRequestLines { get; set; } = new List<FinCreditNoteRequestLine>();

    public virtual ICollection<FinCutoffRunItem> FinCutoffRunItems { get; set; } = new List<FinCutoffRunItem>();

    public virtual ICollection<FinDocumentLineJobLink> FinDocumentLineJobLinks { get; set; } = new List<FinDocumentLineJobLink>();

    public virtual ICollection<FinJobChargeState> FinJobChargeStates { get; set; } = new List<FinJobChargeState>();

    public virtual ICollection<FinJobFinanceLock> FinJobFinanceLocks { get; set; } = new List<FinJobFinanceLock>();

    public virtual ICollection<FinPeriodAdjustment> FinPeriodAdjustments { get; set; } = new List<FinPeriodAdjustment>();

    public virtual ICollection<FinVarianceItem> FinVarianceItems { get; set; } = new List<FinVarianceItem>();

    public virtual CusQuoteChargesIn? JcinSourceQuoteChargeIn { get; set; }

    public virtual CusQuoteCostOption? JcinSourceQuoteCostOpt { get; set; }

    public virtual CusQuoteCostRevenueLink? JcinSourceQuoteCostRevenueLink { get; set; }

    public virtual CusQuoteRevision? JcinSourceQuoteRev { get; set; }

    public virtual RateRateLine? JcinSourceRateLine { get; set; }

    public virtual RateRateRequest? JcinSourceRateRequest { get; set; }

    public virtual RateRateResult? JcinSourceRateResult { get; set; }

    public virtual RateRateResultLine? JcinSourceRateResultLine { get; set; }

    public virtual JobHeader Job { get; set; } = null!;

    public virtual ICollection<RateJobCostingLink> RateJobCostingLinks { get; set; } = new List<RateJobCostingLink>();
}
