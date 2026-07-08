using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAccountingDateWorklist
{
    public Guid? FinacctDateEvalId { get; set; }

    public string? FinacctDateEvalSourceTable { get; set; }

    public Guid? FinacctDateEvalSourceId { get; set; }

    public Guid? FinacctDateEvalJobId { get; set; }

    public string? FinacctDateEvalBasisCode { get; set; }

    public DateOnly? FinacctDateEvalSourceEventDate { get; set; }

    public DateOnly? FinacctDateEvalCalculatedAccountingDate { get; set; }

    public DateOnly? FinacctDateEvalFinalAccountingDate { get; set; }

    public bool? FinacctDateEvalWasOverridden { get; set; }

    public Guid? FinacctDateEvalPeriodId { get; set; }

    public bool? FinacctDateEvalMissingSourceDate { get; set; }

    public string? FinacctDateEvalExplanation { get; set; }
}
