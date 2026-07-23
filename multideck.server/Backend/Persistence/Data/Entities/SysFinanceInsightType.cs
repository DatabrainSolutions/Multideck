using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceInsightType
{
    public string FininstCode { get; set; } = null!;

    public string FininstName { get; set; } = null!;

    public string? FininstDescription { get; set; }

    public int FininstSortOrder { get; set; }

    public bool FininstIsActive { get; set; }

    public virtual ICollection<FinAiinsightRule> FinAiinsightRules { get; set; } = new List<FinAiinsightRule>();

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();
}
