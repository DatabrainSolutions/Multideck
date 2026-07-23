using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiMessageLink
{
    public Guid EdilinkId { get; set; }

    public Guid EdilinkMessageId { get; set; }

    public string EdilinkLinkType { get; set; } = null!;

    public string? EdilinkRecordTypeCode { get; set; }

    public string EdilinkTargetTable { get; set; } = null!;

    public Guid? EdilinkTargetId { get; set; }

    public string? EdilinkExternalReference { get; set; }

    public DateTime EdilinkCreatedAt { get; set; }

    public Guid? EdilinkCreatedBy { get; set; }

    public virtual CmpUser? EdilinkCreatedByNavigation { get; set; }

    public virtual EdiMessage EdilinkMessage { get; set; } = null!;

    public virtual SysWorkflowRecordType? EdilinkRecordTypeCodeNavigation { get; set; }
}
