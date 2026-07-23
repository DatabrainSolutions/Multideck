using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAitaskType
{
    public string AittCode { get; set; } = null!;

    public string AittName { get; set; } = null!;

    public string? AittDescription { get; set; }

    public int AittSortOrder { get; set; }

    public bool AittIsActive { get; set; }

    public DateTime AittCreatedAt { get; set; }

    public virtual ICollection<AiPromptTemplate> AiPromptTemplates { get; set; } = new List<AiPromptTemplate>();

    public virtual ICollection<AiTaskRun> AiTaskRuns { get; set; } = new List<AiTaskRun>();

    public virtual ICollection<AiTrainingDataset> AiTrainingDatasets { get; set; } = new List<AiTrainingDataset>();

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();
}
