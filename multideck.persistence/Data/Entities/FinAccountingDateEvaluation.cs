using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAccountingDateEvaluation
{
    public Guid FinacctDateEvalId { get; set; }

    public string FinacctDateEvalSourceTable { get; set; } = null!;

    public Guid FinacctDateEvalSourceId { get; set; }

    public Guid? FinacctDateEvalJobId { get; set; }

    public Guid? FinacctDateEvalChargeInId { get; set; }

    public Guid? FinacctDateEvalChargeOutId { get; set; }

    public Guid? FinacctDateEvalDocumentId { get; set; }

    public Guid? FinacctDateEvalRuleId { get; set; }

    public string FinacctDateEvalBasisCode { get; set; } = null!;

    public DateOnly? FinacctDateEvalSourceEventDate { get; set; }

    public DateOnly FinacctDateEvalCalculatedAccountingDate { get; set; }

    public DateOnly FinacctDateEvalFinalAccountingDate { get; set; }

    public bool FinacctDateEvalWasOverridden { get; set; }

    public Guid? FinacctDateEvalPeriodId { get; set; }

    public string? FinacctDateEvalExplanation { get; set; }

    public DateTime FinacctDateEvalEvaluatedAt { get; set; }

    public virtual ICollection<FinAccountingDateOverride> FinAccountingDateOverrides { get; set; } = new List<FinAccountingDateOverride>();

    public virtual SysFinanceAccountingDateBasis FinacctDateEvalBasisCodeNavigation { get; set; } = null!;

    public virtual JobCostingChargesIn? FinacctDateEvalChargeIn { get; set; }

    public virtual JobCostingChargesOut? FinacctDateEvalChargeOut { get; set; }

    public virtual FinDocument? FinacctDateEvalDocument { get; set; }

    public virtual JobHeader? FinacctDateEvalJob { get; set; }

    public virtual FinPeriod? FinacctDateEvalPeriod { get; set; }

    public virtual FinAccountingDateRule? FinacctDateEvalRule { get; set; }
}
