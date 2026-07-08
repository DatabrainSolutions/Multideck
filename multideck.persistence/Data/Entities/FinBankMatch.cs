using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinBankMatch
{
    public Guid FinbankMatchId { get; set; }

    public Guid FinbankMatchStatementLineId { get; set; }

    public Guid? FinbankMatchCashId { get; set; }

    public string FinbankMatchMatchTypeCode { get; set; } = null!;

    public decimal? FinbankMatchConfidenceScore { get; set; }

    public DateTime FinbankMatchMatchedAt { get; set; }

    public Guid? FinbankMatchMatchedBy { get; set; }

    public string? FinbankMatchNotes { get; set; }

    public virtual FinCashTransaction? FinbankMatchCash { get; set; }

    public virtual CmpUser? FinbankMatchMatchedByNavigation { get; set; }

    public virtual FinStatementLine FinbankMatchStatementLine { get; set; } = null!;
}
