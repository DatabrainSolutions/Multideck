using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiPromptTemplate
{
    public Guid AiptId { get; set; }

    public string AiptTaskType { get; set; } = null!;

    public string AiptName { get; set; } = null!;

    public string AiptVersion { get; set; } = null!;

    public string? AiptTemplateText { get; set; }

    public string AiptSettingsJson { get; set; } = null!;

    public bool AiptIsActive { get; set; }

    public DateTime AiptCreatedAt { get; set; }

    public Guid? AiptCreatedBy { get; set; }

    public virtual ICollection<AiTaskRun> AiTaskRuns { get; set; } = new List<AiTaskRun>();

    public virtual SysAitaskType AiptTaskTypeNavigation { get; set; } = null!;

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CrmAiinsightRule> CrmAiinsightRules { get; set; } = new List<CrmAiinsightRule>();
}
