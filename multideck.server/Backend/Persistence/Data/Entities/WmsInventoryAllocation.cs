using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryAllocation
{
    public Guid WmsallocationId { get; set; }

    public Guid? WmsallocationReservationId { get; set; }

    public Guid WmsallocationOrderLineId { get; set; }

    public Guid WmsallocationBalanceId { get; set; }

    public Guid WmsallocationItemId { get; set; }

    public decimal WmsallocationQuantity { get; set; }

    public string WmsallocationUomcode { get; set; } = null!;

    public string WmsallocationStatusCode { get; set; } = null!;

    public DateTime WmsallocationAllocatedAt { get; set; }

    public DateTime? WmsallocationPickedAt { get; set; }

    public DateTime? WmsallocationReleasedAt { get; set; }

    public Guid? WmsallocationCreatedBy { get; set; }

    public virtual WmsInventoryBalance WmsallocationBalance { get; set; } = null!;

    public virtual CmpUser? WmsallocationCreatedByNavigation { get; set; }

    public virtual WmsItem WmsallocationItem { get; set; } = null!;

    public virtual WmsOrderLine WmsallocationOrderLine { get; set; } = null!;

    public virtual WmsInventoryReservation? WmsallocationReservation { get; set; }
}
