using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDebtChasingQueue
{
    public Guid? FindebtCaseId { get; set; }

    public Guid? FindebtCaseCustomerOrgId { get; set; }

    public string? FindebtCaseCustomerName { get; set; }

    public Guid? FindebtCaseDocumentId { get; set; }

    public string? FindebtCaseStatusCode { get; set; }

    public string? FindebtCaseSeverityCode { get; set; }

    public decimal? FindebtCaseOverdueAmount { get; set; }

    public DateOnly? FindebtCaseOldestDueDate { get; set; }

    public DateTime? FindebtCaseNextActionDueAt { get; set; }

    public bool? FincreditProfileOnStop { get; set; }

    public string? FincreditProfileFlexibilityLevelCode { get; set; }

    public DateTime? FindebtCaseLastActionAt { get; set; }
}
