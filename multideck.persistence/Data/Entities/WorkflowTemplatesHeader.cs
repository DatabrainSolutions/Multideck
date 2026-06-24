using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTemplatesHeader
{
    public Guid WorkflowTemplateId { get; set; }

    public string? WorkflowTemplateModule { get; set; }

    public string? WorkflowTemplateDescription { get; set; }
}
