using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPeriod
{
    public Guid FinperiodId { get; set; }

    public Guid? FinperiodLegalEntityId { get; set; }

    public Guid? FinperiodOrgOfficeId { get; set; }

    public string FinperiodCode { get; set; } = null!;

    public string FinperiodName { get; set; } = null!;

    public DateOnly FinperiodStartDate { get; set; }

    public DateOnly FinperiodEndDate { get; set; }

    public string FinperiodStatusCode { get; set; } = null!;

    public string FinperiodBaseCurrencyCode { get; set; } = null!;

    public DateTime? FinperiodSoftClosedAt { get; set; }

    public Guid? FinperiodSoftClosedBy { get; set; }

    public DateTime? FinperiodLockedAt { get; set; }

    public Guid? FinperiodLockedBy { get; set; }

    public DateTime FinperiodCreatedAt { get; set; }

    public Guid? FinperiodCreatedBy { get; set; }

    public virtual ICollection<FinAccountingDateEvaluation> FinAccountingDateEvaluations { get; set; } = new List<FinAccountingDateEvaluation>();

    public virtual ICollection<FinAccountingEvent> FinAccountingEvents { get; set; } = new List<FinAccountingEvent>();

    public virtual ICollection<FinAccrual> FinAccrualFinaccrualPeriods { get; set; } = new List<FinAccrual>();

    public virtual ICollection<FinAccrual> FinAccrualFinaccrualReversalPeriods { get; set; } = new List<FinAccrual>();

    public virtual ICollection<FinCashTransaction> FinCashTransactions { get; set; } = new List<FinCashTransaction>();

    public virtual ICollection<FinCommissionRun> FinCommissionRuns { get; set; } = new List<FinCommissionRun>();

    public virtual ICollection<FinCutoffRun> FinCutoffRuns { get; set; } = new List<FinCutoffRun>();

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinFxgainLossEvent> FinFxgainLossEvents { get; set; } = new List<FinFxgainLossEvent>();

    public virtual ICollection<FinJobProfitSnapshot> FinJobProfitSnapshots { get; set; } = new List<FinJobProfitSnapshot>();

    public virtual ICollection<FinPeriodAdjustment> FinPeriodAdjustmentFinperiodAdjOriginalPeriods { get; set; } = new List<FinPeriodAdjustment>();

    public virtual ICollection<FinPeriodAdjustment> FinPeriodAdjustmentFinperiodAdjPostingPeriods { get; set; } = new List<FinPeriodAdjustment>();

    public virtual ICollection<FinPeriodCloseRun> FinPeriodCloseRuns { get; set; } = new List<FinPeriodCloseRun>();

    public virtual ICollection<FinPeriodLock> FinPeriodLocks { get; set; } = new List<FinPeriodLock>();

    public virtual ICollection<FinPostingBatch> FinPostingBatches { get; set; } = new List<FinPostingBatch>();

    public virtual ICollection<FinProfitShareRun> FinProfitShareRuns { get; set; } = new List<FinProfitShareRun>();

    public virtual ICollection<FinRevaluationRun> FinRevaluationRuns { get; set; } = new List<FinRevaluationRun>();

    public virtual ICollection<FinWipitem> FinWipitemFinwipPeriods { get; set; } = new List<FinWipitem>();

    public virtual ICollection<FinWipitem> FinWipitemFinwipReversalPeriods { get; set; } = new List<FinWipitem>();

    public virtual CmpUser? FinperiodCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? FinperiodLegalEntity { get; set; }

    public virtual CmpUser? FinperiodLockedByNavigation { get; set; }

    public virtual CmpOffice? FinperiodOrgOffice { get; set; }

    public virtual CmpUser? FinperiodSoftClosedByNavigation { get; set; }

    public virtual SysFinancePeriodStatus FinperiodStatusCodeNavigation { get; set; } = null!;
}
