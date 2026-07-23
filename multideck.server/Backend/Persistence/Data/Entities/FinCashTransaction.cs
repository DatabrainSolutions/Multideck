using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCashTransaction
{
    public Guid FincashId { get; set; }

    public string FincashTypeCode { get; set; } = null!;

    public string FincashStatusCode { get; set; } = null!;

    public string? FincashNumber { get; set; }

    public Guid? FincashBankAccountId { get; set; }

    public Guid? FincashPartyOrgId { get; set; }

    public DateOnly FincashTransactionDate { get; set; }

    public DateOnly FincashAccountingDate { get; set; }

    public Guid? FincashPeriodId { get; set; }

    public string FincashCurrencyCodeSnapshot { get; set; } = null!;

    public decimal FincashExchangeRate { get; set; }

    public decimal FincashAmount { get; set; }

    public decimal FincashLocalAmount { get; set; }

    public decimal FincashUnallocatedAmount { get; set; }

    public decimal FincashLocalUnallocatedAmount { get; set; }

    public string? FincashReference { get; set; }

    public string? FincashExternalReference { get; set; }

    public string FincashPostingStatusCode { get; set; } = null!;

    public DateTime FincashCreatedAt { get; set; }

    public Guid? FincashCreatedBy { get; set; }

    public virtual ICollection<FinBankMatch> FinBankMatches { get; set; } = new List<FinBankMatch>();

    public virtual ICollection<FinCashAllocation> FinCashAllocations { get; set; } = new List<FinCashAllocation>();

    public virtual ICollection<FinPaymentRunItem> FinPaymentRunItems { get; set; } = new List<FinPaymentRunItem>();

    public virtual ICollection<FinPostingLine> FinPostingLines { get; set; } = new List<FinPostingLine>();

    public virtual ICollection<FinRevaluationItem> FinRevaluationItems { get; set; } = new List<FinRevaluationItem>();

    public virtual FinBankAccount? FincashBankAccount { get; set; }

    public virtual CmpUser? FincashCreatedByNavigation { get; set; }

    public virtual OrgMaster? FincashPartyOrg { get; set; }

    public virtual FinPeriod? FincashPeriod { get; set; }

    public virtual SysFinancePostingStatus FincashPostingStatusCodeNavigation { get; set; } = null!;

    public virtual SysFinanceCashStatus FincashStatusCodeNavigation { get; set; } = null!;

    public virtual SysFinanceCashType FincashTypeCodeNavigation { get; set; } = null!;
}
