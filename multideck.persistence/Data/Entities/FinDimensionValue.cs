using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDimensionValue
{
    public Guid FindimId { get; set; }

    public string FindimTypeCode { get; set; } = null!;

    public string FindimCode { get; set; } = null!;

    public string FindimName { get; set; } = null!;

    public string? FindimSourceTable { get; set; }

    public Guid? FindimSourceId { get; set; }

    public bool FindimIsActive { get; set; }

    public virtual ICollection<FinDocumentLine> FinDocumentLineFindocLineDimension1s { get; set; } = new List<FinDocumentLine>();

    public virtual ICollection<FinDocumentLine> FinDocumentLineFindocLineDimension2s { get; set; } = new List<FinDocumentLine>();

    public virtual ICollection<FinPostingLine> FinPostingLineFinpostLineDimension1s { get; set; } = new List<FinPostingLine>();

    public virtual ICollection<FinPostingLine> FinPostingLineFinpostLineDimension2s { get; set; } = new List<FinPostingLine>();
}
