using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventorySerial
{
    public Guid WmsserialId { get; set; }

    public Guid WmsserialFacilityId { get; set; }

    public Guid WmsserialItemId { get; set; }

    public Guid? WmsserialLotId { get; set; }

    public string WmsserialSerialNumber { get; set; } = null!;

    public string WmsserialInventoryStatusCode { get; set; } = null!;

    public string WmsserialCustomsStatusCode { get; set; } = null!;

    public Guid? WmsserialCurrentLocationId { get; set; }

    public Guid? WmsserialCurrentHuId { get; set; }

    public DateTime WmsserialCreatedAt { get; set; }

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual WmsHandlingUnit? WmsserialCurrentHu { get; set; }

    public virtual WmsLocation? WmsserialCurrentLocation { get; set; }

    public virtual SysWmscustomsStatus WmsserialCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsFacility WmsserialFacility { get; set; } = null!;

    public virtual SysWmsinventoryStatus WmsserialInventoryStatusCodeNavigation { get; set; } = null!;

    public virtual WmsItem WmsserialItem { get; set; } = null!;

    public virtual WmsInventoryLot? WmsserialLot { get; set; }
}
