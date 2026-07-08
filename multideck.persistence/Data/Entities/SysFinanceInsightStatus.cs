using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceInsightStatus
{
    public string FininsstCode { get; set; } = null!;

    public string FininsstName { get; set; } = null!;

    public string? FininsstDescription { get; set; }

    public bool FininsstIsFinal { get; set; }

    public int FininsstSortOrder { get; set; }

    public bool FininsstIsActive { get; set; }

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();
}
