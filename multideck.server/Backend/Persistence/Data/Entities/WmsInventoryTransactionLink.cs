using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryTransactionLink
{
    public Guid WmstransLinkId { get; set; }

    public Guid WmstransLinkTransactionId { get; set; }

    public string WmstransLinkRecordTypeCode { get; set; } = null!;

    public Guid WmstransLinkRecordId { get; set; }

    public string WmstransLinkLinkRoleCode { get; set; } = null!;

    public DateTime WmstransLinkCreatedAt { get; set; }

    public virtual WmsInventoryTransaction WmstransLinkTransaction { get; set; } = null!;
}
