using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsinventoryStatus
{
    public string WmsinventoryStatusCode { get; set; } = null!;

    public string WmsinventoryStatusName { get; set; } = null!;

    public string? WmsinventoryStatusDescription { get; set; }

    public bool WmsinventoryStatusIsAvailableCandidate { get; set; }

    public bool WmsinventoryStatusIsActive { get; set; }

    public int WmsinventoryStatusSortOrder { get; set; }

    public virtual ICollection<WmsHandlingUnitContent> WmsHandlingUnitContents { get; set; } = new List<WmsHandlingUnitContent>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventorySerial> WmsInventorySerials { get; set; } = new List<WmsInventorySerial>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsOrderLine> WmsOrderLines { get; set; } = new List<WmsOrderLine>();

    public virtual ICollection<WmsStorageRule> WmsStorageRules { get; set; } = new List<WmsStorageRule>();
}
