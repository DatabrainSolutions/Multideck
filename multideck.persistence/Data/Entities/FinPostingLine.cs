using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPostingLine
{
    public Guid FinpostLineId { get; set; }

    public Guid FinpostLineBatchId { get; set; }

    public int FinpostLineLineNo { get; set; }

    public Guid? FinpostLineNominalAccountId { get; set; }

    public Guid? FinpostLineDocumentId { get; set; }

    public Guid? FinpostLineDocumentLineId { get; set; }

    public Guid? FinpostLineCashId { get; set; }

    public Guid? FinpostLineAccrualId { get; set; }

    public Guid? FinpostLineWipid { get; set; }

    public string? FinpostLineDescription { get; set; }

    public decimal FinpostLineDebitAmount { get; set; }

    public decimal FinpostLineCreditAmount { get; set; }

    public string FinpostLineCurrencyCodeSnapshot { get; set; } = null!;

    public Guid? FinpostLineDimension1Id { get; set; }

    public Guid? FinpostLineDimension2Id { get; set; }

    public virtual FinAccrual? FinpostLineAccrual { get; set; }

    public virtual FinPostingBatch FinpostLineBatch { get; set; } = null!;

    public virtual FinCashTransaction? FinpostLineCash { get; set; }

    public virtual FinDimensionValue? FinpostLineDimension1 { get; set; }

    public virtual FinDimensionValue? FinpostLineDimension2 { get; set; }

    public virtual FinDocument? FinpostLineDocument { get; set; }

    public virtual FinDocumentLine? FinpostLineDocumentLine { get; set; }

    public virtual FinNominalAccount? FinpostLineNominalAccount { get; set; }

    public virtual FinWipitem? FinpostLineWip { get; set; }
}
