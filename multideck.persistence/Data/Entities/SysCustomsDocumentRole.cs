using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsDocumentRole
{
    public string CdrCode { get; set; } = null!;

    public string CdrName { get; set; } = null!;

    public string? CdrDescription { get; set; }

    public int CdrSortOrder { get; set; }

    public bool CdrIsActive { get; set; }

    public DateTime CdrCreatedAt { get; set; }

    public virtual ICollection<CdsDocument> CdsDocuments { get; set; } = new List<CdsDocument>();

    public virtual ICollection<CustomsDocument> CustomsDocuments { get; set; } = new List<CustomsDocument>();

    public virtual ICollection<T1Document> T1Documents { get; set; } = new List<T1Document>();
}
