using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceDocumentStatus
{
    public string FindstCode { get; set; } = null!;

    public string FindstName { get; set; } = null!;

    public string? FindstDescription { get; set; }

    public bool FindstIsFinal { get; set; }

    public int FindstSortOrder { get; set; }

    public bool FindstIsActive { get; set; }

    public virtual ICollection<FinDocumentStatusHistory> FinDocumentStatusHistories { get; set; } = new List<FinDocumentStatusHistory>();

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();
}
