using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinStatementImport
{
    public Guid FinstmtImpId { get; set; }

    public Guid? FinstmtImpBankAccountId { get; set; }

    public string FinstmtImpStatusCode { get; set; } = null!;

    public string FinstmtImpSourceTypeCode { get; set; } = null!;

    public string? FinstmtImpFileName { get; set; }

    public string? FinstmtImpFileHashSha256 { get; set; }

    public DateOnly? FinstmtImpStatementDateFrom { get; set; }

    public DateOnly? FinstmtImpStatementDateTo { get; set; }

    public int FinstmtImpRowCount { get; set; }

    public DateTime FinstmtImpImportedAt { get; set; }

    public Guid? FinstmtImpImportedBy { get; set; }

    public virtual ICollection<FinStatementLine> FinStatementLines { get; set; } = new List<FinStatementLine>();

    public virtual FinBankAccount? FinstmtImpBankAccount { get; set; }

    public virtual CmpUser? FinstmtImpImportedByNavigation { get; set; }
}
