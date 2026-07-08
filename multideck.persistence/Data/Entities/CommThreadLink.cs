using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommThreadLink
{
    public Guid CommThreadLinkId { get; set; }

    public Guid CommThreadLinkThreadId { get; set; }

    public string CommThreadLinkLinkTypeCode { get; set; } = null!;

    public string CommThreadLinkTargetTable { get; set; } = null!;

    public Guid CommThreadLinkTargetId { get; set; }

    public string? CommThreadLinkTargetDisplaySnapshot { get; set; }

    public string? CommThreadLinkRole { get; set; }

    public bool CommThreadLinkIsPrimary { get; set; }

    public DateTime CommThreadLinkCreatedAt { get; set; }

    public Guid? CommThreadLinkCreatedBy { get; set; }

    public virtual CmpUser? CommThreadLinkCreatedByNavigation { get; set; }

    public virtual SysCommLinkType CommThreadLinkLinkTypeCodeNavigation { get; set; } = null!;

    public virtual CommThread CommThreadLinkThread { get; set; } = null!;
}
