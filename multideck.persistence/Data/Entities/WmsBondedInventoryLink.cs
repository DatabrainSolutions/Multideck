using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedInventoryLink
{
    public Guid WmsbondInvLinkId { get; set; }

    public Guid WmsbondInvLinkEntryId { get; set; }

    public Guid WmsbondInvLinkEntryLineId { get; set; }

    public Guid WmsbondInvLinkBalanceId { get; set; }

    public Guid? WmsbondInvLinkLotId { get; set; }

    public Guid? WmsbondInvLinkHuId { get; set; }

    public decimal WmsbondInvLinkLinkedQuantity { get; set; }

    public decimal WmsbondInvLinkRemainingQuantity { get; set; }

    public string WmsbondInvLinkUomcode { get; set; } = null!;

    public DateTime WmsbondInvLinkCreatedAt { get; set; }

    public virtual WmsInventoryBalance WmsbondInvLinkBalance { get; set; } = null!;

    public virtual WmsBondedEntry WmsbondInvLinkEntry { get; set; } = null!;

    public virtual WmsBondedEntryLine WmsbondInvLinkEntryLine { get; set; } = null!;

    public virtual WmsHandlingUnit? WmsbondInvLinkHu { get; set; }

    public virtual WmsInventoryLot? WmsbondInvLinkLot { get; set; }
}
