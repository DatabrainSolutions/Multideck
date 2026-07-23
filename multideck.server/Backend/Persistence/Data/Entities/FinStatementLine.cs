using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinStatementLine
{
    public Guid FinstmtLineId { get; set; }

    public Guid FinstmtLineImportId { get; set; }

    public int FinstmtLineLineNo { get; set; }

    public DateOnly FinstmtLineTransactionDate { get; set; }

    public string? FinstmtLineReference { get; set; }

    public string? FinstmtLineDescription { get; set; }

    public string FinstmtLineCurrencyCodeSnapshot { get; set; } = null!;

    public decimal FinstmtLineAmount { get; set; }

    public decimal? FinstmtLineBalanceAfter { get; set; }

    public string FinstmtLineMatchStatusCode { get; set; } = null!;

    public string FinstmtLineRawJson { get; set; } = null!;

    public virtual ICollection<FinBankMatch> FinBankMatches { get; set; } = new List<FinBankMatch>();

    public virtual FinStatementImport FinstmtLineImport { get; set; } = null!;
}
