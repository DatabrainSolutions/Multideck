using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmscustomsStatus
{
    public string WmscustomsStatusCode { get; set; } = null!;

    public string WmscustomsStatusName { get; set; } = null!;

    public string? WmscustomsStatusDescription { get; set; }

    public bool WmscustomsStatusIsDutySuspended { get; set; }

    public bool WmscustomsStatusIsCustomsControlled { get; set; }

    public bool WmscustomsStatusIsActive { get; set; }

    public int WmscustomsStatusSortOrder { get; set; }

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsFacility> WmsFacilities { get; set; } = new List<WmsFacility>();

    public virtual ICollection<WmsHandlingUnitContent> WmsHandlingUnitContents { get; set; } = new List<WmsHandlingUnitContent>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInboundAdviceLine> WmsInboundAdviceLines { get; set; } = new List<WmsInboundAdviceLine>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventoryLot> WmsInventoryLots { get; set; } = new List<WmsInventoryLot>();

    public virtual ICollection<WmsInventorySerial> WmsInventorySerials { get; set; } = new List<WmsInventorySerial>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsOrderLine> WmsOrderLines { get; set; } = new List<WmsOrderLine>();

    public virtual ICollection<WmsReceiptLine> WmsReceiptLines { get; set; } = new List<WmsReceiptLine>();

    public virtual ICollection<WmsStorageRule> WmsStorageRules { get; set; } = new List<WmsStorageRule>();
}
