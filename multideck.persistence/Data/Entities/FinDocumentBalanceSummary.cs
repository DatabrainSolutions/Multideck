using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentBalanceSummary
{
    public Guid? FindocId { get; set; }

    public string? FindocNumber { get; set; }

    public string? FindocTypeCode { get; set; }

    public string? FindocStatusCode { get; set; }

    public Guid? FindocPartyOrgId { get; set; }

    public string? FindocPartyName { get; set; }

    public DateOnly? FindocDocumentDate { get; set; }

    public DateOnly? FindocAccountingDate { get; set; }

    public DateOnly? FindocDueDate { get; set; }

    public string? FindocCurrencyCodeSnapshot { get; set; }

    public decimal? FindocGrossAmount { get; set; }

    public decimal? FindocOutstandingAmount { get; set; }

    public decimal? FindocPaidOrAllocatedAmount { get; set; }

    public bool? FindocIsOverdue { get; set; }

    public int? FindocDaysOverdue { get; set; }
}
