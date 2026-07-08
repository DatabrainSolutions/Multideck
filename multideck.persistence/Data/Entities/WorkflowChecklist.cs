using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowChecklist
{
    public Guid WorkflowChecklistId { get; set; }

    public Guid? WorkflowChecklistDefinitionVersionId { get; set; }

    public Guid? WorkflowChecklistStepId { get; set; }

    public string WorkflowChecklistCode { get; set; } = null!;

    public string WorkflowChecklistName { get; set; } = null!;

    public string? WorkflowChecklistDescription { get; set; }

    public string? WorkflowChecklistRecordTypeCode { get; set; }

    public bool WorkflowChecklistIsRequired { get; set; }

    public bool WorkflowChecklistIsActive { get; set; }

    public string WorkflowChecklistSettingsJson { get; set; } = null!;

    public DateTime WorkflowChecklistCreatedAt { get; set; }

    public virtual WorkflowDefinitionVersion? WorkflowChecklistDefinitionVersion { get; set; }

    public virtual ICollection<WorkflowChecklistItem> WorkflowChecklistItems { get; set; } = new List<WorkflowChecklistItem>();

    public virtual SysWorkflowRecordType? WorkflowChecklistRecordTypeCodeNavigation { get; set; }

    public virtual WorkflowStep? WorkflowChecklistStep { get; set; }
}
