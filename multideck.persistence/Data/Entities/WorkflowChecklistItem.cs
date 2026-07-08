using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowChecklistItem
{
    public Guid WorkflowChecklistItemId { get; set; }

    public Guid WorkflowChecklistItemChecklistId { get; set; }

    public string WorkflowChecklistItemCode { get; set; } = null!;

    public string WorkflowChecklistItemLabel { get; set; } = null!;

    public string? WorkflowChecklistItemHelpText { get; set; }

    public string WorkflowChecklistItemResponseTypeCode { get; set; } = null!;

    public int WorkflowChecklistItemOrderNo { get; set; }

    public bool WorkflowChecklistItemIsRequired { get; set; }

    public string WorkflowChecklistItemExpectedValueJson { get; set; } = null!;

    public string WorkflowChecklistItemOptionsJson { get; set; } = null!;

    public string WorkflowChecklistItemConditionJson { get; set; } = null!;

    public bool WorkflowChecklistItemIsActive { get; set; }

    public virtual WorkflowChecklist WorkflowChecklistItemChecklist { get; set; } = null!;

    public virtual SysWorkflowChecklistResponseType WorkflowChecklistItemResponseTypeCodeNavigation { get; set; } = null!;

    public virtual ICollection<WorkflowTaskChecklistResponse> WorkflowTaskChecklistResponses { get; set; } = new List<WorkflowTaskChecklistResponse>();
}
