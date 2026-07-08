using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiModel
{
    public Guid AimId { get; set; }

    public Guid? AimProviderId { get; set; }

    public string AimModelName { get; set; } = null!;

    public string? AimModelVersion { get; set; }

    public string? AimCapability { get; set; }

    public int? AimContextWindowTokens { get; set; }

    public string AimSettingsJson { get; set; } = null!;

    public bool AimIsActive { get; set; }

    public DateTime AimCreatedAt { get; set; }

    public virtual ICollection<AiContextChunk> AiContextChunks { get; set; } = new List<AiContextChunk>();

    public virtual ICollection<AiContextStore> AiContextStores { get; set; } = new List<AiContextStore>();

    public virtual ICollection<AiMessage> AiMessages { get; set; } = new List<AiMessage>();

    public virtual ICollection<AiModelTrainingRun> AiModelTrainingRuns { get; set; } = new List<AiModelTrainingRun>();

    public virtual ICollection<AiTaskRun> AiTaskRuns { get; set; } = new List<AiTaskRun>();

    public virtual AiProvider? AimProvider { get; set; }

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();
}
