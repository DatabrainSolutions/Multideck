using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsSubmissionStatus
{
    public string CssCode { get; set; } = null!;

    public string CssName { get; set; } = null!;

    public string? CssDescription { get; set; }

    public bool CssIsFinal { get; set; }

    public int CssSortOrder { get; set; }

    public bool CssIsActive { get; set; }

    public DateTime CssCreatedAt { get; set; }

    public virtual ICollection<IcusSubmission> IcusSubmissions { get; set; } = new List<IcusSubmission>();
}
