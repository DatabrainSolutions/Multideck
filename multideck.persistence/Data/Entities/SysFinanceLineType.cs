using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceLineType
{
    public string FinlineCode { get; set; } = null!;

    public string FinlineName { get; set; } = null!;

    public string? FinlineDescription { get; set; }

    public int FinlineSortOrder { get; set; }

    public bool FinlineIsActive { get; set; }

    public virtual ICollection<FinChargeAccountingRule> FinChargeAccountingRules { get; set; } = new List<FinChargeAccountingRule>();

    public virtual ICollection<FinDocumentLine> FinDocumentLines { get; set; } = new List<FinDocumentLine>();
}
