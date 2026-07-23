using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsRecordLink
{
    public Guid WmsrecordLinkId { get; set; }

    public string WmsrecordLinkWmsrecordTypeCode { get; set; } = null!;

    public Guid WmsrecordLinkWmsrecordId { get; set; }

    public string WmsrecordLinkTargetRecordTypeCode { get; set; } = null!;

    public Guid WmsrecordLinkTargetRecordId { get; set; }

    public string WmsrecordLinkLinkRoleCode { get; set; } = null!;

    public bool WmsrecordLinkIsPrimary { get; set; }

    public DateTime WmsrecordLinkCreatedAt { get; set; }

    public Guid? WmsrecordLinkCreatedBy { get; set; }

    public virtual CmpUser? WmsrecordLinkCreatedByNavigation { get; set; }
}
