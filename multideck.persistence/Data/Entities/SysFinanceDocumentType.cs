using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceDocumentType
{
    public string FindtCode { get; set; } = null!;

    public string FindtName { get; set; } = null!;

    public string? FindtDescription { get; set; }

    public string? FindtLedgerTypeCode { get; set; }

    public bool FindtIsCredit { get; set; }

    public int FindtSortOrder { get; set; }

    public bool FindtIsActive { get; set; }

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinNumberSequence> FinNumberSequences { get; set; } = new List<FinNumberSequence>();
}
