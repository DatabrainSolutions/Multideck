using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsScanEvent
{
    public Guid WmsscanEventId { get; set; }

    public Guid? WmsscanEventSessionId { get; set; }

    public Guid WmsscanEventFacilityId { get; set; }

    public Guid? WmsscanEventTaskId { get; set; }

    public Guid? WmsscanEventOrderId { get; set; }

    public string WmsscanEventEventTypeCode { get; set; } = null!;

    public string WmsscanEventBarcodeValue { get; set; } = null!;

    public string? WmsscanEventExpectedValue { get; set; }

    public bool WmsscanEventIsMatch { get; set; }

    public Guid? WmsscanEventLocationId { get; set; }

    public Guid? WmsscanEventItemId { get; set; }

    public Guid? WmsscanEventHuId { get; set; }

    public decimal? WmsscanEventQuantity { get; set; }

    public string? WmsscanEventUomcode { get; set; }

    public DateTime WmsscanEventScannedAt { get; set; }

    public Guid? WmsscanEventScannedBy { get; set; }

    public string WmsscanEventMetadataJson { get; set; } = null!;

    public virtual SysWmsscanEventType WmsscanEventEventTypeCodeNavigation { get; set; } = null!;

    public virtual WmsFacility WmsscanEventFacility { get; set; } = null!;

    public virtual WmsHandlingUnit? WmsscanEventHu { get; set; }

    public virtual WmsItem? WmsscanEventItem { get; set; }

    public virtual WmsLocation? WmsscanEventLocation { get; set; }

    public virtual WmsOrder? WmsscanEventOrder { get; set; }

    public virtual CmpUser? WmsscanEventScannedByNavigation { get; set; }

    public virtual WmsScanSession? WmsscanEventSession { get; set; }

    public virtual WmsTask? WmsscanEventTask { get; set; }
}
