using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAitrainingRunStatus
{
    public string AitrsCode { get; set; } = null!;

    public string AitrsName { get; set; } = null!;

    public bool AitrsIsFinal { get; set; }

    public int AitrsSortOrder { get; set; }

    public bool AitrsIsActive { get; set; }

    public DateTime AitrsCreatedAt { get; set; }

    public virtual ICollection<AiModelTrainingRun> AiModelTrainingRuns { get; set; } = new List<AiModelTrainingRun>();
}
