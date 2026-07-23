using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAicontextItemStatus
{
    public string AicisCode { get; set; } = null!;

    public string AicisName { get; set; } = null!;

    public bool AicisIsFinal { get; set; }

    public int AicisSortOrder { get; set; }

    public bool AicisIsActive { get; set; }

    public DateTime AicisCreatedAt { get; set; }

    public virtual ICollection<AiContextItem> AiContextItems { get; set; } = new List<AiContextItem>();

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();
}
