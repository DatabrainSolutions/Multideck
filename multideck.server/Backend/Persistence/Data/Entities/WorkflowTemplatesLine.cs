using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTemplatesLine
{
    public Guid WorkflowTemplateLineId { get; set; }

    public Guid WorkflowTemplateId { get; set; }

    public string WorkflowTemplateLineTaskDescription { get; set; } = null!;

    public int? WorkflowTemplateLineBaseType { get; set; }

    public int? WorkflowTemplateLineDueDateVariance { get; set; }

    public bool WorkflowTemplateLineDueDateBefore { get; set; }

    public int? WorkflowTemplateLineDueDateVarianceUnit { get; set; }

    public int? WorkflowTemplateLineDefaultStatus { get; set; }

    public int? WorkflowTemplateLineOrder { get; set; }

    public int? WorkflowTemplateLineUserAssignment { get; set; }

    public string? WorkflowTemplateLineUserId { get; set; }

    public string? WorkflowTemplateLineOriginUnlocode { get; set; }

    public string? WorkflowTemplateLineDestinationUnlocode { get; set; }

    public Guid? WorkflowTemplateLineCustomer { get; set; }

    public Guid? WorkflowTemplateLineCarrier { get; set; }

    public Guid? WorkflowTemplateLineConsignee { get; set; }

    public Guid? WorkflowTemplateLineCustomsBroker { get; set; }

    public Guid? WorkflowTemplateLineShipper { get; set; }

    public Guid? WorkflowTemplateLineSledgerAcc { get; set; }

    public Guid? WorkflowTemplateLinePledgerAcc { get; set; }

    public Guid WorkflowTemplateLineCreatedBy { get; set; }

    public DateTime WorkflowTemplateLineCreatedDate { get; set; }
}
