using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageLink
{
    public Guid CommMessageLinkId { get; set; }

    public Guid CommMessageLinkMessageId { get; set; }

    public string CommMessageLinkLinkTypeCode { get; set; } = null!;

    public string CommMessageLinkTargetTable { get; set; } = null!;

    public Guid CommMessageLinkTargetId { get; set; }

    public string? CommMessageLinkTargetDisplaySnapshot { get; set; }

    public string? CommMessageLinkRole { get; set; }

    public DateTime CommMessageLinkCreatedAt { get; set; }

    public Guid? CommMessageLinkCreatedBy { get; set; }

    public virtual CmpUser? CommMessageLinkCreatedByNavigation { get; set; }

    public virtual SysCommLinkType CommMessageLinkLinkTypeCodeNavigation { get; set; } = null!;

    public virtual CommMessage CommMessageLinkMessage { get; set; } = null!;
}
