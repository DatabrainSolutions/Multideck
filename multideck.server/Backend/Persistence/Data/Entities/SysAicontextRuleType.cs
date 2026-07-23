using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAicontextRuleType
{
    public string AicrtCode { get; set; } = null!;

    public string AicrtName { get; set; } = null!;

    public string? AicrtDescription { get; set; }

    public int AicrtSortOrder { get; set; }

    public bool AicrtIsActive { get; set; }

    public DateTime AicrtCreatedAt { get; set; }

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();
}
