using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryReservation
{
    public Guid WmsreservationId { get; set; }

    public Guid WmsreservationFacilityId { get; set; }

    public Guid WmsreservationOrderId { get; set; }

    public Guid? WmsreservationOrderLineId { get; set; }

    public Guid? WmsreservationBalanceId { get; set; }

    public Guid WmsreservationItemId { get; set; }

    public decimal WmsreservationQuantity { get; set; }

    public string WmsreservationUomcode { get; set; } = null!;

    public string WmsreservationStatusCode { get; set; } = null!;

    public DateTime WmsreservationReservedAt { get; set; }

    public DateTime? WmsreservationReleasedAt { get; set; }

    public Guid? WmsreservationCreatedBy { get; set; }

    public virtual ICollection<WmsInventoryAllocation> WmsInventoryAllocations { get; set; } = new List<WmsInventoryAllocation>();

    public virtual WmsInventoryBalance? WmsreservationBalance { get; set; }

    public virtual CmpUser? WmsreservationCreatedByNavigation { get; set; }

    public virtual WmsFacility WmsreservationFacility { get; set; } = null!;

    public virtual WmsItem WmsreservationItem { get; set; } = null!;

    public virtual WmsOrder WmsreservationOrder { get; set; } = null!;

    public virtual WmsOrderLine? WmsreservationOrderLine { get; set; }
}
