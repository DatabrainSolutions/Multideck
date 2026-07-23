using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAitaskStatus
{
    public string AitsCode { get; set; } = null!;

    public string AitsName { get; set; } = null!;

    public bool AitsIsFinal { get; set; }

    public int AitsSortOrder { get; set; }

    public bool AitsIsActive { get; set; }

    public DateTime AitsCreatedAt { get; set; }

    public virtual ICollection<AiTaskRun> AiTaskRuns { get; set; } = new List<AiTaskRun>();
}
