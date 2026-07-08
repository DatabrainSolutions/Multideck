using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryLot
{
    public Guid WmslotId { get; set; }

    public Guid WmslotFacilityId { get; set; }

    public Guid WmslotCustomerOrgId { get; set; }

    public Guid WmslotItemId { get; set; }

    public string WmslotLotNumber { get; set; } = null!;

    public string? WmslotBatchNumber { get; set; }

    public DateOnly? WmslotManufactureDate { get; set; }

    public DateOnly? WmslotExpiryDate { get; set; }

    public string? WmslotCountryOfOriginCode { get; set; }

    public string WmslotCustomsStatusCode { get; set; } = null!;

    public Guid? WmslotBondedEntryLineId { get; set; }

    public string WmslotAttributesJson { get; set; } = null!;

    public DateTime WmslotCreatedAt { get; set; }

    public virtual ICollection<WmsBondedInventoryLink> WmsBondedInventoryLinks { get; set; } = new List<WmsBondedInventoryLink>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventorySerial> WmsInventorySerials { get; set; } = new List<WmsInventorySerial>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual OrgMaster WmslotCustomerOrg { get; set; } = null!;

    public virtual SysWmscustomsStatus WmslotCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsFacility WmslotFacility { get; set; } = null!;

    public virtual WmsItem WmslotItem { get; set; } = null!;
}
