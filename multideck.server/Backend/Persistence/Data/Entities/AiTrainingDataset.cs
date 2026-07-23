using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiTrainingDataset
{
    public Guid AitdId { get; set; }

    public string AitdName { get; set; } = null!;

    public string? AitdDescription { get; set; }

    public string? AitdTaskType { get; set; }

    public string? AitdDomainCode { get; set; }

    public string? AitdScopeType { get; set; }

    public string AitdVersion { get; set; } = null!;

    public string AitdStatus { get; set; } = null!;

    public DateTime AitdCreatedAt { get; set; }

    public Guid? AitdCreatedBy { get; set; }

    public virtual ICollection<AiModelTrainingRun> AiModelTrainingRuns { get; set; } = new List<AiModelTrainingRun>();

    public virtual ICollection<AiTrainingDatasetItem> AiTrainingDatasetItems { get; set; } = new List<AiTrainingDatasetItem>();

    public virtual SysAicontextDomain? AitdDomainCodeNavigation { get; set; }

    public virtual SysAicontextScopeType? AitdScopeTypeNavigation { get; set; }

    public virtual SysAitaskType? AitdTaskTypeNavigation { get; set; }
}
