using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPaymentRun
{
    public Guid FinpayRunId { get; set; }

    public string? FinpayRunNumber { get; set; }

    public string FinpayRunStatusCode { get; set; } = null!;

    public Guid? FinpayRunBankAccountId { get; set; }

    public DateOnly FinpayRunPaymentDate { get; set; }

    public string FinpayRunCurrencyCodeSnapshot { get; set; } = null!;

    public decimal FinpayRunTotalAmount { get; set; }

    public decimal FinpayRunLocalTotalAmount { get; set; }

    public DateTime? FinpayRunApprovedAt { get; set; }

    public Guid? FinpayRunApprovedBy { get; set; }

    public DateTime FinpayRunCreatedAt { get; set; }

    public Guid? FinpayRunCreatedBy { get; set; }

    public virtual ICollection<FinPaymentRunItem> FinPaymentRunItems { get; set; } = new List<FinPaymentRunItem>();

    public virtual CmpUser? FinpayRunApprovedByNavigation { get; set; }

    public virtual FinBankAccount? FinpayRunBankAccount { get; set; }

    public virtual CmpUser? FinpayRunCreatedByNavigation { get; set; }
}
