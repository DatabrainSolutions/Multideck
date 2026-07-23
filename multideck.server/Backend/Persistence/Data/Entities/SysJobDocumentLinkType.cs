using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobDocumentLinkType
{
    public string JdltCode { get; set; } = null!;

    public string JdltName { get; set; } = null!;

    public string? JdltDescription { get; set; }

    public int JdltSortOrder { get; set; }

    public bool JdltIsActive { get; set; }

    public DateTime JdltCreatedAt { get; set; }

    public virtual ICollection<JobDocumentLink> JobDocumentLinks { get; set; } = new List<JobDocumentLink>();
}
