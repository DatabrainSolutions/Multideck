using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAitrainingItemStatus
{
    public string AitisCode { get; set; } = null!;

    public string AitisName { get; set; } = null!;

    public bool AitisIsFinal { get; set; }

    public int AitisSortOrder { get; set; }

    public bool AitisIsActive { get; set; }

    public DateTime AitisCreatedAt { get; set; }

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();
}
