using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinBankAccount
{
    public Guid FinbankId { get; set; }

    public string FinbankCode { get; set; } = null!;

    public string FinbankName { get; set; } = null!;

    public Guid? FinbankLegalEntityId { get; set; }

    public Guid? FinbankOrgOfficeId { get; set; }

    public string FinbankCurrencyCode { get; set; } = null!;

    public string? FinbankAccountNumberMasked { get; set; }

    public string? FinbankIbanmasked { get; set; }

    public string? FinbankSortCodeMasked { get; set; }

    public Guid? FinbankNominalAccountId { get; set; }

    public bool FinbankIsActive { get; set; }

    public DateTime FinbankCreatedAt { get; set; }

    public virtual ICollection<FinCashTransaction> FinCashTransactions { get; set; } = new List<FinCashTransaction>();

    public virtual ICollection<FinPaymentRun> FinPaymentRuns { get; set; } = new List<FinPaymentRun>();

    public virtual ICollection<FinStatementImport> FinStatementImports { get; set; } = new List<FinStatementImport>();

    public virtual CmpLegalEntity? FinbankLegalEntity { get; set; }

    public virtual FinNominalAccount? FinbankNominalAccount { get; set; }

    public virtual CmpOffice? FinbankOrgOffice { get; set; }
}
