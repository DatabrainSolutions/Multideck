using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxInboundReviewItem
{
    public Guid MdxreviewId { get; set; }

    public Guid MdxreviewSharedJobId { get; set; }

    public Guid? MdxreviewEventId { get; set; }

    public string MdxreviewDataScopeCode { get; set; } = null!;

    public string MdxreviewStatusCode { get; set; } = null!;

    public string MdxreviewTitle { get; set; } = null!;

    public string? MdxreviewDescription { get; set; }

    public string? MdxreviewTargetTable { get; set; }

    public Guid? MdxreviewTargetId { get; set; }

    public string MdxreviewProposedValueJson { get; set; } = null!;

    public string MdxreviewCurrentValueJson { get; set; } = null!;

    public Guid? MdxreviewWorkflowTaskId { get; set; }

    public Guid? MdxreviewAssignedUserId { get; set; }

    public DateTime? MdxreviewReviewedAt { get; set; }

    public Guid? MdxreviewReviewedBy { get; set; }

    public string? MdxreviewReviewNotes { get; set; }

    public DateTime MdxreviewCreatedAt { get; set; }

    public virtual CmpUser? MdxreviewAssignedUser { get; set; }

    public virtual SysMdxdataScope MdxreviewDataScopeCodeNavigation { get; set; } = null!;

    public virtual MdxDataChangeEvent? MdxreviewEvent { get; set; }

    public virtual CmpUser? MdxreviewReviewedByNavigation { get; set; }

    public virtual MdxSharedJob MdxreviewSharedJob { get; set; } = null!;

    public virtual SysMdxreviewStatus MdxreviewStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? MdxreviewWorkflowTask { get; set; }
}
