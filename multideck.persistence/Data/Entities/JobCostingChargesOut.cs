using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCostingChargesOut
{
    public Guid JcoutId { get; set; }

    public Guid JobId { get; set; }

    public Guid? JcoutTo { get; set; }

    public Guid? JcoutChargeCode { get; set; }

    public string? JcoutDescription { get; set; }

    public string? JcoutInternalNotes { get; set; }

    public string? JcoutExternalNotes { get; set; }

    public int? JcoutToCurr { get; set; }

    public decimal? JcoutToRoe { get; set; }

    public decimal? JcoutExpectedNetCostCurr { get; set; }

    public decimal? JcoutExpectedTaxAmountCurr { get; set; }

    public string? JcoutExpectedTaxCode { get; set; }

    public decimal? JcoutExpectedNetCostLocal { get; set; }

    public decimal? JcoutExpectedTaxAmountLocal { get; set; }

    public decimal? JcoutActualRoe { get; set; }

    public decimal? JcoutActualNetCostCurr { get; set; }

    public decimal? JcoutActualTaxAmountCurr { get; set; }

    public string? JcoutActualTaxCode { get; set; }

    public decimal? JcoutActualNetCostLocal { get; set; }

    public decimal? JcoutActualTaxAmountLocal { get; set; }

    public bool JcoutInvoiced { get; set; }

    public Guid? JcoutInvoice { get; set; }

    public int JcoutPaidStatus { get; set; }

    public bool? JcoutShowCurrency { get; set; }

    public bool? JcoutShowLocal { get; set; }

    public byte[] JcoutTs { get; set; } = null!;

    public Guid? JcoutSourceQuoteRevId { get; set; }

    public Guid? JcoutSourceQuoteCostRevenueLinkId { get; set; }

    public Guid? JcoutSourceQuoteRevenueOptId { get; set; }

    public Guid? JcoutSourceQuoteChargeOutId { get; set; }

    public Guid? JcoutSourceRateRequestId { get; set; }

    public Guid? JcoutSourceRateResultId { get; set; }

    public Guid? JcoutSourceRateResultLineId { get; set; }

    public Guid? JcoutSourceRateLineId { get; set; }

    public virtual ICollection<AccReceiptsLine> AccReceiptsLines { get; set; } = new List<AccReceiptsLine>();

    public virtual ICollection<FinAccountingDateEvaluation> FinAccountingDateEvaluations { get; set; } = new List<FinAccountingDateEvaluation>();

    public virtual ICollection<FinChargeRoeapplication> FinChargeRoeapplications { get; set; } = new List<FinChargeRoeapplication>();

    public virtual ICollection<FinCreditNoteRequestLine> FinCreditNoteRequestLines { get; set; } = new List<FinCreditNoteRequestLine>();

    public virtual ICollection<FinCutoffRunItem> FinCutoffRunItems { get; set; } = new List<FinCutoffRunItem>();

    public virtual ICollection<FinDocumentLineJobLink> FinDocumentLineJobLinks { get; set; } = new List<FinDocumentLineJobLink>();

    public virtual ICollection<FinJobChargeState> FinJobChargeStates { get; set; } = new List<FinJobChargeState>();

    public virtual ICollection<FinJobFinanceLock> FinJobFinanceLocks { get; set; } = new List<FinJobFinanceLock>();

    public virtual ICollection<FinPeriodAdjustment> FinPeriodAdjustments { get; set; } = new List<FinPeriodAdjustment>();

    public virtual ICollection<FinVarianceItem> FinVarianceItems { get; set; } = new List<FinVarianceItem>();

    public virtual ICollection<FinWipitem> FinWipitems { get; set; } = new List<FinWipitem>();

    public virtual CusQuoteChargesOut? JcoutSourceQuoteChargeOut { get; set; }

    public virtual CusQuoteCostRevenueLink? JcoutSourceQuoteCostRevenueLink { get; set; }

    public virtual CusQuoteRevision? JcoutSourceQuoteRev { get; set; }

    public virtual CusQuoteRevenueOption? JcoutSourceQuoteRevenueOpt { get; set; }

    public virtual RateRateLine? JcoutSourceRateLine { get; set; }

    public virtual RateRateRequest? JcoutSourceRateRequest { get; set; }

    public virtual RateRateResult? JcoutSourceRateResult { get; set; }

    public virtual RateRateResultLine? JcoutSourceRateResultLine { get; set; }

    public virtual JobHeader Job { get; set; } = null!;

    public virtual ICollection<RateJobCostingLink> RateJobCostingLinks { get; set; } = new List<RateJobCostingLink>();
}
