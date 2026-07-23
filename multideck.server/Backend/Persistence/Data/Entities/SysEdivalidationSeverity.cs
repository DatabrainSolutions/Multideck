using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdivalidationSeverity
{
    public string EdivsCode { get; set; } = null!;

    public string EdivsName { get; set; } = null!;

    public string? EdivsDescription { get; set; }

    public bool EdivsIsBlocking { get; set; }

    public bool EdivsIsActive { get; set; }

    public int EdivsSortOrder { get; set; }

    public virtual ICollection<EdiValidationIssue> EdiValidationIssues { get; set; } = new List<EdiValidationIssue>();
}
