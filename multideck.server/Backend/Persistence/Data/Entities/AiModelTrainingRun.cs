using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiModelTrainingRun
{
    public Guid AimtrId { get; set; }

    public Guid? AimtrDatasetId { get; set; }

    public Guid? AimtrBaseModelId { get; set; }

    public string AimtrStatus { get; set; } = null!;

    public string? AimtrTrainingProviderReference { get; set; }

    public string? AimtrOutputModelRef { get; set; }

    public string AimtrMetricsJson { get; set; } = null!;

    public string AimtrSettingsJson { get; set; } = null!;

    public string? AimtrErrorCode { get; set; }

    public string? AimtrErrorMessage { get; set; }

    public DateTime? AimtrStartedAt { get; set; }

    public DateTime? AimtrCompletedAt { get; set; }

    public DateTime AimtrCreatedAt { get; set; }

    public Guid? AimtrCreatedBy { get; set; }

    public virtual AiModel? AimtrBaseModel { get; set; }

    public virtual AiTrainingDataset? AimtrDataset { get; set; }

    public virtual SysAitrainingRunStatus AimtrStatusNavigation { get; set; } = null!;
}
