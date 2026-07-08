using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditHold
{
    public Guid FinholdId { get; set; }

    public Guid FinholdCustomerOrgId { get; set; }

    public Guid? FinholdJobId { get; set; }

    public Guid? FinholdDocumentId { get; set; }

    public string FinholdHoldTypeCode { get; set; } = null!;

    public string FinholdStatusCode { get; set; } = null!;

    public string FinholdReason { get; set; } = null!;

    public DateTime FinholdPlacedAt { get; set; }

    public Guid? FinholdPlacedBy { get; set; }

    public DateTime? FinholdReleasedAt { get; set; }

    public Guid? FinholdReleasedBy { get; set; }

    public Guid? FinholdWorkflowTaskId { get; set; }

    public Guid? FinholdAiinsightId { get; set; }

    public virtual FinAiinsight? FinholdAiinsight { get; set; }

    public virtual OrgMaster FinholdCustomerOrg { get; set; } = null!;

    public virtual FinDocument? FinholdDocument { get; set; }

    public virtual JobHeader? FinholdJob { get; set; }

    public virtual CmpUser? FinholdPlacedByNavigation { get; set; }

    public virtual CmpUser? FinholdReleasedByNavigation { get; set; }

    public virtual WorkflowTask? FinholdWorkflowTask { get; set; }
}
