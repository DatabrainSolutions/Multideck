using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobDocumentStatus
{
    public string JdsCode { get; set; } = null!;

    public string JdsName { get; set; } = null!;

    public string? JdsDescription { get; set; }

    public bool JdsIsFinal { get; set; }

    public int JdsSortOrder { get; set; }

    public bool JdsIsActive { get; set; }

    public DateTime JdsCreatedAt { get; set; }

    public virtual ICollection<JobDocument> JobDocuments { get; set; } = new List<JobDocument>();
}
