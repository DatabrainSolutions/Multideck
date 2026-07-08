using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmdecisionStatus
{
    public string CrmdecisionStatusCode { get; set; } = null!;

    public string CrmdecisionStatusName { get; set; } = null!;

    public string? CrmdecisionStatusDescription { get; set; }

    public bool CrmdecisionStatusIsFinal { get; set; }

    public bool? CrmdecisionStatusIsPositive { get; set; }

    public bool CrmdecisionStatusIsActive { get; set; }

    public int CrmdecisionStatusSortOrder { get; set; }

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();

    public virtual ICollection<CrmQuickTaskDecision> CrmQuickTaskDecisions { get; set; } = new List<CrmQuickTaskDecision>();

    public virtual ICollection<CrmQuickTaskOption> CrmQuickTaskOptions { get; set; } = new List<CrmQuickTaskOption>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();
}
