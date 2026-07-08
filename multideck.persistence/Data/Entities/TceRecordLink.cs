using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceRecordLink
{
    public Guid TcelinkId { get; set; }

    public string? TcelinkSourceRecordTypeCode { get; set; }

    public string TcelinkSourceTable { get; set; } = null!;

    public Guid TcelinkSourceId { get; set; }

    public string? TcelinkTargetRecordTypeCode { get; set; }

    public string TcelinkTargetTable { get; set; } = null!;

    public Guid TcelinkTargetId { get; set; }

    public Guid? TcelinkJobId { get; set; }

    public Guid? TcelinkOrgId { get; set; }

    public string TcelinkLinkTypeCode { get; set; } = null!;

    public string? TcelinkLinkReason { get; set; }

    public bool TcelinkIsPrimary { get; set; }

    public DateTime TcelinkCreatedAt { get; set; }

    public Guid? TcelinkCreatedBy { get; set; }

    public virtual CmpUser? TcelinkCreatedByNavigation { get; set; }

    public virtual JobHeader? TcelinkJob { get; set; }

    public virtual OrgMaster? TcelinkOrg { get; set; }

    public virtual SysWorkflowRecordType? TcelinkSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysWorkflowRecordType? TcelinkTargetRecordTypeCodeNavigation { get; set; }
}
