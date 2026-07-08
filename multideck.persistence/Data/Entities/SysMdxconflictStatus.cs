using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxconflictStatus
{
    public string MdxconflictStatusCode { get; set; } = null!;

    public string MdxconflictStatusName { get; set; } = null!;

    public string? MdxconflictStatusDescription { get; set; }

    public bool MdxconflictStatusIsFinal { get; set; }

    public int MdxconflictStatusSortOrder { get; set; }

    public bool MdxconflictStatusIsActive { get; set; }

    public DateTime MdxconflictStatusCreatedAt { get; set; }

    public virtual ICollection<MdxConflictCase> MdxConflictCases { get; set; } = new List<MdxConflictCase>();
}
